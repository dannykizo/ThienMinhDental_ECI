# R4 — Đơn từ và phiếu OT (2026-10-10)

## Kết quả và phạm vi

**Chức năng đã triển khai; nghiệm thu toàn R4 vẫn PARTIAL.** Tiếp nối [chấm công ngày/camera](R4_DAILY_ATTENDANCE_ACCEPTANCE.md), không chuyển R5, không redesign hoặc thêm loại đơn online/đăng ký công tác từ ảnh tham khảo.

- App gom Giải trình/Nghỉ phép/Tăng ca vào Đơn từ; công tác được giao vẫn có tab riêng, check-in hiện trường tại Hôm nay không cần phiếu. OT có danh sách cá nhân, form ngày/giờ/lý do/công việc và màn hình xử lý cho quản lý theo capability Backend.
- Một phiếu SUBMITTED hoặc APPROVED mỗi nhân viên/ngày; REJECTED cho gửi mới. Backend không nhận ngày tương lai/ngày không thật/phút ngoài 1–1440/body giả chủ. App chuyển giờ sang phút chính xác, không làm tròn phần phút. Không tự suy OT từ checkout muộn, không yêu cầu đủ công chuẩn trước khi gửi.
- Tuyến OT độc lập: Leader xác nhận → Head quyết định; Admin dự phòng chỉ khi thiếu/không còn tuyến hợp lệ, có lý do. Cấm tự duyệt, kiểm tra live grants/expectedVersion, giữ bước đã xác nhận khi đổi tuyến. Không ảnh/GPS riêng cho OT, không chỉnh/hủy OT hoặc offline queue mới.
- Audit/inbox cùng transaction; push sau commit, thông báo nêu người quyết định thật. Tích hợp gửi không đồng nghĩa máy đã nhận push.
- Approved minutes vào Today/daily/monthly/Excel. Ngày chỉ có OT không tạo check-in/đủ công giả. Pending OT là blocker và được kiểm tra lại dưới period lock; kỳ khóa chặn tạo/duyệt/đổi tuyến.

## Database và rollout

Migration `1792454400000-overtime-workflow`: overtime_requests, overtime_approval_routes, unique submission UUID, partial unique active employee/day, constraints phút/trạng thái, trigger bảo vệ lịch sử team. Schema/entity theo TypeORM hiện hữu; Domain permission helper không phụ thuộc ORM. Rollback từ chối khi có dữ liệu OT/tuyến.

Đã backup development `logs/r4-ot-before-20261010.dump` (ignored), chạy migration và đọc lại ledger `schema_migrations`: `OvertimeWorkflow1792454400000`. Không xóa/backfill công cũ. Không còn DB acceptance tạm sau kiểm tra. Production chưa deploy: backup → migration → Backend → Web/App tương thích; không dùng DB/schema production để chạy acceptance fixture.

## API và trang Admin

- `GET /overtime-requests`, `GET/POST /overtime-requests/mine`: danh sách theo actor, tạo cho chính mình; submission UUID/payload giữ nguyên khi retry, đổi payload cùng UUID bị từ chối.
- `GET /overtime-requests/routes`, `GET /overtime-requests/routing-options`, `PUT /overtime-requests/routes/:employeeId`: Admin cấu hình tuyến riêng; lưu cập nhật bước chưa xử lý của đơn mở. Sao chép giải trình chỉ điền form, cần lưu để áp dụng.
- `PATCH /overtime-requests/:id/reroute`: Admin đổi tuyến đơn; không sửa bước hoàn tất hoặc tự sửa tuyến mặc định.
- `PATCH /overtime-requests/:id/confirm`, `PATCH /overtime-requests/:id/review`, `GET /overtime-requests/:id/history`: quyền theo live route/owner/Admin, version kiểm tra lại trong transaction.
- Web `http://localhost:3000/dashboard/overtime`: hàng đợi/chi tiết/lịch sử/quyết định/tuyến. Báo cáo hiển thị số OT pending chặn chốt.

## Kiểm tra đã chạy

**Tiếp nối máy thật 12:08 ngày 2026-10-10 (+07:00):** luồng field check-in có timemark đã thử phối hợp trên RMX5555 và kiểm tra ảnh Backend/Chrome Admin thành công; chủ thiết bị xác nhận ảnh cố ý che camera, thông tin timemark ổn. Xem [bằng chứng máy thật](R4_DAILY_ATTENDANCE_ACCEPTANCE.md). Các trạng thái NOT_RUN phía dưới là thời điểm bàn giao code; office/checkout/network/permissions/push/OT UI máy thật vẫn chưa nghiệm thu đầy đủ. Account fieldtest hiện đã có một lượt vào ngày 10/10, không reset để test lại.

Ngày 2026-10-10: **73/73 Backend targeted tests (8 files) PASS**, **8/8 Mobile targeted tests (2 files) PASS**. Không chạy full suite.

