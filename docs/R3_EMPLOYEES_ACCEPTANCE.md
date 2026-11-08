# R3 — Nhân viên và tài khoản (2026-10-09)

## Quyết định và kết quả

Tech Lead chốt Admin chỉ xem tên đăng nhập/reset, không xem lại mật khẩu. Chấp thuận xóa vĩnh viễn nhân sự không hạn chế theo trạng thái/lịch sử vì HCNS có hệ thống lưu hồ sơ riêng. Không redesign Web hoặc đổi app/APK.

Backend/API targeted PASS **59/59**: 15 PostgreSQL/HTTP thật + 44 unit/regression. Toàn bộ nghiệm thu PARTIAL: UI mới chỉ kiểm tra mở/xem/hủy, không tự reset/xóa hồ sơ khách; chưa nghiệm thu trên điện thoại hoặc production. Không chuyển R4.

Gate cuối chạy thêm 16 ca HTTP/PG R2 trực tiếp liên quan organization/evidence: **75/75, 8 files PASS**. Không chạy full suite. R3 vẫn tính riêng 59 ca.

## API và hành vi

Tất cả endpoint mới có JWT/live-session/ADMIN guard, UUID validation và service-level Admin check:

- `GET /api/employees/:id/account`: mã/tên nhân viên và account `{username,isActive}` hoặc null; không hash/password.
- `POST /api/employees/:id/account/reset-password`: `{newPassword,reason}`. Policy hiện có 6–128 ký tự, lý do trim ≥5. Hash mới, thu hồi mọi session/refresh, vô hiệu hóa push và audit cùng transaction. Response chỉ username/số phiên/currentAccountInvalidated, không password. Reset không tự active hồ sơ.
- `GET /api/employees/:id/deletion-impact`: counts, employeeCode, tên, hasAccount/isCurrentAccount và confirmationToken. Repeatable-read snapshot, không xóa/touch phiên nhân viên khi chỉ xem.
- `DELETE /api/employees/:id`: `{employeeCode,reason,confirmationToken}`. Nhập đúng mã phân biệt hoa/thường, lý do trim ≥5, snapshot còn mới. Lock timeout/concurrency/stale → 409 `EMPLOYEE_CHANGED`; record đã xóa → 404. Không tự retry.

Xóa vật lý employee và các FK rows sở hữu nhân viên: attendance/explanation/adjustment, leave/routes/balances (kèm adjustments), discipline, schedule, organization assignments/membership, trip participation, announcement recipients/personal announcements và push. Không chặn kỳ đã khóa; báo cáo lịch sử sẽ thay đổi. Auth sessions/roles/scopes bị xóa; grants bị thu hồi. Tên đăng nhập/hash được thay bằng actor kỹ thuật inactive, giải phóng username cũ. Không xóa actor UUID vì audit/phiếu/quyết định của người khác còn FK tới user đó. Audit lịch sử vẫn giữ snapshot cũ; đây không phải GDPR/PII erasure.

Phiếu chung/người khác giữ nguyên; responsible_employee_id và manager_employee_id chuyển NULL theo FK. Không tự chọn người thay, tự hoàn tất/hủy phiếu hoặc tạo xác nhận giả. Tuyến người khác mất người duyệt được Admin phân lại hoặc xử lý dự phòng hiện hữu; các bước đã xác nhận giữ nguyên. Xóa chính Admin đang dùng được phép, UI cảnh báo và chuyển login; nếu không còn Admin, cần phục hồi vận hành từ backup.

## Migration và ảnh

`1792281600000-employee-file-cleanup` chỉ thêm queue bền vững, không tự xóa dữ liệu cũ. Áp dụng trước Backend mới. Local đã backup tại `logs/r3-before-20261009.dump` (ignored) rồi áp dụng **1 migration**. Không seed/reset mật khẩu/xóa hồ sơ có sẵn trong DB development.

Ảnh attendance có ownership và ảnh trip đã gắn thành viên được lấy trước purge. Queue commit cùng DB; unlink sau commit, khởi động hoặc mỗi phút. Chỉ exact UUID JPEG/PNG/WebP dưới hai root cấu hình; không recursive delete/đường dẫn arbitrary. Ảnh còn được nhân viên khác tham chiếu không xóa. Pending files bị chặn đọc; lỗi disk không trả lỗi mutation giả sau khi DB đã commit, response báo evidenceCleanupPending. Hỏng DB sau commit báo -1, worker thử lại. Down chỉ cho phép queue rỗng, không phục hồi dữ liệu đã xóa.

Giới hạn: ảnh trip cũ đã upload nhưng chưa gắn phiếu không có ownership ledger nên không xác định được để dọn; ảnh external không thuộc quyền quản lý của hệ thống. Backup/audit của hệ thống và HCNS riêng không bị xóa. Không coi thông báo UI thành công là chứng nhận xóa mọi bản sao PII.

