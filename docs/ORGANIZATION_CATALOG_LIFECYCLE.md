# Vòng đời danh mục tổ chức — trước R2

Ngày: 2026-10-09. Scope Owner: Nguyễn Thành Nam. Phạm vi được duyệt: chi nhánh, phòng ban, chức vụ, team; lọc hiện hành/lịch sử và bảo vệ dữ liệu đã dùng. Không dọn dữ liệu cũ, không chuyển nhân sự/tuyến và không coi là nghiệm thu R2 đầy đủ.

## Quy tắc và UX

- Chi nhánh/phòng ban/chức vụ: thêm, sửa mã/tên, ngừng sử dụng, khôi phục. UUID không đổi khi sửa mã. Team: tạo trong một phòng, sửa tên/trạng thái; mã và phòng bất biến.
- Chưa từng sử dụng và không có FK liên kết: được xóa với lý do/xác nhận; không có khôi phục bản ghi đã xóa trong sản phẩm. Audit CREATE/DELETE vẫn giữ.
- Đã từng dùng (kể cả phân công kết thúc, grant thu hồi, đơn terminal hoặc scope đã bị thay): chỉ ngừng/khôi phục. Ledger và DB delete trigger bảo vệ cả FK SET NULL/CASCADE. Audit của chính thao tác tạo/sửa danh mục không được tính là sử dụng, nhưng việc tạo team tính là sử dụng phòng ban mẹ.
- Ngừng không sửa/xóa nhân viên, membership, grant, lịch hay tuyến cũ. Live grant/eligibility vẫn theo PQ1. Khôi phục không hồi sinh grant hết hạn/thu hồi hoặc SID đã thu hồi. Những tài khoản có quyền Web độc lập không tự bị khóa.
- Geofence sự kiện văn phòng mới không xét chi nhánh ngừng hoạt động, nhưng không sửa dữ liệu vị trí hoặc sự kiện cũ; địa điểm bên ngoài dùng chung không đổi. Đây là thay đổi tối thiểu tại Attendance vì phụ thuộc trực tiếp vòng đời chi nhánh.
- Confirmation hiển thị liên kết và số đếm phạm vi liên quan; không lộ nội dung đơn/GPS/credential và không khẳng định mọi bản ghi liên quan bị khóa. Backend kiểm tra lại khi lưu. Nếu thay đổi sau preview: tải lại/xác nhận lại, không tự retry mutation.
- Web mặc định lọc danh mục/team hoạt động và quyền ACTIVE/SCHEDULED. Các bộ lọc ngừng/hết hạn/thu hồi/tất cả giữ lịch sử dễ tìm. Bộ chọn mới ẩn danh mục ngừng; hồ sơ/địa điểm cũ vẫn có nhãn ngừng. Sửa profile nhân viên không thay cơ cấu sẽ không tạo lại assignment hoặc scopes.

## API (ADMIN-only, JWT/live session)

`kind`: `branches`, `departments`, `positions`, `teams`; không nhận tên table tùy ý.

| Endpoint | Contract |
|---|---|
| GET /api/organization/catalog/:kind | Danh mục gồm isActive, everUsed; dùng cho màn quản trị |
| POST /api/organization/catalog/:kind | code/name cho ba danh mục; team vẫn tạo qua POST /organization/teams có departmentId |
| GET /api/organization/catalog/:kind/:id/impact | item, references (label/count), everUsed, canDelete, impacts, confirmationToken |
| PATCH /api/organization/catalog/:kind/:id | name/isActive, code tùy chọn; reason ≥5, confirmationToken; không đổi mã/phòng team |
| DELETE /api/organization/catalog/:kind/:id | reason ≥5, confirmationToken; chỉ chưa sử dụng |
| PATCH /api/organization/teams/:id | name/isActive + reason/confirmationToken; chung lifecycle service |
| GET /api/organization/history | Thêm audit BRANCH/DEPARTMENT/POSITION, giữ team/membership/grant |

Lỗi: `CATALOG_IN_USE` 409, `CATALOG_CHANGED` 409, `CATALOG_CODE_EXISTS` 409, `CATALOG_NOT_FOUND` 404, `CATALOG_INACTIVE` 400, `CATALOG_REASON_REQUIRED` 400. Guard hoặc service chặn người không phải ADMIN. GET employees/lookups giữ response mảng hiện hữu; các màn đọc lịch sử không bị mất danh mục cũ. POST lookups hiện hữu dùng cùng service có audit.

## Migration và triển khai

Migration `1792195200000-organization-catalog-lifecycle`, không synchronize hoặc ORM coupling trong Domain. Ledger không FK tới catalog để ghi nhớ vĩnh viễn việc từng sử dụng. Backfill FK hiện tại và UUID trong audit JSON lịch sử theo hướng bảo thủ; nếu không chứng minh chưa dùng thì không xóa. Trigger ghi usage chỉ phát sinh cùng transaction referencing write thành công; rollback không để marker giả.

Sau này thêm FK mới tới bốn bảng: phải cài trigger usage/backfill tương ứng trong migration mới. Kiểm tra xóa còn đọc actual FKs, row lock và DB constraint/trigger để chống racing insert/delete. Không dựa vào nút disabled ở Frontend. Rollback tự động bị chặn; phải có kế hoạch export/migrate để không mất bằng chứng đã dùng.

