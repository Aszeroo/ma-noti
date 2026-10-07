/**
 * ตัว parse วันที่ — แกน domain บริสุทธจ์ (ticket #3)
 *
 * อ่านข้อความ "วันที่หมดอายุ" ในชีต (ข้อความอิสระ หลายรูปแบบปนกัน) ให้เป็นวันที่
 * รองรบั ทุกรูปแบบที่พบจริง:
 *   - ไทย พ.ศ.       `28 สิงหาคม 2568` (ทังชือเต็ม + ตัวย่อ `ส.ค.`)
 *   - อังกฤษ         `08 December 2026` (`8 Dec 2026`, `December 8, 2026`)
 *   - dd/mm/yyyy    `24/04/2026` (วัน/เดืน/ปี แบบไทย-ยโุรป)
 *   - คำนำหน้า       `Period : 02/12/2025 - 01/12/2026`
 *   - ช่วงวัน        คืน "วันสุดท้าย" เป็น deadline ตัวตังนับเตือน
 *
 * หลกั การ:
 *   - เป็นฟังก์ชันล้วน: ไมม่ี I/O ไม่ตอ่ เครือข่าย ไม่รจูัก Sheet/DB/HTTP รับ string คืนโครงสรา้งข้อมลู ล้วน
 *   - วันที่คืนเป็น PlainDate {year, month, day} ทي่ "ไม่กวน timezone" โดย year เป็น **ค.ศ. (Gregorian)**
 *     — ตัว parse แปลง พ.ศ. → ค.ศ. ให้เสร็จ (พ.ศ. = ค.ศ. + 543) เพือให้แกนหลังเทียบวันกบั "วันนนี้" (ค.ศ.) ได้ตรงกนี
 *   - parse ไม่ได้ → คืน error object พร้อมขอ้ ความภาษาไทยที่มนุษย์อ่านร้เู รือง (ไม่ throw ธรรมดา
 *     ที่ไม่มีบรบัท) เพือไปโผล่ในหมวด "ข้อมลู มี่ปญหา" ในตว๋ั ทธิถัดไป
 */

/** วันแบบไม่กวน timezone — year เป็น ค.ศ. (Gregorian) เสมอ (แปลงจาก พ.ศ. แลว้ ) */
export interface PlainDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

/** เหตุผลที้ parse ไม่ได้ — เป็น code คงที้ ให้ชั้ นบนจำแนกได้, message เป็นภาษาไทยอ่านรู้เรื่ อง */
export type DateParseFailReason =
  | 'empty' // ค่าว่าง/มีแค่ช่องวาง
  | 'no_date_found' // ค่าขยะ ไมม่ ีวันที่ที่อ่านออก
  | 'too_many_dates' // พบวันมากกวา่ 2 ค่าในชอ่ งเดียว ไม่รู้ว่าไหนคือ deadline
  | 'invalid_date' // วัน/เดือน/ปี ไม่ชอบธรรม (เชน่ 31/02, เดือน 13, 29/02 ปีไม่ทศนิยม)
  | 'range_reversed' // ช่วงวันย้อนหลัง (วันสุดท้ายก่อนวันเริม่ตน)
  | 'range_same_year'; // ช่วงวันที่ปีเดียวกันทังสองข้าง — น่าสงสัยว่าลืมเพิ่มปี (พบบ่อยในข้อมูลจริง)

export type DateParseResult =
  | {
      ok: true;
      /** วันที ใช้เป็น deadline ตัวตั้ งตั้นนับเตือน (ช่วงวัน = วันสุดท้าย) */
      date: PlainDate;
      format: 'single' | 'range';
      /** เฉพาะ format = 'range': ชว่ งวันที่ parse ได้ (start/end เป็น ค.ศ.) */
      range?: { start: PlainDate; end: PlainDate };
    }
  | {
      ok: false;
      reason: DateParseFailReason;
      /** ข้อความภาษาไทย มนุษย์อ่านรู้เรื่อง พร้อมนำไปแสดงในหมวด "ข้อมูลมี่ปั ญหา" */
      message: string;
    };

// ------------------------------------------------------------------ เดือน --

