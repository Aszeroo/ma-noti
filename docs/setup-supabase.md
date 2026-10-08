# คู้มือตังคางาน: Supabase + env (ticket #2)

คู้มือ step-by-step สำหรบั ผู้ใช้ — สร้าง Supabase project `ma-noti` (Singapore), แปะ migration, และตัง env ครบทุกตัวตามสเปก

> **กฎเหล็กของ repo public:** ห้าม secret / ขอมูลจริง (email, webhook URL, chat_id, คีย์, JSON service account) ลง git ทุกรอง — ทิงหมดอยูใน `.env` (ไมถกู commit) และ Vercel Environment Variables เทานั้ น
> ไฟล `.env.example` ใน repo มี placeholder ทุกลิสทิ ที่ตองเติม — เปนแบบไดโอยไมมีคาจริง

## 0) เตรียม toolchain (ครังเดียว)

```bash
node --version    # ตอง >= 20.9 (แนะนำ LTS 22.x)
corepack enable   # เปดใช pnpm ผาน corepack (พนกนปญหา npm/yarn ผานกัน)
pnpm --version    # >= 9
```

```bash
pnpm install
pnpm test         # Vitest — ฐานขอมูลจรงไมตองการ (fixture ปลอมทังหมด)
pnpm typecheck
pnpm build
```

## 1) สร้างโปรเจกต Supabase `ma-noti`

