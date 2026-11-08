# R2 — Tổ chức và quyền quản lý

Ngày: 2026-10-09. Tech Lead: Nguyễn Thành Nam.

## Kết luận

**Backend/API có mục tiêu: PASS — 85/85 test, 8 file. Nghiệm thu toàn bộ Web/App: PARTIAL.** Không dùng kết quả API để tuyên bố đã thao tác các flow Head/Leader trên giao diện hoặc điện thoại thật. Không triển khai R3 trong lượt này.

Phạm vi: cơ cấu/team trong một phòng, xuyên chi nhánh; thành viên và grant độc lập; nhiều scope; thời hạn/thu hồi; danh mục hiện hành/lịch sử; quyền đọc dữ liệu/ảnh; đổi tuyến chưa xử lý giữ bước đã xác nhận. Giữ nguyên policy đã chốt, API contract, stack và dữ liệu khách hàng đang test.

## Lỗi đã tái hiện và sửa

**R2-01 / P1:** `GET /organization/teams/:id/members` và `GET /organization/departments/:id/employees` chưa xét tài khoản nhân viên còn hoạt động. Khi `users.is_active=false` nhưng hồ sơ còn active, danh bạ vẫn coi nhân sự đó hiện hành, khác với scoped operational reads và routing options.

- Tái hiện qua HTTP/JWT/phiên thật trên PostgreSQL tạm: lần đầu 11/12 case đạt; case tài khoản ngừng thất bại.
- Sửa duy nhất source tổ chức: team membership eligibility xét tài khoản; danh bạ phòng chỉ nhận hồ sơ có tài khoản active. Nhân sự không có tài khoản cũng không được coi là member đủ điều kiện đọc scope, nhất quán với routing/managed modules.
- Admin vẫn thấy membership lịch sử với `INACTIVE`/`ENDED`, không xóa hoặc tự rút thành viên. Không thay rule thêm thành viên: tư cách thành viên lưu riêng với quyền quản lý/tài khoản.
- Test riêng cho cả danh bạ team và phòng, giữ lịch sử và khôi phục điều kiện hiển thị.
- Một lần chạy bổ sung thất bại do fixture cập nhật hồ sơ inactive mà thiếu trường lifecycle bắt buộc. Đã sửa fixture theo constraint hiện hữu, không sửa/nới constraint sản phẩm.

## Bằng chứng đã chạy

| Nhóm | Kết quả / bằng chứng |
|---|---|
| Team và tổ chức | Một phòng bất biến, mã duy nhất trong phòng; thêm thành viên HCM/HN cùng phòng; từ chối người ngoài phòng; phân công kiêm nhiệm được nhận nhưng không trả chi nhánh ngoài phạm vi. |
| Quyền Backend | Membership không tự cấp quản lý; JWT chứa role Admin giả trong claim không thay role hiện hành từ DB; Leader không đọc toàn phòng/team khác; Head đọc phòng được cấp; không mở API chi tiết nhân viên/catalog/grant/audit quản trị. |
| Nhiều scope và thời hạn | Nhiều team/phòng cho cùng một người; chính thức/tạm thời độc lập thời hạn; quyền sắp hiệu lực/hết hạn/thu hồi; interval liền kề không overlap; biên bắt đầu bao gồm/kết thúc loại trừ có Domain test. |
| Eligibility hiện hành | Tài khoản, hồ sơ, phòng, chi nhánh và phân công hết hiệu lực được kiểm tra; Admin giữ membership cũ; rút/thêm lại tạo lịch sử mới, không tự thu hồi grant riêng. |
| Đồng thời trên PostgreSQL | Hai request cấp cùng grant/thêm cùng thành viên: một 201, một 409, một record và audit tương ứng. Xóa catalog đồng thời lần dùng đầu: chỉ một phía thành công, không mất lịch sử hoặc tạo FK mồ côi. |
| Vòng đời danh mục | 9 case PostgreSQL và 16 unit case: unused deletion/audit; chặn used SET NULL, dấu sử dụng sau khi scope bị thay; stale preview; ngừng/khôi phục; team bất biến. Ngừng/khôi phục phạm vi không hồi sinh grant thu hồi hoặc thay assignment. |
| Tuyến giải trình/nghỉ phép | HTTP xác nhận thật rồi đổi Head: giữ confirmer/time/team/Leader; version cũ và đổi team đã xác nhận bị 409; Head ngoài scope bị 400; người bị thay mất quyền history, người mới đủ scope đọc được. Không đổi tuyến mặc định bằng per-item reroute. |
| Ảnh minh chứng thật | Upload PNG vào thư mục tạm; owner/Admin/assigned Leader/Head nhận HTTP 200; quản lý team/phòng khác 404; thu hồi grant khiến JWT cũ không còn đọc ảnh. |
| Regression trực tiếp | Domain/service workflow và Admin fallback; scoped reads lọc trước query/tổng hợp. Không nghiệm thu quỹ phép/bảng công/push thực tế thay R7/R9/R11/R12. |

Các bài kiểm tra API dùng token/phiên fixture do test tạo, không dùng đăng nhập tài khoản demo/khách hàng. Đây không phải nghiệm thu password/login hoặc cookie Web thay cho R1.

### Kết quả cuối

