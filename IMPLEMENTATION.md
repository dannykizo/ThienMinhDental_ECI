# Implementation Guide

Motion overlay nhân sự V3 (2026-10-20): hook cục bộ `employee-profile-motion.ts` dùng IntersectionObserver reveal một lần và pointer spotlight chỉ với chuột, một RAF khi có pointer event, cleanup khi unmount; CSS native, không dependency mới. Overlay có timer chuyển 200 ms/đóng 240 ms, guard thao tác và callback trễ, giữ keyed reads cũ. CSS/JS tôn trọng reduced motion, không fake số hoặc tái phát mutation. Chỉ ba file Frontend và tài liệu, không Backend/Mobile. [Ghi nhận V3](docs/WEB_UI_REFRESH.md).

## Shared employee portrait / dark-glass profile — 2026-10-20

`employee-profile-overlay.tsx` + scoped `employee-profile.css` dùng bento đen kính mờ, hình chân dung, vòng ngày đủ công/ngày theo lịch và cột phút làm thực tế. Giữ nguồn monthly document LIVE/SNAPSHOT và các section/API nghiệp vụ hiện hữu, không thêm số ngẫu nhiên/online giả. `employee-portrait.tsx` chuẩn hóa ảnh bằng canvas, đọc byte riêng tư thành blob URL, lazy thumbnail, thu hồi URL khi đổi/đóng. `auth-api.ts` không tự đặt JSON Content-Type cho FormData.

Migration `1793060000000-employee-portraits` thêm `employee_portraits`: employee PK/FK cascade, JPEG bytea, thumbnail, UUID version, updated_at/by. Không bật synchronize. Ảnh tối đa 768 KiB + thumbnail 40 KiB/người; cần dự trù tăng backup DB. Rollback từ chối khi còn ảnh. Đã apply development sau khi tạo pg_dump, không thay production. Xóa nhân sự R3 tính cả ảnh trong preview/fingerprint và xóa cùng transaction; writer khóa employees trước để không đảo thứ tự với delete.

Admin JWT+RBAC: `GET /employees/portraits`, `GET/POST/DELETE /employees/:id/portrait`. Self JWT: `GET /profile/portrait/info`, `GET/POST /profile/portrait`; không nhận employeeId từ client, kiểm tra employeeId + user_id + active, recheck ownership dưới khóa khi ghi. POST multipart portrait/thumbnail/expectedVersion (`none` hoặc UUID), giới hạn file/field/part; optimistic version chống ghi đè, audit chỉ ghi photoVersion. Backend xác minh cấu trúc JPEG baseline, kích thước/byte, loại APP/EXIF/comment và từ chối SVG/URL/scan phụ; đây không phải full image decoder/antivirus hay xác minh danh tính.

Mobile `features/profile`: entry avatar trong AttendanceHome, chụp/gallery bằng image_picker hiện hữu, worker chuẩn hóa JPEG/thumbnail và loại metadata với image 4.10.1 (dependency đã có, chỉ chuyển direct). ApiClient dùng phiên/refresh hiện hữu, không tự replay upload khi mất mạng. Không đổi chữ ký chấm công, GPS, sinh trắc hay quyền quản lý. Kiểm tra và giới hạn thực tế: [biên bản UI](docs/WEB_UI_REFRESH.md).

## Employee profile overlay — 2026-10-20

`EmployeeProfileOverlay` là portal presentation-only, đọc API Admin hiện hữu; một vùng cuộn, header/dải người cố định, focus trap và nền inert. Các confirmation/toast của trang Nhân viên cũng portal lên body để không bị inert của nền chặn. Panel thao tác WorkflowDrawer vẫn giữ nguyên rule; profile tạm inert khi panel mở. Kết quả đọc khóa theo URL/revision, ẩn dữ liệu người cũ ngay khi đổi id và bỏ response đến muộn; collection đọc dùng lại trong thời gian overlay mở. Tải lại chỉ gửi GET, không replay mutation. Lịch sử panel không được response trễ làm mở lại sau đóng.

Công/OT/đối soát lấy summary từ monthly document có employeeId, không tự tính công; không dùng blocker tổng công ty làm chỉ số cá nhân. Quỹ phép theo từng policy/dayMinutes và năm tại thời điểm đọc, không gộp chính sách hay coi quỹ chưa khởi tạo là 0. Đơn/công tác/kỷ luật giữ trạng thái và người xử lý Backend; tuyến mặc định không khẳng định quyền duyệt còn hiệu lực. Phân công tổ chức/quyền quản lý không suy diễn thành viên team. Không tải ảnh hoặc GPS cá nhân nền. CSS riêng scope `ep-*`, CSS transitions 160–220ms/reduced-motion, không thêm dependency. Xem [biên bản UI](docs/WEB_UI_REFRESH.md) cho kiểm tra và giới hạn tải collection.

## Web UI pilot — 2026-10-19

Presentation-only trong Next.js/React/Lucide hiện hữu: dashboard layout import `workspace.css` với scope shell/page mẫu; portal navigation vẫn là allow-list. Employee forms reuse WorkflowDrawer qua props trình bày tùy chọn (eyebrow/className), giữ focus trap, busy và confirmation hiện hữu. Không thêm UI framework/package, endpoint, migration hoặc Mobile change. Phủ sơ bộ theo thứ tự shell → employee list/drawers → approval workspaces → Dashboard; chưa redesign toàn bộ. Verification và điểm dừng tại `docs/WEB_UI_REFRESH.md`.

## R14 — operational gates and isolated recovery (2026-10-14)

- Tech Lead xác nhận chưa có VPS/domain: hoàn thiện bộ triển khai và nghiệm thu local, không go-live hoặc deploy Pages/Tunnel/App trong R14. Không sửa business rule, Mobile/schema/migration đã áp dụng; không dùng dữ liệu khách đang test.
- Migration registry tách khỏi CLI DataSource yêu cầu environment. Runtime đọc registry + schema_migrations bằng SELECT, không gọi showMigrations gây side effect hoặc trả false từ registry rỗng. Readiness kiểm DB và pending schema; liveness giữ độc lập. CLI giữ advisory session lease chống chạy chồng, transaction all, finally release/destroy và nonzero khi lỗi. Không tự down/backfill/seed production.
- Production exception filter giữ nguyên HttpException nghiệp vụ/quyền, sanitize exception không xác định/SQL parameters; lỗi kết nối/DNS/aggregate có mã được phân loại 503, lỗi nội bộ khác 500, không giả 401. Pages gateway timeout 25s, giữ Origin, safe JSON 503 khi tunnel/server lỗi, không replay writes. Không tạo quyền mới/giảm bảo vệ refresh.
- Operational scripts dùng chung env/Compose/Firebase override và khóa backup/deploy. Backend + ingress đang chạy được ngừng trước cặp DB/evidence; standalone resume đúng dịch vụ kể cả lỗi. Manifest binary SHA256 atomic, pair ID UTC/PID; không prune backup chưa xác nhận off-host. Restore thật trong container/network/volume biệt lập, checksum/critical schema/extraction/local refs, timeout và exact cleanup. Deploy yêu cầu clean worktree, build trước maintenance, kiểm volume qua DB tables kể cả container đã bị xóa, giữ ingress tắt khi fail, không tự rollback DB.
- Docker packaging giữ lockfile đã compile: dedicated deploy lockfile + offline production dependency copy, CLI config inject chỉ trong bước đóng gói, không đổi stack/root lockfile/local installation. Legacy deploy của pnpm 11 đã tái resolve dependency và bị loại khỏi Dockerfiles. Isolated build output không vào Docker context; development watch output/server được giữ nguyên.
- Checklist, case chạy và gate còn thiếu: docs/R14_OPERATIONS_ACCEPTANCE.md, DEPLOYMENT.md. API/unit/Docker PASS không thay thế nghiệm thu FCM/GPS/sinh trắc máy thật hoặc kiểm định Kế toán/HCNS còn PARTIAL từ các module trước.

