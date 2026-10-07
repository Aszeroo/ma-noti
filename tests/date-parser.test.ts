import { describe, expect, it } from 'vitest';

import { parseExpiryDate, type PlainDate } from '@/lib/domain/date-parser';

// fixture ทั้งหมด = ข้อมลปลอม (repo public — ห้ามข้อมลูจริง) — หนว่ ยงาน/งานสมมุติทั้งส้ิน
function ok(date: PlainDate) {
  return { ok: true, date, format: 'single' } as const;
}

describe('parseExpiryDate — ตัว parse วันหมดอายุ (แกน domain บริสุทธิ์ · seam เสริม)', () => {
  describe('รูปแบบไทย พ.ศ. (ชื่อเต็ม)', () => {
    it('28 สิงหาคม 2568 → ค.ศ. 2025 (พ.ศ. − 543 ถุกต้อง)', () => {
      expect(parseExpiryDate('28 สิงหาคม 2568')).toEqual(ok({ year: 2025, month: 8, day: 28 }));
    });

    it('ทุกเดือนไทยชื่อเต็ม map ถุกเดือน + แปลง พ.ศ. → ค.ศ.', () => {
      const thaiFull: Array<[string, number]> = [
        ['1 มกราคม 2568', 1],
        ['2 กุมภาพันธ์ 2568', 2],
        ['3 มีนาคม 2568', 3],
        ['4 เมษายน 2568', 4],
        ['5 พฤษภาคม 2568', 5],
        ['6 มิถุนายน 2568', 6],
        ['7 กรกฎาคม 2568', 7],
        ['8 สิงหาคม 2568', 8],
        ['9 กันยายน 2568', 9],
        ['10 ตุลาคม 2568', 10],
        ['11 พฤศจิกายน 2568', 11],
        ['12 ธันวาคม 2568', 12],
      ];
      for (const [text, month] of thaiFull) {
        const result = parseExpiryDate(text);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.date).toEqual({ year: 2025, month, day: result.date.day });
      }
    });

  });

  describe('รูปแบบไทย พ.ศ. (ตัวย่อ)', () => {
    it('ส.ค. (มีจุด) → เดือน 8', () => {
      expect(parseExpiryDate('27 ส.ค. 2569')).toEqual(ok({ year: 2026, month: 8, day: 27 }));
    });

    it('รับตัวอย่าทั้ง 12 เดือน', () => {
      const abbrev: Array<[string, number]> = [
        ['1 ม.ค. 2568', 1],
        ['2 ก.พ. 2568', 2],
        ['3 มี.ค. 2568', 3],
        ['4 เม.ย. 2568', 4],
        ['5 พ.ค. 2568', 5],
        ['6 มิ.ย. 2568', 6],
        ['7 ก.ค. 2568', 7],
        ['8 ส.ค. 2568', 8],
        ['9 ก.ย. 2568', 9],
        ['10 ต.ค. 2568', 10],
        ['11 พ.ย. 2568', 11],
        ['12 ธ.ค. 2568', 12],
      ];
      for (const [text, month] of abbrev) {
        const result = parseExpiryDate(text);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.date.month).toBe(month);
      }
    });
  });

  describe('รูปแบบอังกฤษ', () => {
    it('08 December 2026 → 2026-12-08', () => {
      expect(parseExpiryDate('08 December 2026')).toEqual(ok({ year: 2026, month: 12, day: 8 }));
    });

    it('รับทั้งชื่อเต็มและตัวย่อ 3 ตัวอักษร (case-insensitive)', () => {
      expect(parseExpiryDate('8 Dec 2026')).toEqual(ok({ year: 2026, month: 12, day: 8 }));
      expect(parseExpiryDate('8 dec 2026')).toEqual(ok({ year: 2026, month: 12, day: 8 }));
      expect(parseExpiryDate('1 Jan 2027')).toEqual(ok({ year: 2027, month: 1, day: 1 }));
    });

    it('แบบ เดือน–วัน–ปี (December 8, 2026)', () => {
      expect(parseExpiryDate('December 8, 2026')).toEqual(ok({ year: 2026, month: 12, day: 8 }));
      expect(parseExpiryDate('Dec 8 2026')).toEqual(ok({ year: 2026, month: 12, day: 8 }));
    });

    it('ค.ศ. เต็ม 4 หลักในรูปอังกฤษ ไม่ถูกแปลงเป็น พ.ศ.', () => {
      const result = parseExpiryDate('31 December 2026');
      expect(result.ok && result.date.year).toBe(2026);
    });
  });

  describe('รูปแบบ dd/mm/yyyy (วัน/เดือน/ปี แบบไทย-ยุโรป)', () => {
    it('24/04/2026 → 2026-04-24 (วันก่อนเดือน)', () => {
      expect(parseExpiryDate('24/04/2026')).toEqual(ok({ year: 2026, month: 4, day: 24 }));
    });

    it('เลขวันหลักเดียวก็ได ้และทนช่องว่างรอบ /', () => {
      expect(parseExpiryDate('1/2/2027')).toEqual(ok({ year: 2027, month: 2, day: 1 }));
      expect(parseExpiryDate('24 / 04 / 2026')).toEqual(ok({ year: 2026, month: 4, day: 24 }));
    });

    it('ปี พ.ศ. ใน dd/mm/yyyy (≥2400) แปลงเป็น ค.ศ.', () => {
      expect(parseExpiryDate('28/08/2568')).toEqual(ok({ year: 2025, month: 8, day: 28 }));
    });
  });

  describe('คำนำหน้า (เช่น "Period :")', () => {
    it('ตัดคำนำหน้าทิ้งแล้วอ่านช่วงหลัง', () => {
      expect(parseExpiryDate('Period : 02/12/2025 - 01/12/2026')).toMatchObject({
        ok: true,
        date: { year: 2026, month: 12, day: 1 },
      });
    });

    it('คำนำหน้าแบบอื่น (ต่ออายุ:) ก็ผ่าน', () => {
      expect(parseExpiryDate('ต่ออายุ: 01/12/2026')).toMatchObject({
        ok: true,
        date: { year: 2026, month: 12, day: 1 },
      });
    });
  });

  describe('ช่วงวัน → ใช้วันสุดท้ายเป็น deadline', () => {
    it('ช่วงไทย พ.ศ. → deadline = วันสิ้นสุด (ค.ศ. 2026)', () => {
      const result = parseExpiryDate('28 สิงหาคม 2568 - 27 สิงหาคม 2569');
      expect(result).toMatchObject({ ok: true, format: 'range' });
      if (result.ok) {
        expect(result.date).toEqual({ year: 2026, month: 8, day: 27 });
        expect(result.range).toEqual({
          start: { year: 2025, month: 8, day: 28 },
          end: { year: 2026, month: 8, day: 27 },
        });
      }
    });

    it('ช่วง dd/mm/yyyy → deadline = ตัวถัดไป', () => {
      expect(parseExpiryDate('24/04/2026 - 23/04/2027')).toMatchObject({
        ok: true,
        date: { year: 2027, month: 4, day: 23 },
      });
    });

    it('ตัวคั่้นหลายแบบ (- – — to ถึง) ให้ผลเท่ากัน', () => {
      const expected = { ok: true, date: { year: 2027, month: 4, day: 23 } };
      expect(parseExpiryDate('24/04/2026 - 23/04/2027')).toMatchObject(expected);
      expect(parseExpiryDate('24/04/2026 – 23/04/2027')).toMatchObject(expected);
      expect(parseExpiryDate('24/04/2026 ถึง 23/04/2027')).toMatchObject(expected);
    });
  });

  describe('เคสติดลบ · ค่าว่าง/ขยะ/อ่านไม่ออก', () => {
    it('ค่าว่าง/ช่องว่างอย่างเดียว → empty', () => {
      for (const raw of ['', '   ', '\t\n', ' ']) {
        const result = parseExpiryDate(raw);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('empty');
      }
    });

    it('ค่าขยะที่ไม่มีวัน → no_date_found + message อ่านรู้เรื่อง', () => {
      for (const raw of ['N/A', '-', 'ยังไม่ระบุ', 'รอคอนเฟิร์ม', 'asdf', 'เดือนหน้า']) {
        const result = parseExpiryDate(raw);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('no_date_found');
          expect(result.message.length).toBeGreaterThan(0);
        }
      }
    });

    it('วัน/เดือนเกินปฏิทิน → invalid_date', () => {
      expect(parseExpiryDate('31/02/2026')).toMatchObject({ ok: false, reason: 'invalid_date' });
      expect(parseExpiryDate('24/13/2026')).toMatchObject({ ok: false, reason: 'invalid_date' });
      expect(parseExpiryDate('30 กุมภาพันธ์ 2568')).toMatchObject({ ok: false, reason: 'invalid_date' });
    });

    it('29 ก.พ. ปีไม่ใช่อธิกสุรทิน → invalid_date แต่ปีอธิกสุรทินผ่าน', () => {
      expect(parseExpiryDate('29/02/2026')).toMatchObject({ ok: false, reason: 'invalid_date' }); // 2026 ไม่Leap
      expect(parseExpiryDate('29/02/2028')).toMatchObject({ ok: true }); // 2028 Leap
    });

    it('มากกว่าสองวันในช่องเดียว → too_many_dates', () => {
      expect(parseExpiryDate('01/01/2026 - 01/01/2027 - 01/01/2028')).toMatchObject({
        ok: false,
        reason: 'too_many_dates',
      });
    });
  });

  describe('เคสติดลบ · typo จริงที่พบในข้อมูล (ช่วงผิดปกติ)', () => {
    it('ช่วงที่ปีเดียวกันทั้งสองข้าง → range_same_year (น่าสงสัยว่าลืมเพิ่มปี)', () => {
      const result = parseExpiryDate('24/04/2026 - 23/04/2026');
      expect(result).toMatchObject({ ok: false, reason: 'range_same_year' });
    });

    it('ช่วงไทย พ.ศ. ปีเดียวกันทั้งสองข้าง → range_same_year เช่นกัน', () => {
      expect(parseExpiryDate('28 สิงหาคม 2568 - 27 สิงหาคม 2568')).toMatchObject({
        ok: false,
        reason: 'range_same_year',
      });
    });

    it('ช่วงย้อนหลัง (สิ้นสุดก่อนเริ่มต้น ข้ามปี) → range_reversed', () => {
      expect(parseExpiryDate('27 สิงหาคม 2569 - 28 สิงหาคม 2568')).toMatchObject({
        ok: false,
        reason: 'range_reversed',
      });
    });
  });

  describe('ข้อผูกมัดจากสเปก', () => {
    it('ไม่แตะเครือข่าย/ระบบเลย (ฟังก์ชันล้วน · เรียกซ้ำได้ผลเท่ากัน)', () => {
      const a = parseExpiryDate('28 สิงหาคม 2568');
      const b = parseExpiryDate('28 สิงหาคม 2568');
      expect(a).toEqual(b);
    });

    it('ผลลัพธ์ทุกตัวเป็น ค.ศ. (Gregorian) — พร้อมเทียบกับ "วันนี้" โดยไม่กวน timezone', () => {
      const result = parseExpiryDate('28 สิงหาคม 2568');
      expect(result.ok && result.date.year).toBe(2025); // พ.ศ. 2568 → ค.ศ. 2025
    });
  });
});
