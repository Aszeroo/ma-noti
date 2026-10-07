import { describe, expect, it } from 'vitest';

import { buildDailyRunStub } from '@/lib/cron/daily-run';

const RUN_AT = '2026-10-07T01:00:00.000Z'; // 08:00 Asia/Bangkok

describe('buildDailyRunStub — ท่อรันรายวัน (stub) เขียนแถว log พร้อม marker', () => {
  it('โหมด dry_run → แถว log พร้อม DRY_RUN marker + dry_run=true', () => {
    const plan = buildDailyRunStub({ runAt: RUN_AT, mode: 'dry_run' });

    expect(plan.logRows).toHaveLength(1);
    const [row] = plan.logRows;
    expect(row?.dry_run).toBe(true);
    expect(row?.details.marker).toBe('DRY_RUN');
    expect(row?.details.run_at).toBe(RUN_AT);
    expect(row?.person_id).toBeNull(); // แถวระดับรอบรัน (ยังไม่ผูกคน/ช่องทางใน stub)
    expect(row?.channel).toBeNull();
    expect(row?.item_count).toBe(0);
  });

  it('โหมด send → marker เปน LIVE และ dry_run=false (ท่ อ รัน ไม ตัด สินใจ mode เอง)', () => {
    const plan = buildDailyRunStub({ runAt: RUN_AT, mode: 'send' });

    expect(plan.logRows).toHaveLength(1);
    expect(plan.logRows[0]?.dry_run).toBe(false);
    expect(plan.logRows[0]?.details.marker).toBe('LIVE');
  });
});