## R13 — Shared operational summaries and scope-safe statistics (2026-10-14)

- `reporting/domain/monthly-report.summarizeEmployees` delegates all categories/minute totals to existing summarizeMonthly; KPI/managed reports no longer duplicate classification. No ORM in domain, no score/payroll formula or new dependency/schema/migration.
- Dashboard reads clock, current effective branch allowlist, R12 document and operational counts in one REPEATABLE READ transaction. Current branch/department eligibility and date bounds are explicit; empty allowlist is never global. Restricted announcement counts require a scoped recipient and exclude linked disciplinary notices. Daily review counts are employee-days, incomplete-day counts separate; open workflow counters include all dates and are labelled accordingly. Admin/Chief remain global, Area/legacy remain branch-scoped.
- Additive ADMIN/CHIEF_ACCOUNTANT `/kpi/monthly/document?month&revision` includes source/version/period metadata plus summary and grouped rows; `/kpi/monthly` retains its array shape with additive report counters. R12 snapshot/legacy-warning behavior reused, not backfilled. Global employee/department filters still cannot hide company-wide close blockers.
- `ReportingService.document` can use an existing transaction reader internally. Scoped blockers/incomplete counts use the same employee allowlist before aggregation. Managed attendance/report reads evaluate grants/roster/data in one view; explicit attendance projection removes primary department identifiers, and scoped responses omit global versions/locker metadata. Old numeric aliases remain for App compatibility; partial leave is no longer counted as full-day leave.
- Web Dashboard/KPI/managed reports add truthful labels, loading/error/retry/source/revision and latest-response guards. Dashboard links come from portal navigation, not role guessing; no forbidden workspace links. Builds use NEXT_BUILD_DIR `.next-r13` with matching Git/ESLint ignores, preserving dev Hot Reload. No Mobile edits, account changes, production deploy or scope beyond R13. Acceptance/evidence/limitations: `docs/R13_DASHBOARD_KPI_ACCEPTANCE.md`.

## R12 — Four independent Excel exports and immutable revisions (2026-10-13)

- Completion slice: three additive ADMIN/CHIEF_ACCOUNTANT GET routes `/reporting/leave/export`, `/reporting/overtime/export`, `/reporting/explanations/export`, same month/employee/department/revision filters. Four visible Web buttons have loading/success/error and coordinated session refresh for binary downloads. Incomplete data DOES NOT block exporting; amber/red notes identify pending/missing fields. Closing rules and authorization remain strict. Empty reports have headers/metadata, not fake records.
- Migration `1792972800000-supporting-report-snapshots` adds nullable supporting_reports JSONB. New closes capture requests/annual balances/adjustments/audit metadata in the same close transaction; existing revisions remain untouched and immutable. Legacy snapshots lacking detail (or a legacy locked period without any snapshot) use LIVE data with explicit non-historical warnings, not fabricated backfill. Development backup/migration applied; production not deployed.
- Supporting read projection uses whitelisted scalar fields, no GPS/image reference/raw audit JSON/credentials. Shared `leave/infrastructure/leave-balance-reader` mechanically extracts the existing balance SQL; reporting never initializes quota or duplicates quota business rules. Full-year balances are as-of capture, not historical month-end; current active staff/policy scope is stated. Cross-month leave remains full request detail but is excluded from monthly minute totals; day-equivalents show current capture policy basis (no stored submission-time basis). OT only approved contributes; explanation approval does not itself imply an adjustment.
- Targeted fixtures/workbook checks and rollout details: `docs/R12_REPORTING_ACCEPTANCE.md`. Historical part-1 evidence below remains valid except export/legacy handling superseded here.

- Migration `1792886400000-attendance-report-snapshots` adds JSONB rows/summary, frozen locker identity, revision/time/reason and a database trigger rejecting UPDATE/DELETE. No employee/catalog FK: R3 hard-delete remains allowed, finalized report identity/data remains by the approved retention rule. This supersedes the historical R3 statement below that even locked reports change after deletion. No fabricated backfill; legacy locked months export LIVE with explicit warning as specified above. Down refuses when snapshots exist. Development backed up and migrated; production not deployed.
- `ReportingService.document` uses one REPEATABLE READ view for period, data, versions and company-wide blockers. Locked months read the latest immutable snapshot; explicit revision also reads an older snapshot while reopened. Filtering happens before totals, including the managed-module employee allow-list. GET never writes. Additive ADMIN/CHIEF_ACCOUNTANT endpoint `/reporting/monthly/document`; existing export accepts optional revision and records exporter metadata. Export rights unchanged.
- Closing takes short ordered SHARE locks over all projection inputs, then the month row lock; rechecks incomplete days/open explanations/pending leave/OT, and atomically writes period, next snapshot and audit. Deadlock/lock-timeout returns REPORT_BUSY without replay. Attendance event persistence now checks the same month lock before consuming device proof or saving; this is the minimal cross-module dependency for period integrity. Only Chief Accountant reopens, with a trimmed reason; old versions remain immutable.
- Pure domain summary shared by API/workbook. ExcelJS uses five sheets: period information, employee totals, day matrix, daily detail and reconciliation. Numeric minutes/raw hours, Vietnam time, text-only user values; no payroll, GPS/photos/passwords/device keys. Partial leave counts are not converted leave days; office/field and leave categories can overlap and must not be added as distinct paid days. Department is the current primary projection frozen at closing, not a reconstruction of historical organization.
- Web reports loads one document, selects/pins revisions, distinguishes draft from finalized and requires reloading changed filters. An optional `NEXT_BUILD_DIR` allows isolated verification without overwriting Hot Reload; ESLint ignores `.next-r12` build output. No Mobile/dependency changes. Part 1 had targeted 36/36 pass; supporting reports are now implemented above, accounting review remains PARTIAL. Evidence/commands: `docs/R12_REPORTING_ACCEPTANCE.md`.

## R4 — OT/Đơn từ integration (2026-10-10)

- Migration `1792454400000-overtime-workflow` thêm overtime_requests và overtime_approval_routes; unique submission UUID và partial unique employee/date cho SUBMITTED/APPROVED, integer minutes/check constraints. Rollback từ chối nếu có dữ liệu; không backfill công lịch sử. Đã backup/apply development; production chưa deploy.
- Nest overtime module độc lập với leave balances/policies/routes; dùng lại pure workflow permission helpers của leave/domain, không đưa ORM vào Domain. Transaction/advisory lock theo employee, live grants/version, period lock, audit/inbox và push sau commit giữ cùng policy đã duyệt. Không thêm package/framework.
- Attendance/Reporting được chạm để cộng approved minutes và khóa tháng có OT chờ (recheck dưới period lock); employees deletion bổ sung FK/owned tables, portal/capabilities thêm route/quyền xử lý OT. Đây là dependency bắt buộc, không mở lại phạm vi leave/trips/R5.
- Web `/dashboard/overtime` có hàng đợi, chi tiết/audit, xác nhận/quyết định và Admin route configuration; reports hiển thị pending OT blocker. Flutter Đơn từ hub, OT list/form/manager xử lý dựa Backend permissions; điều hướng hộp thư cập nhật do số tab thay đổi. Camera/GPS slice giữ nguyên.
- Migration/Backend trước Web/App. R4 code đã có Đơn từ và OT độc lập (thay NOT_IMPLEMENTED lịch sử bên dưới), nghiệm thu máy thật vẫn PARTIAL. Bằng chứng/command tại `docs/R4_OT_FORMS_ACCEPTANCE.md`.

