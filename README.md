# Thiên Minh Dental Workforce

Hệ thống chấm công, công tác và thông báo nội bộ cho Văn phòng miền Nam của Thiên Minh Dental tại TP.HCM.

Sản phẩm gồm:

- `frontend/`: Admin Web dành cho quản trị viên và người phụ trách chấm công.
- `backend/`: API dạng modular monolith, chứa toàn bộ nghiệp vụ và dữ liệu.
- `mobile/`: Flutter App dành cho nhân viên văn phòng và nhân viên kỹ thuật.

## Trạng thái

Các milestone **W1–W9 của Web-first MVP** đã được triển khai cho Backend API và Admin Web: nền tảng/auth, nhân viên, lịch làm việc, geofence, chấm công, công tác, nghỉ phép, điều chỉnh công, thông báo, báo cáo tháng và KPI Lite. Mobile App Android đã có đăng nhập/khôi phục phiên, chấm công văn phòng, giải trình có ảnh/hàng đợi mạng yếu, phiếu công tác với GPS đầu-cuối cùng ảnh hiện trường, đơn nghỉ phép và hộp thư thông báo có trạng thái đọc/xác nhận. Giai đoạn hoàn thiện Mobile đã bổ sung branded startup, form đăng nhập không điền sẵn credential, validation/autofill, theme và điều hướng đồng nhất. Mobile CR7 phân biệt mất mạng với Backend tạm ngắt, giữ phiên cho lỗi có thể thử lại, xử lý rõ phiên bị thu hồi và hiển thị version/build lấy từ package metadata. Mobile CR8 đồng bộ ngôn ngữ thiết kế với Admin Web và chuẩn hóa trạng thái loading/error/empty mà không đưa chức năng quản trị sang app; APK debug đã được kiểm tra trên thiết bị thật. Luồng FCM đã được tích hợp nhưng cần Firebase project và credential deployment để nhận push thật.

Mobile UX1 đưa ngày/trạng thái chấm công Backend và thao tác hôm nay lên gần đầu Trang chủ, bổ sung bốn lối tắt tới các tab Công tác/Giải trình/Nghỉ phép/Hộp thư hiện có, thu gọn trợ giúp quyền riêng tư và giữ version/build ở cuối trang. Không thêm request tổng hợp, GPS khi mở trang, bộ đếm giờ trực tiếp hoặc giờ kết thúc ca dự kiến. Kế hoạch và log tiếp quản nằm tại [`docs/MOBILE_UX_PLAN.md`](docs/MOBILE_UX_PLAN.md); UX2–UX4 chưa triển khai.

Customer alignment C1 đã bổ sung cơ cấu HCM/HN, một nhân viên thuộc nhiều phòng ban, phân công chính có lịch sử, vai trò Kế toán trưởng và Quản lý khu vực theo phạm vi chi nhánh. Admin Web quản lý các trường này tại module Nhân viên.

Customer review CR1 đã hoàn thiện vòng đời nhân viên trên Admin Web: sửa hồ sơ và phân công tổ chức, ghi nhận ngừng làm việc có ngày/lý do, tự khóa tài khoản và thu hồi phiên, khôi phục có audit, đồng thời xem lịch sử thay đổi mà không xóa dữ liệu nghiệp vụ. Mobile phản ứng với phiên bị thu hồi bằng cách xóa token an toàn, quay về đăng nhập và hiển thị nguyên nhân vận hành; mất kết nối tạm thời không còn làm mất phiên đã lưu.

Customer alignment C2 đã bổ sung phiên đăng nhập xoay vòng, một tài khoản chỉ hoạt động trên một thiết bị, lịch sử đăng nhập/đăng xuất, Admin thu hồi thiết bị và cảnh báo email đăng nhập qua SMTP. Access token sống 15 phút; Admin Web duy trì tối đa 24 giờ với timeout không hoạt động 30 phút, còn App nhân viên duy trì đăng nhập tối đa 30 ngày bằng refresh token lưu trong secure storage. Cần cấu hình `SMTP_*` và `ADMIN_LOGIN_ALERT_EMAILS` để gửi email thật; nếu chưa cấu hình, Admin Web hiển thị rõ trạng thái chưa gửi.

Customer alignment C3 đã bổ sung lịch mặc định theo chi nhánh/phòng ban, ngoại lệ lịch theo nhân viên, quy tắc đủ công 8 giờ/đi muộn sau 3 phút/về sớm/OT, hai loại vị trí văn phòng và địa điểm bên ngoài, ngưỡng sai số GPS tối đa 50 m và lịch sử cấu hình chỉ Admin xem. Customer review CR2 nâng bán kính geofence tối đa lên 100 m, bổ sung bản đồ tương tác và thao tác lấy một mẫu tọa độ thiết bị cho Admin. Mobile hiển thị kết quả đối chiếu do Backend trả về gồm vị trí khớp, khoảng cách, bán kính và accuracy mà không tự tính rule hoặc lộ tọa độ chi tiết. Tọa độ HN và địa điểm bên ngoài không được seed giả; Admin nhập, chọn trên bản đồ hoặc lấy tại thiết bị khi có thông tin chính thức.

