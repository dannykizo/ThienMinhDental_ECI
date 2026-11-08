# R9 — Nghỉ phép và số dư

Ngày: 2026-10-12. **PARTIAL**: logic Backend/API/DB và targeted app tests PASS; đọc Web và Hot Reload điện thoại PASS. Chưa nghiệm thu đầy đủ luồng gửi → Leader → Head → hủy trên UI/máy thật hoặc FCM nền.

## Rule và quyết định đã chốt

- SUBMITTED giữ quỹ; Leader xác nhận vẫn giữ quỹ; APPROVED chuyển cùng số phút sang đã dùng. REJECTED/CANCELLED giải phóng theo trạng thái, không append một khoản hoàn tiền/quỹ mỗi lần retry.
- Leader chỉ định xác nhận → Head chỉ định quyết định; Admin dự phòng chỉ khi tuyến thiếu/hỏng, có lý do, không tự duyệt hoặc giả bước xác nhận. Tuyến phép độc lập; giữ expectedVersion/quyền hiện hành/audit/inbox cùng transaction, push sau commit.
- Tech Lead duyệt ở lượt R9: **có lịch nhưng ngày nghỉ = 0 phút phép; chưa có lịch mới dùng phút/ngày chính sách**. Khoảng hoàn toàn không có phút làm việc trả 400 `LEAVE_NO_WORKING_MINUTES`, không tạo đơn/giữ quỹ. Áp dụng đơn mới, không tính lại hoặc sửa đơn lịch sử.
- Chọn lịch cá nhân trước lịch phòng chính, rồi mới xét thứ. Cả ngày cộng từng ngày, nửa ngày ceil(phút ngày/2), theo giờ HH:mm cùng ngày, thời lượng dương không quá phút ngày. Không tự trừ nghỉ trưa hoặc áp thêm ràng buộc khung giờ ca chưa được duyệt.
- Giữ overlap theo **khoảng ngày** hiện có trên các đơn SUBMITTED/APPROVED, kể cả khác chính sách/AM–PM/hai khung giờ không giao nhau. Chưa mở nhiều đơn trong ngày. REJECTED/CANCELLED cho gửi đơn mới.
- Hủy APPROVED chỉ khi policy cho phép, kể cả Admin không bypass policy. Bất kỳ tháng liên quan bị khóa đều chặn submit/review/cancel. Pending chặn chốt kỳ. Thời lượng đơn và entitlement năm đã khởi tạo không tính lại khi policy sửa.
- Cộng dồn lấy snapshot năm trước, trừ approved/pending và cộng adjustment, floor 0 rồi cap theo policy. Chính sách không tracking không khởi tạo/trừ quỹ. Tracking không cho đơn đi qua hai năm; năm quỹ 2000–2200 theo schema hiện hữu.

## Lỗi tái hiện và sửa

1. SQL cũ xét weekday trước priority, có thể rơi về lịch phòng khi lịch cá nhân là ngày nghỉ; cả ngày còn lấy lịch từ phòng kiêm nhiệm. Chọn đúng lịch ưu tiên/phòng chính cho từng ngày trước khi xét thứ.
2. Range vừa có lịch vừa chưa có lịch bị bỏ thiếu ngày chưa có lịch (360 thay vì 360+480=840). Tính fallback từng ngày; ngày nghỉ đã có lịch không fallback và không bị trừ phép.
3. PATCH policy null hoặc ngày/timestamp không phù hợp có thể ra 500; reason padded/whitespace được lưu sau trim. DTO/domain/controller/service chặn null bắt buộc, ngày lịch thật YYYY-MM-DD, UUID sai, tên trim ≥2, lý do tạo ≥3/hủy/điều chỉnh ≥5; không đổi các tùy chọn policy khác.
4. Tạo policy cùng code đồng thời có unique-constraint 500. Khóa theo code trong transaction rồi kiểm tra duplicate, trả 409 đúng nghĩa; không giấu lỗi audit/system.
5. Auto-initialize khi gửi/điều chỉnh/duyệt chưa ghi INITIALIZE audit. Ghi đúng một audit khi balance row mới tạo, cùng transaction; explicit initialize không ghi trùng. Không backfill audit giả cho quá khứ.
6. GET balance chưa khởi tạo trả carry=0 dù lúc submit auto-init có carry. Dùng chung biểu thức remaining cho preview/initialize, GET không ghi DB; giữ `initialized=false`. App đọc cờ đã có trong API và ghi “Số dư dự kiến · chưa khởi tạo”, không suy tính quỹ.
7. Hộp thoại hủy app dispose controller trong lúc route đóng còn dựng TextField, gây exception. Để TextField tự quản lý controller theo vòng đời widget. Giữ dialog/lý do/bố cục người dùng đã chỉnh.
8. App thiếu guard hủy lặp/stale snapshot sau lỗi. Khóa mutation trong dialog/request, chặn refresh xen cancellation, đọc lại sau kết quả và khi quay về từ form. Refresh lỗi giữ dữ liệu nhìn được nhưng bỏ action cũ. Submit 409/network/5xx cần kiểm tra danh sách trước gửi tiếp; 400 cho sửa input, không tự replay hoặc thêm hàng đợi/idempotency contract mới.

