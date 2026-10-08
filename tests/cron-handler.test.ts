import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleDailyCheck, todayInTimezone } from '@/lib/cron/handler';
import { emptyTeamConfig } from '@/lib/config/team-config';
import { COLUMN_NAMES } from '@/lib/domain/row-reader';
import type { DailyTabInput } from '@/lib/domain/pipeline';

const CRON_SECRET = 'unit-test-cron-secret';
const SUPABASE_URL = 'https://unit-test.supabase.co';
const SERVICE_ROLE_KEY = 'unit-test-service-role-key';

interface CapturedRequest {
  url: string;
  body: unknown;
  apikey: string | null;
}

const captured: CapturedRequest[] = [];

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  captured.push({
    url: String(input),
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body ?? null,
    apikey: new Headers(init?.headers).get('apikey'),
  });
  return Promise.resolve(new Response('{}', { status: 201 }));
}

function request(method: 'GET' | 'POST', headers: Record<string, string> = {}): Request {
  return new Request(`${SUPABASE_URL}/api/cron/daily-check`, { method, headers });
}

// ---- ของปลอมสำหรับเปลือกบาง (inject ผ่าน deps — ไมแตะเน็ตเวอร์กในเทส) ----

/** ดีลจาก shell คุมเวลา: Bangkok 08:00 ของว้น 2026-10-08 */
const NOW = new Date('2026-10-08T01:00:00.000Z');

/** แท็บดิบปลอม 1 แถว (หมดอายุใน 14 ว้น = ตรงรอบ sales) — ข้อมูลปลอมทังหมด */
function fakeTab(jobCode: string): DailyTabInput {
  return {
    tabName: 'ทีมทดสอบ',
    section: {
      sectionName: 'งานต่ออายุ',
      headers: Object.values(COLUMN_NAMES),
      rows: [
        {
          cells: [
            jobCode, 'ชื่ องานทดสอบ', 'SSL', 'โดเมน', '22/10/2026', '31/12/2026',
            'partner-ทดสอบ', 'เจ้าของ-ทดสอบ', 'รอขอใบราคา', '', '', '',
          ],
        },
      ],
    },
  };
}

/** เปลือกบางอยางนอยที่ตองเสมอในทุกเคสที่ผาน secret: ไมอาน Sheet/โหลด DB จริงในเทส */
const offlineDeps = {
  readTabs: async () => [] as DailyTabInput[],
  loadConfig: async () => emptyTeamConfig(),
  now: () => NOW,
};

beforeEach(() => {
  captured.length = 0;
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
  vi.stubEnv('DRY_RUN', 'true');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('GET/POST /api/cron/daily-check — ครบตาม AC ของ ticket #2', () => {
  it('ไม่มี secret → 401 ปฏิเสธ และไม่เขียน notify_log', async () => {
    const response = await handleDailyCheck(request('GET'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'unauthorized' });
    expect(captured).toHaveLength(0);
  });

  it('secret ผิด → 401 และไม่เขียน notify_log', async () => {
    const response = await handleDailyCheck(
      request('GET', { authorization: 'Bearer totally-wrong' }),
    );

    expect(response.status).toBe(401);
    expect(captured).toHaveLength(0);
  });

  it('server ไม่ได้ตั้ง CRON_SECRET → 503 (ไม่รันอย่างปลอดภัยไว้ก่อนสำหรับ cron ที่ไม่มี secret)', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const response = await handleDailyCheck(request('POST', { 'x-cron-secret': 'anything' }));

    expect(response.status).toBe(503);
    expect(captured).toHaveLength(0);
  });

  it(
    'secret ถูก (Vercel Cron สไตล์: GET + Bearer) → รันท่อ + เขียน notify_log พร้อม DRY_RUN marker',
    async () => {
      const response = await handleDailyCheck(
        request('GET', { authorization: `Bearer ${CRON_SECRET}` }),
        offlineDeps,
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, mode: 'dry_run', logged: 1 });

      expect(captured).toHaveLength(1);
      const [call] = captured;
      expect(call?.url).toContain('/rest/v1/notify_log');
      expect(call?.apikey).toBe(SERVICE_ROLE_KEY); // เขียนด้วย service_role (cron ไม่มี user session)

      const rows = call?.body as Array<Record<string, unknown>>;
      expect(Array.isArray(rows)).toBe(true);
      expect(rows[0]).toMatchObject({
        person_id: null,
        channel: null,
        item_count: 0,
        dry_run: true, // DRY_RUN marker ลงคอลัมน์ dry_run
        details: { stage: 'pipeline', tabs: 0, run_at: NOW.toISOString() },
      });
    },
  );

  it('secret ถูกผ่าน x-cron-secret (POST สำรองสไตล์ GitHub Actions) → 200', async () => {
    const response = await handleDailyCheck(
      request('POST', { 'x-cron-secret': CRON_SECRET }),
      offlineDeps,
    );

    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
  });

  it(
    'ปิด DRY_RUN (env = false) → รันท่อเต็มรูปแบบ เขียน log marker dry_run=false ' +
      'แต่ยังไม่ติดต่อภายนอก (ผู้ส่งจริงมาใน ticket #10)',
    async () => {
      vi.stubEnv('DRY_RUN', 'false');
      const response = await handleDailyCheck(
        request('GET', { authorization: `Bearer ${CRON_SECRET}` }),
        offlineDeps,
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, mode: 'send', logged: 1 });

      // การติดต่อเดียวของรอบนี้คือ notify_log — ไม่มี sender จริง (Brevo/Discord/Telegram) ถูกเรียก
      expect(captured).toHaveLength(1);
      expect(captured[0]?.url).toContain('/rest/v1/notify_log');
      const rows = captured[0]?.body as Array<Record<string, unknown>>;
      expect(rows[0]?.dry_run).toBe(false); // marker ปิดตาม mode — ผู้ส่งจริงจะมาใน ticket #10
    },
  );

  it(
    'คอนฟิกว่าง + ชีตมีข้อมูล → รอบผ่าน, ไม่มีใครถูกแจ้งเตือน, แต่ log มีหลักฐานทุกรอบ (แถวระดับรอบรัน)',
    async () => {
      const response = await handleDailyCheck(
        request('GET', { authorization: `Bearer ${CRON_SECRET}` }),
        { ...offlineDeps, readTabs: async () => [fakeTab('JOB-NO-CONFIG')] },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, mode: 'dry_run', logged: 1 });

      expect(captured).toHaveLength(1);
      const rows = captured[0]?.body as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1); // เฉพาะแถวระดับรอบรัน — ไม่มีแถวต่อคน/ช่องทาง
      expect(rows[0]?.person_id).toBeNull();
      expect(rows[0]?.channel).toBeNull();
      expect(rows[0]?.item_count).toBe(0); // ไม่มี delivery เพราะไม่มีใครถูกผูกไว้ในคอนฟิก
      expect(rows[0]?.details).toMatchObject({ stage: 'pipeline', tabs: 1 });
    },
  );
});

