import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DataTable, PageShell, cellStyle } from '@/components/ui';
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
  /** ticket #10: send_status/send_error (แถวตอบุคคล) + sent/failed (แถวลาดับรอบรัน) */
  details: Record<string, unknown> | null;
  person: { name: string } | null;
};

const CHANNEL_LABEL: Record<string, string> = {
  email: 'อเี มล',
  discord: 'Discord',
  telegram: 'Telegram',
};

/** สถานะส่งจริงของแถวต่อบุคคล/ช่องทาง — ไม่มี details.status = แสดงเหมือนเดิม (ticket #10) */
function sendStatusOf(details: Record<string, unknown> | null): 'sent' | 'failed' | null {
  const status = details?.send_status;
  return status === 'sent' || status === 'failed' ? status : null;
}

function sendErrorOf(details: Record<string, unknown> | null): string {
  return typeof details?.send_error === 'string' ? details.send_error : '';
}

/** สรุปของรอบรัน (แถว person_id = null): "ส่ง N / ไม่สำเร็จ M" เมื่อ mode = send */
function runSendSummary(details: Record<string, unknown> | null): string | null {
  const { sent, failed } = details ?? {};
  if (typeof sent !== 'number' || typeof failed !== 'number') return null;
  return `ส่ง ${sent} / ไม่สำเร็จ ${failed}`;
}

/** เวลาแสดงตาม Asia/Bangkok (ค่า timezeone_default ในตาราง settings) — พ.ศ. ตามแบบชองทีม */
const thDateTime = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  timeZone: 'Asia/Bangkok',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

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
    .select('id, sent_at, channel, item_count, dry_run, details, person:people(name)')
    .order('sent_at', { ascending: false })
    .limit(100)
    .returns<HistoryRow[]>();

  const rows = data ?? [];

  return (
    <PageShell
      title="ประวัติการแจ้างเตือน"
      backHref="/recipients"
      backLabel="จัดการผู้รับ"
    >
      <p style={{ color: '#555' }}>
        ประวตัิการรันของทอล้ิ งรายวัน (รอบการต่ออายุ) — คอลัมสถานะบอกวา DRY_RUN (ยงไมส่ งจริง) หรือส่ งแลว{' '}
        <a href="/settings" style={{ color: '#1d4ed8' }}>
          ตั้งค่าการแจงเตอืน
        </a>
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
          <DataTable
            headers={[
              "เวลา (Asia/Bangkok)",
              "ผูรบ",
              "ชองทาง",
              "จำนวนรายการ",
              "สถานะ",
            ]}
          >
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
                  ) : sendStatusOf(row.details) === 'failed' ? (
                    <span
                      style={{ color: '#b91c1c', fontWeight: 600 }}
                      title={sendErrorOf(row.details)}
                    >
                      ส่งไม่สำเร็จ
                    </span>
                  ) : (
                    <span style={{ color: '#166534', fontWeight: 600 }}>ส่งแล้ว</span>
                  )}
                  {runSendSummary(row.details) && (
                    <span style={{ marginLeft: '0.5rem', color: '#555' }}>
                      {runSendSummary(row.details)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
      )}
    </PageShell>
  );
}
