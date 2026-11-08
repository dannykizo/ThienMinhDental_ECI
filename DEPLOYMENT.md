# Production Deployment

## R14 — tình trạng nghiệm thu và ranh giới (2026-10-14)

Các kiểm tra production-mode chạy trên project Docker `tmd-r14-<UUID>` riêng, không phải VPS đang phục vụ khách. Không coi Pages + Quick Tunnel, build image thành công hoặc test API là nghiệm thu production/máy thật. Xem [biên bản R14](docs/R14_OPERATIONS_ACCEPTANCE.md) cho kết quả và gate còn thiếu.

Các script backup/preflight/deploy dùng chung cấu hình. Mặc định `deploy/.env.production`; `PROD_ENV_FILE`, `COMPOSE_PROJECT_NAME` và `PROD_COMPOSE_OVERRIDE` chỉ dùng khi người vận hành chủ động chọn một môi trường biệt lập. Kiểm tra đúng project trước khi chạy. Nếu `FIREBASE_PUSH_ENABLED=true`, các script tự thêm `deploy/compose.firebase.yaml`, giữ credential mount qua deploy/backup thay vì vô tình tắt Firebase ở lần cập nhật sau.

Tài liệu này mô tả baseline vận hành trên **một Linux VPS có Docker Engine và Docker Compose**, với PostgreSQL, Backend, Admin Web và Caddy cùng nằm trong một private Docker network. Chỉ Caddy mở cổng `80/443`; PostgreSQL và API không public trực tiếp.

## 1. Hạ tầng cần chuẩn bị

- Một VPS Linux x86_64 với tối thiểu 2 vCPU, 4 GB RAM và ổ đĩa SSD đủ cho database/ảnh bằng chứng.
- Một domain hoặc subdomain, ví dụ `workforce.company.vn`, có bản ghi `A` trỏ tới IP VPS.
- Firewall chỉ mở SSH quản trị, TCP `80`, TCP/UDP `443`.
- Docker Engine 29+ và Docker Compose v2.
- SMTP production nếu cần cảnh báo đăng nhập.
- Firebase project/service account nếu bật push notification thật.

Không đưa database password, JWT secret, SMTP password, Firebase service-account JSON hoặc dữ liệu nhân viên thật vào Git.

## 2. Tạo cấu hình production

Trên VPS, clone repository rồi tạo file môi trường:

```sh
cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
```

Điền tối thiểu:

- `APP_DOMAIN`: domain đã trỏ DNS tới VPS, không gồm `https://`.
- `POSTGRES_PASSWORD`: chuỗi ngẫu nhiên URL-safe; không dùng ký tự cần percent-encode.
- `JWT_SECRET`: chuỗi ngẫu nhiên ít nhất 48 ký tự.
- `SMTP_*` và `ADMIN_LOGIN_ALERT_EMAILS` nếu bật cảnh báo email.

Có thể tạo secret URL-safe bằng:

```sh
openssl rand -base64 48 | tr -d '\n' | tr '/+' '_-'
```

## 3. Kiểm tra và khởi động

```sh
sh scripts/prod/preflight.sh
sh scripts/prod/deploy.sh
```

Preflight từ chối domain/secret mẫu và kiểm tra cấu hình Compose. Deploy yêu cầu worktree sạch/đã commit, giữ khóa vận hành và build image trước cửa sổ ngừng ghi. Khởi động riêng PostgreSQL, đọc trạng thái DB; nếu có bảng thì backup trước khi Backend mới chạy, kể cả container cũ bị xóa nhưng volume vẫn tồn tại. Deploy chờ health check đạt yêu cầu và ghi mã commit vào trang Vận hành. Backend chạy migration dưới khóa advisory riêng trước nhận traffic; readiness từ chối khi thiếu migration. Nếu upgrade thất bại, ingress vẫn dừng; không tự migration down hoặc trả traffic vào schema chưa rõ. Caddy tự xin/gia hạn TLS sau khi DNS/cổng hợp lệ.

