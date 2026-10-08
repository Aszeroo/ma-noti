import { resolveSendMode } from '@/lib/config/send-mode';
import { loadTeamConfig } from '@/lib/config/team-config';
import { verifyCronSecret } from '@/lib/cron/verify-secret';
import { runDaily, type DailyTabInput } from '@/lib/domain/pipeline';
import type { Delivery, DeliveryChannelType, NotifyLogRow, TeamConfig, TodayDate } from '@/lib/domain/types';
import { createNotifiers } from '@/lib/notifiers';
import { createSheetsReader } from '@/lib/sheets/reader';
import { getSupabaseAdminClient } from '@/lib/supabase/server';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** เวลาทางธุรกิจของระบบ — "ว้นน้ี" ตองนับตาม Asia/Bangkok (cron ยิง 08:00 เวลาทนี่ ี่) */
const BUSINESS_TIMEZONE = 'Asia/Bangkok';

/** วันในโซนเวลาท่ีกำหนด จาก Date ของ shell (pipeline ไม่เรียกเวลาเอง — ส่งเข้ามาแบบ TodayDate) */
export function todayInTimezone(date: Date, timeZone = BUSINESS_TIMEZONE): TodayDate {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .map(part => [part.type, part.value]),
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/**
 * ส่วนเสียบ (dependency injection) ของ endpoint — เทสส่งของปลอมเข้ามาแทนได้
 * ไม่ต้องแตะ เน็ตเวิร์กจริง (sheets + Supabase) เหมือน pattern ของ tests/cron-handler.test.ts
 */
export interface DailyCheckDeps {
  /** อ่านทุกแท็บของชีตจริง → input ของท่ อรัน (default: Service Account จาก env) */
  readTabs: () => Promise<DailyTabInput[]>;
  /** โหลดคอนฟิก 4 ตาราง → TeamConfig (default: admin client; ว่าง = TeamConfig ว่างที่ valid) */
  loadConfig: () => Promise<TeamConfig>;
  /** เขียน logRows ลง notify_log ครั้ งเดียวแบบ batch (default: admin client) */
  insertLogRows: (rows: NotifyLogRow[]) => Promise<void>;
  /**
   * ส่ง 1 delivery ผ่านผู้ส่งจริง (Brevo / Discord / Telegram) — throw = ล้มเหลว
   * default: ผู้ส่งตามช่องทางของ delivery (env อ่านตอนยิงจริง)
   */
  sendDelivery: (delivery: Delivery) => Promise<void>;
  /** นาฬิกาของรอบรัน — ควบคุมได้ในเทส */
  now: () => Date;
}

/** ผู้ส่งจริง 3 ช่องทาง — env ถูกอ่านข้างใน send() ทุกครั้ง (จิง stubEnv ในเทสได้) */
const defaultNotifiers = createNotifiers();

const defaultDeps: DailyCheckDeps = {
  readTabs: () => createSheetsReader()(),
  loadConfig: () => loadTeamConfig(),
  insertLogRows: async rows => {
    const { error } = await getSupabaseAdminClient().from('notify_log').insert(rows);
    if (error) throw new Error(`notify_log insert failed: ${error.message}`);
  },
  sendDelivery: delivery => defaultNotifiers[delivery.channel].send(delivery, delivery.message),
  now: () => new Date(),
};

// ---- ขั้่นส่งจริง (ticket #10): ยิงต่อรายการ + เขียนสถานะลง details ----

type SendOutcome = { ok: true } | { ok: false; error: string };

function shortError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.trim() === '' ? 'unknown send error' : text.trim().slice(0, 300);
}

/**
 * ส่งทุก delivery แบบต่อรายการ — ช่องทางหนึ่่งล้มจดไว้แค่ send_status=failed ของรายการนั้
 * ช่องทางอื่่นยัิงส่งต่อ (AC: "ช่องทางใดล้้มเหลว รอบรัันไมพ่ััง")
 */
async function sendAllDeliveries(
  deliveries: Delivery[],
  send: (delivery: Delivery) => Promise<void>,
): Promise<SendOutcome[]> {
  const outcomes: SendOutcome[] = [];
  for (const delivery of deliveries) {
    try {
      await send(delivery);
      outcomes.push({ ok: true });
    } catch (error) {
      outcomes.push({ ok: false, error: shortError(error) });
    }
  }
  return outcomes;
}

/** คียจ์ับคู้ delivery ↔ แถว log ต่อบุคคล (details.party มาจาก pipeline เดียวกัน) */
function deliveryRowKey(personId: string, channel: DeliveryChannelType, party: unknown): string {
  return `${personId}|${channel}|${String(party ?? '')}`;
}

/**
 * เติม send_status / send_error ลง details ของแถว log ต่อบุคคล+ช่องทาง
 * และนัับรวม (sent/failed) ไว้ในแถ้วระดบั รอบรัันให้หน้าง้า history แสดงผล
 * คู้ delivery ↔ แถว ตาม (person_id, channel, party) ตามลำดับที่ pipeline ส่งออกมา
 */
