'use client';

import { PageHeader } from '@/components/admin-ui';
import { ExplanationsWorkspace } from '@/components/explanations-workspace';

export default function ExplanationsPage() {
  return <div className="module-page"><PageHeader eyebrow="VẬN HÀNH / GIẢI TRÌNH" title="Xử lý giải trình" description="Hàng đợi rõ ràng, người xử lý minh bạch và cấu hình tuyến tách riêng." /><ExplanationsWorkspace /></div>;
}
