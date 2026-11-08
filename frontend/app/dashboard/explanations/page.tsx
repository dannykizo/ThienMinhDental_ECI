'use client';

import { PageHeader } from '@/components/admin-ui';
import { ExplanationsWorkspace } from '@/components/explanations-workspace';

export default function ExplanationsPage() {
  return <div className="module-page review-page"><PageHeader eyebrow="ĐƠN TỪ / GIẢI TRÌNH" title="Xử lý giải trình" description="Theo dõi vấn đề, minh chứng và người xử lý. Cấu hình tuyến được tách khỏi hàng đợi." /><ExplanationsWorkspace /></div>;
}
