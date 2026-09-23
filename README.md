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

Customer alignment C3 đã bổ sung lịch mặc định theo chi nhánh/phòng ban, ngoại lệ lịch theo nhân viên, quy tắc đủ công 8 giờ/đi muộn sau 3 phút/về sớm/OT, hai loại vị trí văn phòng và địa điểm bên ngoài, giới hạn GPS 50 m và lịch sử cấu hình chỉ Admin xem. Tọa độ HN và địa điểm bên ngoài không được seed giả; Admin nhập khi có thông tin chính thức.

Customer alignment C4 adds mandatory attendance explanations, complete GPS evidence metadata, Admin-only adjustment audit, monthly locking and Chief Accountant-only reopening. Mobile explanation/photo presentation remains pending; the authenticated employee API is available for the later Mobile slice.

Customer alignment C5 hoàn thiện vận hành phiếu công tác: người phụ trách, chỉnh sửa phiếu nháp, giao/hủy có lý do, trạng thái riêng từng thành viên, GPS lúc bắt đầu/kết thúc, ảnh bằng chứng theo cấu hình và audit. Mobile UI/upload file thật chưa triển khai; API nhân viên đã sẵn sàng cho bước Mobile tiếp theo.

Customer alignment C6 hoàn thiện đơn nghỉ phép Web-first: ghi nhận người gửi, API đơn của nhân viên hiện tại, kiểm tra trùng ngày/kỳ công đã khóa, duyệt một cấp, lý do từ chối bắt buộc, audit và chặn khóa tháng khi còn đơn chờ. Mobile UI và các chính sách W30–W35 chưa được khách hàng chốt vẫn để ngoài phạm vi.

Customer alignment C7 hoàn thiện thông báo nội bộ Web-first: chỉ Admin quản trị vòng đời nháp/xuất bản/thu hồi; đối tượng mới theo cá nhân hoặc phòng ban; tin quan trọng có xác nhận riêng; Admin và Trưởng phòng theo dõi đúng phạm vi người chưa đọc/chưa xác nhận. Mobile UI/FCM và các tùy chọn W39 chưa rõ vẫn để ngoài phạm vi.

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
- `/api/attendance` — sự kiện check-in/out, bảng ngày, giải trình bắt buộc và audit điều chỉnh.
- `/api/business-trips`, `/api/leave-requests`, `/api/announcements` — công tác, nghỉ phép và truyền thông nội bộ. Công tác dùng endpoint riêng `mine`, `start`, `complete`; nghỉ phép dùng `mine`; thông báo dùng `mine`, `acknowledge`, `managed` và danh sách người nhận theo quyền.
- `/api/reporting`, `/api/kpi` — dashboard, đối soát tháng, Excel và KPI Lite không chấm điểm.

Migration `1726444800000-web-mvp` bổ sung schema nghiệp vụ W2–W9; migration `1790035200000-customer-organization-rbac` bổ sung cơ cấu đa chi nhánh và RBAC; migration `1790121600000-auth-sessions` bổ sung phiên và lịch sử thiết bị; migration `1790208000000-schedule-location-alignment` bổ sung lịch theo phòng ban, giới hạn vị trí và audit cấu hình; migration `1790294400000-attendance-reconciliation` bổ sung giải trình và khóa kỳ công; migration `1790380800000-business-trip-operations` bổ sung vận hành công tác theo từng thành viên; migration `1790467200000-leave-operations` bổ sung vận hành đơn nghỉ; migration `1790553600000-announcement-alignment` bổ sung đối tượng cá nhân, xác nhận tin quan trọng và thu hồi thông báo. Mọi migration chạy với `synchronize=false`.

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
