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
import { addAssignment, deleteAssignment, updateAssignment } from '@/lib/assignments/actions';
import {
  ASSIGNMENT_PARTIES,
  ASSIGNMENT_PARTY_LABEL,
  MAX_TAB_NAME_LENGTH,
  partyRequiresPerson,
  type AssignmentParty,
} from '@/lib/assignments/validation';
import { createSessionSupabaseClient } from '@/lib/supabase/session';

export const metadata: Metadata = {
  title: 'การจัดฝ่ายต่อแท็บ — ma-noti',
};

/** embedded person ตาม FK ของตาราง assignments (ค่าว่าง = ฝ่ายนั้นยังว่าง) */
type EmbeddedPerson = { id: string; name: string; active: boolean } | null;

type AssignmentRow = {
  id: string;
  sheet_tab: string;
  sales: EmbeddedPerson;
  productBuddy: EmbeddedPerson;
  quoting: EmbeddedPerson;
};

type PersonOption = { id: string; name: string; active: boolean };

/** ใช้ชื่อ FK ของ migration ต่อท้ายตาราง (เหมือน lib/config/team-config.ts) */
const ASSIGNMENT_SELECT =
  'id, sheet_tab, ' +
  'sales:people!assignments_sales_id_fkey(id, name, active), ' +
  'productBuddy:people!assignments_product_buddy_id_fkey(id, name, active), ' +
  'quoting:people!assignments_quoting_id_fkey(id, name, active)';

/** error code จาก server actions -> ข้อความแบนเนอร์บนหน้า */
const ERROR_TEXT: Record<string, string> = {
  invalid_tab: 'กรุณากรอกชื่อแท็บให้ตรงกับชื่อแท็บในชีต',
  tab_taken: 'แท็บนี้ถูกจัดฝ่ายไว้แล้วในระบบ — แก้ไขแถวที่มีอยู่แทนการเพิ่มใหม่',
  sales_required: 'ต้องเลือกSales (เจ้าของแท็บ) — ผูกฝ่ายอื่นภายหลังได้',
  invalid_person: 'ตัวเลือกฝ่ายไม่ถูกต้อง — กรุณาเลือกใหม่จากรายชื่อ',
  not_found: 'ไม่พบข้อมูลที่ต้องการแก้ไข (อาจถูกลบโดยคนอื่นไปแล้ว) — ข้อมูลที่เห็นเป็นข้อมูลล่าสุดแล้ว',
  db_error: 'บันทึกไม่สำเร็จ — ลองใหม่อีกครั้งหรือติดต่อผู้ดูแลระบบ',
};

const badgeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '0.125rem 0.5rem',
  borderRadius: '999px',
  backgroundColor: '#e5e7eb',
  color: '#374151',
  fontSize: '0.85rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

/** ป้ายเทาสําหรบของทที่ยังขาด (ยังไมผูก / ปดใชงาน) */
function Badge({ label }: { label: string }) {
  return (
    <span style={badgeStyle}>
      {label}
    </span>
  );
}


/** ยืนยน session (proxy กันไว้อีกขันขางนอก — นี่เปนดานสองตามแบบหนา recipients) */
async function ensureSignedIn(supabase: Awaited<ReturnType<typeof createSessionSupabaseClient>>) {
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/login');
}

/** Supabase คืน data=null เมื่อไมมีแถว → แปลงเปน array วาง */
function rowsOrEmpty<T>(data: T[] | null): T[] {
  return data ?? [];
}

/** คนของหนึงฝายของแท็บ (embedded = null ตอนยังไมผูก) */
function partyPerson(row: AssignmentRow, party: AssignmentParty): EmbeddedPerson {
  if (party === 'sales') return row.sales;
  return party === 'product_buddy' ? row.productBuddy : row.quoting;
}

/**
 * dropdown เลือกคนของหนึ่งฝ่าย — active up ท้าย แต่แสดง inactive ด้วยแกขอมูลเกาได
 * คนเดียวเลือกซ้ำหลายฝ่าย/หลายแท็บได ตามสเปก จึงไมมี rule unique กันคน
 */
