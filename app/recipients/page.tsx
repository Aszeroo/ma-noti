import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { CSSProperties } from 'react';

import {
  DataTable,
  PageShell,
  alertText,
  buttonStyle,
  cardStyle,
  cellStyle,
  dangerButtonStyle,
  fieldStyle,
  flashErrorText,
  ghostButtonStyle,
} from '@/components/ui';
import {
  addChannel,
  addPerson,
  deleteChannel,
  deletePerson,
  renamePerson,
  setChannelActive,
  setPersonActive,
  updateChannel,
} from '@/lib/recipients/actions';
import { CHANNEL_TYPES, MAX_PERSON_NAME_LENGTH } from '@/lib/recipients/validation';
import { createSessionSupabaseClient } from '@/lib/supabase/session';

export const metadata: Metadata = {
  title: 'จัดการผู้รับ — ma-noti',
};

type ChannelRow = { id: string; type: string; contact: string; active: boolean };
type PersonRow = { id: string; name: string; active: boolean; channels: ChannelRow[] };

/** error code จาก server actions → ข้อความแบนเนอร์ (แพตเทิร์นเดียวกับหน้า login) */
const ERROR_TEXT: Record<string, string> = {
  invalid_name: 'ชื่อผู้รับต้องไม่ซ้ำซ้อนกับช่องว่าง และไม่ยาวเกิน 100 ตัวอักษร',
  invalid_type: 'ประเภทช่องทางไม่ถูกต้อง — รับเฉพาะ อีเมล / Discord / Telegram',
  invalid_contact:
    'ข้อมูลติดต่อไม่ตรงกับประเภทที่เลือก — ' +
    'อีเมลต้องมี @, Discord ต้องเป็นลิงก์ webhook ของ Discord, Telegram ต้องเป็นตัวเลข',
  not_found: 'ไม่พบข้อมูลที่ต้องการแก้ไข (อาจถูกลบโดยคนอื่นไปแล้ว) — ข้อมูลที่เห็นเป็นข้อมูลล่าสุดแล้ว',
  db_error: 'บันทึกไม่สำเร็จ — ลองใหม่อีกครั้งหรือติดต่อผู้ดูแลระบบ',
};

const CHANNEL_LABEL: Record<string, string> = {
  email: 'อีเมล',
  discord: 'Discord',
  telegram: 'Telegram',
};

/** placeholder รวมทุกรูปแบบในช่องเดียว (หน้านี้เป็น server component ล้วน ไม่ใช้ JavaScript) */
const CONTACT_HINT = 'someone@team.example · https://discord.com/api/webhooks/… · 123456789';



/** ไม่มี query error และไม่มีคนในฐานข้อมูล → แสดงคำแนะนำเพิ่มคนแรก */
function isEmptyList(queryFailed: boolean, personCount: number): boolean {
  return !queryFailed && personCount === 0;
}

/** ยืนยัน session (proxy กันไว้อีกชั้นหน้างนอก — นีเป็นด่านสองตามแบบหนา history) */
async function ensureSignedIn(supabase: Awaited<ReturnType<typeof createSessionSupabaseClient>>) {
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/login');
}

/** Supabase คืน data=null เมื่อไม่มีแถว — แปลงเป็น array ว่างให renderStraight */
function peopleRows(data: PersonRow[] | null): PersonRow[] {
  return data ?? [];
}

/** สถานะสลับปุม่ เปิด/ปิด: ค่าที่ส่งให้ action + ป้ายบนปุม่ */
function toggleOf(active: boolean): { nextValue: 'true' | 'false'; label: string } {
  return active
    ? { nextValue: 'false', label: 'ปิดใช้งาน' }
    : { nextValue: 'true', label: 'เปิดใช้งาน' };
}

function InactiveBadge() {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.125rem 0.5rem',
        borderRadius: '999px',
        backgroundColor: '#e5e7eb',
        color: '#374151',
        fontSize: '0.85rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      ปิดใช้งาน
    </span>
  );
}

/** dropdown เลือกประเภทช่องทาง (ใช้ร่วมกันทั้งฟอร์มเพิ่มและฟอร์มแก้ไข) */
function ChannelTypeSelect({
  id,
  name,
  defaultValue,
}: {
  id?: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <select id={id} name={name} style={fieldStyle} defaultValue={defaultValue}>
      {CHANNEL_TYPES.map((type) => (
        <option key={type} value={type}>
          {CHANNEL_LABEL[type]}
        </option>
      ))}
    </select>
  );
}

