import type { SendMode } from '@/lib/config/send-mode';

export interface NotifyLogRow {
  person_id: string | null;
  channel: 'email' | 'discord' | 'telegram' | null;
  item_count: number;
  details: Record<string, unknown>;
  /** DRY_RUN marker ประจำรอบ — เก็บลงคอลัมน์ dry_run ของ notify_log */
  dry_run: boolean;
}

export interface DailyRunInput {
  /** เวลา ISO ของรอบรัน (ส่งเขา้มาจาก shell — pipeline ไม่เรียกเวลาเอง) */
  runAt: string;
  /** โหมดส่ง/ไม่ส่ง — การตัดสินใจอยู่นอกท่อ (shell แก้จาก env แล้วส่งเข้ามา) */
  mode: SendMode;
}

export interface DailyRunPlan {
  /** แถวที่ต้องเขียนลง notify_log ของรอบนี้ */
  logRows: NotifyLogRow[];
}

/**
 * ท่อรันรายวัน — เวอร์ชัน STUB (ticket #2)
 *
 * ticket #3 จะแทนที่เนื้อในด้วย pipeline จริง (อ่านชีต → domain → digest)
 * โดยคงสัญญา (input/output) นี้ไว้ — pipeline ไม่รู้จัก env/DB/HTTP
 * และไม่ตัดสินใจเรื่อง "ส่งหรือไม่ส่ง" เอง (รับ mode เข้ามาอย่างเดียว)
 */
export function buildDailyRunStub(input: DailyRunInput): DailyRunPlan {
  const marker = input.mode === 'dry_run' ? 'DRY_RUN' : 'LIVE';
  return {
    logRows: [
      {
        person_id: null,
        channel: null, // แถวระดับ "รอบรัน" — แถวต่อคน/ต่อช่องทางจะมาพร้อม pipeline จริง
        item_count: 0,
        details: {
          marker, // DRY_RUN marker ตามสเปก — หน้า history (ticket #3) ใช้แสดงสถานะ
          stage: 'scaffold',
          note: 'stub run — ท่อจริงมาใน ticket #3, ตัวส่งจริงมาใน ticket #4',
          run_at: input.runAt,
        },
        dry_run: input.mode === 'dry_run',
      },
    ],
  };
}
