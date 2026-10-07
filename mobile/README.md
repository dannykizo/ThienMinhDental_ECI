# Thiên Minh Dental Workforce — Mobile Android

Flutter app dành cho nhân viên. Vertical slice hiện tại gồm đăng nhập, lưu phiên an toàn, chấm công văn phòng, phản hồi giải trình có ảnh bằng chứng, thực hiện phiếu công tác, gửi/theo dõi đơn nghỉ phép và hộp thư thông báo nội bộ.

App không điền sẵn tài khoản demo vào form đăng nhập. Màn khởi động có thương hiệu được hiển thị ngay trong lúc khôi phục phiên an toàn; các tab dùng chung theme, touch target, feedback và hỗ trợ Android autofill/predictive back.

Mobile CR8 chỉ thay đổi presentation layer: bảng màu, typography sans-serif và các panel loading/error/empty dùng chung được đồng bộ với Admin Web. App không sao chép chức năng quản trị; khi refresh lỗi nhưng đã có dữ liệu, dữ liệu gần nhất tiếp tục hiển thị cùng cảnh báo thử lại.

Access token sống 15 phút. Refresh token xoay vòng được lưu trong secure storage để duy trì phiên tối đa 30 ngày và gắn với một định danh thiết bị. Đăng nhập trên máy mới tự thu hồi phiên máy cũ; thao tác đăng xuất gọi Backend để ghi lịch sử trước khi xóa token trên máy. App chỉ xóa token khi Backend trả phản hồi xác thực cho biết phiên không còn hợp lệ. Mất kết nối radio, timeout hoặc Backend/gateway tạm ngắt giữ nguyên token và hiển thị trạng thái riêng cùng nút thử lại; phiên bị Admin thu hồi, thay thế bởi thiết bị khác hoặc khóa theo vòng đời nhân viên sẽ quay về đăng nhập với nguyên nhân cụ thể. Version/build hiển thị trên màn đăng nhập và trang Hôm nay được đọc trực tiếp từ package đã cài.

Vị trí chỉ được lấy khi người dùng chủ động bấm check-in hoặc check-out. App không theo dõi GPS nền hoặc liên tục. Thời gian chính thức, geofence, trạng thái đủ công, OT và risk flags đều do Backend quyết định. Sau mỗi lần chấm công thành công, trang chủ hiển thị vị trí văn phòng được Backend đối chiếu, khoảng cách tới tâm, bán kính cấu hình (tối đa 100 m), độ chính xác GPS và trạng thái trong/ngoài vùng; app không tự tính geofence hoặc hiển thị tọa độ chi tiết.

Trước khi check-in lần đầu, Admin phải cấu hình tọa độ văn phòng chính thức và gắn vị trí với đúng chi nhánh trên Admin Web. Development seed không tự tạo tọa độ giả.

Giải trình do nhân viên chủ động tạo, chọn ngày/loại vấn đề/nội dung; có thể chụp hoặc chọn một ảnh, không bắt buộc GPS/ảnh. Khi upload/gửi gặp lỗi mạng, hàng đợi nhân viên giữ nội dung/ảnh theo owner và UUID ổn định, sau đó thử lại theo flow hiện có. Đơn cá nhân hiển thị bước/người xử lý/thời gian/ghi chú cùng chi tiết ảnh và lịch sử.

PQ4: tài khoản được Admin cấp quyền quản lý hiện hành có lối vào **Xử lý giải trình** trên Hôm nay và biểu tượng quản lý tại tab Giải trình. Danh sách chỉ dùng quyền đọc Backend; Leader xác nhận rồi Trưởng phòng quyết định theo `canConfirm`/`canReview`, không có nút Admin duyệt thay. Ghi chú/lý do là tùy chọn. Grant hiện hành được kiểm tra lại khi mở/làm mới/resume; quyết định gửi `expectedVersion` và yêu cầu tải lại khi đổi tuyến/mất quyền hoặc kết quả mạng chưa xác định. Quyết định quản lý không nằm trong hàng đợi offline và không tự gửi lại. Ảnh có Bearer authentication, chỉ tải từ endpoint cùng Backend và không lưu ra thư viện ảnh. Thiếu grant/tuyến: Admin cấu hình tại Web Tổ chức & phân quyền/Giải trình trước; không tự nâng quyền cho tài khoản demo nhân viên. Cần Backend/migration PQ3, không thêm migration PQ4.

Tab `Công tác` hiển thị các phiếu được giao cho nhân viên hiện tại bằng mã `CT-YYYYMM-NNNN` do Backend tự cấp. Danh sách và chi tiết trình bày địa điểm thực hiện, khách hàng/phòng khám, thông tin liên hệ, người phụ trách và đánh dấu khi chính người đang đăng nhập là người phụ trách; app không sửa khách hàng hoặc danh sách thành viên. App lấy đúng một mẫu GPS khi bắt đầu và một mẫu mới khi hoàn tất; ghi chú là tùy chọn, còn ảnh hiện trường chỉ bắt buộc khi Admin cấu hình phiếu yêu cầu ảnh. Ảnh được upload qua endpoint có xác thực và có thể mở từ Admin Web.

Tab `Nghỉ phép` chỉ hiển thị đơn của tài khoản nhân viên hiện tại, số dư theo chính sách và các lựa chọn thời lượng được Backend cho phép. Nhân viên có thể gửi đơn cả ngày, nửa ngày hoặc theo giờ và hủy đơn khi trạng thái/chính sách cho phép. Trùng ngày, kỳ công đã khóa, số phút sử dụng, số dư và quyền hủy đều do Backend quyết định; app không tự suy diễn chính sách.

