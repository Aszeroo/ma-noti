// lib/domain/due-rules.ts — daysBetween Gregorian + due of each party (ticket #4)
import { parseExpiryDate } from '@/lib/domain/date-parser';
import type { LeadTimes, Party, RenewalItem, TodayDate } from '@/lib/domain/types';

interface DayCountDate {
  year: number;
  month: number;
  day: number;
}

// Julian Day Number (integer Gregorian) — integer divisions truncate to zero;
// valid for all Gregorian dates after -4713.
function jdn(y: number, m: number, d: number): number {
  const trunc = (n: number, div: number): number => (n / div >= 0 ? floor(n / div) : ceil(n / div));
  const floor = (x: number): number => Math.floor(x);
  const ceil = (x: number): number => Math.ceil(x);
  const f14 = trunc(m - 14, 12);
  const a = floor(1461 * (y + 4800 + f14) / 4);
  const b = floor(367 * (m - 2 - 12 * f14) / 12);
  const c = floor(3 * (y + 4900 + f14) / 4);
  return a + b - c + d - 32075;
}

function daysBetween(a: DayCountDate, b: DayCountDate): number {
  return jdn(b.year, b.month, b.day) - jdn(a.year, a.month, a.day);
}

export interface DueItem {
  renewal: RenewalItem;
  expiry: { year: number; month: number; day: number } | null;
  deadline: { year: number; month: number; day: number } | null;
  daysRemaining: number | null; // days today -> expiry; <0 = overdue
  daysLate: number | null; // overdue: days expiry -> today
  category: 'due' | 'overdue' | 'unparseable';
}

export function computeDueItem(item: RenewalItem, today: TodayDate): DueItem {
  const exp = parseExpiryDate(item.expiryText);
  const dl = parseExpiryDate(item.renewalDeadlineText);
  const expiry = exp.ok ? exp.date : null;
  const deadline = dl.ok ? dl.date : null;
  if (expiry) {
    const rem = daysBetween(today, expiry);
    if (rem < 0) {
      return { renewal: item, expiry, deadline, daysRemaining: rem, daysLate: daysBetween(expiry, today), category: 'overdue' };
    }
    return { renewal: item, expiry, deadline, daysRemaining: rem, daysLate: null, category: 'due' };
  }
  return { renewal: item, expiry: null, deadline, daysRemaining: null, daysLate: null, category: 'unparseable' };
}

// due for party: overdue always in (rem = 0 on expiry day if lead times has 0)
export function dueForParty(item: DueItem, leadTimes: LeadTimes): boolean {
  if (item.category === 'overdue') return true;
  if (item.category === 'unparseable' || item.daysRemaining == null) return false;
  return leadTimes.includes(item.daysRemaining);
}
