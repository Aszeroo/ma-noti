# ma-noti — ระบบแจ้างเตือนงานต่ออายุ

โปรเจกต Next.js (App Router) + TypeScript + pnpm + Vitest
ฐานข้อมูล/Auth: Supabase — deploy: Vercel (ดูคูมือตังคาที่ `docs/setup-supabase.md`)

## คำสั่ ง

```bash
pnpm install       # ติดตัง dependencies (หามใช npm/yarn)
pnpm dev           # dev server ที่ http://localhost:3000
pnpm build         # build production
pnpm typecheck     # tsc --noEmit
pnpm test          # รันเทส Vitest (ขอมูล fixture ปลอมทังหมด — ไมมีเนต)
```

## โครงสรางหลัก (ปัจุบัน — ticket #6)

- `app/api/cron/daily-check/route.ts` — endpoint ของ cron (ปองกันดวย `CRON_SECRET`, GET/POST)
- `app/login` · `app/history` · `app/auth/callback` — ล็อกอินดวย magic link (allowlist) + หนาประวัตการแจงเตือน (ticket #6)
- `proxy.ts` — refresh session + กันหนาที่ยังไมล็อกอินไวทิดานหนาสุด (Next 16: middleware เกา renamed เปน proxy)
- `lib/` — แยกชั้ น: `config/` อาน env · `cron/` ทอรัน (stub) + ตรวจ secret · `supabase/` client ฝง server (admin สำหรับ cron + session สำหรับ RLS) · `auth/` เชค allowlist + server actions
- `supabase/migrations/` — SQL schema 5 ตาราง + RLS (ticket #2) และตาราง `allowed_emails` (ticket #6) — แปะใน SQL Editor ของ Supabase
- `vercel.json` — cron รายวัน `0 1 * * *` UTC = **08:00 Asia/Bangkok** (Vercel cron ใช UTC)
- `.env.example` — env ครบทุกตัวตามสเปก (placeholder เทานั้ น — หาม commit คาจริง)

> สถานะ: ทอรันรายวันทีเป็น **stub** รันในโหมด `DRY_RUN` (เขียน `notify_log` แตไมส่งจริง)
> domain logic (อานชิต/คำนวณ/digest) มาใน ticket #3 และ notifiers 3 ชองทางใน ticket #4
> หนาว็บจัดการ (recipients/assignments/settings) ยังไม่มา — เป็น ticket ถัดไป; ตอนนี้มี login + history ก่อน