function attachSendStatus(
  logRows: NotifyLogRow[],
  deliveries: Delivery[],
  outcomes: SendOutcome[],
): { sent: number; failed: number } {
  const queue = new Map<string, NotifyLogRow[]>();
  for (const row of logRows) {
    if (row.person_id === null || row.channel === null) continue; // ข้ามแถ้วระดบั รอบรััน
    const key = deliveryRowKey(row.person_id, row.channel, row.details.party);
    queue.set(key, [...(queue.get(key) ?? []), row]);
  }

  let sent = 0;
  let failed = 0;
  deliveries.forEach((delivery, index) => {
    const key = deliveryRowKey(delivery.personId, delivery.channel, delivery.party);
    const paired = queue.get(key) ?? [];
    const [row, ...rest] = paired;
    if (!row) return; // ไม่มีแถ้วคู้กกัน (ไม่คาวรเกิด) — ข้ามแบบไมพ่ััง
    queue.set(key, rest);
    const outcome = outcomes[index];
    if (outcome?.ok) {
      sent += 1;
      row.details = { ...row.details, send_status: 'sent' };
    } else {
      failed += 1;
      row.details = {
        ...row.details,
        send_status: 'failed',
        send_error: outcome?.error ?? 'unknown send error',
      };
    }
  });

  const runRow = logRows.find(row => row.person_id === null);
  if (runRow) runRow.details = { ...runRow.details, sent, failed };
  return { sent, failed };
}

/**
 * หัวใจของ endpoint /api/cron/daily-check — เขียนแบบ Web API ล้วน (ไม่ผูกกับ next/server)
 * เพื่อให้เทสได้โดยตรงด้าน node
 *
 * ลำดับการตัดสินใจ (เปลือกบาง — ท่อ/domain ไม่รู้เรื่อง HTTP/env — ตาม PRD: endpoint = เปลือกบาง):
 *   1) ตรวจ CRON_SECRET: ผิด/ไม่มี → 401, เซิร์ฟเวอร์ไม่มี secret ตั้งแต่ต้น → 503
 *   2) เลือก mode จาก env DRY_RUN (ค่าเริ่มต้น = dry_run เสมอ) — เปลี่ยนแค่ marker ใน log
 *   3) อ่านชีตจริงทุกแท็บ (Service Account) → โหลดคอนฟิก 4 ตาราง → เรียก runDaily
 *   4) mode = send → ยิงทุก delivery แบบตอรายการ (ชองทางใดลมเหลว รอบรันไมพัง)
 *      แลวเติม send_status/send_error ลง details ของ log row กอน insert
 *   5) เขียน notify_log ตอบุคคล/ชองทาง + แถวระดับรอบรัน (ทุกรอบตองมีหลักฐาน)
 *
 * หมายเหต ticket #10: DRY_RUN เปดอยู = ไมยิงอะไรเลย (Notifier ไมถูกเรยกสักครัง)
 * เมอปด DRY_RUN แลวจึงมีการติดตอภายนอก 3 ทาง: Brevo SMTP, Discord webhook, Telegram Bot API
 * นอกเหนือนอกจาก Google Sheets (อาน) และ Supabase (เขียน log)
 */
export async function handleDailyCheck(
  request: Request,
  overrides: Partial<DailyCheckDeps> = {},
): Promise<Response> {
  // ขาม key ที caller สงค่า undefined มาอย่างชดเจน — spread ตรง ๆ จะกลบทับค่า default
  const provided = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  );
  const deps: DailyCheckDeps = { ...defaultDeps, ...provided };

  const secretCheck = verifyCronSecret(request.headers, process.env.CRON_SECRET);
  if (!secretCheck.ok) {
    if (secretCheck.reason === 'not_configured') {
      return json(503, { ok: false, error: 'CRON_SECRET not configured on server' });
    }
    return json(401, { ok: false, error: 'unauthorized' });
  }

  const mode = resolveSendMode(process.env.DRY_RUN);
  const now = deps.now();
  const runAt = now.toISOString();

  let tabs: DailyTabInput[];
  try {
    tabs = await deps.readTabs();
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : 'sheet read failed',
    });
  }

  let config: TeamConfig;
  try {
    config = await deps.loadConfig();
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : 'config load failed',
    });
  }

  const plan = runDaily({ tabs, config, today: todayInTimezone(now), runAt, mode });

  // ขั้้นส่่งจริง (ticket #10): mode = send เท่านั้้นจึ่่งยิง — dry_run ไม่ยิิงอะไรเลย
  // (sendDelivery ไม่ถูกเรียกแม้แต้ครั้้งเดียว) แล้วใส่สถานะลง log ก่อน insert
  if (mode === 'send' && plan.deliveries.length > 0) {
    const outcomes = await sendAllDeliveries(plan.deliveries, deps.sendDelivery);
    attachSendStatus(plan.logRows, plan.deliveries, outcomes);
  }

  try {
    await deps.insertLogRows(plan.logRows);
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : 'notify_log insert failed',
    });
  }

  return json(200, { ok: true, mode, logged: plan.logRows.length });
}
