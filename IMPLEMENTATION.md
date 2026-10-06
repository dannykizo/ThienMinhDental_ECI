# Implementation Guide

## Architecture

Áp dụng **modular monolith**: một Backend API, một PostgreSQL database, một Admin Web và một Flutter App. Module tách theo nghiệp vụ nhưng được triển khai cùng backend để giảm độ phức tạp vận hành.

| Layer | Technology | Responsibility |
|---|---|---|
| Admin Web | Next.js + React + TypeScript | Quản trị, dashboard, duyệt, báo cáo |
| Backend API | NestJS + TypeScript | Business rules, auth/RBAC, API, audit |
| Database | PostgreSQL | Dữ liệu nghiệp vụ và lịch sử |
| Mobile App | Flutter | Chấm công, công tác, đơn nghỉ, thông báo |
| Push | Firebase Cloud Messaging | Báo có thông báo/công tác/trạng thái duyệt |
| File storage | S3-compatible storage (khi Phase 2 cần) | Ảnh hiện trường và file đính kèm |

### W1 persistence and authentication decision

- Dùng TypeORM làm persistence adapter chính thức cho NestJS và PostgreSQL; entity ORM chỉ nằm trong `backend/src/database`, Domain không phụ thuộc TypeORM.
- Schema được quản lý bằng migration, `synchronize` luôn tắt. Migration đầu tiên tạo `users`, `employees`, `departments`, `positions`, `roles` và `user_roles`.
- JWT access token được lưu trong cookie `HttpOnly`, `SameSite=Lax`; API vẫn nhận Bearer token cho client ngoài Admin Web. Quyền Admin Web hiện chấp nhận `ADMIN` và `MANAGER`.
- Mobile Android lưu Bearer token trong secure storage; login response trả token đồng thời vẫn giữ cookie HttpOnly cho Admin Web.
- Seed demo chỉ được phép chạy khi `NODE_ENV=development`; không dùng dữ liệu nhân viên hoặc credential thật.

### Web-first MVP decisions (W2–W9)

- Schema nghiệp vụ W2–W9 nằm trong migration `1726444800000-web-mvp`; Domain tiếp tục không import TypeORM.
- Attendance chỉ lưu vị trí tại sự kiện check-in/out và dùng server time. Geofence, accuracy, mock-location signal, đi muộn và về sớm được Backend đánh giá.
- Điều chỉnh công là record bổ sung bất biến. Backend tự lấy giá trị cũ, bắt buộc lý do và báo cáo dùng giá trị mới nhất có hiệu lực.
- Báo cáo tháng tổng hợp lịch + attendance + công tác + nghỉ đã duyệt + điều chỉnh; Excel final bị chặn khi còn ngày `INCOMPLETE`.
- KPI Lite chỉ là số ngày theo trạng thái vận hành; không có công thức điểm, lương, thưởng hoặc phạt.
- Thông báo resolve audience thành từng recipient và có API read receipt. Mobile/Backend đã tích hợp adapter FCM; gửi push thật phụ thuộc Firebase project và credential của môi trường triển khai.
- Mobile attendance vertical slice dùng `geolocator` chỉ tại sự kiện check-in/check-out; API `GET /attendance/me/today` là nguồn trạng thái trong ngày. Không có background location tracking.
- Leave policy và số dư do Admin cấu hình; Backend là nguồn duy nhất kiểm tra cutoff, thời lượng và số dư.

### Customer alignment C1 — organization and RBAC

- Migration `1790035200000-customer-organization-rbac` bổ sung `branches`, `employee_organization_assignments` và `user_branch_scopes`.
- Giữ `employees.department_id/position_id` làm projection tương thích cho phân công chính; lịch sử và quan hệ nhiều phòng ban nằm trong bảng assignment mới.
- Role nghiệp vụ gồm `ADMIN`, `CHIEF_ACCOUNTANT`, `AREA_MANAGER`, `EMPLOYEE`; `MANAGER` được giữ tạm để tương thích dữ liệu cũ.
- Admin có quyền ghi cấu hình nhân sự. Kế toán trưởng đọc dữ liệu nhân viên/chấm công và báo cáo. Quản lý khu vực chỉ được cấp endpoint đã thực thi scope chi nhánh ở Backend.
- Khóa nhân viên đồng thời thu hồi quyền đăng nhập; không hard-delete hồ sơ hay mã nhân viên.

