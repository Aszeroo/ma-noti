export type SendMode = 'dry_run' | 'send';

/**
 * ค่า env ที่ถือว่า "ปิด DRY_RUN" อย่างจงใจ — นอกเหนือจากนี้ (รวมค่าว่าง/ค่าแปลก ๆ/ไม่ได้ตั้ง)
 * ถือนับเป็น DRY_RUN ทั้งหมด = safe default ไม่ส่งของจริง
 */
const SEND_VALUES = new Set(['false', '0', 'off']);

/**
 * การตัดสินใจ "ส่งหรือไม่ส่ง" อยู่ นอกท่ อรัน (domain ไม่รู้จัก DRY_RUN) —
 * shell ของ cron เรียกฟังก์ชันนี้แล้วส่งผลลัพธ์ (SendMode) เข้าท่อให้ pipeline ทราบเท่านั้น
 */
export function resolveSendMode(raw: string | undefined): SendMode {
  if (raw === undefined) return 'dry_run';
  const value = raw.trim().toLowerCase();
  if (value === '') return 'dry_run';
  return SEND_VALUES.has(value) ? 'send' : 'dry_run';
}
