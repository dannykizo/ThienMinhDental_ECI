# R12 — Báo cáo theo từng phần (2026-10-13)

## Trạng thái và phạm vi

**IMPLEMENTED bốn workbook/nút xuất — nghiệm thu Kế toán/HCNS còn PARTIAL.**

Tech Lead đồng ý xuất/nghiệm thu từng phần với Kế toán/HCNS, giữ snapshot tháng bất biến kể cả khi xóa nhân sự, mở/chốt lại có phiên bản. Kế toán tự tổng hợp/tính lương. Không tự bổ sung payroll hoặc bộ báo cáo tất cả module.

| Thứ tự | Báo cáo | Trạng thái R12 |
|---|---|---|
| 1 | Bảng công tháng | IMPLEMENTED; chờ kiểm định mẫu/đối soát Kế toán, HCNS |
| 2 | Nghỉ phép và số dư | IMPLEMENTED; chi tiết đơn/quỹ năm/điều chỉnh/lịch sử |
| 3 | OT | IMPLEMENTED; đề nghị/đã duyệt/tuyến và lịch sử |
| 4 | Giải trình và điều chỉnh | IMPLEMENTED; đơn/minh chứng có-không/giá trị sửa/lịch sử |

Tech Lead bổ sung: thiếu/chưa hoàn tất **không chặn xuất**, luôn có ghi chú và màu nhận diện; không tự duyệt/điền giờ giả để làm file đẹp. Chốt kỳ vẫn giữ điều kiện nghiêm ngặt. Bốn nút luôn hiển thị; cần tải đúng bộ lọc trước khi bấm, có loading/success/error và refresh phiên dùng chung.

## Ba workbook bổ sung

- Phép: tổng hợp số đơn, phút đã duyệt/chờ của đơn nằm trọn tháng; chi tiết giữ phút toàn đơn, loại cả ngày/nửa ngày/giờ, buổi/khoảng giờ, chính sách, người xác nhận/quyết định/hủy và ghi chú. Đơn giao tháng có ghi chú và không cộng toàn bộ phút vào tổng tháng, tránh cộng trùng; không tự chia tháng khi chưa có phân bổ ngày đã lưu. Quỹ năm tại thời điểm đọc/chốt (KHÔNG phải cuối tháng); dùng đúng projection LeaveService, không ghi/khởi tạo từ GET. Chỉ nhân viên/chính sách active và có theo dõi quỹ; thiếu khởi tạo là dự kiến và tô vàng. Phút/ngày policy tại capture là basis quy đổi, chưa có basis lúc nộp đơn: không giả lịch sử khi policy đổi. Sổ điều chỉnh quỹ bao gồm cả năm được chọn.
- OT: toàn bộ trạng thái được xuất; chỉ APPROVED vào phút/giờ đã duyệt. Có công việc/lý do, stage, tuyến, người xử lý thật/giờ/ghi chú, Admin dự phòng và audit metadata.
- Giải trình: nội dung yêu cầu/phản hồi, loại/ngày/nguồn, có minh chứng hay không, tuyến/người xử lý/ghi chú. Điều chỉnh là danh sách riêng gồm trường/giá trị cũ-mới/lý do/người/thời gian; không suy duyệt đơn = sửa công. Không xuất đường dẫn ảnh hoặc raw audit JSON.
- File rỗng vẫn có metadata/header; user text literal, leading zeros giữ nguyên. Header tím, autofilter/freeze/landscape; trạng thái duyệt xanh, note chờ/cần đối soát vàng, thiếu thông tin/số dư âm đỏ. Không tính lương hoặc cấp quyền xuất mới cho quản lý.

## Bảng công tháng

URL development: http://localhost:3000/dashboard/reports.

- Thông tin kỳ: tháng, nguồn tạm tính/bản chốt, trạng thái kỳ hiện tại, revision, người/thời điểm chốt và xuất, bộ lọc, quy tắc/chú giải/giới hạn.
- Tổng hợp nhân viên: mã/họ tên/phòng, ngày có dữ liệu, ngày văn phòng/hiện trường, nghỉ cả ngày/ngày có nghỉ một phần, ngày đủ công/thiếu/vắng/cần xem, phút và giờ thực tế, phút và giờ OT đã duyệt.
- Ma trận công ngày: đúng số ngày trong tháng; VP/HT/P/PP/V/T và dấu * cảnh báo/điều chỉnh. Không có dữ liệu hiển thị —, không tự coi là nghỉ hay có mặt.
- Chi tiết ngày: giờ vào/ra +07:00, phút thực tế/chuẩn, OT đã duyệt, đủ công, trạng thái, hình thức, risk flags/số điều chỉnh.
- Đối soát: ngày thiếu checkout/cảnh báo/điều chỉnh và đơn đang chờ kể cả khi không có dòng công tương ứng. Ghi chú kế bên ở Chi tiết ngày, màu đỏ/vàng. Blocker toàn công ty chỉ chặn CHỐT, không chặn XUẤT; file nêu rõ tổng blocker và phạm vi đang lọc.

