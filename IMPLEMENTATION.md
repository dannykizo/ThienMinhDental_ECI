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
- Thông báo resolve audience thành từng recipient và có API read receipt. FCM/push chưa cấu hình vì Mobile nằm ngoài Web-first.
- Mobile attendance vertical slice dùng `geolocator` chỉ tại sự kiện check-in/check-out; API `GET /attendance/me/today` là nguồn trạng thái trong ngày. Không có background location tracking.
- Leave balance và cutoff chưa có policy được duyệt nên không được tự suy diễn trong code.

### Customer alignment C1 — organization and RBAC

- Migration `1790035200000-customer-organization-rbac` bổ sung `branches`, `employee_organization_assignments` và `user_branch_scopes`.
- Giữ `employees.department_id/position_id` làm projection tương thích cho phân công chính; lịch sử và quan hệ nhiều phòng ban nằm trong bảng assignment mới.
- Role nghiệp vụ gồm `ADMIN`, `CHIEF_ACCOUNTANT`, `AREA_MANAGER`, `EMPLOYEE`; `MANAGER` được giữ tạm để tương thích dữ liệu cũ.
- Admin có quyền ghi cấu hình nhân sự. Kế toán trưởng đọc dữ liệu nhân viên/chấm công và báo cáo. Quản lý khu vực chỉ được cấp endpoint đã thực thi scope chi nhánh ở Backend.
- Khóa nhân viên đồng thời thu hồi quyền đăng nhập; không hard-delete hồ sơ hay mã nhân viên.

### Customer alignment C2 — session, device and login alert

- Migration `1790121600000-auth-sessions` lưu vòng đời phiên, thiết bị, client Web/Mobile, thời điểm đăng nhập/thu hồi và trạng thái cảnh báo email.
- JWT mang `sid` và chỉ hợp lệ khi phiên tương ứng còn hoạt động. `AUTH_SESSION_DAYS` mặc định là 30; cookie Web dùng cùng thời điểm hết hạn và Mobile lưu token trong secure storage.
- Mỗi tài khoản chỉ có một phiên hoạt động. Repository thay thế phiên trong transaction và database có partial unique index để bảo vệ invariant.
- Email cảnh báo dùng SMTP qua port `LoginAlertSender`; secret chỉ đến từ environment. Thiếu cấu hình được lưu là `SKIPPED`, lỗi giao nhận là `FAILED`, không chặn nhân viên đăng nhập.
- Admin Web có trang lịch sử phiên và quyền thu hồi; Mobile gọi logout Backend trước khi xóa token cục bộ.

### Customer alignment C3 — schedule, work duration and geofence

- Migration `1790208000000-schedule-location-alignment` bổ sung `department_schedules`, lịch sử cấu hình, liên kết chi nhánh/loại cho vị trí và `office_location_id` trên attendance event.
- Lịch theo phòng ban là mặc định; assignment theo nhân viên là override có độ ưu tiên cao hơn. Assignment cũ được đóng khoảng hiệu lực, không hard-delete.
- Quy tắc 3 phút đi muộn, 480 phút đủ công, về sớm và OT nằm trong Backend. Web/Mobile chỉ hiển thị kết quả `workedMinutes`, `requiredWorkMinutes`, `isFullWorkday` và `overtimeMinutes`.
- Geofence được chọn theo chi nhánh hiện hành của nhân viên và khoảng cách gần nhất. Database cùng DTO cùng giới hạn bán kính/ngưỡng accuracy tối đa 50 m.
- Chỉ `ADMIN` được tạo/sửa lịch, vị trí và xem `configuration_audit_logs`. Không seed tọa độ HN hoặc địa điểm ngoài văn phòng khi chưa có dữ liệu chính thức.

### Customer alignment C4 — attendance reconciliation and period locking

- Migration `1790294400000-attendance-reconciliation` adds mandatory explanation requests and monthly attendance period state.
- Admin creates an explanation request with issue type, required response deadline and note. Employees respond through the authenticated API; GPS-risk responses require an image reference, capture time and coordinates as one complete evidence set.
- Admin alone can review explanations and read attendance adjustment history. Adjustment values remain limited to check-in time, check-out time and day status until the customer defines a broader policy.
- Admin or Chief Accountant can lock a reconciled month. A month with incomplete check-outs or open explanations cannot be locked. A locked month rejects new explanations and attendance adjustments.
- Only `CHIEF_ACCOUNTANT` can reopen a locked period, and the reason is mandatory. Lock and reopen actions are recorded in `configuration_audit_logs`.
- Admin Web implements the C4 operational screens. Mobile presentation for explanation/photo capture remains out of this Web-first slice.

## Repository layout

```text
backend/       NestJS API, domain and data access
frontend/      Next.js Admin Web
mobile/        Flutter employee app
scripts/dev/   Local bootstrap helpers
```

Không tạo microservice, `architecture/` tree hoặc shared framework mới nếu chưa có nhu cầu được duyệt. API contract sẽ được công bố bằng OpenAPI từ backend; client không sao chép business rule.

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
- [ ] Establish CI after first install succeeds.

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
- Advanced Excel templates and organization-specific reconciliation rules.
- Push notification reliability and delivery tracking.
- [x] Multi-branch organization assignments and branch-scoped employee directory.

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
