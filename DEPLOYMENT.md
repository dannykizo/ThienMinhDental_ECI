# Production Deployment

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
docker compose --env-file deploy/.env.production -f compose.production.yaml config --quiet
sh scripts/prod/deploy.sh
```

Backend tự chạy migration trước khi nhận traffic. Caddy tự xin và gia hạn TLS certificate sau khi DNS/cổng mạng hợp lệ.

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

Lệnh tạo đồng thời một file PostgreSQL `thien-minh-*.dump` và một file ảnh bằng chứng `thien-minh-evidence-*.tar.gz` trong `deploy/backups/`; permission mặc định chỉ cho owner. Phải sao chép cả hai file sang một nơi khác VPS và định kỳ thử phục hồi trên môi trường riêng.

Không phục hồi trực tiếp lên production khi chưa dừng ghi dữ liệu và xác nhận đúng bộ backup. Cách an toàn là dựng một project Compose/database tách biệt, dùng `pg_restore` cho file `.dump`, giải nén file evidence vào volume riêng, rồi kiểm tra đăng nhập, báo cáo và các ảnh trước khi lập kế hoạch phục hồi production.

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