Local dev: đã backup `logs/org-catalog-before-20261009.dump` (ignored, không upload/commit), áp dụng migration trên DB `thien_minh_dental`. Không xóa hoặc sửa dữ liệu nghiệm thu trong lúc kiểm tra. Production chưa deploy/push trong task này; cập nhật migration → Backend → Web.

## Kiểm tra và giới hạn

Cập nhật sau R2 (2026-10-09): hai suite catalog đã được chạy theo task nghiệm thu R2, 16 unit + 9 PostgreSQL đều đạt; có thêm case xóa đồng thời với lần dùng đầu trong suite R2. Các dòng NOT_RUN bên dưới là biên bản lượt prerequisite trước đó, không phải trạng thái mới. Chi tiết/các giới hạn vẫn còn: `R2_ORGANIZATION_ACCEPTANCE.md`.

- Test source: `backend/test/organization-catalog.spec.ts`, `organization-catalog.postgres.spec.ts`; sửa wiring test PQ1 cho dependency mới. **Chưa chạy suite**, theo chỉ thị chỉ chạy khi Tech Lead yêu cầu. Không ghi PASS cho các case chưa thực thi.
- PostgreSQL suite chỉ chạy khi `CATALOG_POSTGRES_TEST=1`, `NODE_ENV=development`, DATABASE_URL local. Tạo/migrate DB random `catalog_test_<32hex>`, không seed/login/SMTP/FCM; xóa đúng DB do test tạo sau khi hoàn tất. Không tác động DB/tài khoản nghiệm thu. Lệnh khi được yêu cầu:

```powershell
cd backend
$env:CATALOG_POSTGRES_TEST='1'
corepack pnpm exec node --env-file=.env node_modules/vitest/vitest.mjs run test/organization-catalog.spec.ts test/organization-catalog.postgres.spec.ts test/organization-management-access.spec.ts
Remove-Item Env:CATALOG_POSTGRES_TEST
```

- Cần nghiệm thu có mục tiêu: CRUD ba danh mục; unused team deletion; archived selections; giữ audit; blocking used position với FK SET NULL; old branch scope đã bị xóa vẫn chặn deletion; stale confirm; concurrent references/delete; grant live/membership scope và pending route trong R2. Không tuyên bố concurrency/live-manager full acceptance chỉ từ typecheck/build.
- GitNexus regenerate theo CLAUDE.md thất bại tại analyzer identity trong pnpm store, kèm engine warning Node22.15; source dependency/FK inspection dùng thay thế, không sửa stack/Node để tiện chạy index.
- Mobile không sửa, không đóng gói APK. Các thay đổi R1/PIN retirement và form Mobile của Tech Lead có trước vẫn được giữ, không gom commit hoặc dọn ngoài phạm vi.

### Kết quả kiểm tra local ngày 2026-10-09

- Backend và Web: `typecheck`, `lint`, `build` đều exit 0. `git diff --check` sạch. Không chạy test suite tự động; các test mới vẫn **NOT_RUN**.
- Migration local đã áp dụng: ledger có 20 dấu sử dụng, 18 trigger ghi nhận FK. Backup trước migration nằm trong `logs/` ignored. Đây không phải kết quả kiểm thử concurrent mutations.
- Chrome: trang tổ chức tải được trong phiên Admin hiện có; chi nhánh đã dùng có nút xóa disabled, phòng ban chưa dùng có nút xóa enabled. Bộ lọc phòng ban ngừng sử dụng hiển thị đúng nhãn và thao tác khôi phục; đã trả về bộ lọc hoạt động. Preview ngừng chi nhánh có ảnh hưởng/liên kết và đã hủy; không thực hiện mutation qua giao diện.
- Chưa nghiệm thu end-to-end thao tác thêm/sửa/xóa/ngừng/khôi phục, race conditions hoặc phiên Head/Leader. R2 chưa được đánh dấu PASS; production chưa cập nhật.

### File/module đã chạm

- Database: migration `1792195200000-organization-catalog-lifecycle.ts`, đăng ký tại `data-source.ts`.
- Backend Organization Access: domain lifecycle, application catalog service, DTO/controller/module, team updates và history. Thêm các nguồn test và cập nhật wiring test quản lý.
- Backend liên quan tối thiểu: Employees (lookup audit/active assignments/scopes), Office Locations (active branch), Work Schedules (active catalogs), Attendance (bỏ chi nhánh ngừng khỏi geofence sự kiện mới). Các thay đổi này cần thiết để không tạo liên kết mới vào danh mục ngừng sử dụng.
- Web: `organization-catalog.tsx`, trang tổ chức, `organization-api.ts`, CSS scoped; bộ chọn tại nhân viên/lịch/vị trí/thông báo. Hồ sơ cũ vẫn đọc được; sửa metadata không ghi lại assignment/scope nếu không đổi.
- Tài liệu: PROJECT/FLOWS/IMPLEMENTATION/README, MODULE_ACCEPTANCE_PLAN và tài liệu này. Không chỉnh Mobile, không gom những thay đổi có trước vào commit.