Build production cài bằng frozen lockfile; bước đóng gói sử dụng dedicated deploy lockfile và store offline, không dùng legacy deploy để resolve lại phiên bản sau compile. Chỉ bật `inject-workspace-packages` cho lệnh đóng gói trong image, không đổi package manager/lockfile hay stack local. [Cơ chế pnpm deploy](https://pnpm.io/cli/deploy) và CLI pnpm 11.19.0 cục bộ đã được đối chiếu.

Với database production mới, tạo đúng một tài khoản Admin đầu tiên bằng lệnh tương tác sau. Lệnh không lưu mật khẩu vào file hoặc Git, từ chối chạy ngoài production và từ chối tạo thêm khi đã có Admin:

```sh
sh scripts/prod/bootstrap-admin.sh
```

Admin bootstrap chưa gắn với hồ sơ nhân viên và không tạo dữ liệu tổ chức giả. Sau khi đăng nhập, dùng Admin Web để nhập cơ cấu và tài khoản nhân viên thật. Không chạy `seed:dev` trên production.

Kiểm tra:

```sh
docker compose --env-file deploy/.env.production -f compose.production.yaml ps
curl -fsS "https://$APP_DOMAIN/api/health/live"
curl -fsS "https://$APP_DOMAIN/api/health/ready"
```

Admin Web: `https://<APP_DOMAIN>`.

## 4. Firebase push (tùy chọn khi có credential)

Đặt service account ngoài Git:

```text
deploy/secrets/firebase-service-account.json
```

Điền `FIREBASE_PROJECT_ID` trong `deploy/.env.production`, sau đó chạy:

```sh
docker compose \
  --env-file deploy/.env.production \
  -f compose.production.yaml \
  -f deploy/compose.firebase.yaml \
  up -d --build
```

APK production phải được build với Firebase Android options tương ứng như hướng dẫn trong `mobile/README.md`.

## 5. Backup

Tạo backup PostgreSQL thủ công trước migration/deploy và theo lịch hằng ngày:

```sh
sh scripts/prod/backup.sh
```

Lệnh khóa chống backup/deploy chồng, dừng ingress/Backend đang chạy (bao gồm worker xóa ảnh), rồi tạo dump và archive ảnh từ cùng trạng thái ngừng ghi. Có gián đoạn ngắn: lên lịch ngoài giờ hoặc báo bảo trì, không thao tác DB thủ công trong lúc backup. Standalone backup khởi động lại đúng dịch vụ đã dừng, kể cả khi backup lỗi; không khởi động dịch vụ vốn đã tắt.

Cặp PostgreSQL `thien-minh-<id>.dump`, ảnh `thien-minh-evidence-<id>.tar.gz` và manifest SHA-256 được lưu với umask 077 trong `deploy/backups/`; manifest chỉ được công bố sau kiểm tra cấu trúc cả hai file. ID UTC thêm PID chống trùng trong cùng giây. Không dùng file rời/manifest `.tmp` của lần lỗi làm backup hoàn chỉnh. **Không tự xóa backup cũ** trước khi xác minh bản ngoài VPS; `BACKUP_RETENTION_DAYS` cũ chỉ là mốc tham khảo 14 ngày, người vận hành chủ động lưu/xóa từng bộ đã xác nhận có bản ngoài máy. Cần theo dõi dung lượng để tránh đầy đĩa. Backup chưa có encryption: lưu nơi hạn chế quyền, mã hóa bản off-host bằng công cụ được tổ chức duyệt, giữ key riêng. Không đưa dữ liệu hoặc key lên Git.

Thử phục hồi vào PostgreSQL tạm biệt lập, không đụng database production:

```sh
sh scripts/prod/verify-restore.sh deploy/backups/thien-minh-<timestamp>.dump deploy/backups/thien-minh-evidence-<timestamp>.tar.gz
```

Verifier yêu cầu đủ cặp cùng ID + manifest mới, kiểm checksum trước restore, không nhận symlink/traversal. Tạo PostgreSQL tạm không có published port/network production, chờ tối đa 60 lượt, restore thật, kiểm `schema_migrations` và bảng lõi, giải nén ảnh vào thư mục trong container tạm và kiểm các ảnh local được DB tham chiếu. Từ chối archive link/đặc biệt, ảnh thiếu dù checksum đúng; tham chiếu legacy/external cần đối soát thủ công. Kết thúc xóa đúng container/volume tạm, giữ nguyên source backup. Backup legacy manifest ghi đường dẫn cũ cần xác minh/chuyển manifest bởi người vận hành, không tự tin checksum mới tạo là bằng chứng lịch sử.

Không phục hồi trực tiếp lên production khi chưa dừng ghi và xác nhận đúng bộ backup. Dựng project/database/evidence riêng, restore, migrate nếu cần dưới khóa, kiểm phiên/quyền/đơn/báo cáo/ảnh rồi mới lập kế hoạch cutover. Không trộn DB ngày A với ảnh ngày B. Restore mang lại toàn bộ trạng thái tại mốc backup, có thể mất thao tác sau mốc đó và hồi sinh phiên/quyền từng bị thu hồi: thu hồi phiên cần thiết, đối soát access/audit trước mở traffic. Đừng tự xoay JWT key/khóa thiết bị hoặc migration down để né lỗi.

Nếu script chết do mất điện/SIGKILL, `.operation-lock` có thể còn: kiểm tra không có backup/deploy sống, xác định trạng thái dịch vụ và bộ backup trước khi gỡ đúng thư mục lock. Không chạy `down -v`/xóa volume để xử lý lock hoặc lỗi schema.

## 6. Cập nhật phiên bản

```sh
git pull --ff-only
sh scripts/prod/backup.sh
sh scripts/prod/deploy.sh
```

Không chạy `seed:dev` trên production. Không chạy `migration:revert` nếu chưa có backup và kế hoạch phục hồi đã được duyệt.

## 7. Demo miễn phí bằng Cloudflare Pages

Admin Web có thể được export tĩnh lên Cloudflare Pages để khách hàng dùng thử tại `https://thienminh-workforce.pages.dev`. Đây là môi trường demo, không thay thế hạ tầng production.

Build và deploy frontend từ PowerShell:

```powershell
$env:NEXT_STATIC_EXPORT='true'
$env:NEXT_PUBLIC_API_URL='/api'
corepack pnpm --dir frontend build
corepack pnpm dlx wrangler@latest pages deploy frontend/out --project-name thienminh-workforce --branch main
```

Pages Function tại `frontend/functions/api/[[path]].ts` chuyển tiếp request cùng origin từ `/api/*` tới origin được cấu hình bằng secret `BACKEND_ORIGIN`. Trong bản demo cục bộ, origin này có thể là URL HTTPS do Cloudflare Quick Tunnel cấp cho Backend đang chạy ở `http://127.0.0.1:3001`.

Quick Tunnel không có cam kết uptime, URL thay đổi sau mỗi lần khởi động và máy phát triển phải tiếp tục chạy PostgreSQL, Backend cùng tiến trình `cloudflared`. Sau khi URL thay đổi, cập nhật `BACKEND_ORIGIN` và deploy lại Pages Functions. Không dùng credential seed đã công khai trong repository; mật khẩu database demo phải được đổi riêng và không ghi vào Git.

R14: Pages Function giữ Origin cho kiểm tra cookie Backend, timeout 25 giây và trả JSON 503 khi tunnel mất mạng/upstream HTML lỗi. Không tự replay POST; 401 xác thực thật vẫn giữ nguyên. Lỗi mạng/5xx không chứng minh phiên bị thu hồi. Khi kết nối phục hồi, tải lại trạng thái/danh sách trước quyết định gửi lại; UUID/idempotency theo từng module hiện có, không tuyên bố mọi mutation đều idempotent.

## 8. APK production

APK hiện tại là debug build dùng ADB reverse. Trước khi phát hành nội bộ cần:

1. Chốt domain HTTPS production.
2. Tạo Android keystore và giữ ngoài repository.
3. Cấu hình release signing trên máy build/CI.
4. Build với `API_BASE_URL=https://<APP_DOMAIN>/api` và Firebase dart-defines thật.
5. Tăng `version`/`versionCode`, lưu checksum và kiểm thử cài mới/nâng cấp.

## 9. Checklist go-live

- DNS và TLS hợp lệ.
- `/api/health/live` và `/api/health/ready` trả `200`.
- Migration hoàn tất, không có container restart loop.
- Đã tạo tài khoản Admin production bằng `scripts/prod/bootstrap-admin.sh`; không có account development.
- Đã nhập dữ liệu phòng ban, chức vụ, nhân viên, lịch và tọa độ văn phòng thật.
- Đã kiểm tra quyền Admin/Kế toán trưởng/Quản lý khu vực/Trưởng phòng/Nhân viên.
- Đã gửi thử email cảnh báo và push notification nếu bật.
- Đã tạo, tải ra ngoài VPS và thử phục hồi backup.
- Đã lưu keystore, secret và runbook ở nơi quản lý bí mật phù hợp.
- Trang **Vận hành & bảo mật** không báo migration chờ chạy; lỗi email/push đã được xử lý hoặc chấp nhận có ghi chú.
- Chạy smoke trên môi trường biệt lập sau nâng cấp: phiên thật, scope live, gửi/duyệt/đọc hộp thư, phép/số dư, báo cáo/Excel, ảnh có xác thực; ngắt DB/Backend và khởi động lại không mất trạng thái hoặc tự gửi lại.
- Khách/HCNS/Kế toán xác nhận dữ liệu và mẫu Excel; FCM background/cold/nhấn notification trên điện thoại vẫn cần máy thật. R14 không tự đóng các PARTIAL của R1–R13.

## 10. Kiểm soát bảo mật và vận hành CR7

- API giới hạn đăng nhập/refresh theo cửa sổ thời gian; các ngưỡng nằm trong `.env.production`.
- Request dùng cookie và thay đổi dữ liệu phải có `Origin` đúng allow-list HTTPS, giảm rủi ro CSRF.
- Log production là JSON tối thiểu gồm request ID, method, path, status và thời lượng; không ghi body, token, tọa độ hoặc mật khẩu.
- Exception production không serialize SQL/parameters/raw error. DB kết nối lỗi trả DATA_SERVICE_UNAVAILABLE 503; lỗi nội bộ khác 500, không giả 401. Readiness có DB/schema, liveness độc lập; không dùng `/health` đơn thuần để kết luận DB còn hoạt động.
- Caddy lọc headers/URI query/Set-Cookie trong cả access và error log; metadata tra lỗi chi tiết ở Backend dùng đường dẫn không query. Proxy API có giới hạn chờ header 30 giây, không tự replay thao tác. Cấu hình đối chiếu [Caddy logging](https://caddyserver.com/docs/caddyfile/directives/log) và [HTTP transport](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#the-http-transport), validate bằng image thực tế.
- Caddy bật security headers, CSP và chỉ cấp quyền geolocation cho chính Admin Web để lấy tọa độ văn phòng.
- Admin xem trạng thái phiên, email/push, workflow đang mở, migration và audit tập trung tại `/dashboard/operations`.
- `quality.yml` chỉ chạy khi có pull request hoặc được kích hoạt thủ công, tránh tiêu tốn CI cho mỗi lần chỉnh giao diện nhỏ.
