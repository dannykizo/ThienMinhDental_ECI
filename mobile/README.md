# Thiên Minh Dental Workforce — Mobile Android

Flutter app dành cho nhân viên. Vertical slice hiện tại gồm đăng nhập, lưu phiên an toàn, chấm công văn phòng, phản hồi giải trình có ảnh bằng chứng, thực hiện phiếu công tác, gửi/theo dõi đơn nghỉ phép và hộp thư thông báo nội bộ.

App không điền sẵn tài khoản demo vào form đăng nhập. Màn khởi động có thương hiệu được hiển thị ngay trong lúc khôi phục phiên an toàn; các tab dùng chung theme, touch target, feedback và hỗ trợ Android autofill/predictive back.

Access token sống 15 phút. Refresh token xoay vòng được lưu trong secure storage để duy trì phiên tối đa 30 ngày và gắn với một định danh thiết bị. Đăng nhập trên máy mới tự thu hồi phiên máy cũ; thao tác đăng xuất gọi Backend để ghi lịch sử trước khi xóa token trên máy.

Vị trí chỉ được lấy khi người dùng chủ động bấm check-in hoặc check-out. App không theo dõi GPS nền hoặc liên tục. Thời gian chính thức, geofence, trạng thái đủ công, OT và risk flags đều do Backend quyết định. Trang chủ hiển thị rõ trạng thái lấy GPS/gửi dữ liệu, độ chính xác của mẫu GPS vừa dùng và hướng dẫn phục hồi quyền vị trí.

Trước khi check-in lần đầu, Admin phải cấu hình tọa độ văn phòng chính thức và gắn vị trí với đúng chi nhánh trên Admin Web. Development seed không tự tạo tọa độ giả.

Giải trình được tải từ Backend theo tài khoản hiện tại. Với bất thường GPS, app bắt buộc chụp ảnh và lấy một mẫu vị trí cùng thời điểm. Khi upload/gửi phản hồi gặp lỗi mạng, nội dung và đường dẫn ảnh được giữ trong secure storage/vùng dữ liệu riêng của app, sau đó tự thử lại khi màn hình được mở lại hoặc người dùng bấm `Gửi lại`.

Tab `Công tác` hiển thị các phiếu được giao cho nhân viên hiện tại. App lấy đúng một mẫu GPS khi bắt đầu và một mẫu mới khi hoàn tất; ghi chú là tùy chọn, còn ảnh hiện trường chỉ bắt buộc khi Admin cấu hình phiếu yêu cầu ảnh. Ảnh được upload qua endpoint có xác thực và có thể mở từ Admin Web.

Tab `Nghỉ phép` chỉ hiển thị đơn của tài khoản nhân viên hiện tại và cho phép gửi đơn nghỉ nguyên ngày hoặc theo khoảng ngày. Trùng ngày, kỳ công đã khóa và trạng thái duyệt/từ chối đều do Backend quyết định. App chưa suy diễn số dư phép, nghỉ nửa ngày/theo giờ hoặc quyền hủy đơn.

Tab `Hộp thư` đồng bộ thông báo theo tài khoản, hiển thị badge chưa đọc, ghi nhận thời điểm mở và yêu cầu nhân viên xác nhận riêng với tin quan trọng. Chạm push sẽ điều hướng về hộp thư; khi app đang mở, tin mới được báo bằng snackbar và danh sách được làm mới.

## Cấu hình Firebase Cloud Messaging

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