### PQ1 — organization and time-bound management access

- Migration `1791504000000-organization-management-access` adds `organization_teams`, `organization_team_memberships` and `organization_management_grants`. Every team has one immutable parent department; members may span branches only within current department assignments. Codes are unique within the department. Membership rows are ended, not deleted.
- `organization-access` is an isolated NestJS module using the existing PostgreSQL/TypeORM DataSource; pure Domain grant policy does not import ORM. Existing employee organization assignments remain authoritative, including secondary departments. Assignment dates use Vietnam calendar dates; grants use explicit-offset timestamps with a half-open validity interval `[from,until)`.
- Scoped role codes `DEPARTMENT_HEAD` and `TEAM_LEADER` exist only on management grants, NOT in `user_roles` or JWT role claims. Grant creation never provisions legacy `MANAGER` or broad module permissions. Account-row serialization rejects overlapping grant windows; membership uniqueness and transactionally written audit protect retries/history.
- Admin manages teams, membership and grants from `/dashboard/organization`; grants are changed by revoke/reissue rather than rewriting historical decisions. Team deactivation temporarily disables its grants; reactivation allows unexpired/unrevoked grants to become effective again. Expired/revoked grants never regain access.
- Read-only scoped organization endpoints return only identity/code/name and branches relevant to the granted department/team. Current account, employee, scope and grant validity are checked each request, independent of role snapshots in JWT. Existing privileged roles and existing module access are not silently reconfigured.
- Down migration refuses to run once organization data exists; export/migrate data first. No automatic backfill of teams/grants and no fake workflow confirmations.
- PQ2 dual-channel sessions, PQ3 approval routing/Admin immediate reroute, PQ4 manager app and PQ5 per-module rollout remain `NOT_IMPLEMENTED`. See `docs/PERMISSIONS_PLAN.md` for the approved plan and handoff.

### Customer review CR1 — employee lifecycle

- Migration `1790899200000-employee-lifecycle` lưu ngày ngừng làm việc, lý do, người thao tác và thời điểm đổi trạng thái mà không xóa hồ sơ hoặc dữ liệu nghiệp vụ.
- Sửa hồ sơ và cơ cấu được audit dưới resource `EMPLOYEE`; thay đổi phân công đóng khoảng hiệu lực cũ rồi tạo khoảng hiện hành mới.
- Ngừng làm việc là transition chỉ dành cho Admin: Backend vô hiệu hóa tài khoản, thu hồi phiên đăng nhập và push token trong cùng transaction. Khôi phục chỉ mở lại tài khoản, không phục hồi phiên/token cũ.
- Admin Web cung cấp trạng thái sửa, quyết định ngừng/khôi phục và lịch sử hồ sơ/phân công. Mã nhân viên cùng định danh tài khoản không được đổi trong flow này.

### Customer alignment C2 — session, device and login alert

- Migration `1790121600000-auth-sessions` lưu vòng đời phiên, thiết bị, client Web/Mobile, thời điểm đăng nhập/thu hồi và trạng thái cảnh báo email. Migration `1790640000000-refresh-token-sessions` bổ sung hash refresh token hiện tại/trước đó và `last_seen_at`.
- JWT truy cập mang `sid`, sống mặc định 15 phút và chỉ hợp lệ khi phiên tương ứng còn hoạt động. Refresh token là credential opaque, được hash trong database và xoay vòng sau mỗi lần sử dụng.
- Admin Web dùng access cookie và refresh cookie HttpOnly; phiên tối đa 24 giờ, timeout không hoạt động 30 phút. Mobile lưu cặp token trong secure storage và duy trì phiên tối đa 30 ngày trên đúng thiết bị.
- Mỗi tài khoản chỉ có một phiên hoạt động. Repository thay thế phiên trong transaction và database có partial unique index để bảo vệ invariant.
- Email cảnh báo dùng SMTP qua port `LoginAlertSender`; secret chỉ đến từ environment. Thiếu cấu hình được lưu là `SKIPPED`, lỗi giao nhận là `FAILED`, không chặn nhân viên đăng nhập.
- Admin Web có trang lịch sử phiên và quyền thu hồi; Mobile tự refresh khi access token hết hạn, gọi logout Backend trước khi xóa token cục bộ và quay về đăng nhập khi refresh token không còn hợp lệ.

