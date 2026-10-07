import { handleDailyCheck } from '@/lib/cron/handler';

// เปน endpoint ที่ตองรันใหมทุกครง (ไม cache ผล response ของ cron)
export const dynamic = 'force-dynamic';

// Vercel Cron ยิงมาแบบ GET (พร้อม Authorization: Bearer <CRON_SECRET>),
// ส่วนทางสำรอง เชน GitHub Actions / curl ใช POST + x-cron-secret กไได
export const GET = handleDailyCheck;
export const POST = handleDailyCheck;
