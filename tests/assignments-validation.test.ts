import { describe, expect, it } from 'vitest';

import {
  ASSIGNMENT_PARTIES,
  MAX_TAB_NAME_LENGTH,
  OPTIONAL_PARTIES,
  isAssignmentParty,
  isUuid,
  parseAssignmentForm,
  partyRequiresPerson,
  validatePersonRef,
  validateSheetTab,
} from '@/lib/assignments/validation';

/** ทักข้อมูลในไฟลนนีเป็น fixture ปลอม — UUID สมมติทังสิน ไมมีข้อมูลจริงลง repo */

const SALES_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const BUDDY_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const QUOTING_ID = '9b2e436f-c4c9-4e0a-bb1d-4c2b9e2b6a11';
const THAI_TEXT = /[฀-๿]/;

describe('validateSheetTab — ตองตรงตามชือแท็บในชีต', () => {
  it('trim spacing รอบขางกอนเก็บบันทึก', () => {
    expect(validateSheetTab('  Sales - ภาคกลาง  ')).toEqual({
      ok: true,
      value: 'Sales - ภาคกลาง',
    });
  });

  it('วางSpacing ลวน → error ภาษาไทย code invalid_tab', () => {
    const result = validateSheetTab('   ');
    expect(result).toEqual({
      ok: false,
      code: 'invalid_tab',
      error: expect.stringMatching(THAI_TEXT),
    });
  });

  it('ยาวเกนกำหนด → error, พอดีขีดจำกัด → ผาน', () => {
    expect(validateSheetTab('ก'.repeat(MAX_TAB_NAME_LENGTH + 1)).ok).toBe(false);
    expect(validateSheetTab('ก'.repeat(MAX_TAB_NAME_LENGTH)).ok).toBe(true);
  });

  it('ชือแท็บซ้ํากับแถวอื่นในระบบ → code tab_taken', () => {
    const result = validateSheetTab('Sales - ภาคกลาง', ['งานโครงการ', 'Sales - ภาคกลาง']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('tab_taken');
  });

  it('เทียบชือแบบ case-sensitive ตาม unique constraint ของตาราง', () => {
    expect(validateSheetTab('sales - ภาคกลาง', ['Sales - ภาคกลาง']).ok).toBe(true);
  });

  it('ตอนแกไขยกเวนแถวของตัวเองได (takenTabs มีแตแถวอื่น)', () => {
    expect(validateSheetTab('Sales - ภาคกลาง', ['งานโครงการ']).ok).toBe(true);
  });
});

describe('partyRequiresPerson — มีเฉพาะ sales ที่ขาดไมได', () => {
  it('sales required; product_buddy และ quoting เว้นได', () => {
    expect(partyRequiresPerson('sales')).toBe(true);
    expect(partyRequiresPerson('product_buddy')).toBe(false);
    expect(partyRequiresPerson('quoting')).toBe(false);
    expect(OPTIONAL_PARTIES).toEqual(['product_buddy', 'quoting']);
    expect(ASSIGNMENT_PARTIES).toEqual(['sales', 'product_buddy', 'quoting']);
  });
});

describe('validatePersonRef — เลอกคนตอหนึงฝาย', () => {
  it('UUID จาก dropdown → คืนคาเดิม (trim ดวย)', () => {
    expect(validatePersonRef('quoting', ` ${QUOTING_ID} `)).toEqual({ ok: true, value: QUOTING_ID });
  });

  it('คนเดียวกันเลอกซ้ําหลายฝายของแท็บเดียวได (ไมมี unique กันคน)', () => {
    expect(validatePersonRef('product_buddy', SALES_ID)).toEqual({ ok: true, value: SALES_ID });
    expect(validatePersonRef('quoting', SALES_ID)).toEqual({ ok: true, value: SALES_ID });
  });

  it('คาว่าง = ยังไมผูก = null เฉพาะฝายOptional', () => {
    expect(validatePersonRef('product_buddy', '')).toEqual({ ok: true, value: null });
    expect(validatePersonRef('quoting', '   ')).toEqual({ ok: true, value: null });
  });

  it('sales วาง → code sales_required พรอมขอความภาษาไทย', () => {
    const result = validatePersonRef('sales', '');
    expect(result).toEqual({
      ok: false,
      code: 'sales_required',
      error: expect.stringMatching(THAI_TEXT),
    });
  });

  it('คาไมใช UUID (คาปลอมใน field) → code invalid_person', () => {
    const result = validatePersonRef('sales', 'drop-table');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_person');
  });
});

describe('isAssignmentParty / isUuid — กรองคาทีมาจากฟอรม', () => {
  it('รบสามฝายตามสเปกเทานัน', () => {
    expect(isAssignmentParty('sales')).toBe(true);
    expect(isAssignmentParty('product_buddy')).toBe(true);
    expect(isAssignmentParty('quoting')).toBe(true);
    expect(isAssignmentParty('manager')).toBe(false);
    expect(isAssignmentParty('')).toBe(false);
  });

  it('isUuid รับ UUID มาตรฐานเทานัน (lib/recipients/validation)', () => {
    expect(isUuid(SALES_ID)).toBe(true);
    expect(isUuid(SALES_ID.toUpperCase())).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

/** สรางFormData ตามชือfieldจริงของหนาที้ assignments */
function assignmentForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set('sheet_tab', 'Sales - ภาคกลาง');
  form.set('sales_id', SALES_ID);
  form.set('product_buddy_id', BUDDY_ID);
  form.set('quoting_id', QUOTING_ID);
  for (const [name, value] of Object.entries(overrides)) form.set(name, value);
  return form;
}

describe('parseAssignmentForm — ตรวจทังฟอรมกอนเขียน DB', () => {
  it('ฟอรมครบ → คืนคอลัมตามตาราง (trim ชื่อแท็บ)', () => {
    expect(parseAssignmentForm(assignmentForm({ sheet_tab: '  งานโครงการ  ' }), [])).toEqual({
      ok: true,
      value: {
        sheet_tab: 'งานโครงการ',
        sales_id: SALES_ID,
        product_buddy_id: BUDDY_ID,
        quoting_id: QUOTING_ID,
      },
    });
  });

  it('เวนสองฝายOptional ได → คืนnullใหเขียนทับของเดิม', () => {
    const result = parseAssignmentForm(assignmentForm({ product_buddy_id: '', quoting_id: '' }), []);
    expect(result.ok && result.value).toEqual({
      sheet_tab: 'Sales - ภาคกลาง',
      sales_id: SALES_ID,
      product_buddy_id: null,
      quoting_id: null,
    });
  });

  it('ไมมี sales → fail กอนแตะ DB', () => {
    const result = parseAssignmentForm(assignmentForm({ sales_id: '' }), []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('sales_required');
  });

  it('แท็บซ้ํากบแถวอื่น → tab_taken', () => {
    const result = parseAssignmentForm(assignmentForm(), ['Sales - ภาคกลาง']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('tab_taken');
  });

  it('เรียงลำดบั fail-fast: แท็บ → sales → ฝายOptional', () => {
    const result = parseAssignmentForm(assignmentForm({ sheet_tab: '', sales_id: '' }), []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_tab');
  });

  it('คนเดียวนังสามฝายของแท็บเดียว → through validation (คนไดหลายบทบาท)', () => {
    const result = parseAssignmentForm(
      assignmentForm({ product_buddy_id: SALES_ID, quoting_id: SALES_ID }),
      [],
    );
    expect(result.ok && result.value).toEqual({
      sheet_tab: 'Sales - ภาคกลาง',
      sales_id: SALES_ID,
      product_buddy_id: SALES_ID,
      quoting_id: SALES_ID,
    });
  });
});
