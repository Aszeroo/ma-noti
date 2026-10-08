// lib/sheets/reader.ts — ตัวอ่านชีตจริงผ่าน Google Service Account (ticket #5)
// อ่านทุกแท็บของ spreadsheet → RawSection ตามสัญญาของ lib/domain (แถว 2 = ชื่อส่วนงาน,
// แถว 3 = หัวคอลัมน์ normalized, แถว 4+ = แถวข้อมูล) — read-only เสมอ (scope Viewer)
// Sheet ID + JSON key อยู่จาก env เท่านั้น (GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT)
//
// แยก 2 ชั้นเพื่อให้เทสได้โดยไม่แตะเน็ตเวอร์ก:
//   - toRawSection() : การ map ล้วน ๆ ทดสอบด้วย fixture ปลอม
//   - readAllTabs()  : REST v4 บาง ๆ (values:batchGet 1 ครั้งต่อรอบ) รับ fetchImpl ฉลากปลอมได้

import { JWT } from 'google-auth-library';

import type { DailyTabInput } from '@/lib/domain/pipeline';
import type { RawRow, RawSection } from '@/lib/domain/types';

// read-only scope — สอดคล้องกับการแชร์ชีตเป็น Viewer (ADR/spec: ระบบไม่เขียนกลับลงชีต)
const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

// อ่านถึงคอลัมน์ Z (26) — สเปกใช้อย่างมาก ~12 คอลัมน์; เกินนั้นระบบ map จากชื่อ header อยู่ดี
const READ_RANGE = 'A:Z';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// ---- การ map ล้วน ๆ (pure mapping — เทสด้วย fixture ปลอม) ----

/** เซลล์ดิบจาก API (FORMATTED_VALUE = string|null) → string; ทุกอย่างที่ไม่ใช่ string ถูก String() */
function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'number' || typeof cell === 'boolean') return String(cell);
  return ''; // โครงสร้างประหลาด (cellData object) — ถือว่าเป็นเซล์ว่าง ไม่ crash
}

/** เหมือน normalizeHeader ของ row-reader: lowercase + ตัดวรรค/จุด/ขีด (RawSection.headers เป็น normalized) */
function normalizeSheetHeader(raw: string): string {
  return raw.toLowerCase().replace(/[\s.\-–—]/g, '');
}

/**
 * ค่าดิบของ 1 แท็บ (values จาก API — แถว 1 คือแถวบนสุดของชีต) → RawSection
 * แถว 1 : ไม่ใช (แบนเนอร์/หัวชีต) | แถว 2 : ชื่อส่วนงาน | แถว 3 : หัวคอลัมน์ | แถว 4+ : ข้อมูล
 * แท็บว่าง/แถวน้อยกว่า 3 → headers=[], rows=[] (ระบบทนแท็บว่างตามสเปก)
 */
export function toRawSection(values: unknown[][] | undefined): RawSection {
  const matrix = Array.isArray(values) ? values : [];
  const sectionRow = Array.isArray(matrix[1]) ? matrix[1] : [];
  const headerRow = Array.isArray(matrix[2]) ? matrix[2] : [];

  const rows: RawRow[] = matrix
    .slice(3)
    .map(row => ({ cells: (Array.isArray(row) ? row : []).map(cellToString) }))
    .filter(row => row.cells.some(cell => cell !== '')); // ทิ้งแถวว่างล้วน (ตัวคั่น/ท้ายตาราง)

  return {
    sectionName: sectionRow.map(cellToString).find(cell => cell !== '') ?? '',
    headers: headerRow.map(cellToString).map(normalizeSheetHeader),
    rows,
  };
}

/** ชื่อแท็บ → A1 range ที่ escape single quote เป็น '' ตามกติกา Google */
export function sheetRange(title: string): string {
  return `'${title.replace(/'/g, "''")}'!${READ_RANGE}`;
}

// ---- REST v4 บาง ๆ (transport ฉลากปลอมได้ในเทส) ----

export interface SheetsReaderDeps {
  spreadsheetId: string;
  /** ถอด token OAuth จาก Service Account (ดีฟอลต์สร้างจาก JWT ใน createSheetsReader) */
  getAccessToken: () => Promise<string>;
  /** ฉลากปลอมสำหรับเทส — ดีฟอลต์คือ global fetch */
  fetchImpl?: FetchLike;
}

interface SpreadsheetMeta {
  sheets?: Array<{ properties?: { title?: unknown } }>;
}

interface BatchGetValuesResponse {
  data?: Array<{ range?: string; values?: unknown[][] }>;
}

