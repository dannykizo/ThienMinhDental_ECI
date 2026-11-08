# R13 — Dashboard / KPI Lite / báo cáo theo phạm vi

Ngày: 2026-10-14. Scope Owner: Nguyễn Thành Nam.

## Phạm vi và quy tắc

Dashboard số liệu thật; KPI và báo cáo quản lý khớp projection/phút/phân loại của R12. Không score, payroll, KPI mới theo đánh giá cảm tính, migration, app/APK, tự dọn dữ liệu cũ hoặc triển khai R14.

- Dashboard attendanceToday = số ngày nhân viên hôm nay có giờ vào/ra hiệu lực trong report, không phải đủ công. reviewRequired = employee-days có flags/adjustments, không phải số events. incompleteToday riêng, không tự kết luận nhân viên quên checkout khi ngày đang diễn ra.
- Ngày/giờ đọc theo server +07; công hôm nay dùng document R12 cùng LIVE/SNAPSHOT semantics. Hồ sơ/đơn/phiếu/thông báo là current state. Đơn chờ xét mọi ngày trong scope (khác pending của báo cáo tháng); nhãn nói rõ. Phiếu không tự tạo công.
- Admin/Chief global; Area/legacy manager dùng user_branch_scopes + assignment hiện hành, effective_to inclusive, catalogue active. Scope rỗng trả 0, không fallback global. Thông báo restricted có recipient trong scope, loại discipline private; chưa có quyền workspace thì thẻ chỉ đọc, không có link bị cấm.
- KPI global vẫn chỉ Admin/Chief, scoped grant không mở quyền global/Excel/chốt. KPI document mới dùng cùng report summary và pure summarizeEmployees, metadata revision/nguồn/legacy warnings; array endpoint cũ giữ shape. Không làm tròn phút, không dùng checkout trễ thành OT.
- Scoped employee allowlist được tính trước totals/blockers trong cùng repeatable-read view với grants/roster/report. Primary department ID/name ngoài grant được loại khỏi attendance; không trả global versions/locker/contacts/GPS/images. Head cả phòng, Leader đúng team xuyên chi nhánh; account/member/catalogue/grant live.
- Reports scoped giữ workedMinutes/overtimeMinutes aliases; leaveDays giờ chỉ full-day, partialLeaveDays riêng. Đây là sửa phân loại theo R12, không thay workflow/quỹ. App cũ bỏ qua trường thêm; chưa thêm cột partial/source mới vào UI App trong R13.

## Lỗi đã sửa

1. Dashboard đếm flags trên từng event, một cặp có thể bị đếm đôi và bỏ điều chỉnh hiệu lực.
2. Dashboard assignment chỉ kiểm effective_to NULL, có thể thấy future assignment/bỏ active bounded assignment.
3. publishedAnnouncements không scope, quản lý thấy tổng công ty, có thể suy ra thông báo private.
4. KPI thiếu provenance/revision, dùng nhãn ngày lịch dù report có ngày công không lịch.
5. Scoped reports gộp HALF_DAY/HOURS vào full leave, query pending/live riêng sau snapshot, thiếu OT pending và có departmentId ngoài scope trong attendance.
6. Error/loading/stale-response của Dashboard/KPI/managed reads chưa rõ hoặc có thể bị phản hồi cũ ghi đè. Dashboard leave link trỏ policy page thay vì queue và link không theo portal.

## Kiểm tra có mục tiêu

Tech Lead xác nhận chạy bộ test R13 có mục tiêu trong lượt này, không chạy toàn dự án.

- R13 unit 7/7: shared summary/partial leave/day overlap/minutes, sum-to-report, snapshot provenance, unchanged global roles, daily count/dates/notice SQL, service denial and scoped redaction/aliases.
- R13 isolated PostgreSQL/authenticated HTTP 7/7: real branch/end date/future/expired/inactive scope; scoped/discipline notice counts; Head/Leader, cross-branch membership, outside pending/approved OT; live revoke/expiry/account; forged JWT role ignored, accounting reads and denied global endpoints; invalid month/revision, empty future month; immutable KPI after actual R3 deletion/reopen.
- Direct regression 32/32: managed-modules 4, monthly-workbook 14, reporting-leave-lock 2, R12 PostgreSQL 12. Close races/writer, audit rollback, strict global blockers, export incomplete, frozen supporting details and legacy warning remain valid.
- Total unique targeted cases: **46/46 PASS**. Initial fixture SQL parameter type errors corrected with explicit text casts; no production behavior was changed to make fixtures pass.
- Backend/Frontend typecheck/lint: **PASS**. Isolated API compile and isolated Web production build (23 routes): **PASS**. Compile lives in logs/r13-api-build; test child uses Backend node_modules through NODE_PATH, not the live dist tree. SMTP/FCM disabled. Web build uses .next-r13; generated type references were restored to the development .next/dev paths after building, without replacing the running development output.