Customer alignment C4 gồm giải trình bắt buộc, metadata ảnh/GPS đầy đủ, audit điều chỉnh chỉ Admin, khóa kỳ và quyền mở lại của Kế toán trưởng. Mobile đã có danh sách yêu cầu, phản hồi, chụp/upload ảnh và hàng đợi offline; Admin Web mở được ảnh bằng chứng qua endpoint có xác thực.

Customer alignment C5 hoàn thiện vận hành phiếu công tác: người phụ trách, chỉnh sửa phiếu nháp, giao/hủy có lý do, trạng thái riêng từng thành viên, GPS lúc bắt đầu/kết thúc, ảnh bằng chứng theo cấu hình và audit. Customer review CR3 bổ sung mã phiếu tự sinh, danh bạ khách hàng và lọc nhân sự cho Admin; Mobile hiển thị mã Backend cấp, khách hàng/địa chỉ/liên hệ và vai trò người phụ trách trong từng phân công. Mobile bắt đầu/hoàn tất bằng một mẫu GPS, ghi chú và upload ảnh thật; Admin Web mở được ảnh bằng chứng.

Customer review CR3 bổ sung mã phiếu tự sinh `CT-YYYYMM-NNNN` tại Backend, bộ lọc người phụ trách/thành viên theo phòng ban và danh bạ khách hàng/phòng khám có tìm kiếm, sửa, ngừng sử dụng/khôi phục. Khách hàng đã phát sinh phiếu không bị xóa khỏi lịch sử.

Customer alignment C6 hoàn thiện đơn nghỉ phép trên Admin Web, Backend và Mobile: ghi nhận người gửi, nhân viên xem/tạo đơn của chính mình, kiểm tra trùng ngày/kỳ công đã khóa, duyệt một cấp, lý do từ chối bắt buộc, audit và chặn khóa tháng khi còn đơn chờ. Các chính sách W30–W35 chưa được khách hàng chốt vẫn để ngoài phạm vi.

Customer alignment C7 hoàn thiện thông báo nội bộ trên Web, Backend và Mobile: chỉ Admin quản trị vòng đời nháp/xuất bản/thu hồi; đối tượng mới theo cá nhân hoặc phòng ban; tin quan trọng có xác nhận riêng; Admin và Trưởng phòng theo dõi đúng phạm vi người chưa đọc/chưa xác nhận; nhân viên nhận tin trong hộp thư và badge chưa đọc. Backend/Mobile đã sẵn sàng FCM nhưng cấu hình Firebase thật không nằm trong repository. Các tùy chọn W39 chưa rõ vẫn để ngoài phạm vi.

Customer review CR4 bổ sung đối tượng nhận toàn công ty và hoàn thiện khả năng vận hành push: lưu trạng thái/số lần thử theo từng người nhận, chẩn đoán cấu hình cùng thiết bị, gửi lại các trường hợp chưa thành công và hiển thị rõ trạng thái cấu hình/quyền/token trên Mobile. API hộp thư giữ metadata phạm vi để Mobile phân biệt trực tiếp tin toàn công ty, phòng ban và cá nhân. Hộp thư vẫn là nguồn giao nhận chính; push thật chỉ hoạt động khi môi trường có Firebase credential và Android options tương ứng.

Customer review CR5 bổ sung hồ sơ cảnh cáo, đình chỉ và xử lý vi phạm với vòng đời nháp/ban hành/thu hồi, khoảng hiệu lực, lý do bắt buộc và audit bất biến. Khi ban hành, Backend tạo thông báo cá nhân bắt buộc xác nhận trong cùng transaction và thử gửi push ngay sau đó. Mobile phân loại trực tiếp cảnh cáo/đình chỉ/xử lý vi phạm bằng thẻ cảnh báo riêng, hiển thị thời gian hiệu lực và bắt buộc xác nhận, dựa trên trường cấu trúc do `/api/announcements/mine` cung cấp thay vì suy diễn từ tiêu đề/nội dung. Hệ thống không tự suy diễn trừ lương, sửa công hoặc khóa tài khoản.

