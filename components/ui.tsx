import type { CSSProperties, ReactNode } from 'react';

import { signOut } from '@/lib/auth/actions';

/**
 * ชุดโครงหน้าเว็บ + ตาราง มาตรฐาน (หน้า history และ recipients ใชร่วมนกนั)
 * แยกมาจากสองหนาเพือใหโครงตรงกนทสิด (fallow clone group) และหน้างเพิ่ มใหมต่อด แลดูได ้ชบดั เจน
 */

export const cellStyle: CSSProperties = { padding: '0.5rem 0.75rem', borderBottom: '1px solid #ddd' };

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
