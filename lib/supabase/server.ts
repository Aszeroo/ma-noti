import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Supabase client ฝั่ ง server ที่ cron ใช้ (service_role — ข้าม RLS เพราะ cron ไม่มี user session)
 * สร้าง lazily + cache ไว้ — ไม่แตะ env ตอน import (build ต้องผ่านถ้ามี่ไม่มี env)
 */
export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ยังไม่ไดต้ัง (ดู .env.example)');
  }
  cached ??= createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cached;
}
