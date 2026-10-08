// tests/team-config.test.ts — เทสตวโหลดคอนฟิก 4 ตาราง → TeamConfig (ticket #5)
// สวน map: pure function ดวย canned rows; สวน loadTeamConfig: Supabase-js จริง + fetch ปลอม
// (PostgREST JSON canned — ไมมเน็ตเวอรก, ขอมูลปลอมทังหมด)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_LEAD_TIMES,
  emptyTeamConfig,
  loadTeamConfig,
  mapTeamConfig,
  resolveLeadTimes,
  type TeamConfigRows,
} from '@/lib/config/team-config';

const SUPABASE_URL = 'https://unit-test.supabase.co';
const SERVICE_ROLE_KEY = 'unit-test-service-role-key';

// ---- mapTeamConfig (pure) ----

describe('mapTeamConfig — แถว DB → TeamConfig (active เทานั้ น + ทนข้อมูลไมครบ)', () => {
  const rows: TeamConfigRows = {
    people: [
      { id: 'p1', name: 'สมชาย', active: true },
      { id: 'p2', name: 'ณดา', active: true },
      { id: 'p3', name: 'เกษียณ', active: false },
    ],
    channels: [
      { person_id: 'p1', type: 'email', contact: 'som@test.example' },
      { person_id: 'p1', type: 'telegram', contact: '@som' },
      { person_id: 'p2', type: 'discord', contact: 'webhook-ทดสอบ' },
      { person_id: 'p2', type: 'sms', contact: '0812345678' }, // type ไม่รูัก → ข้าม
      { person_id: 'p3', type: 'email', contact: 'old@test.example' }, // คน inactive → ข้าม
    ],
    assignments: [
      {
        sheet_tab: 'ท ีมนหนึ่ ง',
        sales: { id: 'p1', name: 'สมชาย', active: true },
        productBuddy: { id: 'p2', name: 'ณดา', active: true },
        quoting: null,
      },
      {
        sheet_tab: 'ท ีสอง', // sales เกษียณ → ทิงทังแถว (ไม่มี่เจ้้าของแท็บ)
        sales: { id: 'p3', name: 'เกษียณ', active: false },
        productBuddy: null,
        quoting: null,
      },
      {
        sheet_tab: 'ท ีสาม', // buddy inactive → null, quoting ยังอย่
        sales: { id: 'p1', name: 'สมชาย', active: true },
        productBuddy: { id: 'p3', name: 'เกษียณ', active: false },
        quoting: { id: 'p2', name: 'ณดา', active: true },
      },
    ],
    leadTimes: { sales: [7, 30, 3, 30], quoting: 'bogus' }, // ซ้ำ้ → เด็ด, sort, quoting เสียน → default
  };

  it('กรอง active คน/ช่องทาง/type และตัง role ที่หาย/inactive เป็น null', () => {
    expect(mapTeamConfig(rows)).toEqual({
      assignments: [
        {
          sheetTab: 'ท ีมนหนึ่ ง',
          sales: { personId: 'p1', personName: 'สมชาย' },
          productBuddy: { personId: 'p2', personName: 'ณดา' },
          quoting: null,
        },
        {
          sheetTab: 'ท ีสาม',
          sales: { personId: 'p1', personName: 'สมชาย' },
          productBuddy: null,
          quoting: { personId: 'p2', personName: 'ณดา' },
        },
      ],
      recipients: [
        { personId: 'p1', personName: 'สมชาย', channel: 'email', contact: 'som@test.example' },
        { personId: 'p1', personName: 'สมชาย', channel: 'telegram', contact: '@som' },
        { personId: 'p2', personName: 'ณดา', channel: 'discord', contact: 'webhook-ทดสอบ' },
      ],
      leadTimes: {
        sales: [3, 7, 30],
        product_buddy: DEFAULT_LEAD_TIMES.product_buddy,
        quoting: DEFAULT_LEAD_TIMES.quoting,
      },
    });
  });

  it('ทังตารางว่าง → TeamConfig ว่างทียัง valid (รันท่อยผานได, delivery = 0)', () => {
    const empty = mapTeamConfig({ people: [], channels: [], assignments: [], leadTimes: null });
    expect(empty).toEqual(emptyTeamConfig());
    expect(empty.assignments).toEqual([]);
    expect(empty.recipients).toEqual([]);
  });
});

