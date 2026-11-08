'use client';
import { PageHeader } from '@/components/admin-ui';
import { OvertimeWorkspace } from '@/components/overtime-workspace';
export default function OvertimePage() {
  return <div className="module-page review-page"><PageHeader eyebrow="ĐƠN TỪ / TĂNG CA" title="Phiếu tăng ca (OT)" description="Leader xác nhận → Trưởng phòng duyệt. Tuyến riêng; chỉ số phút đã duyệt mới được cộng vào báo cáo." /><OvertimeWorkspace /></div>;
}
