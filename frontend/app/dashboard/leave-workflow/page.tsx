'use client';
import { PageHeader } from '@/components/admin-ui';
import { LeaveWorkflowWorkspace } from '@/components/leave-workflow-workspace';
export default function LeaveWorkflowPage() {
  return <div className="module-page review-page"><PageHeader eyebrow="ĐƠN TỪ / NGHỈ PHÉP" title="Xử lý nghỉ phép" description="Ưu tiên đơn đến lượt bạn. Mở chi tiết để xem tuyến, lịch sử và thao tác được cấp." /><LeaveWorkflowWorkspace /></div>;
}
