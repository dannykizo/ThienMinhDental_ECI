# Thiên Minh Dental Workforce

Hồ sơ nhân sự (2026-10-20): Admin mở `/dashboard/employees`, bấm tên/avatar/dòng để xem overlay **dark-glass/bento**, chân dung, tổng quan và chi tiết cuộn liên tục; dải nhân viên cuộn ngang, trước/sau, Esc/X và bố cục điện thoại. Ảnh profile dùng chung: nhân viên chụp/chọn trên app tại nút avatar ở Hôm nay; Admin thêm/thay/gỡ trong hồ sơ. Môi trường khác cần backup và chạy migration `1793060000000-employee-portraits` trước khi cập nhật API/Web/App. Không thay quy tắc công/phê duyệt. Xem [phạm vi và kiểm tra giao diện](docs/WEB_UI_REFRESH.md).

Web UI sơ bộ (2026-10-19): shell sáu nhóm điều hướng, danh sách Nhân viên + drawer thao tác, workspace phê duyệt mẫu và Dashboard ưu tiên việc cần xử lý; giữ tím/logo thương hiệu và dữ liệu/quyền Backend. Chưa phủ lại mọi module hoặc thay Mobile. Typecheck/scoped lint/build Web PASS; không chạy test suite hoặc deploy. Xem [phạm vi và cách xem bản mẫu](docs/WEB_UI_REFRESH.md).

Nghiệm thu app tích hợp (2026-10-14): đã thao tác máy thật với Nhân viên → Leader → Trưởng phòng, giải trình/ảnh/offline, phép giữ–trừ–hoàn, OT, công tác, kỷ luật và push foreground/background/cold. Sửa hiển thị OT trước check-out và loại route riêng tư khi phiên kết thúc; 17 regression có mục tiêu PASS. Sinh trắc skip theo chỉ thị, không release APK hoặc đóng mọi PARTIAL/production gate. Bản sửa đang chạy qua Hot Restart, chưa đóng lại APK đã cài. Xem [biên bản app](docs/MOBILE_INTEGRATED_ACCEPTANCE.md) cho phạm vi, dữ liệu thử và giới hạn; các mục R bên dưới là lịch sử riêng từng lượt.

R14 (2026-10-14): Tech Lead chốt **hoàn thiện bộ triển khai và nghiệm thu local trước**, chưa có VPS/domain, không go-live trong lượt này. Cải thiện migration/readiness thật, lỗi DB/Pages an toàn, đóng gói Docker từ lockfile và backup/restore cả DB + ảnh biệt lập. Backup có cửa sổ ngừng ghi, không tự xóa bộ cũ chưa xác minh bản ngoài máy; xem [DEPLOYMENT](DEPLOYMENT.md) và [R14 acceptance](docs/R14_OPERATIONS_ACCEPTANCE.md) cho kết quả/gate. Không cần migration mới, không sửa Mobile hoặc xuất APK.

R13 (2026-10-14): Dashboard/KPI/theo dõi quản lý đã đồng bộ nguồn R12, đếm cảnh báo theo ngày, scope chi nhánh hiệu lực và không lộ tổng thông báo ngoài phạm vi. KPI tách phép cả ngày/một phần, công văn phòng/hiện trường/đủ công và phút OT đã duyệt, có nguồn/bản chốt; không tính điểm/lương. Head/Leader vẫn theo dõi scoped, không mở KPI global/Excel/chốt. Không cần migration/App/APK mới. Xem [R13 acceptance](docs/R13_DASHBOARD_KPI_ACCEPTANCE.md); URL `/dashboard`, `/dashboard/kpi`, `/dashboard/managed-modules`.

R12 (2026-10-13): có **bốn nút Excel riêng** tại Báo cáo tháng: bảng công, nghỉ phép/số dư, OT, giải trình/điều chỉnh. Dữ liệu thiếu/chưa duyệt vẫn xuất được, có ghi chú màu; chốt kỳ vẫn yêu cầu xử lý hết blocker. Bản chốt mới lưu cả bốn báo cáo bất biến, bản cũ thiếu chi tiết xuất LIVE với cảnh báo, không tạo giả lịch sử. Migration `1792972800000-supporting-report-snapshots` đã backup/apply development; môi trường khác phải migrate trước Backend/Web. Targeted **47/47 PASS**; Kế toán/HCNS còn cần kiểm định mẫu, không tính lương. Quỹ phép là quỹ năm tại lúc lấy dữ liệu/chốt, không tự phân bổ đơn giao tháng. Xem [R12 acceptance](docs/R12_REPORTING_ACCEPTANCE.md); mở `http://localhost:3000/dashboard/reports` → chọn bộ lọc → Tổng hợp → Xuất dữ liệu Excel.

