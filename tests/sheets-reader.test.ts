// tests/sheets-reader.test.ts — เทส adapter อ่านชีต (ticket #5) ด้วย fixture ปลอมทังหมด
// ไม่มีเน็ตเวิร์ก: fetchImpl = ฟังก์ชันปลอม, token = string ปลอม — ตรวจเฉพาะ contract
// (URL/ranges/header/การ map values → RawSection ตามสัญญา lib/domain)
import { describe, expect, it, vi } from 'vitest';

import {
  createSheetsReader,
  parseServiceAccountKey,
  readAllTabs,
  sheetRange,
  toRawSection,
  type SheetsReaderDeps,
} from '@/lib/sheets/reader';

// ---- การ map ล้วน ๆ (toRawSection) ----

describe('toRawSection — map ค่าดิบ 1 แท็บ → RawSection (แถว 2 ส่วนงาน / แถว 3 header / แถว 4+ ข้อมูล)', () => {
  it('ตัดแถวแบนเนอร์, จับชื่อส่วนงานจากแถว 2, normalize header แถว 3, และ stringify แถวข้อมูล', () => {
    const values = [
      ['ชั้ นบ นช ีต: MA 2026', '', ''], // แถว 1 — ไม่นำไปใช้
      ['', 'งานต่ออายุ', ''], // แถว 2 — ชื่่อส่วนงาน = เซลล์ว่างกอนหน้างาย
      [' Job.Code ', 'ชื่ อ งาน', 'สถานะครั้ งที่-1'], // แถว 3 — วรรค/จุด/ขีดยักถุกตัด
      ['JOB-1', 'ชื่ อ งาน A', 'รอขอใบราคา'], // แถว 4 — ข้อมูล
      [null, 'JOB-2', 5], // แถว 5 — null → '', number → '5'
      [], // แถวว่าง — ถุกทิง
      ['', '', ''], // แถวว่างล้วน — ถุกทิง
    ];

    expect(toRawSection(values)).toEqual({
      sectionName: 'งานต่ออายุ',
      headers: ["jobcode", "ชื่องาน", "สถานะครั้งที่1"],
      rows: [
        { cells: ['JOB-1', 'ชื่ อ งาน A', 'รอขอใบราคา'] },
        { cells: ['', 'JOB-2', '5'] },
      ],
    });
  });

  it('แท็บว่าง / มีไม่ครบ 3 แถว → headers=[], rows=[] (ระบบทนแท็บว่าง ไม crash)', () => {
    expect(toRawSection(undefined)).toEqual({ sectionName: '', headers: [], rows: [] });
    expect(toRawSection([])).toEqual({ sectionName: '', headers: [], rows: [] });
    expect(toRawSection([['แบนเนอร'], ['งานต่ออายุ']])).toEqual({
      sectionName: 'งานต่ออายุ',
      headers: [],
      rows: [],
    });
  });

  it('header ปลดคาวาตอง map ตรงกับ COLUMN_NAMES ของ row-reader (normalize เหมือนกัน)', async () => {
    // ตรวจว่า normalizeSheetHeader ของ adapter เหมืนอนกับท่ี row-reader ใช (ผ่าน readRenewalItems)
    const { COLUMN_NAMES: NAMES, readRenewalItems } = await import('@/lib/domain/row-reader');
    const section = toRawSection([
      ['ชื่ อ ชีต'],
      ['งานต่ออายุ'],
      Object.values(NAMES), // header ตามชื่ อตรง ๆ
      ['JOB-X', 'งาน X', 'หนวย', 'โดเมน', '22/10/2026', '31/12/2026', 'P', 'O', '', '', '', ''],
    ]);
    const read = readRenewalItems(section);
    expect(read.headers.jobCode).toBe(0);
    expect(read.headers.expiryText).toBe(4);
    expect(read.items).toHaveLength(1);
    expect(read.items[0]?.jobCode).toBe('JOB-X');
    expect(read.issues).toHaveLength(0);
  });
});

describe('sheetRange — A1 range ของทุกคอลัมณ 1 แท็บ (escape single quote เปน \'\')', () => {
  it('ครอบชื่ อแท็บดวย single quote และ escape หนายใน', () => {
    expect(sheetRange('ทีมทดสอบ')).toBe("'ทีมทดสอบ'!A:Z");
    expect(sheetRange("It's team")).toBe("'It''s team'!A:Z");
  });
});

// ---- readAllTabs ดวย transport ปลอม ----

const META = {
  sheets: [
    { properties: { title: 'ทีมทดสอบ' } },
    { properties: { title: "It's team" } },
    { properties: {} }, // แท็บไรชื่่อ — ขาม
  ],
};

const TEAM_A_VALUES = [
  ['ชั้ นบน'],
  ['งานต่ออายุ'],
  ['Job Code', 'ชื่ อ งาน', 'หนวย'],
  ['JOB-META-1', 'งาน A', 'SSL'],
];

