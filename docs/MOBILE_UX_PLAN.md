# Mobile UX — kế hoạch tham khảo My VDCD

Ngày lập: 2026-10-06. Scope owner: Nguyễn Thành Nam.

Trạng thái: **UX1–UX2 đã hoàn thành ngày 2026-10-06; UX3–UX4 vẫn PROPOSED**. Tài liệu này là kế hoạch bàn giao, không thay thế PROJECT.md, FLOWS.md hoặc IMPLEMENTATION.md. Chỉ bắt đầu task khi Tech Lead giao rõ mã task; không tự chuyển sang task tiếp theo.

## 1. Mục tiêu và baseline

Nâng khả năng đọc nhanh và thao tác một tay của app nhân viên Thiên Minh, giữ phong cách tím–cam clean đã triển khai trong Mobile CR8. Học cách tổ chức thông tin của My VDCD, không sao chép logo, hình ảnh, dữ liệu nhân sự hoặc giao diện nguyên bản.

Đã tham khảo trực tiếp: Trang chủ, Chấm công, Giải trình, Đơn nghỉ, form giải trình/nghỉ và danh sách thông báo. Chưa kiểm chứng cơ chế GPS, chống gian lận, xử lý offline hoặc push thực tế của My VDCD; không dùng những suy đoán đó làm specification.

Baseline tại thời điểm lập kế hoạch:

- Mobile CR8 đã hoàn thành; commit bàn giao trước đó: `0202f69`. Agent tiếp quản phải xác minh HEAD và diff hiện tại, không reset về commit này.
- Có thay đổi sẵn của Tech Lead trong `mobile/lib/features/leave/leave_request_screen.dart`: validation lý do hủy trong dialog và hai trường ngày xếp dọc. Phải giữ nguyên; không tự stage/commit chung hoặc ghi đè.
- CR7 đã xử lý lỗi kết nối/thu hồi phiên; CR8 đã có theme và widget loading/error/empty dùng chung. Tái sử dụng, không xây một hệ thống theme/state mới.
- Firebase thật phụ thuộc cấu hình môi trường; không hứa push đã hoạt động chỉ vì giao diện có trạng thái sẵn.

## 2. Ranh giới áp dụng cho cả bốn task

- Chỉ Mobile presentation và tài liệu bàn giao liên quan. Không đổi Admin Web, Backend, schema, API contract, authorization, GPS hoặc cơ chế session/queue.
- Trạng thái công, giờ làm, OT, quỹ phép và quyền thao tác lấy từ Backend. Thiếu trường cần thiết: ghi blocker, đề xuất contract riêng và hỏi Tech Lead; không tự bổ sung Backend.
- Không thêm lịch sử công tháng, biểu đồ tháng, chuỗi đúng giờ, danh bạ, đơn đăng ký OT, tự tạo giải trình hoặc chọn người duyệt. Các mục đó không được duyệt chỉ vì My VDCD có.
- Không tracking GPS khi vào Trang chủ/chuyển tab; chỉ giữ các sự kiện GPS đã được duyệt.
- Không đổi nhãn nghiệp vụ theo suy đoán. Ví dụ có check-in không mặc nhiên chứng minh đã đủ công hoặc đang đi công tác.
- Không đưa dữ liệu minh họa hoặc số 0 thay cho lỗi/thiếu dữ liệu. Dữ liệu cũ khi refresh lỗi phải giữ cảnh báo chưa cập nhật, không mô tả là dữ liệu mới.
- Không thêm thư viện nếu widget Flutter và component hiện có đáp ứng được.
- Tiếp tục debug/hot reload trên điện thoại; không xuất APK release hoặc bản APK bàn giao khi chưa được yêu cầu.

## 3. Các task triển khai tuần tự

### UX1 — Trang chủ hướng vào ngày hiện tại

Trạng thái: `DONE` (Codex, được Tech Lead giao và triển khai ngày 2026-10-06). Commit triển khai: `b03c771`.

Kết quả thực tế: thẻ ngày/trạng thái và thao tác lên gần đầu; bốn lối tắt chọn lại tab sẵn có; quyền riêng tư có thể mở rộng; version/build ở footer. Không thêm giờ ca dự kiến vì model TodayAttendance chưa có trường đó; không thêm bộ đếm hoặc progress tự tính. Nhãn checkout không đồng nhất với đủ công.

