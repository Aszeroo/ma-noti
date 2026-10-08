import type { CSSProperties, ReactNode } from 'react';

import { signOut } from '@/lib/auth/actions';

/**
 * ชุดโครงหน้าเว็บ + ตาราง มาตรฐาน (หน้า history และ recipients ใชร่วมนกนั)
 * แยกมาจากสองหนาเพือใหโครงตรงกนทสิด (fallow clone group) และหน้างเพิ่ มใหมต่อด แลดูได ้ชบดั เจน
 */

export const cellStyle: CSSProperties = { padding: '0.5rem 0.75rem', borderBottom: '1px solid #ddd' };

/** สไตลฟอรม ปุม การด มาตรฐาน (หน recipients/settings/assignments ใชรวมกน)
 * แยกมาไวทเดียวกบ components/ui.tsx เพือใหโครงตรงกนทสิด (fallow clone group)
 */
export const fieldStyle: CSSProperties = {
  padding: '0.375rem 0.625rem',
  fontSize: '0.95rem',
  border: '1px solid #999',
  borderRadius: '0.375rem',
};
export const buttonStyle: CSSProperties = {
  padding: '0.375rem 0.875rem',
  fontSize: '0.95rem',
  backgroundColor: '#1d4ed8',
  color: '#fff',
  border: 'none',
  borderRadius: '0.375rem',
  cursor: 'pointer',
};
export const ghostButtonStyle: CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#fff',
  color: '#1a1a1a',
  border: '1px solid #999',
};
export const dangerButtonStyle: CSSProperties = {
  ...ghostButtonStyle,
  color: '#b91c1c',
  border: '1px solid #b91c1c',
};
export const cardStyle: CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: '0.5rem',
  padding: '1rem',
  marginBottom: '1.25rem',
};

/** searchParams ?error=<code> → ข้อความแบนเนอร์ (key ที่ไม่รู้จัก → ไม่แสดง) */
export function flashErrorText(
  errorText: Record<string, string>,
  params: Record<string, string | string[] | undefined>,
): string | undefined {
  const errorKey = Array.isArray(params.error) ? params.error[0] : params.error;
  // Object.hasOwn กันคีย์ตกค้างบน prototype chain (เช่น ?error=__proto__ → ได้ Object.prototype ไป render เป็น object ไมไ ด้)
  return errorKey && Object.hasOwn(errorText, errorKey) ? errorText[errorKey] : undefined;
}


/** รวมแบนเนอร์แดงของหน้า: flash จาก action มาก่อน error จาก query */
export function alertText(
  error: { message: string } | null | undefined,
  flash: string | undefined,
  unreadable: string,
): string | undefined {
  if (flash) return flash;
  if (error) return `${unreadable}: ${error.message}`;
  return undefined;
}

const shellStyle: CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  maxWidth: '56rem',
  margin: '2rem auto',
  padding: '0 1rem',
  color: '#1a1a1a',
};
const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '1rem',
  flexWrap: 'wrap',
};
const navStyle: CSSProperties = { display: 'flex', gap: '1rem', alignItems: 'baseline' };
const linkStyle: CSSProperties = { color: '#1d4ed8' };
const signOutStyle: CSSProperties = {
  padding: '0.375rem 1rem',
  fontSize: '0.95rem',
  backgroundColor: '#fff',
  border: '1px solid #999',
  borderRadius: '0.375rem',
  cursor: 'pointer',
};

/** กรอบหน้างเว็บ: h1 + nav (ลิงก์ลับ + ออกจากระบบ) + เนื้ อหา */
export function PageShell({
  title,
  backHref,
  backLabel,
  children,
}: {
  title: string;
  backHref: string;
  backLabel: string;
  children: ReactNode;
}) {
  return (
    <main style={shellStyle}>
      <header style={headerStyle}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        <nav style={navStyle}>
          <a href={backHref} style={linkStyle}>
            {backLabel}
          </a>
          <form action={signOut}>
            <button type="submit" style={signOutStyle}>
              ออกจากระบบ
            </button>
          </form>
        </nav>
      </header>
      {children}
    </main>
  );
}

/** ตารางขอมูลมาตรฐาน: thead ตามคอลัมที่สั่ง + tbody จาก children */
export function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
      <thead>
        <tr style={{ textAlign: 'left' }}>
          {headers.map((header) => (
            <th key={header} style={cellStyle}>
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
