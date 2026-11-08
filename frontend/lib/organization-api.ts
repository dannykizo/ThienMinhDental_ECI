export interface OrganizationTeam {
  id: string;
  departmentId: string;
  departmentName: string;
  departmentActive: boolean;
  code: string;
  name: string;
  isActive: boolean;
  everUsed?: boolean;
}

export type CatalogKind = 'branches' | 'departments' | 'positions' | 'teams';
export interface CatalogItem { id: string; code: string; name: string; isActive: boolean; everUsed: boolean }
export interface CatalogImpact {
  item: { id: string; code: string; name: string; isActive: boolean };
  everUsed: boolean;
  canDelete: boolean;
  confirmationToken: string;
  references: { label: string; count: number }[];
  impacts: { employees: number; teams: number; grants: number; pendingExplanations: number; pendingLeave: number };
}

export function describeCatalogImpact(value: CatalogImpact): string {
  const { impacts } = value;
  return `Phạm vi liên quan (không có nghĩa tất cả sẽ bị khóa): ${impacts.employees} nhân sự/phân công, ${impacts.teams} team đang hoạt động, ${impacts.grants} quyền chưa kết thúc, ${impacts.pendingExplanations} giải trình và ${impacts.pendingLeave} đơn phép đang chờ. ` +
    (value.references.length ? `Liên kết: ${value.references.map(ref => `${ref.label}: ${ref.count}`).join('; ')}. ` : 'Chưa có liên kết hiện tại. ') +
    (value.everUsed ? 'Đã từng được sử dụng, không thể xóa vĩnh viễn. ' : '') +
    'Không tự chuyển nhân sự, thu hồi grant hay đổi tuyến duyệt; giữ nguyên lịch sử. Ngừng phòng/team làm quyền trong phạm vi đó tạm mất hiệu lực; khôi phục có thể kích hoạt lại quyền chưa hết hạn/chưa thu hồi. Ngừng chi nhánh làm thành viên tại chi nhánh đó mất điều kiện phạm vi và không dùng geofence chi nhánh cho sự kiện văn phòng mới; không khóa tài khoản nhân viên.';
}

export interface OrganizationMember {
  id: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  branches: string[];
  createdAt: string;
  endedAt: string | null;
  endReason: string | null;
  status: 'ACTIVE' | 'ENDED' | 'INACTIVE';
}

export interface ManagementGrant {
  id: string;
  employeeName: string;
  employeeCode: string;
  roleCode: 'DEPARTMENT_HEAD' | 'TEAM_LEADER';
  departmentName: string;
  teamName: string | null;
  appointmentType: 'TEMPORARY' | 'OFFICIAL';
  validFrom: string;
  validUntil: string | null;
  reason: string;
  createdByName: string;
  revokedAt: string | null;
  revokedByName: string | null;
  revocationReason: string | null;
  status: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'REVOKED' | 'INACTIVE';
}

export interface OrganizationAudit {
  id: string;
  resourceType: string;
  resourceId: string;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  actorName: string;
  createdAt: string;
}