## Kiểm tra Chrome / demo

- Admin tại localhost:3000: Dashboard hiển thị ngày server 2026-10-14, phạm vi toàn chi nhánh, ngày có chấm công hôm nay tách khỏi đơn/phiếu hiện hành. Các link xử lý nghỉ phép/giải trình/công tác đúng workspace.
- KPI tháng 2026-10 và báo cáo R12 cùng kỳ mở: **2 nhân viên / 5 ngày có dữ liệu / 8 giờ 49 phút / 0 OT đã duyệt**; 1 ngày có cặp văn phòng, 1 ngày có cặp hiện trường, 3 ngày chưa đủ vào/ra. Đây là dữ liệu development hiện có, không seed vào DB đang chạy trong R13.
- Đổi tháng bằng bàn phím: UI ẩn số liệu cũ và yêu cầu bấm Xem KPI. Tháng trống 2027-11 hiển thị tổng 0 và empty state, không tự tạo KPI. Công cụ fill trực tiếp input month không phát cập nhật React trong lần thử đầu; đã xác minh bằng thao tác bàn phím thực tế, không thay code nghiệp vụ để né vấn đề công cụ.
- Đã quay lại KPI tháng hiện tại. Backend health trả status=ok; Backend 3001 và Web 3000 tiếp tục lắng nghe, không dừng development server.

Run at backend (PowerShell, after compiling isolated API):

```powershell
$env:NODE_ENV='development'
$env:R13_POSTGRES_TEST='1'
$env:R12_POSTGRES_TEST='1'
node --env-file=.env node_modules/vitest/vitest.mjs run test/r13-dashboard-kpi.postgres.spec.ts test/r13-dashboard-kpi.spec.ts test/managed-modules.spec.ts test/monthly-workbook.spec.ts test/reporting-leave-lock.spec.ts test/r12-reporting.postgres.spec.ts --testTimeout=20000
```

Isolated compile from repo root:

```powershell
node backend/node_modules/typescript/bin/tsc -p backend/tsconfig.build.json --outDir logs/r13-api-build --incremental false
```

Each opt-in PostgreSQL suite creates/drops only its UUID-named local test database. Synthetic identities have DEVELOPMENT ONLY labels and unusable password hashes; temporary JWT secret never leaves test process. No seed/account/event/approval/close/reopen/delete written to the live development DB. Empty ignored evidence directories may remain under logs/r13_stats_test_*; no real image was copied/deleted.

## Vùng chạm

- Backend reporting domain/service/controller; KPI controller.
- ManagedModulesService bắt buộc để thống nhất phân loại, snapshot, grant/data view và scope-safe summary; không đổi trips/announcements workflow.
- Web Dashboard, KPI, managed reporting labels/stale guard; CSS chỉ Dashboard read-only priority items.
- Git/ESLint ignore isolated build output; canonical PROJECT/FLOWS/IMPLEMENTATION/README và module plan.
- New R13 unit/PG test sources, update managed unit contract; không sửa Mobile/Auth/Employees rules/migration.

## Giới hạn và bước tiếp theo

- Không benchmark production dataset/load. Projection tháng hiện hữu đọc toàn bộ đầu vào rồi lọc nhân viên trước tổng hợp; cần đo trước tối ưu, không refactor tiện thể.
- Snapshot historical organization/legacy warning và partial-day unit limits giữ R12. Không tạo dữ liệu lịch sử thiếu hoặc exclude seed qua đoán tên/mã.
- API role/scope PASS không thay thế thao tác UI Head/Leader thật. Không đổi tài khoản Admin đang mở để đăng nhập người khác, không coi App đã được nghiệm thu từ test Web.
- Phần redesign toàn giao diện, KPI điểm và production/deployment thuộc task khác. Dừng R13; R14 chỉ bắt đầu khi Tech Lead giao.
