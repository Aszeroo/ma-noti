# คู่มือตั้งค่างาน: Google Sheet + Service Account (ticket #5)

คู่มือ step-by-step สำหรับผู้ใช้ — สร้าง Google Service Account, แชร์ชีตจริงเป็น **Viewer**,
และใส่ env (`GOOGLE_SHEET_ID` + `GOOGLE_SERVICE_ACCOUNT`) ให้ endpoint cron อ่านชีตทุกเช้า

> **กฎเหล็กของ repo public:** ห้ามใส่ Sheet ID จริง / JSON key ลง git ทุกช่องทาง —
> เก็บใน `.env` (ไม่ถูก commit) และ Vercel Environment Variables เท่านั้น ดู `.env.example` เป็นแบบฟอร์ม
>
> **ระบบอ่านอย่างเดียว:** scope ที่ใช้คือ `spreadsheets.readonly` และการแชร์เป็น Viewer —
> ระบบไม่เขียนกลับไปบนชีตไม่ว่ากรณีใด

## 1) สร้าง Service Account ใน Google Cloud

1. เข้า [console.cloud.google.com](https://console.cloud.google.com) → สร้างโปรเจกต์ใหม่
   (เช่น `ma-noti`) หรือเลือกโปรเจกต์ที่มีอยู่ขององค์กร
2. **APIs & Services → Library** → ค้นหา "Google Sheets API" → **Enable**
3. **IAM & Admin → Service Accounts → + Create Service Account**
   - ชื่อ: `ma-noti-reader` (คำอธิบาย: "ma-noti reads the MA renewal sheet")
   - Role: **เว้นว่างไว้** — ไม่จำเป็นต้องให้ role ใดเลย (สิทธิ์มาจาก "การแชร์ชีต" ไม่ใช่โปรเจกต์)
   - กด Create แล้ว **อย่าข้ามขั้นตอน Keys**
4. เปิด Service Account ที่เพิ่งสร้าง → แท็บ **Keys** → **Add key → Create new key → JSON** → Download
   - จะได้ไฟล์ประมาณ `ma-noti-reader-xxxxxxxx.json` มี `client_email` + `private_key`
   - **จด `client_email` ไว้** (หน้าตาแบบนี้: `ma-noti-reader@ma-noti.iam.gserviceaccount.com`) — ต้องใช้ในข้อ 2)
   - ไฟล์นี้คือ secret — ห้าม commit, ห้ามส่งในแชตสาธารณะ

## 2) แชร์ชีตจริงให้ Service Account เป็น Viewer

1. เปิด Google Sheet ที่ทีมใช้จริง (แท็บ Sales หนึ่งแท็บต่อเจ้าของ 1 คน ตามสเปก)
2. กด **Share** (มุมขวาบน) → ช่อง "Add people" → วาง `client_email` จากข้อ 1.4
3. ที่ dropdown ขวาของชื่อ → เลือก **Viewer** (ดูอย่างเดียว) — *อย่าตั้ง Editor: ระบบ read-only ตามสเปก*
4. **Send** — Service Account ใช้สิทธิ์ได้ทันที ไม่ต้องมีคน "กดรับคำเชิญ"

## 3) หา Sheet ID จาก URL ชีต

```
https://docs.google.com/spreadsheets/d/<Sheet ID>/edit#gid=...
                                      ^^^^^^^^^^^^ ส่วนที่อยู่ระหว่าง /d/ กับ /edit
```

เช่น `https://docs.google.com/spreadsheets/d/1A2b3C4d5E6f/edit` → Sheet ID คือ `1A2b3C4d5E6f`
(ค่านี้ไม่ลับเท่า key แต่ก็ไม่ควรอยู่ใน repo เช่นกัน — ใส่ env เท่านั้น)

## 4) ใส่ env (เครื่อง local + Vercel)

| ตัวแปร | ค่า | หมายเหต |
|---|---|---|
| `GOOGLE_SHEET_ID` | Sheet ID จากข้อ 3) | |
| `GOOGLE_SERVICE_ACCOUNT` | JSON key ทั้งก้อน **เป็นบรรทัดเดียว** | บน Vercel เลือก type = **Sensitive** |

`.env` ต้องการ value บรรทัดเดียว — แปลงไฟล์ JSON ด้วย jq ได้ง่ายสุด:

```bash
jq -c . ~/Downloads/ma-noti-reader-xxxxxxxx.json
# ออกมาเป็นบรรทัดเดียว → คัดลอกไปต่อท้าย GOOGLE_SERVICE_ACCOUNT= ใน .env (ครอบด้วย ")
```