/** แถวช่องทางในตาราง: ประเภท + ข้อมูลติดต่อ + สถานะ + ชุดฟอร์มจัดการ */
function ChannelRowItem({ channel }: { channel: ChannelRow }) {
  const label = CHANNEL_LABEL[channel.type] ?? channel.type;
  const toggle = toggleOf(channel.active);
  return (
    <tr>
      <td style={cellStyle}>{label}</td>
      <td style={{ ...cellStyle, wordBreak: 'break-all' }}>{channel.contact}</td>
      <td style={cellStyle}>{!channel.active && <InactiveBadge />}</td>
      <td style={cellStyle}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <form
            action={updateChannel}
            style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}
          >
            <input type="hidden" name="id" value={channel.id} />
            <ChannelTypeSelect name="type" defaultValue={channel.type} />
            <input
              name="contact"
              defaultValue={channel.contact}
              required
              aria-label={`ข้อมูลติดต่อของ ${label}`}
              style={{ ...fieldStyle, minWidth: '14rem' }}
            />
            <button type="submit" style={ghostButtonStyle}>
              บันทึก
            </button>
          </form>
          <form action={setChannelActive} style={{ display: 'inline' }}>
            <input type="hidden" name="id" value={channel.id} />
            <input type="hidden" name="active" value={toggle.nextValue} />
            <button type="submit" style={ghostButtonStyle}>
              {toggle.label}
            </button>
          </form>
          <form action={deleteChannel} style={{ display: 'inline' }}>
            <input type="hidden" name="id" value={channel.id} />
            <button type="submit" style={dangerButtonStyle}>
              ลบ
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

/** การ์ดหนึ่งคน: ชื่อ + สถานะ + ชุดฟอร์มระดับคน + ตารางช่องทาง + ฟอร์มเพิ่มช่องทาง */
function PersonSection({ person }: { person: PersonRow }) {
  const toggle = toggleOf(person.active);
  return (
    <section style={{ ...cardStyle, opacity: person.active ? 1 : 0.75 }}>
      <header
        style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap' }}
      >
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{person.name}</h2>
        {!person.active && <InactiveBadge />}
        <span style={{ color: '#555', fontSize: '0.9rem' }}>
          {person.channels.length} ช่องทาง
        </span>
      </header>

      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          margin: '0.75rem 0',
        }}
      >
        <form action={renamePerson} style={{ display: 'flex', gap: '0.375rem' }}>
          <input type="hidden" name="id" value={person.id} />
          <label htmlFor={`name-${person.id}`} style={{ fontWeight: 600 }}>
            ชื่อ
          </label>
          <input
            id={`name-${person.id}`}
            name="name"
            defaultValue={person.name}
            required
            maxLength={MAX_PERSON_NAME_LENGTH}
            style={fieldStyle}
          />
          <button type="submit" style={ghostButtonStyle}>
            แก้ไขชื่อ
          </button>
        </form>
        <form action={setPersonActive}>
          <input type="hidden" name="id" value={person.id} />
          <input type="hidden" name="active" value={toggle.nextValue} />
          <button type="submit" style={ghostButtonStyle}>
            {toggle.label}
          </button>
        </form>
        <form action={deletePerson}>
          <input type="hidden" name="id" value={person.id} />
          <button type="submit" style={dangerButtonStyle}>
            ลบถาวร
          </button>
        </form>
      </div>

      <DataTable headers={['ประเภท', 'ข้อมูลติดต่อ', 'สถานะ', 'จัดการ']}>
        {person.channels.length === 0 && (
          <tr>
            <td colSpan={4} style={{ ...cellStyle, color: '#555', fontStyle: 'italic' }}>
              ยังไม่มีช่องทาง — เพิ่มด้านล่างเพื่อเริ่มแจ้างเตือนคนน้ี
            </td>
          </tr>
        )}
        {person.channels.map((channel) => (
          <ChannelRowItem key={channel.id} channel={channel} />
        ))}
      </DataTable>

      <form
        action={addChannel}
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginTop: '0.75rem',
        }}
      >
        <input type="hidden" name="person_id" value={person.id} />
        <label htmlFor={`type-${person.id}`} style={{ fontWeight: 600 }}>
          เพิ่มช่องทาง
        </label>
        <ChannelTypeSelect id={`type-${person.id}`} name="type" defaultValue="email" />
        <input
          name="contact"
          required
          placeholder={CONTACT_HINT}
          style={{ ...fieldStyle, minWidth: '18rem' }}
        />
        <button type="submit" style={buttonStyle}>
          เพิ่มช่องทาง
        </button>
      </form>
    </section>
  );
}

