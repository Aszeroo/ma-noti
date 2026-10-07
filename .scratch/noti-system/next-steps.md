# ขั้นตอนถัดไป (หลัง grilling เสร็จ 20/20 ข้อ)

สถานะ: สเปก publish แล้ว (`spec.md` Status: ready-for-agent) — พร้อมเริ่มสร้างตามลำดับด้านล่าง
เอกสารอ้างอิง: `spec.md` (สเปกสำหรับ agent) · `design.md` (บันทึก grilling 20 ข้อ) · `../../CONTEXT.md` (glossary) · `../../docs/adr/0001,0002`

## ลำดับการสร้าง (เมื่อผู้ใช้สั่งเริ่ม)

1. Scaffold Next.js + TypeScript + pnpm + Vitest + Supabase schema (migrations ตามสเปก 5 ตาราง)
2. Domain logic ใน `lib/domain/` + tests: date-parser (ไทย พ.ศ./อังกฤษ/ช่วงวัน), renewal-rounds (stub), due-rules, digest-builder — fixture ใช้ข้อมูลปลอมเท่านั้น (repo public)
3. หน้าเว็บ 5 หน้า (login/recipients/assignments/settings/history) + Supabase Auth allowlist + RLS
4. Cron `/api/cron/daily-check` + CRON_SECRET + notifiers 3 ช่องทาง (Brevo/Discord/Telegram) — deploy ครั้งแรก **DRY_RUN เปิด**

## Action ที่ผู้ใช้ต้องทำ (ผมเตรียม step-by-step ให้เมื่อถึงคิว)

- [ ] สมัครอีเมลใหม่สำหรับส่ง + สมัคร Brevo + ยืนยัน sender
- [ ] สร้าง Google Service Account + แชร์ชีตให้เป็น **Viewer** (ไม่ต้อง Editor — Q20)
- [ ] สร้างโปรเจกต์ Supabase `ma-noti` region Singapore
- [ ] สร้าง Vercel project เชื่อม GitHub `Aszeroo/ma-noti` + ใส่ env vars (รายการในสเปก หัวข้อความปลอดภัย)
- [ ] สร้างคอลัมน์ `สถานะครั้งที่1..4` ในชีต + Data validation dropdown 4 ค่า

## ของที่ยังรอข้อมูล (ไม่บล็อกการสร้าง)

- รายชื่ออีเมล allowlist + contact ผู้รับ (ใส่ผ่านหน้าเว็บภายหลัง)
- ข้อมูลงาน MA (สงวน section type ไว้แล้ว)
- ข้อมูลจริงในชีตที่กำลังไล่ใส่ — ระบบออกแบบให้ทนอยู่แล้ว