Vùng dự kiến: `mobile/lib/features/attendance/attendance_home.dart`; `mobile/lib/features/shell/employee_shell.dart` chỉ khi cần callback chuyển tab; widget nhỏ trong `mobile/lib/presentation/widgets/` khi thực sự dùng lại.

Phạm vi:

- Đưa thẻ hôm nay lên đầu: ngày, trạng thái Backend, giờ vào/ra và thông tin lịch đã có trong response.
- Rút gọn phần thông tin phụ; giữ cảnh báo mạng/phiên và version/build hiện có.
- Thêm lối tắt Công tác, Giải trình, Nghỉ phép, Hộp thư bằng icon + nhãn. Chỉ chuyển tới màn có sẵn, không tự gửi request nghiệp vụ hay mở camera/GPS.
- Giữ năm tab hiện có và cơ chế badge hộp thư; không tạo thêm tab hoặc một bản sao màn chấm công.
- Chỉ hiển thị giờ làm/tiến độ nếu response có dữ liệu và ý nghĩa phù hợp. Không hard-code 8 giờ, không tự tính thời gian được công nhận, không bổ sung bộ đếm thời gian trực tiếp trong task này.

Nghiệm thu:

- Trạng thái và thao tác ngày hiện tại có thể tìm thấy ngay ở phần đầu; trên màn nhỏ hoặc font lớn vẫn cuộn được để đọc đủ.
- Lối tắt mở đúng màn; Back/tab navigation không tạo màn trùng.
- Loading, không có dữ liệu, lỗi lần đầu và lỗi refresh vẫn dùng hành vi CR7/CR8.
- Không phát sinh GPS, mutation hoặc request tổng hợp mới khi mở Trang chủ.

### UX2 — Thao tác chấm công dễ tiếp cận, khó bấm nhầm

Trạng thái: `DONE` (Codex, được Tech Lead giao và triển khai ngày 2026-10-06). Commit triển khai có tiêu đề `feat(mobile): improve attendance action UX`; xác minh hash và push qua Git khi tiếp quản.

Kết quả thực tế: một nút cố định phía trên thanh tab, dành chỗ riêng bằng Scaffold/SafeArea; nhãn giờ vào/ra bằng tiếng Việt; trạng thái lấy GPS/gửi/tải lại tách biệt. Guard đồng bộ khóa cả nút chính và retry, không để refresh xóa feedback đang xử lý. Lỗi tải trạng thái yêu cầu reload trước khi chấm công; thành công dùng giờ sự kiện Backend, có cảnh báo đối soát nếu Backend trả risk flags. Không đổi GPS/session/queue/API hoặc rule nghiệp vụ.

Vùng dự kiến: `mobile/lib/features/attendance/attendance_home.dart`; widget cục bộ liên quan nếu cần.

Phạm vi:

- Làm nổi bật thao tác phù hợp với trạng thái Backend bằng nhãn tiếng Việt nhất quán, giữ logic cho phép/chặn hiện có.
- Nếu cố định vùng nút ở đáy, dùng SafeArea và chừa phần đệm cuộn đủ cho nội dung; không che thanh tab, banner lỗi hoặc dòng cuối.
- Giữ phản hồi đang lấy vị trí/đang gửi/thành công/cần giải trình/lỗi hiện có. Không tự động retry chấm công khi resume.
- Khóa nút trong lúc xử lý; lỗi trả lại khả năng thử theo flow hiện hành. Kết quả geofence tiếp tục do Backend đánh giá.

Nghiệm thu:

- Bấm liên tiếp không tạo thêm luồng gửi từ UI khi request đang chạy; không thay cơ chế idempotency Backend.
- Từ chối quyền GPS, GPS không lấy được, mất mạng và Backend tạm ngắt có hướng dẫn rõ; không xóa phiên vì lỗi kết nối.
- Nút/nội dung không bị che khi có system inset, bàn phím hoặc font lớn.
- Không đổi giờ server, bán kính geofence, đủ công, muộn/về sớm hoặc OT.

### UX3 — Danh sách công tác, đơn và hộp thư dễ quét

Trạng thái: `NOT_IMPLEMENTED` (đề xuất). Phụ thuộc UX2 đã nghiệm thu.

Vùng dự kiến:

