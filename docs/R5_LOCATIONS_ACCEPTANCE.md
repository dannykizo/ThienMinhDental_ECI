# R5 — Vị trí văn phòng

Ngày nghiệm thu: 2026-10-10. Phạm vi: cấu hình vị trí, geofence và Admin Web; không triển khai R6.

**Kết quả: Backend/API targeted PASS; toàn module PARTIAL.** 38/38 targeted tests đạt. Ảnh nền bản đồ chưa tải được do DNS trên máy development; quyền vị trí/GPS thực tế tại ranh giới chưa nghiệm thu.

## Rule giữ nguyên

- Chỉ ADMIN hiện hành quản trị vị trí và đọc lịch sử; grant Head/Leader không tạo quyền Admin.
- Văn phòng cần chi nhánh; địa điểm bên ngoài có thể dùng chung. Tạo/chuyển chi nhánh/kích hoạt lại phải tham chiếu chi nhánh đang hoạt động.
- Attendance chọn vị trí hoạt động gần nhất trong các chi nhánh phân công hiện hành (kể cả phân công phụ), hoặc địa điểm dùng chung. Chi nhánh/vị trí ngừng hoạt động và phân công hết hạn bị loại.
- Bán kính cấu hình 1–100 m, sai số GPS cấu hình 1–50 m độc lập; các trường này là số nguyên theo schema hiện hữu. Tọa độ phải là số hữu hạn trong phạm vi địa lý.
- Chỉ lấy vị trí theo sự kiện/thao tác chủ động, không theo dõi liên tục. Thay cấu hình không sửa lại attendance event lịch sử.
- Ngoài vùng/sai số xấu hiện **ghi nhận kèm riskFlags**, không phải tự động từ chối hoặc coi là công hợp lệ. Quyết định xử lý rủi ro/chống giả GPS thuộc R6, không đổi trong R5.

## Lỗi tái hiện và sửa

| Lỗi trước sửa | Kết quả sau sửa |
| --- | --- |
| Tọa độ JSON dạng chuỗi được lưu; số thập phân vào cột integer gây lỗi DB | DTO chặn kiểu sai; trả 400 |
| Tên/địa chỉ toàn khoảng trắng được lưu; vượt độ dài schema gây 500 | DTO bắt buộc có nội dung, giới hạn đúng varchar 120/300 |
| PATCH null bỏ qua IsOptional, dẫn đến lỗi NOT NULL hoặc bỏ qua giá trị sai | Optional chỉ bỏ qua undefined; null bị 400, riêng branchId null vẫn hợp lệ cho địa điểm bên ngoài |
| DTO chứa undefined làm thiếu thuộc tính ở response/audit; cập nhật đồng thời có snapshot cũ | Bỏ undefined khỏi thay đổi và khóa hàng vị trí trong transaction; audit giữ đầy đủ trước/sau theo chuỗi cập nhật |
| Haversine tại điểm đối cực vượt 1 do round-off → NaN → so sánh ngoài vùng không gắn cờ | Chặn kết quả trung gian trong [0,1], khoảng cách hữu hạn và OUTSIDE_GEOFENCE; unit và API regression đạt |
| Bản đồ nền trắng không giải thích | Loading/error và nút thử lại; giữ form/toạ độ đã nhập, không thay tile provider hoặc dữ liệu DB |

Không migration mới: schema không đổi. Không dọn/tự sửa dữ liệu vị trí cũ.

## Bằng chứng kiểm thử