function PersonSelect({
  id,
  party,
  people,
  current,
}: {
  id?: string;
  party: AssignmentParty;
  people: PersonOption[];
  current: EmbeddedPerson;
}) {
  const optional = !partyRequiresPerson(party);
  return (
    <select
      id={id}
      name={`${party}_id`}
      style={fieldStyle}
      defaultValue={current?.id ?? ''}
      required={optional ? undefined : true}
      aria-label={`${ASSIGNMENT_PARTY_LABEL[party]} ของแท็บ`}
    >
      {optional && <option value="">ยังไมไดผูก</option>}
      {people.map((person) => (
        <option key={`${party}-${person.id}`} value={person.id}>
          {person.name}
          {person.active ? '' : ' (ปดใชงาน)'}
        </option>
      ))}
    </select>
  );
}

/** ชือแท็บ + dropdown สามฝ่าย (ใชรวมกันทังฟอรมเพิมใหมและฟอรมแกไข) */
function AssignmentFields({
  people,
  tab,
  parties,
  idPrefix,
}: {
  people: PersonOption[];
  tab: string;
  parties: Record<AssignmentParty, EmbeddedPerson>;
  idPrefix: string;
}) {
  return (
    <>
      <label htmlFor={`${idPrefix}-tab`} style={{ fontWeight: 600 }}>
        ชือแท็บ
      </label>
      <input
        id={`${idPrefix}-tab`}
        name="sheet_tab"
        defaultValue={tab}
        required
        maxLength={MAX_TAB_NAME_LENGTH}
        placeholder="ตองตรงกับชือแท็บในชิต"
        style={{ ...fieldStyle, minWidth: '14rem' }}
      />
      {ASSIGNMENT_PARTIES.map((party) => (
        <span key={party} style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center' }}>
          <label htmlFor={`${idPrefix}-${party}`} style={{ fontWeight: 600 }}>
            {ASSIGNMENT_PARTY_LABEL[party]}
          </label>
          <PersonSelect
            id={`${idPrefix}-${party}`}
            party={party}
            people={people}
            current={parties[party]}
          />
        </span>
      ))}
    </>
  );
}

/** สถานะหนึ่งฝ่ายในตาราง: ชือคน หรือปายวายังไมผูก */
function PartyCell({ person }: { person: EmbeddedPerson }) {
  if (!person) return <Badge label="ยังไมไดผูก" />;
  return (
    <span
      style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}
    >
      {person.name}
      {!person.active && <Badge label="ปดใชงาน" />}
    </span>
  );
}

/** การดหนึ่งแท็บ: สรุ ปสามฝาย + ฟอรมแกไขการจัด + ปมลบ */
function AssignmentCard({ row, people }: { row: AssignmentRow; people: PersonOption[] }) {
  const parties: Record<AssignmentParty, EmbeddedPerson> = {
    sales: row.sales,
    product_buddy: row.productBuddy,
    quoting: row.quoting,
  };
  return (
    <section style={cardStyle}>
      <header style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{row.sheet_tab}</h2>
        <span style={{ color: '#555', fontSize: '0.9rem' }}>
          {[row.sales, row.productBuddy, row.quoting].filter(Boolean).length} / 3 ฝาย
        </span>
      </header>

      <DataTable headers={['ฝาย', 'คนทีผูกไว']}>
        {ASSIGNMENT_PARTIES.map((party) => (
          <tr key={party}>
            <td style={cellStyle}>{ASSIGNMENT_PARTY_LABEL[party]}</td>
            <td style={cellStyle}>
              <PartyCell person={partyPerson(row, party)} />
            </td>
          </tr>
        ))}
      </DataTable>

      <form
        action={updateAssignment}
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginTop: '0.75rem',
        }}
      >
        <input type="hidden" name="id" value={row.id} />
        <AssignmentFields people={people} tab={row.sheet_tab} parties={parties} idPrefix={row.id} />
        <button type="submit" style={buttonStyle}>
          บนทึก
        </button>
      </form>

      <form action={deleteAssignment} style={{ marginTop: '0.75rem' }}>
        <input type="hidden" name="id" value={row.id} />
        <button type="submit" style={dangerButtonStyle}>
          ลบแท็บออกจากการจัดฝาย
        </button>
      </form>
    </section>
  );
}

