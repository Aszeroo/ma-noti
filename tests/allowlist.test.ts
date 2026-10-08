import { describe, expect, it } from 'vitest';

import { isEmailAllowed, normalizeEmail } from '@/lib/auth/allowlist';

describe('normalizeEmail — มาตรฐานเดียวกกันทุกจุดตรวจ allowlist', () => {
  it('ตัง spacing + พมพเลก', () => {
    expect(normalizeEmail('  Somchai@Company.CO.TH ')).toBe('somchai@company.co.th');
  });

  it('วางเปนวาง', () => {
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail('   ')).toBe('');
  });
});

describe('isEmailAllowed — เชค allowlist (pure, fail-closed)', () => {
  const allowlist = ['Somchai@Company.co.th', 'ops-team@ma-noti.example.com'];

  it('ตรงกนั ไมขึ้ นกับตัวพิมพ/spacing', () => {
    expect(isEmailAllowed('  SOMCHAI@COMPANY.CO.TH ', allowlist)).toBe(true);
  });

  it('อีเมลนอก allowlist → false (คนนอกเขาไมได)', () => {
    expect(isEmailAllowed('intruder@example.com', allowlist)).toBe(false);
  });

  it('อีเมลวาง/spacing ล้วน → false เสมอ (fail-closed)', () => {
    expect(isEmailAllowed('', allowlist)).toBe(false);
    expect(isEmailAllowed('   ', allowlist)).toBe(false);
  });

  it('allowlist วาง → ใครก็ผานไมได', () => {
    expect(isEmailAllowed('somchai@company.co.th', [])).toBe(false);
  });
});
