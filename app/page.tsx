import { redirect } from 'next/navigation';

import { createSessionSupabaseClient } from '@/lib/supabase/session';

/**
 * หนาแรก (/) — ล็อกอินแลว → ประวัติการแจงเตือน / ยังไมล็อกอิน → หนา login
 * (proxy.ts กันไวอกชั้นกอนถิงหนา — this is the second gate, same decision)
 */
export default async function RootPage() {
  const supabase = await createSessionSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  redirect(data?.claims ? '/history' : '/login');
}