async function callJson<T>(
  fetchImpl: FetchLike,
  url: string,
  token: string,
  init: { method?: string; body?: string } = {},
): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let reason = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) reason = parsed.error.message;
    } catch {
      /* ตอบกลับไม่ใช่ JSON — ใช้ข้อความดิบ */
    }
    throw new Error(`sheets API failed (${response.status}): ${reason}`);
  }
  return (await response.json()) as T;
}

/**
 * อ่านทุกแท็บของ 1 ชีตภายใน 2 คำขอ (metadata + values:batchGet)
 * ลำดับ data ใน response ตรงกับลำดับ ranges ที่ส่ง (ตามเอกสาร Sheets v4) → จับคู่ด้วย index
 */
export async function readAllTabs(deps: SheetsReaderDeps): Promise<DailyTabInput[]> {
  const spreadsheetId = deps.spreadsheetId.trim();
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID ว่าง — ต้องเซ็ตก่อนรัน (docs/setup-google-sheet.md)');
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new Error('ไม่มี fetch ใช้ได้ (Node >= 20.9 จำเป็น)');
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;

  const token = await deps.getAccessToken();
  const meta = await callJson<SpreadsheetMeta>(
    fetchImpl,
    `${base}?fields=sheets.properties.title`,
    token,
  );
  const titles = (meta.sheets ?? [])
    .map(sheet => sheet.properties?.title)
    .filter((title): title is string => typeof title === 'string' && title.trim() !== '');
  if (titles.length === 0) return []; // ชีตไม่มีแท็บที่อ่านได้ → ท่อรันต่อด้วย 0 แท็บ (รันผ่าน + log หลักฐาน)

  const batch = await callJson<BatchGetValuesResponse>(
    fetchImpl,
    `${base}/values:batchGet`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        ranges: titles.map(sheetRange),
        valueRenderOption: 'FORMATTED_VALUE', // เซลล์เป็น string ตามที่คนเห็นในชีต (วันที่ไทย/พ.ศ. ผ่าน parser ของ ticket #3)
      }),
    },
  );
  const valueRanges = Array.isArray(batch.data) ? batch.data : [];

  return titles.map((title, index) => ({
    tabName: title,
    section: toRawSection(valueRanges[index]?.values),
  }));
}

// ---- ดีฟอลต์จาก env (Service Account JSON + Sheet ID) ----

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/** แกะ GOOGLE_SERVICE_ACCOUNT (JSON หนึ่งบรรทัด) — ข้อความ error ชัดเจนเวลาเซ็ตผิด */
export function parseServiceAccountKey(raw: string): ServiceAccountKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT ไม่ใช่ JSON ที่ถูกต้อง (ต้องเป็น JSON key ทั้งก้อนในหนึ่งบรรทัด — ดู docs/setup-google-sheet.md)',
    );
  }
  const key = parsed as Partial<ServiceAccountKey> | null;
  if (!key || typeof key.client_email !== 'string' || typeof key.private_key !== 'string') {
    throw new Error('GOOGLE_SERVICE_ACCOUNT ต้องมี client_email และ private_key (ไฟล์ JSON key จาก Google Cloud)');
  }
  return { client_email: key.client_email, private_key: key.private_key };
}

/**
 * สร้างตัวอ่านชีตจาก env — โยน error ชัดเจนเมื่อเซ็ตไม่ครบ (endpoint จะตอบ 500 พร้อมเหตุผล)
 * เรียก lazily: build ผ่านได้แม้ยังไม่มี env (เหมือน getSupabaseAdminClient)
 */
export function createSheetsReader(
  env: Record<string, string | undefined> = process.env,
): () => Promise<DailyTabInput[]> {
  const spreadsheetId = (env.GOOGLE_SHEET_ID ?? '').trim();
  const rawKey = (env.GOOGLE_SERVICE_ACCOUNT ?? '').trim();
  if (!spreadsheetId || !rawKey) {
    throw new Error(
      'GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT ยังไม่ได้เซ็ต (คู่มือ: docs/setup-google-sheet.md)',
    );
  }
  const key = parseServiceAccountKey(rawKey);
  const jwt = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [SHEETS_READONLY_SCOPE],
  });
  return () =>
    readAllTabs({
      spreadsheetId,
      getAccessToken: async () => {
        const token = await jwt.getAccessToken();
        if (!token?.token) throw new Error('ถอด token จาก Service Account ไม่สำเร็จ');
        return token.token;
      },
    });
}