Số phút là nguồn chính xác; giờ Excel là số phút/60 **không làm tròn giá trị lưu**, chỉ format hiển thị hai chữ số. Nghỉ một phần ở workbook này là số ngày có đơn, **không phải số ngày phép quy đổi**. Văn phòng/hiện trường và nghỉ một phần có thể cùng ngày, không cộng các nhóm thành tổng ngày công; giờ thực tế và OT không cộng tự động vì có thể bao hàm nhau. Không tính lương.

User text được ghi literal string, không formula/hyperlink. Không xuất GPS, ảnh, password/credential hoặc khóa thiết bị. Phòng ban lấy projection phòng chính hiện tại khi lập bản, đóng băng theo snapshot; chưa tái dựng cơ cấu từng ngày. Nhân sự inactive vẫn giữ các ngày có sự kiện/approved OT/phép phù hợp projection, nhưng chưa tái dựng toàn bộ lịch sử tuyển/ngừng việc. Kỳ hiện tại chỉ tính đến ngày hiện tại theo +07:00.

## Snapshot và khóa kỳ

Migration `1792886400000-attendance-report-snapshots` tạo bản lưu JSONB có revision/identity/thời gian/lý do, unique(period, revision), trigger chống sửa/xóa. Không FK tới nhân sự/phòng nên xóa R3 không xóa bản chốt; bản này vẫn chứa tên/mã công theo chính sách lưu đã duyệt, không phải cơ chế xóa PII toàn hệ thống.

Chốt: SHARE locks có thứ tự trên bảng đầu vào projection → khóa hàng tháng → đọc lại rows/blockers → lưu kỳ + next revision + audit cùng transaction. Audit lỗi rollback cả ba. Writer chấm công kiểm tra khóa tháng trước tiêu thụ proof/ghi sự kiện. Timeout/deadlock trả 409 REPORT_BUSY, không retry tự động. Khóa ngắn trên toàn bảng, chưa benchmark dữ liệu lớn/production load.

Admin/Kế toán trưởng xem/xuất/chốt; chỉ Kế toán trưởng mở lại với lý do trim 5–2000 ký tự. Không đổi quyền xuất của Leader/Trưởng phòng. GET document đọc REPEATABLE READ nhất quán, không ghi; rows được lọc trước tổng hợp. Kỳ khóa đọc snapshot; revision cụ thể vẫn đọc được khi kỳ mở lại. Chốt lại tạo v2, v1 không đổi. Web ghim revision khi xuất bản đang xem.

Migration `1792972800000-supporting-report-snapshots` thêm supporting_reports nullable. Các lần chốt mới lưu ba báo cáo chi tiết/quỹ/audit cùng revision tháng; snapshot cũ không bị sửa. Xóa nhân sự không thay file lịch sử. Bản cũ không snapshot/thiếu supporting_reports vẫn xuất dữ liệu hiện tại với cảnh báo rõ KHÔNG phải lịch sử đã chốt; không tự backfill/mở/chốt. Revision chỉ định không tồn tại vẫn 404 (query không hợp lệ, không phải dữ liệu thiếu). Rollback migration từ chối khi đã lưu supporting_reports. Khóa bảng bổ sung quota/policy/team/users trong close; không SHARE-lock audit table rồi INSERT để tránh lock-upgrade deadlock giữa hai close.

## Kiểm tra thực hiện

