// tests/notifiers.test.ts — เทสสัญญา payload ของผู้ส่ง 3 ช่องทาง (ticket #10)
// ใช fake transport (fetchImpl) จบทวน payload ทียิงหา Brevo / Discord / Telegram
// ไมมมีเครอขายจริงทังสนิ้: send() ถูกริงผาน fake fetch เทานั้ น
// ขอมูลทังหมดเปฟิกสเชอ (อีเมล/contact/partner ปลอม) + renderer จริงของ lib/domain
import { describe, expect, it } from 'vitest';

import { renderDiscord, renderEmail, renderTelegram } from '@/lib/domain/renderer';
import type { Delivery, DeliveryChannelType, Digest } from '@/lib/domain/types';
import {
  BREVO_SMTP_ENDPOINT,
  createEmailNotifier,
  emailSubject,
  telegramEndpoint,
  type FetchLike,
  type EnvSource,
} from '@/lib/notifiers';
import { createDiscordNotifier, parseDiscordPayload } from '@/lib/notifiers/discord';
import { createTelegramNotifier } from '@/lib/notifiers/telegram';
import { readBrevoSettings } from '@/lib/notifiers/email';
import { createNotifiers } from '@/lib/notifiers/index';

// ---- fake transport: จับทุกคำขอที่วิ่งหาบริการภายนอก ----

interface CapturedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeTransport(respond: () => Response = () => new Response('{"ok":true}', { status: 200 })) {
  const calls: CapturedCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {},
    });
    return respond(); // Response ใหม่ทุกรอบ (body อ่านได้ครั้งเดียว)
  };
  return { calls, fetchImpl };
}

// ---- fixtures (ปลอมทั้งหมด) ----

const ENV: EnvSource = {
  BREVO_API_KEY: 'xkeysib-unit-test-key',
  BREVO_SENDER_EMAIL: 'notify@team.example',
  BREVO_SENDER_NAME: 'ma-noti test',
  TELEGRAM_BOT_TOKEN: '1234567:unit-test-token',
};

const WEBHOOK = 'https://discord.com/api/webhooks/123456789/abcdef-unit-test';

const DIGEST: Digest = {
  party: 'sales',
  runDate: { year: 2026, month: 10, day: 8 },
  tab: 'ticket-10',
  items: [
    {
      jobCode: 'JOB-1',
      jobName: 'SSL renew',
      unit: 'SSL',
      renewalType: 'domain',
      expiryText: '22/10/2026',
      daysRemaining: 14,
      daysLate: null,
      partner: 'PARTNER-T',
      owner: 'OWNER-T',
    },
  ],
  overdue: [],
  issues: [],
};

function makeDelivery(channel: DeliveryChannelType, contact: string, message: string): Delivery {
  return { party: 'sales', personId: 'u-test', personName: 'Test Person', channel, contact, message };
}

