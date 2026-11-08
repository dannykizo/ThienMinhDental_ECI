# Nghiệm thu tích hợp App — Nhân viên / Leader / Trưởng phòng

Ngày 2026-10-14. Tech Lead: Nguyễn Thành Nam.

## Phạm vi và kết luận

Thao tác trên điện thoại Android RMX5555 thật bằng ADB, chuyển lần lượt ba tài khoản demo; đối chiếu API/receipt/báo cáo local sau các thao tác. Đây là lượt bổ sung nghiệm thu app sau R14 local, **không phải chứng nhận production hoặc PASS mọi ca R1–R14**.

Tech Lead cho phép reset mật khẩu demo và dùng dữ liệu thử. Bước sinh trắc thật **SKIPPED_BY_REQUEST**, kế thừa nghiệm thu R6; không giả vân tay, bỏ challenge, xóa binding hoặc mở endpoint ngoại lệ. Không sửa business rule, Backend, database schema, quyền OS, không release APK, push Git hoặc xóa dữ liệu hiện có.

Các luồng trong bảng dưới đạt trên cấu hình local/thiết bị này sau khi sửa hai lỗi presentation/session. Trạng thái khác ghi rõ ở phần giới hạn.

## Kết quả máy thật

| Luồng | Bằng chứng / kết quả |
| --- | --- |
| Đăng nhập / chuyển ba vai trò | Nhân viên, Leader, Trưởng phòng đăng nhập thành công. Đăng xuất/chuyển tài khoản không giữ thông báo hệ thống của tài khoản cũ. Khôi phục phiên và mở app được kiểm tra. |
| Giải trình mất kết nối | Nhân viên nhập đơn khi API không truy cập được; hàng đợi giữ nội dung/UUID. Khôi phục reverse port và bấm thử lại tạo đúng một đơn. Leader xác nhận, Trưởng phòng duyệt; đúng hai actor thật, terminal route version 3, thông báo cho owner. |
| Ảnh giải trình / từ chối | Đơn thứ hai đính ảnh chụp màn hình app thử, không phải ảnh nhân sự thật. Offline giữ cả ảnh và nội dung; gửi lại tạo một đơn. Leader tải ảnh có xác thực, xác nhận; Trưởng phòng từ chối với ghi chú. Nhân viên thấy tên người từ chối và ghi chú trong Hộp thư. Không chụp camera mới trong lượt này. |
| Quyết định quản lý khi offline | Leader thử xác nhận OT lúc mất API: không đổi trạng thái Backend, không queue hoặc replay quyết định. Sau kết nối phải tải lại và chủ động xác nhận. |
| Phân quyền hai bước | Leader có xác nhận, không quyết định cuối; Trưởng phòng có duyệt/từ chối. Đơn đã xử lý không còn nút quyết định. Route version/confirmedBy/reviewedBy đúng dữ liệu Backend. |
| Phép nửa ngày | Ngày 15/10, 240 phút: gửi giữ 0.50 ngày, còn 9.50; Leader xác nhận vẫn giữ quỹ; Head duyệt chuyển sang đã dùng. Nhân viên hủy đơn đã duyệt có lý do: CANCELLED, quỹ trở lại 10 ngày, đang chờ 0. Chính sách thử không đổi chính sách cũ. |
| OT / đối chiếu công | Phiếu riêng 90 phút ngày 14/10 qua Leader → Head. Báo cáo OT=90; công thực tế=0, chưa có check-in/out. Sau sửa UI, Hôm nay hiển thị 1h 30p OT đã duyệt dù chưa check-out; không tạo giờ công giả. |
| Công tác | Phiếu CT-202610-0002 đúng người nhận; app bắt đầu rồi hoàn tất với GPS tại từng sự kiện và ghi chú. Backend COMPLETED. Daily vẫn NOT_CHECKED_IN, giờ vào/ra null, workedMinutes=0: tiến độ phiếu không cộng thêm công ngày. |
| Theo dõi của quản lý | Leader/Head xem các màn theo phạm vi; không có quyền Admin, export Excel, sửa/chốt công. DEV-FIELD-R4 xuất hiện hợp lệ do đã là thành viên team demo từ 10/10, không phải rò rỉ scope. |
| Push Head foreground | Thông báo hệ thống Android kênh announcements/importance 4 và cập nhật trong app. Đọc không tự xác nhận; bấm xác nhận mới có acknowledgedAt. |
| Push Head background | Đưa app về Home, gửi cá nhân, Android có NotificationRecord. Chạm thông báo mở đúng chi tiết theo API; readAt có, acknowledgedAt vẫn null trước thao tác xác nhận. |
| Push Head cold process | Xác minh pid không tồn tại và package stopped=false, không force-stop. Tin COLD_VERIFIED tới Android; chạm khởi động app, khôi phục phiên và mở đúng thông báo. Không dùng FCM SENT riêng làm bằng chứng nhận. |
| Push Leader sau đăng nhập lại | Gửi khi Leader đang logout: SKIPPED/NO_ACTIVE_DEVICE, không gửi nhầm Head đang dùng máy. Sau đăng nhập Leader, retry tới thiết bị đủ điều kiện: system notification và mở đúng chi tiết. |
| Thu hồi phiên trên màn chi tiết | Admin thu hồi đúng một phiên MOBILE demo; Leader bấm xác nhận thông báo. Sau sửa app về Login với nguyên nhân phiên hết hiệu lực; không giữ chi tiết riêng tư; acknowledgedAt vẫn null. Không coi lỗi kết nối là thu hồi phiên. |
| Kỷ luật / thu hồi trên app | Ban hành WARNING synthetic cho DEMO-NV; nhân viên mở và xác nhận, readAt/acknowledgedAt khác nhau. Thu hồi qua quyết định khi app ở nền: Android nhận push, chạm mở chi tiết thu hồi có lý do, xác nhận được. Hộp thư giữ cả tin gốc và tin thu hồi; không khóa tài khoản hay sửa công. |

