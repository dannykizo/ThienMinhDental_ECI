# R14 — Vận hành, triển khai và phục hồi

Ngày 2026-10-14. Tech Lead: Nguyễn Thành Nam.

## Bổ sung nghiệm thu app

Sau lượt Docker local, Tech Lead giao một vòng trên app với Nhân viên/Leader/Trưởng phòng, cho reset demo và skip sinh trắc đã nghiệm thu R6. Kết quả máy thật, hai bugfix Mobile, 17 targeted regression và giới hạn nằm tại [MOBILE_INTEGRATED_ACCEPTANCE](MOBILE_INTEGRATED_ACCEPTANCE.md). Push foreground/background/cold/tap đã có proof trên máy RMX5555; không cộng lượt này vào 41 ca Docker bên dưới hoặc đổi mọi PARTIAL thành PASS. Không release APK, go-live, xóa dữ liệu, commit/push. Các mô tả “không sửa Mobile” bên dưới chỉ áp dụng lượt R14 Docker ban đầu, không phải phần bổ sung app.

## Phạm vi / trạng thái

Tech Lead xác nhận **chưa có VPS/domain**, chỉ hoàn thiện bộ triển khai và nghiệm thu local. Không go-live, push/deploy Pages hoặc xuất APK trong lượt này. Main đang có nhiều thay đổi R1–R13/user chưa commit: giữ nguyên, không reset/gom commit; deploy production yêu cầu source đã review/commit sạch.

R14 local technical acceptance: **41/41 ca có mục tiêu PASS** — unit/direct regression 30, production Docker/HTTP 11. Lượt Docker cuối mất khoảng 130 giây, gồm API từ bản restore. Không cộng các lượt chạy lại thành số ca mới. Không phải PASS toàn sản phẩm/production.

## Lỗi và sửa đổi

1. Runtime DataSource không có registry migration, showMigrations có thể báo false và tạo ledger từ GET: chuyển sang registry dùng chung + SELECT schema_migrations, không ghi từ status. Readiness kiểm DB/schema; liveness/health cũ giữ hoạt động.
2. Migration CLI có thể chạy chồng, lỗi chưa đóng connection: advisory session lease + transaction all + finally, nonzero startup khi fail. Không sửa migration đã áp dụng, không có schema/migration mới.
3. Restore script kiểm nhầm bảng migrations, bỏ checksum và chỉ list tar: yêu cầu cặp cùng ID/manifest, binary SHA256, restore thật, kiểm bảng lõi, giải nén trong container/network/volume tạm và xác minh ảnh local trong DB. Chặn symlink/traversal/special archive entries, mismatch/corrupt/missing image. Ref legacy/external không được coi đã chứng nhận.
4. Restore readiness qua Unix socket có thể gặp PostgreSQL init tạm rồi shutdown: chờ TCP 127.0.0.1 của server cuối. Production PostgreSQL health cũng dùng TCP. Bounded wait, cleanup đúng container/anonymous volume tạm, giữ source backup.
5. Backup DB/ảnh lệch mốc nếu Backend/worker đang ghi/xóa ảnh: khóa vận hành, dừng proxy/Backend đang chạy, lấy cặp cùng mốc, publish manifest cuối. Standalone luôn resume đúng dịch vụ đã dừng, kể cả lỗi. Không tự prune bộ cũ trước xác minh off-host; theo dõi dung lượng và chủ động retention.
6. Deploy có thể bỏ Firebase override, bỏ backup khi container mất nhưng volume còn, hoặc gắn SHA cho source dirty: chung env/Compose/Firebase adapter, preflight/clean-source gate, build trước maintenance, đọc DB tables trước migration, health-gated startup và giữ ingress dừng khi fail. Không auto down/rollback/seed hoặc cutover.
7. pnpm legacy deploy resolve lại dependency sau compile: Docker packaging dùng dedicated lockfile + offline production dependencies, chỉ bật config inject cho lệnh đóng gói. Không sửa root lockfile/local package installation/stack. `.next-r12/r13/r14` không vào build context.
8. DB/DNS/aggregate lỗi có thể bị hiển thị như auth lỗi hoặc log SQL/parameters: production filter sanitize, 503 cho mã kết nối, 500 cho lỗi nội bộ khác; giữ HttpException, malformed/oversized/unsupported JSON giữ 400/413/415 và không phản chiếu input. Caddy lọc headers/query/Set-Cookie cả access/error logs, API header timeout 30s.
9. Pages tunnel fetch thất bại/treo/HTML 5xx: JSON 503 an toàn, 25s timeout, giữ Origin kiểm cookie, không replay POST; JSON 401 thật giữ nguyên. Đây là source đã chuẩn bị, **chưa deploy Pages**.

## Bằng chứng có mục tiêu

