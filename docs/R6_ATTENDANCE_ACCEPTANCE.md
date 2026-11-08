# R6 — Chấm công và chống gian lận

Ngày 2026-10-10. Trạng thái **PARTIAL**, không phải chứng nhận chống gian lận hoặc pentest production. Không tự chuyển R7.

## Quyết định Tech Lead đã duyệt

- Chặn mẫu GPS báo mock, sai số vượt ngưỡng; chặn check-in văn phòng ngoài geofence. Nhân viên gửi giải trình theo tuyến hiện có. Không lưu bản ghi chấm công hợp lệ cho request bị chặn.
- Mỗi tài khoản một khóa điện thoại. Điều chỉnh Tech Lead duyệt 2026-10-10: tự gắn thiết bị đầu tiên nếu tài khoản chưa từng đăng ký khóa; khóa mới sau khi đã có lịch sử cần Admin duyệt, PENDING cũ giữ nguyên. Sinh trắc hệ điều hành bắt buộc cho từng check-in/out. Máy không hỗ trợ không được bypass, xử lý giải trình/điều chỉnh công theo quyền hiện có.
- Theo tài khoản, mỗi phút: chuẩn bị ảnh 10, upload ảnh 20, gửi sự kiện 60. Vượt trả 429 + Retry-After; app không tự gửi lại sự kiện. Đây là cửa sổ phút cố định theo đồng hồ PostgreSQL, không phải cửa sổ trượt 60 giây.
- Giữ một cặp vào/ra mỗi ngày +07:00, chung văn phòng/hiện trường; server time là nguồn chuẩn. Checkout có GPS một lần, không ảnh; vị trí chi tiết chỉ Admin xem. Checkout ngoài văn phòng vẫn được phép nếu GPS đủ chất lượng và không báo mock. Không suy OT từ giờ ra.

## Thay đổi và bằng chứng

| Kiểm soát | Triển khai / kiểm tra |
| --- | --- |
| Đồng thời | Advisory lock chung theo nhân viên. Sửa pool starvation: đọc lịch/geofence/ảnh bằng chính transaction manager, không mượn thêm connection trong transaction đang chờ. Burst 16 check-in rồi 16 checkout: đúng một sự kiện mỗi loại, còn lại 409. |
| Phiên bị thu hồi giữa request | Recheck account + phiên MOBILE trong transaction, giữ shared row locks tới commit; ca thu hồi sau JWT guard trước khi ghi bị từ chối, không ghi công. |
| Điện thoại / chữ ký | Chưa có lịch sử đăng ký → ACTIVE với audit AUTO_BIND_FIRST_DEVICE; có lịch sử → PENDING, chỉ Admin APPROVE/REVOKE có lý do/audit. Không tự promotion PENDING cũ. Khóa EC P-256, challenge 120 giây, gắn tài khoản/phiên/thiết bị/input hash/ảnh hash; consume cùng transaction ghi sự kiện. Token hoặc khóa khác không đủ quyền chấm công sau khi đã gắn máy. |
| Ảnh / replay | Capture có owner, loại, GPS, hạn 10 phút và ngày +07. Ảnh thực tế được SHA-256 trước ký; thay ảnh sau challenge bị từ chối. Request đã commit nhưng caller bỏ response: đọc trạng thái phục hồi, không tạo cặp thứ hai. Đây không phải thử mất sóng thật hay API trả lại receipt idempotent. |
| Abuse | Counter PostgreSQL atomic, tối đa ba hàng mỗi tài khoản, dùng chung các instance và còn sau restart. Guard chạy trước upload interceptor/storage. Không đoán gian lận theo IP/VPN. |
| Android | Khóa riêng trong AndroidKeyStore, không gửi vào Dart. Per-use BiometricPrompt CryptoObject ký đúng payload Backend, strong biometric, không fallback PIN. Khóa mất hiệu lực khi thay sinh trắc; tạo lại khóa cần Admin thu hồi khóa cũ/duyệt khóa mới. Không lưu mẫu sinh trắc. API 28+; iOS NOT_IMPLEMENTED, không bypass. |
| Release transport | Main manifest tắt cleartext và app backup; debug/profile cho HTTP local để ADB reverse. Không cấu hình HTTPS production trong R6. |