R5 (2026-10-10): vị trí văn phòng/geofence đạt **38/38 targeted tests** trên DB/API biệt lập; đã sửa validation, cập nhật đồng thời/audit và khoảng cách NaN tại điểm đối cực. Web có cảnh báo và thử lại khi tile lỗi. **Toàn module PARTIAL**: ảnh nền OSM đang lỗi DNS trên máy development, quyền vị trí/GPS thật chưa nghiệm thu. Không đổi vị trí hiện hữu hoặc schema/App. Xem [R5 Locations acceptance](docs/R5_LOCATIONS_ACCEPTANCE.md).

R4 cập nhật hiện tại 2026-10-10: **Đơn từ và OT đã triển khai** (thay trạng thái chưa triển khai trong lịch sử bên dưới). App gom Giải trình/Nghỉ phép/Tăng ca; Admin/Head/Leader xử lý tại `http://localhost:3000/dashboard/overtime`, tuyến OT riêng và chỉ cộng phút đã duyệt. Migration `1792454400000-overtime-workflow` đã áp dụng development. Targeted Backend 73/73, Mobile 8/8; R4 vẫn PARTIAL do camera/GPS/push và UX máy thật chưa nghiệm thu đầy đủ. Account mới `fieldtest` chỉ development, mật khẩu bàn giao riêng, không lưu Git. Xem [R4 OT/Đơn từ](docs/R4_OT_FORMS_ACCEPTANCE.md).

R4 bổ sung 2026-10-10: chấm công một cặp/ngày chung văn phòng/hiện trường, hiện trường không cần phiếu, ảnh camera-only tại check-in cả hai loại, timemark và nội dung công tác; checkout lấy GPS chỉ Admin xem, không chụp. Migration `1792368000000-daily-attendance-capture` cần chạy trước Backend/App mới. Giờ công và báo cáo lấy từ sự kiện, không suy từ phiếu công tác được giao; không theo dõi nền. **R4 vẫn PARTIAL**, Đơn từ và OT/tuyến riêng còn thiếu. Phần này thay trạng thái NOT_IMPLEMENTED của luồng chấm công ngày ở đoạn lịch sử kế tiếp. Xem [R4 daily attendance](docs/R4_DAILY_ATTENDANCE_ACCEPTANCE.md).

R4 (2026-10-09) đang **PARTIAL**: cấu hình lịch/ngoại lệ và lựa chọn lịch Attendance/Reporting đã sửa, targeted 36/36 ca đạt. Quyết định mới thay mô tả OT tự động bên dưới: checkout muộn **không** tự tính OT; Backend hiện trả OT=0. Phiếu OT hai bước và một lượt in/out/ngày chung văn phòng/hiện trường (camera-only, công tác nhiều ngày) đã chốt yêu cầu nhưng **chưa triển khai** trong lát cắt này. Không coi R4 hoặc toàn bộ chấm công đã nghiệm thu. Xem [R4 Schedule acceptance](docs/R4_SCHEDULES_ACCEPTANCE.md).

Hệ thống chấm công, công tác và thông báo nội bộ cho Văn phòng miền Nam của Thiên Minh Dental tại TP.HCM.

Sản phẩm gồm:

- `frontend/`: Admin Web dành cho quản trị viên và người phụ trách chấm công.
- `backend/`: API dạng modular monolith, chứa toàn bộ nghiệp vụ và dữ liệu.
- `mobile/`: Flutter App dành cho nhân viên văn phòng và nhân viên kỹ thuật.

## Trạng thái

Các milestone **W1–W9 của Web-first MVP** đã được triển khai cho Backend API và Admin Web: nền tảng/auth, nhân viên, lịch làm việc, geofence, chấm công, công tác, nghỉ phép, điều chỉnh công, thông báo, báo cáo tháng và KPI Lite. Mobile App Android đã có đăng nhập/khôi phục phiên, chấm công văn phòng, giải trình có ảnh/hàng đợi mạng yếu, phiếu công tác với GPS đầu-cuối cùng ảnh hiện trường, đơn nghỉ phép và hộp thư thông báo có trạng thái đọc/xác nhận. Giai đoạn hoàn thiện Mobile đã bổ sung branded startup, form đăng nhập không điền sẵn credential, validation/autofill, theme và điều hướng đồng nhất. Mobile CR7 phân biệt mất mạng với Backend tạm ngắt, giữ phiên cho lỗi có thể thử lại, xử lý rõ phiên bị thu hồi và hiển thị version/build lấy từ package metadata. Mobile CR8 đồng bộ ngôn ngữ thiết kế với Admin Web và chuẩn hóa trạng thái loading/error/empty mà không đưa chức năng quản trị sang app; APK debug đã được kiểm tra trên thiết bị thật. Luồng FCM đã được tích hợp nhưng cần Firebase project và credential deployment để nhận push thật.

