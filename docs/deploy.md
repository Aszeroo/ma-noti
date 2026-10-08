# คู่มือ deploy รอบแรก — Vercel + cron รายวัน + ทางสำรอง GitHub Actions (ticket #11)

เช็คลิสต์ขั้นตอนสุดท้ายของผู้ใช้: สร้าง Vercel project → ใส่ env ครบทุกตัว → ยืนยัน cron → ตั้ง secret
ฝั่ง GitHub → ทดสอบทางสำรอง → ตรวจ history รอบแรก (DRY_RUN) → เติมคอลัมน์สถานะในชีต → ค่อยพลิกเป็นส่งจริง

> **สำคัญ: deploy แรกต้องเปิด DRY_RUN** (`DRY_RUN=true`) — ทอรันครบทุกขั้นตอน + เขียน log
> แต่ไม่ส่งอะไรออกจริง (ไม่ยิง Brevo/Discord/Telegram) อ่านข้อ 7–8 เมื่อตรวจประวัติเรียบร้อยแล้วเท่านั้น
>
> **ห้าม commit secret ลง repo** — repo เป็น public ค่าจริงอยู่นอก git ทุกตัว: `.env` (local, ไม่ถูก
> commit) + Vercel Environment Variables (env ทั้งหมด) + GitHub Actions Secrets (เฉพาะ 2 ตัวที่จำเป็น)

---

## 0) เตรียมก่อน (ถ้ายังไม่ทำจากคู่มือก่อนหน้า)

- [ ] `docs/setup-supabase.md` — สร้างโปรเจกต์ Supabase + แปะ migration + seed (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] `docs/setup-google-sheet.md` — สร้าง Service Account + แชร์ชีตเป็น Viewer + หา Sheet ID (`GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT`)
- [ ] `docs/setup-senders.md` — เตรียมครบ 3 ตัวส่ง (`BREVO_*`, `TELEGRAM_BOT_TOKEN`)

---

## 1) สร้าง Vercel project และเชื่อม GitHub

1. เปิด [vercel.com](https://vercel.com/) → ล็อกอิน → **Add New… → Project**
2. เลือก repository **Aszeroo/ma-noti** (ถ้าไม่มี → **Adjust Git Permissions** ให้ Vercel เข้าถึง repo แล้ว Refresh)
3. Framework Preset: **Next.js** · Root Directory: `/` · Build/Output ปล่อย default (Next 16 จำค่าเองได้)
   - Vercel อ่าน `pnpm-lock.yaml` แล้วใช้ pnpm ให้อัตโนมัติ — ไม่ต้องแก้อะไร
4. กด **Deploy** — ครั้งแรกจะพังเพราะยังไม่มี env (หน้าเว็บ error / build fail เพราะ env missing)
   **ปกติได้** ให้ทำข้อ 2) ต่อแล้วกด Redeploy ใหม่

---

## 2) ใส่ Environment Variables ครบทุกตัวบน Vercel

Vercel project → **Settings → Environment Variables** → เพิ่มทีละตัว (ติ๊ก Environment: Production
กับ Preview ให้ครบ) ค่าทุกตัวมาจาก `.env` ในเครื่อง (ถ้ายังไม่มี: `cp .env.example .env` แล้วเติมค่าจริง)

