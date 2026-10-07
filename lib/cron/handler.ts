import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { resolveSendMode } from '@/lib/config/send-mode';
import { buildDailyRunStub } from '@/lib/cron/daily-run';
import { verifyCronSecret } from '@/lib/cron/verify-secret';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * หัวใจของ endpoint /api/cron/daily-check — เขยีนแบบ Web API ล้วน (ไมขึ้นกับ next/server)
 * เพือใหเทสไดโดยตรงดาน node
 *
 * ลำดับการตัดสนใจ (เปลือกบาง — domain/ท่อรันไมรูจัก HTTP/DB/env):
 *   1) ตรวจ CRON_SECRET: ผิด/ไมมี → 401, เซิรฟเวอรไมมี secret ตังแตตน → 503
 *   2) ตัดสินใจ "สงหรือไมสง" จาก env DRY_RUN (คาเริ่มตน = DRY_RUN เสมอ)
 *   3) รันท่อรายวัน (ปจจุบัน = stub) แลวเขียน notify_log พรอม DRY_RUN marker
 */
export async function handleDailyCheck(request: Request): Promise<Response> {
  const secretCheck = verifyCronSecret(request.headers, process.env.CRON_SECRET);
  if (!secretCheck.ok) {
    if (secretCheck.reason === 'not_configured') {
      return json(503, { ok: false, error: 'CRON_SECRET not configured on server' });
    }
    return json(401, { ok: false, error: 'unauthorized' });
  }

  const mode = resolveSendMode(process.env.DRY_RUN);
  if (mode === 'send') {
    // ตั วสงจริง (Brevo/Discord/Telegram) ยั งไมมีใน ticket #2 —
    // ปฏิเสธดวย 501 แทนการเขียน log แบบ LIVE เทียมตา
    return json(501, {
      ok: false,
      error: 'sending not implemented yet — keep DRY_RUN=true until notifiers ship (ticket #4)',
    });
  }

  const plan = buildDailyRunStub({ runAt: new Date().toISOString(), mode });

  let supabase;
  try {
    supabase = getSupabaseAdminClient();
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : 'supabase client unavailable',
    });
  }

  const { error } = await supabase.from('notify_log').insert(plan.logRows);
  if (error) {
    return json(500, { ok: false, error: `notify_log insert failed: ${error.message}` });
  }

  return json(200, { ok: true, mode, logged: plan.logRows.length });
}
