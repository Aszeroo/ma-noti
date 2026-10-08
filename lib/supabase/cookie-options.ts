import type { CookieOptions } from '@supabase/ssr';

/**
 * ปรับ cookie options ของ @supabase/ssr (Partial<SerializeOptions> จาก pkg `cookie`)
 * ใหเหลือเฉพาะฟild ท่ next/headers / NextResponse.cookies.set รับจริง
 * (ตัด encode/priority ทิง — normalize expires/sameSite ท่ types กนแคบกวา)
 */
export function toCookieInit(options: CookieOptions): {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
} {
  return {
    domain: options.domain,
    expires: options.expires instanceof Date ? options.expires : undefined,
    httpOnly: options.httpOnly,
    maxAge: options.maxAge,
    path: options.path,
    sameSite:
      options.sameSite === 'lax' || options.sameSite === 'strict' || options.sameSite === 'none'
        ? options.sameSite
        : undefined,
    secure: options.secure,
  };
}