## File/module đã chạm trong R6

- Backend attendance: controller/DTO/module/service; infrastructure `attendance-device-proof.ts`, `attendance-abuse.guard.ts`, `attendance-evidence.storage.ts`. Domain độc lập ORM giữ nguyên; không redesign module khác.
- Database: migration `1792540800000-attendance-device-proof.ts`, đăng ký trong `data-source.ts`. Tạo `attendance_devices`, `attendance_device_challenges`, `attendance_abuse_budgets`, partial indexes một ACTIVE/một PENDING; employee deletion cascade device để không tạo blocker mới. Không backfill duyệt máy hoặc sửa lịch sử cũ.
- Web: `components/attendance-devices.tsx`, gắn tại `app/dashboard/access/page.tsx`. Loading/error/empty; Admin đối chiếu mã khóa, lý do/xác nhận duyệt hoặc thu hồi; không thay trang khác.
- App/platform: `AttendanceSigningBridge.kt`, MainActivity, main/debug/profile manifests; `services/attendance_device.dart`, API client và attendance home. Register/check status trước GPS/camera; ký sau upload; nút xem mã khóa/tạo lại khóa; lỗi sinh trắc không được coi là thành công.
- Targeted tests: R6 PostgreSQL HTTP; cập nhật regressions R4 daily, R5 locations, attendance security, employee explanations cho contract proof; thêm Mobile attendance-device tests. Các thay đổi ngoài Backend bắt buộc để vận hành khóa thiết bị và sinh trắc đúng luồng, không phải mở thêm scope UX.
- Canonical docs và biên bản này. Worktree có nhiều thay đổi R1–R5/user từ trước; thống kê Git tổng không phải riêng R6, không reset hoặc gom commit.

## Kết quả kiểm tra

- Backend build TypeScript vào `dist/r6` riêng, typecheck/lint PASS; giữ Nest dev watch hoạt động, không dùng build xóa output live.
- Targeted Backend: **96 ca qua các lượt cuối**: R6 real PostgreSQL/HTTP 36, R4 daily 9, R5 locations 20, attendance security 11, daily policy 3, geofence 5, explanations 12. Trong 36 R6 có một ca `OPEN GAP` tái hiện tọa độ giả từ khóa đã duyệt: assertion PASS có nghĩa giới hạn còn tồn tại, không phải chống giả GPS PASS.
- Lượt gộp cuối: 76 PASS + 20 R5 skipped vì hook chuẩn bị DB timeout 40 giây khi Android build cùng lúc. R5 chạy lại riêng 20/20 PASS. Không che lỗi môi trường hoặc báo lượt gộp 96/96.
- Mobile targeted **8/8 PASS**; analyze năm file liên quan không có issue. Mock MethodChannel/test không chứng minh sinh trắc thật; full analyze trước đó còn info ngoài scope tại `test/auth_session_test.dart:94`.
- Web typecheck/lint/build PASS. Chrome đã tới trang login sau khi phiên cũ hết; chưa nghiệm thu giao diện duyệt bằng Admin hoặc tự duyệt thiết bị khách.
- Migration đã chạy trên PostgreSQL development. Health local 200; Android debug build/install/launch qua Wireless ADB thành công, Hot Reload giữ chạy. Không build release APK bàn giao, không push/production deploy.
- Database/ảnh test tách riêng có tên ngẫu nhiên, SMTP/FCM tắt; dọn đúng tài nguyên fixture. Không đổi GPS văn phòng, tài khoản/công hoặc ảnh test camera hiện hữu. Xóa database/ảnh fixture là không phục hồi qua sản phẩm, không chứa dữ liệu khách cần giữ.

## Nghiệm thu còn cần người dùng

