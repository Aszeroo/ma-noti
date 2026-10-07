# ma-noti — ระบบแจ้งเตือนงานต่ออายุ

โปรเจกต์ Next.js (App Router) + TypeScript + pnpm + Vitest
ฐานข้อมูล/Auth: Supabase — deploy: Vercel (ดูคู่มือตั้งค่าที่ `docs/setup-supabase.md`)

## คำสั่ง

```bash
pnpm install       # ติดตั้ง dependencies (ห้ามใช้ npm/yarn)
pnpm dev           # dev server ถิ่่น http://localhost:3000
pnpm build         # build production
pnpm typecheck     # tsc --noEmit
pnpm test          # วิ่งเทสต์ Vitest (ข้อมูล fixture ปลอมทั้งหมด — ไม่มีเน็ต)
```

## โครงส้างหลัก (ปัจจุบัน — ticket #2)

- `app/api/cron/daily-check/route.ts` — endpoint ของ cron (ป้องกกันด้วย `CRON_SECRET`, GET/POST)
- `lib/` — แยกชั้่น: `config/` อ่าน env · `cron/` ท่อรัน (stub) + ตรวจ secret · `supabase/` client ฝั่่ง server
- `supabase/migrations/` — SQL schema 5 ตาราง + RLS (แปะใน SQL Editor ของ Supabase)
- `vercel.json` — cron รายวัน `0 1 * * *` UTC = **08:00 Asia/Bangkok** (Vercel cron ใช้ UTC)
- `.env.example` — env ครบทุกตัวตามสเปก (placeholder เท่านั้น — ห้าม commit ค่าจริง)

> สถานะ: ท่อรันรายวันทดที้เป็น **stub** รันในโหมด `DRY_RUN` (เขียน `notify_log` แต่ไม่ส่งจริง)
> domain logic (อ่านชีต/คำนวณ/digest) มาใน ticket #3 และ notifiers 3 ช่องทางใน ticket #4
