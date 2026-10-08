/**
 * ตรวจความถูกต้องของข้อมูลผู้รับ/ช่องทาง (ticket #7) — pure helpers เท่านั้น
 * ไม่มี I/O: server actions ใน lib/recipients/actions.ts เป็นคนอ่าน FormData แล้วเรียกฟังก์ชันพวกนี้
 * ข้อความ error เป็นภาษาไทยสำหรับแสดงบนหน้าเว็บ (มาตรฐานเดียวกับหน้า login)
 */

import { normalizeEmail } from '@/lib/auth/allowlist';

export type ChannelType = 'email' | 'discord' | 'telegram';

/** ประเภทช่องทางที่ระบบรองรับ — ตรงกับ check constraint ในตาราง channels */
export const CHANNEL_TYPES: readonly ChannelType[] = ['email', 'discord', 'telegram'];

/** ประเภทความผิดที่หน้าเว็บแสดงแยกันได้ (ตรงกับ searchParam key บน URL) */
export type ValidationErrorCode = 'invalid_name' | 'invalid_type' | 'invalid_contact';

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; code: ValidationErrorCode; error: string };

/** ชื่อคนยาวสุดที่ยอมรับ (กันช่องกรอกถูกใช้ผิด ไม่ใช่ rule ทางธุรกิจ) */
export const MAX_PERSON_NAME_LENGTH = 100;

/** raw จาก <select> เป็น string ได้ทุกค่า — ต้องกรองก่อนเชื่อว่าเป็น ChannelType */
export function isChannelType(raw: string): raw is ChannelType {
  return (CHANNEL_TYPES as readonly string[]).includes(raw);
}

/** UUID ของ Supabase — ใช้กรอง id ที่หลุดมาจาก hidden input ก่อนส่งเข้า DB */
export function isUuid(raw: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(raw);
}

/** ชื่อผู้รับ: ต้องไม่ว่างหลังตัด spacing รอบข้าง และยาวไม่เกินกำหนด — คืนค่าที่ trim แล้ว */
export function validatePersonName(raw: string): Validated<string> {
  const name = raw.trim();
  if (name === '') {
    return { ok: false, code: 'invalid_name', error: 'กรุณากรอกชื่อผู้รับ' };
  }
  if (name.length > MAX_PERSON_NAME_LENGTH) {
    return {
      ok: false,
      code: 'invalid_name',
      error: `ชื่อยาวเกินไป (ต้องไม่เกิน ${MAX_PERSON_NAME_LENGTH} ตัวอักษร)`,
    };
  }
  return { ok: true, value: name };
}

/** รูปแบบอีเมลอย่างง่าย — ใช้งานภายในทีม ไม่ต้องรองรับ RFC 5322 ทั้งฉบับ */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Discord webhook URL — up to shape ที่ Discord ออกให้จริง
 * อนุญาต canary/ptb environment และโดเมนเก่า discordapp.com ด้วย
 */
const DISCORD_WEBHOOK_PATTERN =
  /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

/**
 * Telegram chat id — ตัวเลขล้วน อาจมี - นำหน้าสำหรับกลุ่ม/แชนแนล (เช่น -100xxxxxxxxxx)
 * ไม่รับ 0, เลขนำหน้าศูนย์ และทศนิยม เพราะ Telegram ไม่เคยออก id ลักษณะนั้น
 */
const TELEGRAM_CHAT_ID_PATTERN = /^-?[1-9][0-9]*$/;

/** ตรวจ contact ตามประเภทช่องทาง — คืนค่า contact ที่ normalize แล้ว (อีเมล:พิมพ์เล็ก+trim ตาม lib/auth/allowlist) */
export function validateChannelContact(type: ChannelType, raw: string): Validated<string> {
  switch (type) {
    case 'email': {
      const email = normalizeEmail(raw);
      if (email === '') {
        return { ok: false, code: 'invalid_contact', error: 'กรุณากรอกอีเมล' };
      }
      if (!EMAIL_PATTERN.test(email)) {
        return { ok: false, code: 'invalid_contact', error: 'รูปแบบอีเมลไม่ถูกต้อง (ตัวอย่าง: someone@team.example)' };
      }
      return { ok: true, value: email };
    }
    case 'discord': {
      const url = raw.trim();
      if (url === '') {
        return { ok: false, code: 'invalid_contact', error: 'กรุณากรอก Discord webhook URL' };
      }
      if (!DISCORD_WEBHOOK_PATTERN.test(url)) {
        return {
          ok: false,
          code: 'invalid_contact',
          error:
            'ลิงก์ Discord webhook ไม่ถูกต้อง ต้องขึ้นต้นด้วย https://discord.com/api/webhooks/…',
        };
      }
      return { ok: true, value: url };
    }
    case 'telegram': {
      const chatId = raw.trim();
      if (chatId === '') {
        return { ok: false, code: 'invalid_contact', error: 'กรุณากรอก Telegram chat id' };
      }
      if (!TELEGRAM_CHAT_ID_PATTERN.test(chatId)) {
        return {
          ok: false,
          code: 'invalid_contact',
          error: 'Telegram chat id ต้องเป็นเลขจำนวนเต็ม (มี - นำหน้าได้สำหรับกลุ่ม/แชนแนล)',
        };
      }
      return { ok: true, value: chatId };
    }
  }
}

/**
 * ตรวจคู่ (type, contact) จากฟอร์มเดียว — สำหรับฟอร์มเพิ่ม/แก้ไขช่องทางที่ส่งทั้งสอง field มาพร้อมกัน
 * type ผิด → error แยกจาก contact ผิด เพื่อให้ UX ชี้ได้ตรงจุด
 */
export function validateChannelInput(
  rawType: string,
  rawContact: string,
): Validated<{ type: ChannelType; contact: string }> {
  if (!isChannelType(rawType)) {
    return { ok: false, code: 'invalid_type', error: 'ประเภทช่องทางไม่ถูกต้อง' };
  }
  const contact = validateChannelContact(rawType, rawContact);
  return contact.ok ? { ok: true, value: { type: rawType, contact: contact.value } } : contact;
}
