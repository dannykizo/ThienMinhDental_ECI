import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import './workflow.css';

export const metadata: Metadata = {
  title: 'Thiên Minh Dental Workforce',
  description: 'Admin Web chấm công, công tác và vận hành nhân sự đa chi nhánh',
  icons: { icon: '/brand/thien-minh-mark.png' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