describe('email — สัญญา Brevo API v3 (POST /v3/smtp/email)', () => {
  it('ยิง POST พรอม header api-key + sender + to + subject + htmlContent', async () => {
    const { calls, fetchImpl } = fakeTransport();
    const html = renderEmail(DIGEST);
    const notifier = createEmailNotifier({ env: ENV, fetchImpl });

    await notifier.send(makeDelivery('email', 'someone@team.example', html), html);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(BREVO_SMTP_ENDPOINT);
    expect(call?.method).toBe('POST');
    expect(call?.headers['api-key']).toBe('xkeysib-unit-test-key');
    expect(call?.headers['content-type']).toContain('application/json');

    expect(call?.body.sender).toEqual({ email: 'notify@team.example', name: 'ma-noti test' });
    expect(call?.body.to).toEqual([{ email: 'someone@team.example', name: 'Test Person' }]);
    expect(call?.body.htmlContent).toBe(html);
    const subject = call?.body.subject;
    expect(typeof subject).toBe('string');
    expect((subject as string).length).toBeGreaterThan(0);
    expect(subject).not.toContain('<'); // หัวเรื่องต้องเป็นข้อความล้วน ไม่มียแท็ก
  });

  it('env ของ Brevo ขาดตัวใดตัวหนึ่ง = ล้มเหลวแบบเงียบ และไม่ยิงอะไรเลย', async () => {
    for (const missing of ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME'] as const) {
      const { calls, fetchImpl } = fakeTransport();
      const env: EnvSource = { ...ENV, [missing]: '' };
      const notifier = createEmailNotifier({ env, fetchImpl });
      const html = renderEmail(DIGEST);

      await expect(notifier.send(makeDelivery('email', 'someone@team.example', html), html)).rejects.toThrow(missing);
      expect(calls).toHaveLength(0);
    }
  });

  it('Brevo ตอบ 4xx (api-key ปลด/หมดอายุ) → throw พร้อมรหัสสถานะและเหตุผล', async () => {
    const { fetchImpl } = fakeTransport(() =>
      new Response('{"message":"Invalid key"}', { status: 401 }),
    );
    const html = renderEmail(DIGEST);
    const notifier = createEmailNotifier({ env: ENV, fetchImpl });

    await expect(notifier.send(makeDelivery('email', 'someone@team.example', html), html)).rejects.toThrow(
      /brevo send failed \(401\): Invalid key/,
    );
  });

  it('subject = หัว digest ของ renderer (ตัดแท็กออก) — หัวเรื่องกับเนื้อหาคือข้อความชุดเดียวกัน', () => {
    const html = renderEmail(DIGEST);
    expect(emailSubject(html)).toBe(html.split('<br/>')[0]?.replace(/<[^>]*>/g, '').trim());
    expect(emailSubject('<br/><table></table>')).toBe('ma-noti: renewal digest');
  });
});

describe('discord — สัญญา Incoming Webhook (embeds array)', () => {
  it('POST ไปยัง webhook URL จาก contact พร้อม body { embeds: [...] }', async () => {
    const { calls, fetchImpl } = fakeTransport(() => new Response(null, { status: 204 }));
    const payload = renderDiscord(DIGEST);
    const notifier = createDiscordNotifier({ fetchImpl });

    await notifier.send(makeDelivery('discord', WEBHOOK, payload), payload);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(WEBHOOK); // URL มาจาก contact ของแต่ละคน ไม่มี env
    expect(call?.method).toBe('POST');
    expect(call?.headers['content-type']).toContain('application/json');

    const embeds = call?.body.embeds;
    expect(Array.isArray(embeds)).toBe(true);
    const [embed] = embeds as Array<Record<string, unknown>>;
    expect(typeof embed?.title).toBe('string');
    expect(Array.isArray(embed?.fields)).toBe(true);
    expect((embed?.fields as unknown[]).length).toBeGreaterThan(0);
  });

  it('2xx พร้อม body ว่างเปล่า (ไมใช JSON) ยัังถือกวาสำเร็จ — ไม crash ตอน parse', async () => {
    const { fetchImpl } = fakeTransport(() => new Response('', { status: 200 }));
    const payload = renderDiscord(DIGEST);

    await expect(
      createDiscordNotifier({ fetchImpl }).send(makeDelivery('discord', WEBHOOK, payload), payload),
    ).resolves.toBeUndefined();
  });

  it('message ไม่ใช่ JSON ของ embed → throw และไม่ยิง', async () => {
    const { calls, fetchImpl } = fakeTransport();
    await expect(
      createDiscordNotifier({ fetchImpl }).send(makeDelivery('discord', WEBHOOK, 'plain text'), 'plain text'),
    ).rejects.toThrow(/json/i);
    expect(calls).toHaveLength(0);
  });

  it('contact (webhook URL) ว่าง → throw พร้อมข้อความบอกสาเหตุ', async () => {
    const { calls, fetchImpl } = fakeTransport();
    const payload = renderDiscord(DIGEST);
    await expect(
      createDiscordNotifier({ fetchImpl }).send(makeDelivery('discord', '   ', payload), payload),
    ).rejects.toThrow(/webhook url is empty/);
    expect(calls).toHaveLength(0);
  });
});

