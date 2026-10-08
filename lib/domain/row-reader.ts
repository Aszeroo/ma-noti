// lib/domain/row-reader.ts — map RenewalItem จากชื่ อคอลัมน์ (ticket #4)
// ห ้ าม hardcode ตำแหน ่ งคอลัมน์ ; map จาก sh ื่ อคอลัมน์ (normalize:
// lowercase + ต ั ด whitespace/dot/dash) — ท ุ ก 2 าว 2 ท ี่ 2 = ท ุ ก
// Renewal Item = ข ้ ้ อมูลใน 1 แถว ; 2 าว 2 ท ี่ 2 = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
import { parseExpiryDate } from '@/lib/domain/date-parser';
import type { RenewalItem, RawSection, UnparseableIssue } from '@/lib/domain/types';

function normalizeHeader(raw: string): string {
  return raw.toLowerCase().replace(/[\s.\-–—]/g, '');
}

type ColumnKey =
  | 'jobCode'
  | 'jobName'
  | 'unit'
  | 'renewalType'
  | 'expiryText'
  | 'renewalDeadline'
  | 'partner'
  | 'owner'
  | 'roundStatus1'
  | 'roundStatus2'
  | 'roundStatus3'
  | 'roundStatus4';

export const COLUMN_NAMES: Record<ColumnKey, string> = {
  jobCode: 'Job Code',
  jobName: 'ชื่ องาน',
  unit: 'หน ่ วย',
  renewalType: 'ประเภทการต ่ าย ุ',
  expiryText: 'ว ั นหมดอาย ุ',
  renewalDeadline: 'กำหนดต ่ าย ุ',
  partner: 'partner',
  owner: 'ผ ู้ต ิ ดต ่ าว',
  roundStatus1: 'สถานะคร ั ้ งที่1',
  roundStatus2: 'สถานะคร ั ้ งที่2',
  roundStatus3: 'สถานะคร ั ้ งที่3',
  roundStatus4: 'สถานะคร ั ้ งที่4',
};

export type HeaderMap = Record<ColumnKey, number>; // -1 = not found

export interface RowReaderResult {
  items: RenewalItem[];
  issues: UnparseableIssue[];
  headers: HeaderMap;
}

export function readRenewalItems(raw: RawSection): RowReaderResult {
  const headers = mapHeaders(raw.headers);
  const items: RenewalItem[] = [];
  const issues: UnparseableIssue[] = [];
  for (const row of raw.rows) {
    const cellAt = (key: ColumnKey): string => {
      const idx = headers[key];
      return idx === -1 ? '' : row.cells[idx] ?? '';
    };
    const expiryParsed = parseExpiryDate(cellAt('expiryText'));
    const deadlineParsed = parseExpiryDate(cellAt('renewalDeadline'));
    if (expiryParsed.ok && deadlineParsed.ok) items.push(buildItem(cellAt));
    else issues.push(toIssue(cellAt('jobCode'), expiryParsed, deadlineParsed));
  }
  return { items, issues, headers };
}

function mapHeaders(headers: string[]): HeaderMap {
  const map: HeaderMap = {} as HeaderMap;
  for (const [key, name] of Object.entries(COLUMN_NAMES) as Array<[ColumnKey, string]>) {
    const want = normalizeHeader(name);
    const idx = headers.findIndex(h => normalizeHeader(h) === want);
    map[key] = idx >= 0 ? idx : -1;
  }
  return map;
}

function buildItem(cellAt: (key: ColumnKey) => string): RenewalItem {
  return {
    jobCode: cellAt('jobCode'),
    jobName: cellAt('jobName'),
    unit: cellAt('unit'),
    renewalType: cellAt('renewalType'),
    expiryText: cellAt('expiryText'),
    renewalDeadlineText: cellAt('renewalDeadline'),
    partner: cellAt('partner'),
    owner: cellAt('owner'),
    roundStatuses: [
      cellAt('roundStatus1'),
      cellAt('roundStatus2'),
      cellAt('roundStatus3'),
      cellAt('roundStatus4'),
    ] as [string, string, string, string],
  };
}

function toIssue(
  jobCode: string,
  expiry: { ok: boolean },
  deadline: { ok: boolean },
): UnparseableIssue {
  const reason =
    !expiry.ok ? 'expiry_unparseable' : !deadline.ok ? 'no_new_expiry' : 'expiry_missing';
  return { jobCode, reason } as UnparseableIssue;
}
