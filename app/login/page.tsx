import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { redirect } from 'next/navigation';

import { signInWithMagicLink } from '@/lib/auth/actions';
import { createSessionSupabaseClient } from '@/lib/supabase/session';

export const metadata: Metadata = {
  title: 'ล็อกอิน — ma-noti ระบบแจ้างเตือนงานต่ออายุ',
};

const ERROR_TEXT: Record<string, string> = {
  missing_email: 'กรอกอเี มลให้ถูกรูปแบบก่อน',
  not_allowed: 'อีเมลนไี้ ม่อยู่ในรายการอนุญาต (allowlist) — ติดตอผู้ดแลระบบเพื่อเพิ่มอีเมล',
  send_failed: 'ส่งลิงก์ล็อกอินไม่สำเร็จ — ลองอีกครั้งหรือติดต่อผู้ดูแลระบบ',
  expired: 'ลิงก์ล็อกอินหมดอายุหรือใช้แล้ว — กรอกอีเมลเพื่อขอลิงก์ใหม่',
  invalid_link: 'ลิงก์ล็อกอินไม่ถูกต้อง — กรอกอีเมลเพื่อขอลิงก์ใหม่',
};

const fieldStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: '24rem',
  padding: '0.5rem 0.75rem',
  fontSize: '1rem',
  border: '1px solid #999',
  borderRadius: '0.375rem',
  boxSizing: 'border-box',
};

/** หนา login (ticket #6): magic link สำหรับอีเมลใน allowlist เท่านั้น */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ล็อกอินแล้วไม่ต้องเห็นหน้านี้ — proxy กันให้อีกชั้น
  const supabase = await createSessionSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect('/history');

  const params = await searchParams;
  const errorKey = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorText = errorKey ? ERROR_TEXT[errorKey] : undefined;
  const sent = params.sent !== undefined;

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: '36rem',
        margin: '4rem auto',
        padding: '0 1rem',
        color: '#1a1a1a',
      }}
    >
      <h1>ma-noti — ล็อกอิน</h1>
      <p style={{ color: '#555' }}>
        ระบบแจ้งเตือนงานต่ออายุสำหรับทีมภายใน — กรอกอีเมลเพื่อรับลิงก์ล็อกอินครั้งเดียว (magic link)
        ใช้ได้เฉพาะอีเมลที่ทีมเพิ่มในรายการอนุญาตเท่านั้น
      </p>

      {sent && (
        <p role="status" style={{ color: '#166534', fontWeight: 600 }}>
          ส่งลิงก์ล็อกอินไปที่อีเมลแล้ว — เปิดลิงก์ในกล่องจดหมายภายใน 15 นาทีก่อนลิงก์หมดอายุ
        </p>
      )}
      {errorText && (
        <p role="alert" style={{ color: '#b91c1c', fontWeight: 600 }}>
          {errorText}
        </p>
      )}

      <form action={signInWithMagicLink} style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
        <label htmlFor="email" style={{ fontWeight: 600 }}>
          อีเมลของทีม
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@yourteam.example"
          style={fieldStyle}
        />
        <button
          type="submit"
          style={{
            justifySelf: 'start',
            padding: '0.5rem 1.25rem',
            fontSize: '1rem',
            backgroundColor: '#1d4ed8',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          ส่งลิงก์ล็อกอิน
        </button>
      </form>
    </main>
  );
}