1. เขาสู [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. ตั้งคา:
   - Project name: `ma-noti`
   - Database password: สรางรหสั เขมแข็ง → **บนทกไว** (ไมไดไมเปนไรแตงาย — เขาดาน dashboard ไดทุกรอบ)
   - Region: **Singapore (ap-southeast-1)**
3. กด Create และรอ provision ~1 นาที (Green = พรอม)

## 2) แปะ migration (ตาราง 5 ตัว + RLS)

**วิธีงายสุด (แนะนำ):**
1. dashboard → **SQL Editor** → **New query**
2. เปดไฟล `supabase/migrations/20261007000000_init.sql` จาก repo → copy ทังไฟลวางลง query → **Run**
3. ตรวจวาสำเร็จ: SQL Editor รัน

   ```sql
   select tablename from pg_tables where schemaname = 'public'
   order by tablename;
   -- ตองเห็น: assignments, channels, notify_log, people, settings
   ```

**วิธีทางเลอก (ถาใช Supabase CLI):** `supabase login` → `supabase link --project-ref <ref>` → `supabase db push`

ผลลัพธที่ได้:
- ตารางตรงตามสเปก: `people`, `channels`, `assignments`, `settings` (seed แถวเดียว id=1, รอบเตอน 30/14/7/3/1 และ 60/45/30), `notify_log` (มีคอลัม `dry_run` เปน DRY_RUN marker)
- **RLS เปดทุกตาราง + มี policy ใหเฉพาะ `authenticated`** → ล็อกอินแลวอาง/เขียนไดทงหมด, ยังไมล็อกอิน (anon) แตะไมได
- หมายเหต: cron เขียน log ผาน service role ไดแลว — หนาเว็บ (login + history + allowlist) เปดใชใน ticket #6 ตอทายขางลาง

## 2.1) migration ticket #6: allowlist + ล็อกอิน magic link

1. dashboard → **SQL Editor** → **New query**
2. เปดไฟล `supabase/migrations/20261008000000_auth_allowlist.sql` จาก repo → copy ทังไฟลวางลง query → **Run**
3. **เพิมอเี มลของคนในทีมเขา allowlist** (ทำผาน SQL Editor / service_role เทานัน — หนาเว็บแกเองไมได):

   ```sql
   insert into public.allowed_emails (email) values ('someone@example.com');
   -- ตรวจ: select * from public.allowed_emails;
   ```

4. ทดสอบล็อกออิน: `pnpm dev` → เปด `http://localhost:3000` → จะถูกส่งไปหนา login → กรอกอีเมลใน allowlist → เปิดลิงกในอีเมล
   - คนนอก allowlist: ระบบไมสงลิงกให (pre-check) และถาหลุดมาถึง callback จะถูก signOut + เด้งกลับหนา login (fail-closed)
   - ล็อกอินแล้วเห็นหน้า **ประวัติการแจ้งเตือน** (`notify_log` เวลา / ผู้รับ / ช่องทาง / จำนวนรายการ / DRY_RUN) — ตอนนี้อาจยังว่าง (รอ cron รันครั้งแรก)
   - ออกจากระบบ: กดปุ่มมุมขวาบนของหน้าประวัติ


## 3) จัวะคีย์มาใส env

dashboard → **Project Settings → API Keys** (โปรเจกตรนใหมอาจเรียกวา "Publishable / Secret keys"):

| ตัวใน `.env` | ตัวใน dashboard | ไดถง |
|---|---|---|
| `SUPABASE_URL` | Project URL | server |
| `SUPABASE_ANON_KEY` | `anon` / `publishable` key | server (อนาคตอาจเผยแพรได เพราะ RLS กัน anon อยูแลว) |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` / `secret` key | **server/cron เทานั้ น — หามเผยแพรทิงหมด** |

```bash
openssl rand -hex 32   # ผลลัพธ 1 บรรทัด = คาของ CRON_SECRET
```

## 4) เติม `.env` ทองถิน + ทดสอบโคงสราง

```bash
cp .env.example .env   # แลวเติมคา: SUPABASE_*, CRON_SECRET ( GOOGLE_* / BREVO_* ทิ้ง placeholder ไหว — ยงไมไดใชใน ticket #2 )
pnpm dev               # เปิด http://localhost:3000
```

ลองยิง endpoint 3 กรณี (ในอีก terminal):

```bash
# 1) ไมมี secret → ตองได 401
curl -i -X POST http://localhost:3000/api/cron/daily-check

# 2) secret ผิด → ตองได 401
curl -i -X POST http://localhost:3000/api/cron/daily-check -H "Authorization: Bearer wrong"

# 3) secret ถู → ตองได 200 {ok:true,mode:"dry_run",logged:1}
curl -i -X POST http://localhost:3000/api/cron/daily-check \
  -H "Authorization: Bearer <CRON_SECRET จาก .env>"
```

ตรวจ log ใน Supabase (SQL Editor):

```sql
select sent_at, dry_run, details from public.notify_log order by sent_at desc limit 5;
-- ตองเห็นแถว dry_run = true, details.marker = "DRY_RUN"
```

## 5) Deploy Vercel + ใส env ครบทุกตัว

1. [vercel.com](https://vercel.com) → **Add New… → Project** → import repo `Aszeroo/ma-noti` (framework detect: Next.js — กด Deploy)
2. **Project → Settings → Environment Variables** → Production เพิ่มครบ:

   | Variable | คา |
   |---|---|
   | `SUPABASE_URL` | Project URL ข้างบน |
   | `SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (server เทานั้ น) |
   | `GOOGLE_SHEET_ID` | Sheet ID (ticket #3 ตองการ — ใสไวไดเลย) |
   | `GOOGLE_SERVICE_ACCOUNT` | JSON key ทั้งก้อน **บรรทัดเดียว** (เลือก type = Sensitive ไมออก log) |
   | `BREVO_API_KEY` | Brevo API key (ticket #4 ใช) |
   | `CRON_SECRET` | คาที generated ข้างบน |
   | `DRY_RUN` | `true` — **คาเริ่ มตนเสมอ อยาปดจนกวา ticket #4 จะเสร็จ** (ตอนน ปดแลว endpoint จะตอบ 501) |

3. **Redeploy** ให env มีผล (Deployments → ⋯ → Redeploy)

## 6) cron รายวัน — ประกาศไวใน repo แลว

`vercel.json` (อยูใน repo):

```json
{ "crons": [ { "path": "/api/cron/daily-check", "schedule": "0 1 * * *" } ] }
```

- Vercel cron นบั เวลา **UTC** → `0 1 * * *` = **08:00 Asia/Bangkok** ทุกวัน (ถายเวลา +7)
- Vercel จะส่ง `Authorization: Bearer $CRON_SECRET` ใหอตั โนมตัเิ มื่ อโปรเจกตมี env ชื่ อ `CRON_SECRET` — endpoint ของเราตรวจซำอีกชั้ นดวยตเองเสมอ (ไมมี/ผิด = 401)
- แพ็กเกจ Hobby: ยิงไดวันละ 1 ครั้ง และเวลาจริงอาจไหล ~1 ชม. — รับไดแลวตามสเปก (งานแจงเตอนเปนรายวัน)
- ตรวจสอบหลัง deploy: Vercel dashboard → **Project → Crons** เห็น schedule, และเชก `notify_log` วามีแถวใหม้เข้าทุกเช้า

ทดสอบบน production:

```bash
curl -i https://<app>.vercel.app/api/cron/daily-check                    # 401
curl -i -X POST https://<app>.vercel.app/api/cron/daily-check \
  -H "Authorization: Bearer <CRON_SECRET>"                               # 200 dry_run
```

## 7) ทางสำรอง (ticket #4 จะเตรียม workflow ให) — หลักการ

GitHub Actions ยิง endpoint เดิมไดไมตองแกโค้ด: ตัง secret `CRON_URL` (เช่น `https://<app>.vercel.app/api/cron/daily-check`) + `CRON_SECRET` ใน Settings → Secrets of the repo แลวยิง

```bash
curl -fsS -X POST "$CRON_URL" -H "x-cron-secret: $CRON_SECRET"
```

(รองรับ header `x-cron-secret` ไวเฉพาะกรณีนี้)

## เทสทังหมดกอน commit (กอนสราง PR)

```bash
pnpm test && pnpm typecheck && pnpm build
```
