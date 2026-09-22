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

### Phase 3 — only after new approval

- Multi-branch support, advanced RBAC, payroll/API integration, advanced analytics.

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
