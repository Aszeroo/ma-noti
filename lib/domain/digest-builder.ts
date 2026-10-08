// lib/domain/digest-builder.ts — ข ้ อความสร ุ ป 1 ฉบ ั บ /ฝ ่ าย /ว ั น (ticket #4)
import type { Digest, DigestItem, Party, RenewalItem, TodayDate, UnparseableIssue } from '@/lib/domain/types';

// ---- build ----
// 1 digest/ฝ ่ าย/แท็บ/ว ั น — pipeline สะสม due/overdue/issues แล ้ วส ่ งเข ้ าคร ั้ งเด ิ ยว

export function buildDigest(
  party: Party,
  tab: string,
  due: DigestItem[],
  overdue: DigestItem[],
  issues: string[],
  runDate: TodayDate,
): Digest {
  return { party, tab, items: due, overdue, issues, runDate };
}

// ---- mapping ----
// overdue: daysRemaining = null → renderer จะแสดง daysLate (จำนวนว ั นเก ิ น) แทนค ่ าต ิ ดลบ
export function toDigestItem(
  dueDue: { renewal: RenewalItem; daysRemaining: number | null; daysLate: number | null },
  party: Party,
): DigestItem {
  return {
    jobCode: dueDue.renewal.jobCode,
    jobName: dueDue.renewal.jobName,
    unit: dueDue.renewal.unit,
    renewalType: dueDue.renewal.renewalType,
    expiryText: dueDue.renewal.expiryText,
    daysRemaining: dueDue.daysRemaining,
    daysLate: dueDue.daysLate,
    partner: dueDue.renewal.partner,
    owner: dueDue.renewal.owner,
  };
}

export function issueJobCodes(issues: UnparseableIssue[]): string[] {
  return issues.map(i => i.jobCode).filter(x => x !== '');
}
