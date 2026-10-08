// lib/domain/renewal-rounds.ts — state machine ของรอบการต่ออายุ (ticket #4)
// STUB (ตาม ADR 0001 / สเปก — ก่อนคอลัมน์สถานะจริง):
//   ทุก Renewal Item ถือว่าอยู่รอบ 1 ยังไม่จบ — implementation จริง (อ่าน 4
//   คอลัมน์สถานะ) สลับในไฟล์เดียวโดยไมแตะส่วนอื่น
//
//   ROUND_STATUSES = ['', 'รอขอใบราคา', 'กำลังดำเนินการ', 'ต่อแล้ว']
//   currentRound(stub) = {n:1, done:false} (ทุก Item = 1 ยังไม่จบ)
//   roundDone(stub) = false
import type { RoundStatus } from '@/lib/domain/types';

export const ROUND_STATUSES: RoundStatus[] = ['', 'รอขอใบราคา', 'กำลังดำเนินการ', 'ต่อแล้ว'];

export interface RenewalRound {
  n: 1 | 2 | 3 | 4;
  status: RoundStatus;
  done: boolean;
}

/** STUB — ทุก Item อยู่รอบ 1 = ยังไม่จบ (done=false) */
export function currentRoundStubs(statuses: RoundStatus[]): RenewalRound {
  return { n: 1, status: statuses[0] ?? '', done: false };
}

/** STUB — ทุก Item = ไมจบ */
export function roundDoneStubs(round: RenewalRound): boolean {
  return round.done;
}
