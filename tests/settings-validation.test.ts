import { describe, expect, it } from 'vitest';

import {
  EXPIRY_DAY_PARTIES,
  SETTINGS_PARTIES,
  isExpiryParty,
  parseSettingsForm,
  validateLeadTimesList,
  validatePartyLeadTimes,
  validateSendTime,
  validateTimezone,
} from '@/lib/settings/validation';

/** fixture FormData ครบถุกฟิดล์ถุกต้อง — เพิ่่ม/แก้รายตวัไดตามเคส */
function validFormData(): FormData {
  const formData = new FormData();
  formData.set('sales', '30,14,7,3,1,0');
  formData.set('product_buddy', '30,14,7,3,1,0');
  formData.set('quoting', '60,45,30');
  formData.set('send_time', '08:00');
  formData.set('timezone', 'Asia/Bangkok');
  return formData;
}

describe('parseSettingsForm — ตรวจ FormData ทงัฟอรม์ (fail-fast)', () => {
  it('ฟอรม์ครบถุกต้อง → คืนค่าพรอม upsert (snake_case ตรงคอลัมน DB)', () => {
    expect(parseSettingsForm(validFormData())).toEqual({
      ok: true,
      value: {
        lead_times: {
          sales: [0, 1, 3, 7, 14, 30],
          product_buddy: [0, 1, 3, 7, 14, 30],
          quoting: [30, 45, 60],
        },
        send_time: '08:00',
        timezone: 'Asia/Bangkok',
      },
    });
  });

  it('ฟอรม์วา่ง (ไมมี field) → invalid_lead_times ที่ sales กอน', () => {
    const result = parseSettingsForm(new FormData());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_lead_times');
  });

  it('quoting มี 0 (วันหมดอายุ) → invalid_lead_times', () => {
    const formData = validFormData();
    formData.set('quoting', '60,45,30,0');
    const result = parseSettingsForm(formData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_lead_times');
  });

  it('send_time ผิดรูปแบบ → invalid_send_time', () => {
    const formData = validFormData();
    formData.set('send_time', '25:00');
    const result = parseSettingsForm(formData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_send_time');
  });

  it('timezone วา่ง → invalid_timezone', () => {
    const formData = validFormData();
    formData.set('timezone', '   ');
    const result = parseSettingsForm(formData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_timezone');
  });
});

/** ตัวอย่า่งทักข้อมูลในไฟลน์ี้เป็น fixture ปลอมเท่านั้น — ไม่แตะ DB / network */

describe('validateLeadTimesList — ลิสต์รอบเตือนทั่วไป', () => {
  it('จำนวนเต็ม ≥ 0 คั่นด้วย comma → ผ่าน + เรียง ascending', () => {
    expect(validateLeadTimesList('30,14,7,3,1')).toEqual({
      ok: true,
      value: [1, 3, 7, 14, 30],
    });
  });

  it('ค่าเริ่มต้นตามสเปกทีมขาย (มี 0 = วันหมดอายุ) → ผ่าน', () => {
    expect(validateLeadTimesList('30,14,7,3,1,0').ok).toBe(true);
    expect(validateLeadTimesList('0,1,3,7,14,30')).toEqual({
      ok: true,
      value: [0, 1, 3, 7, 14, 30],
    });
  });

  it('trailing comma อนุญาต (ข้าม token ว่าง)', () => {
    expect(validateLeadTimesList('30,14,7,3,1,')).toEqual({
      ok: true,
      value: [1, 3, 7, 14, 30],
    });
  });

  it('spacing รอบค่าอนุญาต', () => {
    expect(validateLeadTimesList(' 60 , 45 , 30 ')).toEqual({
      ok: true,
      value: [30, 45, 60],
    });
  });

  it('ว่าง / spacing ล้วน → invalid_lead_times', () => {
    const empty = validateLeadTimesList('');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe('invalid_lead_times');
    const blank = validateLeadTimesList('   ');
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.code).toBe('invalid_lead_times');
  });

  it('ไม่ใช่จำนวนเต็ม (ตัวอักษร / ทศนิยม / ค่าลบ) → invalid_lead_times', () => {
    for (const raw of ['30,abc', '7.5,14', '-5,14', '30,14x']) {
      const result = validateLeadTimesList(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('invalid_lead_times');
    }
  });

  it('ค่าซ้ำ → invalid_lead_times', () => {
    const result = validateLeadTimesList('30,14,14,7');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_lead_times');
  });
});

describe('validatePartyLeadTimes — 0 (วันหมดอายุ) อนุญาตเฉพาะบางฝ่าย', () => {
  it('Sales / Product Buddy อนุญาต 0', () => {
    for (const party of EXPIRY_DAY_PARTIES) {
      expect(validatePartyLeadTimes(party, '30,14,7,3,1,0').ok).toBe(true);
    }
  });

  it('Quoting Team มี 0 → invalid_lead_times', () => {
    const result = validatePartyLeadTimes('quoting', '60,45,30,0');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_lead_times');
  });

  it('Quoting Team ค่าเริ่มต้นตามสเปก 60/45/30 → ผ่าน', () => {
    expect(validatePartyLeadTimes('quoting', '60,45,30')).toEqual({
      ok: true,
      value: [30, 45, 60],
    });
  });

  it('ทุก party ใน SETTINGS_PARTIES สืบทอด error จากรายการทั่วไป', () => {
    for (const party of SETTINGS_PARTIES) {
      const result = validatePartyLeadTimes(party, '30,30');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('invalid_lead_times');
    }
  });

  it('isExpiryParty — sales/product_buddy จริง, quoting เท็จ', () => {
    expect(isExpiryParty('sales')).toBe(true);
    expect(isExpiryParty('product_buddy')).toBe(true);
    expect(isExpiryParty('quoting')).toBe(false);
  });
});

describe('validateSendTime — เวลาส่ง HH:mm', () => {
  it('รูปแบบถูกต้อง (รวมค่าสุดขั้ว 00:00 และ 23:59) → ผ่าน', () => {
    expect(validateSendTime('08:00')).toEqual({ ok: true, value: '08:00' });
    expect(validateSendTime('00:00').ok).toBe(true);
    expect(validateSendTime('23:59').ok).toBe(true);
  });

  it('trim spacing รอบข้างก่อนตรวจ', () => {
    expect(validateSendTime('  08:00  ')).toEqual({ ok: true, value: '08:00' });
  });

  it('ว่าง → invalid_send_time', () => {
    const result = validateSendTime('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_send_time');
  });

  it('รูปแบบผิด (1 หลัก / ไม่มี colon / มีวินาที) → invalid_send_time', () => {
    for (const raw of ['8:00', '0800', '08:00:00', '08.00']) {
      const result = validateSendTime(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('invalid_send_time');
    }
  });

  it('ชั่วโมงเกิน 23 / นาทีเกิน 59 → invalid_send_time', () => {
    for (const raw of ['24:00', '25:00', '08:60', '99:99']) {
      const result = validateSendTime(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('invalid_send_time');
    }
  });
});

describe('validateTimezone — timezone ไม่ว่าง', () => {
  it('ค่าไม่ว่าง (trim) → ผ่าน', () => {
    expect(validateTimezone('  Asia/Bangkok  ')).toEqual({
      ok: true,
      value: 'Asia/Bangkok',
    });
  });

  it('ว่าง / spacing ล้วน → invalid_timezone', () => {
    for (const raw of ['', '   ']) {
      const result = validateTimezone(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('invalid_timezone');
    }
  });
});
