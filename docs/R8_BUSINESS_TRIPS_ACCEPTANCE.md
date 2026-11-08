# R8 — Công tác và khách hàng

Ngày: 2026-10-12. **PARTIAL**: Backend/API/DB và targeted app tests PASS; Chrome đọc/filter/history PASS. Chưa nghiệm thu luồng mới camera/GPS/bắt đầu/hoàn tất, mạng yếu hoặc FCM trên máy thật.

## Rule giữ nguyên

- Mã Backend `CT-YYYYMM-NNNN` theo tháng tạo, không sửa theo ngày kế hoạch/client. Người phụ trách phải là thành viên. Admin tạo/sửa/giao/hủy; nhân viên chỉ xử lý phần được giao; hoàn tất toàn phiếu khi mọi thành viên hoàn tất.
- Nháp chỉ Admin thấy và được sửa. Giao kiểm tra lại nhân viên active; hủy có lý do, giữ lịch sử/phần đã hoàn tất. Khách hàng ngừng không được chọn mới, vẫn giữ liên kết lịch sử.
- Quyết định R4 hiện hành: tiến độ phiếu **không tạo check-in/out hoặc cộng công**. Chấm công ngày một cặp chung văn phòng/hiện trường; hiện trường không cần phiếu. GPS phiếu chỉ là metadata tiến độ.
- Không thêm xóa khách hàng, tuyến duyệt công tác, tính lương, redesign hoặc R9.

## Lỗi phát hiện và sửa

1. PATCH không gửi `customerId` làm mất liên kết do DTO có thuộc tính undefined. Bỏ qua giữ link, null vẫn bỏ link chủ động.
2. Ảnh công tác thiếu ownership: người có JWT biết URL có thể đọc ảnh người khác, upload cùng UUID ghi đè và hoàn tất tham chiếu ảnh ngoài hệ thống/khác owner. Thêm ledger, đọc owner/Admin, complete kiểm tra upload của chính actor qua cùng EntityManager. Signature JPEG/PNG/WebP + MIME phù hợp, tối đa 5 MB; chấp nhận octet-stream của Flutter.
3. Upload immutable ngay từ lần lưu đầu: retry cùng owner/bytes hợp lệ, đổi bytes/extension dưới cùng UUID bị chặn. Advisory lock theo UUID xử lý upload hai tài khoản đồng thời thành một owner thành công/actor kia 400, không ghi đè hoặc unique-filename 500.
4. Complete phải kiểm tra phiếu IN_PROGRESS, không chỉ member. App ẩn complete phiếu hủy, refresh khi quay về, lỗi API yêu cầu **Tải lại trạng thái phiếu** trước gửi tiếp; không tự replay mutation. Chụp lại sinh UUID mới, retry đúng ảnh giữ UUID; giữ ảnh trong màn đang mở, không thêm queue offline công tác.
5. Nháp không còn lọt vào mine; giao revalidate member active trong transaction. Inbox EMPLOYEE đúng từng member có tài khoản active cùng commit với audit; sender tracked sau commit. Retry giao 409 không lặp recipient; sender lỗi không undo phiếu đã commit.
6. Chặn null trường bắt buộc, blank text, tên/địa chỉ vượt schema, ngày sai, GPS chuỗi; lý do hủy trim ≥5. Lỗi audit/system khi tạo không còn bị ngụy trang thành trùng mã 409.

## Kiểm tra cuối

| Kiểm tra | Kết quả |
| --- | --- |
| R8 PostgreSQL/real HTTP | 21/21 PASS |
| R4 daily attendance PostgreSQL/HTTP regression | 9/9 PASS |
| Trip code/status + employee deletion unit regressions | 12/12 PASS |
| Mobile `business_trips_test.dart` contract/widget/mock camera | 7/7 PASS |
| Backend noEmit/scoped ESLint/compile riêng `dist/r8` | PASS |
| Flutter analyze hai file app/test chạm | PASS |
| Scoped tracked diff whitespace | PASS |
| Chrome Admin đọc, lọc phòng/nhân sự, empty search khách hàng và lịch sử fixture | PASS |
| Local API health | 200 |
| Android debug compile/install/launch RMX5555 qua USB, reverse 3001 | PASS — không phải nghiệm thu luồng camera/GPS |

Backend **42/42**, Mobile **7/7** ở lượt cuối. Các lượt trước có regression/lỗi fixture/cuộn widget đã sửa, không tính là PASS. Không chạy toàn suite, không build release hoặc xuất APK bàn giao. Flutter có cảnh báo tương thích Kotlin plugin cho phiên bản tương lai; bản debug hiện build được, không nâng dependency trong R8.

Real HTTP/DB kiểm chứng: 12 request tạo đồng thời mã unique/liên tiếp; lỗi audit rollback counter/member/inbox; mã không đổi khi sửa ngày; dedup/member/responsible; Admin-only mutation/history, claim JWT giả role không nâng quyền; own start/complete; người khác/terminal/cancel bị chặn; start/end/cancel đồng thời chỉ kết quả hợp lệ và audit không trùng; concurrent customer edit old/new audit; inactive customer history/restore.

Không cộng công hai lần: hai phiếu của một người hoàn tất không tạo attendance_events. Fixture projection thêm riêng một cặp daily FIELD hợp lệ 480 phút; báo cáo/Excel chỉ một hàng 480 phút, OT=0, hình thức Hiện trường, không tọa độ. Đây là fixture DB có capture/ảnh đúng ràng buộc, không chứng nhận biometric/camera thật. Regression R4 kiểm riêng HTTP daily signed events và one-pair office/field.

