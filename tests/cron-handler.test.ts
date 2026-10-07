import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleDailyCheck } from '@/lib/cron/handler';

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
  it('ไมมี secret → 401 ปฏเสธ และไมเขียน notify_log', async () => {
    const response = await handleDailyCheck(request('GET'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'unauthorized' });
    expect(captured).toHaveLength(0);
  });

  it('secret ผิด → 401 และไมเขียน notify_log', async () => {
    const response = await handleDailyCheck(
      request('GET', { authorization: 'Bearer totally-wrong' }),
    );

    expect(response.status).toBe(401);
    expect(captured).toHaveLength(0);
  });

  it('server ไมตั้ง CRON_SECRET → 503 (ไมรันอยางปลอยเซฟให cron ไร secret)', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const response = await handleDailyCheck(request('POST', { 'x-cron-secret': 'anything' }));

    expect(response.status).toBe(503);
    expect(captured).toHaveLength(0);
  });

  it('secret ถูก (Vercel Cron สไตล์: GET + Bearer) → รัน + เขียน notify_log พรอม DRY_RUN marker', async () => {
    const response = await handleDailyCheck(
      request('GET', { authorization: `Bearer ${CRON_SECRET}` }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, mode: 'dry_run', logged: 1 });

    expect(captured).toHaveLength(1);
    const [call] = captured;
    expect(call?.url).toContain('/rest/v1/notify_log');
    expect(call?.apikey).toBe(SERVICE_ROLE_KEY); // เขียนดวย service_role (cron ไมมี user session)

    const rows = call?.body as Array<Record<string, unknown>>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toMatchObject({
      person_id: null,
      channel: null,
      item_count: 0,
      dry_run: true, // DRY_RUN marker ลงคอลัมน์ dry_run
    });
    expect((rows[0]?.details as Record<string, unknown>).marker).toBe('DRY_RUN');
  });

  it('secret ถูกผาน x-cron-secret (POST สำรองสไตล์ GitHub Actions) → 200', async () => {
    const response = await handleDailyCheck(
      request('POST', { 'x-cron-secret': CRON_SECRET }),
    );

    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
  });

  it('ปด DRY_RUN (env = false) กอน notifiers พร้อม → 501 แลวไมเขียน log แบบ LIVE เทียม', async () => {
    vi.stubEnv('DRY_RUN', 'false');
    const response = await handleDailyCheck(
      request('GET', { authorization: `Bearer ${CRON_SECRET}` }),
    );

    expect(response.status).toBe(501);
    expect(captured).toHaveLength(0);
  });

  it('Supabase เขียน log ลม → 500 พรอมเหตุผล', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"boom"}', { status: 400 })));
    const response = await handleDailyCheck(
      request('GET', { authorization: `Bearer ${CRON_SECRET}` }),
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain('notify_log insert failed');
  });
});
