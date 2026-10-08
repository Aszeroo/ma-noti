// lib/config/team-config.ts — โหลดคอนฟิกรวมจาก Supabase 4 ตาราง → TeamConfig (ticket #5)
// people + channels (เฉพาะ active) · assignments (ผูกแท็บ → 3 ฝา่ย) · settings (1 แถว: lead_times)
// ข้อมูลว่าง/แถวหาย → TeamConfig ว่างทียัง valid: ท่อรันผ่าน แบบไม่มີผู้รรับถูกแจ้าง แต่ log ยังหวังมมีี
// หลักฐานรอบรัน (แถว run-round จาก pipeline) — ตามสเปก "คอนฟิคว่าง → รันผ่าน ไม่มมีีกีารส่งใด"

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdminClient } from '@/lib/supabase/server';
import type {
  AssignmentParty,
  DeliveryChannelType,
  LeadTimes,
  PartyLeadTimes,
  TabAssignment,
  TeamConfig,
} from '@/lib/domain/types';

/** ค่า default ตามสเปก — sales/product_buddy เตือน 30/14/7/3/1 + วันหมดอายุ (0), quoting 60/45/30 */
export const DEFAULT_LEAD_TIMES: PartyLeadTimes = {
  sales: [30, 14, 7, 3, 1, 0],
  product_buddy: [30, 14, 7, 3, 1, 0],
  quoting: [60, 45, 30],
};

/** คอนฟิกว่างสมบูรณ์ — ใช้เมื่อตารางยังไม่มีข้อมูล (ท่อรันผ่าน + log แถวเดียว) */
export function emptyTeamConfig(): TeamConfig {
  return { assignments: [], recipients: [], leadTimes: DEFAULT_LEAD_TIMES };
}

// ---- row shapes จาก PostgREST ----

export interface PersonRow {
  id: string;
  name: string;
  active: boolean;
}

export interface ChannelRow {
  person_id: string;
  type: string;
  contact: string;
}

/** embedded person 1-ต่อ-1 ตาม FK ของ assignments (ชื่อ alias ตรงกับ query ด้านล่าง) */
export interface EmbeddedParty {
  id: string;
  name: string;
  active: boolean;
}

export interface AssignmentRow {
  sheet_tab: string;
  sales: EmbeddedParty | null;
  productBuddy: EmbeddedParty | null;
  quoting: EmbeddedParty | null;
}

export interface TeamConfigRows {
  people: PersonRow[];
  channels: ChannelRow[];
  assignments: AssignmentRow[];
  /** ค่า lead_times ดิบจาก settings (jsonb) — null/shape ผิด = ใช้ default ต่อฝ่าย */
  leadTimes: unknown;
}

const CHANNEL_TYPES = new Set<DeliveryChannelType>(['email', 'discord', 'telegram']);

function activeParty(party: EmbeddedParty | null): AssignmentParty | null {
  if (!party || party.active !== true) return null;
  return { personId: party.id, personName: party.name };
}

/** array วันนับถอยหลังเท่านั้น (จำนวนเต็ม ≥ 0, เด็ดค่าซ้ำ+เรียงขึ้น) — ไม่ใช่ array ของวัน = null */
function toLeadTimes(raw: unknown): LeadTimes | null {
  if (!Array.isArray(raw)) return null;
  const days = raw.filter(
    (n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0,
  );
  const unique = [...new Set(days)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : null;
}

/** lead_times จาก settings → ใช้ต่อฝ่ายที่ valid; ขาด/เสีย = default ของฝ่ายนั้น (รันไม่พัง) */
export function resolveLeadTimes(raw: unknown): PartyLeadTimes {
  const settings =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    sales: toLeadTimes(settings.sales) ?? DEFAULT_LEAD_TIMES.sales,
    product_buddy: toLeadTimes(settings.product_buddy) ?? DEFAULT_LEAD_TIMES.product_buddy,
    quoting: toLeadTimes(settings.quoting) ?? DEFAULT_LEAD_TIMES.quoting,
  };
}

/**
 * map แถว DB (canned ได้ในเทส) → TeamConfig — pure function ไม่มี network
 * - recipients: เฉพาะ channel active + คน active + type รู้จัก (email/discord/telegram)
 * - assignments: ข้ามแถวที่ sales inactive/หาย (ไม่มีเจ้าของแท็บ = ไม่มีใครถูกแจ้งเตือน)
 *   buddy/quoting inactive → null (บทบาทนั้นไม่มีคน — pipeline ข้ามแบบไม่พัง)
 */
export function mapTeamConfig(rows: TeamConfigRows): TeamConfig {
  const activePeople = new Map(
    rows.people.filter(person => person.active === true).map(person => [person.id, person.name]),
  );

  const recipients = rows.channels.flatMap(channel => {
    const personName = activePeople.get(channel.person_id);
    const type = CHANNEL_TYPES.has(channel.type as DeliveryChannelType)
      ? (channel.type as DeliveryChannelType)
      : null;
    if (!personName || !type) return []; // คน inactive / channel type ไม่รู้จัก → ข้าม
    return [{ personId: channel.person_id, personName, channel: type, contact: channel.contact }];
  });

  const assignments = rows.assignments.flatMap((row): TabAssignment[] => {
    const sales = activeParty(row.sales);
    if (!sales) return []; // เจ้าของแท็บ (sales) หาย/inactive → ไม่มีใครรับผิดชอบ → ไม่ผูก
    return [
      {
        sheetTab: row.sheet_tab,
        sales,
        productBuddy: activeParty(row.productBuddy),
        quoting: activeParty(row.quoting),
      },
    ];
  });

  return { assignments, recipients, leadTimes: resolveLeadTimes(rows.leadTimes) };
}

// ---- โหลดจริงจาก Supabase (admin client — ข้าม RLS เพราะ cron ไม่มี session) ----

async function rowsOrThrow<T>(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  table: string,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${table} query failed: ${error.message}`);
  return (data ?? []) as T[];
}

// embedded names ผ่านชื่อ FK ตาม convention ของ migration (assignments_<col>_fkey)
const ASSIGNMENT_SELECT =
  'sheet_tab, ' +
  'sales:people!assignments_sales_id_fkey(id, name, active), ' +
  'productBuddy:people!assignments_product_buddy_id_fkey(id, name, active), ' +
  'quoting:people!assignments_quoting_id_fkey(id, name, active)';

/**
 * โหลด 4 ตารางด้วย service role แล้ว map → TeamConfig
 * error ระดับ query → throw (endpoint ตอบ 500 พร้อมเหตุผล); ข้อมูลว่าง → emptyTeamConfig ที่ยังรันผ่าน
 */
export async function loadTeamConfig(
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<TeamConfig> {
  const [people, channels, assignments, settings] = await Promise.all([
    rowsOrThrow<PersonRow>(
      client.from('people').select('id, name, active').eq('active', true),
      'people',
    ),
    rowsOrThrow<ChannelRow>(
      client
        .from('channels')
        .select('person_id, type, contact')
        .eq('active', true),
      'channels',
    ),
    rowsOrThrow<AssignmentRow>(client.from('assignments').select(ASSIGNMENT_SELECT), 'assignments'),
    rowsOrThrow<{ lead_times: unknown }>(
      client.from('settings').select('lead_times').eq('id', 1),
      'settings',
    ),
  ]);

  return mapTeamConfig({
    people,
    channels,
    assignments,
    leadTimes: settings[0]?.lead_times ?? null,
  });
}
