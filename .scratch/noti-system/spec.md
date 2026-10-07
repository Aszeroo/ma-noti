# สเปก: ระบบแจ้งเตือนงานต่ออายุ (v1)

Status: ready-for-agent

Feature: noti-system — v1 คือระบบต่ออายุครบวงจร (ชีต → คำนวณ → แจ้งเตือน 3 ช่องทาง + web app จัดการ) รันโหมด DRY_RUN

อ้างอิง: `design.md` (บันทึกการตัดสินใจ grilling 20/20 ข้อ) · `../../CONTEXT.md` (glossary) · `../../docs/adr/0001` · `../../docs/adr/0002`

## Problem Statement

ทีมติดตามงานต่ออายุ (SSL, โดเมน, ลิขสิทธิ์ซอฟต์แวร์ ฯลฯ) ของหน่วยงานภาครัฐหลายแห่งผ่าน Google Sheet ที่แชร์กัน ปัจจุบันไม่มีอะไรเตือนเมื่อรายการใกล้หมดอายุ — ทุกคนต้องจำเอา เช็คเอาเอง งานต่ออายุจึงหลุดได้ง่าย เมื่อต่อรอบหนึ่งเสร็จก็ไม่มีตัวช่วยเริ่มนับเตือนรอบถัดไปให้อัตโนมัติ และข้อมูลวันหมดอายุในชีตเป็นข้อความอิสระหลายรูปแบบปนกัน คนอ่านด้วยตาได้ แต่ไม่มีใครอยากไล่กวาดทีละแท็บทุกเช้า

## Solution

ระบบอ่านชีตต่ออายุทุกเช้า (08:00 เวลาไทย) แล้วส่งข้อความสรุป (Digest) รายวันให้ผู้เกี่ยวข้อง 3 ฝ่าย — Sales เจ้าของงาน, โปรดักท์คู่, ทีมขอใบราคา — ตามรอบเตือนของฝ่ายตัวเอง ผ่านช่องทางที่แต่ละคนเลือกเอง (Email / Discord / Telegram) ข้อความสรุปแยกหมวด "ใกล้หมดอายุ", "เลยกำหนดแล้ว" (บอกเกินมากี่วัน), "ข้อมูลมีปัญหา" และหยุดเตือนรอบที่ถูกทำถึง "ต่อแล้ว" โดยอัตโนมัติ ทีมจัดการผู้รับ การจัดฝ่าย และรอบเตือนเองบนหน้าเว็บที่ล็อกอินได้ โดยไม่ต้องแตะโค้ดหรือ deploy ใหม่ — deployment แรกรันโหมด DRY_RUN (คำนวณ + บันทึก log แต่ยังไม่ส่งของจริง) เพื่อตรวจความถูกต้องก่อนเปิดใช้

## User Stories

### การแจ้งเตือนต่อฝ่าย

1. As a Sales, I want to receive a digest on days 30/14/7/3/1 before my item's expiry and on the expiry day itself, so that no renewal slips past me
2. As a Sales, I want each digest to show days remaining per item, so that I can prioritize what to act on first
3. As a Sales, I want overdue items listed in their own "เลยกำหนดแล้ว" section with the number of days late, so that the most urgent work is obvious at a glance
4. As a Sales, I want each item in the digest to show Job Code, ชื่องาน, หน่วยงาน, ประเภทการต่ออายุ, วันหมดอายุ, partner, ผู้ติดต่อ, so that I have full context without opening the sheet
5. As a Sales, I want reminders to continue while my item's สถานะรอบ is "รอขอใบราคา" or "กำลังดำเนินการ", so that in-progress renewals are not forgotten
6. As a Sales, I want reminders to stop once the current รอบการต่ออายุ is marked "ต่อแล้ว", so that I am not nagged about finished work
7. As a Sales, I want the countdown of the next round to restart from the latest parseable end date after "ต่อแล้ว", so that round 2+ tracking is correct
8. As a Sales, I want items in my แท็บ Sales that the system cannot read flagged under "ข้อมูลมีปัญหา" in my digest, so that I know exactly what to fix in the sheet
9. As a Sales, I want to receive my digest through the ช่องทาง I chose, so that I read it where I actually am
10. As a Sales, I want one combined digest per day instead of one message per item, so that my inbox is not flooded

### โปรดักท์คู่

11. As a โปรดักท์คู่, I want the same due-date alerts as the Sales I pair with, so that I can support them proactively
12. As a โปรดักท์คู่, I want partner and ผู้ติดต่อ emphasized in my digest, so that I can follow up directly without asking around

