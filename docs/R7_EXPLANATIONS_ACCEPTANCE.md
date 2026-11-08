# R7 — Giải trình và điều chỉnh công

Ngày: 2026-10-10. Trạng thái: **PARTIAL** — Backend/API/DB và targeted app tests PASS; đã kiểm chứng app gửi ảnh → Admin dự phòng → hộp thư. Luồng hai bước mới trên UI/máy thật, offline và push nền chưa đủ bằng chứng.

## Phạm vi và rule giữ nguyên

- Nhân viên chủ động gửi nội dung, ảnh tùy chọn; không lấy GPS cho giải trình.
- Leader được chỉ định xác nhận → Trưởng phòng được chỉ định quyết định; hai người khác nhau, không tự duyệt. Grant/phạm vi hiện hành được kiểm tra lúc xử lý.
- Admin dự phòng chỉ khi tuyến thiếu/không còn hợp lệ, có lý do; không giả xác nhận Leader, không bỏ qua tuyến khỏe, không duyệt đơn mình hoặc khi đã là người xác nhận.
- Version lỗi/trạng thái kết thúc không được quyết định lại. Audit/inbox cùng transaction, push sau commit. Duyệt không tự sửa bảng công.
- Chỉ Admin điều chỉnh công, có old/new/reason/actor/time; kỳ chốt chặn writer. Giữ nguyên loại trường/giá trị, không thêm idempotency contract cho điều chỉnh (mỗi lần gửi là một audit mới).

## Lỗi tái hiện và sửa

1. P1: điều chỉnh kiểm tra kỳ rồi lưu riêng, có thể ghi trong lúc kỳ đang chốt, kể cả chưa có hàng OPEN. Regression trước sửa không thấy transaction chờ khóa; sau sửa chờ tháng, đọc LOCKED sau commit và trả 409, không lưu điều chỉnh.
2. P1: `reason="     "` qua DTO MinLength và lưu thành công 201. Sau sửa Backend trim và kiểm tra ít nhất 5 ký tự, trả 400, không ghi DB.
3. Củng cố consistency: oldValue và INSERT dùng một EntityManager cùng khóa tháng; `clock_timestamp()` tại ghi thay vì timestamp bắt đầu transaction trước khi chờ khóa. Hai điều chỉnh đồng thời nối đúng old/new, không sửa bản cũ.
4. Gửi/phản hồi giải trình kiểm tra ownership ảnh bằng transaction manager đang giữ khóa upload, tránh lấy connection pool bên ngoài transaction.

## Bằng chứng cuối

| Kiểm tra | Kết quả |
| --- | --- |
| `r7-explanations.postgres.spec.ts` — PostgreSQL + real HTTP, DB ngẫu nhiên riêng | 17/17 PASS |
| Explanation workflow/domain/submission và reporting blocker unit tests | 30/30 PASS |
| `attendance-evidence-access.spec.ts` (lượt riêng) | 4/4 PASS |
| Mobile `explanation_management_test.dart` | 13/13 PASS |
| Backend TypeScript noEmit | PASS |
| ESLint các file Backend/test chạm trong R7 | PASS |
| Backend compile riêng `dist/r7`, không xóa dist server watch | PASS |
| HTTP local API health + Web `/dashboard/explanations` | 200 + 200 |
| ADB Wireless inventory | RMX5555 connected `192.168.1.33:38153` |

Tổng Backend 51 qua các lượt cuối (47 + evidence4), Mobile13. Các lượt đầu thất bại gồm regression trước sửa và lỗi fixture test; không tính lượt đầu là PASS. Không chạy toàn suite, không build APK.

Real HTTP kiểm chứng: actor/order/self-approval/role claim giả; route khỏe cấm fallback; thiếu tuyến, grant revoked/expired/future và team inactive; fallback có lý do/actor thật; hai confirm, hai quyết định trái nhau, fallback và reroute/confirm đồng thời; một audit/inbox quyết định; đổi Head/default giữ xác nhận cũ và mất quyền người cũ; idempotent submission và nội dung khác cùng UUID bị chặn; legacy owner/deadline; period LOCKED; adjustment authority/old-new/whitespace/invalid date/concurrency. Injection lỗi INSERT audit chứng minh rollback quyết định và inbox; unit sender outage chứng minh lỗi push không undo kết quả đã xử lý.

