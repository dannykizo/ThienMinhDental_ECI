# R11 — Thông báo và push

Mốc gốc 2026-10-13: **PARTIAL / NEEDS_PHONE_VERIFICATION**. Backend logic đã kiểm có mục tiêu; Firebase đã cấu hình sau phê duyệt. Nội dung dưới ghi trạng thái tại lượt đó, không thay thế bổ sung máy thật ngày 14/10.

## Bổ sung máy thật 2026-10-14

**PASS trên RMX5555/cấu hình local hiện tại**: Head nhận Android system notification foreground, background và cold process (pid absent, stopped=false, không force-stop), chạm mở đúng tin sau xác thực/khôi phục phiên. Leader logout không nhận nhầm tin trên account Head; đăng nhập lại/retry nhận thông báo nền đúng người. DEMO-NV nhận tin thu hồi kỷ luật lúc app ở nền. Đã đối chiếu Android NotificationRecord, UI và Backend receipt; đọc không tự ACK, thao tác xác nhận tạo timestamp riêng. Phiên Leader bị thu hồi không ghi ACK và sau sửa app trở về Login, bỏ route riêng tư. Không đếm provider SENT hoặc inbox đơn thuần thành phone PASS.

Chi tiết/dữ liệu/bản sửa tại [nghiệm thu app tích hợp](MOBILE_INTEGRATED_ACCEPTANCE.md). Không phát hành APK mới; hai bản sửa Mobile được áp dụng qua Hot Restart. Quyền tắt/DND/battery policy/force-stop, thiết bị khác và release/production vẫn **NOT_RUN**; không tự đóng toàn bộ R11 hoặc hứa giao ngay tuyệt đối. Phần “Next” bên dưới là lịch sử trước bổ sung này.

## Đã kiểm / sửa

- 18/18 targeted Backend cases PASS: 10 disposable PostgreSQL/HTTP + 8 audience/status/push payload/session regressions. Backend noEmit/scoped ESLint/isolated compile `dist/r11` PASS. Không chạy full suite hoặc release APK.
- Department recipients dùng phân công có hiệu lực tại publish theo ngày Việt Nam (bao gồm ngày kết thúc), cả chính/kiêm nhiệm, branch active, deduplicate. Trước đây chỉ effective_to NULL, nhận nhầm phân công tương lai và bỏ phân công còn hạn đã có ngày kết thúc. ALL vẫn snapshot employee active theo rule hiện hữu, không tự thêm điều kiện account active cho inbox.
- Publish recheck target/content, không phát draft của phòng/nhân sự đã inactive; snapshot sau publication không tự thêm nhân viên mới.
- Read/ack dùng shared announcement lock trước recipient write lock, serialize với withdraw. Chỉ đọc không tự acknowledge; list/push không tự đọc; retry/concurrent ack giữ timestamp đầu, người ngoài danh sách bị chặn. Thu hồi ẩn khỏi mine nhưng giữ receipt/audit để đối soát.
- Trim/null/UUID validation tránh empty text/500 input. DTO PATCH required-if-present; không đổi payload normal API.
- Registration nhận authSessionId từ JWT guard có sẵn, yêu cầu cùng MOBILE session/device với body, không chỉ tìm bất kỳ Mobile session của user. Advisory token lock tránh hai account đồng thời đăng ký cùng FCM token gây unique 500. Token rotation giữ một user/device record; revoked session bị chặn.
- R10 protected discipline notice/management privacy/SQL push tracking fix giữ nguyên. Không thay payroll, attendance, role grants hoặc auto-reminder policy.

Lượt đầu có 4 nhóm lỗi thực (department selection/recheck, validation, token race) và fixture lỗi chọn cột id không tồn tại ở receipt + Web session chưa đáp ứng PQ2. Sau đó fixture revoke_reason vượt varchar40 được sửa thành code thử nghiệm. Final18 PASS, không cộng reruns. Disposable DB `r11_push_test_<UUID>`, local-development guard, child API/port/JWT riêng; SMTP/FCM deliberately disabled, fake tokens và synthetic accounts, teardown chỉ xóa owned DB/process. Không publish ALL test tới personnel đang dùng.

## Điện thoại và Firebase thực tế

