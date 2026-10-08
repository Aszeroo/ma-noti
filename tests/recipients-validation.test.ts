import { describe, expect, it } from 'vitest';

import {
  isChannelType,
  isUuid,
  validateChannelContact,
  validateChannelInput,
  validatePersonName,
} from '@/lib/recipients/validation';

/** ตัวอย่างทักข้อมูลในไฟลน์ี้เป็น fixture ปลอมเท่านั้น — ห้ามใส่ contact จรงิ ลง repo */

describe('validatePersonName — ชื่ออผู้รับต้องไม่ว่าง', () => {
  it('trim spacing รอบข้างก่อนเก็บบันทึก', () => {
    const result = validatePersonName('  สมชาย ทีมขาย  ');
    expect(result).toEqual({ ok: true, value: 'สมชาย ทีมขาย' });
  });

  it('ว่าง/spacing ล้วน → error ภาษาไทย', () => {
    expect(validatePersonName('')).toEqual({ ok: false, code: 'invalid_name', error: 'กรุณากรอกชื่อผู้รับ' });
    expect(validatePersonName('   ')).toEqual({ ok: false, code: 'invalid_name', error: 'กรุณากรอกชื่อผู้รับ' });
  });

  it('ยาวเกิน 100 ตัวอักษร → error', () => {
    const result = validatePersonName('ก'.repeat(101));
    expect(result.ok).toBe(false);
  });

  it('ยาว 100 ตัวอักษรพอดี → ผ่าน', () => {
    expect(validatePersonName('ก'.repeat(100)).ok).toBe(true);
  });
});

describe('validateChannelContact — อีเมล', () => {
  it('รับอีเมลถูกต้อง + normalize เป็นพิมพ์เล็ก (reuse lib/auth/allowlist)', () => {
    const result = validateChannelContact('email', '  Somchai@Team.Example  ');
    expect(result).toEqual({ ok: true, value: 'somchai@team.example' });
  });

  it('ไม่มี @ / มีช่องว่างกลางข้อความ → error', () => {
    expect(validateChannelContact('email', 'somchai.team.example').ok).toBe(false);
    expect(validateChannelContact('email', 'som chai@team.example').ok).toBe(false);
  });

  it('ว่าง → error "กรุณากรอกอีเมล"', () => {
    expect(validateChannelContact('email', '  ')).toEqual({
      ok: false,
      code: 'invalid_contact',
      error: 'กรุณากรอกอีเมล',
    });
  });
});

describe('validateChannelContact — Discord webhook', () => {
  const fakeWebhook = 'https://discord.com/api/webhooks/1234567890123456789/FakeToken-_abc123';

  it('รับ webhook URL shape จริง (รวม canary/ptb/discordapp เก่า)', () => {
    expect(validateChannelContact('discord', fakeWebhook)).toEqual({
      ok: true,
      value: fakeWebhook,
    });
    expect(
      validateChannelContact('discord', 'https://ptb.discord.com/api/webhooks/1/a').ok,
    ).toBe(true);
    expect(
      validateChannelContact('discord', 'https://discordapp.com/api/webhooks/123/abc').ok,
    ).toBe(true);
  });

  it('ปฏิเสธ http ไม่มี /api/webhooks/ และคนละโดเมน', () => {
    expect(validateChannelContact('discord', 'http://discord.com/api/webhooks/1/a').ok).toBe(
      false,
    );
    expect(validateChannelContact('discord', 'https://evil.example/api/webhooks/1/a').ok).toBe(
      false,
    );
    expect(validateChannelContact('discord', 'https://discord.com/webhooks/1/a').ok).toBe(false);
  });

  it('ว่าง → error "กรุณากรอก Discord webhook URL"', () => {
    expect(validateChannelContact('discord', '')).toEqual({
      ok: false,
      code: 'invalid_contact',
      error: 'กรุณากรอก Discord webhook URL',
    });
  });
});

describe('validateChannelContact — Telegram chat id', () => {
  it('รับ id เลขล้วน ทั้งผู้ใช้ทั่วไปและกลุ่ม (- นำหน้า)', () => {
    expect(validateChannelContact('telegram', '123456789')).toEqual({
      ok: true,
      value: '123456789',
    });
    expect(validateChannelContact('telegram', ' -1001234567890 ')).toEqual({
      ok: true,
      value: '-1001234567890',
    });
  });

  it('ปฏิเสธ 0 / เลขนำหน้าศูนย์ / ตัวอักษร / ทศนิยม', () => {
    expect(validateChannelContact('telegram', '0').ok).toBe(false);
    expect(validateChannelContact('telegram', '007').ok).toBe(false);
    expect(validateChannelContact('telegram', 'abc').ok).toBe(false);
    expect(validateChannelContact('telegram', '12.5').ok).toBe(false);
    expect(validateChannelContact('telegram', '@teamchannel').ok).toBe(false);
  });

  it('ว่าง → error "กรุณากรอก Telegram chat id"', () => {
    expect(validateChannelContact('telegram', '   ')).toEqual({
      ok: false,
      code: 'invalid_contact',
      error: 'กรุณากรอก Telegram chat id',
    });
  });
});

describe('isChannelType — กรอง type จาก <select>', () => {
  it('รับสามประเภทตามสเปกเท่านั้น', () => {
    expect(isChannelType('email')).toBe(true);
    expect(isChannelType('discord')).toBe(true);
    expect(isChannelType('telegram')).toBe(true);
    expect(isChannelType('sms')).toBe(false);
    expect(isChannelType('')).toBe(false);
  });
});

describe('validateChannelInput — ตรวจคู่ (type, contact) จากฟอร์มเดียว', () => {
  it('type ถูกรูปแบบ + contact พอดี → คืนทั้งคู่แบบ normalize', () => {
    expect(validateChannelInput('email', 'Someone@Team.Example')).toEqual({
      ok: true,
      value: { type: 'email', contact: 'someone@team.example' },
    });
  });

  it('type ปลอม → error "ประเภทช่องทางไม่ถูกต้อง" ไม่เช็ค contact ต่อ', () => {
    expect(validateChannelInput('LINE', 'abc')).toEqual({
      ok: false,
      code: 'invalid_type',
      error: 'ประเภทช่องทางไม่ถูกต้อง',
    });
  });

  it('type ถูกแต่ contact ผิดรูป → error ของประเภทนั้น', () => {
    const result = validateChannelInput('telegram', 'not-a-number');
    expect(result.ok).toBe(false);
  });
});

describe('isUuid — กรอง id จาก hidden input ก่อนแตะ DB', () => {
  it('รับ UUID มาตรฐานเท่านั้น', () => {
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
    expect(isUuid('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c330')).toBe(false);
  });
});
