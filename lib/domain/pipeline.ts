// lib/domain/pipeline.ts — seam ระดับสุงของท่อร ันรายว ัน (ticket #4)
// runDaily(input) → DeliveryPlan: row-reader → renewal-rounds (stub) → due-rules → digest-builder → renderer
// ฟังก์ช ัันบร ิสุทธ ิ์ ไม้แตะ Sheet/DB/HTTP: today/runAt/mode ถ ู้กส ่งเข ้ามามาจากร ะดบั shell ท ั้้งหมด
// mode ส ่งผลเพ ียง marker ใน log — deliveries เหม ือนก ันใน dry_run และ send (DRY_RUN ต ัดส ินใจโนกท ่อ)

import { buildDigest, issueJobCodes, toDigestItem } from '@/lib/domain/digest-builder';
import { computeDueItem, dueForParty } from '@/lib/domain/due-rules';
import { ROUND_STATUSES, currentRoundStubs, roundDoneStubs } from '@/lib/domain/renewal-rounds';
import { renderDiscord, renderEmail, renderTelegram } from '@/lib/domain/renderer';
import { readRenewalItems } from '@/lib/domain/row-reader';
import type {
  AssignmentParty,
  Delivery,
  DeliveryChannelType,
  DeliveryPlan,
  Digest,
  NotifyLogRow,
  Party,
  PartyLeadTimes,
  RawSection,
  RecipientChannel,
  RenderedMessage,
  RenewalItem,
  RoundStatus,
  SendMode,
  TabAssignment,
  TeamConfig,
  TodayDate,
} from '@/lib/domain/types';

export interface DailyTabInput {
  /** ช ื่่อแท็บในช ีต (= TabAssignment.sheetTab) */
  tabName: string;
  section: RawSection;
}

export interface DailyRunInput {
  tabs: DailyTabInput[];
  config: TeamConfig;
  /** "ว ัันน ี้" — ส ่งเข ้ามามาจากร ะดบั shell (ท ่อไม้เร ียกนาฬ ิกาเอง) */
  today: TodayDate;
  /** เวลา ISO ของรอบร ััน — สำหร ับ log */
  runAt: string;
  /** การต ัดส ินใจส ่ง/ไม้ส ่งอย ู่โนกท ่อ: ค ่าน ี้เปล ื่ี่ยนแค้ marker dry_run ไม้เปล ื่ี่ยนแผนส ่ง */
  mode: SendMode;
}

const PARTIES: Party[] = ['sales', 'product_buddy', 'quoting'];

const RENDER: Record<DeliveryChannelType, (digest: Digest) => RenderedMessage> = {
  email: renderEmail,
  discord: renderDiscord,
  telegram: renderTelegram,
};

function partyPerson(assignment: TabAssignment, party: Party): AssignmentParty | null {
  if (party === 'sales') return assignment.sales;
  if (party === 'product_buddy') return assignment.productBuddy;
  return assignment.quoting;
}

/** 1 digest ต ่อฝ ่ายต ่อแท็บต ่อว ััน — สร ้างคร ั้งเด ี่ยว แล ้วสะสมรายการ */
function ensureDigest(
  digests: Map<Party, Digest>,
  party: Party,
  tab: string,
  today: TodayDate,
): Digest {
  const existing = digests.get(party);
  if (existing) return existing;
  const created = buildDigest(party, tab, [], [], [], today);
  digests.set(party, created);
  return created;
}

function isEmpty(digest: Digest): boolean {
  return digest.items.length === 0 && digest.overdue.length === 0 && digest.issues.length === 0;
}

/** สถานะพ ิมพ ์นอกช ุุด ROUND_STATUSES (typo) — ADR-0001: ต ้องไม่ถ ืือว ่า "ต ่อแล ้ว" */
function hasStatusTypo(statuses: readonly string[]): boolean {
  return statuses.some(s => s !== '' && !ROUND_STATUSES.includes(s as RoundStatus));
}

/** รายการหน ึึ่ง → กระจายเข ้า digest ของท ุกฝ ่ายท ี่ "ว ันน ี้" ตรงรอบเต ือนของฝ ่ายน ั้้น */
function dispatchDueItem(
  item: RenewalItem,
  today: TodayDate,
  leadTimes: PartyLeadTimes,
  digests: Map<Party, Digest>,
  tab: string,
): void {
  const due = computeDueItem(item, today);
  for (const party of PARTIES) {
    if (!dueForParty(due, leadTimes[party])) continue;
    const digest = ensureDigest(digests, party, tab, today);
    const entry = toDigestItem(
      {
        renewal: item,
        // overdue: ไม่ส ่งค ่าต ิดลบไปแสดง → renderer จะใช ้ daysLate (จำนวนว ัันเก ินกำหนด) แทน
        daysRemaining: due.category === 'overdue' ? null : due.daysRemaining,
        daysLate: due.daysLate,
      },
      party,
    );
    if (due.category === 'overdue') digest.overdue.push(entry);
    else digest.items.push(entry);
  }
}

/**
 * 1 แท็บ → digest ต่อฝ่าย (Map) + จำนวนข้อม ูลม ีป ัญหารวม
 * ข ้อม ูลม ีป ัญหา (parse ไม้ได ้ / ไม่ม ีว ัันหมดอาย ุ / ต ่อแล ้วไม่ม ีวิ ันหมดอาย ุช ุุดใหม ่ / สถานะ typo)
 * → ส ่งเข ้า digest ของเจ ้าของแท็บ (sales) เท ่าน ั้้น
 */
