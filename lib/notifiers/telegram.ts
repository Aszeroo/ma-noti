// lib/notifiers/telegram.ts — ผู้ส่ง Telegram ผ่าน Bot API (ticket #10)
// สัญญา payload (core.telegram.org/bots/api#sendmessage):
//   POST https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage
//   content-type: application/json
//   body { chat_id, text, parse_mode: "Markdown" }
// token มาจาก env เท่านั้้น (บน Vercel) — chat_id มาจาก contact ของผู้รบั ในตาราง channels

import { createNotifier, postJson } from '@/lib/notifiers/http';
import type { Notifier, NotifierOptions } from '@/lib/notifiers/types';

export function telegramEndpoint(token: string): string {
  return `https://api.telegram.org/bot${token}/sendMessage`;
}

export function createTelegramNotifier(options: NotifierOptions = {}): Notifier {
  return createNotifier(options, async ({ env, fetch }, delivery, message) => {
    const token = (env.TELEGRAM_BOT_TOKEN ?? '').trim();
    if (token === '') {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured — see docs/setup-senders.md');
    }
    const chatId = delivery.contact.trim();
    if (chatId === '') throw new Error('telegram: chat id is empty — add a telegram channel for this person');

    const result = await postJson(fetch, {
      label: 'telegram',
      url: telegramEndpoint(token),
      payload: { chat_id: chatId, text: message, parse_mode: 'Markdown' },
    });

    // บางกรณี Telegram ตอบ 200 พรอม ok:false — ตรวจซ้ำกัน status หลอก
    if (result !== null && typeof result === 'object' && (result as { ok?: unknown }).ok === false) {
      const description = (result as { description?: unknown }).description;
      throw new Error(`telegram rejected the message: ${String(description ?? 'ok=false')}`);
    }
  });
}
