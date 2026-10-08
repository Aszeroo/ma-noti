# คู้มือตั้งค่างาน: ผู้ส่งจริง 3 ช่องทาง (ticket #10)

คู่มือ step-by-step สำหรับผู้ใช้ — สมัคร Brevo + ยืนยัน sender, สร้าง Discord Incoming Webhook,
สร้าง Telegram Bot จาก BotFather, แลวใส env บน Vercel เพือให ทอรันรายวัน "สงจริง" ได
(หลังจากตรวจประวติ history ในโหมด DRY_RUN เรียบรอยแลว)

> **กฎเหล็กของ repo public:** ห้ามใส่ API key / bot token / webhook URL ลง git ทุกช่องทาง —
> เก็บใน `.env` (ไม่ถูก commit) และ Vercel Environment Variables เท่านั้น ดู `.env.example` เป็นแบบฟอร์ม
>
> **ค่าเริ่มต้นของระบบคือ DRY_RUN:** ทอรันครบทุกขึ้นตอน + เขียน log แต่ไม่ส่งอะไรเลย
> การเปิด `DRY_RUN=false` คือการตัดสินใจของผู้ใช้ หลังตรวจหน้า History แล้ว

---

## 1) Brevo (อีเมล) — สมัคร + ยืนยัน sender + เอา API key

1. ไปที่ [brevo.com](https://www.brevo.com/) → **Sign up free** (แผน Free ส่งได้ 300 อีเมล/วัน)
   ยืนยันอีเมลของบัญชีให้เรียบร้อย
2. **Senders, Domains & Dedicated IPs → Senders** → **Add a New Sender**
   - Name: `ma-noti` (ชื่อที่ผู้รับเห็นในช่องผู้ส่ง)
   - Email: อีเมลที่จะใช้ส่ง เช่น `notify@your-domain.example`
   - กด Create แล้ว **กดลิงก์ยืนยันในอีเมลที่ Brevo ส่งไป** — ถ้าไม่ยืนยัน Brevo จะปฏิเสธการส่ง
     (ระบบจะ log แถวเป็น `send_status: failed`)
   - หมายเหต: อีเมลฟรี เช่น gmail.com ต้องใช้ SMTP ของ Gmail ไม่ใช่ Brevo —
     แนะนำใช้โดเมนของหน่วยงานเอง แลวยืนยันผาน Brevo
3. **Settings → SMTP & API → API key** (ใน กลุ่่่ม "Transactional" — ไม่ใช่ "SMTP key") →
   **Create a new API key** ตั้งชื่่อว่า `ma-noti` แล้ว **copy ค่าทันที** (หน้าจแสดงครงเดียว)
   ค่าจะมีรูปแบบประมาณ `xkeysib-...`
4. ค่าสามตัวนี้คือ env ของระบบ:
   `BREVO_API_KEY` = API key ข้อ 1.3, `BREVO_SENDER_EMAIL` = อีเมลข้อ 1.2, `BREVO_SENDER_NAME` = ชื่อข้อ 1.2

## 2) Discord — สร้าง Incoming Webhook (ไมมี env)

1. เปิด Discord บนเดสก์ท็อป → เลือกเซิร์ฟเวอร์ของทีม → **คลิกขวาที่ channel** →
   **Edit Channel → Integrations → Webhooks → + Webhook**
2. ตั้งชื่อ `ma-noti` → **Copy Webhook URL** (รูปแบบ
   `https://discord.com/api/webhooks/<id>/<token>`)
3. เอา URL นี้ไปใส่ในเว็บที่หน้า **จัดการผู้รับ** → เพิ่มช่องทาง Discord ของแต่ละคน
   (URL เก็บในฐานข้อมูลเท่านั้น ไม่อยู่ใน env และไม่ควรส่งในแชตสาธารณะ เพราะใครมี URL ก็โพสต์เข้า channel ได้)
4. ระบบจะส่ง embed (หัวข้อ + รายการงาน) เข้า channel ที่ผูกไว้อัตโนมัติเมื่อปิด DRY_RUN

## 3) Telegram — สร้าง Bot (BotFather) + หา chat_id

1. ใน Telegram ค้นหา **@BotFather** → ส่ง `/newbot` → ตั้งชื่อ display name แล้วตั้ง username
   ที่ลงท้ายด้วย `bot` (เช่น `ma_noti_bot`)
2. BotFather ตอบกลับพร้อม **HTTP API token** รูปแบบ `1234567:AA...` → ค่านี้คือ `TELEGRAM_BOT_TOKEN`
3. หา chat_id ของแต่ละคน (หรือกลุ่ม/แชนแนลที่ทีมใช้):
   - ให้เจ้าของ chat ส่งข้อความหา bot ที่สร้าง (bot เริ่มคุยด้วย)
   - เปิด [web.telegram.org](https://web.telegram.org) (หรือแอป desktop) เลือกแชตของ bot
     แล้วด id ใน URL: `https://web.telegram.org/a/#-1001234567890` → ตัวเลขท้าย (`-1001234567890`) คือ chat_id
     (ส่วนตัวไม่มี `-` นำหน้า, กลุ่ม/แชนแนลมี `-100...`)
   - ทางเลือกที่แน่นอนกวา: เพม่ bot เขา้กลุม แลวเปด `https://api.telegram.org/bot<token>/getUpdates`
     ใน browser → ดู `chat.id` ของข้อความล่าสุด
4. เอา chat_id ไปใส่ในเว็บที่หน้า **จัดการผู้รับ** → เพิ่มช่องทาง Telegram (ไม่ใช่ env)

## 4) ใส่ env (เครือง local + Vercel)

| ตัวแปร | ค่า | หมายเหตุ |
|---|---|---|
| `BREVO_API_KEY` | API key จากข้อ 1.3 | Vercel type: **Sensitive** |
| `BREVO_SENDER_EMAIL` | อีเมล sender ที่ยืนยันแลว | ตองตรงกับทียืนยันใน Brevo |
| `BREVO_SENDER_NAME` | ชื่อ sender | |
| `TELEGRAM_BOT_TOKEN` | token จาก BotFather | Vercel type: **Sensitive** |
| Discord | — ไมมี env — | webhook URL ใส่ที่หนาจัดการผู้รบ |

```bash
cp .env.example .env   # ถ้ามี .env แล้ว เติมเฉพาะค่าของ sender ที่ยังว่าง
```

บน Vercel: **Project → Settings → Environment Variables → Production** แล้ว **Redeploy** ให env มีผล

## 5) ทดสอบตามลำดับ (แนะนำอย่านี้ยกแรก)

1) **เปิด DRY_RUN ไว้** (`DRY_RUN=true` หรือไม่ใส่) → ยิง endpoint แล้วดูหน้า **History**:
   ต้องเห็นแถว `DRY_RUN` ครบทุกรายการท่วางไว้ แต่ยังไม่มีอีเมล/Discord/Telegram จริงไปหาใคร

   ```bash
   pnpm dev   # อีก terminal หนึ่ง
   curl -i -X POST http://localhost:3000/api/cron/daily-check \
     -H "Authorization: Bearer <CRON_SECRET จาก .env>"
   ```

2) **ตรวจ SQL ว่า log พร้อมจริง**

   ```sql
   select sent_at, person_id, channel, item_count, dry_run, details
   from public.notify_log order by sent_at desc limit 10;
   -- แถวรอบรัน:   details = {"stage":"pipeline","run_at":...,"tabs":...}
   -- แถวต่อคน:    details = {"tab":...,"party":...,"issue_count":...}
   ```

