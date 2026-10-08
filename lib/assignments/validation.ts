/**
 * ตรวจความถูกต้องของการจัดฝ่ายต่อแท็บ (ticket #8) — pure helpers เท่านั้น
 * ไม่มี I/O: server actions ใน lib/assignments/actions.ts เป็นคนอ่าน FormData
 * แล้วเรียกฟังก์ชันพวกนี้ (รูปแบบเดียวกับ lib/recipients/validation.ts)
 * ข้อความ error เป็นภาษาไทยสำหรับแสดงบนหน้าเว็บ
 *
 * glossary: แท็บ (sheet_tab) · ฝ่าย (sales / product_buddy / quoting) · การจัดฝ่าย
 * ผูกซ้ำได้: คนเดียวอาจเป็นหลายฝ่ายของแท็บเดียว หรือเจ้าของหลายแท็บ — ไม่มี rule unique เรื่องคน
 */

import { isUuid } from '@/lib/recipients/validation';

/** ตรวจ UUID ของคนทสี่งมาจากรายการเลอก (ใชรวมกบ actions.ts) */
export { isUuid };

export type AssignmentParty = 'sales' | 'product_buddy' | 'quoting';

/** 3 ฝ่ายตามสเปก — ตรงกับคอลัมน์ในตาราง assignments และ keys ของ lead_times */
export const ASSIGNMENT_PARTIES: readonly AssignmentParty[] = [
  'sales',
  'product_buddy',
  'quoting',
];

/** ฝ่ายที่เว้นว่างได้ (= ยังไม่ผูกฝ่ายนี้) — sales ผูกเว้นไม่ได้ตาม NOT NULL ของตาราง */
export const OPTIONAL_PARTIES: readonly AssignmentParty[] = ['product_buddy', 'quoting'];

/** ป้าย UI ของแต่ละฝ่าย (glossary: Sales / Product Buddy / Quoting Team) */
export const ASSIGNMENT_PARTY_LABEL: Record<AssignmentParty, string> = {
  sales: 'Sales',
  product_buddy: 'Product Buddy',
  quoting: 'Quoting Team',
};

export type ValidationErrorCode =
  | 'invalid_tab'
  | 'tab_taken'
  | 'sales_required'
  | 'invalid_person';

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; code: ValidationErrorCode; error: string };

/** ชื่อแท็บยาวสุดที่ยอมรับ (ชีตจริงตั้งชื่อแท็บได้ราว 100 ตัวอักษร — กันช่องกรอกถูกใช้ผิด) */
export const MAX_TAB_NAME_LENGTH = 100;

/** raw จาก <select> เป็น string ได้ทุกค่า — ต้องกรองก่อนเชื่อว่า เป็น AssignmentParty */
export function isAssignmentParty(raw: string): raw is AssignmentParty {
  return (ASSIGNMENT_PARTIES as readonly string[]).includes(raw);
}

/** sales = เจ้าของแท็บ (คอลัมน์ sales_id เป็น NOT NULL ในตาราง) จึงขาดไม่ได้ */
export function partyRequiresPerson(party: AssignmentParty): boolean {
  return !OPTIONAL_PARTIES.includes(party);
}

/**
 * ตรวจชื่อแท็บ: trim → ห้ามว่าง → ห้ามยาวเกิน → ห้ามซ้ำกับแท็บที่มีอยู่แล้ว
 * takenTabs คือชื่อแท็บของแถวอื่น (ตอนแก้ไขให้ตัดแถวตัวเองออกก่อนส่งเข้ามา)
 * เทียบด้วยข้อความตรงตัวตาม unique constraint ของตาราง (Postgres เทียบแบบ case-sensitive)
 */
