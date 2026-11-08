# R4 — lịch làm việc và rule công (2026-10-09)

**Trạng thái mới nhất:** OT/tuyến độc lập và Đơn từ đã triển khai tiếp nối ngày 2026-10-10, xem [R4 OT/Đơn từ](R4_OT_FORMS_ACCEPTANCE.md). Các trạng thái chưa triển khai bên dưới là lịch sử lát cắt lịch, không phải trạng thái chức năng hiện tại; R4 chưa PASS toàn bộ nghiệm thu máy thật.

**Bổ sung 2026-10-10:** phần chấm công ngày bên dưới là trạng thái bàn giao lịch sử. Daily office/field, camera tại check-in cả hai loại, field không cần ticket, nội dung/timemark và checkout GPS chỉ Admin đã được triển khai ở [lát cắt tiếp nối](R4_DAILY_ATTENDANCE_ACCEPTANCE.md). Tuyến OT đã chốt **riêng** như nghỉ phép; Đơn từ/phiếu OT/approved reporting chưa triển khai. Không thay bằng chứng 36 tests của lát cắt lịch 2026-10-09 bằng chứng nhận toàn R4.

## Trạng thái và quyết định của Tech Lead

**PARTIAL / IN_PROGRESS**, chưa nghiệm thu toàn bộ R4, chưa chuyển R5. Lát cắt lịch hiện hữu đạt **36/36 targeted**. Đây không phải chứng nhận các luồng công tác, chấm công mới, OT, App hoặc production đã hoàn tất.

Đã chốt trong lượt R4 (thay quy tắc cũ trong source/tài liệu):

- Nhân viên chỉ một lượt check-in/check-out mỗi ngày, chung hạn mức văn phòng và hiện trường. Ngày theo 00:00 Asia/Bangkok (+07:00), không xóa lịch sử.
- App có hai mục chấm công văn phòng/hiện trường. Hiện trường cần chụp trực tiếp, không đính ảnh; công tác nhiều ngày vẫn in/out từng ngày, không đồng nhất checkout với kết thúc phiếu.
- Checkout sau giờ kết thúc không tự thành OT, kể cả quên checkout. Nhân viên khai phiếu gồm ngày OT, số giờ, lý do và công việc OT. Leader xác nhận → Trưởng phòng duyệt; Admin chỉ dự phòng khi tuyến thiếu/hỏng. Chỉ OT đã duyệt vào báo cáo.
- Giữ mặc định 480 phút đủ công, dung sai muộn 3 phút và về sớm 0 phút do Admin cấu hình; chưa thêm trừ nghỉ trưa, ca qua đêm hay tính lương/tiền OT.

## Đã sửa trong lát cắt này

1. DTO lịch: tên có nội dung, tối đa 120; bỏ qua undefined nhưng không chấp nhận null cho field cấu hình; weekdays 1–7, giờ HH:mm, ngày hiệu lực là ngày thật YYYY-MM-DD, không nhận timestamp như ngày.
2. Update so sánh phút thay so chuỗi `HH:mm` với giờ PostgreSQL `HH:mm:ss` (trước đó sửa start=17:00 với end=17:00:00 lọt qua). Khóa row để hai PATCH không ghi đè nhau; snapshot audit liên tiếp chính xác.
3. Gán lịch khóa theo employee hoặc cặp branch/department, dùng chung khi gán các schedule khác nhau; giữ lock lịch/catalog/hồ sơ khi kiểm tra active. UUID nhân viên thiếu/không active trả 404, không còn FK 500.
4. Đóng assignment open trước ngày mới có audit CLOSE cùng transaction ASSIGN. Nếu khoảng mới overlap, closure và audit rollback toàn bộ. Giữ cơ chế cũ: chỉ tự đóng assignment open cũ; không tự thay/cắt các khoảng bounded.
5. Attendance ưu tiên lịch active cá nhân trước, rồi xét ngày trong tuần: ngày nghỉ cá nhân không rơi về lịch phòng. Reporting chọn cùng org primary đang hiệu lực với Attendance, không chọn phòng kiêm nhiệm vì assignment mới hơn. Không sửa trạng thái phép/công tác/khóa kỳ trong Reporting.
6. Domain xét cả giây tại ranh giới dung sai; đủ công tính phút tròn. Timestamp hỏng/ra trước vào không tạo NaN hoặc công âm. **OT tự động đã bỏ**: `overtimeMinutes=0`, không giả số OT khi module phiếu chưa có. Báo cáo lịch sử tính lại cũng đổi OT tự động về 0; không xóa events/audit.
7. API Admin list thêm `employeeAssignments` gồm người/ngày hiệu lực. Web hiển thị ngoại lệ chi tiết, số lượng ghi rõ gồm lịch sử, dung sai về sớm; chỉ chọn nhân viên/catalog active. Sửa form.reset sau await (capture form trước async), chặn gửi trùng, bắt lỗi toggle, retry khi tải lỗi. Giữ bố cục/style hiện hữu.

Không migration/schema mới. Không sửa Mobile, không seed hoặc thay schedule/công/tài khoản khách trong DB đang dùng, không commit/push/deploy.

## Kiểm tra và bằng chứng

13 ca PostgreSQL/HTTP thật trong database riêng `r4_schedules_test_<uuid>` + 11 schedule-policy + 11 attendance-event-security + 1 reporting-leave-lock = **36/36, 4 files PASS**. Không full suite.

```powershell
cd backend
$env:R4_POSTGRES_TEST='1'
try {
  corepack pnpm exec node --env-file=.env node_modules/vitest/vitest.mjs run `
    test/r4-schedules.postgres.spec.ts test/schedule-policy.spec.ts `
    test/reporting-leave-lock.spec.ts test/attendance-event-security.spec.ts
  $r4Exit=$LASTEXITCODE
} finally { Remove-Item Env:R4_POSTGRES_TEST }
exit $r4Exit
```

