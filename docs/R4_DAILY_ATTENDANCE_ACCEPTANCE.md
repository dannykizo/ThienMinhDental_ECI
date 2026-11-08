# R4 — chấm công ngày, camera và vị trí riêng tư (2026-10-10)

## Bổ sung nghiệm thu camera/timemark máy thật — 12:08 ngày 2026-10-10 (+07:00)

**PASS cho luồng check-in hiện trường có ảnh timemark**, không phải PASS toàn R4 hoặc mọi trường hợp camera/GPS. Thử phối hợp trên RMX5555 qua Wi-Fi ADB; Agent nhập tài khoản/form và kiểm tra màn hình, chủ thiết bị tham gia chụp/xác nhận, thông báo đã chủ động che camera và xác nhận thông tin timemark đúng. Ảnh tối do cố ý che ống kính, không phải lỗi render; chưa đánh giá chất lượng ảnh phong cảnh/ánh sáng khác.

- Tài khoản development `fieldtest` / `DEV-FIELD-R4`, nội dung `camera timemark R4 - development only`, hình thức BUSINESS_TRIP, không cần phiếu. App đăng nhập và truy cập Backend qua ADB reverse thành công.
- Preview trên máy và PNG lưu Backend đọc được chữ tiếng Việt, HIỆN TRƯỜNG, thời gian UTC+7, GPS và mã context. PNG thật 1000×1333; mốc context `2026-10-10T05:08:00.492Z` hiển thị 12:08:00 ngày 10/10/2026. Sự kiện CHECK_IN nhận lúc `2026-10-10T05:08:37.424Z` (12:08:37 +07:00), đúng phân biệt mốc chuẩn bị chụp và giờ công khi gửi.
- Đọc PostgreSQL: đúng một sự kiện thuộc fixture, daily_policy=true, risk_flags rỗng, capture/event GPS khớp, upload owner trùng context user, evidence filename trùng capture. Event `64ab2319-219c-4f92-8928-bbf160d19938`, capture `4da8c9c6-b7f4-4fba-b23e-0ce0882bc81c`. Không fake API/GPS/ảnh hoặc chỉnh/xóa bản ghi để tạo bằng chứng.
- Chrome Admin: Chấm công ngày 10/10 hiển thị DEV-FIELD-R4 / Hiện trường / Đã vào ca / Hợp lệ. Mở Ảnh/vị trí hiện đúng nội dung, vị trí và link ảnh; mở endpoint ảnh trong phiên Admin thành công, ảnh/timemark giống preview. Không đổi tài khoản/phiên Admin đang dùng.
- Evidence cục bộ (ignored, không commit ảnh/GPS): `logs/tm-r4-screen-20261010-14.png` (preview), `logs/tm-r4-screen-20261010-15.png` (App sau ghi nhận), `backend/storage/attendance-evidence/4da8c9c6-b7f4-4fba-b23e-0ce0882bc81c.png` (ảnh đã lưu). Chủ thiết bị đã xác nhận thông tin ảnh test ổn. Không chạy lại full suite hoặc sửa source trong lượt này.

Không khẳng định cancel-preview PASS: trong quá trình thử có thao tác đồng thời của người dùng, sự kiện đã gửi trước lúc Agent định hủy. Không xóa/hủy sự kiện test; tài khoản đã dùng lượt check-in hôm nay. Chưa check-out trong lượt thử này; checkout privacy/không ảnh, office camera, từ chối quyền, mất mạng, quá hạn context và chống giả ảnh/GPS trên máy vẫn chưa nghiệm thu đầy đủ. Targeted API/policy evidence bên dưới giữ nguyên. Giữ dev servers/debug; không tự triển khai R5, release APK, commit/push.

## Phạm vi

Tiếp nối R4, không chuyển R5. Thiết kế Thiên Minh giữ nguyên; ảnh My VDCD chỉ là tham khảo nghiệp vụ, không sao chép các chức năng không được yêu cầu.

Tech Lead chốt: field không cần phiếu, nhập nội dung/check-in mới có ảnh, tính công ngay từ cặp hợp lệ không phải duyệt; office cũng chụp khi vào. Checkout lấy một GPS không chụp, chỉ Admin biết vị trí. Một cặp chung hai loại mỗi ngày 00:00 +07:00. OT riêng tuyến, chỉ đã duyệt vào báo cáo, không OT từ checkout muộn. Không tracking liên tục; không che việc thu thập vị trí với nhân viên.

## Đã triển khai

- Database → Backend → Admin → App cho daily office/field, camera context/time/photo ownership, shared daily guard, type-bound checkout, Admin-only GPS detail, nội dung field và báo cáo/Excel hình thức. Legacy events không xóa/backfill; tham gia giới hạn trong ngày. Bắt đầu/hoàn tất ticket không tự ghi công nữa; lifecycle/audit cũ giữ nguyên.
- Context ảnh do server tạo, hạn 10 phút/current day, bind user/employee/type/GPS. Giờ timemark là mốc chuẩn bị camera từ Backend; giờ chấm công là lúc record. Backend yêu cầu ảnh đã upload đúng context/chủ sở hữu; ảnh đã gắn không ghi đè. PNG timemark sử dụng Flutter canvas, camera hệ thống hiện hữu, không thêm dependency. Checkout response/today không lộ tọa độ/vị trí khớp/khoảng cách; chi tiết chỉ live ADMIN.
- Report thiếu checkout field vẫn INCOMPLETE; có pair là BUSINESS_TRIP, không phụ thuộc ticket. Actual new-policy event vẫn lên report nếu không có lịch phù hợp; standard 480 mặc định. Không tự trừ nghỉ trưa/tính lương/OT. Excel thêm Hình thức, không thêm GPS/ảnh/nội dung riêng tư. Quyết định thay status từ ticket có thể thay kết quả báo cáo lịch sử tính lại; dữ liệu gốc không bị sửa.
- App: chọn hình thức, nhập nội dung field, lấy GPS, camera, preview/cancel/confirm, upload/record; out không camera. Timeout record yêu cầu reload, không replay tự động. Home/onboarding giải thích quyền riêng tư. Xóa file cache sau thao tác. R3 deletion purge capture rows/file ledger bằng queue hiện hữu.