/**
 * หนาการจัดฝายตอแท็บ (ticket #8): ผูกแท็บ Sales ในชิตกับผูรบั 3 ฝาย
 * sales (เจาของแท็บ), Product Buddy, Quoting Team — คนเดียวเปนหลายฝายได
 *
 * อ่าน/เขียนผาน session client ของผูใช → RLS role authenticated คุมทุกคำสัง
 * cron รอบถัดไปเห้นการแกไขทันที เพราะ lib/config/team-config.ts อ่าน DB สดทุกรอบ (ไมมีแคช)
 * แท็บที Sales วาง = ตกจาก TeamConfig = จะไมมีใครไดแจงเตือนจากแท็บนัน
 * คนปดใชงานเลือกไวได (แกขอมูลเกา) แต config loader จะขามคนนันตามปกติ
 */
export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSessionSupabaseClient();
  await ensureSignedIn(supabase);

  const params = await searchParams;
  const [assignmentsResult, peopleResult] = await Promise.all([
    supabase
      .from('assignments')
      .select(ASSIGNMENT_SELECT)
      .order('sheet_tab', { ascending: true })
      .returns<AssignmentRow[]>(),
    supabase
      .from('people')
      .select('id, name, active')
      .order('active', { ascending: false })
      .order('name', { ascending: true })
      .returns<PersonOption[]>(),
  ]);

  const assignments = rowsOrEmpty(assignmentsResult.data);
  const people = rowsOrEmpty(peopleResult.data);
  const queryError = assignmentsResult.error ?? peopleResult.error;
  const alert = alertText(queryError, flashErrorText(ERROR_TEXT, params), 'อ่านข้อมูลการจัดฝ่ายไม่ได');

  return (
    <PageShell title="การจัดฝายตอแท็บ" backHref="/recipients" backLabel="จัดการผูรบ">
      <p style={{ color: '#555' }}>
        ผูกแตละแท็บในชิตกับผูรบ 3 ฝาย — Sales (เจาของแท็บ), Product Buddy, Quoting Team
        คนเดียวเลือกไดหลายฝายและหลายแท็บ เพิม Sales หรือแท็บใหมบนหนานี้ไดเลย ไมตองแกโคด ไมตอง deploy{' '}
        <a href="/recipients" style={{ color: '#1d4ed8' }}>
          จัดการผูรบ
        </a>
      </p>

      {alert && (
        <p role="alert" style={{ color: '#b91c1c', fontWeight: 600 }}>
          {alert}
        </p>
      )}

      {people.length === 0 && !queryError && (
        <p role="status" style={{ color: '#555', fontStyle: 'italic' }}>
          ยังไมมีผูรบในฐานขอมูล — เพิมคนกอนในหนาจัดการผูรบ
        </p>
      )}

      <section style={{ ...cardStyle, marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>เพิมแท็บใหม</h2>
        <form
          action={addAssignment}
          style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}
        >
          <AssignmentFields
            people={people}
            tab=""
            parties={{ sales: null, product_buddy: null, quoting: null }}
            idPrefix="new"
          />
          <button type="submit" style={buttonStyle}>
            เพิมแท็บ
          </button>
        </form>
        <p style={{ color: '#555', fontSize: '0.85rem', marginBottom: 0 }}>
          ตองเลือก Sales เสมอ สองฝายที่เหลือเวนไวได ตารางจะแสดงวายังไมผูกใหเห็นชัด
        </p>
      </section>

      {assignments.length === 0 && !queryError && people.length > 0 && (
        <p role="status" style={{ color: '#555', fontStyle: 'italic' }}>
          ยังไมมีแท็บใดถููกจัดฝาย — ทุกแท็บในชิตจึงไมมีใครไดแจงเตือน
        </p>
      )}

      {assignments.map((row) => (
        <AssignmentCard key={row.id} row={row} people={people} />
      ))}

      <p style={{ color: '#555', fontSize: '0.85rem' }}>
        หมายเหตุ: ชือแท็บตองตรงกับชือแท็บในชิต ตัวอักษรตรงกันทุกตัว
      </p>
    </PageShell>
  );
}
