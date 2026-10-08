/**
 * Allowlist (ตาราง public.allowed_emails) — pure helpers เท่านั้้ด
 * บานปรตูจรงิ อยู่ที่ lib/auth/guard.ts (ตรวจกบั ฐานข้อมลู) + app/auth/callback (fail-closed)
 */

/** normalize มาตรฐานเดียวกานทวทังระบบ — ตวพิมพเลก + ตัด spacing รอบขาง */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** จริง = อีเมลอยู่ใน allowlist (เทียบแบบ normalize แล้ว — fail-closed กับคาวาง) */
export function isEmailAllowed(email: string, allowedEmails: Iterable<string>): boolean {
  const target = normalizeEmail(email);
  if (target === '') return false;
  for (const candidate of allowedEmails) {
    if (normalizeEmail(candidate) === target) return true;
  }
  return false;
}
