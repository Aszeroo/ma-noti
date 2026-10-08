import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { toCookieInit } from '@/lib/supabase/cookie-options';

/**
 * Supabase client per-request ฝั่ง server ในเซสชนของผใช (anon key + auth cookie → RLS role authenticated)
 * ใชใน server components / route handlers / server actions — cron ใช admin client (lib/supabase/server.ts) เหมือนเดิม
 * สรางใหมทุก request + ไมแตะ env ตอน import (ตอง build ผานแมยังไมมี env)
 */
export async function createSessionSupabaseClient() {
  // เรียก cookies() ก่อนเชค env: ตอน build ไม่มี env — pages ต้องถูก mark dynamic
  // (Next เห็น dynamic usage แล้วข้าม prerender) แทนที่จะพังเพราะ env error ข้างล่าง
  const cookieStore = await cookies();

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY ยังไมไดตัง (ดู .env.example)');
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, toCookieInit(options));
          }
        } catch {
          // server components เขียน cookie ไมได — proxy.ts เปนคนkeep cookie ใหมเอง
        }
      },
    },
  });
}