- Backend targeted **47/47 PASS**: monthly-workbook 14, supporting-workbook 8, reporting-leave-lock 2, attendance-event-security 11, R12 PostgreSQL 12. Thêm leave-policy 3 + leave-policy-update 1 PASS khi trích shared balance reader (không đổi business rule).
- Excel round-trip: 5 sheets; minutes/hours exact numeric; timezone; leading-zero code; hostile HYPERLINK-like text literal; leap February matrix; metadata/permissions/validation.
- PostgreSQL biệt lập: hai close đồng thời; chờ writer và đọc giá trị mới; checkout bị xóa không bị approved full leave che blocker; pending vẫn xuất với ghi chú nhưng chặn chốt toàn công ty; real R3 delete giữ snapshot công và supporting; reopen/reclose giữ v1/v2; trigger UPDATE/DELETE chặn; audit failure rollback; legacy thiếu snapshot/detail xuất có warning; locked AttendanceService.record không consume/save; inactive thực tế được giữ. Seed có thiếu checkout, phép nửa ngày/giờ/giao tháng/hủy, OT chờ, giải trình chờ, điều chỉnh công/quỹ; tạo đúng bốn XLSX ứng dụng, không seed DB live.
- Backend/Frontend typecheck và scoped lint PASS. Backend isolated compile PASS. Frontend isolated static production build PASS; không overwrite dev .next. Không chạy lại toàn bộ hệ thống hoặc các suite R4 PostgreSQL đầy đủ; chưa coi real service/DB tests là kiểm tra toàn bộ HTTP authentication.
- Backend health 200; Web/Backend giữ Hot Reload. Chrome đã kiểm tra bốn nút dù kỳ 2026-10 còn blocker. File tải vào Downloads; không chốt/mở/xóa nhân sự live. Chưa coi click tải/renderer là nghiệm thu Kế toán hoặc printing trong Microsoft Excel.
- Lượt cuối gồm 7 suite **51/51 PASS** (47 R12 + 4 regression policy). Bốn file tải qua Chrome đã đọc lại bằng ExcelJS: bảng công 5 sheet, phép 6 sheet, OT 4 sheet, giải trình 5 sheet, không công thức/hyperlink tự chạy. OT live chưa có đơn vẫn xuất file có header. Quỹ live chưa có dòng thuộc policy active/theo dõi quỹ, không tự tạo số dư giả. Endpoint export không phiên trả 401. Visual QA thấy note đỏ/vàng, header/đơn vị và wrap; Artifact Tool có lệch render ô string rỗng trong summary, XLSX round-trip xác nhận ô vẫn là string rỗng, không có số liệu giả trong file.

Chạy lại targeted tại `backend/` (PowerShell; Node trên PATH):

```powershell
$env:R12_POSTGRES_TEST='1'
$env:NODE_ENV='development'
# Tùy chọn: R12_REPORT_OUTPUT_DIR là đường dẫn tuyệt đối nằm trong logs/ của workspace.
node --env-file=.env node_modules/vitest/vitest.mjs run test/r12-reporting.postgres.spec.ts test/monthly-workbook.spec.ts test/supporting-workbook.spec.ts test/reporting-leave-lock.spec.ts test/attendance-event-security.spec.ts --testTimeout=15000
```

Suite PostgreSQL tạo/drop riêng DB `r12_reporting_test_<uuidhex>` development với dữ liệu synthetic; không xóa dữ liệu ở DB dev chính. Không commit .env/credentials/backup.

## Rollout và vùng đã chạm

Development đã backup snapshot nền và thêm `logs/r12-supporting-20261013.dump` trước migration mới (1 migration applied). Bốn mẫu tại `logs/r12-excel-samples/DEVELOPMENT-ONLY-*.xlsx` (ignored), fixture DB tự drop sau test. Render visual QA đọc đúng file mẫu qua Artifact Tool, không chuyển stack ExcelJS hay xuất biến thể. Không deploy production/public Pages/APK; không commit/push worktree đang có nhiều thay đổi từ trước.

Reporting: service/controller + supporting projection/workbook và ghi chú monthly. Database: migration/registration. Ngoài reporting: LeaveService trích read-only quota SQL dùng chung để không nhân đôi rule; frontend auth-api thêm binary download dùng refresh hiện có. Web Reports/CSS scoped/export cards; ESLint bỏ qua isolated build output. AttendanceService chỉ là thay đổi phần 1, không thêm sửa ở completion slice. Canonical PROJECT/FLOWS/IMPLEMENTATION/README và kế hoạch nghiệm thu được cập nhật. Không sửa Mobile hoặc thêm dependencies.

## Việc cần nghiệm thu tiếp

1. Kế toán/HCNS duyệt từng mẫu/cột/chú giải và đối chiếu tháng theo lịch/điều chỉnh/phép/OT; được xuất trước khi giải quyết blocker, không tự duyệt/điền checkout giả. Đơn giao tháng đối soát riêng; quỹ năm không dùng thay cho stock cuối tháng.
2. Thao tác Web chốt/mở lại/chọn phiên bản/xuất thực tế với bộ dữ liệu được cho phép, kiểm tra file trong Excel và printing. Hiện các mutation/version persistence đã kiểm tra bằng service/DB biệt lập, chưa thao tác live customer period.
3. Kiểm định Excel/printing bởi người dùng và tải dữ liệu lớn. Close đang dùng khóa ngắn toàn bảng, chưa benchmark production load. Không tự thêm báo cáo phụ/payroll hoặc phân bổ phép lịch sử/basis lúc nộp đơn ngoài scope.
