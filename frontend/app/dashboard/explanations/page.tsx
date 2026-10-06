'use client';

import { PageHeader } from '@/components/admin-ui';
import { ExplanationsWorkspace } from '@/components/explanations-workspace';

export default function ExplanationsPage() {
  return <div className="module-page"><PageHeader eyebrow="GIẢI TRÌNH THEO TUYẾN" title="Giải trình hai bước" description="Xác nhận và phê duyệt độc lập theo team/phòng ban. Lưu vết người xử lý và mọi thay đổi tuyến." /><ExplanationsWorkspace /></div>;
}