describe('endpoint ของ ticket #5 — เปลือกบางต่อท่อจริง (sheets + config + log)', () => {
  it('ยังไม่ได้ตั้ง GOOGLE_* → 500 พร้อมเหตุผลชัดเจน และไม่เขียน notify_log', async () => {
    vi.stubEnv('GOOGLE_SHEET_ID', '');
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT', '');

    const response = await handleDailyCheck(
      request('GET', { authorization: `Bearer ${CRON_SECRET}` }),
      { now: () => NOW }, // readTabs ของจริง (ดีฟอลต์) — จะล้มที่การตรวจ env
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain('GOOGLE_SHEET_ID');
    expect(body.error).toContain('GOOGLE_SERVICE_ACCOUNT');
    expect(captured).toHaveLength(0); // ล้มตั้งแต่ก่อนแตะฐานข้อมูล
  });

  it('อ่านชีตล้มเหลว (403 จาก Google) → 500 พร้อมเหตุผล และไม่เขียน notify_log', async () => {
    const response = await handleDailyCheck(
      request('GET', { authorization: `Bearer ${CRON_SECRET}` }),
      {
        ...offlineDeps,
        readTabs: async () => {
          throw new Error('sheets API failed (403): The caller does not have permission');
        },
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('403'),
    });
    expect(captured).toHaveLength(0);
  });

  it('โหลดคอนฟิกล้มเหลว (Supabase query error) → 500 พร้อมเหตุผล', async () => {
    const response = await handleDailyCheck(
      request('GET', { authorization: `Bearer ${CRON_SECRET}` }),
      {
        ...offlineDeps,
        loadConfig: async () => {
          throw new Error('assignments query failed: boom');
        },
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('assignments query failed'),
    });
    expect(captured).toHaveLength(0); // ยังไม่เขียน log เมื่อคอนฟิกไม่พร้อม
  });

  it('Supabase เขียน log ล้มเหลว → 500 พร้อมเหตุผล', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"boom"}', { status: 400 })),
    );

    const response = await handleDailyCheck(
      request('GET', { authorization: `Bearer ${CRON_SECRET}` }),
      offlineDeps,
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain('notify_log insert failed');
  });
});

describe('todayInTimezone — นับ "วันนี้" ตามเวลาธุรกิจ Asia/Bangkok', () => {
  it('01:00 UTC = 08:00 Bangkok → วันเดียวกัน', () => {
    expect(todayInTimezone(new Date('2026-10-08T01:00:00.000Z'))).toEqual({
      year: 2026,
      month: 10,
      day: 8,
    });
  });

  it('ก่อนเที่ยงคืน Bangkok ยังนับวันเก่า และหลังเที่ยงคืน UTC นับวันใหม่', () => {
    expect(todayInTimezone(new Date('2026-10-07T16:59:00.000Z'))).toEqual({
      year: 2026,
      month: 10,
      day: 7, // 23:59 น. ที่กรุงเทพฯ
    });
    expect(todayInTimezone(new Date('2026-10-07T17:00:00.000Z'))).toEqual({
      year: 2026,
      month: 10,
      day: 8, // เที่ยงคืนพอดีที่กรุงเทพฯ
    });
  });
});