| ตัวแปร | ค่าที่ตั้ง | ที่มา/คู่มือ | จำเป็น |
|---|---|---|---|
| `SUPABASE_URL` | Project URL | `docs/setup-supabase.md` ข้อ 1 | ✅ |
| `SUPABASE_ANON_KEY` | anon key | `docs/setup-supabase.md` ข้อ 1 | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (เขียน log) | `docs/setup-supabase.md` ข้อ 1 — type = **Sensitive** | ✅ |
| `GOOGLE_SHEET_ID` | Sheet ID จาก URL ชีต | `docs/setup-google-sheet.md` ข้อ 3 | ✅ |
| `GOOGLE_SERVICE_ACCOUNT` | JSON key เป็น string บรรทัดเดียว | `docs/setup-google-sheet.md` ข้อ 1–2 — type = **Sensitive** | ✅ |
| `BREVO_API_KEY` | Brevo Transactional API key | `docs/setup-senders.md` ข้อ 1 — type = **Sensitive** | ✅ |
| `BREVO_SENDER_EMAIL` | อีเมล sender ที่ยืนยันแล้ว | `docs/setup-senders.md` ข้อ 1 | ✅ |
| `BREVO_SENDER_NAME` | ชื่อผู้ส่ง | `docs/setup-senders.md` ข้อ 1 | ✅ |
| `TELEGRAM_BOT_TOKEN` | bot token จาก BotFather | `docs/setup-senders.md` ข้อ 3 — type = **Sensitive** | ✅ |
| `CRON_SECRET` | สร้างเอง: `openssl rand -hex 32` | จดไว้! ต้องใช้ซ้ำในข้อ 4 | ✅ |
| `DRY_RUN` | `true` (ค่าคงที่ตลอด) | พลิกเป็น `false` เมื่อพร้อม ดูข้อ 8 | ✅ |
| *(Discord)* | **ไม่มี env** — webhook URL ใส่ในหน้าจัดการผู้รับ (เก็บในฐานข้อมูล) | `docs/setup-senders.md` ข้อ 2 | — |

> **Env ทั้งหมดต้องอยู่บน Vercel เท่านั้น** — repo public อย่า commit `.env` หรือใส่ค่าจริงในไฟล์ใด ๆ
> (`.env.example` มี placeholder เท่านั้น ถ้าแก้ `.env.example` ให้คงรูปแบบ `replace_with_...` ไว้)
>
> เสร็จแล้ว: **Settings → Deployment Queue → Redeploy** (หรือ push ใหม่) เพื่อให้รันด้วย env ใหม่

---

## 3) ยืนยัน cron จาก vercel.json

`vercel.json` ใน repo ประกาศ cron รายวันไว้แล้ว — **ไม่ต้องใส่ manual บน dashboard**:

```json
{ "crons": [{ "path": "/api/cron/daily-check", "schedule": "0 1 * * *" }] }
```

- `0 1 * * *` = **01:00 UTC = 08:00 Asia/Bangkok** ทุกวัน (Vercel cron นับ UTC; Bangkok = UTC+7 ไม่มี DST)
- Vercel แผน **Hobby รันได้ 1 ครั้ง/วัน** และเวลาจริงอาจคลาดในช่วง ~1 ชั่วโมง — สเปกรับได้
- Vercel จะส่ง `Authorization: Bearer <CRON_SECRET>` ให้อัตโนมัติเมื่อตั้ง env `CRON_SECRET` ไว้
- ยืนยัน: Settings → **Cron Jobs** (รายการอ่านมาจาก vercel.json) หรือหลัง deploy แล้วดู
  Settings → **Functions → Logs** หา `GET /api/cron/daily-check` รอบ 01:00 UTC
- endpoint ไม่ cache ผล (route.ts ตั้ง `force-dynamic` — รับได้ทั้ง GET และ POST)

---

## 4) ตั้ง secret ฝั่ง GitHub (ทางสำรอง GitHub Actions)

Repo → **Settings → Secrets and variables → Actions → New repository secret** (2 ตัวเท่านั้น):

| Secret | ค่า |
|---|---|
| `CRON_SECRET` | ค่า **เดียวกันกับบน Vercel** (ข้อ 2) — endpoint ใช้ตัวเดียวกันตรวจ |
| `DEPLOY_URL` | URL production บน Vercel เช่น `https://app.vercel.app` — **ไม่มี `/api` ต่อท้าย** |

> **ห้าม hardcode โดเมนจริงหรือ secret ใน `.github/workflows/cron-fallback.yml`** — workflow ใช้ placeholder
> พร้อม guard ที่ fail พร้อมข้อความบอกชัดถ้ายังไม่ได้ตั้ง secret

