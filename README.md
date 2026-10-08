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

## โครงสรางหลัก (ปจจุบัน — ticket #5)

- `app/api/cron/daily-check/route.ts` — endpoint ของ cron (ปองกันดวย `CRON_SECRET`, GET/POST) — ตังแต ticket #5: ดึงชีตจริงทุกแท็บ + โหลดคอนฟิกรวมจาก Supabase 4 ตาราง แลวเขียน log
- `app/login` · `app/history` · `app/auth/callback` — ล็อกอินดวย magic link (allowlist) + หนาประวัตการแจงเตือน (ticket #6)
- `proxy.ts` — refresh session + กันหนาที่ยังไมล็อกอินไวทิดานหนาสุด (Next 16: middleware เกา renamed เปน proxy)
- `lib/` — แยกชั้น: `config/` อ่าน env + `team-config` โหลดคอนฟิกทีมจาก Supabase · `cron/` endpoint shell (verify secret + today ตามเวลา Bangkok) · `sheets/` ตัวอ่านชีตผ่าน Service Account · `domain/` ทอรวนหลัก (pure) · `supabase/` client ฝั่ง server · `auth/` allowlist + server actions
- `supabase/migrations/` — SQL schema 5 ตาราง + RLS (ticket #2) และตาราง `allowed_emails` (ticket #6) — แปะใน SQL Editor ของ Supabase
- `vercel.json` — cron รายวัน `0 1 * * *` UTC = **08:00 Asia/Bangkok** (Vercel cron ใช UTC)
- `.github/workflows/cron-fallback.yml` — ทางสำรอง: GitHub Actions ยิง endpoint เดียวกันดวย secret เดียวกัน (01:30 UTC + manual trigger)
- `.env.example` — env ครบทุกตัวตามสเปก (placeholder เทานั้ น — หาม commit คาจริง)

> สถานะ: ทอรันรายวันตอกับของจริงแลว — อาน Google Sheet ทุกแท็บ (Service Account แบบ Viewer) → โหลดคอนฟิก 4 ตาราง →
> `runDaily` → เขียน `notify_log` ตอคน/ชองทาง + แถวระดับรอบรัน (ทุกกรอบรันมีหลักฐานเสมอ แมคอนฟิกวาง)
> และสงจริง 3 ทางผาน Brevo/Discord/Telegram แลว (ticket #10) — `DRY_RUN=true` (คาเริ่มตน) = เขียน log
> แบบ dry_run = ไมยิงอะไรเลย ปดแลว (`false`) จึงยิงจริง ดูวิธียืนยันกอนปดที่ `docs/deploy.md` ขอ 6–8
> คอนฟิกทีม (people/channels/assignments) เติมผานหนา admin: `app/recipients` · `app/assignments` · `app/settings`;
> คูมือชีตใหม: `docs/setup-google-sheet.md`; คู้มือตังคาผู้ส่งจริง (Brevo/Discord/Telegram): `docs/setup-senders.md`

## Deploy ขึ้น Vercel (ticket #11)

```bash
# cron อยูใน vercel.json แลว (0 1 * * * UTC = 08:00 Asia/Bangkok) — deploy แรกเปด DRY_RUN เสมอ
```

คูมือ checklist แบบขั้นตองทำทีละขอกับมือ (Vercel project + env ครบ + secret ฝัง GitHub + manual
trigger ทดสอบทางสำรอง + เติมคอลัมสถานะในชีต + วิธียอย DRY_RUN เปนสงจริง): **`docs/deploy.md`**
