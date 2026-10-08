// lib/notifiers/index.ts — ทะเบียนผู้ส่ง 3 ช่องทาง + โรงงานสร้าง (ticket #10)
// เพิ่ มช่องทางใหมตามสเปก = เขียน implementation เดียว แลวเพิ่มคีย์ใน factory นี
// (email = Brevo, discord = Incoming Webhook, telegram = Bot API)

import { createDiscordNotifier } from '@/lib/notifiers/discord';
import { createEmailNotifier } from '@/lib/notifiers/email';
import { createTelegramNotifier } from '@/lib/notifiers/telegram';
import type { Notifier, NotifierOptions } from '@/lib/notifiers/types';

export type { FetchLike, EnvSource, Notifier, NotifierOptions } from '@/lib/notifiers/types';
export { createEmailNotifier, emailSubject, BREVO_SMTP_ENDPOINT } from '@/lib/notifiers/email';
export { telegramEndpoint } from '@/lib/notifiers/telegram';

/** Notifier ครบทุกช่องทาง (DeliveryChannelType) — keys ตรงกับ channel type ใน domain */
export interface NotifierRegistry {
  email: Notifier;
  discord: Notifier;
  telegram: Notifier;
}

/**
 * สร้างผู้ส่งทัง 3 ตัว — env อ่านตอน "ยิงจริง" เท่านั้ น (send()) จิง stubEnv ในเทสได
 * fetchImpl = ฉลากปลอมสำหรับเทส (จบั payload ทัง 3 สัญญา) โดยไมแตะเครอข่าย
 */
export function createNotifiers(options: NotifierOptions = {}): NotifierRegistry {
  return {
    email: createEmailNotifier(options),
    discord: createDiscordNotifier(options),
    telegram: createTelegramNotifier(options),
  };
}