### Customer alignment C3 — schedule, work duration and geofence

- Migration `1790208000000-schedule-location-alignment` bổ sung `department_schedules`, lịch sử cấu hình, liên kết chi nhánh/loại cho vị trí và `office_location_id` trên attendance event.
- Lịch theo phòng ban là mặc định; assignment theo nhân viên là override có độ ưu tiên cao hơn. Assignment cũ được đóng khoảng hiệu lực, không hard-delete.
- Quy tắc 3 phút đi muộn, 480 phút đủ công, về sớm và OT nằm trong Backend. Web/Mobile chỉ hiển thị kết quả `workedMinutes`, `requiredWorkMinutes`, `isFullWorkday` và `overtimeMinutes`.
- Geofence được chọn theo chi nhánh hiện hành của nhân viên và khoảng cách gần nhất. Customer review CR2 dùng migration `1790985600000-geofence-radius-alignment` để đồng bộ giới hạn bán kính tối đa 100 m tại Database và DTO; ngưỡng accuracy vẫn tối đa 50 m.
- Chỉ `ADMIN` được tạo/sửa lịch, vị trí và xem `configuration_audit_logs`. Không seed tọa độ HN hoặc địa điểm ngoài văn phòng khi chưa có dữ liệu chính thức.
- Admin Web hiển thị các vị trí và vùng geofence trên bản đồ, cho phép chọn/kéo tọa độ hoặc lấy đúng một mẫu vị trí từ thiết bị. Tile URL/attribution được cấu hình bằng biến môi trường; thao tác này không bật theo dõi GPS liên tục.

### Customer alignment C4 — attendance reconciliation and period locking

- Migration `1790294400000-attendance-reconciliation` originally added Admin explanation requests and monthly attendance period state. That creation flow is superseded by the employee-initiated correction below; historical rows are retained.
- Migration `1791417600000-employee-explanations` makes Admin deadline/requester nullable and adds source, submitter, idempotent submission UUID and image upload ownership. Employee `POST /attendance/explanations/mine` derives identity from authentication, checks active ownership, locks the monthly period and creates `SUBMITTED` with immutable submit audit. A per-user/submission advisory lock plus a unique index prevents retry duplication; changing payload under that ID fails.
- Admin alone can review explanations and read attendance adjustment history. Adjustment values remain limited to check-in time, check-out time and day status until the customer defines a broader policy.
- Admin or Chief Accountant can lock a reconciled month. A month with incomplete check-outs or open explanations cannot be locked. A locked month rejects new explanations and attendance adjustments.
- Only `CHIEF_ACCOUNTANT` can reopen a locked period, and the reason is mandatory. Lock and reopen actions are recorded in `configuration_audit_logs`.
- Admin Web replaces request creation with an all-date submitted queue; approval/rejection notes are optional and reviews are audited. Approval never mutates attendance. Legacy `REQUESTED` response compatibility remains; new Admin requests return `EMPLOYEE_EXPLANATION_REQUIRED`.
- Mobile Android offers Create explanation with date/type/content and one optional camera/gallery image. It does not sample GPS; gallery selection does not invent capture time. The serialized offline queue uses stable UUIDs, keeps unsent private images and scopes new queue records to their owner. Unknown-owner legacy responses verify the server request before upload.
- Evidence storage recognizes JPEG/PNG/WebP signatures, enforces 5 MB and ownership, denies overwriting attached evidence and limits reads to owner/Admin. It stays local disk behind an adapter boundary; object storage/backup remain deployment concerns. Migration backfills ownership for referenced legacy files and refuses rollback once employee submissions exist, to prevent data loss.
- Reporting month-lock also acquires/creates the period row and rechecks open explanations inside the lock transaction; this minimal cross-module change prevents a concurrent self-submission from slipping into a closed month. Multi-image/PDF, editing/cancelling submitted explanations and dedicated review push are not implemented by this correction.

### Customer alignment C5 — business trip operation