describe('telegram — สัญญา Bot API sendMessage', () => {
  it('POST /bot<token>/sendMessage พร้อม chat_id (จาก contact) + parse_mode Markdown', async () => {
    const { calls, fetchImpl } = fakeTransport();
    const text = renderTelegram(DIGEST);
    const notifier = createTelegramNotifier({ env: ENV, fetchImpl });

    await notifier.send(makeDelivery('telegram', '-1001234567890', text), text);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(telegramEndpoint('1234567:unit-test-token'));
    expect(call?.url).toContain('api.telegram.org/bot1234567:unit-test-token/sendMessage');
    expect(call?.body).toEqual({ chat_id: '-1001234567890', text, parse_mode: 'Markdown' });
  });

  it('ไมมี TELEGRAM_BOT_TOKEN → throw และไม่ยิง', async () => {
    const { calls, fetchImpl } = fakeTransport();
    const text = renderTelegram(DIGEST);
    const notifier = createTelegramNotifier({ env: {}, fetchImpl });

    await expect(notifier.send(makeDelivery('telegram', '123', text), text)).rejects.toThrow(
      /TELEGRAM_BOT_TOKEN is not configured/,
    );
    expect(calls).toHaveLength(0);
  });

  it('Telegram ตอบ 200 แต่ ok:false (chat โดนบล็อก) → ถือกวาล้มเหลว', async () => {
    const { fetchImpl } = fakeTransport(() =>
      new Response('{"ok":false,"description":"bot was kicked from the group chat"}', { status: 200 }),
    );
    const text = renderTelegram(DIGEST);

    await expect(
      createTelegramNotifier({ env: ENV, fetchImpl }).send(makeDelivery('telegram', '123', text), text),
    ).rejects.toThrow(/kicked from the group chat/);
  });
});

describe('registry — one interface, three implementations (PRD #1)', () => {
  it('createNotifiers ครบ 3 ช่องทาง และ dispatch ตาม channel ของ delivery', async () => {
    const { calls, fetchImpl } = fakeTransport();
    const registry = createNotifiers({ env: ENV, fetchImpl });

    const deliveries: Delivery[] = [
      makeDelivery('email', 'someone@team.example', renderEmail(DIGEST)),
      makeDelivery('discord', WEBHOOK, renderDiscord(DIGEST)),
      makeDelivery('telegram', '123', renderTelegram(DIGEST)),
    ];
    for (const delivery of deliveries) {
      await registry[delivery.channel].send(delivery, delivery.message);
    }

    expect(calls.map(call => call.url)).toEqual([
      BREVO_SMTP_ENDPOINT,
      WEBHOOK,
      telegramEndpoint('1234567:unit-test-token'),
    ]);
  });
});

describe('seam ของ adapter — ตรวจ env + payload กอนยิง', () => {
  it('readBrevoSettings: trim ค่า และเรียกวา ขาดตัวแปรใดก็โยน Error ระบุชอ', () => {
    expect(readBrevoSettings({ ...ENV, BREVO_SENDER_NAME: '  padded  ' })).toEqual({
      apiKey: 'xkeysib-unit-test-key',
      senderEmail: 'notify@team.example',
      senderName: 'padded',
    });
    expect(() => readBrevoSettings({ ...ENV, BREVO_API_KEY: '  ' })).toThrow(/BREVO_API_KEY/);
  });

  it('parseDiscordPayload: รบเฉพาะ JSON ทมี embeds ไมเปน array ว่าง', () => {
    const payload = parseDiscordPayload(renderDiscord(DIGEST));
    expect(payload.embeds).toHaveLength(1);
    expect(() => parseDiscordPayload('{"embeds":[]}')).toThrow(/embeds/);
    expect(() => parseDiscordPayload('{"content":"hi"}')).toThrow(/embeds/);
  });
});