Ảnh synthetic PNG: đọc có JWT đúng owner/Admin/assigned live manager; người khác 404, không JWT 401; ownership/reference ngoài hệ thống/MIME sai/ảnh >5MB bị từ chối; ảnh đã liên kết không ghi đè nội dung, retry cùng bytes hợp lệ. Không dùng ảnh/dữ liệu nhân sự thật.

DB mang prefix `r7_explanations_test_<UUID>`, HTTP port ngẫu nhiên, storage thư mục tạm thuộc fixture; SMTP/FCM tắt và credential JWT chỉ cho DB thử. Fixture đã dọn DB/process/storage của chính nó, không xóa dữ liệu development/customer.

## File và triển khai

- `backend/src/modules/attendance/attendance.service.ts`: transaction điều chỉnh, trim/date, reader kiểm tra ảnh. Không chạm Domain, workflow service hay permission API.
- `backend/test/r7-explanations.postgres.spec.ts`: opt-in fixture/kịch bản trên.
- `backend/test/employee-explanations.spec.ts`: assertion transaction reader.
- `backend/test/explanation-workflow.spec.ts`: regression push failure.
- `FLOWS.md`, `IMPLEMENTATION.md`, module acceptance plan và biên bản này.
- Không migration/schema mới. Không sửa Web/App/native hoặc dependency. Giữ nguyên toàn bộ thay đổi R1–R6/user đã có trong dirty tree; chưa commit/push/deploy production.

