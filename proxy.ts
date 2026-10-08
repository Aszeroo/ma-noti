import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { toCookieInit } from '@/lib/supabase/cookie-options';

const LOGIN_PATH = '/login';
const HISTORY_PATH = '/history';

type PendingCookie = { name: string; value: string; options: Parameters<typeof toCookieInit>[0] };

/**
 * Session gate ของทกหนาว็บ (Next 16: middleware.ts ถูกrename เปน proxy.ts)
 * 1) refresh auth cookie ใหมทุก request (เขียนทัง request + response ตามแบบ @supabase/ssr)
 * 2) ยังไมล็อกอิน → กันไป /login (หน้าอื่ น ๆ แตะฐานข้อมลูไมไดอยู ำ ล้วเพราะ RLS)
 * 3) ล็อกอินแลว → /login หรือ / ถูกส่งตอไป /history
 * หมายเหตuj: ใช getClaims() (ยนยน token) ตามแนวทาง Supabase — ไมเชื่อ getSession() ดิบ ๆ
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // ยงไมมี env (เชน CI ที่ไมเดอน proxy) → ปล่อยผาน หนาจะแสดง error ชัดเจนเอง
    return response;
  }

  let pendingCookies: PendingCookie[] = [];
  let pendingHeaders: Record<string, string> = {};
  const applyPending = (target: NextResponse): NextResponse => {
    for (const { name, value, options } of pendingCookies) {
      target.cookies.set(name, value, toCookieInit(options));
    }
    for (const [key, value] of Object.entries(pendingHeaders)) {
      target.headers.set(key, value);
    }
    return target;
  };

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        // ตองเขียนทัง request (ให getAll เห็นคาใหมใน request เดยีวกน) และ response
        // สะสมทกุ ครังท่ี setAll ถูกเรยก (อาจหลายครังตอ request) — redirect ทายสุดจะไดมคี้ อกกีครบทกุตว
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        pendingCookies.push(...cookiesToSet);
        Object.assign(pendingHeaders, cacheHeaders);
        applyPending(response);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (loggedIn && (pathname === '/' || pathname === LOGIN_PATH)) {
    return applyPending(NextResponse.redirect(new URL(HISTORY_PATH, request.url)));
  }
  if (!loggedIn && pathname !== LOGIN_PATH) {
    return applyPending(NextResponse.redirect(new URL(LOGIN_PATH, request.url)));
  }

  return response;
}

// เฉพาะหนาว็บ — ไมแตะ /auth/callback (route จัดการ session เอง) และไมแตะ /api/* (cron มี CRON_SECRET ของมอันเอง)
export const config = {
  matcher: ['/', '/login', '/history/:path*', '/recipients/:path*', '/settings/:path*'],
};