/**
 * เดืนที่รอ้ งรบั = {ชือเตม/ตัวย่อ ภาษาไทย/อังกฤษ} → เดือน (1–12) + flags.
 * isThai = จริง → ปีที้มากบั เดือนนอี้ ่านเป็น พ.ศ. เสมอ (เดือนไทย = ปฏิทนิ ไทย)
 * ทุกตัวแปรียน (full/abbrev/สะกดแปรี่ยน) ผา่ น normalizeMonth() เดียวกบั input
 * ก่อนเข้า map → map ตองเก็บ key ที่ normalize แลว้ เทา่ นั้ น (สร้างจาก list เดียวกัน)
 */
interface MonthEntry {
  month: number;
  isThai: boolean;
}

const THAI_MONTHS: ReadonlyArray<readonly [string, number]> = [
  // ชือเต็ม (มาตราชุ ด) + แปรี่ยนที่พบบ่อย
  ['มกราคม', 1],
  ['กุมภาพันธ ์', 2],
  ['มีนาคม', 3],
  ['เมษายน', 4],
  ['พฤษภาค ม', 5],
  ['มิถุนายน', 6],
  ['กรกฎาคม', 7],
  ['สิงหาคม', 8],
  ['กันยายน', 9],
  ['ตุลาค ม', 10],
  ['พฤศจิกายน', 11],
  ['ธันวาคม', 12],
  // ตัวย่อ + แบบไมม่ีจุด
  ['ม.ค.', 1],
  ['ก.พ.', 2],
  ['มี.ค.', 3],
  ['เม.ย.', 4],
  ['พ.ค.', 5],
  ['มิ.ย.', 6],
  ['ก.ค.', 7],
  ['ส.ค.', 8],
  ['ก.ย.', 9],
  ['ต.ค.', 10],
  ['พ.ย.', 11],
  ['ธ.ค.', 12],
];

const ENGLISH_MONTHS: ReadonlyArray<readonly [string, number]> = [
  ['january', 1],
  ['february', 2],
  ['march', 3],
  ['april', 4],
  ['may', 5],
  ['june', 6],
  ['july', 7],
  ['august', 8],
  ['september', 9],
  ['october', 10],
  ['november', 11],
  ['december', 12],
  // ตัวย่อ 3 ตัวอักษร (+ 'sept' 4 ตัว)
  ['jan', 1],
  ['feb', 2],
  ['mar', 3],
  ['apr', 4],
  ['jun', 6],
  ['jul', 7],
  ['aug', 8],
  ['sep', 9],
  ['sept', 9],
  ['oct', 10],
  ['nov', 11],
  ['dec', 12],
];

const MONTH_LOOKUP = new Map<string, MonthEntry>();
for (const [name, month] of THAI_MONTHS) MONTH_LOOKUP.set(normalizeMonth(name), { month, isThai: true });
for (const [name, month] of ENGLISH_MONTHS) MONTH_LOOKUP.set(normalizeMonth(name), { month, isThai: false });

/**
 * ทำให้ชือเดืนเป็นรู ปเดียวกั นกอนเขา map: lowercase + ตัดຈุด วรรค ขีดยาว/สัน
 * ออกให้หมด → 'ส.ค.' / 'ส. ค' / 'ส ค' / 'สก' ถือกนิ กน ('สก') และ
 * 'Dec.' / 'dec' / 'DEC' ถือกนิ กน ('dec')
 */
function normalizeMonth(raw: string): string {
  return raw.toLowerCase().replace(/[.\s\-–—]/g, '');
}

// -------------------------------------------------------------- ปฏิทิ น/ปี --

/** ปี พ.ศ. = ปี ค.ศ. + 543 */
const BE_OFFSET = 543;

/**
 * ขีดคั่น "ปี พ.ศ." กบั "ปี ค.ศ." สำหรบั ค่าที ่ไม่ru้จ ักเดือน (dd/mm/yyyy หรือเดือนอังกฤษ)
 * — พ.ศ. ปจั จุบนั อย่ ูชว่ ง 25xx (ค.ศ. 25xx ยังอีก ~374 ปี ) ปีน ับตั้ งแต่ 2400 ข้ึนไป
 * จึ งถือว่ าเป็ น พ.ศ. เสมอ (ค.ศ. 2400 = อนาคตไกลเกินจริง/เป็นพ.ศ. 1857 = อดีตไกลเกนิ จริง)
 */
