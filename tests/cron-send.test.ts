import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_LEAD_TIMES } from '@/lib/config/team-config';
import { handleDailyCheck } from '@/lib/cron/handler';
import { COLUMN_NAMES } from '@/lib/domain/row-reader';
import type { DailyTabInput } from '@/lib/domain/pipeline';
import type { Delivery, TeamConfig } from '@/lib/domain/types';

import { CRON_SECRET, captured, installCronFixtures, offlineDeps, request } from './helpers/cron-fixtures';

// tests/cron-send.test.ts — ขั้่นส่่งจริงของ endpoint (ticket #10)
// ผู้ส่งทั้่ง 3 ถูกจดับด้วย deps.sendDelivery ของปลอม (ไม่มีเครื่อข่ายในเทส) —
// ส่่่งอะไร / ไม่ย่ิงอะไร / สถานะลง log อย่่างไร คือเรื่อ่งท่ีเทสนี้ตองการยืนยัน
installCronFixtures();

/** คอนฟิกปลอม: เจ้าของแท็บ 1 คน รบั 3 ช่องทาง (อีเมล + Discord + Telegram) */
const SEND_CONFIG: TeamConfig = {
  assignments: [
    {
      sheetTab: 'ทมีทดสอบ-10',
      sales: { personId: 'u-sales', personName: 'Test Sales' },
      productBuddy: null,
      quoting: null,
    },
  ],
  recipients: [
    { personId: 'u-sales', personName: 'Test Sales', channel: 'email', contact: 'sales@test.example' },
    {
      personId: 'u-sales',
      personName: 'Test Sales',
      channel: 'discord',
      contact: 'https://discord.com/api/webhooks/123/unit-test',
    },
    { personId: 'u-sales', personName: 'Test Sales', channel: 'telegram', contact: '987654' },
  ],
  leadTimes: DEFAULT_LEAD_TIMES,
};

/** แท็บปลอม 1 รายการ (หมดอายุใน 14 วัน = ตรงรอบ sales ทุกวัน) */
function sendTab(): DailyTabInput {
  return {
    tabName: 'ทมีทดสอบ-10',
    section: {
      sectionName: 'renewal',
      headers: Object.values(COLUMN_NAMES),
      rows: [
        {
          cells: [
            'JOB-10', 'job name', 'SSL', 'domain', '22/10/2026', '31/12/2026',
            'partner-test', 'owner-test', 'รอขอใบราคา', '', '', '',
          ],
        },
      ],
    },
  };
}

const sendDeps = {
  ...offlineDeps,
  readTabs: async () => [sendTab()],
  loadConfig: async () => SEND_CONFIG,
};

const bearer = { authorization: `Bearer ${CRON_SECRET}` };

/** แถว log ของรายบคคล (คน+ช่อง) ที่ลง notify_log ในรอบนั้ */
function recipientRows(body: unknown): Array<Record<string, unknown>> {
  const rows = body as Array<Record<string, unknown>>;
  return rows.filter(row => row.person_id !== null);
}

function logInsertBody(): unknown {
  const insert = captured.find(call => call.url.includes('/rest/v1/notify_log'));
  return insert?.body;
}

