import { resolveSendMode } from '@/lib/config/send-mode';
import { loadTeamConfig } from '@/lib/config/team-config';
import { verifyCronSecret } from '@/lib/cron/verify-secret';
import { runDaily, type DailyTabInput } from '@/lib/domain/pipeline';
import type { NotifyLogRow, TeamConfig, TodayDate } from '@/lib/domain/types';
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
  /** นาฬิกาของรอบรัน — ควบคุมได้ในเทส */
  now: () => Date;
}

const defaultDeps: DailyCheckDeps = {
  readTabs: () => createSheetsReader()(),
  loadConfig: () => loadTeamConfig(),
  insertLogRows: async rows => {
    const { error } = await getSupabaseAdminClient().from('notify_log').insert(rows);
    if (error) throw new Error(`notify_log insert failed: ${error.message}`);
  },
  now: () => new Date(),
};

/**
 * หัวใจของ endpoint /api/cron/daily-check — เขียนแบบ Web API ล้วน (ไม่ผูกกับ next/server)
 * เพื่อให้เทสได้โดยตรงด้าน node
 *
 * ลำดับการตัดสินใจ (เปลือกบาง — ท่อ/domain ไม่รู้เรื่อง HTTP/env — ตาม PRD: endpoint = เปลือกบาง):
 *   1) ตรวจ CRON_SECRET: ผิด/ไม่มี → 401, เซิร์ฟเวอร์ไม่มี secret ตั้งแต่ต้น → 503
 *   2) เลือก mode จาก env DRY_RUN (ค่าเริ่มต้น = dry_run เสมอ) — เปลี่ยนแค่ marker ใน log
 *   3) อ่านชีตจริงทุกแท็บ (Service Account) → โหลดคอนฟิก 4 ตาราง → เรียก runDaily
 *   4) เขียน notify_log ต่อบุคคล/ช่องทาง + แถวระดับรอบรัน (ทุกรอบต้องมีหลักฐานแม้ไม่มีผู้รับ)
 *
 * หมายเหต ticket #5: delivery ยังไม่ถูก "ส่ง" ที่ใด — endpoint นี้จบแค่การเขียน log
 * ผู้ส่งจริง (Brevo/Discord/Telegram) มาใน ticket #10; จึงไม่มีการติดต่อภายนอก besides
 * Google Sheets (อ่าน) กับ Supabase (เขียน log) แม้ DRY_RUN ถูกปิด
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