Customer review CR6 bổ sung chính sách nghỉ phép do Admin cấu hình, số dư theo năm/cộng dồn, điều chỉnh có lý do và audit, nghỉ cả ngày/nửa ngày/theo giờ, cùng quyền hủy đơn theo chính sách. Đơn chờ duyệt giữ trước số dư và Backend là nguồn duy nhất tính thời lượng/quỹ phép. Bốn loại nghỉ cũ tiếp tục hoạt động với theo dõi số dư mặc định tắt để không thay đổi dữ liệu lịch sử.

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
- `/api/business-trips`, `/api/leave-requests`, `/api/announcements` — công tác, nghỉ phép và truyền thông nội bộ. Công tác dùng endpoint riêng `mine`, `start`, `complete` cùng danh bạ `/api/business-trips/customers`; nghỉ phép có `mine`, `policies`, `balances`, `review` và `cancel`; thông báo dùng `mine`, `read`, `acknowledge`, `managed`, đăng ký push device và danh sách người nhận theo quyền.
- `/api/disciplinary-actions` — hồ sơ cảnh cáo/đình chỉ/xử lý vi phạm chỉ Admin, gồm tạo/chỉnh sửa nháp, ban hành, thu hồi và lịch sử audit.
- `/api/reporting`, `/api/kpi` — dashboard, đối soát tháng, Excel và KPI Lite không chấm điểm.
- `/api/operations/overview`, `/api/operations/audit` — sức khỏe vận hành và audit tập trung, chỉ role `ADMIN`.

Migration `1726444800000-web-mvp` bổ sung schema nghiệp vụ W2–W9; migration `1790035200000-customer-organization-rbac` bổ sung cơ cấu đa chi nhánh và RBAC; migration `1790121600000-auth-sessions` bổ sung phiên và lịch sử thiết bị; migration `1790208000000-schedule-location-alignment` bổ sung lịch theo phòng ban, giới hạn vị trí và audit cấu hình; migration `1790294400000-attendance-reconciliation` bổ sung giải trình và khóa kỳ công; migration `1790380800000-business-trip-operations` bổ sung vận hành công tác theo từng thành viên; migration `1790467200000-leave-operations` bổ sung vận hành đơn nghỉ; migration `1790553600000-announcement-alignment` bổ sung đối tượng cá nhân, xác nhận tin quan trọng và thu hồi thông báo; migration `1790640000000-refresh-token-sessions` bổ sung refresh token xoay vòng và thời điểm hoạt động gần nhất; migration `1790726400000-push-notification-devices` lưu FCM token theo tài khoản/thiết bị; migration `1790899200000-employee-lifecycle` bổ sung vòng đời nhân viên có lý do/audit và thu hồi phiên; migration `1790985600000-geofence-radius-alignment` nâng giới hạn bán kính geofence lên 100 m; migration `1791072000000-business-trip-customer-management` bổ sung counter mã phiếu và vòng đời khách hàng; migration `1791158400000-announcement-company-push-delivery` bổ sung trạng thái giao push theo người nhận; migration `1791244800000-employee-disciplinary-actions` bổ sung hồ sơ kỷ luật và liên kết thông báo; migration `1791331200000-leave-policies-balances` bổ sung chính sách nghỉ, số dư năm, điều chỉnh bất biến và thời lượng/hủy đơn. Mọi migration chạy với `synchronize=false`.

Android platform shell đã được tạo trong `mobile/`. Xem hướng dẫn chạy USB/Wi-Fi debugging và vị trí APK tại `mobile/README.md`.

Triển khai vận hành thật dùng Docker Compose production, HTTPS tự động và health/readiness check theo [`DEPLOYMENT.md`](DEPLOYMENT.md). Không dùng `compose.yaml`, development seed hoặc APK debug cho production.

CR7 bổ sung chống brute-force cho endpoint xác thực, kiểm tra Origin đối với cookie mutation, request ID/log an toàn, mật khẩu tạm mạnh, trang vận hành chỉ Admin, báo cáo giờ làm/OT và Excel hai sheet. Bộ production có preflight, backup đồng bộ kèm checksum, kiểm tra restore biệt lập và quality gate thủ công/PR.

CR8 hoàn thiện trải nghiệm vận hành Admin Web mà không thay đổi business rule: dashboard có hàng đợi ưu tiên từ số liệu thật, menu mobile dạng drawer, hộp thoại xác nhận thống nhất cho thao tác nhạy cảm, toast thành công, focus/keyboard state rõ ràng và phân trang cho các danh sách dài. `GET /api/employees` hỗ trợ tùy chọn `search`, `page`, `pageSize`; khi có `page` response là `{ items, page, pageSize, total, activeTotal, inactiveTotal }`, còn request không có `page` giữ response mảng để tương thích các màn hình chọn nhân sự và Mobile. `GET /api/operations/audit` trả `{ items, page, pageSize, total }` và trang vận hành hiển thị lần giao email/push thành công gần nhất.

CR9 hoàn thiện lớp sử dụng cuối của Admin Web: ngữ cảnh chi nhánh hiển thị theo phạm vi role thay vì hard-code một văn phòng, bộ chọn nhân viên có tìm kiếm và lọc phòng ban trong các luồng công tác/nghỉ phép/thông báo/kỷ luật, cảnh báo bỏ thay đổi chưa lưu ở biểu mẫu nhân viên và phiếu công tác, cùng drawer audit hiển thị giá trị trước/sau. Drawer tự che các khóa có tên dạng password/token/secret/authorization và không thay đổi dữ liệu audit gốc.

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
