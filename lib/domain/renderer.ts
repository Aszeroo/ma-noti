// lib/domain/renderer.ts — 3 renderers: HTML / embed / markdown (ticket #4)
// renderer = ฟังก์ช ั นบ ิร ิส ุทธ ิ์: คื นโครงสร ้ างความ (ไม ่ย ิ งเคร ื อข ่ าย
import type { Digest, DigestItem, Party, RenderedMessage } from '@/lib/domain/types';

function digestHeader(digest: Digest): string {
  const due = digest.items.length;
  const overdue = digest.overdue.length;
  const issues = digest.issues.length;
  const parts: string[] = [];
  if (overdue) parts.push('เลยกำหนด ' + overdue);
  if (due) parts.push('ใกลหมดอายุ ' + due);
  if (issues) parts.push('ข้อมูลมีปัญหา ' + issues);
  return 'งานใกลหมดอายุ (' + digest.tab + ')' + (parts.length ? ' — ' + parts.join(' / ') : '');
}

// role emphasis = quoting เน้น partner + owner
function emphasize(digest: Digest): boolean {
  return digest.party === 'quoting';
}

function days(item: DigestItem): string {
  return String(item.daysRemaining ?? item.daysLate ?? '');
}

// ---- email HTML ----
export function renderEmail(digest: Digest): RenderedMessage {
  const emphasis = emphasize(digest);
  const cols = emphasis
    ? ['partner', 'owner', 'jobCode', 'days']
    : ['jobCode', 'jobName', 'unit', 'renewalType', 'expiryText', 'days', 'partner', 'owner'];
  const rows = [...digest.overdue, ...digest.items];
  const cell = (v: unknown): string => '<td>' + String(v) + '</td>';
  const rowOf = (r: DigestItem): string =>
    emphasis
      ? [r.partner, r.owner, r.jobCode, days(r)].map(cell).join('')
      : [r.jobCode, r.jobName, r.unit, r.renewalType, r.expiryText, days(r), r.partner, r.owner].map(cell).join('');
  const head = emphasis ? 'งานใกลหมด/เลยกำหนด — เน้น partner + owner (' + digest.tab + ')' : digestHeader(digest);
  const table = '<table><thead><tr>' + cols.map(cell).join('') + '</tr></thead><tbody>' + rows.map(rowOf).join('') + '</tbody></table>';
  const issues = digest.issues.length ? '<br/>ข้อมูลมีปัญหา: ' + digest.issues.join(', ') : '';
  return head + '<br/>' + table + issues;
}

// ---- discord embed ----
export function renderDiscord(digest: Digest): RenderedMessage {
  const emphasis = emphasize(digest);
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];
  for (const item of [...digest.overdue, ...digest.items]) {
    fields.push({
      name: item.jobCode + ' — ' + days(item),
      value: item.unit + ' · ' + item.renewalType + ' · ' + item.expiryText,
      inline: !emphasis,
    });
  }
  if (emphasis) {
    fields.unshift({
      name: 'partner + owner (เน้น)',
      value: [...digest.overdue, ...digest.items].map(i => (i.partner || '-') + ' / ' + (i.owner || '-')).join(' | '),
      inline: true,
    });
  }
  const footer = digest.issues.length ? { text: 'ข้อมูลมีปัญหา: ' + digest.issues.join(', ') } : undefined;
  return JSON.stringify({ embeds: [{ title: digestHeader(digest), fields, footer }] });
}

// ---- telegram markdown ----
export function renderTelegram(digest: Digest): RenderedMessage {
  const emphasis = emphasize(digest);
  const lineOf = (r: DigestItem): string =>
    emphasis
      ? 'partner+owner: ' + (r.partner || '-') + ' / ' + (r.owner || '-') + ' — ' + r.jobCode + ' (' + days(r) + ')'
      : r.jobCode + ' (' + days(r) + ' w) — ' + r.renewalType + ' ' + r.expiryText;
  const lines = [...digest.overdue, ...digest.items].map(lineOf);
  const issues = digest.issues.length ? '\nข้อมูลมีปัญหา: ' + digest.issues.join(', ') : '';
  return digestHeader(digest) + '\n' + lines.join('\n') + issues;
}
