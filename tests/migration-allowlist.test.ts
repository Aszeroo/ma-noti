import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/20261008000000_auth_allowlist.sql', import.meta.url)),
  'utf8',
);

/**
 * กันการแก้มิเกรชน allowlist แลวเผลอทำสเปกหลุด (ticket #6) — ตรวจโครงสรางระดับขอกความ
 * (รัน SQL จริงตองใช Postgres: ใหรันทะเบียด Supabase SQL Editor ตาม docs/setup-supabase.md)
 */
describe('มิกเรชน auth allowlist — allowed_emails + RLS', () => {
  it('สรางตาราง public.allowed_emails (email เปน primary key)', () => {
    expect(MIGRATION).toMatch(/create table public\.allowed_emails\b/i);
    expect(MIGRATION).toMatch(/email\s+text primary key/i);
  });

  it('เปด RLS บน allowed_emails (ตารางที่ 6 ตองไดรับการคุมเหมือนตารางอื่น)', () => {
    expect(MIGRATION).toMatch(
      /alter table public\.allowed_emails\s+enable row level security/i,
    );
  });

  it('มี policy ให authenticated เทานั้น (lock in แลวอางได)', () => {
    expect(MIGRATION).toMatch(/create policy \w+ on public\.allowed_emails/i);
    expect(MIGRATION).toMatch(/for select to authenticated using \(true\)/i);
  });

  it('ไมมี policy ใหนอกเหนือ authenticated (anon แตะไมได)', () => {
    expect(MIGRATION).not.toMatch(/(^|\s)to\s+(anon|public)\b/im);
  });

  it('กันเขียนผาน policy ของ authenticated (เพิม/ลบผาน service_role เทานั้น)', () => {
    const policies = MIGRATION.match(/create policy[^;]+;/gi) ?? [];
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatch(/for select/i);
  });

  it('ไมมี seed อีเมลจริงในไฟล์ (repo public — อนุญาตแค่ example.com ใน comment)', () => {
    expect(MIGRATION).not.toMatch(/^\s*insert\s+into/i);
    expect(MIGRATION).not.toMatch(/[a-z0-9._%+-]+@(?!example\.com)[a-z0-9-]+(\.[a-z0-9-]+)+/i);
  });
});