## Migration và rollout

`1792368000000-daily-attendance-capture` đã áp dụng development; backup trước migration `logs/r4-daily-before-20261010.dump` (ignored). Không seed/thay nhân viên/schedule/công đang sử dụng để thử. DB temp của acceptance migrate độc lập. Rollback từ chối khi đã có context/sự kiện daily mới, cần export/migrate có chủ đích. Release cần migration và Backend trước App; app cũ không gửi ảnh sẽ không check-in được, không tự mở bypass ảnh.

Đã đọc lại `schema_migrations`: `DailyAttendanceCapture1792368000000`, id 31. Sau targeted tests không còn database mang prefix `r4_capture_test_`/`r3_employees_test_` trong PostgreSQL development.

## Kiểm tra

Kết quả ngày 2026-10-10: **63/63 Backend targeted tests (7 files) PASS**, **4/4 Mobile targeted tests PASS**. Backend và Web typecheck/lint/build PASS; Flutter analyze các file liên quan không có lỗi; debug build/install trên RMX5555 qua Wi-Fi thành công. Không chạy full suite. Không coi build/static/API là nghiệm thu camera/GPS trên máy thật.

- Runtime: API health và trang Admin chấm công trả HTTP 200; ADB `192.168.1.33:38153` ở trạng thái device, reverse `tcp:3001` hoạt động; Flutter debug process và App đang chạy. Backend/Web development server được giữ chạy. Chưa nghiệm thu thao tác camera/GPS thực tế hoặc xác nhận API URL đã lưu trong phiên App của người dùng.

- Targeted API/PostgreSQL: database `r4_capture_test_<uuid>` riêng, image root tmp riêng, random API port/JWT, SMTP/FCM tắt, migrate không seed. Các ca mandatory fields/photo, context owner/type/GPS/expiry, shared daily limit, concurrent in/out, privacy forged-role/live Admin, field without ticket/report/Excel, legacy dates, deletion capture/photo và start/complete ticket không phát sinh công.
- Pure policy: giới hạn hai loại/ngày, checkout phải có in, đúng ranh giới 00:00 UTC+7.
- Regression trực tiếp: lịch/domain, concurrency/evidence, xóa nhân sự và report lock. Chỉ chạy targeted theo kế hoạch rà R4 được duyệt, không full suite.

```powershell
cd backend
$env:R4_POSTGRES_TEST='1'
$env:R3_POSTGRES_TEST='1'
try {
  corepack pnpm exec node --env-file=.env node_modules/vitest/vitest.mjs run `
    test/r4-attendance.postgres.spec.ts test/daily-attendance-policy.spec.ts `
    test/r4-schedules.postgres.spec.ts test/schedule-policy.spec.ts `
    test/attendance-event-security.spec.ts test/reporting-leave-lock.spec.ts `
    test/r3-employees.postgres.spec.ts
} finally {
  Remove-Item Env:R4_POSTGRES_TEST
  Remove-Item Env:R3_POSTGRES_TEST
}
```

## Vùng chạm / việc còn lại

- Backend Attendance/controller/DTO/Domain/storage, event entity/data-source/new migration, employee deletion allowlist (FK mới), ticket start/complete (bỏ implicit attendance), Reporting (daily field/Excel). Test targeted và canonical docs.
- Web `frontend/app/dashboard/attendance/page.tsx` chỉ chi tiết/mode/Admin GPS.
- App `attendance_home.dart`, `checkin_photo.dart`, `api_client.dart`, `permission_setup_screen.dart`, `business_trip_list_screen.dart` (giải thích phiếu không thay chấm công); giữ user changes API/leave hiện có. Không redesign toàn app, không thêm packages, không build release APK/commit/push.
- **Cập nhật tiếp nối 2026-10-10:** Đơn từ, OT/tuyến riêng và approved minutes/report/notification đã triển khai; xem [R4 OT/Đơn từ](R4_OT_FORMS_ACCEPTANCE.md). Camera/GPS/push thực tế chưa nghiệm thu, chưa PASS toàn R4. Không đưa online/thời tiết/voice/gallery hiện trường vào scope.
- **Cần nghiệm thu người dùng trên máy:** camera/photo preview/cancel, chữ timemark thực tế, permission denied, weak network, home/UI admin và cặp thực ở field/office; không tự tạo công thật để demo.
- Timemark App/metadata/camera picker không chứng minh ảnh/GPS không bị giả. Server giữ metadata authoritative nhưng không attestation; hardening R5 vẫn cần review. Không có phiên bản lịch/snapshot event, ca qua đêm/checkout qua ngày chưa hỗ trợ. File context bỏ dở thuộc upload ledger, chưa có retention cleanup tự động ngoài employee deletion; không tự xóa dữ liệu khách.

Local: `http://localhost:3000/dashboard/attendance`; API `http://localhost:3001/api/health`. App debug API `http://127.0.0.1:3001/api` qua ADB Wi-Fi reverse. Không phải production deployment.