describe('resolveLeadTimes — lead_times jsonb + default ตามสเปก', () => {
  it('default: sales/product_buddy 30/14/7/3/1 + วันหมดอายุ (0), quoting 60/45/30', () => {
    expect(resolveLeadTimes(null)).toEqual(DEFAULT_LEAD_TIMES);
    expect(resolveLeadTimes({})).toEqual(DEFAULT_LEAD_TIMES);
    expect(DEFAULT_LEAD_TIMES.sales).toContain(0);
    expect(DEFAULT_LEAD_TIMES.quoting).toEqual([60, 45, 30]);
  });

  it('รับค่าตองฝายที่ valid เทานั้ น (จำนวนเต็ม ≥ 0) — 0 ถูกรกษาไว', () => {
    expect(resolveLeadTimes({ sales: [0, 15, -2, 1.5, '7', 15] }).sales).toEqual([0, 15]);
    expect(resolveLeadTimes({ sales: [] }).sales).toEqual(DEFAULT_LEAD_TIMES.sales);
    expect(resolveLeadTimes('jsonb แปลก ๆ').quoting).toEqual(DEFAULT_LEAD_TIMES.quoting);
  });
});

// ---- loadTeamConfig (Supabase จริง + transport ปลอม) ----

function fakePostgrest(tables: Record<string, unknown>) {
  const calls: Array<{ url: string; apikey: string | null }> = [];
  return {
    calls,
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = String(input);
      calls.push({ url, apikey: new Headers(init?.headers).get('apikey') });
      const table = url.match(/\/rest\/v1\/([a-z_]+)/)?.[1] ?? '';
      const payload = tables[table];
      if (payload === undefined) {
        return Promise.resolve(new Response('{"message":"unexpected table"}', { status: 400 }));
      }
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
    },
  };
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('loadTeamConfig — โหลด 4 ตารางดวย admin client (fetch ปลอมแบบ PostgREST)', () => {
  it('ครบ 4 ตาราง → TeamConfig ครบรูปทรง + query ผาน service role', async () => {
    const transport = fakePostgrest({
      people: [{ id: 'p1', name: 'สมชาย', active: true }],
      channels: [{ person_id: 'p1', type: 'email', contact: 'som@test.example' }],
      assignments: [
        {
          sheet_tab: 'ท ีมนหนึ่ ง',
          sales: { id: 'p1', name: 'สมชาย', active: true },
          productBuddy: null,
          quoting: null,
        },
      ],
      settings: [{ lead_times: { quoting: [90, 60, 30] } }],
    });
    vi.stubGlobal('fetch', vi.fn(transport.fetch));

    const config = await loadTeamConfig();

    expect(config).toEqual({
      assignments: [
        {
          sheetTab: 'ท ีมนหนึ่ ง',
          sales: { personId: 'p1', personName: 'สมชาย' },
          productBuddy: null,
          quoting: null,
        },
      ],
      recipients: [
        { personId: 'p1', personName: 'สมชาย', channel: 'email', contact: 'som@test.example' },
      ],
      leadTimes: {
        sales: DEFAULT_LEAD_TIMES.sales,
        product_buddy: DEFAULT_LEAD_TIMES.product_buddy,
        quoting: [30, 60, 90], // เด็ด+sort จาก jsonb ของ settings
      },
    });

    // ครบ 4 ตาราง, ทุกคำขอผาน service_role key, names ผาน FK hint ของ assignments
    expect(transport.calls).toHaveLength(4);
    for (const call of transport.calls) expect(call.apikey).toBe(SERVICE_ROLE_KEY);
    const urls = transport.calls.map(call => call.url);
    expect(urls.some(u => u.includes('/rest/v1/people') && u.includes('active=eq.true'))).toBe(true);
    expect(urls.some(u => u.includes('/rest/v1/channels') && u.includes('active=eq.true'))).toBe(true);
    expect(
      urls.some(u => u.includes('/rest/v1/assignments') && u.includes('assignments_sales_id_fkey')),
    ).toBe(true);
    expect(urls.some(u => u.includes('/rest/v1/settings') && u.includes('id=eq.1'))).toBe(true);
  });

  it('ตารางว่าง / settings แถวหาย → emptyTeamConfig (รันผาน delivery=0 ตามสเปก)', async () => {
    const transport = fakePostgrest({
      people: [],
      channels: [],
      assignments: [],
      settings: [], // ยังไม่มีแแถว seed → default lead times
    });
    vi.stubGlobal('fetch', vi.fn(transport.fetch));

    await expect(loadTeamConfig()).resolves.toEqual(emptyTeamConfig());
  });

  it('query ล้มเหลว → error พร้อมชึ่อตารางให้อาว์จาก endpoint (500)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes('/rest/v1/people')
          ? Promise.resolve(new Response('{"message":"boom"}', { status: 400 }))
          : Promise.resolve(new Response('[]', { status: 200 })),
      ),
    );

    await expect(loadTeamConfig()).rejects.toThrow('people query failed');
  });
});
