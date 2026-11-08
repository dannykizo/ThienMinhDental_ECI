# R10 — Kỷ luật cá nhân/tập thể

2026-10-13. **PARTIAL**: core API/DB và Chrome popup PASS; chưa toàn luồng mutation UI/app máy thật/FCM nền. Inbox không chứng minh push đã giao.

## Phạm vi được duyệt

- Cá nhân DRAFT → ISSUED → REVOKED; nội dung đã ban hành không sửa. Admin vẫn thu hồi với lý do, giữ audit/hồ sơ. Hai tin ban hành/thu hồi không được thu hồi riêng tại Thông báo.
- Tập thể team/phòng: popup tích sẵn nhân sự hoạt động có tài khoản hoạt động, bỏ tick ngoại lệ. Phòng xét phân công chính/kiêm nhiệm hiện hành và branch hoạt động; team chỉ thành viên hiện hành có phân công vào phòng cha, được xuyên chi nhánh. Không tự thêm quản lý nếu không thuộc roster.
- Chốt người được chọn tại ban hành, mỗi người hồ sơ/inbox/đã đọc/xác nhận riêng. Thu hồi cả roster ban đầu, không lấy membership mới; người đã chuyển đi vẫn được thu hồi, người vào sau/người ngoại lệ không nhận quyết định cũ. Không thu hồi riêng một người.
- Xóa nhân sự R3 vẫn xóa owned child/notices. Master tập thể/audit giữ snapshot mã/tên tại ban hành như lịch sử chung, không tái tạo người bị xóa; hồ sơ người khác giữ nguyên.
- Không tự trừ lương/sửa công/khóa tài khoản/đổi employment. Không gọi hồ sơ này là tiền án pháp lý.

## Lỗi và phần bổ sung

1. Ngày có hình dạng đúng nhưng không tồn tại/null PATCH/UUID sai: domain Gregorian validation, DTO required-if-present, UUID pipes, trimmed text/reason. End date có thể clear null, nhưng đình chỉ bắt buộc bounded.
2. Issue/revoke recheck employee/user active dưới locks. Race edit/issue/revoke chốt đúng một nội dung/audit/tin; audit timestamp là lúc ghi thay vì transaction-start. API history chỉ đọc, không route sửa/xóa.
3. Notice standalone withdrawal khiến quyết định/inbox bất nhất; legacy manager lộ body/tracking, scoped Head lộ title: chặn/loại notice linked khỏi management adapters, giữ mine của chính chủ.
4. Push tracking SQL inconsistent types parameter $3 bị catch, còn PENDING: cast status varchar/timestamp timestamptz; disabled trả SKIPPED/PUSH_NOT_CONFIGURED, retry không nhân inbox. Không fake SENT.
5. Web busy guard, frozen form, stale reload/no automatic replay. Ngày hiệu lực list trả YYYY-MM-DD thay timestamp UTC lệch ngày; metric không gọi mọi ISSUED là đang hiệu lực.
6. Master collective + existing personal children, atomic issue/revoke/audit/inbox, push sau commit. Read-only preview/fingerprint recheck, request UUID chống gửi lặp, child group không mutate riêng. App dùng notice cá nhân hiện hữu, không cần screen/code mới.

## Migration / API / rollout

Migration `1792800000000-disciplinary-action-groups`: bảng master target FK/catalog usage triggers, frozen selected_members JSONB, nội dung/ngày/trạng thái/actor/time/revocation reason, request UUID unique. Personal group_id nullable FK + unique group/employee. Down từ chối khi có collective data, không xóa lịch sử.

Development đã apply đúng một migration sau backup `deploy/backups/r10-before-collective-1791857278877.dump`: 275790 bytes, pg_restore --list PASS; SHA256 `388fc9eec01c05482c25d6da59e836f1317793284ea07a80b39ca2061be7e999`. Backup ignored, không version DB/credential. Không sửa/backfill lịch sử khách để thử.

Admin routes `/api/disciplinary-groups`: GET list, GET targets, POST preview `{targetType,targetId}` trả members/rosterToken/targetName, POST root issue `{requestId,targetType,targetId,rosterToken,employeeIds,...content/date}`, POST `/:id/revoke` reason, GET `/:id/history`. No collective edit/delete route. Personal list thêm groupId và vẫn cho đọc history của child.

Issue locks advisory request UUID → membership/assignment SHARE table → target/employee/user shared rows, UUID sorted → roster recheck → atomic writes. Revoke locks master/original children FOR UPDATE; no current roster resolution. Lock timeout 5s/deadlock return 409, no replay. Group lớn có thể giữ lock/chờ push calls lâu; chưa benchmark/load test hoặc mở queue mới ngoài scope.

