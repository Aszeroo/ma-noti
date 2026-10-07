-- ma-noti — initial schema (ticket #2)
-- 5 ตารางตามสเปก: people, channels, assignments, settings, notify_log
-- RLS ทุกตาราง: ล็อกอินแล้ว (role authenticated) = อ่าน/เขียนได้ทังหมด
--                   ยังไมล็อกอิน (anon) = แตะไมได (ไมมี policy ให anon)
-- หมายเหตุ: cron ใช service_role key ซึ่่งขาม RLS (BYPASSRLS) ตามแบบ Supabase
-- วิธีรัน: แปะไฟลนี้ใน Supabase SQL Editor (หรือ supabase db push)

-- gen_random_uuid() — Supabase มีใหใน schema extensions แลว; pgcrypto เปน fallback สำหรบั DB ทวไป
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- people --
-- ผู้รับทุกคน (sales / โปรดัก buddy / ทีมขอใบราคา) — เลิกใชให active=false แทนลบ
create table public.people (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------- channels --
-- ช่องทางส่งต่อคน (1 คนมีไดหลายช่องทาง); contact จริงอยู่เฉพาะใน DB — ห้ามลง repo
create table public.channels (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.people (id) on delete cascade,
  type       text not null constraint channels_type_check check (type in ('email', 'discord', 'telegram')),
  contact    text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index channels_person_id_idx on public.channels (person_id);

-- ----------------------------------------------------------- assignments --
-- ผูกแท็บ Sales ในชีต → ผู้รับ 3 ฝา่ย์ (หน่า /assignments future ticket)
create table public.assignments (
  id                uuid primary key default gen_random_uuid(),
  sheet_tab         text not null unique,
  sales_id          uuid not null references public.people (id) on delete restrict,
  product_buddy_id  uuid          references public.people (id) on delete restrict,
  quoting_id        uuid          references public.people (id) on delete restrict,
  created_at        timestamptz not null default now()
);

-- -------------------------------------------------------------- settings --
-- ตารางแถวเดียว (id = 1 เท่านั้น): รอบเตือนต่อฝา่ย์, เวลา, เวลาโซน
create table public.settings (
  id         smallint primary key default 1 constraint settings_single_row_check check (id = 1),
  lead_times jsonb not null default '{"sales":[30,14,7,3,1],"product_buddy":[30,14,7,3,1],"quoting":[60,45,30]}'::jsonb,
  send_time  time not null default '08:00',
  timezone   text not null default 'Asia/Bangkok',
  updated_at timestamptz not null default now()
);

-- แถวเดียวตามสเปก: ค่าเริ่มต้นรอบเตือน 30/14/7/3/1 (sales, product_buddy) และ 60/45/30 (quoting)
insert into public.settings (id) values (1)
on conflict (id) do nothing;

-- ------------------------------------------------------------ notify_log --
-- ประวัติการแจ้างเตือนทุกวัน (เขียนทุกวัน — กัน Supabase free tier หลับ)
-- dry_run = DRY_RUN marker ของแต่ละรอบรัน; row ระดับ run มี person_id/channel เป็น null
create table public.notify_log (
  id         bigint generated always as identity primary key,
  sent_at    timestamptz not null default now(),
  person_id  uuid references public.people (id) on delete set null,
  channel    text constraint notify_log_channel_check check (channel in ('email', 'discord', 'telegram')),
  item_count integer not null default 0,
  details    jsonb not null default '{}'::jsonb,
  dry_run    boolean not null default true
);

create index notify_log_sent_at_idx    on public.notify_log (sent_at desc);
create index notify_log_person_id_idx  on public.notify_log (person_id);

-- -------------------------------------------------------------------- RLS --
alter table public.people       enable row level security;
alter table public.channels     enable row level security;
alter table public.assignments  enable row level security;
alter table public.settings     enable row level security;
alter table public.notify_log   enable row level security;

-- ทีมเล็ก: ล็อกอินแล้ว = อ่าน/เขียนได้ทังหมด (ยังไมมี role ซับซ้อน)
-- ไมมี policy สำหรับ anon → ผู้ยังไมล็อกอินแตะขอมูลไมได
create policy people_authenticated_all on public.people
  for all to authenticated using (true) with check (true);

create policy channels_authenticated_all on public.channels
  for all to authenticated using (true) with check (true);

create policy assignments_authenticated_all on public.assignments
  for all to authenticated using (true) with check (true);

create policy settings_authenticated_all on public.settings
  for all to authenticated using (true) with check (true);

create policy notify_log_authenticated_all on public.notify_log
  for all to authenticated using (true) with check (true);