Harness chỉ local NODE_ENV=development, database riêng migrate không seed; API riêng, random JWT không in log, SMTP/FCM tắt. Concurrency có trigger pg_sleep trong database test để mở rộng read-before-write window, test một success/một conflict; trigger được bỏ sau case. Teardown chỉ database được suite sở hữu. Không có dữ liệu cá nhân thật, không gửi push/email.

Các lỗi source xác nhận trước sửa: tên trống được lưu 201; sửa start bằng end cho 200; ngày không tồn tại gây 500; đóng hiệu lực không audit; báo cáo phòng kiêm nhiệm trả required=700 trong khi daily primary=300. Các lần chạy fixture sửa riêng: expectation inactive catalog phải 400 theo API hiện hữu; SQL sample cần `(date+time) AT TIME ZONE`; inactive employee phải đủ lifecycle fields theo schema, không đổi rule để chiều fixture.

Backend/Web typecheck, lint, build PASS; diff check sạch. Web Chrome chỉ đọc: trang lịch tải 2 lịch test cũ đều tạm ngưng, mở ngoại lệ thấy người/ngày hiệu lực. Không kích hoạt/gán lịch thật hoặc submit form. DB dev hiện chưa có lịch active: không tự kích hoạt fixture để giả luồng vận hành đã sẵn sàng. Nghiệm thu mutation UI/thời điểm trên điện thoại còn NOT_RUN. Kiểm tra runtime cuối: health và Web lịch đều HTTP 200, đúng một Backend watcher project; không còn database kiểm thử R4.

## Vùng chạm

- `backend/src/modules/work-schedules/work-schedules.dto.ts`, `work-schedules.service.ts`.
- `backend/src/modules/attendance/attendance.service.ts`, `domain/schedule-policy.ts` — dependency bắt buộc cho ưu tiên lịch và rule đã duyệt.
- `backend/src/modules/reporting/reporting.service.ts` — dependency bắt buộc để lựa chọn lịch nhất quán, cùng dùng domain OT mới. Không refactor Reporting.
- `frontend/app/dashboard/schedules/page.tsx` — UI trạng thái/contract/lỗi form cục bộ, không redesign.
- `backend/test/r4-schedules.postgres.spec.ts`, `schedule-policy.spec.ts`.
- PROJECT/FLOWS/IMPLEMENTATION/README, module plan và biên bản này; giữ nguyên dirty worktree R1–R3/user/Mobile có sẵn.

## Tiếp nối R4 đã được duyệt, chưa triển khai

Không chuyển sang R5 hay giới hạn yêu cầu mới thành “văn phòng thôi”. Các phần sau còn **NOT_IMPLEMENTED**:

1. **Chấm công ngày dùng chung**: Backend lấy ngày/employee từ phiên/giờ server, enforce một cặp in/out trên cả hai writers (văn phòng/hiện trường), dùng lock chung hiện hữu; ra theo lần vào, không cho đổi loại để lách. Không xóa/reset event lúc 00:00; ngày mới là cửa sổ mới. Tách daily field events khỏi vòng đời start/complete phiếu, giữ tương thích/migration lịch sử rõ. Admin phân biệt office/field từng ngày. App chọn office/field, camera-only, quyền/mất mạng/state đều dựa Backend. Dữ liệu nhiều lượt cũ không tự xóa hay sửa.
2. **Phiếu OT**: persistence/migration + API quyền/scoped route hai bước/Admin fallback + audit/inbox/push như conventions đã chốt; form và hàng đợi Web/App. Chỉ approved minutes vào Reporting, không dùng giờ checkout để suy diễn. Các case approve/reject/reroute/concurrency/quyền bị thu hồi và kỳ khóa cần acceptance. Không tạo auto-approved history hoặc tự migrate OT cũ thành phiếu đã duyệt.
3. **Nghiệm thu tích hợp**: nhiều ngày công tác, vào văn phòng không vào hiện trường lần hai và ngược lại, 23:59/00:00 +07:00, ảnh trực tiếp, OT không duyệt=0/duyệt đúng phút, người duyệt thật được thông báo, tổng Web/App/Excel nhất quán. Không build APK hoặc sửa dữ liệu khách để thử.

Chi tiết policy chưa được user quy định không tự phát minh: giới hạn thời hạn gửi/số phiếu OT/ngày, sửa/hủy sau duyệt, tuyến OT mặc định riêng hay dùng tuyến khác, cách OT ngày nghỉ xuất bảng công, checkout sau nửa đêm và trường hợp công tác không có phiếu được giao. Chốt ở lát cắt tương ứng trước khi thay business rule/API.

## Rủi ro còn mở

- R4 toàn bộ còn thiếu như trên, không PASS chỉ vì 36 tests qua.
- Chưa version/snapshot lịch gắn từng event: sửa lịch đã dùng có thể đổi report lịch sử; cần quyết định giữ lịch sử và rà kỳ khóa tại R12, không tự retrofit trong lát cắt này.
- Không chạy load test; list assignments gồm lịch sử có thể lớn. Advisory locks bảo vệ writers hiện hữu, không chứng nhận script SQL bên ngoài đi vòng service.
- Lịch qua đêm không hỗ trợ, end phải sau start trong cùng ngày. Off-day attendance vẫn giữ event; monthly hiện chỉ liệt kê ngày scheduled như trước, cần thiết kế rõ khi tích hợp OT ngày nghỉ.

Local: `http://localhost:3000/dashboard/schedules`, health `http://localhost:3001/api/health`. Backend watch/Web Hot Reload giữ chạy; log `logs/api-r4-live.log`, `logs/api-r4-live.err.log` ignored.
