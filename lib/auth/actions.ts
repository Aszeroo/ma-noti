'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { normalizeEmail } from '@/lib/auth/allowlist';
import { emailIsAllowlisted } from '@/lib/auth/guard';
import { createSessionSupabaseClient } from '@/lib/supabase/session';

/**
 * จากหน้า login: ส่ง magic link ไปทอี่ เี มล (signInWithOtp)
 * pre-check allowlist กอนส่ง (UX ด + ไมสราง user ใหคนนอก) — บานปรตูตวัจรงิ ยงอยทู่ี callback
 */
export async function signInWithMagicLink(formData: FormData): Promise<void> {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  if (email === '' || !email.includes('@')) {
    redirect('/login?error=missing_email');
  }
  if (!(await emailIsAllowlisted(email))) {
    redirect('/login?error=not_allowed');
  }

  const headerList = await headers();
  const origin =
    headerList.get('origin') ??
    `${headerList.get('x-forwarded-proto') ?? 'http'}://${headerList.get('host') ?? 'localhost:3000'}`;

  const supabase = await createSessionSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    console.error('signInWithOtp failed:', error.message);
    redirect('/login?error=send_failed');
  }
  redirect('/login?sent=1');
}

/** จาก header หนาวับเว็บทไี่ล็อกอินแลว: ออกจากระบบ (ลาง session cookie ทักน) */
export async function signOut(): Promise<void> {
  const supabase = await createSessionSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('signOut failed:', error.message);
  }
  redirect('/login');
}
