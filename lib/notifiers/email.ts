// lib/notifiers/email.ts — ผู้ส่งอีเมลผ่าน Brevo API v3 (ticket #10)
// สัญญา payload (developers.brevo.com/reference/send-transac-email):
//   POST https://api.brevo.com/v3/smtp/email
//   header `api-key: <BREVO_API_KEY>` + content-type/accept json
//   body   { sender:{name,email}, to:[{email,name}], subject, htmlContent }
// ข้อความ = output ของ renderEmail (HTML ตาราง) — ส่งลง htmlContent โดยไม่แก้เนื้อหา
// sender ต้องผ่านการยืนยันใน Brevo ก่อน (docs/setup-senders.md)

import type { RenderedMessage } from '@/lib/domain/types';
import { createNotifier, postJson } from '@/lib/notifiers/http';
import type { EnvSource, Notifier, NotifierOptions } from '@/lib/notifiers/types';

export const BREVO_SMTP_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export interface BrevoSettings {
  apiKey: string;
  senderEmail: string;
  senderName: string;
}

function missingEnv(name: string): Error {
  return new Error(`${name} is not configured — see docs/setup-senders.md`);
}

/** อ่าน + ตรวจ env ของ Brevo — ขาดตัวแปรใด = ล้มเหลวแบบเงียบ (log send_status=failed) */
export function readBrevoSettings(env: EnvSource): BrevoSettings {
  const apiKey = (env.BREVO_API_KEY ?? '').trim();
  const senderEmail = (env.BREVO_SENDER_EMAIL ?? '').trim();
  const senderName = (env.BREVO_SENDER_NAME ?? '').trim();
  if (apiKey === '') throw missingEnv('BREVO_API_KEY');
  if (senderEmail === '') throw missingEnv('BREVO_SENDER_EMAIL');
  if (senderName === '') throw missingEnv('BREVO_SENDER_NAME');
  return { apiKey, senderEmail, senderName };
}

/**
 * หัวข้ออีเมล = บรรทัดแรกของ renderEmail (หัว digest ก่อน `<br/>` ตัด tag ทิ้ง)
 * หัวข้อกับเนื้อหาจึงเป็นข้อความสรุปชุดเดียวกันตามสเปก
 */
export function emailSubject(message: RenderedMessage): string {
  const head = (message.split('<br/>')[0] ?? '').replace(/<[^>]*>/g, '').trim();
  return head === '' ? 'ma-noti: renewal digest' : head;
}

export function createEmailNotifier(options: NotifierOptions = {}): Notifier {
  return createNotifier(options, async ({ env, fetch }, delivery, message) => {
    const { apiKey, senderEmail, senderName } = readBrevoSettings(env);

    await postJson(fetch, {
      label: 'brevo',
      url: BREVO_SMTP_ENDPOINT,
      headers: { 'api-key': apiKey, accept: 'application/json' },
      payload: {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: delivery.contact, name: delivery.personName }],
        subject: emailSubject(message),
        htmlContent: message,
      },
    });
  });
}