- Migration `1790380800000-business-trip-operations` adds the responsible employee, cancellation reason and per-member start/end GPS plus completion evidence metadata.
- Admin owns trip preparation: create, edit while `DRAFT`, assign and cancel with a mandatory reason. Admin no longer marks a trip in progress or completed on behalf of employees.
- An assigned employee starts and completes only their own participation through dedicated authenticated endpoints. Both actions persist server time and a single GPS sample as attendance events.
- When `requires_photo=true`, completion requires an image reference and capture time. Mobile captures and uploads the image through an authenticated endpoint; development uses `BusinessTripEvidenceStorage` on local disk behind an adapter boundary.
- Customer review CR3 uses migration `1791072000000-business-trip-customer-management`. A PostgreSQL monthly counter allocates `CT-YYYYMM-NNNN` inside the same transaction that creates the trip, so clients cannot choose codes and concurrent creation cannot reuse a sequence.
- Admin Web filters active employee candidates by their current organization assignments while Backend remains authoritative for membership validity. Customers have a managed active/inactive lifecycle, trip counts and immutable configuration audit entries; deactivation never removes historical trip links.
- Aggregate trip status moves to `IN_PROGRESS` when the first member starts and to `COMPLETED` only when every member completes.
- Business trip changes and member actions use `configuration_audit_logs`; audit payloads intentionally exclude precise coordinates.
- Mobile lists the signed-in employee's assignments and exposes start/complete actions only for the participation state returned by Backend. Each action captures one GPS sample; no background or continuous tracking is used.
- Because customer answers W25–W29 are blank, C5 intentionally does not add multi-location itineraries, customer signatures, schedule-change workflows or multi-level approval.

### Customer alignment C6 — leave request and approval

- Migration `1790467200000-leave-operations` records the submitting account and submission time and adds indexes for employee/date and status/date queries.
- Admin/legacy Manager can record a request for an employee; an authenticated employee can list and submit only their own requests through `/leave-requests/mine`.
- Backend owns date-range validation, active-request overlap detection, one-step review and the mandatory rejection reason. Every submission and review is written to `configuration_audit_logs`.
- Leave changes are rejected when any affected attendance month is locked. A month with a pending leave request cannot be locked, so the monthly report cannot silently finalize unresolved leave.
- Approved leave is already consumed by the daily attendance/monthly reporting projection; rejected leave is excluded.
- Mobile lists only the signed-in employee's requests and submits requests through `/leave-requests/mine`. Business rules remain authoritative in Backend rather than being duplicated in the client.
- C6 originally remained full-day/date-range only. Customer review CR6 supersedes that restriction with Admin-configurable policies and balances while keeping attachments, delegation and multi-level approval outside scope.

### Customer alignment C7 — internal announcements

- Migration `1790553600000-announcement-alignment` adds individual targeting, mandatory acknowledgement metadata and published-announcement withdrawal while preserving legacy `ALL` records as read-only compatibility data.
- Only `ADMIN` can create or edit a draft, publish, cancel a draft or withdraw a published announcement. Admin actions are recorded in `configuration_audit_logs`.
- New announcements target exactly one active employee or one active department. Department publication resolves current active organization assignments so secondary department memberships are included.
- `read_at` records that a recipient opened a message. Important messages additionally require the explicit `/announcements/:id/acknowledge` action and store `acknowledged_at`.
- Admin can inspect every recipient. `MANAGER`/`AREA_MANAGER` can open the announcement tracking screen but only see recipients whose active organization assignment names the signed-in employee as direct manager.
- Withdrawing removes the item from `/announcements/mine` without deleting its recipient history. Mobile exposes an inbox with unread badge, detail/read receipt and explicit acknowledgement for important messages.
- Migration `1790726400000-push-notification-devices` stores active Android FCM tokens by account and device. Publication attempts push only after the recipient transaction succeeds; invalid tokens are disabled and push failure does not roll back inbox delivery.
- Firebase is an optional deployment adapter: Backend requires `FIREBASE_PUSH_ENABLED=true` plus Application Default Credentials, while Mobile receives its public Firebase options through `--dart-define`. Without these settings, the inbox remains functional and the UI reports that push is not configured.
- Because W39 remains unanswered, C7 does not add attachments, images, urgency levels, scheduling or expiration/retention automation.

### Customer review CR4 — company announcements and push delivery

