# รวมทุกชั้นเป็น Next.js/TypeScript บน Vercel + Supabase

ทั้ง web app จัดการข้อมูลและตัวตรวจ-แจ้งเตือนรายวันอยู่ในโปรเจกต์ Next.js (TypeScript) ชุดเดียว — domain logic อยู่ใน `lib/domain/` ที่ทั้งหน้าเว็บและ API route ของ cron (`app/api/cron/daily-check/route.ts`) เรียกใช้ร่วมกัน; ฐานข้อมูล + auth ใช้ Supabase, deploy ทั้งหมดบน Vercel ตัดสินใจเพราะเป้าหมาย deployment (Vercel + Supabase) ถูกกำหนดโดยผู้ใช้อยู่แล้ว การใช้ภาษาเดียวตัดงานซ้ำและเหลือ stack ที่ทีมเล็กดูแลได้

## Considered Options

- **Next.js รวมทุกอย่าง (เลือก)** — web + checker แชร์ domain logic, deploy จุดเดียว
- Google Apps Script ทำงานบนชีต — ฟรีเหมือนกันแต่โค้ดไม่อยู่ใน repo ทดสอบ/ควบคุมเวอร์ชันยาก
- Python checker + Next.js web แยกชั้น — สอง stack ต้องดูแลสองชุด, ต้องมีที่รัน checker แยกอีก

## Consequences

- cron ใช้ Vercel Cron (Hobby: 1 ครั้ง/วัน, เวลาจริงอยู่ในช่วง ~1 ชั่วโมง) — เพียงพอกับการแจ้งเตือนรายวัน; ทางสำรองคือ GitHub Actions ยิง endpoint เดิม
- Supabase free tier หลับถ้าไม่มี activity 1 สัปดาห์ — ระบบเขียน `notify_log` ทุกวันจึงไม่หลับ
- secrets ทั้งหมดเป็น env บน Vercel (repo เป็น public — ห้ามมี credentials/ข้อมูลจริงในโค้ด)
