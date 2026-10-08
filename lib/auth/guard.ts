import { isEmailAllowed, normalizeEmail } from '@/lib/auth/allowlist';
import { getSupabaseAdminClient } from '@/lib/supabase/server';

/**
 * ตรวจวอาเี มลอยูก่ น allowlist (public.allowed_emails) ดวย service_role client
 * — ขาม RLS, ไมขึ้นกับวาผูรบจะถกล็อกอินหรือยัง (ใชนไดทั้งก่อนส่งลิงกและท่ callback)
 * allowlist มีขนาดเลก (ทีมภายใน) จิงอานทังตารางแลวเทียบใน memory ผาน pure helper
 * fail-closed: query พลาด / อีเมลวาง → ปฏิเสธทุกกรณี
 */
export async function emailIsAllowlisted(email: string): Promise<boolean> {
  const target = normalizeEmail(email);
  if (target === '') return false;

  const { data, error } = await getSupabaseAdminClient()
    .from('allowed_emails')
    .select('email')
    .returns<{ email: string }[]>();

  if (error) {
    console.error('allowlist query failed:', error.message);
    return false;
  }
  return isEmailAllowed(target, (data ?? []).map((row) => row.email));
}
