import { NextResponse } from 'next/server';

import { normalizeEmail } from '@/lib/auth/allowlist';
import { emailIsAllowlisted } from '@/lib/auth/guard';
import { createSessionSupabaseClient } from '@/lib/supabase/session';

/**
 * callback หลังคลิก magic link: แลก code → session (PKCE flow ของ @supabase/ssr)
 * บานปรตูจรงิ ของ allowlist อยูทน่ี — ผาน auth มาไดแต่ไมไ่ ทยูในรายการ → signOut ทันที (fail-closed)
 * route handler เขียน cookie ได (session ตังใหมถูกบันทกใน cookie ตงแตข้ั นตอนน)
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) {
    // Supabase ส่ง error param มาแทน (ลิงก์หมดอาย/ใชแ้ ลว/เสย)
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  const supabase = await createSessionSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=expired`);
  }

  const email = normalizeEmail(data.user?.email ?? '');
  if (await emailIsAllowlisted(email)) {
    return NextResponse.redirect(`${origin}/history`);
  }

  // อยู่นอก allowlist: ยืนยันอีเมลแล้วแต่ห้ามแตะข้อมูล — ล้าง session ที่พึ่งสร้าง
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    console.error('signOut after allowlist rejection failed:', signOutError.message);
  }
  return NextResponse.redirect(`${origin}/login?error=not_allowed`);
}
