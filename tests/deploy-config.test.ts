import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const VERCEL_JSON = readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8');
const WORKFLOW = readFileSync(
  fileURLToPath(new URL('../.github/workflows/cron-fallback.yml', import.meta.url)),
  'utf8',
);
const ENV_EXAMPLE = readFileSync(fileURLToPath(new URL('../.env.example', import.meta.url)), 'utf8');
const DEPLOY_DOC = readFileSync(fileURLToPath(new URL('../docs/deploy.md', import.meta.url)), 'utf8');

interface VercelConfig {
  crons: { path: string; schedule: string }[];
}

/**
 * กันการแก cron config / workflow แลวเผลอทำเวลา·endpoint·secret พัง (ticket #11) —
 * ตรวจโครงสรางระดับข้อความเทา (deploy จring เปน action ของผใชตาม docs/deploy.md)
 */
describe('vercel.json — cron รายวัน 08:00 Asia/Bangkok ชี้ endpoint จริง', () => {
  const config = JSON.parse(VERCEL_JSON) as VercelConfig;

  it('parse ได และประกาศ cron ไวหนึ่ง job', () => {
    expect(Array.isArray(config.crons)).toBe(true);
    expect(config.crons).toHaveLength(1);
  });

  it('path ตรง endpoint cron จริง (/api/cron/daily-check)', () => {
    expect(config.crons[0]?.path).toBe('/api/cron/daily-check');
  });

  it('schedule 01:00 UTC = 08:00 Asia/Bangkok (Vercel cron ใช UTC, Bangkok ไมมี DST)', () => {
    expect(config.crons[0]?.schedule).toBe('0 1 * * *');
  });
});

describe('cron-fallback.yml — ทางสำรอง GitHub Actions', () => {
  it('มี schedule (01:30 UTC = หน Vercel cron 30 นาที) + workflow_dispatch สำหรับ manual trigger', () => {
    expect(WORKFLOW).toMatch(/schedule:/);
    expect(WORKFLOW).toMatch(/cron:\s*["']30 1 \* \* \*["']/);
    expect(WORKFLOW).toMatch(/workflow_dispatch:/);
  });

  it('ยิง endpoint เดียวกับ Vercel cron ผ่าน DEPLOY_URL', () => {
    expect(WORKFLOW).toMatch(/\$DEPLOY_URL\/api\/cron\/daily-check/);
  });

  it('ส่ง secret ผ่าน header x-cron-secret และใช้ POST (endpoint รองรับทั้ง GET/POST)', () => {
    expect(WORKFLOW).toMatch(/-X POST/);
    expect(WORKFLOW).toMatch(/x-cron-secret:\s*\$CRON_SECRET/);
  });

  it('อ้าง secret ผ่าน GitHub secrets เท่านั้น — ไม่มีค่าจริง/โดเมนจริง hardcode', () => {
    expect(WORKFLOW).toContain('secrets.CRON_SECRET');
    expect(WORKFLOW).toContain('secrets.DEPLOY_URL');
    // .vercel.app ใด ๆ ในไฟล์ต้องเป็น placeholder เท่านั้น
    for (const line of WORKFLOW.split('\n')) {
      if (line.includes('.vercel.app')) {
        expect(line).toContain('REPLACE-WITH-YOUR-PRODUCTION-URL');
      }
    }
    expect(WORKFLOW).not.toMatch(/[0-9a-f]{40}/i); // hex token ยาว (secret Leaks)
    expect(WORKFLOW).not.toMatch(/ghp_|gho_|github_pat_|xkeysib-/);
  });

  it('fail ชัดเจนเมื่อ secret ขาด (--fail-with-body ทำให้ workflow แดงตอน 401/503)', () => {
    expect(WORKFLOW).toContain('--fail-with-body');
    expect(WORKFLOW).toMatch(/if \[\[ "\$DEPLOY_URL" == \*REPLACE-WITH/);
    expect(WORKFLOW).toMatch(/if \[\[ -z "\$CRON_SECRET" \]\]/);
  });
});

describe('docs/deploy.md — checklist ผู้ใช้ครบตาม AC', () => {
  const ENVS = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GOOGLE_SHEET_ID',
    'GOOGLE_SERVICE_ACCOUNT',
    'BREVO_API_KEY',
    'BREVO_SENDER_EMAIL',
    'BREVO_SENDER_NAME',
    'TELEGRAM_BOT_TOKEN',
    'CRON_SECRET',
    'DRY_RUN',
  ] as const;

  it.each(ENVS)('ตาราง env กล่าวถึง %s', (env) => {
    expect(DEPLOY_DOC).toContain(env);
  });

  it('env ทุกตัวใน .env.example มีอยู่ในตาราง deploy (กันหลุดตอนเพิ่ม env ใหม่)', () => {
    const declared = ENV_EXAMPLE.split('\n')
      .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
      .filter((name): name is string => Boolean(name));
    expect(declared.length).toBeGreaterThanOrEqual(11);
    for (const name of declared) {
      expect(DEPLOY_DOC).toContain(name);
    }
  });

  it('มีหัวข้อสำคัญ: manual trigger, ตรวจ history, คอลัมสถานะ + Data validation, พลิก DRY_RUN', () => {
    expect(DEPLOY_DOC).toContain('Run workflow');
    expect(DEPLOY_DOC).toContain('notify_log');
    expect(DEPLOY_DOC).toContain('Data validation');
    // ต้องเอ่ยคอลัมน์ "สถานะคร...ที่ N" ครบทั้ง 4 คอลัมน์ (ชื่อคอลัมน์ตาม PRD)
    for (const n of ['1', '2', '3', '4']) {
      expect(DEPLOY_DOC).toMatch(new RegExp(`สถานะคร.{1,12} ${n}`));
    }
    expect(DEPLOY_DOC).toMatch(/DRY_RUN[\s\S]*false/);
  });

  it('บอกชัดว่า deploy แรกต้อง DRY_RUN และวิธีสร้าง CRON_SECRET', () => {
    expect(DEPLOY_DOC).toMatch(/DRY_RUN=true/);
    expect(DEPLOY_DOC).toContain('openssl rand -hex 32');
  });
});