Mobile UX1 đưa ngày/trạng thái chấm công Backend lên gần đầu Trang chủ, bổ sung bốn lối tắt tới các tab Công tác/Giải trình/Nghỉ phép/Hộp thư hiện có, thu gọn trợ giúp quyền riêng tư và giữ version/build ở cuối trang. UX2 cố định một nút chấm công phía trên thanh tab, khóa bấm lặp khi lấy GPS/gửi/tải trạng thái, yêu cầu tải lại khi trạng thái chưa cập nhật và phân biệt ghi nhận thành công với ghi nhận cần đối soát theo Backend. UX3 chuẩn hóa thẻ và lọc trạng thái trên dữ liệu đã tải của bốn danh sách; phân biệt danh sách trống với không có kết quả lọc. Giải trình ghi rõ phạm vi 100 yêu cầu mới nhất, hàng đợi giữ riêng; lọc Hộp thư không đánh dấu đọc/xác nhận. Nút tạo đơn nghỉ không che danh sách. UX4 chia nhóm form, hiển thị lỗi cạnh ô nhập/ảnh, chuẩn hóa trạng thái ảnh và nút gửi thích ứng chữ lớn; cuộn form an toàn với bàn phím, khóa thao tác lặp trong lúc xử lý. Không thêm request tổng hợp, GPS khi mở trang, tự retry chấm công, bộ đếm giờ trực tiếp hoặc giờ kết thúc ca dự kiến. Kế hoạch, giới hạn nghiệm thu và log tiếp quản nằm tại [`docs/MOBILE_UX_PLAN.md`](docs/MOBILE_UX_PLAN.md).

Customer alignment C1 đã bổ sung cơ cấu HCM/HN, một nhân viên thuộc nhiều phòng ban, phân công chính có lịch sử, vai trò Kế toán trưởng và Quản lý khu vực theo phạm vi chi nhánh. Admin Web quản lý các trường này tại module Nhân viên.

PQ1 bổ sung **Tổ chức & phân quyền** tại `/dashboard/organization`: team bắt buộc thuộc một phòng ban nhưng có thể xuyên chi nhánh, thành viên có lịch sử, Admin cấp/thu hồi quyền Trưởng phòng hoặc Leader theo phạm vi/thời hạn. Backend kiểm tra quyền hiện hành khi đọc danh sách tổ chức cơ bản; không tự cấp role `MANAGER`, không thay tuyến duyệt, phiên hoặc app. Chạy `pnpm --dir backend migration:run` để áp dụng migration `1791504000000-organization-management-access`. Migration không xóa dữ liệu khi rollback nếu đã có team/quyền. Kế hoạch và bàn giao tại [`docs/PERMISSIONS_PLAN.md`](docs/PERMISSIONS_PLAN.md).

PQ2 mở đăng nhập Web cho Trưởng phòng/Leader có grant còn hiệu lực và khu vực chỉ đọc `/dashboard/managed`. Nhóm này dùng đồng thời một Web + một Mobile, đăng nhập lại chỉ thay cùng kênh. Nhân viên thường không vào Web và không bị mất phiên app khi thử đăng nhập Web. Role toàn cục chưa có grant vẫn giữ policy phiên cũ. Quyền hết hạn/thu hồi kiểm tra mỗi request; Web không còn quyền bị thu hồi, Mobile nhân viên được giữ. Thời hạn Web 24h/idle 30m, Mobile 30 ngày, JWT 15 phút không đổi. Migration `1791590400000-manager-channel-sessions` và Backend phải cập nhật **trước** Web.

PQ3 mở `/dashboard/explanations`: nhân viên gửi → Leader được chỉ định xác nhận → Trưởng phòng được chỉ định duyệt/từ chối. Admin cấu hình tuyến theo từng nhân viên và đổi trực tiếp bước chưa xử lý; theo điều chỉnh sau PQ5, chỉ quyết định thay khi tuyến thiếu/không còn hợp lệ, không duyệt thêm đơn đã kết thúc. Hai người xử lý độc lập, không tự xử lý đơn của mình. Thiếu hoặc mất quyền thì chờ Admin phân tuyến hoặc quyết định thay có lý do/audit; không tạo xác nhận Leader giả. Lưu tuyến mặc định áp dụng cả đơn đang mở, nhưng giữ team/người/thời điểm của xác nhận đã hoàn tất. Ảnh, audit và thao tác quản lý kiểm tra grant hiện hành đúng phạm vi; hộp thư commit cùng thao tác, push phụ thuộc Firebase. Mobile giữ status `SUBMITTED` tới quyết định cuối và tiếp tục gửi/hàng đợi.

PQ4 bổ sung **Xử lý giải trình** trong app hiện tại, mở từ Hôm nay hoặc biểu tượng quản lý tại Giải trình khi tài khoản có capability hiện hành. Leader xác nhận, Trưởng phòng duyệt/từ chối theo API PQ3; có bộ lọc/tìm/phân trang, ảnh có xác thực và lịch sử. Đơn cá nhân hiển thị bước, người xử lý, thời gian và ghi chú. Lỗi mất quyền không đăng xuất nhân viên; lỗi đổi tuyến/mạng yêu cầu tải lại, không tự gửi lại quyết định. Admin cấp grant và cấu hình tuyến trên Web trước; app không tự cấp quyền/cấu hình tuyến. Không có migration mới, cần Backend PQ3. Giới hạn nghiệm thu thiết bị ghi tại kế hoạch phân quyền.