- `mobile/lib/features/business_trips/business_trip_list_screen.dart`
- `mobile/lib/features/explanations/explanation_list_screen.dart`
- `mobile/lib/features/leave/leave_request_screen.dart`
- `mobile/lib/features/announcements/announcement_inbox_screen.dart`

Phạm vi:

- Chuẩn hóa thứ bậc trên thẻ: tiêu đề/mã phiếu, nhãn trạng thái, thời gian, thông tin chính và nút xem/phản hồi.
- Cải thiện hoặc bổ sung chip lọc trạng thái trên chính dữ liệu đã tải. Giữ mã trạng thái Backend; không tạo trạng thái giải trình mới giống app tham khảo.
- Bộ lọc client chỉ áp dụng tập dữ liệu hiện có; nếu API phân trang hoặc chưa đủ dữ liệu phải ghi rõ phạm vi, không công bố tổng toàn bộ. Không thêm bộ lọc ngày hoặc đổi API trong task này.
- Phân biệt danh sách rỗng với không có kết quả theo bộ lọc; có thao tác bỏ lọc.
- Hộp thư tiếp tục phân biệt chưa đọc, cần xác nhận và quyết định kỷ luật; lọc hoặc xem preview không gọi read/acknowledge. Mở chi tiết vẫn giữ flow đọc hiện tại.

Nghiệm thu:

- Trạng thái có chữ + màu, không chỉ dựa vào màu. Nhãn/mã phiếu dài không gây overflow.
- Đổi/bỏ lọc hiển thị đúng danh sách đã tải, không làm mất dữ liệu cũ khi refresh lỗi.
- Công tác giữ vai trò người phụ trách và trạng thái tham gia riêng; nghỉ giữ số dư/policy; giải trình giữ hàng đợi offline; inbox giữ xác nhận chủ động.

### UX4 — Form gọn, dễ đọc và nghiệm thu UX tổng thể

Trạng thái: `NOT_IMPLEMENTED` (đề xuất). Phụ thuộc UX3 đã nghiệm thu.

Vùng dự kiến: form/detail trong module Nghỉ phép, Giải trình, Công tác và các widget presentation trực tiếp liên quan. Không thêm màn Tài khoản hoặc chuyển chức năng quản trị sang app.

Phạm vi:

- Gom field theo nhóm, nhãn rõ, bắt buộc dễ thấy, lỗi cạnh field và nút gửi có trạng thái xử lý.
- Nhóm ngày/buổi/giờ thích ứng chiều rộng, không ép hai field quá hẹp; bảo toàn các thay đổi CR6 có sẵn.
- Ảnh bằng chứng thể hiện rõ ảnh đang chọn/đang upload/đang chờ gửi/lỗi theo trạng thái thực tế; không thay camera, metadata hay queue.
- Dùng cùng ngôn ngữ nút, padding và trạng thái CR8; rà soát font lớn, bàn phím, SafeArea và vùng chạm tối thiểu 48 logical px cho control tương tác.

Nghiệm thu:

- Bàn phím không che field đang nhập hoặc làm nút gửi không thể tiếp cận; form cuộn được.
- Chỉ phản hồi thành công sau kết quả thật; gửi thất bại giữ nội dung theo flow sẵn có, không mất ảnh/draft chỉ vì refresh giao diện.
- Kiểm tra thủ công cả năm tab, form/detail, Back, refresh và banner lỗi; không có Flutter overflow/runtime exception.
- Không xuất APK bàn giao. Nếu không có thiết bị, ghi rõ chưa nghiệm thu trên điện thoại, không đánh dấu hoàn tất toàn bộ.

## 4. Phần nghiệp vụ để riêng, không tự triển khai

Nhắc quên check-out là đề xuất hữu ích nhưng **NEEDS_SCOPE_APPROVAL**. Trước khi triển khai phải chốt: giờ nhắc theo lịch nào, grace period, ngày nghỉ/công tác, tần suất, múi giờ, kênh inbox/push, chống gửi trùng và xử lý check-out đồng thời. Codex chốt Backend contract trước; OpenCode có thể thực thi task cụ thể sau.

Thống kê công tháng/lịch tuần/chuỗi đúng giờ/chọn người duyệt và tính năng mới khác: **OUT_OF_SCOPE** của UX1–UX4. Không suy ra quyền xem lịch sử tháng từ việc My VDCD có màn này.

