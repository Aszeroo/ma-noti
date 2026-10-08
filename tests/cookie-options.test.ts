import { describe, expect, it } from 'vitest';

import { toCookieInit } from '@/lib/supabase/cookie-options';

describe('toCookieInit — ปรับ cookie options ให Next รบั (adapter)', () => {
  it('ผาน field มาตรฐานครบ', () => {
    const expires = new Date('2026-10-08T12:00:00Z');
    expect(
      toCookieInit({ domain: '.example.com', expires, httpOnly: true, maxAge: 3600, path: '/', sameSite: 'lax', secure: true }),
    ).toEqual({ domain: '.example.com', expires, httpOnly: true, maxAge: 3600, path: '/', sameSite: 'lax', secure: true });
  });

  it('expires ที่ไมใ่ ช Date (epoch/สตริง) → ตัดทิง (guards ที่ types ไมอนุญาตแลว กน runtime แหلقๆ)', () => {
    expect(toCookieInit({ expires: 1_791_000_000_000 as unknown as Date }).expires).toBeUndefined();
    expect(toCookieInit({ expires: 'Fri, 09 Oct 2026 00:00:00 GMT' as unknown as Date }).expires).toBeUndefined();
  });

  it('sameSite ค่าแปลก (boolean/ไมร้ ู้จกั ) → ตัดทิงให Next ใช default', () => {
    expect(toCookieInit({ sameSite: true }).sameSite).toBeUndefined();
    expect(toCookieInit({ sameSite: 'none' }).sameSite).toBe('none');
    expect(toCookieInit({}).sameSite).toBeUndefined();
  });

  it('options วาง → object ว่างทก field (set default ไดโดยไม crash)', () => {
    expect(toCookieInit({})).toEqual({
      domain: undefined,
      expires: undefined,
      httpOnly: undefined,
      maxAge: undefined,
      path: undefined,
      sameSite: undefined,
      secure: undefined,
    });
  });
});
