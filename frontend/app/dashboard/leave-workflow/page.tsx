'use client';
import { PageHeader } from '@/components/admin-ui';
import { LeaveWorkflowWorkspace } from '@/components/leave-workflow-workspace';
export default function LeaveWorkflowPage() {
  return <><PageHeader eyebrow="PHÂN QUYỀN / NGHỈ PHÉP" title="Xử lý nghỉ phép" description="Leader xác nhận → Trưởng phòng quyết định. Admin cấu hình tuyến độc lập và theo dõi lịch sử." /><LeaveWorkflowWorkspace /></>;
}
