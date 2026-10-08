// lib/notifiers/types.ts — สัญญาผู้ส่ง: interface เดียว 3 implementation (ticket #10)
// ผู้ส่ง = ขาออกของท่อ (transport): ส่งข้อความหนึ่งไปยัง contact หนึ่ง
// ไม่รู้เรื่อง digest / lead time / DRY_RUN (การตัดสินใจอยู่นอก handler)
// เพิ่มช่องทางใหม่ = เพิ่ม implementation เดียว แล้วลงทะเบียนใน lib/notifiers/index.ts

import type { Delivery, RenderedMessage } from '@/lib/domain/types';

/** fetch ปลอมได้ในเทส — เหมือน pattern ของ lib/sheets/reader (ไม่มีเครือข่ายในเทส) */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** ค่า env ที่อ่านได้ — default คือ process.env, เทสส่ง map ปลอมเข้ามาได้ */
export type EnvSource = Record<string, string | undefined>;

export interface NotifierOptions {
  env?: EnvSource;
  fetchImpl?: FetchLike;
}

/**
 * ผู้ส่ง 1 ช่องทาง — `send` โยน Error เมื่อไม่สำเร็จ (caller จับต่อรายการ
 * เพื่อให้รอบรันไม่พังเมื่อช่องทางหนึ่งล้มเหลว)
 *
 * `message` คือข้อความที่ renderer เตรียมไว้ตรงตามช่องทางแล้ว
 * (email = HTML ตาราง, discord = JSON string ของ embed, telegram = markdown)
 */
export interface Notifier {
  send(delivery: Delivery, message: RenderedMessage): Promise<void>;
}
