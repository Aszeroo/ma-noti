/**
 * ตรวจความถูกต้องของข้อมูลหน้าตั้้งค่า (ticket #9) — pure helpers เท่านั้น
 * ไม่มี I/O: server actions ใน lib/settings/actions.ts เปนคนอ่าน FormData แล้วเรียกฟังก์ชันพวกนี้
 * ข้อความ error เป็นภาษาไทยสำหรับแสดงบนหน้าเว็บ (มาตรฐานเดียวกับหน้า login/recipients)
 * glossary: "รอบเตือน (Lead Times)", "ฝ่าย (Party)", "เวลาส่ง"
 */

export type SettingsParty = 'sales' | 'product_buddy' | 'quoting';

/** 3 ฝ่ายตามสเปก — ตรงกับ keys ของ lead_times jsonb ในตาราง settings */
export const SETTINGS_PARTIES: readonly SettingsParty[] = ['sales', 'product_buddy', 'quoting'];

/** 0 = "วันหมดอายุ" — ฝ่ายที่อนุญาต (sales + product_buddy); quoting ไม่อนุญาต */
export const EXPIRY_DAY_PARTIES: readonly SettingsParty[] = ['sales', 'product_buddy'];

export type ValidationErrorCode =
  | 'invalid_lead_times'
  | 'invalid_send_time'
  | 'invalid_timezone';

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; code: ValidationErrorCode; error: string };

/** ป้าย UI ของแต่ละฝ่าย (glossary: Sales / Product Buddy / Quoting Team) */
export const SETTINGS_PARTY_LABEL: Record<SettingsParty, string> = {
  sales: 'Sales',
  product_buddy: 'Product Buddy',
  quoting: 'Quoting Team',
};

/** ฝ่ายที่ 0 (วันหมดอายุ) อนุญาตใน lead_times */
export function isExpiryParty(party: SettingsParty): boolean {
  return EXPIRY_DAY_PARTIES.includes(party);
}

/**
 * ลิสต์รอบเตือนทั่วไป (ไม่เฉพาะฝ่าย) — raw comma-separated จาก <input> เช่น "30,14,7,3,1"
 * - token ว่าง (จาก trailing comma) = ข้าม ไม่แสดง error — อนุญาต "30,14,7,3,1,"
 * - แต่ละ token: ^\d+$ เท่านั้น — non-negative integer, ไม่มีทศนิยม/ลบ
 * - ไม่ซ้ำ — ค่านับ ascending แล้ว compare length ของ list กับ unique
 * (reorder ascending — config loader toLeadTimes ทำ same)
 */
export function validateLeadTimesList(raw: string): Validated<number[]> {
  const tokens = raw
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token !== '');

  if (tokens.length === 0) {
    return {
      ok: false,
      code: 'invalid_lead_times',
      error: 'กรุณากรอกรอบเตือน (เช่น 30,14,7,3,1)',
    };
  }

  for (const token of tokens) {
    if (/^\d+$/.test(token)) continue;
    return {
      ok: false,
      code: 'invalid_lead_times',
      error:
        'รอบเตือนต้องเป็นจำนวนเต็ม ≥ 0 คั่นด้วย comma (เช่น 30,14,7,3,1) — ' +
        'ไม่ต้องการตัวอักษร/ทศนิยม/ค่าติดลบ',
    };
  }

  const days = [...new Set(tokens.map((token) => Number(token)))].sort((a, b) => a - b);
  if (tokens.length > days.length) {
    return {
      ok: false,
      code: 'invalid_lead_times',
      error: 'รอบเตือนต้องไม่ซ้ำกัน (แต่ละค่ามีหนึ่งครั้งในลิสต์)',
    };
  }

  return { ok: true, value: days };
}

/**
 * ตรวจ lead_times เฉพาะฝ่าย — ลิสต์ทั่วไป + วันหมดอายุ:
 * - sales / product_buddy: 0 (วันหมดอายุ) อนุญาต (optional — not required)
 * - quoting: ไม่ต้องการ 0 (วันหมดอายุ) — ถ้ามี 0 = error
 * (สเปก: Sales/Product Buddy = 30/14/7/3/1 + วันหมดอายุ; Quoting Team = 60/45/30)
 */