- `r2-organization.postgres.spec.ts`: 16/16 (API thật + PostgreSQL).
- `organization-catalog.postgres.spec.ts`: 9/9 (PostgreSQL).
- `organization-management-access.spec.ts`: 9/9.
- `organization-catalog.spec.ts`: 16/16.
- `explanation-workflow.spec.ts`: 11/11.
- `leave-workflow.spec.ts`: 8/8.
- `admin-fallback-review.spec.ts`: 12/12.
- `managed-modules.spec.ts`: 4/4.
- Backend `typecheck`, `lint`, `build`: exit 0. Không đổi Web/App nên không chạy lại quality gate hai workspace đó; Web gate trước R2 vẫn giữ kết quả riêng, không coi là mới chạy trong R2.
- Kiểm tra Chrome trong phiên Admin có sẵn: kết nối phục hồi, trang tổ chức tải thành công; tab Quyền quản lý và Team & thành viên có bảng/bộ điều khiển hiện hữu. Chỉ đọc, không cấp/thu hồi quyền hoặc sửa dữ liệu nghiệm thu qua UI.
- Sau restart: `http://localhost:3001/api/health` và `http://localhost:3000/dashboard/organization` trả 200; một Nest watch đang chạy. Query metadata xác nhận không còn DB tạm `r2_org_test_<32hex>`/`catalog_test_<32hex>` của các suite. Thư mục ảnh temporary đã teardown; không xóa storage của project.

## Cô lập dữ liệu và lệnh chạy lại

Hai suite PostgreSQL yêu cầu opt-in, `NODE_ENV=development`, DATABASE_URL local. Chỉ đọc cấu hình kết nối trong bộ nhớ; tạo/migrate database riêng `r2_org_test_<32hex>` / `catalog_test_<32hex>`. Tất cả ghi/xóa/thu hồi/phê duyệt test nằm trong các DB do chính test tạo; không seed/mutate database nghiệm thu. API riêng dùng cổng trống, SMTP/FCM disabled, secret random không ghi log/Git. PNG trong thư mục temporary riêng; teardown dừng API, xóa đúng DB/thư mục đã tạo.

Chỉ chạy khi Tech Lead yêu cầu kiểm thử R2; không thêm vào hook hoặc lệnh tự chạy mỗi edit:

```powershell
cd backend
corepack pnpm build
$env:R2_POSTGRES_TEST='1'
$env:CATALOG_POSTGRES_TEST='1'
try {
  corepack pnpm exec node --env-file=.env node_modules/vitest/vitest.mjs run test/r2-organization.postgres.spec.ts test/organization-management-access.spec.ts test/organization-catalog.spec.ts test/organization-catalog.postgres.spec.ts test/explanation-workflow.spec.ts test/leave-workflow.spec.ts test/admin-fallback-review.spec.ts test/managed-modules.spec.ts
  $r2CheckExit=$LASTEXITCODE
} finally {
  Remove-Item Env:R2_POSTGRES_TEST
  Remove-Item Env:CATALOG_POSTGRES_TEST
}
if ($r2CheckExit -ne 0) { throw 'R2 checks failed' }
```

Tránh build Backend khi nhiều watcher cùng ghi `dist`. Lượt này phát hiện hai Nest watch trùng; đã dừng đúng hai watcher của project và khởi động một `pnpm dev:api` ẩn, log `logs/api-r2.log`/`api-r2.err.log` ignored. Không thay launcher/config hoặc dừng PostgreSQL/Web.

## File thay đổi trong R2

- `backend/src/modules/organization-access/application/organization-access.service.ts`: hai danh bạ kiểm tra tài khoản, không đổi contract hoặc schema.
- `backend/test/r2-organization.postgres.spec.ts`: suite opt-in độc lập; HTTP, concurrency, evidence, eligibility và routing regression.
- FLOWS/IMPLEMENTATION/README, MODULE_ACCEPTANCE_PLAN, ORGANIZATION_CATALOG_LIFECYCLE và biên bản này: cập nhật bằng chứng/giới hạn.
- Không sửa code ngoài Organization Access, không migration mới, không sửa Mobile/Web, không đóng gói APK, không commit/push/deploy hoặc gom những thay đổi có trước.
- GitNexus không có index repo này; lỗi regenerate đã ghi ở prerequisite. Dùng source/call-site/FK inspection thay thế, không query graph repo khác hoặc đổi Node/stack.

## Còn cần nghiệm thu

- Head/Leader thao tác trực tiếp qua Web/App, đổi quyền trong lúc mở form/mất mạng, chữ lớn và thiết bị thật: **NOT_RUN trong R2**.
- Production/HTTPS/soak, push/email thật và các nghiệp vụ chuyên sâu thuộc R khác: không nằm trong bằng chứng lượt này.
- R1 còn quyết định hash mật khẩu dài, không âm thầm giải quyết trong R2.
- Không còn lỗi Backend chặn được phát hiện bởi tập case đã chạy; không tuyên bố chống mọi race/phân quyền chỉ từ một tập regression.
- Bước tiếp theo đề xuất: kiểm tra Head/Leader UI với fixture nghiệm thu riêng, hoặc chuyển R3 khi Tech Lead chấp nhận giới hạn trên; không tự thực hiện.
