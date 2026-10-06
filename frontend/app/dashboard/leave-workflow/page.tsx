'use client';
import { PageHeader } from '@/components/admin-ui';
import { LeaveWorkflowWorkspace } from '@/components/leave-workflow-workspace';
export default function LeaveWorkflowPage() {
  return <div className="module-page"><PageHeader eyebrow="VẬN HÀNH / NGHỈ PHÉP" title="Xử lý nghỉ phép" description="Theo dõi đơn, xử lý theo tuyến và quản lý cấu hình trong các khu vực riêng." /><LeaveWorkflowWorkspace /></div>;
}