1. Nhân viên thực hiện lần đầu trên chính điện thoại của mình: App → Chấm công (tự đăng ký, không có mục Đăng ký/xem mã khóa riêng). Tài khoản chưa từng có khóa được ACTIVE ngay. Tài khoản có khóa cũ/REVOKED hoặc PENDING cũ vẫn cần Admin tại `http://localhost:3000/dashboard/access` đối chiếu nhân viên/mã khóa trong thông báo chờ duyệt rồi duyệt có lý do. Biểu tượng khóa chỉ để Tạo lại khóa khi cần khôi phục; không xóa lịch sử hoặc tự duyệt thay Admin bằng script.
2. Thử check-in/out, hủy prompt rồi thử lại, vân tay sai/đúng; người dùng tự chạm sinh trắc. Giữ quy tắc một cặp/ngày; tài khoản đã chấm trong ngày không được reset để thuận tiện test.
3. Thu hồi máy thử/đổi thiết bị/thay sinh trắc, resume/mất Wi-Fi/Backend ngắt trên máy thật. Những ca này còn NOT_TESTED thực tế.
4. Mock provider thực tế, root/repacked APK/hook framework và bot: chưa chạy kiểm thử máy thật/pentest. Không nghiệm thu bằng các assertion giả.

## Giới hạn và rủi ro bàn giao

### Tự gắn thiết bị đầu tiên — quyết định mới 2026-10-10

Tech Lead đã duyệt bỏ chờ Admin cho lần đăng ký đầu tiên, không bỏ sinh trắc. Backend kiểm tra lịch sử dưới user row lock để hai khóa cạnh tranh không cùng ACTIVE; REVOKED không làm tài khoản thành chưa đăng ký. ACTIVE/PENDING hiện hữu không đổi. Không schema change/migration/backfill; decided_by NULL và audit AUTO_BIND_FIRST_DEVICE phân biệt tự gắn với Admin APPROVE, không giả mạo người duyệt. Chỉ lời dẫn Mobile/Web thay đổi theo trạng thái Backend; native biometric/signature không thay đổi.

Rủi ro được chấp nhận: người lấy được thông tin đăng nhập trước lần gắn đầu có thể gắn điện thoại của họ; sinh trắc OS không đối chiếu danh tính nhân viên. Sau khi gắn, khóa/máy khác vẫn bị chặn và cần Admin xử lý. Không diễn giải tự gắn là xác minh app/GPS thật.

Bổ sung 6 ca regression PostgreSQL/HTTP (lần đầu + chữ ký vẫn bắt buộc, đăng ký đồng thời cùng/khác khóa, thu hồi rồi đăng ký cùng khóa, PENDING cũ, khóa sai/hồ sơ inactive) và sửa ca replacement/Admin, Mobile widget assertion. **Chưa chạy lại test suite** theo chỉ thị hạn chế test; số PASS lịch sử phía trên không phải kết quả bản điều chỉnh này.

Kiểm tra bản điều chỉnh: Backend/Web typecheck và scoped lint PASS; Backend compile riêng dist/r6 PASS, Nest watch biên dịch 0 lỗi/health200. Mobile format/analyze hai file PASS, Android debug build/install/launch qua Wi-Fi ADB thành công, phiên Flutter run tiếp tục hoạt động để Hot Reload. Read-only EXPLAIN phát hiện tham số SQL status suy luận text/varchar khác nhau; đã thêm cast rõ ràng và EXPLAIN cả ACTIVE/PENDING đạt, không execute INSERT hoặc thay khóa/dữ liệu khách. Không chạy Web production build, test suite, release APK, commit/push hoặc triển khai production trong điều chỉnh này. Chưa nghiệm thu tự gắn lần đầu bằng tài khoản mới trên điện thoại; không xóa lịch sử tài khoản hiện tại để thử.

