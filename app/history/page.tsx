import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { CSSProperties } from 'react';

import { signOut } from '@/lib/auth/actions';
import { createSessionSupabaseClient } from '@/lib/supabase/session';

export const metadata: Metadata = {
  title: 'ประวัติการแจ้างเตือน — ma-noti',
};

type HistoryRow = {
  id: number;
  sent_at: string;
  channel: string | null;
  item_count: number;
  dry_run: boolean;
  person: { name: string } | null;
};

const CHANNEL_LABEL: Record<string, string> = {
  email: 'อเี มล',
  discord: 'Discord',
  telegram: 'Telegram',
};

/** เวลาแสดงตาม Asia/Bangkok (ค่า timezeone_default ในตาราง settings) — พ.ศ. ตามแบบชองทีม */
const thDateTime = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  timeZone: 'Asia/Bangkok',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const cellStyle: CSSProperties = { padding: '0.5rem 0.75rem', borderBottom: '1px solid #ddd' };

/**
 * หนาประวัติการแจ้างเตือน (ticket #6) — อ่าน notify_log ดวย session ของผใู ช ผาน RLS
 * โครง schedule เขียน notify_log ดวย service role (มามาแล้วจาก ticket #2/#4) — หนาเว็บอานอยางเดียว
 */
export default async function HistoryPage() {
  const supabase = await createSessionSupabaseClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect('/login');

  const { data, error } = await supabase
    .from('notify_log')
    .select('id, sent_at, channel, item_count, dry_run, person:people(name)')
    .order('sent_at', { ascending: false })
    .limit(100)
    .returns<HistoryRow[]>();

  const rows = data ?? [];

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: '56rem',
        margin: '2rem auto',
        padding: '0 1rem',
        color: '#1a1a1a',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ margin: 0 }}>ประวัติการแจ้างเตือน</h1>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              padding: '0.375rem 1rem',
              fontSize: '0.95rem',
              backgroundColor: '#fff',
              border: '1px solid #999',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            ออกจากระบบ
          </button>
        </form>
      </header>
      <p style={{ color: '#555' }}>
        ประวตัิการรันของทอล้ิ งรายวัน (รอบการต่ออายุ) — คอลัมสถานะบอกวา DRY_RUN (ยงไมส่ งจริง) หรือส่ งแลว
      </p>

      {error && (
        <p role="alert" style={{ color: '#b91c1c', fontWeight: 600 }}>
          อานประวัติไมได้: {error.message}
        </p>
      )}

      {!error && rows.length === 0 && (
        <p role="status" style={{ color: '#555', fontStyle: 'italic' }}>
          ยงไมมีประวตัิ — รอทอล้ิ ง cron รันครังแรก (ทุกวัน 08:00 น. ตามเวลาประเทศไทย) แลวหนาจะแสดง
        </p>
      )}

      {rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={cellStyle}>เวลา (Asia/Bangkok)</th>
              <th style={cellStyle}>ผูรบ</th>
              <th style={cellStyle}>ชองทาง</th>
              <th style={cellStyle}>จำนวนรายการ</th>
              <th style={cellStyle}>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={cellStyle}>{thDateTime.format(new Date(row.sent_at))}</td>
                <td style={cellStyle}>{row.person?.name ?? 'ข้่อความสรุปรวมทุกฝ่าย'}</td>
                <td style={cellStyle}>
                  {row.channel ? (CHANNEL_LABEL[row.channel] ?? row.channel) : '—'}
                </td>
                <td style={cellStyle}>{row.item_count}</td>
                <td style={cellStyle}>
                  {row.dry_run ? (
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '999px',
                        backgroundColor: '#fef3c7',
                        color: '#92400e',
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                      }}
                    >
                      DRY_RUN
                    </span>
                  ) : (
                    <span style={{ color: '#166534', fontWeight: 600 }}>ส่ งแลว</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