> ไฟล์ JSON ที่ดาวน์โหลดมามี `\n` escape ใน `private_key` อยู่แล้ว จึง JSON.parse ได้เสมอ
> ปัญหาที่พบบ่อยคือ "ขึ้นบรรทัดใหม่กลาง string" ตอน copy มือ — ใช้ `jq -c` ช่วยปลอดภัยสุด

```bash
cp .env.example .env   # ถ้ามี .env แล้ว ให้เติม/แก้เฉพาะ GOOGLE_SHEET_ID + GOOGLE_SERVICE_ACCOUNT
```

## 5) ทดสอบ + ตรวจหลักฐานใน notify_log

```bash
pnpm dev   # ให้อีก terminal ยิง endpoint (แทน Vercel Cron)
curl -i -X POST http://localhost:3000/api/cron/daily-check \
  -H "Authorization: Bearer <CRON_SECRET จาก .env>"
```

ผลที่ถูกต้องตามสถานะ:

| สถานะ | ผลลัพธ์ |
|---|---|
| env ครบ + แชร์ชีตแล้ว | `200 {"ok":true,"mode":"dry_run","logged":N}` |
| `DRY_RUN=false` | `mode:"send"` — ทอรันเต็มรปูแบบ ยิงจริงผาน sender ทีใส env ครบ (Brevo/Discord/Telegram) แลวบันทึก `send_status` ลง details ของ log row (docs/setup-senders.md) |
| ยังไม่ใส่ `GOOGLE_*` | `500` พร้อมชื่อตัวแปร env ที่ขาด (ไม่ crash — cron จะเห็น error ชัดเจน) |

ตรวจ Supabase (SQL Editor) — ทุกรอบรันต้องมีแถว "รอบรัน" (`person_id = null`) เสมอ
แม้คอนฟิกใน DB จะว่าง:

```sql
select sent_at, person_id, channel, item_count, dry_run, details
from public.notify_log order by sent_at desc limit 10;
-- แถวรอบรัน:      details = {"stage":"pipeline","run_at":...,"tabs":<จำนวนแท็บที่อ่าน>}
-- แถวต่อคน/ช่อง:  details = {"tab":...,"party":...,"issue_count":...}  ← มีเมื่อ DB มี assignments + channels
```

## 6) แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ + ทางแก้ |
|---|---|
| `500 GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT ยังไม่ได้เซ็ต` | ใส่ env ให้ครบ (local: `.env` / Vercel: Environment Variables แล้ว **Redeploy**) |
| `500 sheets API failed (403)` | ยังไม่ได้แชร์ชีตให้ `client_email` / เลือก role ผิด (ต้อง **Viewer**) / พิมพ์ client_email ผิด |
| `500 GOOGLE_SERVICE_ACCOUNT ไม่เป็น JSON ที่ถูกต้อง` | value ต้องเป็น JSON ก้อนเดียวจบ — ใช้ `jq -c` สร้าง (ข้อ 4) และ escape `"` ใน `.env` ให้ครบ |
| `200 logged:1` แต่ไม่มีแถวต่อคนเลย | ปกติของ "คอนฟิกว่าง": ยังไม่มีข้อมูลใน `assignments` / `people` / `channels` — รอบรันผ่าน ไม่มีการส่งใด ๆ (เพิ่มข้อมูลผ่าน SQL Editor ก่อน จนกว่าหน้า admin จะมาใน ticket ถัดไป) |
| อ่านได้แต่ข้อมูลไม่ครบบางแท็บ | ระบบทนแท็บว่าง/ข้อมูลไม่ครบ — รายการที่ parse ไม่ออกจะถูกรายงานเข้า digest ของเจ้าของแท็บ (คอลัมน์ต้องเป็นแถวที่ 3) |

## 7) Deploy ขึ้น Vercel

1. Project → **Settings → Environment Variables** → Production:
   - `GOOGLE_SHEET_ID` (ค่าธรรมดา)
   - `GOOGLE_SERVICE_ACCOUNT` (type: **Sensitive** — JSON บรรทัดเดียว)
2. **Redeploy** ให้ env มีผล แล้วรอ Vercel Cron ยิง 08:00 Asia/Bangkok
   (ตาราง cron อยู่ใน `vercel.json` — ประกาศใน repo แล้ว, ดู `docs/setup-supabase.md` ข้อ 6)
3. แชร์ชีตให้ `client_email` อีกครั้งถ้าทำข้ามบัญชี Google — ยืนยันด้วยการยิง endpoint บน production:

   ```bash
   curl -i -X POST https://<app>.vercel.app/api/cron/daily-check \
     -H "Authorization: Bearer <CRON_SECRET>"                          # ต้องได้ 200
   ```
