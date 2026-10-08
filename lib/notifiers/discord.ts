// lib/notifiers/discord.ts — ผู้ส่ง Discord ผ่าน Incoming Webhook (ticket #10)
// สัญญา payload (discord.com/developers/docs/resources/webhook):
//   POST <webhook URL = contact ของช่องทางในตาราง channels>
//   content-type: application/json
//   body { embeds: [{ title, fields:[{name,value,inline}], footer:{text} }] }
// ไม่มี env ของ Discord: ลิงก์ webhook เก็บเป็น contact ของผู้รับ (หน้าง้าจัดการผู้รับ)
// renderDiscord คืน JSON string ของ { embeds: [...] } อยู่แล้ว — ตรวจรูปทรงก่่อนยิง

import type { RenderedMessage } from '@/lib/domain/types';
import { createNotifier, postJson } from '@/lib/notifiers/http';
import type { Notifier, NotifierOptions } from '@/lib/notifiers/types';

/** payload ที่ Discord รบรับ = ต้องมี `embeds` เป็น array อย่างน้อย 1 embed */
export interface DiscordPayload {
  embeds: unknown[];
}

/** แปลง output ของ renderDiscord (JSON string) เป็น payload — กันส่ง body ว่างไปทัก webhook */
export function parseDiscordPayload(message: RenderedMessage): DiscordPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message) as unknown;
  } catch {
    throw new Error('discord: rendered message is not a JSON embed payload');
  }
  const embeds = (parsed as { embeds?: unknown }).embeds;
  if (!Array.isArray(embeds) || embeds.length === 0) {
    throw new Error('discord: payload must contain a non-empty embeds array');
  }
  return { embeds };
}

export function createDiscordNotifier(options: NotifierOptions = {}): Notifier {
  return createNotifier(options, async ({ fetch }, delivery, message) => {
    const webhookUrl = delivery.contact.trim();
    if (webhookUrl === '') {
      throw new Error('discord: webhook url is empty — add a discord channel for this person');
    }
    const payload = parseDiscordPayload(message);

    // Discord ตอบ 204 No Content เมื่ อสำเร็จ (postJson ยอมรบับ 2xx ที่ body ว่าง)
    await postJson(fetch, { label: 'discord', url: webhookUrl, payload });
  });
}