Tab `Hộp thư` đồng bộ thông báo theo tài khoản và hiển thị rõ phạm vi do Backend trả về: toàn công ty, phòng ban hoặc cá nhân. Tin chưa đọc có badge riêng; tin quan trọng được gắn nhãn và chỉ hoàn tất khi nhân viên chủ động xác nhận. Chạm push sẽ điều hướng về hộp thư; khi app đang mở, tin mới được báo bằng snackbar và danh sách được làm mới. App hiển thị riêng trường hợp chưa cấu hình Firebase, chưa cấp quyền thông báo hoặc chưa nhận được token thiết bị.

## Cấu hình Firebase Cloud Messaging

Android push readiness (2026-10-07) bổ sung kênh `announcements` importance HIGH, icon thông báo riêng và native foreground notification; background do FCM xử lý. Tap mở đúng tin sau khi API xác thực quyền. Hộp thư báo tình trạng cấu hình, quyền/kênh, đăng ký và Backend push; có nút kiểm tra lại, mở Cài đặt thông báo và thông báo thử **local-only**. Quyền/banner/âm thanh do người dùng kiểm soát. Backend không gửi tới máy thiếu phiên Mobile còn hiệu lực. Đây là sửa code/readiness, không thay thế kiểm tra push thật trên điện thoại; xem `docs/PUSH_ACCEPTANCE.md`. Nhắc check-out chưa triển khai trong khi chờ chốt policy.

Hộp thư vẫn hoạt động khi chưa có Firebase. Để nhận push thật, Backend cần `FIREBASE_PUSH_ENABLED=true`, `FIREBASE_PROJECT_ID` và `GOOGLE_APPLICATION_CREDENTIALS` trỏ tới service-account JSON nằm ngoài repository. Mobile nhận cấu hình public bằng các dart define sau:

```powershell
flutter run -d <device-serial> `
  --dart-define=API_BASE_URL=http://127.0.0.1:3001/api `
  --dart-define=FIREBASE_ANDROID_API_KEY=<api-key> `
  --dart-define=FIREBASE_ANDROID_APP_ID=<app-id> `
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=<sender-id> `
  --dart-define=FIREBASE_PROJECT_ID=<project-id>
```

Không commit service-account JSON hoặc secret Firebase vào repository. Nếu thiếu cấu hình, Mobile hiển thị rõ rằng push chưa bật thay vì giả vờ đã giao nhận.

## Tài khoản development-only

- Email: `employee@demo.thienminh.local`
- Mật khẩu: `EmployeeDemo@2026`
- Role: `EMPLOYEE`

Tạo lại bằng `pnpm --dir backend seed:dev`. Không sử dụng credential này ở staging/production.

## Chạy qua USB

Backend phải chạy tại port 3001. Khi điện thoại đã bật USB debugging:

```powershell
adb reverse tcp:3001 tcp:3001
flutter run -d <device-serial> --dart-define=API_BASE_URL=http://127.0.0.1:3001/api
```

## Chạy qua Wi-Fi debugging

Điện thoại và máy tính phải cùng mạng Wi-Fi. Kết nối USB một lần để chuyển ADB sang TCP/IP:

```powershell
adb -s <usb-serial> tcpip 5555
adb connect <device-ip>:5555
adb -s <device-ip>:5555 reverse tcp:3001 tcp:3001
flutter run -d <device-ip>:5555 --dart-define=API_BASE_URL=http://127.0.0.1:3001/api
```

Trong terminal Flutter, nhấn `r` để Hot Reload. Reverse port mất khi thiết bị hoặc ADB khởi động lại, khi đó chạy lại lệnh `adb reverse`.

## APK debug

```powershell
flutter build apk --debug --dart-define=API_BASE_URL=http://127.0.0.1:3001/api
```

APK được tạo tại `build/app/outputs/flutter-apk/app-debug.apk`. Bản debug này dùng HTTP local và ADB reverse; không phải cấu hình production.

Trước khi bàn giao APK nội bộ, kiểm tra trên thiết bị thật: cold start/khôi phục phiên, logout/login và validation rỗng, năm tab chính, mở/đóng các màn chi tiết và form, pull-to-refresh, trạng thái đọc/xác nhận thông báo, log Flutter không có exception/overflow và Backend health trả `200`.

## PQ5 — đồng bộ quản lý

Từ Hôm nay: Xử lý nghỉ phép / Theo dõi phạm vi quản lý theo capability live; Theo dõi tuyến đơn nghỉ của tôi là read-only cho employee. Leader chỉ xác nhận, Head chỉ định quyết định cuối; từ chối cần lý do ≥5 ký tự, payload expectedVersion. Mạng/403/409 bỏ cache actionable và cần tải lại, không queue/retry quyết định. Scoped reads không mở chỉnh công/quản trị/chốt kỳ/export hoặc lộ GPS/ảnh công tác/body thông báo riêng tư. Admin cấu hình grant/tuyến phép riêng trên Web, không tự cấp cho demo. Cần migration/Backend PQ5; giữ năm tab và form nghỉ phép Tech Lead chỉnh. Hot Reload với model mới có thể cần Hot Restart để khởi tạo lại dữ liệu capability; không xuất APK bàn giao.