## 5. Kiểm tra, commit và bàn giao

- Theo chỉ thị Tech Lead trước đây: không tự chạy automated test suite. Với UX thuần, kiểm tra format, `flutter analyze` và thao tác thủ công trên thiết bị; chỉ build debug để chạy nếu cần. Nếu scope mới có rule/API/permission, cập nhật test theo AGENTS.md và hỏi riêng về việc chạy test.
- Ghi lại command, kết quả và warning có sẵn; không gọi mọi warning là do task mới hoặc tuyên bố sạch khi còn warning.
- Sau mỗi task được giao và hoàn tất: review diff, stage đúng hunk, commit có mục đích rồi push theo chỉ thị đang có của Tech Lead. Không dùng `git add .` với worktree có thay đổi ngoài scope.
- Không đánh dấu DONE nếu chỉ code xong mà chưa kiểm tra phù hợp; không tự làm UX tiếp theo khi chưa được giao.
- Cập nhật IMPLEMENTATION.md/README.md khi phần tương ứng đã thực sự hoàn thành, không ghi đề xuất thành hiện trạng.

Trước khi đổi agent hoặc kết thúc lượt, điền log bên dưới. Nếu đang dở, không commit code lỗi chỉ để có checkpoint; mô tả diff dở và bước kế tiếp chính xác.

## 6. Log tiếp quản

| Task | Trạng thái | Commit/push | Kiểm tra | Bước còn lại/blocker |
|---|---|---|---|---|
| UX1 | DONE | `b03c771`; đối chiếu `origin/main` để xác minh push | Format/debug/manual đạt; analyze có 1 info CR6 sẵn có | Không còn code bắt buộc |
| UX2 | DONE | `feat(mobile): improve attendance action UX`; xác minh hash/push khi tiếp quản | Format/analyze file đạt; Hot Reload và manual USB đạt | Tech Lead xem UI; chưa làm UX3 |
| UX3 | PROPOSED | — | Chưa chạy | Chờ UX2 và Tech Lead giao |
| UX4 | PROPOSED | — | Chưa chạy | Chờ UX3 và Tech Lead giao |

Checkpoint gần nhất — UX2:

- Task và agent: UX2 — Codex, đã hoàn thành; chỉ triển khai task này.
- File đã sửa: attendance_home.dart; IMPLEMENTATION.md/README.md; tài liệu này. Không chạm Backend, Admin Web, schema hoặc API contract. Diff CR6 của người dùng trong leave_request_screen.dart được giữ nguyên và không stage.
- Kiểm tra: `dart format` file attendance; `flutter analyze --no-pub lib/features/attendance/attendance_home.dart` đạt, không có issue; `git diff --check` đạt. Không chạy automated test suite hoặc full-project analyze trong UX2.
- Manual USB `32a65649`: Hot Reload thành công; nút cố định không che tab/nội dung; tắt GPS báo lỗi có hướng dẫn bật lại; bấm liên tiếp trong lúc lấy GPS thấy nút disabled. Ngắt ADB reverse trước khi chấm công để không tạo giao dịch: nhận lỗi Backend, giữ phiên; phục hồi reverse và pull-to-refresh tải lại thành công. Font scale 1.8 vẫn cuộn tới version/build ở footer, không che nội dung; đã phục hồi font 1.15 và GPS bật. Log app trong lượt kiểm tra không có Flutter exception/overflow.
- Giới hạn: không tạo check-in/out thành công mới; chưa nghiệm thu trực tiếp trạng thái đã vào/đã ra, success/risk flags bằng giao dịch mới hoặc luồng từ chối quyền GPS. Home không có input nên không có bài kiểm tra bàn phím; keyboard/form thuộc UX4. Không xuất APK release/bàn giao.
- GitNexus: runner local thiếu, chưa có index repo dùng được; kiểm tra trực tiếp cho thấy AttendanceHome chỉ được gọi từ EmployeeShell. Không thay caller hoặc cơ chế IndexedStack.
- Runtime cuối lượt: Backend health localhost:3001/api/health trả ok; ADB reverse tcp:3001 đã khôi phục; Flutter run session `52766` giữ debug/Hot Reload. Agent sau phải xác minh lại thiết bị/process/session.
- Bước tiếp theo: Tech Lead xem UI; chỉ bắt đầu UX3 khi được giao.

