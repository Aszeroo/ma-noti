'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  isUuid,
  parseAssignmentForm,
  type AssignmentFormValues,
} from '@/lib/assignments/validation';
import { createSessionSupabaseClient } from '@/lib/supabase/session';

/**
 * Server actions ของหน้าการจัดฝ่ายต่อแท็บ (ticket #8)
 * ทุก action ใช้ session client ของผู้ใช้เท่านั้น → RLS คุมอ่าน/เขียน (ห้าม admin client จาก lib/supabase/server.ts)
 * error → redirect กลับมาพร้อม ?error=<code> ให้หน้าแสดงแบนเนอร์ (แพตเทิร์นเดียวกับ recipients)
 * lib/config/team-config.ts อ่าน assignments สดทุกรอบรัน จึงแก้หน้าเว็บแล้ว cron รอบถัดไปใช้ได้ทันที ไม่ต้อง deploy
 */

const PAGE = '/assignments';

/** Postgres unique violation ของคอลัมน์ sheet_tab — แปลเป็นข้อความไทยบนหน้า */
const UNIQUE_VIOLATION = '23505';

type DbError = { message: string; code?: string } | null;

/** แถวถูกลบไปแล้วก่อนกดปุ่ม → 0 แถว → แจ้งผู้ใช้ชัดเจนแทนการเงียบ */
function notFound(): never {
  redirect(`${PAGE}?error=not_found`);
}

/** สำเร็จ: ล้างแคชหน้าแล้วกลับสู่รายการล่าสุด (Post/Redirect/Get) */
function done(): never {
  revalidatePath(PAGE);
  redirect(PAGE);
}

/** แจ้ง error จาก DB: ชน unique ของชื่อแท็บ (23505) แปลให้เข้าใจง่าย ส่วนที่เหลือเป็น db_error */
function failOnDb(label: string, error: DbError): void {
  if (!error) return;
  console.error(`${label} failed:`, error.message);
  redirect(error.code === UNIQUE_VIOLATION ? `${PAGE}?error=tab_taken` : `${PAGE}?error=db_error`);
}

/** ดึง id จาก hidden input และยืนยันว่าเป็น UUID — ผิดรูปแบบให้หยุดก่อนแตะ DB */
function requireId(formData: FormData): string {
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) notFound();
  return id;
}

/**
 * ชื่อแท็บที่มีอยู่ในระบบแล้ว (อ่านก่อน validate เพื่อกันแท็บซ้ำ)
 * ตอนแก้ไขยกเว้นแถวของตัวเอง จึงแก้สนามอื่นของแถวเดิมได้โดยไม่ถูกนับว่าซ้ำ
 */
async function takenTabs(exceptId?: string): Promise<string[]> {
  const supabase = await createSessionSupabaseClient();
  const query = supabase.from('assignments').select('sheet_tab');
  const { data, error } = await (exceptId ? query.neq('id', exceptId) : query);
  if (error) failOnDb('takenTabs', error);
  return (data ?? []).map((row: { sheet_tab: string }) => row.sheet_tab);
}

/** อ่านและตรวจทั้งฟอร์ม โดยส่งรายชื่อแท็บที่ครองอยู่เข้าไปกันซ้ำ */
async function formValues(formData: FormData, exceptId?: string): Promise<AssignmentFormValues> {
  const values = parseAssignmentForm(formData, await takenTabs(exceptId));
  if (!values.ok) redirect(`${PAGE}?error=${values.code}`);
  return values.value;
}

// ------------------------------------------------------------------ actions --

/** เพิ่มแท็บใหม่: ชื่อแท็บ + เลือกหนึ่งคนต่อฝ่าย (เว้น product_buddy/quoting ได้) */
export async function addAssignment(formData: FormData): Promise<void> {
  const values = await formValues(formData);
  const supabase = await createSessionSupabaseClient();
  const { error } = await supabase.from('assignments').insert(values);
  failOnDb('addAssignment', error);
  done();
}

/**
 * แก้ไขการจับคู่: ชื่อแท็บและทั้งสามฝ่ายส่งมาพร้อมกันทั้งรอบ
 * เลือก "ยังไม่ได้ผูก" ค่ากลับมาเป็น null → cron รอบถัดไปข้ามฝ่ายนั้นทันที
 */
export async function updateAssignment(formData: FormData): Promise<void> {
  const id = requireId(formData);
  const values = await formValues(formData, id);
  const supabase = await createSessionSupabaseClient();
  const { data, error } = await supabase
    .from('assignments')
    .update(values)
    .eq('id', id)
    .select('id');
  failOnDb('updateAssignment', error);
  if (!data || data.length === 0) notFound();
  done();
}

/**
 * ลบแท็บออกจากการจัดฝ่าย — คนใน people และประวัติ notify_log ไม่หาย
 * หลังลบแลว cron รอบถัดไปจะไมส่งใครจากแท็บนนอีก (แท็บกลับสถานะยงไมผูก)
 */
export async function deleteAssignment(formData: FormData): Promise<void> {
  const id = requireId(formData);
  const supabase = await createSessionSupabaseClient();
  const { data, error } = await supabase.from('assignments').delete().eq('id', id).select('id');
  failOnDb('deleteAssignment', error);
  if (!data || data.length === 0) notFound();
  done();
}
