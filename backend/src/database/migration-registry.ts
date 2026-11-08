import { InitialFoundation1726358400000 } from './migrations/1726358400000-initial-foundation.js';
import { WebMvp1726444800000 } from './migrations/1726444800000-web-mvp.js';
import { CustomerOrganizationRbac1790035200000 } from './migrations/1790035200000-customer-organization-rbac.js';
import { AuthSessions1790121600000 } from './migrations/1790121600000-auth-sessions.js';
import { ScheduleLocationAlignment1790208000000 } from './migrations/1790208000000-schedule-location-alignment.js';
import { AttendanceReconciliation1790294400000 } from './migrations/1790294400000-attendance-reconciliation.js';
import { BusinessTripOperations1790380800000 } from './migrations/1790380800000-business-trip-operations.js';
import { LeaveOperations1790467200000 } from './migrations/1790467200000-leave-operations.js';
import { AnnouncementAlignment1790553600000 } from './migrations/1790553600000-announcement-alignment.js';
import { RefreshTokenSessions1790640000000 } from './migrations/1790640000000-refresh-token-sessions.js';
import { PushNotificationDevices1790726400000 } from './migrations/1790726400000-push-notification-devices.js';
import { CanonicalRoles1790812800000 } from './migrations/1790812800000-canonical-roles.js';
import { EmployeeLifecycle1790899200000 } from './migrations/1790899200000-employee-lifecycle.js';
import { GeofenceRadiusAlignment1790985600000 } from './migrations/1790985600000-geofence-radius-alignment.js';
import { BusinessTripCustomerManagement1791072000000 } from './migrations/1791072000000-business-trip-customer-management.js';
import { AnnouncementCompanyPushDelivery1791158400000 } from './migrations/1791158400000-announcement-company-push-delivery.js';
import { EmployeeDisciplinaryActions1791244800000 } from './migrations/1791244800000-employee-disciplinary-actions.js';
import { LeavePoliciesBalances1791331200000 } from './migrations/1791331200000-leave-policies-balances.js';
import { EmployeeExplanations1791417600000 } from './migrations/1791417600000-employee-explanations.js';
import { OrganizationManagementAccess1791504000000 } from './migrations/1791504000000-organization-management-access.js';
import { ManagerChannelSessions1791590400000 } from './migrations/1791590400000-manager-channel-sessions.js';
import { ExplanationTwoStepWorkflow1791676800000 } from './migrations/1791676800000-explanation-two-step-workflow.js';
import { LeaveTwoStepWorkflow1791763200000 } from './migrations/1791763200000-leave-two-step-workflow.js';
import { AdminFallbackReview1791849600000 } from './migrations/1791849600000-admin-fallback-review.js';
import { AdminSecurity1791936000000 } from './migrations/1791936000000-admin-security.js';
import { RetireAdminPin1792108800000 } from './migrations/1792108800000-retire-admin-pin.js';
import { OrganizationCatalogLifecycle1792195200000 } from './migrations/1792195200000-organization-catalog-lifecycle.js';
import { EmployeeFileCleanup1792281600000 } from './migrations/1792281600000-employee-file-cleanup.js';
import { DailyAttendanceCapture1792368000000 } from './migrations/1792368000000-daily-attendance-capture.js';
import { OvertimeWorkflow1792454400000 } from './migrations/1792454400000-overtime-workflow.js';
import { AttendanceDeviceProof1792540800000 } from './migrations/1792540800000-attendance-device-proof.js';
import { BusinessTripEvidenceOwnership1792713600000 } from './migrations/1792713600000-business-trip-evidence-ownership.js';
import { DisciplinaryActionGroups1792800000000 } from './migrations/1792800000000-disciplinary-action-groups.js';
import { AttendanceReportSnapshots1792886400000 } from './migrations/1792886400000-attendance-report-snapshots.js';
import { SupportingReportSnapshots1792972800000 } from './migrations/1792972800000-supporting-report-snapshots.js';
import { EmployeePortraits1793060000000 } from './migrations/1793060000000-employee-portraits.js';

// One registry for the migration CLI and read-only runtime status.
export const databaseMigrations = [
    InitialFoundation1726358400000,
    WebMvp1726444800000,
    CustomerOrganizationRbac1790035200000,
    AuthSessions1790121600000,
    ScheduleLocationAlignment1790208000000,
    AttendanceReconciliation1790294400000,
    BusinessTripOperations1790380800000,
    LeaveOperations1790467200000,
    AnnouncementAlignment1790553600000,
    RefreshTokenSessions1790640000000,
    PushNotificationDevices1790726400000,
    CanonicalRoles1790812800000,
    EmployeeLifecycle1790899200000,
    GeofenceRadiusAlignment1790985600000,
    BusinessTripCustomerManagement1791072000000,
    AnnouncementCompanyPushDelivery1791158400000,
    EmployeeDisciplinaryActions1791244800000,
    LeavePoliciesBalances1791331200000,
    EmployeeExplanations1791417600000,
    OrganizationManagementAccess1791504000000,
    ManagerChannelSessions1791590400000,
    ExplanationTwoStepWorkflow1791676800000,
    LeaveTwoStepWorkflow1791763200000,
    AdminFallbackReview1791849600000,
    AdminSecurity1791936000000,
    RetireAdminPin1792108800000,
    OrganizationCatalogLifecycle1792195200000,
    EmployeeFileCleanup1792281600000,
    DailyAttendanceCapture1792368000000,
    OvertimeWorkflow1792454400000,
    AttendanceDeviceProof1792540800000,
    BusinessTripEvidenceOwnership1792713600000,
    DisciplinaryActionGroups1792800000000,
    AttendanceReportSnapshots1792886400000,
    SupportingReportSnapshots1792972800000,
    EmployeePortraits1793060000000,
];