- Migration `1791158400000-announcement-company-push-delivery` adds per-recipient push status, attempt count, timestamps and a safe failure code. Existing recipients are backfilled as `SKIPPED/LEGACY_NOT_TRACKED` instead of claiming historical delivery.
- `ALL` is now a supported write audience. Publication resolves every active employee at that moment, while department and individual resolution keep the existing rules.
- Inbox recipient creation remains transactional and authoritative. FCM runs afterward; missing credentials, missing active devices and provider errors are persisted without rolling back inbox delivery.
- Admin Web shows Firebase/device diagnostics, aggregate and per-recipient push status, and can retry only unresolved recipients while the announcement is still `PUBLISHED`.
- Mobile distinguishes missing Firebase configuration, denied notification permission and a pending device token. Real push delivery still requires environment-owned Firebase credentials and matching Android public options; no credential is stored in Git.

### Customer review CR5 — disciplinary actions

- Migration `1791244800000-employee-disciplinary-actions` stores warning, suspension and disciplinary-action records with a strict `DRAFT -> ISSUED -> REVOKED` lifecycle and references to the generated inbox announcements.
- Only `ADMIN` can create, edit, issue or revoke. Draft fields become immutable after issue; revocation requires a reason and every mutation is recorded in `configuration_audit_logs`.
- Suspension requires a bounded effective period. Other actions may be open-ended. CR5 deliberately does not mutate payroll, attendance, employment status or authentication because those consequences require separate approved policies.
- Issue creates an important individual announcement and recipient inside the same database transaction. Push delivery runs after commit through the existing tracked FCM adapter, so provider failure never removes the decision or inbox message.
- Admin Web provides drafting, filtering, issue/revoke confirmation and immutable history. `/api/announcements/mine` exposes additive structural fields on the generated message (`source`, `disciplinaryActionType`, `disciplinaryEffectiveFrom`, `disciplinaryEffectiveTo`, `disciplinaryTitle`, `disciplinaryRevoked`) so Mobile renders a dedicated disciplinary warning card and detail banner — category, effective period and mandatory acknowledgement — instead of inferring them from title/body text. Mobile still reuses the existing inbox/read/acknowledgement flow; no duplicate disciplinary business rule exists in the client.

### Customer review CR6 — configurable leave policy and balance

- Migration `1791331200000-leave-policies-balances` adds policy, yearly balance and immutable adjustment tables, then links every leave request to a policy with duration and cancellation metadata.
- The four legacy codes are migrated as active policies with balance tracking disabled. Admin must explicitly enable tracking and initialize a year, preventing historical data from silently consuming newly introduced entitlements.
- Policy configuration covers annual entitlement, minutes per day, bounded carry-over, minimum notice, half-day/hour support and approved-request cancellation. The code is immutable after creation so historical references remain stable.
- A submitted request reserves balance. Approval rechecks it under a row lock; rejection or cancellation releases it because usage is derived from current request state. Cross-year requests are rejected only for balance-tracked policies.
- Full-day duration uses the employee override or department schedule when available and falls back to policy day minutes only when no scheduled minutes resolve. Partial-day requests must stay on one date.
- Admin can initialize yearly balances and make signed adjustments with a mandatory reason. Policy, balance and request transitions are recorded in `configuration_audit_logs`.
- Admin Web exposes policy/balance operation and one-step review. Mobile shows the signed-in employee's balances, policy-aware request options and allowed cancellation. Reporting labels approved partial leave as `PARTIAL_LEAVE` instead of treating the whole day as leave.
- CR6 does not implement attachments, tenure-based automatic accrual, cash conversion, payroll effects or multi-level approval.

### Mobile completion — UX and Android package

