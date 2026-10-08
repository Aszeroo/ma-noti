// tests/pipeline.test.ts — เทสสถานการณผาน seam เดียว (ticket #4)
// fixture ปลอมทั้งหมด: ไมอาืน Sheet/DB/HTTP — เปนฟังกชันบรุิสุทธ ิ์ ร ับ (แท็บดิบ + คอนฟิก + วันน ี้)
// assertions ดูแตพ ืนผ าน outpuตของ runDaily เทานั้ น (ไมแอบเขาดางใน pipeline)
import { describe, expect, it } from 'vitest';

import { runDaily, type DailyRunInput, type DailyTabInput } from '@/lib/domain/pipeline';
import { COLUMN_NAMES } from '@/lib/domain/row-reader';
import type { Delivery, DeliveryPlan, RawSection, SendMode, TeamConfig, TodayDate } from '@/lib/domain/types';

// ---------- fake fixtures ----------

const TODAY: TodayDate = { year: 2026, month: 10, day: 8 };
const RUN_AT = '2026-10-08T01:00:00.000Z';

/** dd/mm/yyyy (ค.ศ. < 2400 = ค.ศ. ตามตัว) เทียบจาก TODAY */
function dAfter(days: number): string {
  const d = new Date(Date.UTC(TODAY.year, TODAY.month - 1, TODAY.day + days));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

const H = COLUMN_NAMES;
const STD_HEADERS: string[] = Object.values(H);
// แท็บท่ีตำแหน่งคอลัมน์เพี้ยน + มีคอลัมน์แปลกปลอมแทรก (ทสต์ว่า map จากชื่อ ไมใช่ตำแหน่ง)
const SHUFFLED_HEADERS: string[] = [
  'หมายเหตุเสริม', H.owner, H.unit, H.expiryText, H.jobCode, H.roundStatus2,
  H.partner, H.jobName, H.roundStatus4, H.renewalType, H.renewalDeadline,
  H.roundStatus1, H.roundStatus3, 'วันทำรายการ',
];
// แท็บท่ีขาดคอลัมน์วันหมดอายุไปเลย — ต้องไม่พัง
const NO_EXPIRY_HEADERS: string[] = STD_HEADERS.filter(h => h !== H.expiryText);

interface Fix {
  code: string;
  /** จำนวนวันนับจาก TODAY ที่รายการหมดอายุ */
  in?: number;
  /** ค่าดิบของคอลัมน์วันหมดอายุ (ทับ in) */
  expiry?: string;
  /** ค่าดิบของคอลัมน์กำหนดต่ออายุ (ไม่ระบุ = วันไกล ๆ ให้ parse ผ่าน) */
  deadline?: string;
  partner?: string;
  owner?: string;
  /** ค่าคอลัมน์สถานะครั้งที่ 1 */
  status?: string;
}

function cells(f: Fix): string[] {
  const expiry = f.expiry ?? (f.in !== undefined ? dAfter(f.in) : '');
  const deadline = f.deadline ?? (f.in !== undefined ? dAfter(f.in + 120) : dAfter(400));
  return [
    f.code, 'ชื่องานทดสอบ', 'SSL', 'โดเมน', expiry, deadline,
    f.partner ?? 'PARTNER-P1', f.owner ?? 'OWNER-O1',
    f.status ?? 'รอขอใบราคา', '', '', '',
  ];
}

function reorder(src: string[], from: string[], to: string[]): string[] {
  return to.map(h => {
    const i = from.indexOf(h);
    return i === -1 ? '' : src[i];
  });
}

function section(headers: string[], rows: Fix[]): RawSection {
  return {
    sectionName: 'งานต่ออายุ',
    headers,
    rows: rows.map(f => ({ cells: reorder(cells(f), STD_HEADERS, headers) })),
  };
}

const CONFIG: TeamConfig = {
  assignments: [
    {
      sheetTab: 'team-a',
      sales: { personId: 'u-som', personName: 'สมชาย' },
      productBuddy: { personId: 'u-nida', personName: 'ณดา' },
      quoting: { personId: 'u-quoting', personName: 'ทีมใบราคา' },
    },
    {
      sheetTab: 'team-b',
      sales: { personId: 'u-som', personName: 'สมชาย' },
      productBuddy: null,
      // ณดา อยู่คนละบทบาทกับแท็บนี้ → คนเดียวหลายบทบาท
      quoting: { personId: 'u-nida', personName: 'ณดา' },
    },
  ],
  recipients: [
    { personId: 'u-som', personName: 'สมชาย', channel: 'email', contact: 'som@test.example' },
    { personId: 'u-som', personName: 'สมชาย', channel: 'telegram', contact: '@som' },
    { personId: 'u-nida', personName: 'ณดา', channel: 'email', contact: 'nida@test.example' },
    { personId: 'u-quoting', personName: 'ทีมใบราคา', channel: 'discord', contact: 'webhook-quoting' },
  ],
  leadTimes: {
    sales: [30, 14, 7, 3, 1, 0],
    product_buddy: [30, 14, 7, 3, 1, 0],
    quoting: [60, 45, 30],
  },
};

function tabA(rows: Fix[]): DailyTabInput {
  return { tabName: 'team-a', section: section(STD_HEADERS, rows) };
}
function tabB(rows: Fix[]): DailyTabInput {
  return { tabName: 'team-b', section: section(SHUFFLED_HEADERS, rows) };
}

function run(tabs: DailyTabInput[], mode: SendMode = 'send'): DeliveryPlan {
  const input: DailyRunInput = { tabs, config: CONFIG, today: TODAY, runAt: RUN_AT, mode };
  return runDaily(input);
}

function messagesFor(plan: DeliveryPlan, personId: string, party?: Delivery['party']): string[] {
  return plan.deliveries
    .filter(d => d.personId === personId && (party === undefined || d.party === party))
    .map(d => d.message);
}
function firstMessage(
  plan: DeliveryPlan,
  personId: string,
  party: Delivery['party'],
  channel?: Delivery['channel'],
): string {
  const msgs = plan.deliveries
    .filter(d => d.personId === personId && d.party === party && (channel === undefined || d.channel === channel))
    .map(d => d.message);
  expect(msgs.length, `delivery ของ ${personId}/${party}`).toBeGreaterThan(0);
  return msgs[0]!;
}
function countNeedle(message: string, needle: string): number {
  return message.split(needle).length - 1;
}

// ---------- acceptance criteria ----------

describe('runDaily — ท่อรันรายวัน (seam เดียว, fixture ปลอมทั้งหมด)', () => {
  it('รอบเตือนแต่ละฝ่ายถูกต้อง — รายการเข้าข่ายเฉพาะวันที่ตรงรอบของฝ่ายนั้น', () => {
    // sales/product_buddy: 14 ∈ [30,14,7,3,1,0] | quoting: 45 ∈ [60,45,30] | 20 ไม่ตรงใคร
    const plan = run([tabA([
      { code: 'JOB-D14', in: 14 },
      { code: 'JOB-D45', in: 45 },
      { code: 'JOB-D20', in: 20 },
    ])]);

    const sales = firstMessage(plan, 'u-som', 'sales');
    expect(sales).toContain('JOB-D14');
    expect(sales).not.toContain('JOB-D45');
    expect(sales).not.toContain('JOB-D20');

    const quoting = firstMessage(plan, 'u-quoting', 'quoting');
    expect(quoting).toContain('JOB-D45');
    expect(quoting).not.toContain('JOB-D14');
    expect(quoting).not.toContain('JOB-D20');

    // 20 วันไม่ตรงรอบใครเลย — ต้องไม่โผล่ในทุกข้อความ
    for (const d of plan.deliveries) expect(d.message).not.toContain('JOB-D20');
  });

  it('เลยกำหนด → หมวด "เลยกำหนดแล้ว" พร้อมบอกจำนวนวันที่เกิน (และเตือนทุกฝ่าย)', () => {
    // หมดอายุ 1/10/2026 วันนี้ 8/10/2026 = เกินมา 7 วัน (ไม่ตรง lead time ใด ๆ แต่ยังต้องเตือน)
    const plan = run([tabA([{ code: 'JOB-OVERDUE', expiry: '1/10/2026', deadline: '1/2/2027' }])]);

    const sales = firstMessage(plan, 'u-som', 'sales');
    expect(sales).toContain('เลยกำหนด');
    // ช่องทาง telegram เห็นจำนวนวันเกินแบบ "(7 w)" ตรง ๆ
    const salesTelegram = firstMessage(plan, 'u-som', 'sales', 'telegram');
    expect(salesTelegram).toMatch(/JOB-OVERDUE \(7 w\)/); // จำนวนวันที่เกินมา ไม่ใช่ค่าติดลบ
    expect(salesTelegram).not.toMatch(/JOB-OVERDUE \(-7/);

    // เลยกำหนด = ทุกฝ่ายได้เตือน แม้ 7 จะไม่อยู่ในรอบ quoting เลย
    expect(firstMessage(plan, 'u-quoting', 'quoting')).toContain('JOB-OVERDUE');
  });

  it('ข้อมูลมีปัญหา (parse ไม่ได้ / ไม่มีวันหมดอายุ / ต่อแล้วไม่มีวันใหม่) → หาเจ้าของแท็บฝ่ายเดียว', () => {
    const plan = run([tabA([
      { code: 'JOB-BAD1', expiry: 'เมื่อวานซืน', deadline: '1/2/2027' },
      { code: 'JOB-BAD2', expiry: '' },
      { code: 'JOB-BAD3', in: 30, deadline: '' },
      { code: 'JOB-OK', in: 14 },
    ])]);

    const sales = firstMessage(plan, 'u-som', 'sales');
    expect(sales).toContain('ข้อมูลมีปัญหา');
    expect(sales).toContain('JOB-BAD1');
    expect(sales).toContain('JOB-BAD2');
    expect(sales).toContain('JOB-BAD3');

    // ฝ่ายอื่นต้องไม่เห็นรายการปัญหา (ไปหาเจ้าของแท็บเท่านั้น)
    const buddy = firstMessage(plan, 'u-nida', 'product_buddy');
    expect(buddy).toContain('JOB-OK');
    expect(buddy).not.toContain('ข้อมูลมีปัญหา');
    expect(buddy).not.toContain('JOB-BAD');
    const quotingMsgs = messagesFor(plan, 'u-quoting');
    for (const m of quotingMsgs) expect(m).not.toContain('JOB-BAD');

    expect(plan.run.itemsWithIssues.total).toBe(3);
  });

  it('สถานะพิมพ์ผิดนอกชุดค่า → ไม่นับเป็น "ต่อแล้ว" ยังเตือนต่อ + รายงานเป็นข้อมูลมีปัญหา', () => {
    // 'กำลังดำเนิการ' (พิมพ์ตก) ไม่อยู่ใน ROUND_STATUSES — ต้องไม่ทำให้รายการหายเงียบ ๆ
    const plan = run([tabA([{ code: 'JOB-TYPO', in: 14, status: 'กำลังดำเนิการ' }])]);

    const sales = firstMessage(plan, 'u-som', 'sales', 'telegram');
    expect(sales).toContain('JOB-TYPO (14 w)'); // ยังเตือนตามรอบปกติ
    expect(sales).toMatch(/ข้อมูลมีปัญหา: [^\n]*JOB-TYPO/); // และถูกส่งให้เจ้าของแท็บ
    expect(plan.run.itemsWithIssues.total).toBe(1);
  });

  it('แท็บว่าง / แท็บที่ไม่มี assignment → ไม่พัง ไม่มีแผนส่ง', () => {
    const planEmpty = run([{ tabName: 'team-a', section: { sectionName: 'งานต่ออายุ', headers: STD_HEADERS, rows: [] } }]);
    expect(planEmpty.deliveries).toHaveLength(0);
    expect(planEmpty.run.itemsWithIssues.total).toBe(0);

    const planGhost = run([{ tabName: 'tab-ไม่มีใน-config', section: section(STD_HEADERS, [{ code: 'JOB-G', in: 14 }]) }]);
    expect(planGhost.deliveries).toHaveLength(0);
    expect(planGhost.logRows[0]?.person_id).toBeNull(); // แถวระดับรอบรันยังมีตาม schema
  });

  it('ตำแหน่งคอลัมน์เพี้ยนระหว่างแท็บ / ขาดคอลัมน์ → map จากชื่อ header ไม่พัง', () => {
    const plan = run([tabB([
      { code: 'JOB-B14', in: 14 },
      { code: 'JOB-B45', in: 45 },
    ])]);
    // team-b sales = u-som, quoting = u-nida — header สลับตำแหน่งแต่ map ถูก
    expect(firstMessage(plan, 'u-som', 'sales')).toContain('JOB-B14');
    expect(firstMessage(plan, 'u-som', 'sales')).not.toContain('JOB-B45');
    const nida = firstMessage(plan, 'u-nida', 'quoting');
    expect(nida).toContain('JOB-B45');

    // แท็บที่ขาดคอลัมน์วันหมดอายุไปเลย — ทุกแถวกลายเป็นข้อมูลมีปัญหา ไม่ crash
    const noExpiry: DailyTabInput = {
      tabName: 'team-a',
      section: {
        sectionName: 'งานต่ออายุ',
        headers: NO_EXPIRY_HEADERS,
        rows: [{ code: 'JOB-NOEXP', in: 14 }].map(f => ({ cells: reorder(cells(f), STD_HEADERS, NO_EXPIRY_HEADERS) })),
      },
    };
    const plan2 = run([noExpiry]);
    const sales2 = firstMessage(plan2, 'u-som', 'sales');
    expect(sales2).toContain('ข้อมูลมีปัญหา');
    expect(sales2).toContain('JOB-NOEXP');
    expect(plan2.run.itemsWithIssues.total).toBe(1);
  });

  it('คนเดียวหลายบทบาท → ได้ข้อความแยกตามฝ่าย (1 digest/ฝ่าย/แท็บ/วัน)', () => {
    const plan = run([
      tabA([{ code: 'JOB-AB14', in: 14 }]), // ณดา = product_buddy
      tabB([{ code: 'JOB-AB45', in: 45 }]), // ณดา = quoting ของ team-b
    ]);

    const asBuddy = messagesFor(plan, 'u-nida', 'product_buddy');
    const asQuoting = messagesFor(plan, 'u-nida', 'quoting');
    expect(asBuddy).toHaveLength(1);
    expect(asQuoting).toHaveLength(1);
    expect(asBuddy[0]).toContain('JOB-AB14');
    expect(asBuddy[0]).not.toContain('JOB-AB45');
    expect(asQuoting[0]).toContain('JOB-AB45');
    expect(asQuoting[0]).not.toContain('JOB-AB14');
  });

  it('คนเดียวหลายช่องทาง → แผนส่งหลายรายการ เรนเดอร์ 3 ช่องทางต่างกัน', () => {
    const plan = run([tabA([{ code: 'JOB-CH', in: 14 }, { code: 'JOB-DQ', in: 45 }])]);

    const somDeliveries = plan.deliveries.filter(d => d.personId === 'u-som' && d.party === 'sales');
    expect(somDeliveries).toHaveLength(2); // email + telegram = 1 digest 2 การส่ง
    const email = somDeliveries.find(d => d.channel === 'email')!;
    const telegram = somDeliveries.find(d => d.channel === 'telegram')!;
    expect(email.contact).toBe('som@test.example');
    expect(email.message).toContain('<table>');
    expect(telegram.message).toContain('JOB-CH (14 w)');
    expect(telegram.message).not.toContain('<table>');

    const discord = firstMessage(plan, 'u-quoting', 'quoting');
    const parsed = JSON.parse(discord) as { embeds: Array<{ title: string }> };
    expect(parsed.embeds.length).toBeGreaterThanOrEqual(1);

    // log ต่อ (คน, ช่องทาง)
    const log = plan.logRows.find(r => r.person_id === 'u-som' && r.channel === 'telegram');
    expect(log?.item_count).toBe(1);
  });

  it('กลุ่มงานหนึ่ง Job Code กินหลายแถว = หลายรายการต่ออายุ นับแยกกัน', () => {
    const plan = run([tabA([
      { code: 'JOB-SAME', in: 14, owner: 'เจ้าของ-ก' },
      { code: 'JOB-SAME', in: 7, owner: 'เจ้าของ-ข' },
    ])]);

    const telegram = firstMessage(plan, 'u-som', 'sales', 'telegram');
    expect(countNeedle(telegram, 'JOB-SAME')).toBe(2); // สองแถว = สองรายการ ไม่นับรวมเป็นหนึ่ง
    const email = firstMessage(plan, 'u-som', 'sales', 'email');
    expect(email).toContain('เจ้าของ-ก');
    expect(email).toContain('เจ้าของ-ข');
    const log = plan.logRows.find(r => r.person_id === 'u-som' && r.channel === 'email');
    expect(log?.item_count).toBe(2);
  });

  it('ทีมขอใบราคาเน้น partner + ผู้ติดต่อ', () => {
    const plan = run([tabA([{ code: 'JOB-Q1', in: 45, partner: 'PARTNER-Z', owner: 'OWNER-ZZ' }])]);

    const parsed = JSON.parse(firstMessage(plan, 'u-quoting', 'quoting')) as {
      embeds: Array<{ fields: Array<{ name: string; value: string }> }>;
    };
    const emphasized = parsed.embeds[0]!.fields.some(
      f => f.name.includes('partner + owner') && f.value.includes('PARTNER-Z') && f.value.includes('OWNER-ZZ'),
    );
    expect(emphasized).toBe(true);
  });

  it('DRY_RUN ไม่เปลี่ยนแผนส่ง — การตัดสินใจส่ง/ไม่ส่งอยู่นอกท่อ', () => {
    const tabs = [tabA([{ code: 'JOB-DR', in: 14 }, { code: 'JOB-DR-OLD', expiry: '1/10/2026' }])];
    const dry = run(tabs, 'dry_run');
    const live = run(tabs, 'send');

    expect(live.deliveries.length).toBeGreaterThan(0);
    expect(dry.deliveries).toEqual(live.deliveries); // ข้อความ+ผู้รับ+ช่องทาง เท่ากันทุกประการ

    // เนื้อหา log เท่ากัน เหลือแค่ marker dry_run ที่ต่างกัน (ตึดตาม mode ที่ shell ส่งเข้ามา)
    const strip = (p: DeliveryPlan) => p.logRows.map(r => ({ ...r, dry_run: false }));
    expect(strip(dry)).toEqual(strip(live));
    expect(dry.logRows.every(r => r.dry_run)).toBe(true);
    expect(live.logRows.every(r => !r.dry_run)).toBe(true);
    expect(dry.run.mode).toBe('dry_run');
    expect(live.run.mode).toBe('send');
    expect(dry.run.runAt).toBe(RUN_AT);
  });
});