## Hai lỗi đã sửa

1. `mobile/lib/features/attendance/attendance_home.dart`: OT đã được Backend duyệt bị ẩn cho tới khi có check-out. Bỏ điều kiện check-out chỉ ở chỉ số OT; giữ điều kiện giờ làm thực tế. Hai widget tests cho NOT_CHECKED_IN/CHECKED_IN với 90 phút OT. Máy thật hiển thị `1h 30p`, không có giờ vào/ra.
2. `mobile/lib/app.dart`: đổi `home` không loại bỏ route chi tiết/dialog đã push khi phiên kết thúc. Navigator được định danh theo user + revision phiên; clear user/token/capability rồi thông báo UI trước cleanup native/storage. Login phiên mới cũng loại stack cũ; badge/network/capability refresh không tự reset navigation. Bốn tests kiểm tra kết thúc phiên, logout, giữ stack khi mất mạng/cập nhật badge, và phiên mới cùng identity. Đã kiểm lại thu hồi phiên thực trên điện thoại.

Không đổi API/schema/permission hoặc refactor các module khác. `attendance_home.dart` và một số test đang có thay đổi R4/R6 trước lượt này: chỉ bổ sung hunk OT, không nhận toàn diff là phần việc mới.

## Kiểm tra có mục tiêu

- `session_navigation_test.dart`: **4/4 PASS**.
- `auth_session_test.dart`: **11/11 PASS** — refresh đồng thời, 429/5xx/mất mạng giữ phiên, revoked xóa phiên, business 403 không logout, refresh cũ không hồi sinh/ghi đè phiên mới.
- Hai ca `approved OT is visible before checkout` trong `daily_attendance_test.dart`: **2/2 PASS**.
- Tổng **17 ca riêng biệt**, không cộng các lượt chạy lại. Không chạy toàn bộ test dự án.
- Dart analyze bốn file code/test liên quan: **No issues found**. Scoped `git diff --check` PASS. Flutter attach/Hot Restart biên dịch và chạy bản sửa trên điện thoại.
- Không build/cài lại APK trong lượt này. Bản APK đã cài chưa được đóng lại với hai bản sửa; chúng đang được áp dụng trong phiên debug bằng Hot Restart. Cold-launch từ APK cũ sau khi phiên debug kết thúc cần chạy/build debug từ source mới trước khi coi là bản sửa hiện hành.
- Một lệnh chạy lại dùng nhầm bộ lọc `--plain-name` với biểu thức regex được dừng, không tính là PASS; lệnh đúng với bộ test nêu trên hoàn tất. Một thử cold đầu tiên còn pid nên không tính cold PASS; chỉ ca COLD_VERIFIED có process-absent evidence được tính. GET chi tiết kỷ luật không tồn tại trả HTML 404 không được coi là kết quả nghiệm thu; receipt và UI dùng endpoint hợp lệ.

Chạy lại từ `mobile/`:

```powershell
flutter test --no-pub --concurrency=1 test/session_navigation_test.dart test/auth_session_test.dart --reporter expanded
flutter test --no-pub test/daily_attendance_test.dart --plain-name "approved OT is visible before checkout" --reporter expanded
dart analyze lib/app.dart lib/features/attendance/attendance_home.dart test/session_navigation_test.dart test/daily_attendance_test.dart
```

## Dữ liệu development-only để đối soát

