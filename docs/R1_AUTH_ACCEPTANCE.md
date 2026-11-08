# R1 — Đăng nhập, phiên và RBAC

Ngày kiểm tra: 2026-10-09. Trạng thái: **PARTIAL / NEEDS_DECISION**.

Tech Lead yêu cầu chạy test R1. Chỉ chạy các suite trực tiếp liên quan; không chạy toàn bộ hệ thống, không chuyển R2/custom UI, không đóng APK hoặc deploy/push.

## Rule giữ nguyên

- Mật khẩu 6–128 ký tự, không bắt buộc loại ký tự; chỉ lưu hash. Không có xem plaintext/đổi/reset mật khẩu tự phục vụ.
- JWT 15 phút; Web tối đa 24 giờ và idle 30 phút; Mobile tối đa 30 ngày. Refresh không gia hạn ngày hết phiên tuyệt đối.
- Một phiên/tài khoản cho nhân viên và global-role-only; grant Head/Leader live cho một Web + một Mobile. Membership/chức vụ không cấp quyền.
- Quyền/tài khoản/hồ sơ/grant được kiểm tra lại tại Backend. Logout/thu hồi/reuse theo SID; ngừng tài khoản/hồ sơ thu hồi cả hai kênh; cấp lại không hồi sinh phiên cũ.
- Mất mạng/500/502/503/504/429 không xóa credential; 403 nghiệp vụ không đăng xuất nhân viên. PIN đã bỏ nhưng JWT/live-session/RBAC vẫn bắt buộc.

## Môi trường và dữ liệu

- `main`, worktree có thay đổi từ các task trước và chỉnh Mobile của Tech Lead: giữ nguyên, không stage/reset.
- PostgreSQL local: mỗi lần kiểm thử tạo một database ngẫu nhiên `r1_auth_test_<uuid>`, chạy migration hiện có rồi tạo fixture Development only. Không seed hoặc sửa tài khoản nghiệm thu/nhân sự hiện hữu.
- HTTP integration khởi động bản `backend/dist/main.js` trên port tạm với database biệt lập, secret ngẫu nhiên và `NODE_ENV=production`, Origin HTTPS giả lập; SMTP/FCM tắt. Đóng đúng child process và xóa đúng database do suite tạo sau khi kiểm tra. Đây không phải nghiệm thu HTTPS/reverse proxy production thật.
- Chrome: dùng phiên Admin đang mở tại localhost, không đăng nhập thay/thu hồi phiên của người dùng. Trang Tài khoản & thiết bị tải dữ liệu, xác định Phiên hiện tại, không yêu cầu PIN.
- Android RMX5555 qua Wireless Debugging: gắn lại Flutter attach, khởi động lại app không xóa dữ liệu, đồng bộ source và Hot Reload. Quan sát trạng thái Backend tạm gián đoạn giữ credential, sau đó vào Home bằng phiên Development only đang lưu. Kiểm tra DB chỉ trả boolean: phiên Mobile còn hiệu lực, đã refresh, vừa xác thực. Không bấm chấm công/tạo đơn/đổi tài khoản.
- GitNexus chưa có index repo: dùng trace source trực tiếp theo Debugging/Impact Analysis, không dùng graph repo khác.

## Case và bằng chứng

