import { handleDailyCheck } from '@/lib/cron/handler';

// เปน endpoint ที่ตองรันใหมทุกครง (ไม cache ผล response ของ cron)
export const dynamic = 'force-dynamic';

// Vercel Cron ยิงมาแบบ GET (พรอม Authorization: Bearer <CRON_SECRET>),
// สวนทางสำรอง เชน GitHub Actions / curl ใช POST + x-cron-secret กได
// หมายเหต (ticket #5): ห่อหนวยงานไวตรงนี้ — handleDailyCheck รับ deps ฉลากปลอม
// เปนพารามิทรองสองสำหรับเทส ถา export ตรง ๆ Next จะส่ง context { params } เขาไปปนกับ deps
export const GET = (request: Request): Promise<Response> => handleDailyCheck(request);
export const POST = (request: Request): Promise<Response> => handleDailyCheck(request);
