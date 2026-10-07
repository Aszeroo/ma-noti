import { describe, expect, it } from 'vitest';

import { extractBearerToken, verifyCronSecret } from '@/lib/cron/verify-secret';

const SECRET = 'test-cron-secret-0123456789';

function headersWith(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe('extractBearerToken', () => {
  it('ถอด token จาก Authorization: Bearer (case-insensitive)', () => {
    expect(extractBearerToken(`Bearer ${SECRET}`)).toBe(SECRET);
    expect(extractBearerToken(`bearer ${SECRET}`)).toBe(SECRET);
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
  });
});

describe('verifyCronSecret — endpoint cron ต้องปฏิเสธคนนอก', () => {
  it('server ไม่ได้ตั้ง CRON_SECRET → ปฏิเสธเสมอแม้ token ตรง', () => {
    const result = verifyCronSecret(headersWith({ authorization: `Bearer ${SECRET}` }), undefined);
    expect(result).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('ไม่มี header secret เลย → missing', () => {
    const result = verifyCronSecret(new Headers(), SECRET);
    expect(result).toEqual({ ok: false, reason: 'missing' });
  });

  it('token ผิด → mismatch', () => {
    const result = verifyCronSecret(headersWith({ authorization: 'Bearer wrong-secret' }), SECRET);
    expect(result).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('Authorization: Bearer ถูก (รูปแบบ Vercel Cron) → ok', () => {
    expect(verifyCronSecret(headersWith({ authorization: `Bearer ${SECRET}` }), SECRET).ok).toBe(true);
  });

  it('x-cron-secret ถูก (สำรองสำหรับ curl/GitHub Actions) → ok', () => {
    expect(verifyCronSecret(headersWith({ 'x-cron-secret': SECRET }), SECRET).ok).toBe(true);
  });

  it('bearer ผิดแต่ x-cron-secret ถูก → ok (รับทั้งสองทาง)', () => {
    const headers = headersWith({ authorization: 'Bearer wrong', 'x-cron-secret': SECRET });
    expect(verifyCronSecret(headers, SECRET).ok).toBe(true);
  });
});