## Bằng chứng cuối

| Kiểm tra | Kết quả |
| --- | --- |
| `r9-leave.postgres.spec.ts` — disposable PostgreSQL + real HTTP | 28/28 PASS |
| Leave policy/status/workflow/update và reporting-leave-lock unit regressions | 18/18 PASS |
| Mobile `r9_leave_test.dart` | 9/9 PASS |
| Mobile `leave_management_test.dart` | 6/6 PASS |
| Backend noEmit, scoped ESLint, isolated compile `dist/r9` | PASS |
| Flutter analyze màn nghỉ phép/API client/test R9 | PASS |
| Scoped tracked diff whitespace | PASS |
| Chrome `/dashboard/leave`, `/dashboard/leave-workflow` đọc dữ liệu | PASS |
| Flutter Hot Reload RMX5555 qua USB | PASS, 23/1780 libraries lượt cập nhật cuối |

Backend **46 ca khác nhau**, Mobile **15 ca**, chỉ suite có mục tiêu. Ca revoked Head được chạy lại riêng sau bổ sung assert Admin là chủ đơn không tự fallback; PASS, không cộng thành ca thứ 47. Lượt đầu có 5 nhóm lỗi thực và lỗi fixture (chọn cột id không tồn tại ở recipient), lượt preview riêng tái hiện carry=0; widget test tái hiện controller disposed cùng lỗi finder/cuộn và một compile callback. Các lượt thất bại không tính PASS; đã sửa và chạy lại. Không chạy full suite, không build/xuất release APK.

API/DB kiểm chứng: reserve→confirm→approve→cancel; reject/resubmit; duplicate/concurrent different-date requests; adjust âm tranh submit không overdraw; initialize concurrent không lặp; opposite decisions/confirm/cancel races đúng trạng thái cuối, audit/decision inbox chỉ một; owner/assigned actor/grant revoked/Admin fallback/self denial; AM/PM/hour chính xác, disabled/oversized/cross-date; primary/override/rest/missing schedule; malformed/null/blank/date/UUID; carry usage/cap/preview; entitlement và request snapshot; inactive policy không chọn mới nhưng giữ lịch sử; kỳ khóa/cross-month, pending blocker và submit đang chờ period lock đọc LOCKED sau commit; lỗi audit rollback quyết định/quỹ/inbox.

Fixture quỹ legacy âm và prior-year requests/adjustments được inject trong DB thử để kiểm tra validator/carry, không phải mutation hợp lệ qua API hoặc sửa dữ liệu khách. API child dùng JWT/port riêng, SMTP/FCM tắt, không credential đăng nhập thật; mọi token role claim giả vẫn được đối chiếu role hiện hành. DB tên `r9_leave_test_<UUID>`, guard local development/opt-in, teardown chỉ drop DB/process riêng; không chạm quỹ/đơn/policy development để thử.

