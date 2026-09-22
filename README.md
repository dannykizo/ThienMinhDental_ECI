# Thiên Minh Dental Workforce

Hệ thống chấm công, công tác và thông báo nội bộ cho Văn phòng miền Nam của Thiên Minh Dental tại TP.HCM.

Sản phẩm gồm:

- `frontend/`: Admin Web dành cho quản trị viên và người phụ trách chấm công.
- `backend/`: API dạng modular monolith, chứa toàn bộ nghiệp vụ và dữ liệu.
- `mobile/`: Flutter App dành cho nhân viên văn phòng và nhân viên kỹ thuật.

## Trạng thái

Các milestone **W1–W9 của Web-first MVP** đã được triển khai cho Backend API và Admin Web: nền tảng/auth, nhân viên, lịch làm việc, geofence, chấm công, công tác, nghỉ phép, điều chỉnh công, thông báo, báo cáo tháng và KPI Lite. Mobile App Android đã có vertical slice đầu tiên cho đăng nhập, khôi phục phiên, xem trạng thái chấm công trong ngày và check-in/check-out văn phòng bằng một mẫu GPS tại thời điểm người dùng chủ động thao tác. Push notification, công tác, nghỉ phép, thông báo và upload ảnh trên Mobile chưa được triển khai.

Customer alignment C1 đã bổ sung cơ cấu HCM/HN, một nhân viên thuộc nhiều phòng ban, phân công chính có lịch sử, vai trò Kế toán trưởng và Quản lý khu vực theo phạm vi chi nhánh. Admin Web quản lý các trường này tại module Nhân viên.

Customer alignment C2 đã bổ sung phiên đăng nhập 30 ngày, một tài khoản chỉ hoạt động trên một thiết bị, lịch sử đăng nhập/đăng xuất, Admin thu hồi thiết bị và cảnh báo email đăng nhập qua SMTP. Cần cấu hình `SMTP_*` và `ADMIN_LOGIN_ALERT_EMAILS` để gửi email thật; nếu chưa cấu hình, Admin Web hiển thị rõ trạng thái chưa gửi.

## Đọc trước khi code

1. `AGENTS.md` — quyền hạn và ranh giới của Codex, OpenCode, Antigravity.
2. `PROJECT.md` — mục tiêu, phạm vi MVP và các điều không làm.
3. `FLOWS.md` — luồng nghiệp vụ và state machine.
4. `IMPLEMENTATION.md` — kiến trúc, thứ tự triển khai và Definition of Done.
5. `CLAUDE.md` — quy trình dùng GitNexus và kỹ năng khám phá code.

Nếu tài liệu mâu thuẫn, quyết định mới nhất của Nguyễn Thành Nam (Tech Lead/Scope Owner) có ưu tiên cao nhất; sau đó cập nhật lại tài liệu canonical trong cùng task.

## Yêu cầu môi trường

- Node.js 22+
- pnpm 11+
- Docker Desktop hoặc PostgreSQL 16+
- Flutter SDK 3.x khi bắt đầu phát triển Mobile App

## Khởi động nhanh

Trên Windows, sau khi đã thiết lập môi trường lần đầu, double-click [`START.cmd`](START.cmd) ở thư mục gốc để chạy demo. Launcher sẽ bật PostgreSQL (và Docker Desktop nếu cần), Backend API, Admin Web, đợi hai dịch vụ sẵn sàng rồi mở trang đăng nhập. Nếu dịch vụ đã chạy, launcher sẽ dùng lại thay vì mở thêm bản trùng.

Backend API và Admin Web chạy ở development mode (watch/Hot Reload), nên khi cập nhật code giao diện, thay đổi được áp dụng ngay mà không cần khởi động lại. Hai dịch vụ chạy ẩn ở nền nên có thể đóng cửa sổ terminal mà demo vẫn hoạt động; log được ghi vào thư mục `logs/`.

Double-click [`STOP.cmd`](STOP.cmd) ở thư mục gốc để dừng Backend API, Admin Web và PostgreSQL.

Thiết lập lần đầu hoặc chạy thủ công:

```bash
pnpm install
pnpm infra:up
cp backend/.env.example backend/.env
pnpm --dir backend migration:run
pnpm --dir backend seed:dev
pnpm dev:api
```

Mở terminal thứ hai:

```bash
pnpm dev:web
```

API health check: `http://localhost:3001/api/health`  
Admin Web: `http://localhost:3000`

PostgreSQL của project mặc định bind tại `localhost:5433` để tránh xung đột với PostgreSQL khác trên máy; có thể đổi bằng biến `POSTGRES_PORT` khi chạy Compose.

### Tài khoản demo development

Chỉ dùng trong development, được tạo bởi `pnpm --dir backend seed:dev`:

- Admin Web: tài khoản `admintm` / mật khẩu `admintm2512` (`ADMIN`).
- Mobile nhân viên: `employee@demo.thienminh.local` / `EmployeeDemo@2026` (`EMPLOYEE`).

Seed sẽ từ chối chạy ngoài `NODE_ENV=development`. Credential demo không được dùng cho staging hoặc production.

### API chính

- `POST /api/auth/login` — đăng nhập, đặt JWT trong cookie HttpOnly và trả access token cho mobile Bearer authentication.
- `POST /api/auth/logout` — xóa cookie phiên.
- `GET /api/auth/me` — thông tin người dùng hiện tại, yêu cầu JWT.
- `GET /api/auth/admin-session` — phiên hợp lệ cho Admin Web, yêu cầu role `ADMIN` hoặc `MANAGER`.
- `GET /api/auth/admin/sessions` — lịch sử đăng nhập/đăng xuất, chỉ `ADMIN`.
- `POST /api/auth/admin/sessions/:sessionId/revoke` — thu hồi một thiết bị, chỉ `ADMIN`.
- `/api/employees`, `/api/work-schedules`, `/api/office-locations` — danh mục và cấu hình vận hành.
- `GET /api/attendance/me/today` — trạng thái chấm công hôm nay của nhân viên hiện tại.
- `/api/attendance` — sự kiện check-in/out, bảng ngày và audit điều chỉnh.
- `/api/business-trips`, `/api/leave-requests`, `/api/announcements` — công tác, nghỉ phép và truyền thông nội bộ.
- `/api/reporting`, `/api/kpi` — dashboard, đối soát tháng, Excel và KPI Lite không chấm điểm.

Migration `1726444800000-web-mvp` bổ sung schema nghiệp vụ W2–W9; migration `1790035200000-customer-organization-rbac` bổ sung cơ cấu đa chi nhánh và RBAC; migration `1790121600000-auth-sessions` bổ sung phiên và lịch sử thiết bị. Mọi migration chạy với `synchronize=false`.

Android platform shell đã được tạo trong `mobile/`. Xem hướng dẫn chạy USB/Wi-Fi debugging và vị trí APK tại `mobile/README.md`.

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3001/api
```

## Kiểm tra chất lượng

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Theo `AGENTS.md` và Definition of Done, test tự động là bắt buộc cho business rule/authorization quan trọng. Trong quá trình phát triển nên ưu tiên kiểm tra tập trung và chỉ chạy full suite ở quality gate hoặc khi Tech Lead yêu cầu, tránh lặp lại không cần thiết.

## GitNexus

Chỉ chạy sau khi repository có code đủ ý nghĩa. Quy trình và lệnh an toàn nằm trong `CLAUDE.md`. Thư mục `.gitnexus/` là index cục bộ và không được commit.
