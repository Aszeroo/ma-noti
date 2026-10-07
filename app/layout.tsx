import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'ma-noti — ระบบแจ้างเตือนงานต่ออายุ',
  description: 'อ่าน Google Sheet → คำนวณ → แจ้งเตือน 3 ฝ่าย (ปัจจุบันโหมด DRY_RUN)',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