## Kiểm tra đã chạy

```powershell
cd backend
$env:R3_POSTGRES_TEST='1'
try {
  corepack pnpm exec node --env-file=.env node_modules/vitest/vitest.mjs run `
    test/r3-employees.postgres.spec.ts test/employee-admin.spec.ts `
    test/employee-lifecycle.spec.ts test/admin-access-without-pin.spec.ts `
    test/auth.service.spec.ts test/manager-session.repository.spec.ts `
    test/attendance-evidence-access.spec.ts
  $r3CheckExit=$LASTEXITCODE
} finally { Remove-Item Env:R3_POSTGRES_TEST }
exit $r3CheckExit
```

R3 harness yêu cầu local NODE_ENV=development + explicit opt-in; tạo/migrate DB ngẫu nhiên `r3_employees_test_<uuid>` và API cổng riêng, SMTP/FCM tắt, secret/password random không in output. Teardown chỉ exact database/temp evidence do suite sở hữu. Không chạy full suite.

Các ca chính: tạo/normalize/hash/no credential leak; profile-only; duplicate code/email rollback không orphan; blank identity/incomplete account/primary assignment; scoped/basic list và detail privacy; Admin guard kể cả JWT giả; edit/audit; reset access/refresh/push, inactive/no-account; old hash verification sau reset; inactive/restore không hồi sinh phiên; wrong-code/reason/stale không xóa; purge used/locked-period FK children; giữ shared trip/actor; queue unlink ảnh/balance/discipline/personal inbox; self operations; concurrent duplicate delete một commit/audit; xóa Head giữ xác nhận của người khác và bật fallback cả phép/giải trình.

Lần đầu phát hiện hồ sơ chỉ khoảng trắng vẫn tạo được (sửa Backend); hai lỗi SQL type inference và một code fixture team chưa uppercase đã sửa ở fixture, không đổi business rule. Kết quả cuối 7 files/59 tests PASS.

Backend và Frontend typecheck/lint/build PASS. Web giữ bố cục hiện hữu, thêm panel account và impact/delete. Đã sửa tham chiếu event.currentTarget sau await ở create employee để không báo lỗi giả sau khi tạo thành công. Git diff check sạch trước bàn giao.

Chrome (profile đang đăng nhập Admin) tại `/dashboard/employees`: xác nhận nút Tài khoản / Reset và Xóa; mở account của nhân viên demo thấy username, trạng thái và form reset; không nhập mật khẩu hoặc gửi reset. Mở preview xóa thấy counts/trường nhập mã/lý do/cảnh báo, đóng bằng Hủy/Đóng xác nhận; tổng 36 hồ sơ không đổi. Không xóa fixture cũ/customer records trong development. Diff check sạch; backup/log được Git ignore. Temp DB R2/R3 của lượt kiểm tra đã teardown.

Đã tạm dừng đúng watcher/API project khi build để tránh ghi đè dist; phát hiện child API cũ còn giữ cổng 3001, dừng đúng PID đã xác minh đường dẫn project rồi khởi động lại một watcher. Log hiện hành: `logs/api-r3-live.log`, `logs/api-r3-live.err.log` (ignored).

## Vùng chạm và còn thiếu

- Employees Backend + DTO/controller/module/service, service quản trị mới, file-cleanup adapter; Web employees.
- Database migration registry + queue migration, không sửa schema FK hay migration đã chạy.
- Auth port/application/session adapter và regression: bắt buộc cho reset chống old-password login race.
- Attendance/Trip evidence adapters: bắt buộc chặn đọc ảnh đang purge và upload sau khi hồ sơ mất hiệu lực. Không sửa nghiệp vụ chấm công/công tác.
- Canonical PROJECT/FLOWS/IMPLEMENTATION/README, module plan và biên bản này. Giữ nguyên thay đổi có sẵn của Tech Lead; không sửa Mobile.
- Chưa push/deploy/commit. R1 bcrypt 72-byte truncation vẫn NEEDS_DECISION; không tự đổi policy/thuật toán hay mật khẩu cũ.
- Xóa có table locks ngắn, có thể chờ/409 dưới tải cao; chưa load-test production. Preview fingerprint đọc dữ liệu liên quan, chưa benchmark cho nhân sự có lịch sử rất lớn.
- Chưa chứng minh mọi UI success/error/keyboard/mobile-browser bằng thao tác cuối trên dữ liệu khách. Cần nghiệm thu riêng; không tuyên bố PASS toàn hệ thống.

URL local: `http://localhost:3000/dashboard/employees`; API health `http://localhost:3001/api/health`. Development servers giữ chạy watch/Hot Reload sau bàn giao.

Kiểm tra cuối sau khởi động lại: Web và API health đều HTTP 200; đúng một Backend watcher của project. PostgreSQL xác nhận migration mới đã áp dụng, không còn database kiểm thử R2/R3 và queue dọn ảnh đang rỗng.