Phạm vi file lần điều chỉnh này: Backend `attendance-device-proof.ts`, `test/r6-attendance.postgres.spec.ts`; Web `components/attendance-devices.tsx`; Mobile `features/attendance/attendance_home.dart`, `test/daily_attendance_test.dart`; canonical `PROJECT.md`, `FLOWS.md`, `IMPLEMENTATION.md`, `README.md` và biên bản R6 này. Web/App được chạm tối thiểu để lời dẫn không còn nói mọi ACTIVE đều do Admin duyệt, không đổi native crypto hoặc module khác.

Tech Lead xác nhận luồng khóa đã suôn sẻ và đã thấy prompt vân tay trên điện thoại. Đây chưa phải bằng chứng hoàn tất tất cả ca chấm công/sinh trắc, mock provider hoặc pentest máy thật.

Tiếp nối gọn UI theo yêu cầu: bỏ Đăng ký/xem mã khóa và dialog thông tin riêng, giữ nút Tạo lại khóa với cảnh báo/xác nhận. Lỗi recovery có tiêu đề riêng, retry chỉ đăng ký khóa hiện tại, không lặp thao tác reset. Mã PENDING vẫn hiển thị trong lỗi chấm công/notice recovery; tự đăng ký lần đầu tại `_record` và Backend authorization/native biometric không đổi. Cập nhật hai widget regressions cũ sang recovery và bổ sung hủy xác nhận/không reset lại khi retry. Analyze hai file không có issue, diff check đạt, Hot Reload 20 libraries thành công trên RMX5555 qua Wi-Fi. Không chạy test suite, không thử reset khóa đang dùng trên máy thật, không đổi Backend/Web/native/DB. File chạm: attendance_home.dart, daily_attendance_test.dart, README.md, FLOWS.md, IMPLEMENTATION.md và biên bản này. Chưa push/release APK; luồng khôi phục mới vẫn cần nghiệm thu khi được yêu cầu.

### Follow-up nút khóa — 2026-10-10

Tech Lead báo sau Admin duyệt, nút khóa vẫn hiện “Chưa thể tải trạng thái hôm nay”. Read-only kiểm tra xác nhận device ACTIVE, phiên MOBILE còn hiệu lực/khớp device và health200; chưa có dòng lỗi chi tiết để xác định lỗi thực tế trên điện thoại. Source cho thấy device setup/reset dùng chung `_error` với Today và thành công setup không đọc lại Today, gây tiêu đề sai/giữ lỗi cũ.

Đã sửa riêng `mobile/lib/features/attendance/attendance_home.dart`: lỗi/notice thiết bị độc lập, tiêu đề và retry đúng thao tác; setup thành công đọc lại Today trước khi xóa lỗi attendance cũ. Pending key reset là notice, không phải tải Today thất bại. Chỉ debug build in runtime type/code/status, không token/key/fingerprint/GPS. Không sửa Backend/DB/quyền thiết bị hoặc tự đổi/duyệt lại khóa.

Thêm hai regression widget cases tại `mobile/test/daily_attendance_test.dart`, chạy đúng hai case có tên device: 2/2 PASS. Analyze attendance home sạch, Hot Reload thành công. Device error thực tế vẫn NEEDS_DIAGNOSTIC: người dùng bấm lại khóa → Đăng ký / xem mã khóa để lấy mã lỗi mới; không coi mock test/UI fix là đã sửa được mọi nguyên nhân native/session trên máy thật.

Tiếp nối: user đã bấm lại; log Android xác nhận `ATTENDANCE_DEVICE_MISMATCH` 403, không phải lỗi Today. Read-only DB chỉ có một ACTIVE binding và một live MOBILE session khớp device ID: public-key fingerprint đang gửi không khớp khóa đã duyệt. Chưa xác minh được thao tác/thời điểm khiến khóa thay đổi, không khẳng định do reinstall hoặc sinh trắc. Không tự ghi đè khóa/thu hồi bằng script. Cần Admin thu hồi binding cũ có lý do → app đăng ký khóa hiện tại PENDING → Admin đối chiếu và duyệt lại → thử sinh trắc thật. Không chọn reset key thêm khi làm quy trình này.

