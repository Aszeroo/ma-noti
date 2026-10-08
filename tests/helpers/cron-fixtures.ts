// tests/helpers/cron-fixtures.ts — ของปลอมสำหรับเปลือกบางของ cron endpoint
// (share กนั ระหวาง tests/cron-handler.test.ts + tests/cron-send.test.ts)
// ไลเซนสลายของเทส: ไมอาน Sheet/โหลด DB/ยิง sender จริง — fetch ทุกครังผาน fakeFetch
import { afterEach, beforeEach, vi } from 'vitest';

import { emptyTeamConfig } from '@/lib/config/team-config';
import { COLUMN_NAMES } from '@/lib/domain/row-reader';
import type { DailyTabInput } from '@/lib/domain/pipeline';

export const CRON_SECRET = 'unit-test-cron-secret';
const SUPABASE_URL = 'https://unit-test.supabase.co';
export const SERVICE_ROLE_KEY = 'unit-test-service-role-key';

export interface CapturedRequest {
  url: string;
  body: unknown;
  apikey: string | null;
}

/** คำขอทังหมดที่วื่งออกจาก endpoint ในรอบนั้ (notify_log + sender ใด ๆ) */
export const captured: CapturedRequest[] = [];

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  captured.push({
    url: String(input),
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body ?? null,
    apikey: new Headers(init?.headers).get('apikey'),
  });
  return Promise.resolve(new Response('{}', { status: 201 }));
}

export function request(method: 'GET' | 'POST', headers: Record<string, string> = {}): Request {
  return new Request(`${SUPABASE_URL}/api/cron/daily-check`, { method, headers });
}

/** ดีลจาก shell คุมเวลา: Bangkok 08:00 ของวัน 2026-10-08 */
export const NOW = new Date('2026-10-08T01:00:00.000Z');

/** แท็บดิบปลอม 1 แถว (หมดอายุใน 14 วัน = ตรงรอบ sales) — ข้อมูลปลอมทั้งหมด */
export function fakeTab(jobCode: string): DailyTabInput {
  return {
    tabName: 'team-test',
    section: {
      sectionName: 'renewal',
      headers: Object.values(COLUMN_NAMES),
      rows: [
        {
          cells: [
            jobCode, 'job name', 'SSL', 'domain', '22/10/2026', '31/12/2026',
            'partner-test', 'owner-test', 'รอขอใบราคา', '', '', '',
          ],
        },
      ],
    },
  };
}

/** เปลือกบางอย่า้น้อยที่ต้องเสมอในทุกเคสที่ผ่าน secret */
export const offlineDeps = {
  readTabs: async () => [] as DailyTabInput[],
  loadConfig: async () => emptyTeamConfig(),
  now: () => NOW,
};

/**
 * ติดตัง global stub ให้ทุกเทสในไฟล์: fetch ปลอม + env มาตรฐาน
 * (เรียกที่ top level ของไฟล์เทส — beforeEach/afterEach ของ vitest)
 */
export function installCronFixtures(): void {
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
}
