// lib/domain/types.ts — โมเดลข้อมูลของท่อรายว ััน (ticket #4)
// ท่อรายว ััน = ฟังก์ช ัันบร ิส ุทธ ิ์หนึ่ งต ั ว : ร ับ (tab raw + config + "ว ั น)
// → คื น (แผนส ่ ง: delivery[] + logRows) — ท ัวโมเดลล ้วน; ไม ่แตะ Sheet/DB/HTTP
// ศ ัพท ์ตาม glossary (CONTEXT.md): Renewal Item / Job / Party / Channel /
// Digest / Round Status / Renewal Round / Unparseable Item / Section / Lead Times

// ---- input ----

// "ว ั น 2 ท ี้Shell ส ่งเข ้ ามา (ป ี ค.ศ.) — pipeline ไม ่เร ียกเวลา/โซนเอง
export interface TodayDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

// หนึ่ งแถวข ้ อมูลใน 1 section — ค่ าตามตำแหน ่ งคอล ัมน ์ ; '' = cell ว ่ าง/ไม ่ครบ
export interface RawRow {
  cells: string[];
}

// แท็บด ิบหนึ่ ง Section (ป ัจจ ุบ ัน = "งานต ่ออาย ุ") จาก 1 แท็บ
// แถว 2 = ช ื่อ section ; แถว 3 = ห ัวคอล ัมน ์ (normalized) ; แถว 4+ = rows
// ตำแหน ่ งคอล ัมน ์เพ ียนระหว ่างแท็บ → map จากช ื่อ headers (normalize)
export interface RawSection {
  sectionName: string; // ปจ ุุบ ัน = "งานต ่ออาย ุ" — ท ี่ระบบรอ ้รบ
  headers: string[]; // normalized: lowercase + ต ัดวรรค/จ ุด
  rows: RawRow[];
}

// หนึ่ งคน + หนึ่ งช ่องทาง (person_id/ช ื่อ = จาก DB ; contact = DB เท ่าน ั้น
// = 1 คนหลายช ่องทาง = recipient × channel)
export interface RecipientChannel {
  personId: string;
  personName: string;
  channel: DeliveryChannelType;
  contact: string;
}

// หนึ่ งบทบาทใน 1Assignment = person_id + ช ื่อ
export interface AssignmentParty {
  personId: string;
  personName: string;
}

// การจ ัดฝา่ย ์ 1 แท็บ Sales: sales / product_buddy / quoting (1 คนหลายบาทได้
export interface TabAssignment {
  sheetTab: string; // 1 คน = 1 แท็บ ; เจ ้ าของแท็บ = sales
  sales: AssignmentParty;
  productBuddy: AssignmentParty | null;
  quoting: AssignmentParty | null;
}

// ค่ าLeadTimes = array "days before expiry" (0 = ว ันหมดอาย ุ) — เข ้าข่า  ย
// = ค ่าLeadTimes ของฝา่ย ์ ; ท ุ กฝ าย = เข ้าข่า  ยเฉพาะเม ื่ อ
export type LeadTimes = number[];

export interface PartyLeadTimes {
  sales: LeadTimes; // 30/14/7/3/1 + 0
  product_buddy: LeadTimes; // 30/14/7/3/1 + 0
  quoting: LeadTimes; // 60/45/30
}

// ค อนฟ ิกท ี ม: assignments + channels(recipients) + leadTimes
// (จาก Supabase tables — shell โหลดเข ้า ; pipeline ไม ่เร ียก DB)
export interface TeamConfig {
  assignments: TabAssignment[];
  recipients: RecipientChannel[];
  leadTimes: PartyLeadTimes;
}

export type RoundStatus = '' | 'รอขอใบราคา' | 'กำลังดำเนินการ' | 'ต่อแล้ว';

// ---- item model ----

// Renewal Item = หนึ่ งรายการใน 1 แถว ; "job" = Job Code/กล ุ่ มงาน
export interface RenewalItem {
  jobCode: string; // "Job Code"
  jobName: string; // ชื่ องาน
  unit: string; // หน ่ วย
  renewalType: string; // ประเภทการต ่ าย ุ
  expiryText: string; // "ว ั นหมดอาย ุ" (ด ิบ)
  renewalDeadlineText: string; // "กำหนดต ่ าย ุ" = deadline ว ั นใหม่
  partner: string; // partner
  owner: string; // "ผ ู้ต ิดต ่ าว" — person 2 าว 2 ที่
  roundStatuses: [string, string, string, string]; // `สถานะคร ั ้ง 1..4`
}

export type UnparseableReason = 'expiry_unparseable' | 'no_new_expiry' | 'expiry_missing' | 'status_typo';

export interface UnparseableIssue {
  jobCode: string;
  reason: UnparseableReason;
}

// ---- output ----

// ฝา่ย ์: 3 บทบาท
export type Party = 'sales' | 'product_buddy' | 'quoting';

// ---- digest ----

// ข ้ อความส รุ ป (Digest) — ท ุ ก= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
export interface DigestItem {
  jobCode: string;
  jobName: string;
  unit: string;
  renewalType: string;
  expiryText: string;
  daysRemaining: number | null;
  daysLate: number | null;
  partner: string;
  owner: string;
}

export interface Digest {
  party: Party;
  runDate: TodayDate;
  tab: string;
  items: DigestItem[];
  overdue: DigestItem[];
  issues: string[]; // jobCodes of unparseable items
}

// ช ่องทาง: email / discord / telegram
export type DeliveryChannelType = 'email' | 'discord' | 'telegram';

// SendMode — from lib/config/send-mode ; ท่อไม ่ต ัดส ิน ใจ mode
export type SendMode = 'dry_run' | 'send';

// ข ้อความสร ุปเรนเดอร ์แล ้ว — renderer = fังก์ช ันบร ิส ุทธ ิ์ ;
// คื นโครงสร ้างความ : HTML ตาราง / embed / markdown
export type RenderedMessage = string;

// แผนส ่งหนึ่ ง: 1 delivery = 1 ข ้อความ/1 คน/1 ช ่องทาง
// (คนหลายช ่องทาง → delivery หลาย ; DUMP = delivery หนึ่ ง = คน + ช ่อง
export interface Delivery {
  party: Party;
  personId: string;
  personName: string;
  channel: DeliveryChannelType;
  contact: string;
  message: RenderedMessage;
}

// NotifyLogRow — ticket #2 schema: dry_run marker ; row "รอบร ั น"
// (person_id/channel = null) ; แถวต ่อคน/ช ่องทาง = person_id + channel
export interface NotifyLogRow {
  person_id: string | null;
  channel: DeliveryChannelType | null;
  item_count: number;
  details: Record<string, unknown>;
  dry_run: boolean;
}

// UnparseableSummary = ท ุ กข ้ อมูลม ีป ัญหา = = ไม ่เข ้าข ่าย
// (parse ไม ่ / ไม ่มีว ัน ; ticket #5 history จะแก ้)
export interface UnparseableSummary {
  total: number;
}

// RunSummary : runAt + mode + itemsWithIssues (pipeline ไม ่ต ัด
export interface RunSummary {
  runAt: string;
  mode: SendMode;
  itemsWithIssues: UnparseableSummary;
}

// คื นของท ่อรายว ั น: แผนส ่ง (delivery[] + logRows + run
export interface DeliveryPlan {
  deliveries: Delivery[];
  logRows: NotifyLogRow[];
  run: RunSummary;
}