function fakeTransport(canned: {
  meta?: unknown;
  batch?: unknown;
  failBatchWith?: { status: number; message: string };
}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    if (url.includes('values:batchGet')) {
      if (canned.failBatchWith) {
        return new Response(
          JSON.stringify({ error: { message: canned.failBatchWith.message } }),
          { status: canned.failBatchWith.status },
        );
      }
      return new Response(JSON.stringify(canned.batch ?? { data: [] }), { status: 200 });
    }
    return new Response(JSON.stringify(canned.meta ?? META), { status: 200 });
  });
  const getAccessToken = vi.fn(async () => 'fake-token');
  const deps: SheetsReaderDeps = {
    spreadsheetId: 'SHEET-ID-TEST',
    getAccessToken,
    fetchImpl,
  };
  return { deps, calls, fetchImpl, getAccessToken };
}

describe('readAllTabs — REST v4 บาง ๆ (metadata + batchGet) ดวย fetch ปลอม', () => {
  it('อานทุกแท็บใน 2 คำขอ: fields=ชื่อแท็บ แลว batchGet ranges ที่ escape แล้ว', async () => {
    const { deps, calls, getAccessToken } = fakeTransport({
      batch: { data: [{ range: "'ทีมทดสอบ'!A1:Z10", values: TEAM_A_VALUES }, {}] },
    });

    const tabs = await readAllTabs(deps);

    expect(getAccessToken).toHaveBeenCalledTimes(1); // token เดียวใชทงรอบ
    expect(calls).toHaveLength(2);

    // คำขอ 1: metadata ชื่อแท็บเทานั้ น (fields จำกัด payload)
    expect(calls[0]?.url).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/SHEET-ID-TEST?fields=sheets.properties.title',
    );
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer fake-token');

    // คำขอ 2: values:batchGet ทงหมดในครังเดียว + FORMATTED_VALUE (วันท่ีไทย/พ.ศ. เปน string ตามท่ีคนเห็น)
    const body = JSON.parse(String(calls[1]?.init?.body)) as Record<string, unknown>;
    expect(calls[1]?.url).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/SHEET-ID-TEST/values:batchGet',
    );
    expect(body.ranges).toEqual(["'ทีมทดสอบ'!A:Z", "'It''s team'!A:Z"]);
    expect(body.valueRenderOption).toBe('FORMATTED_VALUE');

    // map ตรงลำดบั tab ↔ data; แท็บไรชื่่อใน metadata ถุกขาม; แท็บท่ีไม่มี values = ว่าง
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toEqual({
      tabName: 'ทีมทดสอบ',
      section: {
        sectionName: 'งานต่ออายุ',
        headers: ['jobcode', 'ชื่ อ งาน'.replace(/ /g, ''), 'หนวย'],
        rows: [{ cells: ['JOB-META-1', 'งาน A', 'SSL'] }],
      },
    });
    expect(tabs[1]).toEqual({
      tabName: "It's team",
      section: { sectionName: '', headers: [], rows: [] },
    });
  });

  it('ชีตไม่มีแท็บอ่านได → [] (รันผาน ปลายน้ำเป็น 0 delivery แต log ยังม)ี', async () => {
    const { deps, calls } = fakeTransport({ meta: { sheets: [] } });

    await expect(readAllTabs(deps)).resolves.toEqual([]);
    expect(calls).toHaveLength(1); // ขาม batchGet เมอ่ไม่มี range
  });

  it('Google ตอบ 403 (ยังไมแชรชีตเป น Viewer) → error พรอม status + message', async () => {
    const { deps } = fakeTransport({
      failBatchWith: { status: 403, message: 'The caller does not have permission' },
    });

    await expect(readAllTabs(deps)).rejects.toThrow(
      'sheets API failed (403): The caller does not have permission',
    );
  });

  it('spreadsheetId ว่าง → error ชัดเจนกอนยิงคำขอ', async () => {
    const { deps, fetchImpl } = fakeTransport({});

    await expect(readAllTabs({ ...deps, spreadsheetId: '  ' })).rejects.toThrow('GOOGLE_SHEET_ID');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ---- env → Service Account (ตรวจ shape ลวน ๆ ไมยิง token จริง) ----

describe('parseServiceAccountKey / createSheetsReader — env ตามสเปกเทานั้ น', () => {
  const fakeKey = JSON.stringify({
    type: 'service_account',
    client_email: 'ma-noti-reader@test-project.iam.gserviceaccount.com',
    private_key: '-----FAKE KEY-----\nไม่ใชคจจริง\n',
  });

  it('แยก client_email + private_key จาก JSON หนาเดียว', () => {
    expect(parseServiceAccountKey(fakeKey)).toEqual({
      client_email: 'ma-noti-reader@test-project.iam.gserviceaccount.com',
      private_key: '-----FAKE KEY-----\nไม่ใชคจจริง\n',
    });
  });

  it('JSON พัง / ขาด field จำเปด → error อางเอกสาร', () => {
    expect(() => parseServiceAccountKey('not json')).toThrow(/GOOGLE_SERVICE_ACCOUNT/);
    expect(() => parseServiceAccountKey('{"type":"service_account"}')).toThrow(/client_email/);
  });

  it('env ครบ → ได reader function (ไมแตะเครอขายในจังหวะสราง); env ขาด → error ชัดเจน', () => {
    const reader = createSheetsReader({
      GOOGLE_SHEET_ID: 'SHEET-ID-TEST',
      GOOGLE_SERVICE_ACCOUNT: fakeKey,
    });
    expect(typeof reader).toBe('function');

    expect(() => createSheetsReader({})).toThrow(/GOOGLE_SHEET_ID \/ GOOGLE_SERVICE_ACCOUNT/);
  });
});