- PostgreSQL/API fixture riêng, random API port/JWT, SMTP/FCM tắt; migrate không seed, cleanup DB/image root fixture. OT 9 ca: validation/ownership, tuyến riêng, đúng thứ tự/quyền, Admin fallback và actor notification, approved-only Today/report/Excel, same/distinct concurrent submissions, versions/grant revoked, reject/resubmit/locked period, deletion FK, reroute giữ confirmation, pending blocker.
- Regression trực tiếp: daily office/field + privacy/photo, schedules/domain, attendance security, R3 deletion, chốt kỳ kiểm tra lại OT trong transaction.
- Mobile: exact minute conversion, capability không tự suy từ leave/team, response model, hub/form navigation/validation; daily/photo tests giữ nguyên.
- Backend typecheck/lint/build PASS; Web typecheck/lint/build PASS (static OT page); Flutter analyze liên quan PASS. Debug build/install qua Wi-Fi trên RMX5555 thành công; không build release APK. API health/trang OT HTTP 200, ADB device và reverse tcp:3001 hoạt động. UI thực tế/camera/GPS/push còn **NOT_RUN**, không lấy widget/API test làm bằng chứng thiết bị thật.

Chạy targeted Backend tại `backend/`:

```powershell
$env:R4_OT_POSTGRES_TEST='1'
$env:R4_POSTGRES_TEST='1'
$env:R3_POSTGRES_TEST='1'
try {
  corepack pnpm exec node --env-file=.env node_modules/vitest/vitest.mjs run `
    test/r4-overtime.postgres.spec.ts test/r4-attendance.postgres.spec.ts `
    test/daily-attendance-policy.spec.ts test/r4-schedules.postgres.spec.ts `
    test/schedule-policy.spec.ts test/attendance-event-security.spec.ts `
    test/reporting-leave-lock.spec.ts test/r3-employees.postgres.spec.ts
} finally {
  Remove-Item Env:R4_OT_POSTGRES_TEST
  Remove-Item Env:R4_POSTGRES_TEST
  Remove-Item Env:R3_POSTGRES_TEST
}
```

Mobile: `flutter test test/forms_overtime_test.dart test/daily_attendance_test.dart`.

## Tài khoản thử hiện trường

Đã tạo mới development-only `fieldtest` / mã `DEV-FIELD-R4`, loại TECHNICAL, EMPLOYEE, HCM/DEMO-UAT/DEMO-UAT-TEAM. Mật khẩu bàn giao riêng, không lưu Git. Chưa ghi công bằng tài khoản này, không reset dữ liệu nhân viên đang dùng. Không tự cấp quyền quản lý/tuyến OT để bypass policy; Admin có thể cấu hình OT riêng hoặc dùng fallback nếu tuyến thiếu.

Script opt-in `backend/src/database/create-field-test-account.ts` chỉ NODE_ENV=development + DB local, nhận DEV_FIELD_USERNAME/DEV_FIELD_PASSWORD từ môi trường. Yêu cầu fixture demo/Admin hiện hữu; không seed core, không thay mật khẩu hoặc tái kích hoạt tài khoản trùng. Audit development-only, bcrypt, không in mật khẩu/hash.

Trên điện thoại: mở App → đăng xuất/đăng nhập fieldtest → Hôm nay → Chấm công vào → Hiện trường → nhập nội dung → chụp → kiểm tra timemark/preview → xác nhận. Hủy preview không ghi công; ghi xong chỉ một lượt ngày đó. Không tự xóa công để thử lại; checkout một GPS không ảnh, chỉ Admin xem tọa độ. API debug `http://127.0.0.1:3001/api` qua ADB reverse; URL override App nếu đã lưu cần kiểm tra, không tự xóa cấu hình người dùng.

## File/module và dependency bắt buộc

- Backend: overtime module/DTO/controller/service; overtime entity/migration/data-source/database config/AppModule; development account script và targeted tests.
- Attendance/Reporting: approved OT và month-lock blocker. Employees: thêm bảng OT vào purge/preview để không tạo FK blocker R3. Portal/organization-access: scoped OT route/capability. Không sửa balances/policy/service nghỉ phép.
- Web: overtime-workspace/page, sidebar và report blocker. Mobile: forms hub/overtime form/list/manager, API models/methods, shell inbox navigation index, Home managed OT action. Không thêm dependencies.
- Canonical PROJECT/FLOWS/IMPLEMENTATION/README và R4 acceptance/module plan cập nhật trạng thái mới; lịch sử các lát cắt trước vẫn giữ bằng chứng cũ. Worktree có nhiều thay đổi trước task và user edits, không reset hoặc gom commit.

## Việc còn lại / rủi ro

Nghiệm thu người dùng: camera/permission/GPS/timemark thực tế, office/field pair, Đơn từ/OT trên máy, Head/Leader/Admin Web, mất mạng khi gửi/duyệt, push foreground/background. Retry OT giữ payload; sau lần gửi form khóa để tránh đổi payload trên cùng UUID, có thể quay lại danh sách kiểm tra kết quả. Không auto retry quyết định/chấm công.

Ảnh/GPS không chống giả tuyệt đối; chưa attestation, ca qua đêm hay retention tự xóa capture bỏ dở. Không bổ sung lương/phụ cấp, nhắc OT, cancel/edit OT hoặc offline queue ngoài scope. Dừng R4 sau bàn giao; chưa commit/push/deploy production hoặc đóng gói APK phát hành.