### ทีมขอใบราคา

13. As a member of ทีมขอใบราคา, I want alerts earlier at 60/45/30 days, so that there is time to obtain quotes from partners before expiry
14. As a member of ทีมขอใบราคา, I want the digest to lead with partner + ผู้ติดต่อ, so that I know exactly who to contact
15. As a member of ทีมขอใบราคา, I want our lead times adjustable without code changes, so that we can tune the cadence as we learn what works

### ทีม — จัดการคอนฟิกบนเว็บ

16. As a team member, I want to log in only with an allowlisted team email, so that outsiders cannot reach the configuration
17. As a team member, I want magic-link login, so that I do not need yet another password
18. As a team member, I want to add/edit/remove people and their ช่องทาง on a web page, so that changing who gets notified never requires a deploy
19. As a team member, I want to give one person multiple ช่องทาง, so that each person gets alerts where they prefer
20. As a team member, I want to map each แท็บ Sales to its Sales, โปรดักท์คู่, and ทีมขอใบราคา recipients, so that adding a new Sales never touches code
21. As a team member, I want to adjust รอบเตือน per ฝ่าย in settings, so that cadence changes do not need deploys
22. As a team member, I want to mark people/ช่องทาง inactive instead of deleting them, so that history stays intact
23. As a team member, I want a history page listing every daily run and what was (or would have been) sent, so that I can audit the system
24. As a team member, I want DRY_RUN status visible in history, so that I know exactly when the system went live for real

### ความทนทานของข้อมูล

25. As the team, I want columns mapped by header names and not by position, so that column drift between tabs does not break daily runs
26. As the team, I want the run to tolerate empty or partially filled tabs, so that gradual data entry never crashes the system
27. As the team, I want dates in Thai พ.ศ., English, and dd/mm/yyyy — including ranges — parsed automatically, so that mixed formats just work
28. As the team, I want a date range's end date used as the deadline for countdowns, so that warnings align with the true expiry
29. As the team, I want typo'd สถานะรอบ values treated as not-done and reported under "ข้อมูลมีปัญหา", so that data errors surface instead of silently stopping or continuing alerts
30. As the team, I want items marked "ต่อแล้ว" with no parseable new expiry date flagged under "ข้อมูลมีปัญหา", so that next-round tracking never silently drops

### การปฏิบัติการและความปลอดภัย

31. As the team, I want the daily run at 08:00 Asia/Bangkok, so that everyone starts the day with the same update
32. As the team, I want the first deployment in DRY_RUN mode (compute + log only, no sending), so that we can validate digests safely before going live
33. As the team, I want every run to write a log entry even in DRY_RUN, so that we can inspect exactly what would have been sent
34. As the team, I want the cron endpoint protected by a secret, so that outsiders cannot trigger runs
35. As the team, I want all secrets kept in Vercel env only, so that our public repo stays clean
36. As the team, I want tests to use fake fixtures only, so that no client data can ever leak into the public repo
37. As the team, I want a fallback trigger via GitHub Actions hitting the same endpoint, so that cron-provider hiccups do not silence alerts

## Implementation Decisions

### สถาปัตยกรรม

1. โปรเจกต์เดียว Next.js + TypeScript ทั้งระบบ deploy บน Vercel, ฐานข้อมูล + Auth บน Supabase (ADR 0002) — web app กับตัวตรวจ-แจ้งเตือนเรียกใช้แกน domain ชุดเดียวกัน
2. **แกน domain บริสุทธิ์** — ไม่รู้จัก Sheet/DB/HTTP ใดๆ รับ-ส่งเป็นโครงสร้างข้อมูลล้วน; ทุกการติดต่อภายนอก (Sheets API, Brevo, Discord webhook, Telegram API, Supabase) อยู่ชั้นขอบเป็น adapter แยก
3. **ท่อรันรายวันเป็นฟังก์ชันบริสุทธิ์หนึ่งตัว (seam หลัก)** — รับ (แท็บดิบ: หัวคอลัมน์ + แถว, คอนฟิกทีม: การจัดฝ่าย + ผู้รับ + ช่องทาง + รอบเตือน, วันที่วันนี้) → คืน (แผนส่ง: ข้อความสรุปเรนเดอร์แล้วต่อช่องทาง+contact, รายการสำหรับเขียน log) — ภายในครอบ row-reader, renewal-rounds, due-rules, digest-builder, renderer ครบ; API route ของ cron เป็นเปลือกบาง: ดึงชีต → โหลดคอนฟิก → เรียกท่อ → ส่ง/บันทึก
4. **Notifier เป็น interface เดียว 3 implementation** — Email ผ่าน Brevo (เรนเดอร์ HTML ตาราง), Discord ผ่าน Incoming Webhook (embed), Telegram ผ่าน Bot API (markdown); ข้อความสรุปชุดเดียวกันเรนเดอร์ตามช่องทาง; เพิ่มช่องทางใหม่ภายหลัง = เพิ่ม implementation เดียว
5. ไม่สร้างส่วน "งาน MA" จนกว่าจะมีข้อมูลจริง — สงวนแนวคิดส่วนงาน (Section) ไว้ในโมเดลแล้ว