Customer review CR1 đã hoàn thiện vòng đời nhân viên trên Admin Web: sửa hồ sơ và phân công tổ chức, ghi nhận ngừng làm việc có ngày/lý do, tự khóa tài khoản và thu hồi phiên, khôi phục có audit, đồng thời xem lịch sử thay đổi mà không xóa dữ liệu nghiệp vụ. Mobile phản ứng với phiên bị thu hồi bằng cách xóa token an toàn, quay về đăng nhập và hiển thị nguyên nhân vận hành; mất kết nối tạm thời không còn làm mất phiên đã lưu.

Customer alignment C2 đã bổ sung phiên đăng nhập xoay vòng, chính sách một thiết bị (PQ2 bổ sung ngoại lệ quản lý nêu trên), lịch sử đăng nhập/đăng xuất, Admin thu hồi thiết bị và cảnh báo email đăng nhập qua SMTP. Access token sống 15 phút; Admin Web duy trì tối đa 24 giờ với timeout không hoạt động 30 phút, còn App nhân viên duy trì đăng nhập tối đa 30 ngày bằng refresh token lưu trong secure storage. Cần cấu hình `SMTP_*` và `ADMIN_LOGIN_ALERT_EMAILS` để gửi email thật; nếu chưa cấu hình, Admin Web hiển thị rõ trạng thái chưa gửi.

Customer alignment C3 đã bổ sung lịch mặc định theo chi nhánh/phòng ban, ngoại lệ lịch theo nhân viên, quy tắc đủ công 8 giờ/đi muộn sau 3 phút/về sớm/OT, hai loại vị trí văn phòng và địa điểm bên ngoài, ngưỡng sai số GPS tối đa 50 m và lịch sử cấu hình chỉ Admin xem. Customer review CR2 nâng bán kính geofence tối đa lên 100 m, bổ sung bản đồ tương tác và thao tác lấy một mẫu tọa độ thiết bị cho Admin. Mobile hiển thị kết quả đối chiếu do Backend trả về gồm vị trí khớp, khoảng cách, bán kính và accuracy mà không tự tính rule hoặc lộ tọa độ chi tiết. Tọa độ HN và địa điểm bên ngoài không được seed giả; Admin nhập, chọn trên bản đồ hoặc lấy tại thiết bị khi có thông tin chính thức.

Luồng giải trình hiện tại: nhân viên chủ động tạo đơn (ngày công, loại vấn đề, nội dung), có thể chụp hoặc đính kèm một ảnh JPEG/PNG/WebP tối đa 5 MB; không bắt buộc ảnh/GPS. PQ3 thay duyệt Admin một cấp bằng hai bước nêu trên; duyệt không tự sửa bảng công. App giữ hàng đợi theo tài khoản và UUID ổn định để tránh trùng. Yêu cầu cũ giữ tương thích, đơn hoàn tất giữ nguyên lịch sử; không tạo yêu cầu Admin mới. Ảnh chỉ owner/Admin/người được chỉ định có quyền scope hiện hành đọc được. Đơn đang mở vẫn chặn chốt công.

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
- `GET /api/auth/admin-session` — phiên hợp lệ cho Web; role Web hiện có hoặc grant Trưởng phòng/Leader còn hiệu lực. `user.portal` cung cấp menu/phạm vi/policy phiên, không tự cấp quyền module nghiệp vụ.
- `GET /api/auth/admin/sessions` — lịch sử đăng nhập/đăng xuất, chỉ `ADMIN`.
- `POST /api/auth/admin/sessions/:sessionId/revoke` — thu hồi một thiết bị, chỉ `ADMIN`.
- `/api/employees`, `/api/work-schedules`, `/api/office-locations` — danh mục và cấu hình vận hành.
- `GET /api/attendance/me/today` — trạng thái chấm công hôm nay của nhân viên hiện tại.
- `/api/attendance` — sự kiện check-in/out, bảng ngày, nhân viên gửi giải trình qua `POST /explanations/mine`; PQ3 `GET /explanations` theo scope, Admin `GET routes/routing-options`, `PUT routes/:employeeId`, `PATCH :id/reroute`, Leader `PATCH :id/confirm`, Trưởng phòng `PATCH :id/review`, `GET :id/history`. Mutation tuyến/quyết định cần `expectedVersion`. Điều chỉnh công vẫn chỉ Admin.
- `/api/business-trips`, `/api/leave-requests`, `/api/announcements` — công tác, nghỉ phép và truyền thông nội bộ. Công tác dùng endpoint riêng `mine`, `start`, `complete` cùng danh bạ `/api/business-trips/customers`; nghỉ phép có `mine`, `policies`, `balances`, `review` và `cancel`; thông báo dùng `mine`, `read`, `acknowledge`, `managed`, đăng ký push device và danh sách người nhận theo quyền.
- `/api/disciplinary-actions` — hồ sơ cảnh cáo/đình chỉ/xử lý vi phạm chỉ Admin, gồm tạo/chỉnh sửa nháp, ban hành, thu hồi và lịch sử audit.
- `/api/reporting`, `/api/kpi` — dashboard, đối soát tháng, Excel và KPI Lite không chấm điểm.
- `/api/operations/overview`, `/api/operations/audit` — sức khỏe vận hành và audit tập trung, chỉ role `ADMIN`.