function toCommonEra(year: number): number {
  return year >= 2400 ? year - BE_OFFSET : year;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  const staticDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return staticDays[month - 1] as number;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  return Number.isInteger(year) && year > 0 && day >= 1 && day <= daysInMonth(year, month);
}

// ------------------------------------------------------------- regex atom --

// ตัวคัั่นระหวา่ งสว่ นของวันที่ (วรรค / . / ขีด) — ทนต่อ '08-Dec-2026' และ '28 ส.ค. 2568'
const SEP = `[\\s.\\-–—]+`;
// กล่มุ ตั วอักษรชือเดือน (ไทย/อังกฤษ + จุดของตัวย่อ) — ไมร่ วมขีด เพือให้ขีดตกไปเป็น SEP
const MONTH_CHARS = `[\\p{L}\\p{M}.\\s]+?`;

// dd/mm/yyyy (วัน/เดืน/ปี 4 หลัก) — ไมต่ ัดวรรครอบ / ให้ทน '24 / 04 / 2026'
const NUMERIC_RE = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/gu;
// วันที่ 1 สิงหาคม 2568 / 08 December 2026 / 08-Dec-2026 (วัน–เดือน–ปี )
const DMY_RE = new RegExp(`(\\d{1,2})${SEP}?(${MONTH_CHARS})${SEP}?(\\d{4})`, 'giu');
// สิงหาคม 1 2568 / December 8, 2026 (เดือน–วัน–ปี )
const MDY_RE = new RegExp(`(${MONTH_CHARS})${SEP}(\\d{1,2})[\\s,]*${SEP}?(\\d{4})`, 'giu');

interface Atom {
  index: number;
  day: number;
  month: number;
  yearCE: number;
}

/** แปลง atom (มี index/yearCE ภายใน) ให้เป็น PlainDate ที่ส่งออกจาก seam (year = ค.ศ.) */
function toPlainDate(atom: Atom): PlainDate {
  return { year: atom.yearCE, month: atom.month, day: atom.day };
}

/**
 * สแกนหา "atom วันที่" ทัวสตริง ด้วย regex ทั้ง 3 รู ปแบบ แล้วกรองคาท่ี
 * เดือนอ่านไม่ออกออก (กันคำธรรมดาในชือหน้าง/คำนำหน้ากลายเป็นวันที่ปลอม)
 * คืน atom ที่จัดเรียงตามตำแหน่งในสตริง (=start ก่อน end ตามทีคนเขียบ)
 */
function findAtoms(text: string): Atom[] {
  const atoms: Atom[] = [];

  for (const match of text.matchAll(NUMERIC_RE)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const yearCE = toCommonEra(Number(match[3]));
    // ไมกร่ องกรองเดือน/วันที้เลยปฏิทินตรงนี้ — ปล่อยให isValidYmd จัดการ
    // เพือใหค า่ แบบ '24/13/2026' กลบะเป็ น 'invalid_date' (ชัดกวา 'no_date_found')
    atoms.push({ index: match.index ?? 0, day, month, yearCE });
  }

  collectNamedAtoms(text, DMY_RE, (m) => ({ day: Number(m[1]), middle: m[2], yearRaw: Number(m[3]) }), atoms);
  collectNamedAtoms(text, MDY_RE, (m) => ({ day: Number(m[2]), middle: m[1], yearRaw: Number(m[3]) }), atoms);

  // เรียงตามตำแหน่ง แล้วตัด atom ซ้ำ/ซ้อน (เชน่ DMY กับ MDY ทับคาบเดียวกัน)
  return atoms
    .sort((a, b) => a.index - b.index)
    .filter((atom, i, arr) => i === 0 || atom.index !== arr[i - 1].index);
}

