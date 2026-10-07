import { describe, expect, it } from 'vitest';

import { resolveSendMode } from '@/lib/config/send-mode';

describe('resolveSendMode — การตัดสิ นใจ "ส่งหรือไม่ส่ง" อยู่นอกท่อ (จาก env DRY_RUN)', () => {
  it('ค่าเริ่มต้น (ไม่ได้ตั้ง env) ต้องเป็น dry_run เสมอ', () => {
    expect(resolveSendMode(undefined)).toBe('dry_run');
    expect(resolveSendMode('')).toBe('dry_run');
    expect(resolveSendMode('   ')).toBe('dry_run');
  });

  it('รับ true แบบต่าง ๆ แล้วเป็น dry_run', () => {
    for (const raw of ['true', 'TRUE', ' True ', 'yes', '1']) {
      expect(resolveSendMode(raw)).toBe('dry_run');
    }
  });

  it('ปิด DRY_RUN ได้อย่างจงใจด้วย false/0/off', () => {
    for (const raw of ['false', 'FALSE', ' false ', '0', 'off']) {
      expect(resolveSendMode(raw)).toBe('send');
    }
  });

  it('ค่าแปลก ๆ (safe default) ต้องไม่ทำให้เผลอส่งจริง', () => {
    for (const raw of ['garbage', 'no', 'fals', '2']) {
      expect(resolveSendMode(raw)).toBe('dry_run');
    }
  });
});