Migration `1726444800000-web-mvp` bổ sung schema nghiệp vụ W2–W9; migration `1790035200000-customer-organization-rbac` bổ sung cơ cấu đa chi nhánh và RBAC; migration `1790121600000-auth-sessions` bổ sung phiên và lịch sử thiết bị; migration `1790208000000-schedule-location-alignment` bổ sung lịch theo phòng ban, giới hạn vị trí và audit cấu hình; migration `1790294400000-attendance-reconciliation` bổ sung giải trình và khóa kỳ công; migration `1790380800000-business-trip-operations` bổ sung vận hành công tác theo từng thành viên; migration `1790467200000-leave-operations` bổ sung vận hành đơn nghỉ; migration `1790553600000-announcement-alignment` bổ sung đối tượng cá nhân, xác nhận tin quan trọng và thu hồi thông báo; migration `1790640000000-refresh-token-sessions` bổ sung refresh token xoay vòng và thời điểm hoạt động gần nhất; migration `1790726400000-push-notification-devices` lưu FCM token theo tài khoản/thiết bị; migration `1790899200000-employee-lifecycle` bổ sung vòng đời nhân viên có lý do/audit và thu hồi phiên; migration `1790985600000-geofence-radius-alignment` nâng giới hạn bán kính geofence lên 100 m; migration `1791072000000-business-trip-customer-management` bổ sung counter mã phiếu và vòng đời khách hàng; migration `1791158400000-announcement-company-push-delivery` bổ sung trạng thái giao push theo người nhận; migration `1791244800000-employee-disciplinary-actions` bổ sung hồ sơ kỷ luật và liên kết thông báo; migration `1791331200000-leave-policies-balances` bổ sung chính sách nghỉ, số dư năm, điều chỉnh bất biến và thời lượng/hủy đơn. Mọi migration chạy với `synchronize=false`.

Migration `1791417600000-employee-explanations` chuyển sang đơn do nhân viên chủ động gửi, giữ dữ liệu cũ và thêm quyền sở hữu ảnh/idempotency. Chạy `pnpm --dir backend migration:run` trước khi chạy Backend phiên bản mới. Không revert trực tiếp khi đã có đơn nguồn `EMPLOYEE`; migration chủ động chặn để tránh mất dữ liệu.

Migration `1791676800000-explanation-two-step-workflow` thêm tuyến mặc định và bước/phiên bản/người xác nhận. Chạy migration + Backend trước Web. Đơn đang chờ cũ cần phân tuyến và xác nhận thật; không backfill người duyệt/xác nhận cho đơn đã kết thúc. Rollback bị chặn khi đã có tuyến hoặc dữ liệu workflow PQ3; cần export/migrate trước.

Android platform shell đã được tạo trong `mobile/`. Xem hướng dẫn chạy USB/Wi-Fi debugging và vị trí APK tại `mobile/README.md`.

Triển khai vận hành thật dùng Docker Compose production, HTTPS tự động và health/readiness check theo [`DEPLOYMENT.md`](DEPLOYMENT.md). Không dùng `compose.yaml`, development seed hoặc APK debug cho production.

CR7 bổ sung chống brute-force cho endpoint xác thực, kiểm tra Origin đối với cookie mutation, request ID/log an toàn, trang vận hành chỉ Admin, báo cáo giờ làm/OT và Excel hai sheet. Theo điều chỉnh ngày 2026-10-07, mật khẩu tài khoản dùng 6–128 ký tự, không yêu cầu hoa/thường/số/ký hiệu; Admin tự chọn khi tạo nhân sự. Mật khẩu hiện hữu không đổi và vẫn được hash bcrypt. Xem mật khẩu hiện tại/nhân viên tự đổi/Admin đặt lại mật khẩu chưa triển khai (`NOT_IMPLEMENTED`). Bộ production có preflight, backup đồng bộ kèm checksum, kiểm tra restore biệt lập và quality gate thủ công/PR.

