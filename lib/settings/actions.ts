'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  parseSettingsForm,
  type SettingsFormValues,
  type ValidationErrorCode,
} from '@/lib/settings/validation';
import { createSessionSupabaseClient } from '@/lib/supabase/session';

/**
 * Server actions ของหน้่่าตั้้้งค่่่า (ticket #9)
 * ทุก action ผ่่่าน session client ของผ้้้ใช้้ (RLS role authenticated) —
 * ห้้ามเอา admin client จาก lib/supabase/server.ts มาใช้้ในหน้้่าเว้็บบ (cron เท่่่านั้่้น)
 * error จาก validation -> redirect กลัับบมา /settings?error=<code> ใหหน้้่าแสดงแบนเนอรนน์์
 * (แพตเทิรนน์์เดีี่ยวกัับบ lib/recipients/actions.ts)
 * config loader ของ cron อ่่่าน DB สดทุกกรอบ (no caching) -> แก้้ไขกระทบ cron รอบต่ัดดไปทันทที
 * ตาราง settings มี แถวเดีีี่่ยว (id = 1)
 */

type SessionClient = Awaited<ReturnType<typeof createSessionSupabaseClient>>;

/** error จาก validation หรืืิอ DB -> redirect กลัับบมาหน้้่าพร้้้อม searchParam ของ code */
function fail(code: ValidationErrorCode | 'db_error'): never {
  redirect(`/settings?error=${code}`);
}

/** สำเร็ดจ: ล้างแคชของหน้้่าแล้้้วกลัับบไปยััังหน้้่า (Post/Redirect/Get) */
function done(): never {
  revalidatePath('/settings');
  redirect('/settings');
}

/** update แถว id = 1 — จริง (มีแถวอยู่แล้้ว) คืน true, ไม่มมีแถวเดิม (first save) คืน false */
async function updateSettingsRow(
  supabase: SessionClient,
  values: SettingsFormValues,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('settings')
    .update(values)
    .eq('id', 1)
    .select('id');

  if (error) {
    console.error('saveSettings update failed:', error.message);
    fail('db_error');
  }

  return Boolean(data?.length);
}

/** upsert แถวเดีี่ยว: update ก่่อน — มี 0 แถว (แถวหาย) = insert id = 1 (first create) */
async function writeSettings(values: SettingsFormValues): Promise<void> {
  const supabase = await createSessionSupabaseClient();

  if (await updateSettingsRow(supabase, values)) {
    return;
  }

  const { error: insertError } = await supabase
    .from('settings')
    .insert({ id: 1, ...values });
  if (insertError) {
    console.error('saveSettings insert failed:', insertError.message);
    fail('db_error');
  }
}

export async function saveSettings(formData: FormData): Promise<void> {
  const parsed = parseSettingsForm(formData);
  if (!parsed.ok) {
    fail(parsed.code);
  }

  await writeSettings(parsed.value);
  done();
}
