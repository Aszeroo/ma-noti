'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  validateChannelInput,
  validatePersonName,
  isUuid,
  type ChannelType,
} from '@/lib/recipients/validation';
import { createSessionSupabaseClient } from '@/lib/supabase/session';

/**
 * Server actions ของหน้าจัดการผู้รับ/ช่องทาง (ticket #7)
 * ทุก action ผ่าน session client ของผู้ใช้เท่านั้น → RLS role authenticated ดูแลอ่าน/เขียน
 * (ห้ามเอา admin client จาก lib/supabase/server.ts มาใช้ในหน้าเว็บ — cron เท่านั้นที่ใช้ได้)
 * error จาก validation → redirect กลับมาพร้อม ?error=<code> ให้หน้าแสดงแบนเนอร์
 * (แพตเทิร์นเดียวกับ lib/auth/actions.ts) — config loader ของ cron อ่าน DB สดทุกรอบ
 * การแก้ไขจึงส่งผลต่อ cron รอบถัดไปในทันทีโดยไม่ต้อง deploy
 */

type SessionClient = Awaited<ReturnType<typeof createSessionSupabaseClient>>;

/** ดึง id จาก hidden input และยืนยันว่าเป็น UUID — ผิดรูปให้หยุดก่อนแตะ DB */
function requireId(formData: FormData): string {
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/recipients?error=not_found');
  return id;
}

/** อ่านสถานะ active ใหม่ที่ UI ส่งมาใน hidden field (ตรงข้ามกับที่แสดงอยู่) */
function requireActive(formData: FormData): boolean {
  return String(formData.get('active') ?? '') === 'true';
}

/** คน/ช่องทางถูกทิ้งไปแล้วก่อนกดปุ่ม → 0 แถว → แจ้งผู้ใช้ชัด ๆ แทนการเงียบ */
function notFound(): never {
  redirect('/recipients?error=not_found');
}

/** สำเร็จ: ล้างแคชของหน้าแล้วกลับไปยังรายการล่าสุด (Post/Redirect/Get) */
function done(): never {
  revalidatePath('/recipients');
  redirect('/recipients');
}

/** เพิ่มแถวใหม่: error จาก DB → แบนเนอร์, สำเร็จ → กลับสู่หน้ารายการ */
async function insertRow(
  label: string,
  run: (supabase: SessionClient) => PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  const supabase = await createSessionSupabaseClient();
  const { error } = await run(supabase);
  if (error) {
    console.error(`${label} failed:`, error.message);
    redirect('/recipients?error=db_error');
  }
  done();
}

/** แก้/ลบตาม id: ถ้า DB คืน 0 แถว แปลว่าข้อมูล stale (ถูกคนอื่นลบไปแล้ว) */
async function mutateRow(
  label: string,
  run: (supabase: SessionClient) => PromiseLike<{
    data: { id: string }[] | null;
    error: { message: string } | null;
  }>,
): Promise<void> {
  const supabase = await createSessionSupabaseClient();
  const { data, error } = await run(supabase);
  if (error) {
    console.error(`${label} failed:`, error.message);
    redirect('/recipients?error=db_error');
  }
  if (!data || data.length === 0) notFound();
  done();
}


/** read+validate type/contact (both actions use the same shape of fields) */
function channelFormOrRedirect(formData: FormData): { type: ChannelType; contact: string } {
  const channel = validateChannelInput(
    String(formData.get('type') ?? ''),
    String(formData.get('contact') ?? ''),
  );
  if (!channel.ok) redirect(`/recipients?error=${channel.code}`);
  return channel.value;
}

// ------------------------------------------------------------ people ----

/** เพิ่มผู้รับ: ฟอร์มด้านบนสุดของหน้า */
export async function addPerson(formData: FormData): Promise<void> {
  const name = validatePersonName(String(formData.get('name') ?? ''));
  if (!name.ok) redirect(`/recipients?error=${name.code}`);
  await insertRow('addPerson', (supabase) => supabase.from('people').insert({ name: name.value }));
}

/** แก้ชื่อคน: ฟอร์ม inline ใต้แต่ละรายการ */
export async function renamePerson(formData: FormData): Promise<void> {
  const id = requireId(formData);
  const name = validatePersonName(String(formData.get('name') ?? ''));
  if (!name.ok) redirect(`/recipients?error=${name.code}`);
  await mutateRow('renamePerson', (supabase) =>
    supabase.from('people').update({ name: name.value }).eq('id', id).select('id'),
  );
}

/**
 * เปิด/ปิดใช้งานคน (active flag) — แยกจากลบ: ประวัติ notify_log เก่าทั้งหมดอยู่ครบ
 * ปุ่มบน UI ส่งสถานะที่ต้องการมาใน hidden field
 */
export async function setPersonActive(formData: FormData): Promise<void> {
  const id = requireId(formData);
  const active = requireActive(formData);
  await mutateRow('setPersonActive', (supabase) =>
    supabase.from('people').update({ active }).eq('id', id).select('id'),
  );
}

/**
 * ลบถาวร (hard delete) — ผู้ใช้เลือกเองได้ เพราะช่องทางถูก cascade ตามไปด้วย
 * ประวัติใน notify_log ไม่หาย: person_id ถูก set null ตาม FK ของตารางนั้นเอง
 * UI แยกปุ่มนี้จาก "ปิดใช้งาน" อย่างชัดเจน
 */
export async function deletePerson(formData: FormData): Promise<void> {
  const id = requireId(formData);
  await mutateRow('deletePerson', (supabase) =>
    supabase.from('people').delete().eq('id', id).select('id'),
  );
}

// ----------------------------------------------------------- channels ---

/**
 * เพิ่มช่องทางต่อคน (email/discord/telegram) — contact จริงลง DB เท่านั้น
 * ตรวจ (type, contact) ตามรูปแบบของประเภท: Discord ต้องเป็น webhook URL, Telegram เป็น chat id
 */
export async function addChannel(formData: FormData): Promise<void> {
  const personId = String(formData.get('person_id') ?? '');
  if (!isUuid(personId)) redirect('/recipients?error=not_found');

  const channel = channelFormOrRedirect(formData);
  await insertRow('addChannel', (supabase) =>
    supabase
      .from('channels')
      .insert({ person_id: personId, type: channel.type, contact: channel.contact }),
  );
}

/** แก้ไขช่องทาง: เปลี่ยนประเภท/คอนแทคต์ได้ — ตรวจคู่ด้วย validation ชุดเดียวกับตอนเพิ่มใหม่ */
export async function updateChannel(formData: FormData): Promise<void> {
  const id = requireId(formData);
  const channel = channelFormOrRedirect(formData);
  await mutateRow('updateChannel', (supabase) =>
    supabase
      .from('channels')
      .update({ type: channel.type, contact: channel.contact })
      .eq('id', id)
      .select('id'),
  );
}

/** เปิด/ปิดใช้งานช่องทาง — แยกจากลบแบบเดียวกัน (ปิดแล้ว cron รอบถัดไปข้ามทันที) */
export async function setChannelActive(formData: FormData): Promise<void> {
  const id = requireId(formData);
  const active = requireActive(formData);
  await mutateRow('setChannelActive', (supabase) =>
    supabase.from('channels').update({ active }).eq('id', id).select('id'),
  );
}

/** ลบช่องทางถาวร — ไม่กระทบประวัติการแจ้งเตือนที่ส่งผ่านมันไปแล้ว */
export async function deleteChannel(formData: FormData): Promise<void> {
  const id = requireId(formData);
  await mutateRow('deleteChannel', (supabase) =>
    supabase.from('channels').delete().eq('id', id).select('id'),
  );
}