- App renders immediately into a branded bootstrap state while secure-session restoration and Backend verification continue asynchronously; credentials are never prefilled in the login form.
- Login exposes local validation, Android autofill and keyboard-safe scrolling. Shared Material theme standardizes app bars, controls, navigation, snackbar feedback and touch targets across the five employee tabs.
- Mobile CR7 centralizes API availability into `available`, `offline` and `backendUnavailable`. Radio/network loss, timeout and gateway outage preserve secure tokens and expose a retry banner, while refresh responses proving revocation/expiry clear credentials and retain the exact operational reason on the login screen.
- App version and build number come from installed package metadata through `package_info_plus`; the UI does not duplicate a hard-coded release value.
- Mobile CR8 keeps feature scope unchanged while aligning the employee app with the Admin Web design language: shared brand tokens, sans-serif hierarchy, and reusable loading/error/empty states across Today, Business Trips, Leave, Explanations and Inbox. Refresh failures preserve and display previously loaded data whenever available.
- Mobile UX1 prioritizes the current Backend attendance date/status and check-in/out action on the Home overview, with four shortcuts that select the existing employee tabs without pushing duplicate routes or requesting GPS. Privacy help is collapsible and package version/build remains visible in the footer. Work duration/OT remain Backend results after checkout; no live counter or estimated shift end is inferred. A recorded checkout is labelled separately from meeting the required work duration.
- Mobile UX2 moves the single attendance action into a SafeArea-aware bar above the existing tabs, with separate locating/sending/reloading labels. Synchronous UI guards prevent repeated record/retry calls and refresh from clearing in-flight feedback. Missing or failed-to-refresh attendance state requires a read-only reload before recording. Success displays the Backend event time and distinguishes risk-flagged records requiring review; GPS, session, geofence and attendance rules remain unchanged, with no automatic attendance retry on resume.
- Mobile UX3 adds local status filters and loaded/visible counts to Trips, Explanations, Leave and Inbox, with a separate no-match state and clear-filter action. Explanation filtering explicitly covers only the latest 100 Backend requests, while the local queue remains independent and does not replace Backend status. Cards separate participation from trip status, preserve leave policy/balances and show unread/acknowledgement/disciplinary metadata without mutations on filtering or preview. Leave creation occupies a reserved action bar rather than covering the list. No API, queue, permission or business-rule change is introduced.
- Mobile UX4 groups leave/explanation/trip forms, marks required inputs and displays existing local reason/photo validation beside the relevant field. Shared presentation controls provide adaptive-height actions and evidence previews with truthful local/upload/unfinished states and an image-render fallback. Leave hours are stacked, half-day choices wrap and lock while sending; the Tech Lead's existing stacked dates/cancellation dialog are preserved separately. SafeArea, scroll-to-dismiss keyboard and synchronous busy/Back guards keep operations accessible without concurrent capture/submit. Announcement detail badges and acknowledgement actions adapt to large fonts. No service, Backend, GPS, metadata or queue contract changes; real-device verification and unverified evidence/transaction variants are recorded in the UX plan.
- Android uses a branded launch drawable, disables forced dark-mode distortion and enables predictive-back integration. The debug APK remains intended for internal device verification through local HTTP/ADB reverse, not Play Store distribution.
- Real-device acceptance covers cold session restore, logout/login validation, all five tabs, detail/form navigation, pull-to-refresh, read/acknowledgement state and absence of Flutter layout/runtime exceptions.

### Production operation baseline

- Production runs as one modular-monolith stack on a Linux VPS: Caddy is the only public entry point, while Admin Web, Backend API and PostgreSQL stay on a private Docker network.
- Caddy terminates HTTPS and proxies `/api/*` to Backend; Backend exposes separate liveness and database-readiness endpoints. Containers run as non-root where supported, use read-only filesystems where practical and persist PostgreSQL/evidence data in named volumes.
- Production environment validation rejects placeholder JWT secrets, non-HTTPS CORS origins and missing evidence paths before the API accepts traffic. Database migrations run before Backend startup.
- Migration `1790812800000-canonical-roles` provisions the canonical role catalogue. The first production Admin is created once through `scripts/prod/bootstrap-admin.sh`; the development seed remains prohibited outside development.
- Migration `1790899200000-employee-lifecycle` adds recoverable employee deactivation metadata and preserves lifecycle changes in the immutable configuration audit log.
- Operational commands, backup requirements, Firebase credential mounting and release-APK prerequisites are canonicalized in `DEPLOYMENT.md`.

## Repository layout

```text
backend/       NestJS API, domain and data access
frontend/      Next.js Admin Web
mobile/        Flutter employee app
scripts/dev/   Local bootstrap helpers
scripts/prod/  Production deployment and backup helpers
deploy/        Production proxy and environment templates
```