- R14 unit **13**: ledger thiếu/full/mất một migration không bị unknown row che; readonly probes; health/live/schema; production outage/unknown/parser redaction; gateway config/network/timeout/HTML/401/Origin/query/no replay.
- Direct regression **17**: web-auth-refresh 10, jwt-session-access 4, request-security 3. Cookie refresh coordination/reuse, outages giữ credential, auth/role và Origin/rate limit giữ nguyên. Không chạy cả suite.
- R14 production Docker/HTTP gồm **11/11 PASS**.
  - Migration từ **24 → 35** trên database cũ có employee/account/session/event/ảnh/terminal explanation; identity/giờ/actor giữ nguyên, không fake confirmer. Real restored hash dùng được khi login, employee bị chặn Ops.
  - Migration replay 0; lease đối thủ bị từ chối. Pending status/readiness thấy ledger thiếu thật, không tạo bảng migrations.
  - Caddy loopback HTTP phục vụ Web/API/security headers; Backend ngắt trả 5xx; cả access/error log không chứa token/query thử. **Không phải TLS/cookie-browser acceptance.**
  - Giải trình idempotent retry → Admin fallback → inbox → điều chỉnh → report/KPI; quyết định lặp bị chặn. 540 phút thực tế, OT=0, không tự suy OT từ giờ ra.
  - Phép nửa ngày: pending 240/used 0/available 5520 → duyệt used 240/pending 0 → hủy available 5760; cùng công hiện trường 480 phút, partialLeaveDays=1, leaveDays=0.
  - Ngắt PostgreSQL: live 200/ready 503/protected auth 503, không fake 401; khôi phục dùng lại session. Backend restart giữ ảnh/phiên/snapshot; bốn Excel tải được, kỳ khóa chặn writer, reopen giữ v1.
  - Backup/restore trước và sau upgrade; corrupt/mismatch/missing ảnh bị chặn cả khi checksum được tạo hợp lệ. Backup lỗi resume đúng Backend/proxy; dirty source không deploy.
  - Cặp mới restore vào **project PostgreSQL/evidence/API thứ hai riêng**: login bằng hash đã restore, đọc snapshot/KPI/Excel và ảnh giống byte gốc; login trên bản restore không thu hồi phiên nguồn.
- Backend/Frontend typecheck và lint **PASS**. Backend/Frontend Docker production build và Caddy validate **PASS**; Web 23 routes. Một non-null assertion dư được bỏ theo lint, không đổi JavaScript runtime. Diff whitespace check/shell syntax PASS.
- Không chủ động ngắt DB/Backend/Web đang dùng ở localhost:3000/3001 để thử outage; Backend watch tự cập nhật như bình thường. No new seed/account/approval/lock/delete trong development/customer DB; production fixtures riêng, SMTP/FCM off.

## Chạy lại

Từ root (Docker Engine/Compose hỗ trợ `!override`; Git Bash trên Windows cho shell scripts):

```powershell
docker build -f backend/Dockerfile -t tmd-r14-backend:local .
docker build -f frontend/Dockerfile -t tmd-r14-frontend:local .
cd backend
$env:R14_DOCKER_TEST='1'
node node_modules/vitest/vitest.mjs run test/r14-operations.spec.ts test/r14-operations.docker.spec.ts test/web-auth-refresh.spec.ts test/jwt-session-access.spec.ts test/request-security.spec.ts --testTimeout=120000
```

Các project `tmd-r14-<UUID>` / `...-restore`, network và volumes của chúng được xóa trong cleanup; **chỉ fixture synthetic**, dựng lại từ test source, không phải dữ liệu khách. Cặp dump/ảnh/manifest development-only còn trong deploy/backups ignored; diagnostics/env fixture trong logs ignored, không phải cấu hình go-live. Không lấy ảnh thật hoặc gửi email/push từ fixture. Cổng loopback explicit được cấp từ socket trống để giữ ổn định qua stop/start (published port ngẫu nhiên Docker trước đó làm sai harness).

Một lượt Caddy validate chạy nhầm cwd tạo thư mục rỗng `backend/deploy/Caddyfile`; không ghi file/dữ liệu, không tracked Git. Đã sửa mount và validate config đúng. Công cụ từ chối lệnh xóa thư mục rỗng đó; có thể dọn thủ công, không coi ảnh hưởng runtime/production.

GitNexus vẫn không index repo này/không có local runner; dùng đọc source/diff/CLI thật, không dùng graph của repo khác. Không cài/index bổ sung trong R14.

## File/module chạm

- Backend database: data-source, migration-registry/status/runner, run-migrations; health controller; OperationsService; main + operational exception filter. Đây là dependency tối thiểu để status/startup/log đúng, không đổi Auth business rules/guards hoặc workflow.
- Backend/Frontend Dockerfiles; compose.production.yaml; deploy/Caddyfile/.env.production.example; .dockerignore.
- scripts/prod/common.sh, backup-lib.sh, backup.sh, verify-restore.sh, preflight.sh, deploy.sh.
- Frontend Pages Function gateway, không redesign UI hoặc thay state nghiệp vụ; hai test R14 mới.
- README/FLOWS/IMPLEMENTATION/DEPLOYMENT/module plan + biên bản này. Không chạm Mobile/migrations đã có/root lockfile/tài khoản thật.

## Gate trước production / bàn giao

1. Source review/commit sạch; VPS/domain/DNS/TLS, firewall, secrets/keystore/FCM/SMTP đúng môi trường. Script deploy nhánh thành công/thất bại trên VPS thật chưa chứng nhận từ local dirty worktree.
2. Lịch backup + bản mã hóa off-host + restore drill định kỳ, dung lượng/disk/alert vận hành và người giữ key; không coi tar+checksum là encryption hay chữ ký nguồn.
3. Kiểm định HCNS/Kế toán từng mẫu Excel và dữ liệu thật; không dùng seed/fixture development khi go-live.
4. Các PARTIAL/NEEDS_DECISION R1–R13 không tự đóng: bcrypt 72 byte/128 ký tự; GPS/sinh trắc/quyền và FCM background/cold/tap trên máy thật; UI Head/Leader và load/dataset production. Không thêm attestation, KPI điểm, payroll hoặc tự tuyên bố chống gian lận tuyệt đối.
5. Restore production cần maintenance/cutover rõ, đối soát thao tác sau mốc backup và phiên/quyền có thể hồi sinh từ mốc cũ; không tự hồi sinh/rotate key/rollback migration hoặc replay mutation để né lỗi.

Dừng sau R14 local; custom giao diện hoặc go-live cần task riêng của Tech Lead.