export function validateSheetTab(
  raw: string,
  takenTabs: readonly string[] = [],
): Validated<string> {
  const tab = raw.trim();
  if (tab === '') {
    return {
      ok: false,
      code: 'invalid_tab',
      error: 'กรุณากรอกชื่อแท็บให้ตรงกับชื่อแท็บในชีต',
    };
  }
  if (tab.length > MAX_TAB_NAME_LENGTH) {
    return {
      ok: false,
      code: 'invalid_tab',
      error: `ชื่อแท็บยาวเกินไป (ต้องไม่เกิน ${MAX_TAB_NAME_LENGTH} ตัวอักษร)`,
    };
  }
  if (takenTabs.includes(tab)) {
    return {
      ok: false,
      code: 'tab_taken',
      error: 'แท็บนี้ถูกจัดฝ่ายไว้แล้วในระบบ — แก้ไขแถวที่มีอยู่แทนการเพิ่มใหม่',
    };
  }
  return { ok: true, value: tab };
}

/**
 * ตรวจคนหนึ่งของหนึ่งฝ่าย — ค่าว่าง = "ยังไม่ผูกฝ่ายนี้"
 * ยอมให้ว่างเฉพาะ product_buddy / quoting; sales ขาดไม่ได้ (NOT NULL ในตาราง)
 * ค่าที่ต้องส่งคือ UUID จาก dropdown เท่านั้น — คนเดิมเลือกซ้ำหลายฝ่าย/หลายแท็บได้โดยชอบ
 */
export function validatePersonRef(
  party: AssignmentParty,
  raw: string,
): Validated<string | null> {
  const personId = raw.trim();

  if (personId === '') {
    if (partyRequiresPerson(party)) {
      return {
        ok: false,
        code: 'sales_required',
        error: `ต้องเลือก${ASSIGNMENT_PARTY_LABEL[party]} (เจ้าของแท็บ) — ผูกฝ่ายอื่นภายหลังได้`,
      };
    }
    return { ok: true, value: null };
  }

  if (!isUuid(personId)) {
    return {
      ok: false,
      code: 'invalid_person',
      error: `ตัวเลือกฝ่าย${ASSIGNMENT_PARTY_LABEL[party]}ไม่ถูกต้อง — กรุณาเลือกใหม่จากรายชื่อ`,
    };
  }
  return { ok: true, value: personId };
}

/** ค่าที่ตรวจแล้ว — พร้อม insert/update ลงตาราง assignments (key = ชื่อคอลัมน์ DB) */
export type AssignmentFormValues = {
  sheet_tab: string;
  sales_id: string;
  product_buddy_id: string | null;
  quoting_id: string | null;
};

/** อ่าน field จาก FormData เป็น string ว่างเมื่อไม่พบ (กัน undefined ปนใน validate) */
function fieldValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '');
}

/**
 * ตรวจ FormData ทั้งฟอร์มของหน้า assignments (pure — ไม่มี I/O)
 * คืนค่าแรกที่ตก (fail-fast ตามลำดับ แท็บ → sales → product_buddy → quoting)
 * sales_id แน่นเป็น string ส่วนอีกสองฝ่ายเป็น null เมื่อผู้ใช้เลือก "ยังไม่ผูก"
 */
export function parseAssignmentForm(
  formData: FormData,
  takenTabs: readonly string[] = [],
): Validated<AssignmentFormValues> {
  const tab = validateSheetTab(fieldValue(formData, 'sheet_tab'), takenTabs);
  if (!tab.ok) return tab;

  const sales = validatePersonRef('sales', fieldValue(formData, 'sales_id'));
  if (!sales.ok) return sales;

  const productBuddy = validatePersonRef('product_buddy', fieldValue(formData, 'product_buddy_id'));
  if (!productBuddy.ok) return productBuddy;

  const quoting = validatePersonRef('quoting', fieldValue(formData, 'quoting_id'));
  if (!quoting.ok) return quoting;

  return {
    ok: true,
    value: {
      sheet_tab: tab.value,
      sales_id: sales.value as string,
      product_buddy_id: productBuddy.value,
      quoting_id: quoting.value,
    },
  };
}