/**
 * หน้าจัดการผู้รับทุกคนและช่องทางต่อคน (ticket #7)
 * อ่าน/เขียนผ่าน session client ของผู้ใช้งาน → RLS role authenticatedคุมสิทธิ์ทุกคำสั่ง
 * cron รอบถัดไปเห็นการแก้ไขทันที เพราะ lib/config/team-config.ts อ่าน DB สดทุกรอบ (ไม่มีแคช)
 * การปิดใช้งาน (active=false) แยกจากลบถาวรชัดเจน:
 * ปิดใช้งานเก็บประวัติ notify_log ไว้หมด, ลบถาวร cascade ถึงช่องทางของคนนั้น
 * แต่แถวประวัติเก่ายังอยู่ (person_id ถูก set null ตาม FK ของตาราง)
 */
export default async function RecipientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSessionSupabaseClient();
  await ensureSignedIn(supabase);

  const params = await searchParams;
  const { data, error } = await supabase
    .from('people')
    .select('id, name, active, channels(id, type, contact, active)')
    .order('name', { ascending: true })
    .returns<PersonRow[]>();

  const people = peopleRows(data);
  const alert = alertText(error, flashErrorText(ERROR_TEXT, params), 'อ่านข้อมูลผู้รับไม่ได้');
  const showEmptyHint = isEmptyList(Boolean(error), people.length);

  return (
    <PageShell
      title="จัดการผู้รับ"
      backHref="/history"
      backLabel="ประวัตกิารแจ้างเตือน"
    >
      <p style={{ color: '#555' }}>
        ผู้รับหนึ่งคนได้หลายช่องทาง (อีเมล / Discord / Telegram) — ข้อมูลติดต่ออยู่ในฐานข้อมูลเท่านั้น
        การแก้ไขมีผลกับ cron รอบถัดไปทันทีโดยไม่ต้อง deploy
        {' '}
        <a href="/assignments" style={{ color: '#1d4ed8' }}>
          การจัดฝายตอแท็บ
        </a>
      </p>

      {alert && (
        <p role="alert" style={{ color: '#b91c1c', fontWeight: 600 }}>
          {alert}
        </p>
      )}

      {showEmptyHint && (
        <p role="status" style={{ color: '#555', fontStyle: 'italic' }}>
          ยังไม่มีผู้รับในฐานข้อมูล — เพิ่มคนแรกด้วยฟอร์มด้านล่าง แล้วค่อยเพิ่มช่องทางต่อไป
        </p>
      )}

      <section style={{ ...cardStyle, marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>เพิ่มผู้รับ</h2>
        <form action={addPerson} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <label htmlFor="new-person-name" style={{ fontWeight: 600 }}>
            ชื่อ
          </label>
          <input
            id="new-person-name"
            name="name"
            required
            maxLength={MAX_PERSON_NAME_LENGTH}
            placeholder="เช่น สมชาย ทีมขาย"
            style={{ ...fieldStyle, minWidth: '16rem' }}
          />
          <button type="submit" style={buttonStyle}>
            เพิ่มผู้รับ
          </button>
        </form>
      </section>

      {people.map((person) => (
        <PersonSection key={person.id} person={person} />
      ))}

      <p style={{ color: '#555', fontSize: '0.85rem' }}>
        หมายเหตุ: “ปิดใช้งาน” ทำให้ cron ข้ามโดยไม่ลบประวัติ — ใช้เป็นตัวเลือก default;
        ส่วน “ลบถาวร” จะลบช่องทางของคนนั้นไปด้วย ใช้เมื่อผู้รับนั้นบันทึกผิดจริงเท่านั้น
      </p>
    </PageShell>
  );
}