## R4 — daily attendance vertical slice (2026-10-10)

- Migration `1792368000000-daily-attendance-capture` adds server-issued camera contexts and event photo/content/context/daily-policy columns. Unique indexes apply only to new-policy events; no historic event is deleted/backfilled. Application checks all same-day historic/new events under existing per-employee advisory lock. Domain stays ORM-free. Automatic down refuses once captures/new-policy events exist.
- Shared `/attendance/events` supports office and field without a ticket, mandatory fresh-context uploaded photo for check-in. `/attendance/check-in-captures` binds owner/type/GPS/server timemark for 10 minutes/current Vietnam day. Photo upload lock and linked-event immutability reuse the attendance ownership ledger/storage; employee deletion allowlist includes capture rows. No new package/framework/continuous GPS or secret.
- Admin-only detail API and Web show photo/content/event GPS. Checkout response redacts location metadata; employee Today has type/time/summary, not coordinates. Scoped managed reads/Excel do not gain GPS access. App uses existing camera picker + Flutter canvas to burn server-issued timemark into PNG, preview/confirm then upload/record, cleans temporary files, checkout has no camera. Clear disclosure at Home/onboarding; one GPS sample per event.
- Reporting now reads field mode from events rather than assigned tickets; incomplete field pairs stay blockers. New daily events appear even without a matching schedule; no clock-derived OT. Ticket start/complete no longer writes attendance; ticket records/audit remain. This is a direct integration dependency, not a redesign of trips/reports.
- Deploy migration + Backend before the compatible App; existing clients without check-in photos receive explicit PHOTO_REQUIRED, so coordinate release. R4 still PARTIAL; separate OT route/module/report integration and unified Đơn từ remain `NOT_IMPLEMENTED`. Rollout/evidence: `docs/R4_DAILY_ATTENDANCE_ACCEPTANCE.md`.

## R4 — acceptance và mở rộng đã duyệt (2026-10-09)

Lát cắt cấu hình lịch sửa validation tên/null/ngày thật, so sánh giờ PostgreSQL theo phút; khóa update lịch và advisory-lock theo nhân viên hoặc cặp chi nhánh/phòng khi gán lịch, kiểm tra hồ sơ/catalog active. Đóng hiệu lực lịch trước có audit CLOSE trong cùng transaction; overlap rollback cả closure/audit. API list bổ sung employeeAssignments để Admin xem người/ngày ngoại lệ. Web sửa form-reset sau await, double-submit, lỗi toggle/retry và hiển thị ngày hiệu lực, không redesign.

Attendance/Reporting được chạm tối thiểu để chọn cùng phòng chính và ưu tiên cá nhân trước khi xét ngày làm. Domain không tự tính OT từ checkout; lỗi invalid timestamp không tạo NaN và dung sai muộn/về sớm xét cả giây. Không có schema/migration mới trong lát cắt này.

Scope bổ sung được Tech Lead duyệt trong R4: phiếu OT nhân viên → Leader xác nhận → Head duyệt/Admin dự phòng, chỉ OT đã duyệt vào báo cáo; một lượt in/out/ngày chung văn phòng/hiện trường, reset quyền thao tác 00:00 +07:00, ảnh hiện trường camera-only, công tác nhiều ngày chấm từng ngày. Những phần này cần Database → Backend → Web/App → targeted acceptance riêng trong R4, hiện `NOT_IMPLEMENTED`; không thêm module ERP khác hoặc chuyển R5. Chi tiết bàn giao tại `docs/R4_SCHEDULES_ACCEPTANCE.md`.

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
- PQ2 channel sessions, PQ3 explanation routing/Admin immediate reroute and PQ4 manager app are implemented below. PQ5 adds leave routing and scoped read-only modules below. See `docs/PERMISSIONS_PLAN.md` for the approved plan and handoff.

### Organization catalogue lifecycle — prerequisite for R2

- Migration `1792195200000-organization-catalog-lifecycle` creates a permanent `(catalog_table,catalog_id)` usage ledger for branches/departments/positions/teams. Backfill actual single-column FKs and historical JSON audit references, excluding the catalogue's own CREATE/UPDATE audit. Install AFTER INSERT/UPDATE triggers on the current FK sources and BEFORE DELETE protection on catalogue tables, including references whose existing FK uses SET NULL/CASCADE. No current organizational data is deleted/deactivated or reassigned.
- Future migrations adding FK references to these catalogues must also install the usage trigger/backfill; the service additionally discovers live FKs when checking deletion. Automatic down refuses to erase historical deletion protection. Deploy migration and Backend before Web.
- `CatalogService` is the single lifecycle implementation, ADMIN-only both at controller and service. Kind/table names are allow-listed; writes use a transaction and row lock, reason/audit and a confirmation hash over record/reference snapshots/usage/related counts. The usage marker survives removal of mutable scopes. Existing employee lookup creation delegates to this same audited service; GET lookup array contract remains unchanged for historical consumers.
- Backend validators at new employee assignments/branch scopes, department schedules, office scope changes and team member/grant creation take shared catalogue locks and reject inactive references. Web retains inactive selections for historical display, suppresses unchanged assignment/scope mutations when only editing the employee profile, and hides inactive choices in new operations. No generic ERP/permission engine, deletion of employees or module-wide redesign.
- `/organization/teams/:id` PATCH now requires reason and confirmationToken along with name/isActive; Web has been updated. Catalogue endpoints documented in `docs/ORGANIZATION_CATALOG_LIFECYCLE.md`. Source-only unit/PostgreSQL regression tests are opt-in/not executed until requested by Tech Lead. R2 acceptance remains separate.

R2 acceptance (2026-10-09): executed the opted-in catalogue suites and organization/workflow regressions (85/85 total). Scoped organization directories now require active employee accounts, matching managed reads/routing; Admin membership history remains intact. New opt-in `r2-organization.postgres.spec.ts` migrates an owned temporary database and runs an isolated HTTP API with SMTP/FCM disabled, including concurrent writes/deletion, actual image authorization and preservation of completed workflow steps. No schema/API contract change. This does not certify Head/Leader Web/App UI or production; see `docs/R2_ORGANIZATION_ACCEPTANCE.md`.

### PQ2 — current manager access and channel sessions