## Bằng chứng cuối

| Kiểm tra | Kết quả |
| --- | --- |
| `r10-disciplinary.postgres.spec.ts`, disposable PostgreSQL + real HTTP | 21/21 PASS |
| `disciplinary-action-policy.spec.ts` | 4/4 PASS |
| Push payload + live-session regressions | 2/2 PASS |
| Backend noEmit / scoped ESLint / compile dist/r10 | PASS |
| Frontend noEmit / scoped ESLint | PASS |
| Isolated Next production build + static export cho Pages (webpack, ignored source copy; no .env copied) | PASS |
| Chrome default ticks, exception, empty disabled, cancel, empty history | PASS |
| Backend health / unauthenticated new route | 200 / 401 |
| Mutation UI → app thật → xác nhận → thu hồi; background FCM | NOT_RUN / chưa nghiệm thu |

27 ca khác nhau, không cộng reruns. Lượt đầu cá nhân tái hiện lỗi validation/authorization/push tracking và 2 lỗi fixture (HTML 404 parser, inactive employment CHECK), đã sửa rồi rerun. Failure-injection nhận 500 nhưng rollback đúng là assertion PASS. Không full suite hoặc release APK.

API cases: 3 types; target-only/read/ack, other person denied; inactive/missing account và account suspension concurrent; non-admin/live role vs forged JWT; issue/revoke/edit races; frozen content; whitespace/calendar/null/UUID; audit rollback/history; notices protected; privacy legacy/scoped; push disabled/retry/no attendance/auth side effects. Collective: cross-branch roster/exceptions; secondary/expired/account filters; stale/outside/empty/duplicate IDs; same request concurrent; old roster after leaving/new arrival; blocked child mutation; group audit rollback both issue/revoke; independent receipts; hard-delete one person preserves others/master/audit.

Tests use local development DB `r10_discipline_test_<UUID>`, own child API/JWT/port, synthetic users/password_hash NOT_A_LOGIN_CREDENTIAL, SMTP/FCM disabled. Teardown only drops validated owned DB/kills owned process. Không kỷ luật/xóa live personnel để test.

Chrome preview Team nghiệm thu (Demo): DEMO-NV, DEMO-LEADER, DEV-FIELD-R4 checked3/3; untick Leader changed2/3; all unchecked disables issue. Cancel kept collective history empty; no decision/notice sent. Screenshot ignored `logs/r10-collective-preview.jpg`. Read old personal dev decision, không thu hồi nó. Chrome session đúng browser; servers giữ localhost3000/3001.

Lượt đọc Web cuối đã xác nhận ngày hiệu lực dev decision hiển thị 2026-09-30 (không còn 2026-09-29T17:00Z); reload dọn nội dung form test. Form giữ optional ngày kết thúc cho cảnh cáo/xử lý vi phạm, required cho đình chỉ, không âm thầm xóa end cũ khi chỉ sửa tiêu đề. Build trên bản sao dưới `logs/r10-web-build`, không ghi đè `.next` server Hot Reload; backend/API và Web vẫn hoạt động.

## File và phần chưa đủ nghiệm thu

- Backend discipline domain/DTO/controller/service/module, new group controller/service; entity, migration, data-source; test R10 + calendar regression.
- Bắt buộc ngoài module: Announcements service (protected notices/private legacy tracking/SQL push tracking), organization-access managed adapter (không lộ private discipline scoped). Không mở discipline role cho Head/Leader hoặc đổi normal announcements.
- Web disciplinary page, new `components/disciplinary-groups.tsx`; globals.css chỉ thêm2 rule native dialog. Không redesign Admin hoặc sửa Mobile/native. Canonical docs/module acceptance plan/biên bản này; giữ dirty tree user/R1–R9.
- Chưa kiểm đầy đủ Web mutation/Android inbox acknowledgement/weak network after commit/FCM khi đóng app. Firebase credentials/public options, permission/live session/device phải hợp lệ mới nghiệm thu push; SKIPPED/inbox không phải push PASS.
- Audit bất biến qua application endpoints, không cam kết chống SQL superuser sửa/xóa. `disciplinaryRevoked` hiện phân biệt tin thu hồi, không ghi đè nội dung tin ban hành cũ (tài liệu lịch sử).
- Chưa commit/push/production hoặc APK bàn giao. Không tự chuyển R11. Next step khi được giao: smoke UI/app thực tế và background push sau khi cấu hình môi trường.