| Nhóm | Kết quả | Bằng chứng/giới hạn |
| --- | --- | --- |
| Mật khẩu đúng/sai, tài khoản không tồn tại, chuẩn hóa identity | PASS | bcrypt + repository/service thật; sai không tạo phiên; DTO password 5 ký tự nhận HTTP 400 trên local API |
| JWT giả/hết hạn, SID sai chủ sở hữu | PASS | JWT thật + guard + PostgreSQL; HTTP thiếu xác thực nhận 401 |
| Employee không vào Web | PASS | 403 trước thay thế, Mobile cũ vẫn hoạt động |
| Ba login nhân viên đồng thời | PASS | PostgreSQL thật, chỉ một SID còn hoạt động |
| Head/Leader Web + Mobile, thay cùng kênh | PASS | Cả hai loại grant; login đồng thời thật, logout/revoke không ngắt kênh kia |
| Global Admin chưa có grant | PASS | Vẫn account-wide replacement, không tự mở ngoại lệ |
| Grant mất/thu hồi, regrant, user/employee inactive | PASS | Web bị retire, Mobile giữ theo rule; inactive retire cả hai, reactivation không hồi sinh |
| Role thay đổi khi JWT cũ còn sống | PASS | Guard đọc role hiện tại; token ADMIN cũ mất quyền Admin khi role DB đổi |
| Refresh rotation/hash/reuse/hạn tuyệt đối/idle | PASS | PostgreSQL thật; mốc hạn được điều chỉnh trong fixture, không đợi 30 ngày thực tế |
| Cookie Web và Bearer Mobile | PASS | HTTP thật: Web không trả token trong body, HttpOnly/Secure/SameSite=Lax, refresh path đúng; logout clear đúng path; Mobile không nhận cookie |
| Admin-only API | PASS | HTTP Employee nhận 403 khi đọc lịch sử/thu hồi SID; Admin cookie nhận 200; metadata regression bảo vệ hồ sơ/phân quyền không PIN |
| Rate limit/login Origin | PASS | HTTP production-mode biệt lập: hai account có bucket riêng, chuẩn hóa account; 10 lượt rồi 429 + Retry-After/CORS; Web login thiếu/sai Origin không tạo cookie/phiên |
| Web refresh cùng tab/hai tab | PASS (mô phỏng client) | Hai module instance, cookie jar và Web Lock dùng chung; trước fix bị thu hồi, sau fix một rotation. Không ép hết JWT trên phiên Chrome của người dùng |
| Web/App mất mạng/server lỗi/429/business 403 | PASS (client tests) | Credential giữ; từ chối refresh thật mới kết thúc phiên. UI Android cũng quan sát được trạng thái gián đoạn/khôi phục |
| App refresh về muộn sau logout/đổi phiên | PASS (client tests) | Trước fix callback lưu/xóa token sai; sau fix phản hồi cũ không thay credential/callback phiên mới |
| UI Head/Leader login/logout/revoke trên máy thật | NOT_RUN đầy đủ trong R1 | Policy/API đã test; không thay tài khoản đang dùng trên Chrome/Android để giả nghiệm thu UI |
| SMTP giao email thật | NOT_RUN / chưa cấu hình local | Suite cố ý tắt email; Chrome hiển thị Chưa cấu hình email. Không coi SKIPPED là đã giao |
| HTTPS/trial đa tab thật, chạy nhiều ngày, thiết bị khác | NOT_RUN | Thuộc nghiệm thu môi trường triển khai; test lifetime là kiểm tra mốc, không phải soak test 30 ngày |

## Lỗi đã sửa trong R1