Chrome hiện chỉ có bốn policy legacy active không tracking; các policy demo tracking đã ngừng. Mở Số dư thấy empty state đúng, không bấm khởi tạo/bật tracking/điều chỉnh. Hàng đợi tải 2 pending legacy thiếu tuyến, không xử lý. Đây là đọc UI hiện hữu, không bằng chứng mutation UI/quỹ máy thật.

## Phạm vi file và rollout

- `backend/src/modules/leave/leave.service.ts`: duration/carry/validation/audit/locking; `leave.dto.ts`, `leave.controller.ts`, `domain/leave-status.ts`.
- `backend/test/r9-leave.postgres.spec.ts`, bổ sung calendar regression `backend/test/leave-status.spec.ts`.
- `mobile/lib/features/leave/leave_request_screen.dart`, `mobile/test/r9_leave_test.dart`.
- **Adapter ngoài màn:** `mobile/lib/services/api_client.dart` chỉ parse optional cờ balance `initialized` đã có. Legacy không có cờ giữ null, không giả đã khởi tạo; không sửa endpoint hoặc rule Frontend.
- PROJECT/FLOWS/IMPLEMENTATION/README/module acceptance plan và biên bản này. Không sửa Web layout, workflow service, Reporting, Auth, schema/migration hoặc module khác. Giữ toàn bộ dirty tree/user/R1–R8.
- Shared order: employee leave-route → affected periods → request/policy/balance; initialize khóa các employee theo UUID trước policy/balances; adjust dùng cùng employee lock; policy shared lock tránh đang dùng snapshot bị đổi giữa thao tác. Bulk init giữ lock nhiều employee trong transaction, các request liên quan có thể chờ; chưa benchmark quy mô lớn.
- **Không migration mới**, không backfill/recalculate đơn cũ hoặc entitlement, không seed/cleanup live. API watch đang dùng source mới; Web/API 3000/3001 và Flutter session giữ Hot Reload. Không commit/push/deploy production trong R9.

## Chạy lại có mục tiêu

PowerShell tại `backend`:

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.build.json --outDir dist/r9 --tsBuildInfoFile dist/r9/tsconfig.tsbuildinfo
$env:R9_POSTGRES_TEST='1'
node --env-file=.env node_modules/vitest/vitest.mjs run test/r9-leave.postgres.spec.ts test/leave-policy.spec.ts test/leave-status.spec.ts test/leave-workflow.spec.ts test/leave-policy-update.spec.ts test/reporting-leave-lock.spec.ts --no-file-parallelism
```

Tại `mobile`:

```powershell
flutter test --no-pub test/r9_leave_test.dart test/leave_management_test.dart
flutter analyze --no-pub lib/features/leave/leave_request_screen.dart lib/services/api_client.dart test/r9_leave_test.dart
```

## Phần chưa nghiệm thu / giới hạn

- NOT_RUN: luồng UI mới nhân viên gửi AM/PM/giờ → Leader → Head → hủy/đối chiếu balance thật trên Web/app, keyboard/font lớn và tắt mạng thực. Computer-use không có native phone surface; không dùng adb input/screenshot/XML bypass. Hot Reload/HTTP/widget không thay nghiệm thu người dùng.
- NOT_RUN: FCM background/killed; inbox API đúng không chứng minh notification ngoài màn hình, Firebase development chưa cấu hình.
- Không UUID idempotency cho tạo đơn phép; POST retry cùng ngày bị overlap 409, app không tự replay và yêu cầu kiểm tra danh sách khi chưa rõ kết quả. Không tự thêm vì đổi contract/schema ngoài sửa lỗi.
- Không tự mở nhiều đơn không giao giờ trong ngày, điều kiện theo thâm niên/khung ca/nghỉ trưa hoặc điều chỉnh lương. Chốt/báo cáo/Excel xuyên module đầy đủ thuộc R12, production/backup restore thuộc R14.
- Rule ngày nghỉ mới không sửa requestedMinutes của đơn cũ; nếu cần sửa số phút lịch sử phải có chỉ thị xử lý dữ liệu riêng. R10 chỉ triển khai khi Tech Lead giao.