- Migration `1791590400000-manager-channel-sessions` replaces the partial per-user unique index with `(user_id,client_type)` uniqueness for unrevoked sessions. Existing sessions/history are untouched. Down refuses if multiple unrevoked rows per account remain; explicitly revoke extra sessions first, never silently delete/log out accounts during rollback.
- The pure `auth/domain/portal-access` policy consumes the PQ1 Domain grant policy. Auth and organization share one grant persistence reader rather than circular NestJS module imports or duplicate eligibility logic. Domain remains independent of ORM. Scoped grants never become `user_roles`/JWT global roles.
- Auth persistence locks the account row before fresh policy selection and session replacement. Appointed active managers replace only the incoming channel; ordinary/global-role-only accounts keep account-wide replacement pending an explicit expansion decision. Web login without portal access is rejected before replacing a valid Mobile session.
- Authentication and refresh reconcile policy changes transactionally on the next request. Ineligible accounts retire both channels. Loss of the last grant retires unsupported Web access and preserves Mobile; independent global Web roles retain module rights but return to single-account policy (Mobile wins if both exist). Revoked sessions never revive automatically.
- `user.portal` is additive to login/refresh/current-user/admin-session responses: Web eligibility, session mode, Backend-provided routes/home/scope label and sanitized active grants. Role guards of existing business modules are unchanged. Web navigation mirrors these routes; it is not a replacement for Backend authorization.
- `/dashboard/managed` reads only scoped PQ1 directory endpoints. Department heads get their granted department selectors plus visible teams; Leaders do not get department-wide selectors. Loading/error/empty/success and list pagination reuse existing components. Direct disallowed pages do not mount their business components.
- JWT guard distinguishes signature/auth failures from persistence outages; database failures remain server errors. Web refresh also propagates network/server failures as retryable errors, rather than declaring the existing session expired. Lifetimes, idle timeout, refresh rotation and per-SID logout/revocation/reuse behavior are unchanged.
- Deploy the migration and Backend before the updated Web (including Cloudflare static output). Mobile code/UX and approval workflows are not part of PQ2. Manual checks and limitations, including Chrome API access blocking, are recorded in the permissions handoff.

### PQ3 — two-step employee explanations

- Migration `1791676800000-explanation-two-step-workflow` adds per-employee default routes and additive explanation workflow columns. Historical terminal decisions stay unchanged; open legacy rows need real routing/confirmation. Rollback refuses once route/workflow data exists; export/migrate first.
- Pure `attendance/domain/explanation-workflow` owns independent-actor, assigned-role/scope, live-grant and step policy. `ExplanationWorkflowService` uses existing TypeORM adapters and shared grant reader; no general workflow engine or global role promotion. Each action checks current assignment and scope, not JWT grants; the post-PQ5 correction adds explicit reasoned Admin fallback only for missing/ineligible live routing, not a healthy-route override.
- Defaults use explicit employee/team/two-manager configuration. Saves update unfinished pending steps transactionally; per-request reroute leaves defaults unchanged. Completed confirmation/team/Leader never changes. Cross-department future defaults cannot force a Head without the old scope onto confirmed pending requests; the transaction fails instead. Reasons and optimistic versions prevent silent stale changes.
- Routing advisory locks serialize submission/default edits; period-row locks precede explanation-row locks on response/decision. Explanation-row locks serialize decisions/reroutes; submit idempotency and evidence locks remain. Stage stays orthogonal to `SUBMITTED`, preserving period blockers, open uniqueness, reports and the existing Mobile queue.
- Evidence reads use the same workflow scope policy. Inbox recipients/messages and audit commit with the action; the existing announcement push sender runs afterward, retaining tracked failures. No new Firebase secret or fake delivery claim. Notifications contain request/date/step, not submitted content/images/GPS.
- Web `/dashboard/explanations` and reusable attendance queue expose Backend action capabilities, explicit default/per-item routing, two stages, actor/times, audit, pagination and loading/error/empty/success. Portal adds this route only for Admin/active scoped grants; other module guards are unchanged. PQ4 adds Mobile manager UI and detailed employee step presentation; existing API status/submit behavior stays compatible.

### PQ4 — explanation processing in the existing app

- Mobile reads `/organization/mine` capabilities on session restoration/login, resume and employee-explanation refresh. Home and Explanations expose a manager entry only for `EXPLANATION_TWO_STEP`; membership/global role strings do not create rights. No new app, tab, package, migration or Backend/Web changes.
- Manager queue/detail recheck current access and use PQ3 scoped list/history/evidence endpoints. Queue supports horizontal stage/action filters, search and local pagination. Details mirror Backend stage, assigned and actual actors/times/notes; historical terminal records never invent a confirmation. Employee details use the own-list path and never render review controls.
- Confirmation/review require Backend `canConfirm`/`canReview` and the displayed `routeVersion` as `expectedVersion`. Confirmation dialogs explain consequences, notes remain optional, busy/Back guards prevent duplicate actions. Failures and ambiguous network outcomes remove actionable cached content and require a read-only reload; no decision is queued/retried automatically. Resume while a dialog is open invalidates that dialog's stale snapshot.
- Evidence references must match the existing same-origin attendance image path before a Bearer request; bytes stay in memory and are cleared on reload/session end. No external URL receives credentials. Scoped 403 is not treated as session expiry; authentication/refresh revocation behavior remains unchanged.
- Loading/error/empty/success use existing theme/widgets. Added Mobile contract/permission/payload/evidence/dialog tests, not executed by Tech Lead instruction. Analyze, debug build/Hot Reload and actual verification limits are recorded in the permissions handoff. Full manager action/evidence/font/keyboard acceptance on a real device remains to be verified.

### Customer review CR1 — employee lifecycle

R3 (2026-10-09) supersedes the historical no-hard-delete employee restriction below. `EmployeeAdminService` adds ADMIN-only account read/reset and explicit employee-owned data deletion; Domain stays independent of ORM. Reset follows existing password policy and account-row serialization; login passes the verified hash to session persistence for a locked freshness check. No credential appears in responses/audit. Deletion uses brief ordered table locks (5-second lock timeout), repeatable-read impact/fingerprints, exact employee-code/reason confirmation and an atomic explicit FK-child purge rather than global cascade/schema changes. Shared trips/other decisions/audit remain; the user actor becomes inactive and anonymized, sessions/roles/scopes removed and grants revoked. Attendance periods are not rewritten; deleting historic events changes reports even in locked periods, explicitly authorized by Tech Lead.

Migration `1792281600000-employee-file-cleanup` adds only the durable exact-filename cleanup queue; no existing employee data is automatically deleted. Deploy migration before Backend/Web. Queue writes commit with deletion, the worker unlinks only allow-listed UUID image basenames under configured evidence roots and retries each minute/on startup. Pending files cannot be read from evidence endpoints; uploads recheck live account/profile while holding shared row locks. Down refuses while cleanup is pending and cannot undo personnel deletion. Unattached legacy trip uploads without an ownership record cannot be attributed; backups/audit snapshots are not PII-erased. Worker/API build/runtime/acceptance and touched cross-module Auth/evidence files: `docs/R3_EMPLOYEES_ACCEPTANCE.md`.

- Migration `1790899200000-employee-lifecycle` lưu ngày ngừng làm việc, lý do, người thao tác và thời điểm đổi trạng thái mà không xóa hồ sơ hoặc dữ liệu nghiệp vụ.
- Sửa hồ sơ và cơ cấu được audit dưới resource `EMPLOYEE`; thay đổi phân công đóng khoảng hiệu lực cũ rồi tạo khoảng hiện hành mới.
- Ngừng làm việc là transition chỉ dành cho Admin: Backend vô hiệu hóa tài khoản, thu hồi phiên đăng nhập và push token trong cùng transaction. Khôi phục chỉ mở lại tài khoản, không phục hồi phiên/token cũ.
- Admin Web cung cấp trạng thái sửa, quyết định ngừng/khôi phục và lịch sử hồ sơ/phân công. Mã nhân viên cùng định danh tài khoản không được đổi trong flow này.

