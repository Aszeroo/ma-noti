// หน้าตาแรกชั่ วคราว (ticket #2) — หน้าจัดการจรงิ (login/recipients/assignments/settings/history)
//จะมาใน ticket #3
export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>ma-noti</h1>
      <p>ระบบแจ้างเตือนงานต่ออายุ — โครงส้างพื้ นฐานเรียบร้อยแล้ว (ticket #2)</p>
      <ul>
        <li>ฐานข้อมูล 5 ตาราง + RLS: <code>supabase/migrations/</code></li>
        <li>endpoint cron: <code>GET/POST /api/cron/daily-check</code> (ป้องกันด้วย CRON_SECRET)</li>
        <li>ตารางเวลา: ทุกวัน 08:00 Asia/Bangkok (Vercel Cron <code>0 1 * * *</code> UTC)</li>
      </ul>
      <p>
        สถานะปัจจุ บัน: ท่อรันแบบ stub + DRY_RUN — อ่า นคู่มือตั้ งค่างานไดที้ี่ <code>docs/setup-supabase.md</code>
      </p>
    </main>
  );
}
