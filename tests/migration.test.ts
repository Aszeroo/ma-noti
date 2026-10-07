import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/20261007000000_init.sql', import.meta.url)),
  'utf8',
);

const TABLES = ['people', 'channels', 'assignments', 'settings', 'notify_log'] as const;

/**
 * กันการแก้มิเกรชันแล้วเผลอทำสเปกหลุด (ตาราง/RLS) — ตรวจโครงสรางระดับข้อความ
 * (การรัน SQL จริงตองใช Postgres: ใหรันผาน Supabase SQL Editor ตาม docs/setup-supabase.md)
 */
describe('มิกเรชันฐานข้อมูล — ครบ 5 ตาราง + RLS ทุกตาราง', () => {
  it.each(TABLES)('สร้างตาราง %s', (table) => {
    expect(MIGRATION).toMatch(new RegExp(`create table public\\.${table}\\b`, 'i'));
  });

  it.each(TABLES)('เปิด RLS บนตาราง %s', (table) => {
    expect(MIGRATION).toMatch(
      new RegExp(`alter table public\\.${table}\\s+enable row level security`, 'i'),
    );
  });

  it('มี policy ให้ authenticated ครบทั้ง 5 ตาราง (ล็อกอินแล้ว = อ่าน/เขียนได้ทั้งหมด)', () => {
    const policies = MIGRATION.match(/create policy \w+ on public\.\w+/gi) ?? [];
    expect(policies).toHaveLength(5);
    for (const table of TABLES) {
      expect(policies.some((p) => p.includes(`public.${table}`))).toBe(true);
    }
    expect(MIGRATION).toMatch(/to authenticated\s+using \(true\) with check \(true\)/i);
  });

  it('ไม่มี policy ให้นอกเหนือ authenticated (ยังไม่ได้ล็อกอิน = แตะไม่ได้)', () => {
    // ตรวจเป้าหมายของ "to <role>" เท่านั้ន (ไม่ให้ "insert into public..." มาหลอก match)
    expect(MIGRATION).not.toMatch(/(^|\s)to\s+(anon|public)\b/im);
  });

  it('settings มีแถวเดียวพร้อมค่าเริ่มต้น + seed แถว id=1', () => {
    expect(MIGRATION).toMatch(/constraint settings_single_row_check check \(id = 1\)/i);
    expect(MIGRATION).toMatch(/"sales":\[30,14,7,3,1\]/);
    expect(MIGRATION).toMatch(/"quoting":\[60,45,30\]/);
    expect(MIGRATION).toMatch(/Asia\/Bangkok/);
    expect(MIGRATION).toMatch(/insert into public\.settings \(id\) values \(1\)/i);
  });

  it('notify_log มี dry_run marker และ channel จำกัด 3 ช่องทาง', () => {
    expect(MIGRATION).toMatch(/dry_run\s+boolean not null default true/i);
    expect(MIGRATION).toMatch(/channel in \('email', 'discord', 'telegram'\)/i);
  });
});