- ADB nhận USB RMX5555 serial32a65649; reverse3001 đã khôi phục, Backend health200. Android User0 POST_NOTIFICATIONS đã granted=true sau Tech Lead tự cấp; User999 là profile app chưa cài, không dùng nó làm kết quả nghiệm thu.
- Wireless mDNS quảng bá 192.168.1.33:38153 nhưng connect bị refused10061; chưa chuyển Wi-Fi, không quét port/bật adb TCP/IP hoặc bỏ pairing. USB vẫn hoạt động.
- Tech Lead cung cấp project `thienminhdental-ciproject`, Chrome đã đăng nhập. Đã đăng ký Android `vn.thienminh.thien_minh_dental_workforce` với nickname Thiên Minh Workforce Android; Google-services JSON tải tại Downloads, metadata xác nhận đúng project/package. Không in API key/JSON trong chat hoặc đưa credential vào Git.
- Download-event tool bị timeout nhưng file thật đã tải; đã kiểm file và không click tải lại mù quáng. Tab cũ mất debugger; mở tab mới cùng Chrome và verified app đã tồn tại.
- Tech Lead tự chấp nhận Terms rồi xác nhận rõ tạo tài khoản gửi push và khóa Backend. Đã tạo dedicated `thienminh-fcm-sender`, IAM UI xác nhận chỉ có `Firebase Cloud Messaging API Admin` (`roles/firebasecloudmessaging.admin`). Một JSON key được tải rồi chuyển ra ngoài repository; không Owner/Editor, không nâng billing hoặc bật database/hosting. FCM HTTP v1 đã enabled sẵn; Legacy vẫn disabled.
- Backend `.env` bật FCM/project/path credential; key nằm tại thư mục riêng `C:/Users/nguye/.thienminh-secrets/` ngoài Git. OAuth credential validation PASS, không in access token/private key. Restart đúng Nest watcher/API của repository; Backend health 200, watch compile 0 errors. Admin hiển thị Firebase đã sẵn sàng nhưng chưa có thiết bị đăng ký tại thời điểm kiểm tra.
- Mobile public options được tạo từ Google-services JSON đúng package vào `mobile/.env.firebase.local.json`. Cả hai file local được `git check-ignore` xác nhận bỏ qua. Debug build/install/VM attach PASS trên USB; Firebase DEFAULT initialization được log xác nhận. Không sửa code Mobile/native hoặc nâng dependency, không phát hành release APK.
- Lần cài debug đầu bị `INSTALL_FAILED_VERIFICATION_FAILURE`; Flutter CLI tự uninstall/reinstall và cài thành công. Đã báo Tech Lead ngay: dữ liệu đăng nhập/khóa local có thể mất, Backend không bị xóa. Android notification permission sau reinstall hiện false, cần Tech Lead tự cấp lại và đăng nhập demo; không tự grant permission hoặc bỏ xác minh cài đặt. Cảnh báo Firebase Core/Kotlin Gradle compatibility vẫn còn.
- Screenshot local ignored `logs/r11-google-cloud-terms-accepted.jpg` và `logs/r11-fcm-account-created.jpg`. Không phát hành ảnh/account metadata công khai.

## File / phần còn lại

Changed: Announcements service/controller/DTO; session regression và new `backend/test/r11-announcements.postgres.spec.ts`; canonical PROJECT/FLOWS/IMPLEMENTATION/README + acceptance docs. Local Backend env/Mobile public defines bổ sung để FCM hoạt động. Không chạm Auth module: dùng decorator CurrentSessionId có sẵn. Không schema/migration, Web redesign hoặc sửa Mobile/native; chỉ rebuild/install debug để áp dụng cấu hình. Preserve user dirty tree/R1–R10, không commit/push.

Next: Tech Lead đăng nhập/cấp lại quyền trên bản debug → register token/readiness → Admin gửi **tin cá nhân synthetic** đúng employee đang test → Home/lock/cold process (không force-stop), verify system display + tap đúng authorized inbox + explicit read/ack → record receipt/phone evidence. Thêm foreground/permission off/session revoke/recovery cases; không dùng company-wide spam hoặc real HR decision để thử. Chưa gửi provider message khi chưa có eligible device; không đếm initialization là delivery PASS.

Platform limits: [Firebase Flutter receive](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages) yêu cầu app mở ít nhất một lần; Android force-stop từ Settings phải mở lại, DND/kênh/quyền/battery policy có thể ảnh hưởng hiển thị. [FCM IAM role](https://docs.cloud.google.com/iam/docs/roles-permissions/firebasecloudmessaging) và [Firebase send permission](https://firebase.google.com/docs/projects/iam/permissions) mô tả role/message send. Không hứa push tức thời tuyệt đối.

Nhắc checkout vẫn NOT_IMPLEMENTED/policy pending, không tự mở rộng trong R11 này. Không tự chuyển R12 khi còn chưa có bằng chứng push máy thật.