Không tạo microservice, `architecture/` tree hoặc shared framework mới nếu chưa có nhu cầu được duyệt. API contract sẽ được công bố bằng OpenAPI từ backend; client không sao chép business rule.

## CR7 — Production operations baseline

- Endpoint xác thực có rate limit hữu hạn; cookie mutation production chỉ nhận exact Origin trong allow-list. Request log chỉ chứa request ID, method, path, status và thời lượng.
- Mật khẩu tạm và Admin bootstrap dùng chung policy mạnh 12–128 ký tự, có hoa/thường/số/ký hiệu.
- Admin có trang vận hành riêng để xem migration, release, uptime, lỗi email/push, workflow tồn và audit tập trung; endpoint không trả secret.
- Báo cáo tháng tính giờ làm, giờ chuẩn và OT tại Backend, dùng cùng blocker cho UI/khóa kỳ và xuất Excel hai sheet.
- Production vẫn là modular monolith một VPS. Preflight, backup trước deploy, health-gated startup, checksum và restore drill biệt lập nằm trong `scripts/prod/` và `DEPLOYMENT.md`.

## Backend module boundaries

```text
auth
employees
work-schedules
office-locations
attendance
business-trips
leave
announcements
disciplinary-actions
kpi
notifications
reporting
audit
```

Mỗi module khi được triển khai nên tách rõ:

- `domain/`: entity, value object, invariant, state transition.
- `application/`: use case/service và port.
- `infrastructure/`: database, external service, adapter.
- `presentation/`: controller/DTO.

Chỉ tạo các thư mục con này khi module bắt đầu có code thật; không scaffold hàng loạt file rỗng.

## Delivery sequence

### Foundation — current

- [x] Repository boundaries and Agent rules.
- [x] Local PostgreSQL definition.
- [x] Backend/Web/Mobile shells.
- [x] Initial attendance state model.
- [x] Install dependencies and generate lockfile.
- [x] Bootstrap GitNexus graph and standard skills.
- [x] PostgreSQL migration foundation with TypeORM adapter.
- [x] Development-only Admin seed.
- [x] Login, JWT authentication, current-user endpoint and basic RBAC.
- [x] Protected Admin Web shell and foundation dashboard.
- [ ] Initialize Flutter Android/iOS platform folders.
- [x] Establish CI quality gate for pull requests and manual production checks.

### Phase 1 — Core MVP

1. [x] Auth/RBAC and employee directory.
2. [x] Work schedule and office geofence configuration.
3. [x] Office attendance events and daily attendance projection API/Admin view.
4. [x] Business trip assignment, state machine and field-attendance validation API.
5. [x] Leave request, overlap validation and one-step approval.
6. [x] Announcement audience resolution and delivery/read state API.
7. [x] Attendance adjustment + immutable audit log.
8. [x] Real dashboard and monthly attendance Excel export.

### Phase 2 — Operation

- Field photo/file attachment with configurable requirement.
- [x] KPI Lite operational counts on Admin Web.
- [x] Excel tổng hợp nhân viên + chi tiết ngày, giờ làm/giờ chuẩn/OT và blocker đối soát thống nhất.
- [x] Push notification reliability and delivery tracking.
- [x] Multi-branch organization assignments and branch-scoped employee directory.
- [x] Admin Web UX/scalability polish: responsive navigation, safe action dialogs, actionable dashboard and paged employee/audit views.
- [x] Admin Web final polish: role-aware branch context, searchable employee pickers, unsaved-change guards and redacted audit detail drawer.

### Phase 3 — only after new approval

- Permission engine tùy biến ngoài role/phạm vi đã chốt, payroll/API integration, advanced analytics.

## Definition of Done

Một feature chỉ hoàn thành khi:

- Business rule khớp `PROJECT.md` và state trong `FLOWS.md`.
- Authorization được kiểm tra ở backend.
- Có migration/schema và rollback strategy nếu thay đổi dữ liệu.
- Có automated tests cho happy path và rule quan trọng.
- API errors có mã/trạng thái rõ, không phụ thuộc message string ở client.
- UI có loading, empty, success và error state tương ứng.
- Không ghi log secret, token, tọa độ hoặc dữ liệu cá nhân quá mức cần thiết.
- Diff đã được review; tài liệu canonical được cập nhật nếu behavior thay đổi.