- **Chưa có app/key attestation**: Backend không chứng minh public key được tạo trong Keystore hoặc app là bản gốc. Khóa phần mềm được Admin duyệt và tọa độ/ảnh bịa vẫn có thể được nhận; test ghi rõ khả năng này. Play Integrity/key certificate attestation NOT_IMPLEMENTED, cần quyết định distribution/provider/config riêng. Không thêm heuristic anti-debug hoặc chặn VPN giả tạo; bản debug này không dùng làm production.
- `isMock` là tín hiệu client/framework, không phải bằng chứng vị trí thật. IP/VPN không xác nhận hay phủ định GPS; geofence chỉ tính từ tọa độ được gửi. GPS giả không bị framework báo mock vẫn là lỗ hổng còn lại.
- Sinh trắc xác nhận người có sinh trắc đã đăng ký trên máy, không đối chiếu khuôn mặt/hồ sơ nhân viên. Người khác có sinh trắc trên điện thoại vẫn có thể dùng máy đó; không bảo đảm chặn toàn bộ chấm hộ hoặc điện thoại để lại văn phòng.
- 10/20/60 hạn chế tốc độ, không ngăn DoS toàn mạng/disk. Request challenge không có budget mới (chỉ bound outstanding DB); upload tối đa 5 MB/lần, ảnh bỏ dở còn cần retention/disk monitoring/perimeter protection ở vận hành.
- Writer chấm công/adjustment và khóa kỳ còn cần rà invariants tại R7/R12. R6 không tự đổi chính sách khóa kỳ hoặc luồng phê duyệt.
- Key reset/uninstall không tự khôi phục quyền: Admin thu hồi và duyệt lại; guard fail closed có thể làm nhân viên chưa chấm được khi triển khai. Cần rollout đồng bộ và truyền đạt luồng ngoại lệ.

## Migration / rollout / rollback

Development hiện dùng PostgreSQL Docker cổng 5433; API `http://localhost:3001/api`, Web `http://localhost:3000`. Android debug qua `adb reverse tcp:3001 tcp:3001`; đổi port Wireless Debugging thì kết nối/reverse lại.

Triển khai theo thứ tự backup → migration → Backend → Web duyệt thiết bị → app mới → Admin xác minh/duyệt. APK cũ không có proof sẽ bị chặn chấm công; không công bố bản chỉ cập nhật Backend như tương thích ngược. Không tự seed ACTIVE để khách test nhanh. Production cần HTTPS thật; tunnel development không thay vận hành production.

Down migration từ chối khi đã có device rows; không xóa quyết định khóa thiết bị hoặc tắt bảo vệ âm thầm. Backup/restore và phương án rollback cả Backend/app phải được kiểm tra riêng trước production.

Lệnh targeted lặp lại (PowerShell, thư mục backend):

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.build.json --outDir dist/r6 --tsBuildInfoFile dist/r6/tsconfig.tsbuildinfo
$env:R6_POSTGRES_TEST='1'; $env:R4_POSTGRES_TEST='1'; $env:R5_POSTGRES_TEST='1'
$env:R6_API_ENTRY='dist/r6/main.js'; $env:NODE_ENV='development'
node --env-file=.env node_modules/vitest/vitest.mjs run --no-file-parallelism test/r6-attendance.postgres.spec.ts test/r4-attendance.postgres.spec.ts test/r5-locations.postgres.spec.ts test/attendance-event-security.spec.ts test/daily-attendance-policy.spec.ts test/office-geofence.spec.ts test/employee-explanations.spec.ts
```

Nguồn nền tảng: [Android biometric cryptographic authentication](https://developer.android.com/identity/sign-in/biometric-auth), [Location.isMock](https://developer.android.com/reference/android/location/Location), [Play Integrity](https://developer.android.com/google/play/integrity/overview). Không xem việc tuân theo tài liệu SDK là bằng chứng pentest đã đạt.