**เทส manual trigger:** **Actions → "Cron fallback — ยิง /api/cron/daily-check" → Run workflow**
- เขียว + log โชว์ `{"ok":true,"mode":"dry_run","logged":N}` = ผ่าน
- แดงเพราะ 401 = `CRON_SECRET` สองฝั่งไม่ตรงกัน — แก้แล้วรันใหม่
- แดงเพราะ 503 = Vercel ยังไม่มี env `CRON_SECRET` — กลับไปข้อ 2

---

## 5) ทดสอบ workflow ด้วย manual trigger (ซ้ำอีกครั้งให้มั่นใจ)

ทำข้อ 4 แล้ว **กด Run workflow อย่างน้อย 1 ครั้งก่อนไว้ใจงานจริง** — ครั้งแรกมักพลาดตรง URL (เผลอใส่ `/api`
ต่อท้าย / ลืม `https://`) หรือ secret คนละค่า ผลที่ต้องได้: run เขียวภายใน ~1 นาที

เช็กเพิ่ม: รัน **2 ครั้งติดกันไม่พัง** — ทุกกรอบรันเขียน log ของตัวเองใน `notify_log` (ออกแบบไว้ตั้งแต่
ticket #5) การรันซ้ำในวันเดียวกันจึงไม่ทำให้ข้อมูลเพี้ยน

---

## 6) ตรวจหลักฐานหลัง cron รอบแรก (ยัง DRY_RUN)

หลังผ่านเช้า 08:00 วันถัดไป — อย่างน้อย 1 ใน 3 ทาง:

1. **หน้า History ในเว็บ** (ล็อกอินแล้ว) — จะเห็นรายการที่ควรแจ้งของเช้านี้ พร้อมป้ายกำกับ
   **DRY_RUN** (หน้า history จาก ticket #6)
2. **Supabase SQL Editor**:
   ```sql
   select sent_at, channel, dry_run, details
   from public.notify_log order by sent_at desc limit 20;
   ```
   - ต้องมีแถวระดับรอบรันทุกกรอบ (`details->>'stage' = 'run'`) พร้อม `dry_run = true`
   - มีแถวรายบุคคล/ช่องทางตามเงื่อนไข reminders
3. **Vercel Functions Logs** — หา request 200 ที่ `/api/cron/daily-check` รอบ 01:00 UTC

> ถ้า **ไม่มีอะไรเลย** → cron ยังไม่รัน: ตรวจว่า deploy production สำเร็จ + Settings → Cron Jobs ว่างหรือไม่
> หรือเวลายังไม่ถึง + ลองรัน manual จาก Actions ถ้ายัง 5xx ให้ดู error ใน response body
> (เช่น sheet id ผิด → 500 "sheet read failed")

---

## 7) เพิ่มคอลัมน์สถานะรอบในชีต + Data validation (ทำมือใน Google Sheets)

ระบบอ่านสถานะจากชีต แต่ระบบไม่แก้ชีตให้ (Service Account เป็น Viewer) — ผู้ใช้ต้องเพิ่มคอลัมน์เอง 1 ครั้ง

1. เปิดชีต → **ทุกแท็บ Sales** (แท็บละ 1 คน — ทุกแท็บต้องมีคอลัมน์เหล่านี้)
2. เพิ่ม 4 คอลัมน์ต่อท้ายหัวข้อ "งานต่ออายุ" (เรียงต่อจากคอลัมน์วันหมดอายุ):
   `สถานะครั้งที่ 1` · `สถานะครั้งที่ 2` · `สถานะครั้งที่ 3` · `สถานะครั้งที่ 4`
3. ลาก select ทั้ง 4 คอลัมน์ (รวมหัวตาราง) → **Data → Data validation**
   - Criteria: **Dropdown (list of items)**
   - Values ตามสถานะรอบใน `CONTEXT.md` (ว่าง = ยังไม่เริ่ม ไม่ต้องใส่ใน list):
     ```
     รอขอใบราคา
     กำลังดำเนินการ
     ต่อแล้ว
     ```
   - ติ๊ก **Show this warning when the user ignores a suggestion** (หรือ "Show warning")
     เพื่อให้ช่องว่างยังเป็นค่าที่ถูกต้องได้ (ค่า "ว่าง" = ยังไม่เริ่ม ตามสเปก)
   - ถ้าชีตเวอร์ชันใหม่เลือก **Reject input** ได้ ให้อนุญาตเฉพาะ 3 ค่าข้างบน + เว้นว่าง
4. ค่าที่ต้องได้ตรงตามนี้เท่านั้น: **ว่าง / รอขอใบราคา / กำลังดำเนินการ / ต่อแล้ว**
   ค่า **"ต่อแล้ว"** คือสัญญาณเดียวที่ทำให้รอบจบ (ระบบนับรอบถัดไปจากวันหมดอายุชุดใหม่)

> ย้ำ: ทำทุกแท็บ Sales — ถ้าแท็บไหนยังไม่มีคอลัมน์ สถานะรอบนั้นจะถูกนับเป็น "ว่าง" (ยังไม่เริ่ม) ทั้งหมด

---

## 8) พลิก DRY_RUN เป็นการส่งจริง (หลังตรวจหลักฐานแล้วเท่านั้น)

เมื่อพอใจหลักฐานจากข้อ 6 (และเติมสถานะในชีตครบแล้วตามข้อ 7):

1. Vercel → Settings → Environment Variables → `DRY_RUN`: **edit** จาก `true` เป็น **`false`**
   (Environment: Production — ค่าใหม่ทับค่าเก่า)
2. **Settings → Deployment Queue → Redeploy** production deployment (env ไม่กระทบ instance เก่า
   ต้อง redeploy เท่านั้น)
3. เช็กพฤติกรรมรอบถัดไป (หรือกด Run workflow ฝั่ง GitHub หนึ่งครั้ง):
   - `notify_log`: `dry_run = false` และแถวรายคนมี `details.send_status` (ok/failed) + `send_error` ถ้าล้มเหลว
   - ประจักษ์พยาน: อีเมลจาก Brevo / ข้อความใน Discord channel / ข้อความ Telegram มาจริง
   - ช่องทางที่ไม่คอนฟิก (เช่น Sales คนไหนยังไม่ใส่ webhook) = ระบบทน ไม่ทำให้ทั้งรอบพัง
4. ย้อนกลับเป็นโหมดปลอดภัยได้ทุกเมื่อ: ตั้ง `DRY_RUN` คืน `true` + Redeploy (ทำได้แม้กลางคืน)

> ค่า env ที่ "ปิด DRY_RUN" อย่างจงใจคือ `false` / `0` / `off` (พิมพ์ใหญ่-เล็ก/เว้นวรรคได้) — ค่านอกเหนือ
> นี้ (รวมถึงค่าว่างหรือพิมพ์ผิด) ระบบนับเป็น DRY_RUN ทั้งหมด = safe default ไม่ส่งของจริง
> (Implementation: `lib/config/send-mode.ts`)

---

## สรุปสถานะ AC เทียบกับสิ่งที่ ship ใน repo

| AC | สถานะ |
|---|---|
| deploy สำเร็จบน Vercel; cron รอบแรกรันและเขียน log (DRY_RUN) | ⛔ ขั้นตอนผู้ใช้ (ข้อ 1–3 + ปล่อยผ่าน 1 คืน) — repo ship config ครบถ้วนแล้ว |
| GitHub Actions ยิง endpoint เดียวกันด้วย secret ได้ (manual trigger) | ✅ workflow + `workflow_dispatch` + วิธีเทสในข้อ 4–5 |
| env ครบทุกตัวบน Vercel; ไม่มี secret ใน repo | ✅ ตาราง env ข้อ 2 + `.env.example` เป็น placeholder เท่านั้น |
| checklist เป็นคู่มือพร้อมใช้ (คอลัมน์สถานะในชีต ฯลฯ) | ✅ เอกสารนี้ (ข้อ 7 ละเอียดตาม `CONTEXT.md`) |