### Customer alignment C2 — session, device and login alert

- Migration `1790121600000-auth-sessions` lưu vòng đời phiên, thiết bị, client Web/Mobile, thời điểm đăng nhập/thu hồi và trạng thái cảnh báo email. Migration `1790640000000-refresh-token-sessions` bổ sung hash refresh token hiện tại/trước đó và `last_seen_at`.
- JWT truy cập mang `sid`, sống mặc định 15 phút và chỉ hợp lệ khi phiên tương ứng còn hoạt động. Refresh token là credential opaque, được hash trong database và xoay vòng sau mỗi lần sử dụng.
- Admin Web dùng access cookie và refresh cookie HttpOnly; phiên tối đa 24 giờ, timeout không hoạt động 30 phút. Mobile lưu cặp token trong secure storage và duy trì phiên tối đa 30 ngày trên đúng thiết bị.
- C2 ban đầu dùng một phiên/tài khoản; PQ2 ở trên bổ sung ngoại lệ một Web + một Mobile cho quản lý có grant hiện hành. Repository khóa tài khoản và thay phiên trong transaction; database bảo vệ duy nhất theo kênh, policy tài khoản thông thường do Backend bảo vệ.
- Email cảnh báo dùng SMTP qua port `LoginAlertSender`; secret chỉ đến từ environment. Thiếu cấu hình được lưu là `SKIPPED`, lỗi giao nhận là `FAILED`, không chặn nhân viên đăng nhập.
- Admin Web có trang lịch sử phiên và quyền thu hồi; Mobile tự refresh khi access token hết hạn, gọi logout Backend trước khi xóa token cục bộ và quay về đăng nhập khi refresh token không còn hợp lệ.

### R1 auth acceptance — 2026-10-09

- Web coordinates refresh cookies across tabs with Web Locks and a current-user probe; fallback retains same-tab single-flight only. Strict Backend refresh reuse detection/lifetimes remain unchanged. Mobile ignores late refresh responses after its credential changes, without restoring logged-out tokens or clearing a newer session.
- Session directory uses the same Web-idle predicate as authentication, labels idle Web EXPIRED without mutating/touching other sessions. Mobile has no idle timeout.
- Standard JSON/urlencoded parsers run before auth middleware so the login limiter reads normalized account input. Recognize auth endpoint casing/trailing-slash aliases accepted by Express so they cannot bypass middleware. Production Origin checks include initial WEB login cookie creation, not just requests already carrying cookies; cookie-free Mobile Bearer flow remains available.
- Targeted PostgreSQL/HTTP tests use an opt-in disposable local database and isolated API with SMTP/FCM disabled; no customer fixture changes. Existing bcrypt 72-byte truncation versus 128-character policy remains NEEDS_DECISION, not silently migrated. Results/limits: `docs/R1_AUTH_ACCEPTANCE.md`.

### Customer alignment C3 — schedule, work duration and geofence

- R5 acceptance (2026-10-10): location DTO now rejects null (except nullable branch scope), whitespace-only/oversized text, numeric-string coordinates and fractional integer settings before persistence. PATCH filters undefined fields and serializes its row so full audit snapshots follow actual updates. Geofence clamps the intermediate haversine to [0,1] to prevent NaN for antipodal valid coordinates bypassing risk comparison. No schema/policy change. Web catches tile/import failures, exposes loading/retry and preserves the editor; provider remains configured through the existing environment. Targeted 38/38 PASS, module PARTIAL due local tile DNS and untested real geolocation; see `docs/R5_LOCATIONS_ACCEPTANCE.md`.

- Migration `1790208000000-schedule-location-alignment` bổ sung `department_schedules`, lịch sử cấu hình, liên kết chi nhánh/loại cho vị trí và `office_location_id` trên attendance event.
- Lịch theo phòng ban là mặc định; assignment theo nhân viên là override có độ ưu tiên cao hơn. Assignment cũ được đóng khoảng hiệu lực, không hard-delete.
- Quy tắc 3 phút đi muộn, 480 phút đủ công, về sớm và OT nằm trong Backend. Web/Mobile chỉ hiển thị kết quả `workedMinutes`, `requiredWorkMinutes`, `isFullWorkday` và `overtimeMinutes`.
- Geofence được chọn theo chi nhánh hiện hành của nhân viên và khoảng cách gần nhất. Customer review CR2 dùng migration `1790985600000-geofence-radius-alignment` để đồng bộ giới hạn bán kính tối đa 100 m tại Database và DTO; ngưỡng accuracy vẫn tối đa 50 m.
- Chỉ `ADMIN` được tạo/sửa lịch, vị trí và xem `configuration_audit_logs`. Không seed tọa độ HN hoặc địa điểm ngoài văn phòng khi chưa có dữ liệu chính thức.
- Admin Web hiển thị các vị trí và vùng geofence trên bản đồ, cho phép chọn/kéo tọa độ hoặc lấy đúng một mẫu vị trí từ thiết bị. Tile URL/attribution được cấu hình bằng biến môi trường; thao tác này không bật theo dõi GPS liên tục.

### Customer alignment C4 — attendance reconciliation and period locking

- Migration `1790294400000-attendance-reconciliation` originally added Admin explanation requests and monthly attendance period state. That creation flow is superseded by the employee-initiated correction below; historical rows are retained.
- Migration `1791417600000-employee-explanations` makes Admin deadline/requester nullable and adds source, submitter, idempotent submission UUID and image upload ownership. Employee `POST /attendance/explanations/mine` derives identity from authentication, checks active ownership, locks the monthly period and creates `SUBMITTED` with immutable submit audit. A per-user/submission advisory lock plus a unique index prevents retry duplication; changing payload under that ID fails.
- PQ3 supersedes ordinary single-step Admin review: assigned Leader confirms then assigned Head decides. The post-PQ5 correction adds reasoned Admin fallback only when live routing is missing/ineligible. Admin retains routing and attendance adjustment history; adjustment values remain limited to check-in time, check-out time and day status.
- Admin or Chief Accountant can lock a reconciled month. A month with incomplete check-outs or open explanations cannot be locked. A locked month rejects new explanations and attendance adjustments.
- Only `CHIEF_ACCOUNTANT` can reopen a locked period, and the reason is mandatory. Lock and reopen actions are recorded in `configuration_audit_logs`.
- Admin Web replaces request creation with an all-date queue, now using PQ3 scoped two-step workflow; notes/rejection reasons are optional and reviews audited. Approval never mutates attendance. Legacy `REQUESTED` response remains; new Admin requests return `EMPLOYEE_EXPLANATION_REQUIRED`.
- Mobile Android offers Create explanation with date/type/content and one optional camera/gallery image. It does not sample GPS; gallery selection does not invent capture time. The serialized offline queue uses stable UUIDs, keeps unsent private images and scopes new queue records to their owner. Unknown-owner legacy responses verify the server request before upload.
- Evidence storage recognizes JPEG/PNG/WebP signatures, enforces 5 MB and ownership, denies overwriting attached evidence and limits reads to owner/Admin or PQ3 assigned reviewers with live scope. It stays local disk; object storage/backup remain deployment concerns. Migration backfills legacy ownership and refuses rollback once employee submissions exist.
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
- Admin can record a request for an employee (PQ5 removes legacy global Manager authority); an authenticated employee can list and submit only their own requests through `/leave-requests/mine`.
- Backend owns date-range validation, active-request overlap detection, PQ5 two-step review and the mandatory rejection reason. Every submission and review is written to `configuration_audit_logs`.
- Leave changes are rejected when any affected attendance month is locked. A month with a pending leave request cannot be locked, so the monthly report cannot silently finalize unresolved leave.
- Approved leave is already consumed by the daily attendance/monthly reporting projection; rejected leave is excluded.
- Mobile lists only the signed-in employee's requests and submits requests through `/leave-requests/mine`. Business rules remain authoritative in Backend rather than being duplicated in the client.
- C6 originally remained full-day/date-range only. Customer review CR6 supersedes that restriction with Admin-configurable policies and balances while keeping attachments/delegation/workflows beyond the approved PQ5 two steps outside scope.

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