### ข้อมูลต้นทาง (Google Sheet)

6. อ่านชีตจริงตั้งแต่วันแรกผ่าน Google Service Account ที่ถูกแชร์ชีตเป็น **Viewer** — Sheet ID อยู่ใน env เท่านั้น
7. แท็บ = ความเป็นเจ้าของของ Sales (1 คนต่อ 1 แท็บ); แถว 2 คือชื่อส่วนงาน (ปัจจุบัน "งานต่ออายุ"), แถว 3 คือหัวคอลัมน์, แถว 4+ คือข้อมูล; หนึ่ง Job Code (กลุ่มงาน) อาจกินหลายแถว = หลายรายการต่ออายุ
8. row-reader map คอลัมน์จากชื่อหัวคอลัมน์ (normalize ช่องว่างให้ด้วย) — ห้าม hardcode ตำแหน่งคอลัมน์ เพราะตำแหน่งเพี้ยนระหว่างแท็บ
9. ตัว parse วันที่รองรับ: ไทย พ.ศ. (`28 สิงหาคม 2568`), อังกฤษ (`08 December 2026`), `dd/mm/yyyy`, คำนำหน้าอย่าง `Period :`, และช่วงวัน — ช่วงวันใช้**วันสิ้นสุด**เป็นตัวตั้งต้นนับเตือน; parse ไม่ได้/ไม่มีวันที่ → หมวด "ข้อมูลมีปัญหา"

### รอบการต่ออายุ (ADR 0001)

10. สถานะรอบเก็บในชีตเป็น 4 คอลัมน์ข้อความ `สถานะครั้งที่1` … `สถานะครั้งที่4` ค่าจากชุดเดียว: *(ว่าง = ยังไม่เริ่ม)*, `รอขอใบราคา`, `กำลังดำเนินการ`, `ต่อแล้ว` — แนะนำตั้ง Data validation dropdown กัน typo ตั้งแต่ต้นทาง
11. กลไกรอบ (จากบันทึกดีไซน์ ADR 0001 — ตัดเหลือสาระการตัดสินใจ):

```ts
const ROUND_STATUSES = ["", "รอขอใบราคา", "กำลังดำเนินการ", "ต่อแล้ว"];
// currentRound(statuses) = รอบแรกที่ status ≠ "ต่อแล้ว"
//   ทุกรอบเป็น "ต่อแล้ว" แล้ว → null (หยุดแจ้งเตือนรายการนี้ทั้งหมด)
// roundDone(round) = true เมื่อรอบปัจจุบันดำเนินการเสร็จ → หยุดเตือนรอบนี้
```

12. **ก่อนคอลัมน์จริงมีข้อมูล: ใช้ stub** — ทุกรายการถือว่าอยู่รอบ 1 ยังไม่จบ; สลับ implementation จริงทีหลังได้โดยไม่กระทบส่วนอื่น
13. ค่าสถานะที่พิมพ์นอกชุด (typo) ถือว่า**ไม่ใช่** "ต่อแล้ว" และรายงานในหมวด "ข้อมูลมีปัญหา"
14. วันเริ่มรอบถัดไป = วันสิ้นสุดล่าสุดที่ parse ได้จากคอลัมน์ `กำหนดต่ออายุ`/`วันหมดอายุ`; ถ้าไม่มี → หมวด "ข้อมูลมีปัญหา"
15. รายการเลยกำหนดและรอบที่ระหว่างดำเนินการ เตือนต่อตามรอบเดิมทุกวันจนกว่าจะ "ต่อแล้ว"

### ตรรกะการแจ้งเตือน