- PostgreSQL/API thật trong DB riêng ngẫu nhiên `r5_locations_test_<uuid>`: chạy migrations hiện hành, không seed customer/development DB. Actor/sessions/evidence giả chỉ trong DB đó; SMTP/FCM tắt. Kết thúc đã xóa DB và ảnh fixture tạm do test tạo, không xóa dữ liệu dự án.
- API 20/20: create/list/audit, tọa độ và giới hạn/kiểu/blank/null, PATCH/branch/type transitions, branch inactive, ADMIN và non-admin/JWT role giả, Head/Leader scoped grants, request/UUID sai, concurrent edits, nearest/secondary/shared/foreign/inactive/expired scope, rollback khi chưa cấu hình, độc lập distance/accuracy, thiếu GPS, điểm đối cực, lịch sử không bị viết lại.
- Domain/regression trực tiếp 18/18: office-geofence 5, office-location-policy 2, attendance-event-security 11. Ranh giới unit kiểm tra 99.999/100.001 m và equality trên chính giá trị distance; API dùng 99.9/100.1 m, accuracy 50/50.1 m.
- Lần đầu 4/23 test thất bại ở validation/null/audit-concurrency; thêm test đối cực cũng thất bại trước sửa. Chạy lại cuối 38/38 đạt.
- `pnpm typecheck`: PASS Backend/Web; `pnpm lint`: PASS Backend/Web. Backend `pnpm --dir backend build` và Web `pnpm --dir frontend build`: PASS. Đã xem diff, `git diff --check`: PASS (cảnh báo chuyển LF/CRLF của worktree hiện hữu, không lỗi whitespace).
- Chrome đã đăng nhập Admin tại `/dashboard/locations`: tải dữ liệu thật; mở Sửa; nhập tên nháp và bán kính 99; thử tải lại map; DOM xác nhận cả hai giá trị còn nguyên; Hủy chỉnh sửa trả về form mới và vị trí đã lưu vẫn bán kính 100. Không POST/PATCH vị trí thật qua UI.
- Ảnh bằng chứng cục bộ: `logs/r5-locations-20261010.png` (ignored, không commit).
- Ảnh tile trên Chrome: complete=true, naturalWidth=0. Node fetch cùng tile lỗi ENOTFOUND; Resolve-DnsName báo DNS_ERROR_RCODE_NAME_ERROR cho tile.openstreetmap.org. Đây là bằng chứng mạng máy development, không kết luận OSM ngừng dịch vụ toàn cầu.
- Backend health sau khởi động lại: HTTP 200. Nest watch và Next development giữ hoạt động; Android Wi-Fi ADB và reverse 3001 còn kết nối. Flutter/App không đổi trong R5.
- Bổ sung theo cho phép của Tech Lead: bấm đúng một lần “Lấy vị trí thiết bị này” trên Chrome localhost. Có trạng thái “Đang lấy vị trí…” và kết thúc với “Quá thời gian chờ lấy vị trí”; nút được mở lại, latitude/longitude vẫn trống. Không có tọa độ/accuracy để kiểm tra success, không bấm Lưu và không thay DB. Ảnh `logs/r5-geolocation-timeout-20261010.png` chỉ lưu ignored. Ca xử lý timeout UI PASS; chưa xác định nguyên nhân browser/OS/network positioning nên không kết luận GPS thành công hoặc permission bị từ chối. Không tự lấy lại mẫu thứ hai.

## Giới hạn / việc còn lại

- **BLOCKED_ENV:** nghiệm thu ảnh nền bản đồ thành công, click/kéo theo địa hình và tile recovery từ fail sang success. Hiện thử lại vẫn lỗi DNS. Chưa đổi DNS máy, provider, credentials hoặc env; muốn dùng provider khác cần Tech Lead xác nhận và attribution/config hợp lệ.
- **PARTIAL:** thao tác lấy một mẫu vị trí trên Chrome đã chạy nhưng timeout; loading/error/nút khôi phục đã xác minh. Lấy tọa độ thành công, cấp/từ chối permission, GPS thật sát ranh giới 100 m và thiết bị có accuracy xấu chưa nghiệm thu.
- **NOT_RUN:** lưu/tạm ngưng/khôi phục bằng UI với fixture riêng. Các mutation này đã qua API thật, không lấy API thay bằng chứng thao tác người dùng.
- Chưa nghiệm thu production/Cloudflare/tunnel/customer account. Không commit/push/deploy, không build APK.
- Không chống giả GPS tuyệt đối. R6 cần chốt và rà cơ chế rủi ro, camera/replay, kỳ khóa và báo cáo, không tự mở rộng ở đây.

## Vùng thay đổi

- `backend/src/modules/office-locations/office-locations.dto.ts`: validation theo contract/schema.
- `backend/src/modules/office-locations/office-locations.service.ts`: khóa cập nhật và lọc undefined bảo toàn audit.
- `backend/src/modules/attendance/domain/office-geofence.ts`: dependency ngoài module bắt buộc, sửa NaN để đánh giá geofence đúng.
- `backend/test/r5-locations.postgres.spec.ts`, `backend/test/office-geofence.spec.ts`: acceptance/regression.
- `frontend/components/office-location-map.tsx`: lỗi/loading/retry/resize, không redesign hoặc thay provider.
- README, IMPLEMENTATION và MODULE_ACCEPTANCE_PLAN: trạng thái, contract validation và giới hạn nghiệm thu.

GitNexus không có index repo này; dùng source/API trực tiếp theo fallback, không phân tích graph repo khác. Computer Use kiểm tra Chrome trạng thái thật, form chưa lưu và một lần lấy vị trí được Tech Lead cho phép; không thay cấu hình quyền vị trí hoặc dữ liệu văn phòng đang dùng.

## Chạy lại có mục tiêu

Từ `backend/`, PowerShell, DB URL local development trong `.env` (không in secret):

```powershell
pnpm build
$env:R5_POSTGRES_TEST='1'
$env:NODE_ENV='development'
node --env-file=.env node_modules/vitest/vitest.mjs run test/r5-locations.postgres.spec.ts test/office-geofence.spec.ts test/office-location-policy.spec.ts test/attendance-event-security.spec.ts
```

Build vào `backend/dist` có thể xung đột với Nest watch hiện hữu. Dùng output build riêng nếu cấu hình sau này được duyệt, hoặc khởi động lại `pnpm dev:api` sau build và kiểm tra health; không tự đổi build architecture trong R5. Không chạy cả suite sau từng sửa. Chờ Tech Lead nghiệm thu/cho phép trước R6.
