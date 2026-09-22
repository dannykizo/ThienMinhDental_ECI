# Thiên Minh Dental Workforce — Mobile Android

Flutter app dành cho nhân viên. Vertical slice hiện tại gồm đăng nhập, lưu phiên an toàn, xem trạng thái chấm công trong ngày và check-in/check-out văn phòng.

Phiên đăng nhập được lưu tối đa 30 ngày và gắn với một định danh thiết bị trong secure storage. Đăng nhập trên máy mới tự thu hồi phiên máy cũ; thao tác đăng xuất gọi Backend để ghi lịch sử trước khi xóa token trên máy.

Vị trí chỉ được lấy khi người dùng chủ động bấm check-in hoặc check-out. App không theo dõi GPS nền hoặc liên tục. Thời gian chính thức, geofence và risk flags đều do Backend quyết định.

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
