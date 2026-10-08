import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { CSSProperties } from 'react';

import { PageShell } from '@/components/ui';
import { resolveLeadTimes, DEFAULT_LEAD_TIMES } from '@/lib/config/team-config';
import { saveSettings } from '@/lib/settings/actions';
import {
  SETTINGS_PARTY_LABEL,
  SETTINGS_PARTIES,
  type SettingsParty,
} from '@/lib/settings/validation';
import { createSessionSupabaseClient } from '@/lib/supabase/session';

export const metadata: Metadata = {
  title: 'ตั้้งค่าการแจ้างเตือน — ma-noti',
};

/** Settings row from settings table (id = 1) */
type SettingsRow = {
  lead_times: { sales: number[]; product_buddy: number[]; quoting: number[] };
  send_time: string;
  timezone: string;
};

/** error code จาก server action -> ข้อความที่แสดงบนหน้า (ภาษาไทย) */
const ERROR_TEXT: Record<string, string> = {
  invalid_lead_times:
    'รอบเตอืนตองเปนจำนวนเตม ≥ 0 คั่่นด้วย comma (เช่น 30,14,7,3,1) และไมซ้ากน — 0 (วันหมดอายุ) อนุญาตเฉพาะ Sales / Product Buddy',
  invalid_send_time:
    'เวลาส่งตองเปนรูปแบบ HH:mm (เช่น 08:00) — ชวัโมง 00–23 นาที 00–59',
  invalid_timezone:
    'timezone เปนขอความวางไมได (เช่น Asia/Bangkok)',
  db_error:
    'บันทึกลงฐานข้อมูลไม่ไ่ด้ — ลองอีกครั้งหรือติดต่อเจ้าของระบบ',
};

const fieldStyle: CSSProperties = {
  padding: '0.375rem 0.625rem',
  fontSize: '0.95rem',
  border: '1px solid #999',
  borderRadius: '0.375rem',
};
const buttonStyle: CSSProperties = {
  padding: '0.375rem 0.875rem',
  fontSize: '0.95rem',
  backgroundColor: '#1d4ed8',
  color: '#fff',
  border: 'none',
  borderRadius: '0.375rem',
  cursor: 'pointer',
};

/** searchParams ?error=<code> → ข้อความแบนเนอรน์์ (key ที่ไม่รู่จัก → ไม่แสดง) */
function flashErrorText(
  params: Record<string, string | string[] | undefined>,
): string | undefined {
  const errorKey = Array.isArray(params.error) ? params.error[0] : params.error;
  if (!errorKey || !Object.hasOwn(ERROR_TEXT, errorKey)) {
    return undefined;
  }
  return ERROR_TEXT[errorKey];
}

async function ensureSignedIn(supabase: Awaited<ReturnType<typeof createSessionSupabaseClient>>) {
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/login');
}

function currentLeadTimes(
  row: { lead_times: unknown } | undefined,
): { sales: number[]; product_buddy: number[]; quoting: number[] } {
  return row && row.lead_times ? resolveLeadTimes(row.lead_times) : DEFAULT_LEAD_TIMES;
}

function currentSendTime(rowSendTime?: string): string {
  return rowSendTime && /^\d{2}:\d{2}$/.test(rowSendTime) ? rowSendTime : '08:00';
}

function currentTimezone(rowTimezone?: string): string {
  return rowTimezone?.trim() || 'Asia/Bangkok';
}

function isMissingRow(queryFailed: boolean, rowCount: number): boolean {
  return !queryFailed && rowCount === 0;
}

/** ค่า default ของฟอร์มจากแถว DB (ไมมีแถว / ค่าไมครบ → ค่าเริ่่มต่นทมี) */
function formDefaults(row: SettingsRow | undefined): {
  parties: Record<SettingsParty, string>;
  sendTime: string;
  timezone: string;
} {
  const leadTimes = currentLeadTimes(row);
  return {
    parties: {
      sales: leadTimes.sales.join(','),
      product_buddy: leadTimes.product_buddy.join(','),
      quoting: leadTimes.quoting.join(','),
    },
    sendTime: currentSendTime(row?.send_time),
    timezone: currentTimezone(row?.timezone),
  };
}

/**
 * Settings page (ticket #9): lead times + send time/timezone
 * session client (RLS authenticated) — admin client forbidden
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSessionSupabaseClient();
  await ensureSignedIn(supabase);

  const params = await searchParams;
  const { data, error } = await supabase
    .from('settings')
    .select('lead_times, send_time, timezone')
    .eq('id', 1)
    .returns<SettingsRow[]>();

  const rows = data ?? [];
  const defaults = formDefaults(rows[0]);
  const alert = flashErrorText(params);
  const showFirstSaveHint = isMissingRow(Boolean(error), rows.length);

  return (
    <PageShell
      title="ตั้งค่าการแจ้งเตือน"
      backHref="/recipients"
      backLabel="จัดการผู้รับ"
    >
      <p style={{ color: '#555' }}>
        รอบเตือนต่อฝ่าย (Lead Times) + เวลาส่ง/timezone — cron อ่านค่าจากฐานข้อมูลสดทุกรอบ
        แก้แล้วมีผลกับรอบถัดไปทันที
      </p>

      {alert && (
        <p role="alert" style={{ color: '#b91c1c', fontWeight: 600 }}>
          {alert}
        </p>
      )}

      {showFirstSaveHint && (
        <p role="status" style={{ color: '#555', fontStyle: 'italic' }}>
          ยังไม่มีแถวในตาราง settings — บันทึกครั้งแรกจะสร้างแถว (id = 1) ให้อัตโนมัติ
        </p>
      )}

      <form
        action={saveSettings}
        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
      >
        {SETTINGS_PARTIES.map((party) => (
          <div key={party} style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            <label htmlFor={`lead-${party}`} style={{ fontWeight: 600 }}>
              {SETTINGS_PARTY_LABEL[party]}
            </label>
            <input
              id={`lead-${party}`}
              name={party}
              defaultValue={defaults.parties[party]}
              required
              aria-label={`รอบเตือนของ${SETTINGS_PARTY_LABEL[party]}`}
              style={{ ...fieldStyle, minWidth: '14rem' }}
            />
          </div>
        ))}
        <label htmlFor="send-time" style={{ fontWeight: 600 }}>
          เวลาส่ง (HH:mm)
        </label>
        <input
          id="send-time"
          name="send_time"
          defaultValue={defaults.sendTime}
          required
          style={fieldStyle}
        />
        <label htmlFor="timezone" style={{ fontWeight: 600 }}>
          timezone
        </label>
        <input
          id="timezone"
          name="timezone"
          defaultValue={defaults.timezone}
          required
          style={{ ...fieldStyle, minWidth: '12rem' }}
        />
        <button type="submit" style={buttonStyle}>
          บันทึก
        </button>
      </form>

      <p style={{ color: '#555', fontSize: '0.85rem' }}>
        0 = วันหมดอายุ อนุญาตเฉพาะ {SETTINGS_PARTY_LABEL.sales} /{' '}
        {SETTINGS_PARTY_LABEL.product_buddy} — เวลาส่งจริงขึ้นอยู่กับ cron schedule ที่ deploy
      </p>
    </PageShell>
  );
}