16. ข้อความสรุป 1 ฉบับ/ฝ่าย/วัน; แต่ละฝ่ายรวบรวมเฉพาะรายการที่วันนั้นตรงกับรอบเตือนของฝ่ายตัวเอง
17. รอบเตือนเริ่มต้น (ปรับได้ในหน้า settings): Sales + โปรดักท์คู่ = 30/14/7/3/1 + วันหมดอายุ; ทีมขอใบราคา = 60/45/30
18. หมวดในข้อความสรุป: "ใกล้หมดอายุ" / "เลยกำหนดแล้ว" (บอกเกินมาแล้วกี่วัน) / "ข้อมูลมีปัญหา" (parse ไม่ได้, ไม่มีวันหมดอายุ, สถานะพิมพ์นอกชุด, "ต่อแล้ว" แต่ไม่มีวันหมดอายุชุดใหม่)
19. ผู้รับ 3 ฝ่ายต่อแท็บ: sales (เจ้าของแท็บ), โปรดักท์คู่, ทีมขอใบราคา — ผูกผ่านการจัดฝ่าย; คนหนึ่งอาจเป็นหลายบทบาท; เนื้อหาเน้นต่างกันตามบทบาท (ทีมขอใบราคาเน้น partner + ผู้ติดต่อ)
20. เวลาส่ง 08:00 Asia/Bangkok ทุกวัน — Vercel Cron (Hobby: 1 ครั้ง/วัน, เวลาจริงอยู่ในช่วง ~1 ชั่วโมง ยอมรับได้); ทางสำรอง GitHub Actions ยิง endpoint เดิม

### Supabase

21. ตาราง 5 ตาราง: `people` (ผู้รับทุกคน: name, active) · `channels` (person → type email|discord|telegram, contact, active — 1 คนหลายช่องทาง) · `assignments` (sheet_tab → sales/product_buddy/quoting) · `settings` (1 แถว: lead_times jsonb ต่อฝ่าย, send_time, timezone) · `notify_log` (sent_at, person, channel, item_count, details jsonb, DRY_RUN marker)
22. contact จริง (อีเมล, webhook URL, chat_id) อยู่ในตาราง `channels` เท่านั้น — ห้ามลง repo; การเขียน `notify_log` ทุกวันช่วยกัน Supabase free tier หลับ
23. Auth: Supabase แนะนำ magic link + allowlist (ตารางอีเมลที่อนุญาต) — คนนอกล็อกอินไม่ได้
24. RLS ทุกตาราง: ล็อกอินแล้ว = อ่าน/เขียนได้ทั้งหมด (ทีมเล็ก ยังไม่ทำ role ซับซ้อน)

### ความปลอดภัย (repo เป็น public)

25. Env บน Vercel เท่านั้น: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (server/cron เท่านั้น), GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT (JSON), Brevo API key, CRON_SECRET
26. Endpoint ของ cron ทุกตัวต้องตรวจ CRON_SECRET — คนนอกยิงไม่ได้
27. ห้ามมีข้อมูลจริง (ลูกค้า/หน่วยงาน/partner/อีเมล/contact) ในโค้ดหรือ fixture — fixture ต้องเป็นข้อมูลปลอมทั้งหมด

### หน้าเว็บ

28. 5 หน้า: login (magic link) · recipients (จัดการ people + channels) · assignments (ผูกแท็บ → ผู้รับ 3 ฝ่าย) · settings (รอบเตือนต่อฝ่าย, เวลาส่ง) · history (แสดง notify_log)

### DRY_RUN

29. Deploy แรกเปิด DRY_RUN: ท่อรันเต็มรูปแบบ (อ่านชีต → คำนวณ → เรนเดอร์) เขียน notify_log พร้อม marker แต่**ไม่ส่ง**ของจริง — สลับปิดด้วย env

## Testing Decisions

