import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Thiên Minh Dental Workforce',
  description: 'Admin Web chấm công và công tác — Chi nhánh TP.HCM',
  icons: { icon: '/brand/thien-minh-mark.png' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