Ba username: `nv@demo.local`, `leader@demo.local`, `tp@demo.local`. Mật khẩu tạm đã reset theo chỉ thị, chỉ lưu local ignored/bàn giao riêng, không ghi vào tài liệu Git. Không reset Admin hoặc nâng quyền demo ngoài cấu hình đã có. Lượt đăng nhập Admin phục vụ test có thể thay phiên Web cũ theo policy hiện hữu.

| Bản ghi thử | ID / kết quả cuối |
| --- | --- |
| Giải trình được duyệt | 219a9841-b304-4afc-9aa3-bc0b318fe0fb / APPROVED |
| Giải trình có ảnh bị từ chối | 303ff3e0-7512-40c8-b001-f0b0e90e7453 / REJECTED |
| Phép nửa ngày | ac96a74a-5320-43f4-875d-4f42f017b06f / CANCELLED |
| OT 90 phút | d5bfc722-be01-459f-bfeb-ee80bc9bd790 / APPROVED |
| Phiếu công tác CT-202610-0002 | 34d9e602-0c75-4afb-846c-b844342e42c2 / COMPLETED |
| Cảnh cáo thử | 9d454051-4a24-47fb-88c7-c9b81f07cce0 / REVOKED, không phải vi phạm thật |
| Tin cảnh cáo / thu hồi | badca43b-e5a9-482c-bc13-4795c1cb2b15 / 5a553aa5-f649-4eb0-82b6-7926f6059af7, cả hai đã xác nhận |
| Head COLD_VERIFIED | 8fcc6b58-fdf1-48ba-9516-986b0ad9190c, đã mở/đọc, chưa tự ACK |
| Leader background / revoked action | b2b37a53-f6a2-43b3-9f92-d7fd7608f1c2, đã đọc, ACK null |

Đã thêm tuyến OT riêng cho DEMO-NV khi chưa có, dùng cùng team/Leader/Head demo đã xác định, không đổi tuyến giải trình/phép hoặc đơn cũ. Chính sách thử `MOBILE_UAT_20261014` (300509a1-d20c-4191-9886-9550b8c46e07): 480 phút/ngày, 4800 phút/năm, cho nửa ngày/giờ/hủy đã duyệt; dữ liệu synthetic ghi rõ Development Only. Khách hàng/phiếu/notice cá nhân synthetic giữ để đối soát, không gửi ALL.

Log UI/API/Android notification và screenshot app nằm trong `logs/mobile-uat-*` ignored; local helper `logs/mobile-uat.cjs` không thuộc source bàn giao. File trạng thái helper chứa credential/token riêng: không publish hoặc commit. Screenshot phát sinh chứa picker/launcher/password-manager đã dọn đúng file local; không xóa ảnh gốc trên điện thoại. Một ảnh riêng tư bị chọn nhầm đã bỏ khỏi form trước submit, không upload.

## Giới hạn và bước còn lại

- Sinh trắc thật skip theo chỉ thị, không kiểm lại camera check-in/timemark, fake GPS/root/repacked app/attestation, ngày mới hoặc mọi tình huống anti-fraud; kết quả R6 trước đó và OPEN GAP vẫn giữ nguyên.
- Không thay đổi quyền OS để thử permission-off, DND, battery restriction, màn khóa lâu, force-stop; chưa chứng nhận release hoặc các máy Android/iOS khác. Push được chứng minh trên **một thiết bị/cấu hình hiện tại**, không hứa luôn tức thì.
- Lượt này kiểm dữ liệu daily/monthly JSON liên quan app, không kiểm lại mọi Excel/chốt kỳ/backup hoặc nghiệm thu HCNS/Kế toán; kết quả R12/R14 cũ có biên bản riêng.
- Không thử hết nhánh sai mật khẩu, hết hạn grant, mọi lỗi công tác/partial leave hoặc tài khoản ngoài phạm vi trên điện thoại; các targeted API tests trước không được đổi nhãn thành UI PASS.
- Chưa có VPS/domain/TLS/public API production; bcrypt giới hạn byte/mật khẩu dài vẫn NEEDS_DECISION theo R1. Không đóng toàn bộ các PARTIAL cũ.
- Backend localhost:3001/api, Web localhost:3000, PostgreSQL development và phiên Flutter attach giữ chạy. Wi-Fi ADB mất kết nối/mDNS không tìm thấy sau lần pause; dùng USB serial 32a65649 + reverse 3001, không quét cổng hay bỏ pairing.
- Bước tiếp theo cần chỉ thị: review diff, cập nhật bản debug từ source để hai bản sửa tồn tại qua cold launch, rồi release/production gates nếu được giao; không tự phát hành APK hoặc go-live.