## R11 — push acceptance update (2026-10-13)

Announcements registration controller passes existing CurrentSessionId to service; query binds session UUID/device/client MOBILE. Advisory FCM token lock prevents cross-account unique races. Department current effective range + branch active, publication target/content recheck; shared announcement locks serialize read/ack with withdrawal; UUID/trim/null validation. No Auth module/schema/normal Mobile payload change. Backend18 targeted tests and scoped static/isolated compile PASS. After explicit approval, dedicated FCM-only service account/key configured outside Git; OAuth credential validation and Backend watch health PASS. Android debug rebuilt/installed/attached with public Firebase options; initial verification failure triggered Flutter auto-reinstall, requiring fresh demo sign-in/notification permission. Real background/cold delivery still pending phone verification. [R11 acceptance](docs/R11_PUSH_ACCEPTANCE.md).

### Customer review CR5 — disciplinary actions

#### R10 — acceptance / collective extension (2026-10-13)

Migration `1792800000000-disciplinary-action-groups`: master target TEAM/DEPARTMENT FK + catalog usage triggers, original selected JSONB snapshot/content/dates/issue-revoke actor/time/reason, unique request UUID; personal group_id nullable FK + unique group/employee. Existing transaction helpers reused for children, no ORM in domain or new Mobile contract. Group APIs Admin-only: GET `/disciplinary-groups`, GET `/targets`, POST `/preview` read-only, POST root issue, POST `/:id/revoke`, GET `/:id/history`. Issue DTO: targetType/targetId/rosterToken/employeeIds/requestId + existing content/date fields. Group child mutation blocked on individual routes; personal history remains readable.

Issue: advisory request lock → SHARE table locks membership/assignment → target/employee/user shared locks → roster recheck → atomic master/children/inbox/audit. Revoke: master + original children FOR UPDATE, never resolve current membership. Lock timeout 5s/deadlock return 409, no replay. R3 hard-delete preserves master snapshot/others, removes owned children/notices. Large groups not load-benchmarked.

Calendar/trim/null/UUID validation hardened; SQL dates cast to YYYY-MM-DD. Linked notices cannot withdraw independently; legacy/scoped management excludes private discipline. Push tracking fixes explicit SQL status/timestamp types formerly silently failing. Web frozen form/busy/stale reload/roster popup added; app reuses existing individual notices. Backend27 targeted cases, scoped lint/noEmit/isolated compile and isolated Web build PASS; Chrome preview/exception/empty/cancel PASS; mutation UI/app/FCM not fully accepted. [R10 acceptance](docs/R10_DISCIPLINARY_ACCEPTANCE.md). No automatic R11.

#### CR5 — luồng cá nhân hiện hữu

- Migration `1791244800000-employee-disciplinary-actions` stores warning, suspension and disciplinary-action records with a strict `DRAFT -> ISSUED -> REVOKED` lifecycle and references to the generated inbox announcements.
- Only `ADMIN` can create, edit, issue or revoke. Draft fields become immutable after issue; revocation requires a reason and every mutation is recorded in `configuration_audit_logs`.
- Suspension requires a bounded effective period. Other actions may be open-ended. CR5 deliberately does not mutate payroll, attendance, employment status or authentication because those consequences require separate approved policies.
- Issue creates an important individual announcement and recipient inside the same database transaction. Push delivery runs after commit through the existing tracked FCM adapter, so provider failure never removes the decision or inbox message.
- Admin Web provides drafting, filtering, issue/revoke confirmation and immutable history. `/api/announcements/mine` exposes additive structural fields on the generated message (`source`, `disciplinaryActionType`, `disciplinaryEffectiveFrom`, `disciplinaryEffectiveTo`, `disciplinaryTitle`, `disciplinaryRevoked`) so Mobile renders a dedicated disciplinary warning card and detail banner — category, effective period and mandatory acknowledgement — instead of inferring them from title/body text. Mobile still reuses the existing inbox/read/acknowledgement flow; no duplicate disciplinary business rule exists in the client.

## R9 — Leave/balance acceptance (2026-10-12)

No schema/migration/API shape change. Leave duration chọn effective schedule trước weekday, cùng precedence với Attendance/Reporting, policy fallback từng ngày thiếu lịch; ngày nghỉ 0 theo Tech Lead, zero range rejected, không sửa requestedMinutes cũ. DTO/domain/UUID pipe/trim validation loại 500 input; advisory code lock trả policy duplicate409. Shared policy locks và employee leave-route locks tuần tự submit/adjust/initialize; month locks trước policy để tránh inversion. Bulk initialize khóa employee theo UUID trước policy/balance. Audit INITIALIZE đúng một khi tạo balance, kể cả auto-init; carry preview/initialize dùng cùng SQL remaining expression, GET không ghi và giữ initialized=false.

App cancellation guard/stale action invalidation/read-after-error; dialog TextField tự sở hữu controller để tránh dispose giữa animation. API client chỉ parse initialized đã có, app ghi dự kiến. Backend46/Mobile15 targeted PASS, Chrome đọc/empty/queue và Hot Reload kiểm tra; mutation UI/máy thật/FCM còn PARTIAL. [R9 acceptance](docs/R9_LEAVE_ACCEPTANCE.md). Không redesign Web/đổi workflow hoặc tự chuyển R10.

### Customer review CR6 — configurable leave policy and balance

- Migration `1791331200000-leave-policies-balances` adds policy, yearly balance and immutable adjustment tables, then links every leave request to a policy with duration and cancellation metadata.
- The four legacy codes are migrated as active policies with balance tracking disabled. Admin must explicitly enable tracking and initialize a year, preventing historical data from silently consuming newly introduced entitlements.
- Policy configuration covers annual entitlement, minutes per day, bounded carry-over, minimum notice, half-day/hour support and approved-request cancellation. The code is immutable after creation so historical references remain stable.
- A submitted request reserves balance. Approval rechecks it under a row lock; rejection or cancellation releases it because usage is derived from current request state. Cross-year requests are rejected only for balance-tracked policies.
- Full-day duration uses the employee override or department schedule when available and falls back to policy day minutes only when no scheduled minutes resolve. Partial-day requests must stay on one date.
- Admin can initialize yearly balances and make signed adjustments with a mandatory reason. Policy, balance and request transitions are recorded in `configuration_audit_logs`.
- Admin Web exposes policy/balance operation; PQ5 replaces one-step review with its assigned workflow workspace. Mobile shows the signed-in employee's balances, policy-aware request options and allowed cancellation. Reporting labels approved partial leave as `PARTIAL_LEAVE` instead of treating the whole day as leave.
- CR6 does not implement attachments, tenure-based automatic accrual, cash conversion or payroll effects. PQ5 adds only the approved two-step leave workflow.

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
- Mật khẩu tạm và Admin bootstrap dùng chung policy 6–128 ký tự, không ràng buộc loại ký tự theo điều chỉnh của Tech Lead ngày 2026-10-07. Domain `password-policy` là nguồn giới hạn của DTO tạo tài khoản/đăng nhập. Bcrypt một chiều, rate limit và policy phiên giữ nguyên; không lưu plaintext hoặc mật khẩu có thể giải mã để Admin xem. Không cần migration vì không đổi schema/hash hiện hữu.
- Admin có trang vận hành riêng để xem migration, release, uptime, lỗi email/push, workflow tồn và audit tập trung; endpoint không trả secret.
- Báo cáo tháng tính giờ làm, giờ chuẩn và OT tại Backend, dùng cùng blocker cho UI/khóa kỳ và xuất Excel hai sheet.
- Production vẫn là modular monolith một VPS. Preflight, backup trước deploy, health-gated startup, checksum và restore drill biệt lập nằm trong `scripts/prod/` và `DEPLOYMENT.md`.