1. **Web hai tab refresh đụng nhau**: promise cục bộ không đồng bộ cookie giữa tab; Backend reuse protection có thể retire phiên hợp lệ. Thêm Web Locks theo API URL, kiểm tra `/auth/me` trong lock trước rotation. Không nới rule reuse, không lưu token ở localStorage, không heartbeat. Browser không hỗ trợ Web Locks vẫn dùng single-flight cùng tab; đa tab ở fallback chưa bảo đảm. Cơ chế/secure-context: [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
2. **Refresh Mobile về muộn tác động phiên khác**: so refresh credential hiện tại với snapshot trước xử lý kết quả. Trả lỗi nội bộ `SESSION_CHANGED` (409) để tải lại, không ghi token/không callback hết phiên mới. Không thay Backend contract hay hàng đợi nghiệp vụ.
3. **Nhãn phiên idle sai**: danh sách đánh dấu EXPIRED nếu Web vượt idle, dùng cùng predicate với kiểm tra xác thực. Đọc danh sách không thu hồi/touch phiên người khác; không áp idle vào Mobile.
4. **Login rate limit không đọc được account**: middleware đăng ký trước default JSON parser của Nest nên gộp mọi account cùng IP. Đăng ký parser chuẩn trước middleware; giữ nguyên ngưỡng/key policy. HTTP test tái hiện trước fix (bucket giảm giữa account khác nhau), sau fix đạt bucket riêng/10 lượt/429.
5. **Web login đầu tiên thiếu kiểm tra Origin**: trước đây chỉ kiểm tra khi request gửi cookie, bỏ qua bước tạo cookie Web mới. Production kiểm tra thêm login clientType WEB kể cả chưa có cookie; Bearer Mobile không có cookie vẫn đăng nhập được. Không bật enforcement mới trong development.
6. **Bypass middleware qua biến thể URL**: HTTP thật tái hiện `/auth/login/` hoặc `/AUTH/LOGIN` đi vào cùng controller nhưng bỏ qua kiểm tra login Origin/rate limit vì so đường dẫn exact. Chuẩn hóa casing/trailing slash khi nhận diện endpoint auth, không đổi route/API contract. Các biến thể cùng dùng bucket normalized-account và Origin rule, được đưa vào case regression HTTP.

## Điểm cần quyết định — mật khẩu dài

**NEEDS_DECISION, chưa sửa hash/policy**: bcrypt hiện tại bỏ qua byte sau 72 byte UTF-8 trong khi DTO cho phép 128 ký tự. Diagnostic local tái hiện: hai chuỗi 73 byte có cùng 72 byte đầu nhưng khác hậu tố vẫn compare thành công. Không dùng/đổi credential thật để thử.

Hai lựa chọn đã hỏi Tech Lead: (a) giữ 128 ký tự, nâng adapter hash có phiên bản và tương thích hash cũ; (b) giới hạn mật khẩu mới tối đa 72 byte UTF-8, vẫn min 6 ký tự. Chưa có lựa chọn được duyệt; không âm thầm giảm độ dài hoặc rehash tài khoản đang có. Điểm này ngăn chốt PASS bảo mật R1 toàn bộ.

## File chạm riêng R1

- Backend: `src/main.ts`, `modules/auth/application/auth.service.ts`.
- Web: `frontend/lib/auth-api.ts` — dependency bắt buộc của lỗi refresh, không redesign.
- App: `mobile/lib/services/api_client.dart` — auth lifecycle, không chạm form nghỉ phép của Tech Lead.
- Test mới: `backend/test/r1-auth.postgres.spec.ts`, `backend/test/web-auth-refresh.spec.ts`, `mobile/test/auth_session_test.dart`. Web test dùng Vitest đã có trong Backend, không thêm runner/dependency cho Frontend.
- Tài liệu: file này, MODULE_ACCEPTANCE_PLAN, FLOWS, IMPLEMENTATION, README. Không tạo migration/schema mới trong R1.

## Kiểm tra đã chạy

- **89/89** Backend/Web targeted tests, 12 file, gồm **18** PostgreSQL/HTTP integration cases.
- **11/11** Flutter auth tests, `flutter test --no-pub test/auth_session_test.dart`; `flutter analyze --no-pub lib/services/api_client.dart test/auth_session_test.dart` không có issue. Lần đầu pub kiểm tra qua mạng bị kẹt; dừng đúng process kiểm thử rồi dùng dependency sẵn có, không nâng SDK/package.
- Backend typecheck/lint/build; Frontend typecheck/lint/static build **22 routes** đều đạt. Build artifact next-env được trả lại import development ban đầu.
- Local HTTP: health 200; me/admin-session/admin-sessions thiếu auth 401; refresh thiếu credential 401; login password quá ngắn 400. Web trang access 200 sau build.
- Đã xem diff; giữ dirty changes có trước. Không chạy suite khác hoặc coi các kiểm tra này là nghiệm thu R2–R14.

Lệnh chạy lại phần tích hợp (PowerShell, sau Backend build, chỉ PostgreSQL local development):

```powershell
cd backend
$env:R1_POSTGRES_TEST = '1'
$env:R1_API_TEST = '1'
corepack pnpm exec node --env-file=.env node_modules/vitest/vitest.mjs run test/r1-auth.postgres.spec.ts
```

Hai flag là opt-in; khi chạy test thông thường suite PostgreSQL được SKIP, không tự tạo/xóa database. Runner cần quyền tạo database local; teardown chỉ nhắm tên ngẫu nhiên đúng prefix do chính nó tạo. Nếu tiến trình bị kill cưỡng bức trước teardown, phải xác minh đúng database tạm trước cleanup, không xóa theo glob.

## Bàn giao

- Web: http://localhost:3000/dashboard/access; API: http://localhost:3001/api/health. Development server/Hot Reload và Flutter attach được giữ chạy nếu phiên công cụ còn sống.
- Không commit/push/deploy hoặc đóng APK trong R1. Credential khách/demo không đổi. Database fixture đã được teardown; screenshot chẩn đoán nằm ở logs ignored, không đưa vào Git.
- Chờ Tech Lead chốt xử lý mật khẩu dài và phần nghiệm thu UI còn thiếu. Không tự triển khai R2.