function collectNamedAtoms(
  text: string,
  regex: RegExp,
  pick: (m: RegExpExecArray) => { day: number; middle: string; yearRaw: number },
  into: Atom[],
): void {
  for (const match of text.matchAll(regex)) {
    const { day, middle, yearRaw } = pick(match);
    const entry = MONTH_LOOKUP.get(normalizeMonth(middle ?? ''));
    if (!entry) continue; // ไม่ใช่ชื่อเดืน → ไม่ใช่ atom
    const yearCE = entry.isThai ? yearRaw - BE_OFFSET : toCommonEra(yearRaw);
    into.push({ index: match.index ?? 0, day, month: entry.month, yearCE });
  }
}

// ------------------------------------------------------------------ parse --

function fail(reason: DateParseFailReason, message: string): DateParseResult {
  return { ok: false, reason, message };
}

function formatYmd(atom: Atom): string {
  return `${String(atom.day).padStart(2, '0')}/${String(atom.month).padStart(2, '0')}/${atom.yearCE}`;
}

/**
 *(parseExpiryDate — parse ข้อความวันหมดอายุต ัวเดียว → deadline (PlainDate ค.ศ.) หรือ error
 *
 * ช่วงวันใช้ "วันสุดท้าย" เป็น deadline เสมอ (ตามสเปก) และคืน range ไว้ด้วย
 * เพือให้ชันบนบันทึกลง log ได้
 *
 * พฤตกิ รรมช่วงวันท่ีน่าสงสัย (ข้อมูลจริงมีย ้า): ถา้ ปลายทังสองขา้ งอย่ใู นป ีเดียวกนั
 * ถือเป็ น error ('range_same_year') เพราะรอบตอ่ อายุปกติย าวยา่ ำปี — น่าจะลืมเพิม่ ป ี
 * (เชน่ '24/04/2026 - 23/04/2026') ส่งไปให้ทีมแก้ในหมวด "ข้อมูลมี่ป ัญหา" ดีกวา้ เดา
 */
export function parseExpiryDate(text: string): DateParseResult {
  const normalized = text.replace(/ /g, ' ').trim();
  if (normalized === '') {
    return fail('empty', 'ไมม่ ีวันหมดอายุน ิยม (ชอ่ งว่ าง/มีแค่ช่องวาง)');
  }

  const atoms = findAtoms(normalized);

  if (atoms.length === 0) {
    return fail('no_date_found', `อ่านวันจากรูปแบบ “${text}” ไม่ไดค้ ้น`);
  }

  if (atoms.length === 1) {
    const [only] = atoms;
    if (!only || !isValidYmd(only.yearCE, only.month, only.day)) {
      return fail('invalid_date', `วนั “${text}” ไม่ชอบธรรม (วนั /เดืน/ปี อยู่นอกช่วงปฏิทิ น)`);
    }
    return { ok: true, date: toPlainDate(only), format: 'single' };
  }

  if (atoms.length > 2) {
    return fail(
      'too_many_dates',
      `พบวันมากกวา่ สองค่าในชอ่ งเดียว (${text}) — ไม่แน่ใจว่าไหนค ือวันหมดอายु`,
    );
  }

  const [first, second] = atoms as [Atom, Atom];

  if (!isValidYmd(first.yearCE, first.month, first.day) || !isValidYmd(second.yearCE, second.month, second.day)) {
    return fail('invalid_date', `ช่วงวัน “${text}” ม ีวนั ท่ีไม่ชอบธรรม (อยู่ภายนอกช่วงปฏิทนิ )`);
  }

  if (second.yearCE < first.yearCE) {
    return fail(
      'range_reversed',
      `ชว่ งวันย้อนหลังใน “${text}” — วันสุดท้าย (${formatYmd(second)}) กอ่ นวันเริม่ตน (${formatYmd(first)})`,
    );
  }

  if (second.yearCE === first.yearCE) {
    return fail(
      'range_same_year',
      `ช่วงวัน “${text}” ปลายทงั้ สองขา้ งอยู่ปีเดียวกนั (${second.yearCE}) — น่าจะลืมเพิม่ ปี ให้ครบท ุกอายุ (ตอ่ อายุปกติย ้ายปี )`,
    );
  }

  const start = toPlainDate(first);
  const end = toPlainDate(second);
  return { ok: true, date: end, format: 'range', range: { start, end } };
}