Ảnh synthetic: owner/Admin đọc, actor khác 404, không JWT 401; external/missing/foreign/MIME/oversize chặn; immutable/same-bytes retry/tranh UUID. API xóa nhân viên trong DB thử kiểm ledger/file cleanup ảnh chưa linked và linked, giữ phiếu chung. Migration legacy thực chạy up, owner rõ/ambiguous NULL, không đổi lịch sử và down từ chối ledger đã dùng.

Fixture: DB riêng `r8_trips_test_<UUID>` (gồm DB legacy), storage/process/port/JWT riêng, SMTP/FCM tắt; dọn đúng tài nguyên fixture. Không xóa dữ liệu development/customer để thử. App dùng mock HTTP/camera synthetic, không lấy GPS/ảnh người dùng.

## Migration, backup và triển khai development

- `1792713600000-business-trip-evidence-ownership`, class `BusinessTripEvidenceOwnership1792713600000`: UUID PK, filename unique, uploader nullable, thời gian server. Backfill link local UUID hợp lệ chỉ khi một uploader/filename không mơ hồ; ambiguous NULL chỉ Admin. Không sửa member/reference/giờ cũ. Down chặn ledger đã dùng.
- Đã backup và áp dụng **duy nhất migration mới** vào PostgreSQL localhost development. Một guard ban đầu dừng an toàn vì migration cũ thiếu property name; đã đối chiếu constructor/name với schema_migrations trước chạy. Không sửa/bỏ qua migration cũ.
- Trước/sau: 4 member rows, 0 ảnh linked; ledger mới 0 rows. Không tạo phiếu/recipient trong DB live để test; Chrome chỉ đọc/lọc/lịch sử.
- Backup ignored `deploy/backups/r8-20261012/database.dump`, 273417 bytes; custom-format header/list kiểm tra, **chưa restore backup này**. SHA-256 `DD9C85CDF0B9DC6B4C3FFD81060FBA4210029EAED20E194B17FE0C647EB20C6C`. Backup DB không thay backup storage/restore rehearsal production.
- API/Web giữ chạy 3001/3000; debug RMX5555 USB, `adb reverse tcp:3001 tcp:3001`, API `http://127.0.0.1:3001/api`; giữ Flutter session cho Hot Reload. Không mở ADB TCP 5555, không nạp production.

## File/module

- `backend/src/modules/business-trips/`: service, DTO, controller, module và evidence storage.
- Migration mới và `backend/src/database/data-source.ts` đăng ký migration.
- **Ngoài module bắt buộc:** `backend/src/modules/employees/employee-admin.service.ts` thêm ledger vào lock/impact/fingerprint/delete/file cleanup. Nếu không sửa, FK uploader chặn quyền xóa R3 hoặc bỏ sót ảnh chưa linked.
- `backend/test/r8-business-trips.postgres.spec.ts`, `mobile/test/business_trips_test.dart`.
- `mobile/lib/features/business_trips/business_trip_list_screen.dart`: recapture UUID/reload/cancel guard/list refresh, không redesign.
- FLOWS/IMPLEMENTATION/README/module acceptance plan và biên bản này. Bảo toàn dirty tree có trước; không commit/push/production.

## Chạy lại

PowerShell tại `backend`:

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.build.json --outDir dist/r8 --tsBuildInfoFile dist/r8/tsconfig.tsbuildinfo
$env:R8_POSTGRES_TEST='1'
$env:R4_POSTGRES_TEST='1'
$env:R6_API_ENTRY='dist/r8/main.js'
node --env-file=.env node_modules/vitest/vitest.mjs run test/r8-business-trips.postgres.spec.ts test/business-trip-code.spec.ts test/business-trip-status.spec.ts test/r4-attendance.postgres.spec.ts test/employee-admin.spec.ts --no-file-parallelism
```

Tại `mobile`:

```powershell
flutter analyze --no-pub lib/features/business_trips/business_trip_list_screen.dart test/business_trips_test.dart
flutter test --no-pub test/business_trips_test.dart
```

## Còn thiếu / giới hạn

- NOT_RUN: luồng mới Web tạo/giao → app bắt đầu/chụp/hoàn tất và đổi mạng/upload mơ hồ rồi reload trên máy thật. Debug build/launch hoặc widget mock không thay nghiệm thu này. Native phone UI không khả dụng trong computer-use, cần Tech Lead thao tác trực tiếp; không bypass bằng adb input/screenshot/XML.
- NOT_RUN: FCM background/killed. Inbox không chứng minh điện thoại nhận push; Firebase development chưa cấu hình, không bật sender/gửi backlog thử.
- Legacy ảnh chưa linked không đủ dữ liệu khôi phục uploader; Admin-only. DB/file system không atomic tuyệt đối, crash/rollback upload có thể để orphan; không tự dọn storage lịch sử.
- GPS phiếu không qua proof daily để cộng công. Giới hạn fake GPS/root/repacked-app của R6 còn tồn tại, không tuyên bố chống gian lận 100%.
- Chưa rà chốt kỳ/phép/OT/report xuyên module hoặc restore production. Tiếp theo trong R8: xác nhận luồng máy thật; R9 chỉ khi Tech Lead giao.