- **เทสที่ดี = ทดสอบพฤติกรรมภายนอกเท่านั้น** — ให้ input (แท็บดิบ, คอนฟิก, วันที่) แล้ว assert ผลลัพธ์ (แผนส่ง + รายการ log) ไม่แอบเปิดดูภายในหรือ stub ของภายใน
- **Seam หลัก (จุดเดียวที่เหลือระบบพึ่ง): ท่อรันรายวันแบบบริสุทธิ์** — สถานการณ์ทั้งหมดยิงที่นี่: ตรงรอบเตือนแต่ละฝ่าย, เลยกำหนด (นับวันเกิน), ข้อมูลมีปัญหาทุกแบบ, รอบเปลี่ยนเมื่อ "ต่อแล้ว" / ทุกรอบจบหมด, สถานะ typo, แท็บว่าง/ข้อมูลไม่ครบ, คนเดียวหลายช่องทาง, คนหนึ่งหลายบทบาท, วันที่ช่วงวันใช้วันสิ้นสุด, DRY_RUN ไม่เปลี่ยนแผนส่ง (เปลี่ยนแค่การลงมือส่ง)
- **Seam เสริม: ตัว parse วันที่** — ยิงรายกรณ์ตรงๆ ที่ระดับไวยากรณ์ (ทุกรูปแบบที่พบจริง, พ.ศ. ↔ ค.ศ., ช่วงวัน, typo ที่พบในข้อมูลจริง, ค่าขยะ) เพราะพื้นที่ input ใหญ่เกินจะประกอบเป็นแถวชีตเต็มทุกเคส
- **Adapter = เทสสัญญาภายนอกแบบบาง** — fake transport จับ payload ที่ยิงหา Brevo/Discord/Telegram และรูปแบบอ่านชีต; ไม่มีการติดต่อเครือข่ายจริงในเทส; Supabase queries บางที่สุด ตรวจด้วยตาช่วง DRY_RUN
- **Prior art: ไม่มี (greenfield)** — เทสชุดแรกเป็นตัวตั้ง pattern ของ Vitest ในโปรเจกต์ เน้นครอบแกน domain
- **Fixture ทั้งหมดเป็นข้อมูลปลอม** (repo public)

## Out of Scope

- การเขียนอะไรกลับลงชีต — ระบบ read-only (service account เป็น Viewer); คอลัมน์ระบบ "วันหมดอายุ (ระบบ)" เลื่อนไปพร้อมกับ write-back
- ระบบ role/สิทธิ์ซับซ้อนใน web app — ล็อกอิน = แก้ได้ทุกอย่าง
- ส่วน "งาน MA" — ไม่เขียน parser/จนกว่าจะมีข้อมูล MA จริงในชีต
- ช่องทาง LINE — ปฏิเสธแล้ว (โควตาฟรีหมดก่อนเมื่อแจ้งหลายครั้ง)
- การแจ้งเตือนรายชิ้น (แยกข้อความต่อรายการ) — ออกแบบเป็นข้อความสรุปรวมต่อวันเท่านั้น
- การแก้ไขข้อมูลงานผ่าน web app — ข้อมูลงานอยู่ในชีต ทีมแก้ในชีตเอง

## Further Notes

- **ข้อจำกัด free tier ที่ยอมรับไว้แล้ว**: Supabase free หลับถ้าไม่มี activity 1 สัปดาห์ — ระบบเขียน notify_log ทุกวันจึงไม่หลับ; Vercel Hobby cron 1 ครั้ง/วัน ช่วงเวลากว้าง ~1 ชั่วโมง — เพียงพอกับการแจ้งเตือนรายวัน
- **สิ่งที่ผู้ใช้ต้องทำคู่ขนาน (ไม่บล็อกการเขียนโค้ด — step-by-step จะจัดให้ถึงคิว)**: สมัครอีเมลผู้ส่ง + Brevo ยืนยัน sender · สร้าง Service Account + แชร์ชีตเป็น Viewer · สร้าง Supabase project `ma-noti` (Singapore) · สร้าง Vercel project + ใส่ env vars · เพิ่มคอลัมน์ `สถานะครั้งที่1..4` + Data validation ในชีต — รายการเต็มอยู่ใน `next-steps.md`
- ข้อมูลงานกำลังถูกไล่ใส่เรื่อยๆ — ระบบออกแบบให้ทนแท็บว่าง/ข้อมูลไม่ครบ; คาดว่าหมวด "ข้อมูลมีปัญหา" จะพลุกตอนต้น (ตามดีไซน์ — มันคือแรงผลักให้ทีมเก็บข้อมูลให้สะอาด)
- ศัพท์ตาม glossary ใน `CONTEXT.md` เป็นตัวตั้ง — ตั้งชื่อโค้ด/type ให้สอดคล้อง (รายการต่ออายุ, กลุ่มงาน, ฝ่าย, ข้อความสรุป, รอบการต่ออายุ)
- ลำดับการสร้าง 4 ขั้น (scaffold → domain+tests → web → cron+notifiers) อยู่ใน `next-steps.md`

## Comments

- 2026-10-07 — สร้างจาก to-spec (ผู้ใช้ยืนยัน seams): seam หลัก = ท่อรันรายวันบริสุทธิ์, seam เสริม = ตัว parse วันที่, adapter = สัญญาภายนอกแบบบาง; บันทึก grilling v6 เดิมย้ายไป `design.md`