Chạy lại (PowerShell, tại `backend`, sau khi compile):

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.build.json --outDir dist/r7 --tsBuildInfoFile dist/r7/tsconfig.tsbuildinfo
$env:R7_POSTGRES_TEST='1'
node --env-file=.env node_modules/vitest/vitest.mjs run test/r7-explanations.postgres.spec.ts test/explanation-workflow.spec.ts test/explanation-policy.spec.ts test/employee-explanations.spec.ts test/reporting-leave-lock.spec.ts test/attendance-evidence-access.spec.ts --no-file-parallelism
```

## Còn thiếu / giới hạn

- NOT_RUN: luồng đơn mới từ DEMO-NV → Leader → Head trên UI và đối chiếu app; điều chỉnh/report xuyên UI. Nhánh app gửi ảnh → Admin dự phòng → hộp thư đã được kiểm chứng bên dưới.
- NOT_RUN: phân biệt camera/gallery trên máy thật, offline ảnh/upload rồi resume/đổi tài khoản và FCM background/killed trong R7. Đã mở được ảnh thật của đơn app gửi nhưng không quan sát trực tiếp thao tác chọn/chụp ảnh. Test app dùng mock HTTP/widget không thay nghiệm thu máy thật. Push failure kiểm ở unit, không kiểm provider delivery.
- Chưa rà toàn bộ race chốt kỳ với attendance/leave/OT/report hoặc real pentest; thuộc module liên quan/R12. Audit bất biến qua nghiệp vụ không có nghĩa DB superuser không thể thay dữ liệu.
- Thời gian `created_at` của SUBMIT và WORKFLOW_START trong một transaction có thể bằng nhau; UUID ordering không chứng minh thứ tự nội bộ. Actor/action/version đầy đủ, không giả timestamp lịch sử.
- Không tự chuyển R8. Khi Tech Lead giao, tiếp tục nghỉ phép/quỹ theo kế hoạch; gate cuối phải chạy lại các ca thiết bị/push chưa có bằng chứng.

## Tiếp nối kiểm tra thực tế — lượt đọc UI, 2026-10-10

Trạng thái vẫn PARTIAL; không cộng thêm automated test hoặc ghi PASS cho luồng thiết bị chưa chạy.

- Thao tác trực tiếp Chrome đang đăng nhập Admin tại localhost:3000: trang Giải trình tải xong; tìm chuỗi không khớp hiển thị “Chưa có đơn phù hợp”, bộ lọc Tất cả đổi từ 5 đơn mở sang 17 đơn, tìm mã fixture QAM-AE3B1CEE chỉ còn hai đơn Development Only.
- Mở drawer của fixture đã duyệt từ 2026-10-07 (696b2322-9ae0-473e-bca9-7eb03e597368): UI thể hiện Leader và Trưởng phòng thực tế với thời gian riêng, bốn audit SUBMIT/WORKFLOW_START/LEADER_CONFIRM/HEAD_REVIEW, không có nút duyệt lại. Đây là kiểm tra đọc UI dữ liệu cũ, không phải một đơn mới được duyệt trong lượt này.
- Trang Vận hành hệ thống hiển thị Firebase Push Notification “Chưa cấu hình”. Kiểm tra cấu hình Backend chỉ in boolean: pushEnabled=false, projectConfigured=false, serviceAccountPathConfigured=false. Không có bằng chứng FCM gửi hoặc điện thoại nhận push; không publish test thông báo hay gửi lại backlog.
- RMX5555 vẫn kết nối Wireless ADB 192.168.1.33:38153; reverse tcp:3001→3001 tồn tại. Đây là kết nối debug, không phải bằng chứng app đã gửi đơn.
- Đọc DB demo: DEMO-NV/DEMO-LEADER/DEMO-TP active, tuyến DEMO-NV version1 tới leader@demo.local và tp@demo.local; hai grant chưa thu hồi và trong thời hạn. Không reset mật khẩu, không tạo phiên thay khách, không sửa dữ liệu/tuyến/quyết định hiện có.
- Computer-use hiện chỉ cung cấp Chrome, inventory native apps rỗng và native control bị tắt. Không dùng adb input/screenshot/UI XML để vượt giới hạn thao tác. Nhờ Tech Lead tự gửi một đơn/ảnh thử từ app; chờ kết quả/screenshot rồi tiếp tục Web và đối chiếu DB. Bước đổi mạng/quyền/camera trên máy thật chưa thực hiện.
- Muốn nghiệm thu push thật cần Firebase project/options Android và service-account Backend đặt ngoài Git, quyền thông báo do người dùng cấp, sau đó chạy ma trận background/cold-process. Không đưa private key vào chat/app. Trước khi bật sender phải kiểm tra cách xử lý thông báo cũ đang chờ, không tự gửi hàng loạt tới khách để test.

Chỉ cập nhật biên bản/kế hoạch ở lượt này; chưa sửa code, chạy test/build, commit/push hoặc đổi cấu hình bảo mật.

## Tiếp nối máy thật và Admin dự phòng — 2026-10-10, 16:13–16:16 +07

- Tech Lead báo đã gửi đơn từ app. Đối chiếu DB cho thấy người gửi thực tế là DEV-EMPLOYEE, không phải DEMO-NV: đơn `59457b7b-2b6c-4d40-beb1-a4cb29260382`, ngày 2026-10-10, loại MISSING_CHECK_OUT, nội dung `R7-UAT:Kiểm tra hai bước và máy thật`. Không tự đổi chủ đơn hoặc cấu hình tuyến cho tài khoản này.
- Ban đầu SUBMITTED/WAITING_ROUTING, version1, thiếu Leader/Head; DEV-EMPLOYEE không có thành viên team hiện hành. Ảnh đã được lưu và gắn với đơn, không có GPS. Mở ảnh có xác thực qua Chrome thành công, JPEG 1800×2400, ảnh thử tối/che camera; không phải ảnh lỗi tải.
- Thao tác Admin dự phòng trên Chrome với lý do `R7-UAT: Admin duyệt dự phòng vì tài khoản demo chưa có tuyến; kiểm thử ảnh và thông báo trên máy thật.` UI báo thành công và hiển thị người duyệt/lý do; sau quyết định không còn nút duyệt lại.
- Đối chiếu DB: APPROVED/COMPLETED, version2, decision_method=ADMIN_FALLBACK, reviewed_by là admin@demo.thienminh.local, confirmed_by=NULL. Mỗi audit WORKFLOW_START/SUBMIT/ADMIN_FALLBACK_REVIEW có đúng một bản ghi. Không giả Leader xác nhận, không phát sinh điều chỉnh công cho nhân viên/ngày này.
- Hộp thư có đúng một thông báo quyết định gắn ID đơn, tiêu đề “Giải trình đã được duyệt”, tên Admin và ghi chú R7-UAT. Tech Lead xác nhận trên app: “Đã thấy hha”. Đây là bằng chứng inbox trên máy thật, không phải push khi app đóng.
- Ảnh bằng chứng UI lưu ngoài Git: `C:/Users/nguye/Downloads/R7-UAT-admin-fallback-20261010-1616.png`.
- Tech Lead chọn dùng nv@demo.local đã có tuyến cho lượt hai bước tiếp theo. Chờ đơn mới R7-UAT-2STEP từ tài khoản này và Chrome đăng nhập Leader; không sửa tuyến hay các đơn cũ.

Lượt này chỉ quyết định trên đơn demo nghiệm thu đã xác định và cập nhật tài liệu. Không sửa code, chạy thêm automated test/build, đổi credential, commit/push, build APK hoặc gửi backlog push. Giữ PARTIAL cho phần chưa chạy.
