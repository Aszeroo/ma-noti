import { timingSafeEqual } from 'node:crypto';

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** ถอดค่า token จาก header `Authorization: Bearer <token>` (รปูแบบท่ี Vercel Cron สง่ มา) */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match?.[1] ?? null;
}

export interface SecretCheckResult {
  ok: boolean;
  reason?: 'not_configured' | 'missing' | 'mismatch';
}

/**
 * ตรวจ secret ของ endpoint cron — รับได้ทั้ง
 *   - `Authorization: Bearer <secret>`  (Vercel Cron ส่งอัตโนมัติเมื่ อตั้ ง CRON_SECRET)
 *   - `x-cron-secret: <secret>`         ( สำรองสำหรับคำขอจากที่อื่ น เช่น curl / GitHub Actions)
 * ไม่มี CRON_SECRET ตั้ งแต้ตั้นทาง server → ปฏเสธเสมอ (ok:false, 'not_configured')
 */
export function verifyCronSecret(
  headers: Headers,
  configuredSecret: string | undefined,
): SecretCheckResult {
  if (!configuredSecret) return { ok: false, reason: 'not_configured' };

  const candidates = [
    extractBearerToken(headers.get('authorization')),
    headers.get('x-cron-secret'),
  ].filter((token): token is string => Boolean(token));

  if (candidates.length === 0) return { ok: false, reason: 'missing' };
  if (candidates.some((token) => constantTimeEquals(token, configuredSecret))) {
    return { ok: true };
  }
  return { ok: false, reason: 'mismatch' };
}
