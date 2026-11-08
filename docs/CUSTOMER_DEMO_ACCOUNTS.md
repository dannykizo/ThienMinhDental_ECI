# Bộ tài khoản nghiệm thu khách hàng

Tạo ngày 2026-10-07 trên database development hiện tại. Đây là tài khoản demo, không phải nhân sự thật hoặc tài khoản production. Mật khẩu được bàn giao riêng, không lưu trong Git.

| Vai trò | Đăng nhập | Mã nhân viên | Kênh sử dụng |
| --- | --- | --- | --- |
| Trưởng phòng | `tp@demo.local` | `DEMO-TP` | Web quản lý và app |
| Leader | `leader@demo.local` | `DEMO-LEADER` | Web quản lý và app |
| Nhân viên | `nv@demo.local` | `DEMO-NV` | App nhân viên |

## Phạm vi và luồng nghiệm thu

- Phòng riêng `DEMO-UAT` — **Phòng nghiệm thu (Demo)**, thuộc phân công chi nhánh HCM hiện có.
- Team riêng `DEMO-UAT-TEAM` — **Team nghiệm thu (Demo)**, thuộc phòng trên. Leader và Nhân viên là thành viên team; Trưởng phòng quản lý phòng.
- Cả ba tài khoản có role nền `EMPLOYEE`. Trưởng phòng có grant `DEPARTMENT_HEAD` trong phòng demo; Leader có grant `TEAM_LEADER` trong team demo. Không có quyền Admin hoặc quyền quản lý nhân sự thật.
- Hai grant là bổ nhiệm `TEMPORARY`, không đặt ngày hết hạn để không tự ngắt quyền trước buổi nghiệm thu. Giữ tài khoản hoạt động cho tới khi Tech Lead yêu cầu kết thúc đợt test; không tự dọn như fixture QA trước đây.
- Đã cấu hình riêng cả tuyến giải trình và nghỉ phép cho `DEMO-NV`: **Nhân viên gửi → Leader xác nhận → Trưởng phòng quyết định**. Không cấu hình tự duyệt cho Leader/Trưởng phòng.
- Không tạo đơn, thông báo hoặc dữ liệu chấm công giả. Khách bắt đầu bằng cách đăng nhập Nhân viên trên app và tự gửi đơn, rồi chuyển sang hai tài khoản quản lý để xử lý.

## Điều kiện sử dụng

- Backend demo và PostgreSQL phải hoạt động. Khách dùng từ Internet cần Tunnel trỏ tới đúng Backend/database này; bộ tài khoản không tự được sao chép sang database production khác.
- Nhân viên bị từ chối đăng nhập Web quản lý là hành vi đúng, không phải lỗi mật khẩu.
- Một tài khoản quản lý được dùng một phiên Web và một phiên Mobile cùng lúc. Đăng nhập mới cùng kênh thay phiên cũ theo policy hiện tại; nên tránh nhiều người cùng dùng một tài khoản trên nhiều điện thoại.
- Email demo không phải hộp thư thật. Không dùng bộ này cho vận hành thật; mật khẩu demo không thay thế credential production.
- Khi kết thúc thử nghiệm, Admin thu hồi grant của hai quản lý và ngừng làm việc ba hồ sơ demo bằng chức năng có audit. Không xóa lịch sử đơn đã xử lý.

## Kiểm tra đã thực hiện

- Trưởng phòng và Leader đăng nhập thành công trên cả API Web (cookie) và Mobile (JWT).
- Grant hiện hành chỉ thuộc phòng/team demo; không có quyền quản trị tổ chức. Web login không làm mất phiên Mobile của hai quản lý.
- Nhân viên đăng nhập Mobile thành công, không có grant quản lý; Web trả `WEB_ACCESS_DENIED` và phiên Mobile vẫn hoạt động.
- Backend lưu cả hai tuyến mặc định cho Nhân viên. Các phiên dùng để kiểm tra đã đăng xuất; ba tài khoản và hai grant vẫn hoạt động.
- Chỉ kiểm tra API và dữ liệu thiết lập; không chạy automated test suite, không build app/APK hoặc thay đổi logic/UI.