3) **ปิด DRY_RUN** (`DRY_RUN=false` บน Vercel แลว Redeploy) → ยิง endpoint อีกครั้ง:
   ระบบจะส่งจริงผ่าน Brevo / Discord / Telegram แล้วเขียนสถานะลง log

   ```sql
   select channel, item_count, dry_run, details ->> 'send_status' as status, details ->> 'send_error' as error
   from public.notify_log where dry_run = false order by sent_at desc limit 20;
   -- status = 'sent'  = ส่งสำเร็จ
   -- status = 'failed' = ส่งไม่สำเร็จ (error สั้น ๆ อยู่ใน send_error)
   ```

4) ที่หน้า History สถานะจะแสดงเปน "ส่งแล้ว" หรือ "ส่งไม่สำเร็จ" (เอาเมาส์ชื้เพื่อดูสาเหต)
   และแถวรอบรันจะสรุปว่า "ส่ง N / ไม่สำเร็จ M"

## 6) แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ + ทางแก้ |
|---|---|
| log ขึ้น `send_status: failed` + `BREVO_API_KEY is not configured` | ยังไม่ได้ใส่ env ของ Brevo บน Vercel (หรือยังไม่ได้ Redeploy) |
| `brevo send failed (401): Invalid key` | API key ผิด/ถูกลบ — สร้างใหม่ที่ Settings → SMTP & API แล้วแก้ env |
| `brevo send failed (400)` เรื่อง sender | ผู้ส่งยังไม่ยืนยันอีเมลใน Brevo (ข้อ 1.2) หรือชื่อ/อีเมลไม่ตรงกับที่ยืนยัน |
| `discord send failed (404)` | webhook URL ถูกเพิกถอน/ลบใน Discord — สร้างใหม่แล้วแก้ contact ที่หน้าจัดการผู้รบ |
| `telegram: chat id is empty` / bot ไม่ส่งเข้า | ยังไม่ได้เพิ่มช่องทาง Telegram หรือ bot ยังไม่เคยถูกเจ้าของ chat ทักก่อน (ข้อ 3.3) |
| `telegram rejected the message: ...` | chat_id ผิด หรือ bot ถูกนำออกจากกลุ่ม/บล็อก |
| ปิด DRY_RUN แลวแตก่มีแถว `dry_run = true` อยู่ | Vercel ยังใช้ env เก่า — ตรวจว่าแก้ Production variable แลว Redeploy จริง |

## 7) หมายเหตุความปลอดภย

- `BREVO_API_KEY` และ `TELEGRAM_BOT_TOKEN` ถือเปนอนุญาติสงของทบม — ใสเฉพาะบน Vercel (type: Sensitive) และเปลี่ยนคาคีเมื่อสงสัยวารอ
- Discord webhook URL เทีเท่ากบาสิงเขา channel ได — ถาตองการปองกน ใหเพิกถอนแลวสง URL ใหมผานคนในทีมเทา นั้น
- ระบบออกแบบให "ชองทางใดลมเหลว รอบรันไมพง": รายการทสี่งไมสำเร็จจะแสดงใน History และพยายามสงใหมในรอบถัดไป (รอบถัดไปของวัน)