## Admin PIN retirement and attendance hardening — 2026-10-09

- Supersedes the PIN/handover implementation of 2026-10-07 at Tech Lead/customer request. Remove PIN guards/provider, security workspace, public recovery and handover controllers. JWT/live-session/RBAC, login/refresh rate limits, audits and password hashing remain. Keep CORS before request middleware so rate-limit errors are readable.
- Applied migration `1791936000000-admin-security` remains immutable. Forward migration `1792108800000-retire-admin-pin` clears PIN hashes, expires unlocks, revokes unused recovery codes and cancels pending invitations, without deleting audit/history or revoking normal sessions. Automatic down refuses to resurrect retired secrets. Deploy migration and Backend before Web; do not roll back to PIN runtime without an explicit migration/new credentials.
- Pure `employees/domain/employee-directory` retains the basic-field whitelist. `/employees/:id` and history remain ADMIN-only without PIN. Global Admin audit snapshots are available again through the existing ADMIN-only endpoint. PIN-free self-service ownership handover is `NOT_IMPLEMENTED`.
- Office check-and-save now runs in one transaction under an employee advisory lock; business-trip attendance writers take the same lock. Existing trip rules and repeated office in/out behavior unchanged. Mandatory GPS coordinates are numeric/finite/in-range in DTO and service; geofence Domain rejects non-finite centers/points. No new fraud policy, GPS tracking, attestation dependency or automatic penalties.
- Regression sources: `admin-access-without-pin.spec.ts`, `attendance-event-security.spec.ts`; no automatic test suite execution per Tech Lead instruction. Scope/limits and rollout: `docs/ADMIN_SECURITY.md`, `docs/ATTENDANCE_SECURITY_REVIEW.md`.

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

## PQ5 — architecture and rollout

- Migration 1791763200000-leave-two-step-workflow adds leave_approval_routes, nullable stage/snapshot/actor columns and monotonic version. Pending legacy waits routing; final history unchanged. Down refuses to erase configured routes/decisions.
- Leave Domain stays ORM-free. Application workflow checks current grants/distinct actors; serializes per employee via advisory lock, locks affected periods/requests and invokes existing balance validation inside final approval transaction. Confirmation remains SUBMITTED. Period lock now rechecks pending leave under its row lock to avoid concurrent submission being silently finalized.
- Leave defaults never read explanation defaults on submission; copy fills Web form and requires explicit Admin save. Defaults update unfinished pending steps, per-item reroute leaves defaults alone; completed confirmer/team/time immutable. Audit/inbox atomic, tracked push post-commit.
- Dedicated organization/managed read-only adapter derives eligible employees from grants/current organization/team memberships. Reporting reuses monthly projection with an additive employee allow-list before aggregation. Global guards/export/period permissions unchanged. Omit outside participants, GPS/evidence, private notice body and global totals.
- Web /dashboard/leave-workflow and /dashboard/managed-modules; Mobile scoped leave queue/detail, own routing detail and read-only operational screen. Existing five tabs, user-edited leave form, session/GPS flow unchanged. No generic workflow engine/dependencies.
- Controlled dev cleanup exposed optional DTO undefined overriding persisted policy values on partial PATCH. Filter undefined fields to preserve existing policy settings; no policy rule changed. Old unguarded LeaveService list/history methods replaced by authorized workflow reads.

## Điều chỉnh sau PQ5 — Admin dự phòng và workspace UX

Tech Lead duyệt cho cả nghỉ phép/giải trình: Admin chỉ quyết định thay đơn SUBMITTED khi tuyến thiếu hoặc không còn hợp lệ. Backend trả canAdminReview riêng và kiểm tra lại trong transaction; không mở bypass tuyến hợp lệ, tự duyệt đơn mình/người gửi/người đã xác nhận, REQUESTED chưa phản hồi, terminal hoặc kỳ khóa. Review cần expectedVersion + adminOverrideReason ít nhất 5 ký tự. Phép từ chối vẫn cần reviewNote hợp lệ, duyệt vẫn kiểm tra quỹ. Xác nhận đã hoàn tất giữ nguyên; không tạo xác nhận Leader giả.

Migration 1791849600000-admin-fallback-review thêm decision_method (ROUTED/ADMIN_FALLBACK, nullable cho lịch sử) và admin_override_reason vào hai bảng. Audit ADMIN_FALLBACK_REVIEW và inbox cùng transaction; push tracked sau commit. Thông báo quyết định, kể cả Head theo tuyến, ghi tên người xử lý thực tế. App hiện tại nhận qua Hộp thư và hiển thị reviewedByName; không cần đổi form/đóng gói APK trong task này. Cập nhật migration + Backend trước Web.

Hai workspace Admin tách Hàng đợi đơn/Cấu hình tuyến; thẻ tóm tắt từ dữ liệu thật, chip lọc ngang, tìm kiếm/phân trang và drawer chi tiết/timeline/audit/nút xử lý. Form lưu nằm dưới các trường thay vì bị kéo cao; CSS giới hạn trong workspace, giữ brand tím/trắng. Menu phân biệt Chính sách & quỹ phép và Xử lý nghỉ phép. Không redesign module khác hay mở thêm ERP. Bàn giao/kiểm tra tại docs/PERMISSIONS_PLAN.md.

## Android push readiness — 2026-10-07

Permission onboarding dùng màn Flutter riêng, cờ `permission_setup_v1_seen` trong secure storage theo thiết bị và nút mở lại từ Home. Android MethodChannel hiện có bổ sung request POST_NOTIFICATIONS theo thao tác chủ động, trạng thái permission/can-request và fallback settings; không phụ thuộc Firebase để xin quyền. Push initialization đổi sang getNotificationSettings, token refresh chỉ đăng ký khi đã cấp quyền. Không đổi Backend/API/schema hay policy phiên. Bật Photo Picker qua hai package implementation/interface đã có trong lockfile, khai báo direct dependency cùng phiên bản (không thêm framework hoặc nâng version). Test source onboarding được bổ sung nhưng không chạy suite theo chỉ thị Tech Lead.