function buildDigestsForTab(
  tab: DailyTabInput,
  config: TeamConfig,
  today: TodayDate,
): { digests: Map<Party, Digest>; issuesTotal: number } {
  const digests = new Map<Party, Digest>();
  const read = readRenewalItems(tab.section); // map จากช ื่่อคอล ััมน์์ — ไมม่ ี hardcode ตำแหน ่ง

  const notifyOwner = (jobCode: string): void => {
    if (jobCode !== '') ensureDigest(digests, 'sales', tab.tabName, today).issues.push(jobCode);
  };

  for (const code of issueJobCodes(read.issues)) notifyOwner(code);

  let issuesTotal = read.issues.length;
  for (const item of read.items) {
    // renewal-rounds (stub ตาม ADR-0001): ท ุก Item ถ ืือว ่าอย ู่รอบ 1 ย ังไม่จบ จนกว ่าคอล ััมน์สถานะจร ิงจะพร ้อม
    const round = currentRoundStubs(item.roundStatuses as unknown as RoundStatus[]);
    if (roundDoneStubs(round)) continue;

    // typo → ไม่ใช้ "ต่อแล้ว" (แจ้งเตือนต่ามปกต)ิ + รายงานให ้เจ ้าของแท็บแก ้ช ีต
    if (hasStatusTypo(item.roundStatuses)) {
      issuesTotal += 1;
      notifyOwner(item.jobCode);
    }
    dispatchDueItem(item, today, config.leadTimes, digests, tab.tabName);
  }
  return { digests, issuesTotal };
}

// 1 คนหลายช ่องทาง = recipients หลายแถว → กล ุมตาม personId
function groupChannelsByPerson(
  recipients: RecipientChannel[],
): Map<string, RecipientChannel[]> {
  const byPerson = new Map<string, RecipientChannel[]>();
  for (const recipient of recipients) {
    const list = byPerson.get(recipient.personId) ?? [];
    list.push(recipient);
    byPerson.set(recipient.personId, list);
  }
  return byPerson;
}

/** digest → แผนส ่ง: แยก Delivery ต ่อ (คน, ช ่องทาง) + logRow เด ียวก ัน (เน ื้้อหาเท ่าก ันท ุก mode) */
function emitTabDeliveries(
  tabName: string,
  assignment: TabAssignment | null,
  digests: Map<Party, Digest>,
  channelsByPerson: Map<string, RecipientChannel[]>,
  dryRun: boolean,
): { deliveries: Delivery[]; logRows: NotifyLogRow[] } {
  const deliveries: Delivery[] = [];
  const logRows: NotifyLogRow[] = [];
  for (const party of PARTIES) {
    const digest = digests.get(party);
    if (!digest || isEmpty(digest)) continue; // ไม่ม ีเร ื่่องเต ือน → ไม่ส ่งข ้อมูลว ่าง
    const person = assignment ? partyPerson(assignment, party) : null;
    if (!person) continue; // ไม่ม ี assignment/role น ี้ → ข ้ามแบบไม่พ ัง
    for (const channel of channelsByPerson.get(person.personId) ?? []) {
      deliveries.push({
        party,
        personId: person.personId,
        personName: person.personName,
        channel: channel.channel,
        contact: channel.contact,
        message: RENDER[channel.channel](digest),
      });
      logRows.push({
        person_id: person.personId,
        channel: channel.channel,
        item_count: digest.items.length + digest.overdue.length,
        // เน ื้้อหา log เหม ือนก ันท ุก mode — dry_run flag เท ่าน ั้้นท ี่ต ิดตาม mode (การต ัดส ินใจอย ู่โนกท ่อ)
        details: { tab: tabName, party, issue_count: digest.issues.length },
        dry_run: dryRun,
      });
    }
  }
  return { deliveries, logRows };
}

/** ท่อร ับรายว ัันแบบบร ิสุทธ ิ์: (แท็บด ิบ + คอนฟ ิกท ีม + ว ัันน ี้) → แผนส ่ง (delivery + log + run summary) */
export function runDaily(input: DailyRunInput): DeliveryPlan {
  const { config, today, mode } = input;
  const dryRun = mode === 'dry_run';
  const channelsByPerson = groupChannelsByPerson(config.recipients);

  const deliveries: Delivery[] = [];
  const deliveryRows: NotifyLogRow[] = [];
  let issuesTotal = 0;

  for (const tab of input.tabs) {
    const assignment = config.assignments.find(a => a.sheetTab === tab.tabName) ?? null;
    const { digests, issuesTotal: tabIssues } = buildDigestsForTab(tab, config, today);
    issuesTotal += tabIssues;
    const emitted = emitTabDeliveries(tab.tabName, assignment, digests, channelsByPerson, dryRun);
    deliveries.push(...emitted.deliveries);
    deliveryRows.push(...emitted.logRows);
  }

  return {
    deliveries,
    logRows: [
      {
        person_id: null,
        channel: null, // แถวระดบั "รอบร ััน" — schema ticket #2
        item_count: deliveries.length,
        details: { stage: 'pipeline', run_at: input.runAt, tabs: input.tabs.length },
        dry_run: dryRun,
      },
      ...deliveryRows,
    ],
    run: {
      runAt: input.runAt,
      mode,
      itemsWithIssues: { total: issuesTotal },
    },
  };
}