CR8 hoàn thiện trải nghiệm vận hành Admin Web mà không thay đổi business rule: dashboard có hàng đợi ưu tiên từ số liệu thật, menu mobile dạng drawer, hộp thoại xác nhận thống nhất cho thao tác nhạy cảm, toast thành công, focus/keyboard state rõ ràng và phân trang cho các danh sách dài. `GET /api/employees` hỗ trợ tùy chọn `search`, `page`, `pageSize`; khi có `page` response là `{ items, page, pageSize, total, activeTotal, inactiveTotal }`, còn request không có `page` giữ response mảng để tương thích các màn hình chọn nhân sự và Mobile. `GET /api/operations/audit` trả `{ items, page, pageSize, total }` và trang vận hành hiển thị lần giao email/push thành công gần nhất.

CR9 hoàn thiện lớp sử dụng cuối của Admin Web: ngữ cảnh chi nhánh hiển thị theo phạm vi role thay vì hard-code một văn phòng, bộ chọn nhân viên có tìm kiếm và lọc phòng ban trong các luồng công tác/nghỉ phép/thông báo/kỷ luật, cảnh báo bỏ thay đổi chưa lưu ở biểu mẫu nhân viên và phiếu công tác, cùng drawer audit hiển thị giá trị trước/sau. Drawer tự che các khóa có tên dạng password/token/secret/authorization và không thay đổi dữ liệu audit gốc.

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3001/api
```

## Admin không PIN — cập nhật 2026-10-09

- Đã bỏ lớp PIN theo yêu cầu khách hàng. Hồ sơ chi tiết, tài khoản/phân quyền vẫn chỉ Admin truy cập qua Backend có JWT/phiên/RBAC; không bỏ bảo mật hệ thống.
- Chạy `pnpm --dir backend migration:run` để áp dụng migration retirement `1792108800000-retire-admin-pin`; cập nhật Backend trước Web. Migration PIN cũ giữ nguyên vì đã áp dụng ở development. Recovery/lời mời cũ hết hiệu lực; audit, dữ liệu nhân sự và phiên đăng nhập thông thường giữ nguyên.
- Trang `/dashboard/security`, `/admin-handover` và API PIN đã ngừng dùng. Bàn giao Admin tự phục vụ không PIN chưa triển khai. Không đổi mật khẩu hoặc app/APK.
- Runbook: [Admin security](docs/ADMIN_SECURITY.md). Rà soát chống gian lận: [Attendance security](docs/ATTENDANCE_SECURITY_REVIEW.md).

## Kiểm tra chất lượng

Mobile có màn `Thiết lập ứng dụng` một lần sau đăng nhập, cho phép để sau và mở lại từ Trang chủ. Thông báo chỉ xin theo nút chủ động; GPS vẫn theo sự kiện chấm công/công tác, ảnh dùng trình chọn hệ thống không xin toàn bộ thư viện. Chi tiết tại [Mobile README](mobile/README.md).

Android push readiness (2026-10-07): đã bổ sung kênh thông báo/icon Android, banner hệ thống foreground, mở tin từ push qua inbox có xác thực, trạng thái đăng ký/Backend và retry khi resume/mạng phục hồi. Backend loại thiết bị không còn phiên Mobile hợp lệ, giới hạn preview Unicode; hộp thư giữ nội dung đầy đủ. **Chưa coi là nghiệm thu push thật** khi thiếu Firebase credential/quyền điện thoại. Nhắc check-out chờ chốt policy. Xem [runbook và checklist push](docs/PUSH_ACCEPTANCE.md).

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Theo chỉ thị hiện hành của Tech Lead, vẫn bổ sung test cho business rule/authorization nhưng **không tự chạy test suite**; chỉ chạy khi được yêu cầu. Typecheck/lint/build và kiểm tra API development có kiểm soát được ghi rõ trong bàn giao, không coi là thay thế nghiệm thu UI hoặc test suite.

## Nghiệm thu module

R9 (2026-10-12): Backend46/Mobile15 targeted PASS cho giữ/trừ/hoàn quỹ, trùng đơn, AM/PM/giờ và hủy–duyệt đồng thời. Tech Lead chốt ngày nghỉ có lịch 0 phút, thiếu lịch fallback policy từng ngày; không tính lại đơn cũ. Sửa validation/audit/init/carry preview và lỗi dialog/retry app; không migration mới. Web đọc và Hot Reload đã kiểm tra, mutation UI/FCM vẫn PARTIAL. [Biên bản R9](docs/R9_LEAVE_ACCEPTANCE.md). Không tự chuyển R10 hoặc xuất APK.

R3 ngày 2026-10-09: Admin xem tên đăng nhập/reset mật khẩu và xóa vĩnh viễn nhân sự, không giới hạn theo lịch sử/kỳ đã chốt, có preview, mã xác nhận, lý do/audit. Reset thu hồi phiên/push; xóa giữ phiếu chung và actor kỹ thuật cho lịch sử khác. Chạy migration `1792281600000-employee-file-cleanup` **trước** Backend mới. Backend/API targeted **59/59 đạt**; chưa coi là nghiệm thu thao tác cuối UI/điện thoại/production. Quyết định này thay quy tắc không hard-delete nhân sự và trạng thái Admin reset NOT_IMPLEMENTED ở các mô tả lịch sử phía trên. Xem [R3 Employee acceptance](docs/R3_EMPLOYEES_ACCEPTANCE.md). Không tự chuyển R4.

R2 ngày 2026-10-09: đã rà tổ chức/phân quyền và sửa danh bạ quản lý còn hiển thị tài khoản inactive. **85/85 targeted tests đạt** (gồm PostgreSQL/API thật, concurrency, đọc ảnh và đổi tuyến giữ bước hoàn tất); không đổi schema/Web/App hoặc dữ liệu khách đang test. Nghiệm thu UI Head/Leader/điện thoại vẫn PARTIAL, chưa chuyển R3. Bằng chứng/lệnh chạy lại: [R2 Organization acceptance](docs/R2_ORGANIZATION_ACCEPTANCE.md).

Bổ sung trước R2: quản trị chi nhánh/phòng ban/chức vụ/team tại `/dashboard/organization`, ngừng/khôi phục và chỉ xóa bản ghi chưa sử dụng. Chạy `pnpm --dir backend migration:run` cho migration `1792195200000-organization-catalog-lifecycle` **trước** Backend/Web mới. Không xóa dữ liệu nhân viên hoặc lịch sử cũ. Quy tắc, API, rollback và kiểm tra: [Vòng đời danh mục tổ chức](docs/ORGANIZATION_CATALOG_LIFECYCLE.md). Đây không phải PASS toàn bộ R2.

Nghiệm thu R1 ngày 2026-10-09: 100/100 test có mục tiêu (Backend/Web/App) đạt; sửa refresh đa tab, phản hồi app về muộn, nhãn idle, parser/rate limit và Origin login Web. **Chưa chốt PASS toàn bộ**: chờ quyết định mật khẩu dài và UI thiết bị/production còn thiếu. Không coi đây là nghiệm thu các module còn lại. Chi tiết/lệnh chạy lại: [R1 Auth acceptance](docs/R1_AUTH_ACCEPTANCE.md).

## GitNexus

Chỉ chạy sau khi repository có code đủ ý nghĩa. Quy trình và lệnh an toàn nằm trong `CLAUDE.md`. Thư mục `.gitnexus/` là index cục bộ và không được commit.

## PQ5 — nghỉ phép và phạm vi quản lý

Admin cấu hình tuyến nghỉ phép **riêng** tại /dashboard/leave-workflow; nút sao chép tuyến giải trình chỉ điền form, cần lưu rõ ràng và hai tuyến không liên kết tự động. Leader xác nhận → Trưởng phòng quyết định, Admin không duyệt thêm. /dashboard/managed-modules cho quản lý chỉ đọc chấm công/công tác/báo cáo/trạng thái thông báo đúng scope, không cấp xuất Excel/chốt kỳ/quản trị. App có lối vào từ Hôm nay theo capability và theo dõi tuyến đơn phép cá nhân; giữ form hiện hữu, không retry quyết định tự động.

Chạy pnpm --dir backend migration:run để áp dụng 1791763200000-leave-two-step-workflow; cập nhật Backend **trước** Web/app. Pending cũ cần Admin phân tuyến/xác nhận thật; terminal giữ nguyên, rollback chặn khi có workflow data. Chi tiết và giới hạn nghiệm thu: [kế hoạch phân quyền](docs/PERMISSIONS_PLAN.md).

## Điều chỉnh sau PQ5 — Admin dự phòng và workspace UX

Tech Lead duyệt cho cả nghỉ phép/giải trình: Admin chỉ quyết định thay đơn SUBMITTED khi tuyến thiếu hoặc không còn hợp lệ. Backend trả canAdminReview riêng và kiểm tra lại trong transaction; không mở bypass tuyến hợp lệ, tự duyệt đơn mình/người gửi/người đã xác nhận, REQUESTED chưa phản hồi, terminal hoặc kỳ khóa. Review cần expectedVersion + adminOverrideReason ít nhất 5 ký tự. Phép từ chối vẫn cần reviewNote hợp lệ, duyệt vẫn kiểm tra quỹ. Xác nhận đã hoàn tất giữ nguyên; không tạo xác nhận Leader giả.

Migration 1791849600000-admin-fallback-review thêm decision_method (ROUTED/ADMIN_FALLBACK, nullable cho lịch sử) và admin_override_reason vào hai bảng. Audit ADMIN_FALLBACK_REVIEW và inbox cùng transaction; push tracked sau commit. Thông báo quyết định, kể cả Head theo tuyến, ghi tên người xử lý thực tế. App hiện tại nhận qua Hộp thư và hiển thị reviewedByName; không cần đổi form/đóng gói APK trong task này. Cập nhật migration + Backend trước Web.

Hai workspace Admin tách Hàng đợi đơn/Cấu hình tuyến; thẻ tóm tắt từ dữ liệu thật, chip lọc ngang, tìm kiếm/phân trang và drawer chi tiết/timeline/audit/nút xử lý. Form lưu nằm dưới các trường thay vì bị kéo cao; CSS giới hạn trong workspace, giữ brand tím/trắng. Menu phân biệt Chính sách & quỹ phép và Xử lý nghỉ phép. Không redesign module khác hay mở thêm ERP. Bàn giao/kiểm tra tại docs/PERMISSIONS_PLAN.md.

## R8 — Công tác và khách hàng

Ảnh công tác private/owned/immutable cần migration `1792713600000-business-trip-evidence-ownership` trước Backend mới; đã backup/apply development 2026-10-12. App chụp lại mã ảnh mới/read trạng thái sau lỗi; phiếu không cộng công ngày, daily field check-in/out riêng không cần phiếu. Backend42/Mobile7 targeted PASS; máy thật/push vẫn PARTIAL. [Biên bản R8 và lệnh chạy lại](docs/R8_BUSINESS_TRIPS_ACCEPTANCE.md). Không xuất APK release hoặc deploy production trong lượt nghiệm thu.

## R11 — Thông báo/push (2026-10-13)

Backend18 targeted PASS, noEmit/scoped lint/isolated compile PASS; sửa department recipient effective dates, publish target recheck, read/ack–withdraw races, validation và token registration gắn đúng JWT Mobile session/chống token race. Không migration/đổi payload App. Firebase Android/FCM-only account/key đã cấu hình sau phê duyệt; key ngoài Git, config local ignored, OAuth/Backend health/debug build-install-attach PASS. Flutter tự reinstall sau lỗi xác minh cài đặt; cần đăng nhập/cấp lại quyền. Background/cold push chưa nghiệm thu. Trạng thái PARTIAL, không coi inbox là push thật. [R11 acceptance và điểm tiếp tục](docs/R11_PUSH_ACCEPTANCE.md).

## R10 — Kỷ luật cá nhân/tập thể

Admin chọn team/phòng → popup tích sẵn nhân sự → bỏ ngoại lệ → ban hành. Mỗi người có hồ sơ/inbox/xác nhận riêng; thu hồi cả danh sách gốc, không áp cho người vào sau. Giữ tin ban hành/thu hồi/audit; không thu hồi riêng tin gắn quyết định. Roster thay đổi cần chọn lại. Không tự trừ lương, khóa tài khoản hoặc sửa công.

Migration `1792800000000-disciplinary-action-groups` đã backup/apply development. Môi trường khác: backup trước, `pnpm --filter @thien-minh-dental/backend migration:run`, rồi triển khai Backend/Web; giữ synchronize=false, down từ chối khi đã có collective history. App dùng inbox hiện hữu, không cần APK mới chỉ cho phần tập thể. Backend27 targeted, noEmit/scoped lint/isolated compile/Web build PASS; Chrome popup/ngoại lệ/rỗng/hủy PASS. FCM nền và luồng UI/app thật chưa đủ nghiệm thu, trạng thái **PARTIAL**. [Biên bản R10](docs/R10_DISCIPLINARY_ACCEPTANCE.md).

## R6 — Device proof và giới hạn chấm công

Migration `1792540800000-attendance-device-proof` thêm khóa thiết bị, challenge và budget PostgreSQL. Cập nhật DB → Backend → Web → app cùng đợt: APK cũ không có chữ ký sẽ không chấm được; không tự backfill ACTIVE. Tech Lead duyệt điều chỉnh 2026-10-10: tài khoản chưa từng đăng ký khóa được tự gắn thiết bị đầu tiên khi bấm chấm công, không cần mục Đăng ký/xem mã khóa riêng. Mỗi lượt vào/ra vẫn bắt buộc strong biometric. App chỉ giữ nút Tạo lại khóa cho khôi phục; đổi máy/tạo lại khóa cần Admin thu hồi cũ, đối chiếu mã khóa đang chờ trong phản hồi chấm công/khôi phục và duyệt mới tại `/dashboard/access`; lịch sử REVOKED không mở lại tự đăng ký, PENDING cũ vẫn cần duyệt. Không đổi schema nên điều chỉnh này không cần migration mới. Máy không hỗ trợ strong biometric dùng giải trình, không bypass. Nhân viên phải tự thực hiện lần gắn đầu; chưa có xác minh danh tính người đăng ký bằng attestation/nhận diện nhân viên.

Bản Android release chặn HTTP cleartext/tắt backup; debug/profile cho HTTP local với ADB reverse. Chữ ký không chứng minh GPS thật hoặc danh tính nhân viên; attestation chưa tích hợp. Trạng thái R6 PARTIAL, kiểm tra có mục tiêu và luồng người dùng cần làm tiếp tại [R6 acceptance](docs/R6_ATTENDANCE_ACCEPTANCE.md). Không tự triển khai production hay chuyển R7.