export function validatePartyLeadTimes(party: SettingsParty, raw: string): Validated<number[]> {
  const list = validateLeadTimesList(raw);
  if (!list.ok) return list;

  if (list.value.some((n) => n === 0) && !isExpiryParty(party)) {
    return {
      ok: false,
      code: 'invalid_lead_times',
      error:
        'ฝ่ายนี้ไม่ต้องมี 0 (วันหมดอายุ) — 0 = วันหมดอายุ อนุญาต ' +
        'เฉพาะ Sales / Product Buddy',
    };
  }

  return list;
}

/**
 * send_time = HH:mm (2 หลัก : 2 หลัก) — เช่น 08:00 ตามแบบ Asia/Bangkok
 * (default "08:00" ในตาราง settings) — hour 00–23 และ minute 00–59
 */
const SEND_TIME_HHMM = /^\d{2}:\d{2}$/;

export function validateSendTime(raw: string): Validated<string> {
  const time = raw.trim();
  if (time === '') {
    return {
      ok: false,
      code: 'invalid_send_time',
      error: 'กรุณากรอกเวลาส่ง (HH:mm เช่น 08:00)',
    };
  }
  if (!SEND_TIME_HHMM.test(time)) {
    return {
      ok: false,
      code: 'invalid_send_time',
      error: 'รูปแบบเวลาส่งต้องเป็น HH:mm (2 หลัก : 2 หลัก) เช่น 08:00',
    };
  }
  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) {
    return {
      ok: false,
      code: 'invalid_send_time',
      error: 'HH:mm ต้องมี hour 00–23 และ minute 00–59 (เช่น 08:00)',
    };
  }
  return { ok: true, value: time };
}

/** timezone = ขอความไม่ว่าง (trim) — เช่น "Asia/Bangkok" ตาม default ในตาราง settings */
export function validateTimezone(raw: string): Validated<string> {
  const timezone = raw.trim();
  if (timezone === '') {
    return {
      ok: false,
      code: 'invalid_timezone',
      error: 'กรุณากรอก timezone (เช่น Asia/Bangkok)',
    };
  }
  return { ok: true, value: timezone };
}

/** ค่าที่ตรวจแล้ว — พร้อม upsert ลงตาราง settings (key = ชือคอลัมน์ DB) */
export type SettingsFormValues = {
  lead_times: Record<SettingsParty, number[]>;
  send_time: string;
  timezone: string;
};

/** อ่าน field จาก FormData เป็น string ว่างเมื่อไม่พบ (กัน undefined ปนใน validate) */
function fieldValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '');
}

/**
 * ตรวจ FormData ทั้งฟอร์มของหน้า settings (pure — ไม่มี I/O)
 * คืนค่าแรกที่ไม่ผ่าน (fail-fast ตามลำดับ ฝ่าย → send_time → timezone)
 * หรือค่าที่ตรวจแล้วสำหรับ actions.ts upsert ลง DB
 */
export function parseSettingsForm(
  formData: FormData,
): Validated<SettingsFormValues> {
  const leadTimes = {} as Record<SettingsParty, number[]>;
  for (const party of SETTINGS_PARTIES) {
    const result = validatePartyLeadTimes(party, fieldValue(formData, party));
    if (!result.ok) {
      return result;
    }
    leadTimes[party] = result.value;
  }

  const sendTime = validateSendTime(fieldValue(formData, 'send_time'));
  if (!sendTime.ok) {
    return sendTime;
  }

  const timezone = validateTimezone(fieldValue(formData, 'timezone'));
  if (!timezone.ok) {
    return timezone;
  }

  return {
    ok: true,
    value: {
      lead_times: leadTimes,
      send_time: sendTime.value,
      timezone: timezone.value,
    },
  };
}