Native Android MethodChannel tạo kênh announcements có importance HIGH, icon đơn sắc và hiển thị foreground notification; FCM xử lý notification payload khi background. Tap chỉ là hint tới inbox đã xác thực; app kiểm tra recipientUserId và tải lại nội dung/quyền từ Backend. App báo riêng cấu hình Firebase, quyền/kênh, token, đăng ký và Backend bật push; có retry/settings/local notification check. Bootstrap/login không chờ push hoàn tất; đăng ký thử lại khi resume/mạng phục hồi. Logout/phiên kết thúc xóa thông báo đang hiển thị và hint điều hướng.

Sender chỉ dùng thiết bị có phiên MOBILE matching user/device còn hiệu lực và user/employee active; registration khóa user để tuần tự với thay phiên. Không đổi policy phiên hoặc schema. Payload giới hạn preview Unicode để không vượt 4 KB; tag theo announcementId giảm notification trùng khi retry; nội dung inbox nguyên vẹn. SENT chỉ là provider acceptance, không phải xác nhận máy hiện/nhân viên đọc. Firebase credential và quyền thiết bị vẫn là prerequisites, không seed/commit secret. Nhắc check-out NOT_IMPLEMENTED chờ chốt policy. Runbook/ma trận nghiệm thu tại docs/PUSH_ACCEPTANCE.md.

## R7 — Giải trình và điều chỉnh công (2026-10-10)

Giữ nguyên workflow hai bước, Admin dự phòng và API contract. `createAdjustment` kiểm tra Admin/lý do trim/ngày lịch hợp lệ; trong một transaction tạo OPEN nếu chưa có, khóa hàng tháng FOR UPDATE, đọc oldValue và INSERT audit điều chỉnh. Cùng khóa với chốt/mở kỳ nên writer không lọt qua race check-then-save; các điều chỉnh đồng thời tạo chuỗi old/new tuần tự. `created_at=clock_timestamp()` tại INSERT sau khi lấy khóa, không dùng thời điểm bắt đầu transaction trước lúc chờ khóa để chọn sai giá trị mới nhất. Truy vấn oldValue dùng EntityManager cùng transaction. Không sửa attendance_events, không tự điều chỉnh khi duyệt giải trình, không cần migration vì dùng schema/lock hiện hữu.

Gửi/phản hồi giải trình kiểm tra ownership ảnh bằng EntityManager đang giữ khóa upload; không checkout thêm connection từ pool trong transaction. Nghiệm thu opt-in DB/API biệt lập, rollback lỗi audit, inbox/quyết định trùng, route version, live grant, ảnh riêng tư/bất biến và khóa kỳ. Kết quả cùng phần chưa chạy trên UI/máy thật tại [R7 acceptance](docs/R7_EXPLANATIONS_ACCEPTANCE.md). Không đổi Web/App/native/permission/schema hoặc tự chuyển R8.

## R8 — Trip evidence ownership và nghiệm thu (2026-10-12)

Migration `1792713600000-business-trip-evidence-ownership` thêm ledger upload công tác; backfill chỉ owner từ link local không mơ hồ, giữ link/giờ lịch sử; ambiguous NULL chỉ Admin, down chặn ledger đã dùng. Rollout DB → Backend → app; đã backup/apply development. Upload khóa UUID/owner, exclusive file create, bytes/MIME/5 MB, immutable; cùng bytes retry được. Complete kiểm tra owner bằng cùng EntityManager. Employee deletion thêm ledger vào impact/locks/fingerprint/delete/queue cleanup để không hỏng R3 FK hoặc bỏ sót ảnh chưa linked.

Giao revalidate member active, inbox cá nhân cùng audit/transaction, sender tracked sau commit. Nháp không lộ mine, PATCH undefined customerId giữ link, DTO null/blank/date/GPS string chặt theo schema. App recapture UUID mới/reload khi lỗi/ẩn complete cancelled. Start/complete chỉ ghi tiến độ, không attendance_events/cộng công. Backend42/Mobile7 targeted PASS, Web đọc/filter/history PASS; camera/GPS/push máy thật chưa đủ nghiệm thu. [R8 acceptance](docs/R8_BUSINESS_TRIPS_ACCEPTANCE.md). Không tự triển khai R9/production.

## R6 — Attendance device proof, abuse và transaction

Migration 1792540800000 tạo attendance_devices (unique partial ACTIVE/PENDING per user), attendance_device_challenges và attendance_abuse_budgets. Không backfill approval; rollback từ chối khi đã có device rows. AttendanceDeviceProof giữ infrastructure crypto/DB ngoài Domain: EC P-256 SPKI, Admin quyết định có lý do/audit, challenge 120 giây gồm nonce/account/session/binding/input hash và SHA-256 ảnh đã upload; consume trong transaction ghi công. Reader lịch/geofence/ảnh dùng cùng EntityManager để tránh pool starvation khi advisory-lock contention. Live user/MOBILE session row locks bảo vệ điểm ghi trước thu hồi phiên; capture→upload ordering đồng nhất tránh deadlock ảnh.

Điều chỉnh tự gắn thiết bị đầu tiên (Tech Lead duyệt 2026-10-10): register giữ user FOR UPDATE, kiểm tra phiên MOBILE và toàn bộ lịch sử attendance_devices dưới cùng transaction. Chưa có lịch sử → INSERT ACTIVE, decided_at theo server, decided_by NULL, reason tự gắn, audit AUTO_BIND_FIRST_DEVICE với actor nhân viên. Có lịch sử REVOKED → INSERT PENDING; legacy PENDING giữ nguyên, không tự promotion. Các partial indexes, chữ ký/sinh trắc và Admin APPROVE/REVOKE giữ nguyên. Không đổi schema/API response, không cần migration mới và không backfill/xóa dữ liệu cũ. Cập nhật Backend cùng lời dẫn Web/App; first bind vẫn không chứng minh danh tính người đăng ký hay tính nguyên bản của app.

Tiếp nối UX cùng ngày: Mobile bỏ popup Đăng ký/xem mã khóa, giữ IconButton Tạo lại khóa có xác nhận. `_record` vẫn đăng ký tự động trước lấy GPS/camera; recovery retry đăng ký public key hiện tại, không reset key hoặc replay attendance. Thông báo PENDING giữ fingerprint để đối chiếu. Chỉ attendance home/widget regressions và tài liệu thay đổi; Backend/Web/native/schema giữ nguyên trong lần gọn UI này.

AttendanceAbuseGuard sau JWT/role, trước pipe/interceptor/storage; atomic budget PostgreSQL cố định từng phút, capture10/upload20/event60, 429 + Retry-After, app không tự replay. Record DTO yêu cầu accuracy/mock, ký payload và ảnh; check-in kiểm tra sample bound trong capture. Mock/low accuracy block cả vào/ra; office outside chỉ block vào. Không đổi phép/OT/period policy trong R6.

Android native MethodChannel dùng per-use BiometricPrompt CryptoObject/AndroidKeyStore, strong biometric API28+, không PIN fallback, invalidation theo biometric enrollment; private key không vào Dart. Chưa tích hợp attestation/root/repacked-app verdict, chữ ký không phải chứng nhận GPS hay danh tính. iOS proof NOT_IMPLEMENTED. Web chỉ thêm quản lý khóa trên Access; app đăng ký/hiển thị fingerprint/khôi phục key có Admin. Main manifest release tắt cleartext/backup, debug/profile override cho local ADB. Rollout DB→API→Web→App, APK cũ bị chặn; [R6 acceptance và rủi ro](docs/R6_ATTENDANCE_ACCEPTANCE.md).
