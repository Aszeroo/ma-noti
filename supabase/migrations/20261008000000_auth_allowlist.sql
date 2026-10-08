-- ma-noti — allowlist สำหรับล็อกอิน magic link (ticket #6)
-- ตารางอีเมลที่อนุญาตตามสเปก: เฉพาะอีเมลในรายการที่ล็อกอินได้ — คนนอกถูกปฏิเสธที่ callback
-- จุดตรวจ 2 แห่ง (fail-closed): 1) ก่อนส่งลิงก์ผ่านหน้า login 2) หลังยืนยันลิงก์ที่ auth/callback
-- การเพิ่ม/ลบอีเมลทำผ่าน SQL Editor หรือ service_role เท่านั้น — ไม่เปิดให้เว็บบัญชีที่มีอยู่แก้ตารางเอง (กันคนนอกเพิ่มตัวเอง)
--
-- เป็นไฟล์ใหม่ (ticket #6) — ไม่แก้ 20261007000000_init.sql ที่รันทิ้งไว้แล้ว
-- วิธีรัน: แปะต่อท้ายใน Supabase SQL Editor (หรือ supabase db push)
-- หมายเหตุ: คอลัมน์ email เป็น primary key (กันซ้ำ) — ระบบ normalize เป็นพิมพ์เล็กก่อนตรวจเสมอ
--
-- ตัวอย่างการเพิ่มอีเมล (ห้ามใส่อีเมลจริงใน repo public):
--   insert into public.allowed_emails (email) values ('someone@example.com');

create table public.allowed_emails (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- RLS เหมือนทุกตารางในโปรเจกต์: ยังไม่ล็อกอิน (anon) แตะไม่ได้เลย
alter table public.allowed_emails enable row level security;

-- ล็อกอินแล้วอ่านได้ (หน้าเว็บไม่ได้ใช้ — เปิดไว้ตรวจสอบตัวเองได้); เขียนผ่าน API: service_role เท่านั้น
create policy allowed_emails_authenticated_read on public.allowed_emails
  for select to authenticated using (true);