Checkpoint trước — UX1 (giữ lịch sử):

- Task và agent: UX1 — Codex, đã hoàn thành.
- Commit triển khai: `b03c771`, branch `main`; commit tài liệu kế hoạch theo sau. Xác minh HEAD/origin khi tiếp quản.
- File/hunk đã sửa: attendance_home.dart (thẻ hôm nay, lối tắt, thông tin phụ); employee_shell.dart (callback dùng lại tab); IMPLEMENTATION.md/README.md (hiện trạng); tài liệu này (spec/log). Không sửa Backend/Admin Web/API/schema.
- Thay đổi của người dùng phải giữ: diff CR6 trong leave_request_screen.dart không bị chỉnh sửa hoặc đưa vào commit UX1.
- Kiểm tra: `dart format --output=none --set-exit-if-changed` hai file đạt; `git diff --check` đạt. `flutter analyze --no-pub` exit 1 chỉ vì 1 info `deprecated_member_use` có sẵn ở leave_request_screen.dart:423 (`value` của DropdownButtonFormField); không có error/warning mới trong UX1.
- Runtime: `flutter run -d 32a65649 --no-pub --dart-define=API_BASE_URL=http://127.0.0.1:3001/api` build/cài debug thành công. Manual: bốn lối tắt đúng tab, vị trí cuộn được giữ; mở trợ giúp privacy; version/build ở footer; font scale 1.8 không overflow và đã phục hồi về 1.15. Ngắt ADB reverse tạm để refresh: giữ dữ liệu/phiên, hiển thị lỗi/banner; khôi phục reverse và bấm retry tải lại thành công. Log app không ghi Flutter exception/overflow trong lượt kiểm tra.
- Giới hạn kiểm tra: không chạy automated test suite, không gửi sự kiện check-in/out hay đơn mới. Chưa nghiệm thu trực tiếp các biến thể đã check-in/đã check-out bằng giao dịch mới, hoặc màn hình thiết bị thứ hai. Không xuất APK release/bàn giao. Debug build có cảnh báo tooling Firebase/Kotlin và Java native access; không nâng dependency ngoài scope.
- GitNexus: repository này chưa xuất hiện trong MCP list_repos, runner local không có. Đã kiểm tra caller/import trực tiếp: AttendanceHome chỉ được tạo trong EmployeeShell; dùng lại IndexedStack và selection callback. Không dựa trên graph của repo khác.
- Thiết bị / Backend / debug session hiện tại (phải xác minh lại khi tiếp quản): USB `32a65649`; health localhost:3001/api/health trả ok; reverse tcp:3001 hoạt động; Flutter run session `52766` giữ Hot Reload. Các session ID chỉ dùng được trong phiên công cụ tương ứng.
- Bước tiếp theo: Tech Lead xem giao diện; chỉ bắt đầu UX2 khi được giao. Không còn việc code bắt buộc của UX1.
- Quyết định cần Tech Lead: giờ ca dự kiến/bộ đếm hoặc nhắc quên checkout vẫn là đề xuất riêng, không tự bổ sung.

## 7. Prompt giao việc cho OpenCode

```text
Bạn tiếp quản task UX<n> do Nguyễn Thành Nam giao, theo docs/MOBILE_UX_PLAN.md.
Đọc AGENTS.md và các canonical sources theo thứ tự, rồi đọc toàn bộ kế hoạch này.
Xác minh branch, HEAD, Git status, diff và log tiếp quản; không reset/ghi đè thay đổi sẵn.
Chỉ thực hiện UX<n> đã được giao, đúng acceptance criteria và vùng file chỉ định.
Giữ theme CR8, flow CR7, business rules Backend và năm tab hiện có.
Thiếu contract hoặc gặp quyết định nghiệp vụ thì báo Tech Lead, không tự mở scope.
Không chạy automated test suite hoặc xuất APK bàn giao khi chưa được yêu cầu.
Kiểm tra format/analyze và UX trên thiết bị nếu có; báo đúng giới hạn kiểm tra.
Xem diff, commit/push đúng phần task khi hoàn tất theo chỉ thị Tech Lead.
Cập nhật log tiếp quản; báo file, kiểm tra, rủi ro và bước tiếp theo rồi dừng.
```
