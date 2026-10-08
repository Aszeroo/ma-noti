// lib/notifiers/http.ts — POST JSON บาง ๆ ที่ผู้ส่งทั้ง 3 ตวัใชร้ ่วมกน (ticket #10)
// ทุกทางโยน Error พรอม "สถานะ + เหตผุลงาย ๆ" — handler จบทวนเปน send_status=failed

import type { Delivery, RenderedMessage } from '@/lib/domain/types';
import type { EnvSource, FetchLike, Notifier, NotifierOptions } from '@/lib/notifiers/types';

export interface PostJsonRequest {
  /** ชือเซอรวิสในขอความ error (brevo / discord / telegram) */
  label: string;
  url: string;
  payload: unknown;
  headers?: Record<string, string>;
}

/** เหตผุลจาก body ทີอาจไมใช JSON — ตัดสัน ๆ พอ (ลง details jsonb) */
function failureReason(text: string): string {
  try {
    const parsed = JSON.parse(text) as {
      message?: unknown;
      description?: unknown;
      error?: { message?: unknown };
    };
    const reason = parsed.message ?? parsed.description ?? parsed.error?.message;
    if (typeof reason === 'string' && reason.trim() !== '') return reason.trim().slice(0, 300);
  } catch {
    /* ตอบกลบไมเปน JSON — ใช้ข้อความดิบ */
  }
  const trimmed = text.trim();
  return trimmed === '' ? 'empty error body from service' : trimmed.slice(0, 200);
}

/**
 * POST JSON แลวคืน body ทີ parse แลว (body วาง เช่น Discord 204 = null)
 * non-2xx → โยน Error `<label> ส่งไม่สำเร็จ (<status>): <เหตผุลงาย ๆ>`
 */
export async function postJson(
  fetchImpl: FetchLike,
  request: PostJsonRequest,
): Promise<unknown | null> {
  const response = await fetchImpl(request.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...request.headers },
    body: JSON.stringify(request.payload),
  });
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`${request.label} send failed (${response.status}): ${failureReason(text)}`);
  }
  if (text.trim() === '') return null; // Discord webhook สำเรจดวย 204 วางเปลา
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null; // 2xx แตรตอบไมเปน JSON — ถือวาสำเรจ
  }
}

/** ตองมี fetch ใชไดเสมอ (Node >= 20.9) — เชคกอนยิงทุกครั้ง */
function requireFetch(fetchImpl: FetchLike | undefined): FetchLike {
  if (!fetchImpl) throw new Error('no fetch available (Node >= 20.9 required)');
  return fetchImpl;
}

/** ข้อมูลที่ทุก notifier ตองการ: ค่า env + fetch ที่ตรวจแลว */
export interface SendContext {
  env: EnvSource;
  fetch: FetchLike;
}

/**
 * โรงงานกลางของ notifier: จัด env / fetch ใหทุกชองทางเหมือนกัน
 * (env อ่านครังเดียวกตอนสรang แตอาคา ค่าตอน send สด ๆ — จิง stubEnv ในเทสได)
 */
export function createNotifier(
  options: NotifierOptions = {},
  send: (ctx: SendContext, delivery: Delivery, message: RenderedMessage) => Promise<void>,
): Notifier {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl;

  return {
    async send(delivery, message) {
      await send({ env, fetch: requireFetch(fetchImpl ?? globalThis.fetch) }, delivery, message);
    },
  };
}