describe('โหมด send (ticket #10) — ยิงจริงทุกช่องทาง + สถานะลง log', () => {
  it('DRY_RUN เปดอยู่ = ไม่ยิงแม้รายการเดียว (sendDelivery ถูกเรียก 0 ครั้ง)', async () => {
    vi.stubEnv('DRY_RUN', 'true');
    const sendDelivery = vi.fn(async (_delivery: Delivery) => {});

    const response = await handleDailyCheck(request('GET', bearer), { ...sendDeps, sendDelivery });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, mode: 'dry_run', logged: 4 });
    expect(sendDelivery).toHaveBeenCalledTimes(0);

    // หลักฐานใน log ยังครบ (แถวรอบรัน + 3 แถวคน/ช่องทาง) แต่ไม่มี send_status
    const rows = recipientRows(logInsertBody());
    expect(rows).toHaveLength(3);
    expect(rows.every(row => row.details && !('send_status' in (row.details as object)))).toBe(true);
    expect(captured.filter(call => call.url.includes('/rest/v1/notify_log'))).toHaveLength(1);
  });

  it('ปิด DRY_RUN = ส่งทุก delivery ที่วางแผนไว้ (1 คน 3 ช่องทาง = 3 ครั้ง)', async () => {
    vi.stubEnv('DRY_RUN', 'false');
    const sent: Array<{ channel: string; contact: string }> = [];
    const sendDelivery = vi.fn(async (delivery: Delivery) => {
      sent.push({ channel: delivery.channel, contact: delivery.contact });
    });

    const response = await handleDailyCheck(request('GET', bearer), { ...sendDeps, sendDelivery });

    expect(response.status).toBe(200);
    expect(sent).toEqual([
      { channel: 'email', contact: 'sales@test.example' },
      { channel: 'discord', contact: 'https://discord.com/api/webhooks/123/unit-test' },
      { channel: 'telegram', contact: '987654' },
    ]);

    const rows = recipientRows(logInsertBody());
    expect(rows.map(row => (row.details as Record<string, unknown>).send_status)).toEqual([
      'sent',
      'sent',
      'sent',
    ]);
  });

  it('ช่องทางหนึ่งล้มเหลว = รอบไม่พัง ช่องทางอื่นยังส่ง และสถานะลง history', async () => {
    vi.stubEnv('DRY_RUN', 'false');
    const attempted: string[] = [];
    const sendDelivery = vi.fn(async (delivery: Delivery) => {
      attempted.push(delivery.channel);
      if (delivery.channel === 'discord') throw new Error('discord send failed (404): Bad Request');
    });

    const response = await handleDailyCheck(request('GET', bearer), { ...sendDeps, sendDelivery });

    expect(response.status).toBe(200); // ไม่ 500 — การส่งล้มเหลวเป็น "สถานะ" ไม่ใช่ error ของรอบ
    expect(await response.json()).toEqual({ ok: true, mode: 'send', logged: 4 });
    expect(attempted).toEqual(['email', 'discord', 'telegram']); // ไปต่อจนถึงรายการสุดท้าย

    const rows = recipientRows(logInsertBody());
    expect(rows.map(row => (row.details as Record<string, unknown>).send_status)).toEqual([
      'sent',
      'failed',
      'sent',
    ]);
    const failedRow = rows.find(row => (row.details as Record<string, unknown>).send_status === 'failed');
    expect((failedRow?.details as Record<string, unknown>).send_error).toContain('discord send failed (404)');
  });

  it('แถวระดับรอบรันนับสรุป sent/failed ให้หน้า history แสดงผล', async () => {
    vi.stubEnv('DRY_RUN', 'false');
    const sendDelivery = vi.fn(async (delivery: Delivery) => {
      if (delivery.channel === 'telegram') throw new Error('telegram rejected the message');
    });

    await handleDailyCheck(request('GET', bearer), { ...sendDeps, sendDelivery });

    const runRow = (logInsertBody() as Array<Record<string, unknown>>).find(
      row => row.person_id === null,
    );
    expect(runRow?.details).toMatchObject({ stage: 'pipeline', sent: 2, failed: 1 });
  });

  it('ส่งจริงโดยพึ่ง notifier default ของ handler (ไม่มี sendDelivery override)', async () => {
    vi.stubEnv('DRY_RUN', 'false');
    vi.stubEnv('BREVO_API_KEY', 'xkeysib-unit-test-key');
    vi.stubEnv('BREVO_SENDER_EMAIL', 'notify@team.example');
    vi.stubEnv('BREVO_SENDER_NAME', 'ma-noti test');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '123:unit-test-token');

    const response = await handleDailyCheck(request('GET', bearer), sendDeps);

    expect(response.status).toBe(200);
    const urls = captured.map(call => call.url);
    expect(urls.some(url => url.includes('api.brevo.com/v3/smtp/email'))).toBe(true);
    expect(urls.some(url => url.includes('discord.com/api/webhooks/123/unit-test'))).toBe(true);
    expect(urls.some(url => url.includes('api.telegram.org/bot123:unit-test-token/sendMessage'))).toBe(true);

    const rows = recipientRows(logInsertBody());
    expect(rows.every(row => (row.details as Record<string, unknown>).send_status === 'sent')).toBe(true);
  });

  it('env ของ sender ยังไม่ครบ (เช่น BREVO_API_KEY) = ช่องทางนั้น failed แต่รอบยังผ่าน', async () => {
    vi.stubEnv('DRY_RUN', 'false');
    vi.stubEnv('BREVO_API_KEY', '');
    vi.stubEnv('BREVO_SENDER_EMAIL', 'notify@team.example');
    vi.stubEnv('BREVO_SENDER_NAME', 'ma-noti test');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '123:unit-test-token');

    const response = await handleDailyCheck(request('GET', bearer), sendDeps);

    expect(response.status).toBe(200);
    const rows = recipientRows(logInsertBody());
    const emailRow = rows.find(row => row.channel === 'email');
    const telegramRow = rows.find(row => row.channel === 'telegram');
    expect((emailRow?.details as Record<string, unknown>).send_status).toBe('failed');
    expect((emailRow?.details as Record<string, unknown>).send_error).toContain('BREVO_API_KEY');
    expect((telegramRow?.details as Record<string, unknown>).send_status).toBe('sent');
  });
});
