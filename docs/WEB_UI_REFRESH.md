# Web UI — bố cục sơ bộ, 2026-10-19

## UI/UX Master Plan & Bước 1: Design Tokens & App Shell — 2026-10-21

Tech Lead (Nguyễn Thành Nam) chỉ thị nâng cấp toàn diện UI/UX của hệ thống Admin Web: sống động, chuyển động mượt mà, ít thao tác thừa, bớt "nhựa", tinh gọn khoảng cách dữ liệu, sang trọng chuẩn Dental Enterprise SaaS và giữ trọn vẹn nhận diện thương hiệu Nha khoa Thiên Minh.

### 1. Quy chuẩn Design Tokens & Thẩm mỹ mới chốt
- **Bản sắc thương hiệu Thiên Minh Dental**:
  - Tím Hoàng Gia (`--brand-primary: #5e2d91`, `--brand-primary-dark: #351356`, gradient tím 135deg).
  - Cam Hổ Phách Năng Lượng (`--brand-accent: #f97316`, `--brand-accent-hover: #ea580c`).
  - Trắng Sứ & Canvas Slate sạch sẽ (`--surface: #ffffff`, `--canvas: #f8fafc`, `--line-crisp: rgba(226, 232, 240, 0.85)`).
- **Trị bệnh giao diện "nhựa" (De-plasticizing)**:
  - Thay màu nền pastel bệt đục bằng **Surface Layering**: nền trắng sứ, viền mỏng 1px sắc nét (`--line-crisp`), kết hợp hệ thống **Multi-Layer Elevation Shadows** (`--shadow-elevation-low`, `--shadow-elevation-mid`, `--shadow-elevation-high`, `--shadow-glow-purple`).
- **Chuyển động mượt mà (Functional Motion)**:
  - Đường cong gia tốc tự nhiên: `--ease-spring: cubic-bezier(0.16, 1, 0.3, 1)` và `--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1)`.
  - Phản hồi xúc giác: `.btn-tactile` (`active: scale(0.975)`), `.card-interactive` (`hover: translateY(-2px)` kèm shadow elevation).
  - Skeleton shimmer ánh bạc-tím (`.skeleton-shimmer`), nhịp thở cảnh báo (`.pulse-ring`), font số thẳng hàng (`.tabular-nums`).
- **Quy chuẩn Master-Detail Workspace Overlay (85-90% Viewport)**:
  - Chuẩn hóa `.workspace-overlay-backdrop` và `.workspace-overlay-dialog` (chiếm 90-92vw x 88-90vh), nền mờ `backdrop-filter: blur(8px)`, đóng bằng `Esc`, click ngoài hoặc nút X, giữ nguyên ngữ cảnh bảng dữ liệu bên dưới.

### 2. Tiến độ triển khai theo lộ trình
- [x] **Bước 1: Design Tokens & Khung App Shell / Sidebar** (`frontend/app/globals.css`, `frontend/app/dashboard/workspace.css`) — *Hoàn thành 2026-10-21*.
- [x] **Bước 2: Lột xác Dashboard Tổng quan** (`frontend/app/dashboard/page.tsx`, `dashboard.css`, `components/dashboard-attendance.tsx`) — *Hoàn thành 2026-10-21*.
- [x] **Bước 3: Danh sách & Master-Detail Overlay Hồ sơ Nhân sự** (`frontend/app/dashboard/employees/page.tsx`, `workspace.css`, `employee-profile.css`, `components/employee-profile-overlay.tsx`) — *Hoàn thành 2026-10-21*.
- [x] **Bước 4: Bảng Chấm công & Điểm danh** (`frontend/app/dashboard/attendance/page.tsx`, `attendance.css`) — *Hoàn thành 2026-10-21*.
- [x] **Bước 5: Quy trình Đơn từ & Phê duyệt** (`frontend/app/dashboard/leave-workflow`, `explanations`, `overtime`) — *Hoàn thành 2026-10-21*.
- [x] **Bước 6: Quản trị Báo cáo, Thống kê & Xuất Excel** (`frontend/app/dashboard/reports/page.tsx`, `reports.css`) — *Hoàn thành 2026-10-21*.
- [x] **Bước 7: Nâng cấp các trang Cấu hình, Danh mục & Bảo mật** (`schedules`, `locations`, `organization`, `access`) — *Hoàn thành 2026-10-21*.

### 3. File đã cập nhật trong Bước 1 đến Bước 7
- `frontend/app/globals.css`: Nâng cấp `:root` tokens (bảng màu Thiên Minh, multi-layer shadows, physics timings) và bổ sung primitives (`.tabular-nums`, `.btn-tactile`, `.card-interactive`, `.glass-panel`, `.skeleton-shimmer`, `.pulse-ring`, `.workspace-overlay-backdrop`, `.workspace-overlay-dialog`).
- `frontend/app/dashboard/workspace.css`: 
  - Bước 1: Nâng cấp `.admin-refresh.admin-shell`, `.sidebar` (nền tím hoàng gia sâu, logo card trắng nổi bật, nav toggle có chevron mượt mà, sub-links trượt êm, active item có gradient và glow tím), `.topbar-strip` (mặt kính mờ `backdrop-filter: blur(12px)`, breadcrumb phân cấp rõ nét, branch chip tròn sang trọng).
  - Bước 3: Nâng cấp `.employee-metrics` (card trắng sứ viền mỏng tinh xảo, icon tint riêng biệt, đổ bóng đa tầng), `.emp-quick-filters` (chip bo tròn lọc nhanh 1 chạm: Tất cả, Đang làm việc, Đã ngừng, Văn phòng, Hiện trường), `.compact-table` & `.compact-table-wrap` (padding co gọn tối ưu mật độ thông tin, header sticky mờ kính với box-shadow nhẹ), `.emp-code-chip`, `.emp-phone-chip` & `.emp-inline-copy-btn` (inline copy 1 chạm với hiệu ứng pop-check xanh lá).
  - Bước 7: Bổ sung hệ thống CSS chuẩn sứ trắng viền mỏng cho cấu hình: `.cfg-metric-grid`, `.cfg-metric-tile` (icon tint tròn sang trọng), `.cfg-panel` (accordion sứ trắng), `.cfg-weekday-grid` & `.cfg-weekday-pill` (nút chọn ngày làm việc bo tròn đổi màu tím Thiên Minh), `.cfg-cards-grid` & `.cfg-card` (thẻ hiển thị cấu hình viền mỏng có dải màu trạng thái mép trái), `.cfg-org-tabs` & `.cfg-org-tab-btn` (tab capsule chuyển đổi mượt mà), `.cfg-table-wrap` & `.cfg-table` (compact table với sticky header), `.cfg-current-session-row` & `.cfg-current-badge` kèm chấm pulsing xanh lá (`.cfg-pulse-dot`).
- `frontend/app/dashboard/page.tsx`: Tích hợp `AnimatedNumber` hook (chạy số từ 0 lên số thực bằng requestAnimationFrame theo chuẩn tabular-nums), gán tone màu riêng biệt cho từng khối metric card (`tone-0` đến `tone-3`).
- `frontend/app/dashboard/dashboard.css`: Thay thế hoàn toàn card pastel nhựa bằng card trắng sứ viền mỏng (`border: 1px solid var(--line-crisp)`), bóng mượt multi-layer (`var(--shadow-elevation-low)` / `mid`), co gọn gap dữ liệu (gap 12-14px), biểu đồ cột chấm công có hiệu ứng mọc lên sống động (`db-bar-rise`), tooltip dark violet sang trọng.
- `frontend/components/dashboard-attendance.tsx`: Cập nhật mã màu phân đoạn biểu đồ đồng bộ với nhận diện Thiên Minh (Văn phòng: Tím `#5e2d91`, Hiện trường: Xanh `#0d9488`, Khác: Xám `#94a3b8`).
- `frontend/app/dashboard/employees/page.tsx`:
  - Nâng cấp 5 thẻ thống kê nhân sự thành card trắng sứ viền mỏng với `AnimatedNumber` và icon đặc trưng theo từng chỉ số.
  - Tích hợp thanh Quick Filter Chips lọc trạng thái và loại nhân viên tức thì phía trên bảng dữ liệu.
  - Tích hợp inline 1-touch copy cho Mã nhân viên và Số điện thoại với icon `Check` xanh lá phản hồi trực quan trong 1.5s (ngăn chặn lan truyền sự kiện click hàng để không mở nhầm profile).
  - Bảng dữ liệu compact với sticky header, tối ưu hóa mật độ hiển thị thông tin.
- `frontend/components/employee-profile-overlay.tsx` & `frontend/app/dashboard/employees/employee-profile.css`:
  - Chuẩn hóa Overlay Master-Detail chiếm 85-90% diện tích toàn trang (`width: min(90vw, 1540px); height: min(90vh, 980px); max-height: 90vh`).
  - Nền mờ kính cao cấp `backdrop-filter: blur(12px) saturate(0.85); background: rgba(12, 10, 18, 0.46)`.
  - Tích hợp 1-touch copy badge cho mã nhân sự ngay tại Header của Overlay.
- `frontend/app/dashboard/attendance/page.tsx` & `attendance.css`:
  - **4 Thẻ thống kê trắng sứ viền mỏng**: Tích hợp `AnimatedNumber`, border trái màu chỉ số (Tím - Tổng NV, Xanh - Đã chấm, Đỏ - Cần đối soát, Cam - Giải trình đang mở).
  - **Toolbar điều hướng ngày & Quick Filter Chips**: Nút chọn ngày trực quan, nút Hôm qua / Hôm nay / Lùi / Tiến ngày nhanh, bộ lọc tức thì (Tất cả, Đã chấm công, Đủ công, Thiếu công, Cần đối soát).
  - **Ma trận chấm công gọn gàng (High Data Density)**: Cuộn 2 chiều mượt mà (`att-matrix-wrap`), cố định cột đầu tiên (Frozen First Column `att-col-pinned` ghim Tên/Mã nhân sự bên trái khi cuộn ngang), cố định hàng tiêu đề (Sticky Header `thead th`), giao điểm góc trên bên trái (`att-th-pinned`).
  - **Status Chips 4 màu chuẩn thương hiệu**: Đủ công (Xanh ngọc `#ecfdf5`), Thiếu chấm công (Đỏ `#fff1f2`), Công tác (Cam `#fff7ed`), Nghỉ phép (Vàng `#fefce8`), Đang làm việc (Tím `#f7f2fc` với pulse dot), Chưa chấm (Xám `#f8fafc`).
  - **Tooltip Hover nhanh**: Popover trực quan hiển thị chi tiết Check-in, Check-out, Thời gian làm việc / OT, Cảnh báo vị trí rủi ro mà không cần rời màn hình.
  - **Modal Chi tiết Đối soát Admin**: Kính mờ sang trọng hiển thị vị trí GPS, thời gian server, nội dung công tác và link mở ảnh check-in có Timemark.
- `frontend/app/workflow.css` & `frontend/components/workflow-ui.tsx`:
  - **Thẻ đơn từ trắng sứ viền mỏng (White Porcelain Cards)**: Viền mỏng sắc nét `border: 1px solid var(--line-crisp)`, dải màu chỉ thị trạng thái mép trái (`border-left: 4px solid ...`: Tím - Chờ duyệt, Xanh ngọc - Đã duyệt, Đỏ - Từ chối, Xám - Hủy), đổ bóng đa tầng nâng nhẹ khi hover.
  - **Timeline tiến trình phê duyệt 2 bước sống động (Live 2-Step Timeline)**: Bước 1 (Leader xác nhận) → Bước 2 (Trưởng phòng duyệt), thanh kết nối liên mạch (Connector bar), pulsing halo ring nhấp nháy êm dịu khi đến lượt xử lý, thời gian định dạng chuẩn `tabular-nums`.
  - **Mini Stepper trực quan (`WorkflowMiniTimeline`)**: Hiển thị 2 nốt tiến trình nhỏ gọn trực tiếp trên từng thẻ đơn từ trong danh sách, giúp quản lý nhìn thấy ngay đơn đang nằm ở Leader hay Trưởng phòng.
  - **Drawer duyệt 1 chạm (`WorkflowDrawer` & `WorkflowQuickActionBox`)**: Nền mờ kính cao cấp `backdrop-filter: blur(6px)`, trượt từ mép phải êm ái. Form lý do và nút hành động (Xác nhận, Duyệt, Từ chối, Admin duyệt thay) tích hợp ngay trong Drawer, cho phép thao tác 1 chạm tức thì không cần popup phụ làm gián đoạn trải nghiệm.
  - **Audit Trail bảo mật (`WorkflowHistory`)**: Huy hiệu bảo mật toàn vẹn dữ liệu, timeline kiểm toán bất biến với màu sắc hành động phân cấp rõ ràng, trích xuất tóm tắt đối soát thân thiện và hỗ trợ mở rộng đối soát kỹ thuật JSON.
- `frontend/components/leave-workflow-workspace.tsx`: Nâng cấp giao diện xử lý nghỉ phép, tích hợp White Porcelain Cards, Mini Stepper, Timeline 2 bước đầy đủ trạng thái và Quick Decision Action Box 1 chạm.
- `frontend/components/explanations-workspace.tsx`: Nâng cấp giao diện giải trình chấm công, hỗ trợ ảnh minh chứng xác thực, Mini Stepper và Quick Decision Action Box 1 chạm.
- `frontend/components/overtime-workspace.tsx`: Nâng cấp giao diện phiếu tăng ca OT, hiển thị số phút/giờ chuẩn `tabular-nums`, Mini Stepper và Quick Decision Action Box 1 chạm.
- `frontend/app/dashboard/reports/reports.css` & `frontend/app/dashboard/reports/page.tsx`:
  - **Bảng dữ liệu báo cáo chuẩn trắng sứ viền mỏng (White Porcelain Data Matrix)**: Cấu trúc compact table với sticky header, ghim frozen first column cho nhân sự, định dạng số tabular-nums sắc nét, hỗ trợ ô tìm kiếm nhanh `inTableSearch` trực tiếp trên kết quả đã tải và phân trang 15 dòng/trang tiện dụng.
  - **Biểu đồ tiến độ trực quan (Visual Attendance Progress & Analytics)**: Thanh phân bổ hình thức công việc đa đoạn (Multi-segment progress bar: Văn phòng tím Thiên Minh `#5e2d91`, Hiện trường xanh ngọc `#0d9488`, Nghỉ phép cam hổ phách `#f97316`, Thiếu công đỏ san hô `#ef4444`) kèm tỷ lệ chuyên cần tổng thể.
  - **Bộ 4 thẻ chỉ số KPI sứ trắng viền mỏng**: Tích hợp `AnimatedNumber`, biểu tượng và badge trực quan cho Tổng nhân sự, Tổng giờ công thực tế, Tỷ lệ chuyên cần đạt chuẩn và Số lượt nghỉ/vắng.
  - **4 Card xuất Excel phản hồi tức thì (Instant Feedback Export Cards)**: Thiết kế dạng card độc lập cho Bảng công tháng, Sổ quỹ nghỉ phép, Bảng tăng ca OT và Nhật ký giải trình. Tích hợp spinner khi đang chuẩn bị tệp và chuyển sang trạng thái "Đã tải xong!" kèm icon Check xanh lá trong 2.5s trước khi hoàn nguyên. Nút In PDF (`window.print()`) kèm CSS chuyên dụng cho bản in kiểm toán sạch đẹp.
  - **Bảng trạng thái điểm nghẽn chốt sổ (Blocker Readiness Banner)**: Chỉ báo trực quan trạng thái sẵn sàng chốt kỳ hoặc liệt kê chi tiết các điểm nghẽn (ngày thiếu công, giải trình chưa chốt, đơn phép/OT chờ duyệt) theo đúng quy tắc kế toán của Codex.
  - **Bảng điều khiển Khóa sổ / Mở lại kỳ công**: Accordion gập mở gọn gàng, hỗ trợ Kế toán trưởng khóa sổ bảo mật kiểm toán hoặc mở lại kỳ có kiểm soát.
- `frontend/app/dashboard/schedules/page.tsx`:
  - **Nâng cấp Ca & Lịch làm việc**: 3 thẻ KPI sứ trắng (`CalendarDays`, `CalendarCheck`, `Clock`), bộ chọn ngày làm việc dạng pill toggle switch (`.cfg-weekday-pill`), danh sách ca làm việc dạng White Porcelain Card (`.cfg-card`) với dải màu trạng thái mép trái, chip giờ và thứ chuẩn `tabular-nums`, timeline phân công phòng ban và ngoại lệ cá nhân.
- `frontend/app/dashboard/locations/page.tsx`:
  - **Nâng cấp Địa điểm & Bản đồ GPS Geofence**: 4 thẻ KPI sứ trắng (`MapPin`, `Activity`, `Radar`, `Crosshair`), khung bản đồ số hóa Leaflet viền mỏng, nút "Lấy vị trí thiết bị" với phản hồi tức thì, danh sách địa điểm dạng sứ trắng viền mỏng với thông số bán kính và ngưỡng sai số GPS.
- `frontend/app/dashboard/organization/page.tsx`:
  - **Nâng cấp Cơ cấu tổ chức & Phân quyền**: Thanh điều hướng tab capsule (`.cfg-org-tabs`), bảng danh sách Team, Quyền quản lý và Lịch sử audit chuyển sang chuẩn compact table (`.cfg-table`), nút hành động tactile và modal xem chi tiết JSON sạch đẹp.
- `frontend/app/dashboard/access/page.tsx`:
  - **Nâng cấp Bảo mật tài khoản & Thiết bị truy cập**: 3 thẻ KPI bảo mật (`ShieldCheck`, `Smartphone`, `MailCheck`), bảng phiên đăng nhập compact với sticky header, nhận diện thiết bị Mobile vs Laptop, nổi bật phiên hiện tại (`.cfg-current-session-row`) với badge tím và chấm pulsing xanh lá (`.cfg-pulse-dot`), nút đăng xuất thiết bị tactile.

### 4. Kiểm tra kỹ thuật
- `npm run typecheck`: PASS (0 lỗi).
- `npm run lint`: PASS (0 lỗi, 0 cảnh báo).
- Giữ nguyên 100% RBAC logic, session auth, audit log requirements, Backend domain rules và API contracts.

---

## Dashboard pastel theo tham chiếu — 2026-10-20

Tech Lead yêu cầu lên thử giao diện mẫu tổng quan sáng: card pastel tím/xanh/cam/ngọc nhẹ, panel trắng, giữ sidebar và tím Thiên Minh. Chỉ sửa `frontend/app/dashboard/page.tsx`, thêm CSS cục bộ `dashboard/dashboard.css` và component `components/dashboard-attendance.tsx`; cập nhật FLOWS/biên bản. Không sửa trang Nhân viên, Backend, API, schema/migration, quyền, dependency hoặc app. Giữ toàn bộ thay đổi sẵn có khác. GitNexus chưa có index repo/runner, đã rà source/diff và controller/portal hiện hành, không dùng graph repo khác.

- Bốn chỉ số cũ giữ ý nghĩa/nguồn, link theo portal, tài khoản không có route chỉ xem số. Hàng đợi có icon, số lượng, ghi rõ ngày công hôm nay hoặc đơn/phiếu mọi ngày; không cộng nhóm trùng. Nghỉ phép/thông báo hiện hành vẫn đủ ở dải cuối, giữ ngày Backend/phạm vi/nguồn/bản chốt/cập nhật/cảnh báo.
- Admin/Kế toán trưởng có route báo cáo mới tải `/reporting/monthly/document` tháng hiện tại (và tháng trước khi 7 ngày giao tháng). Không gọi `/attendance/daily` toàn cục cho quản lý scoped. Các khối chi tiết chỉ là projection trình bày từ rows R12; không mở quyền mới. Quản lý khác giữ tổng hợp/hàng đợi hiện hữu, không render/request khối chi tiết global.
- Biểu đồ cột chồng văn phòng/hiện trường/chưa phân loại: mỗi nhân viên/ngày có giờ vào hoặc ra một lần, không suy đủ công hoặc vắng; chọn 7 ngày/tháng tới ngày Backend. Hover/focus có số chính xác. Vòng chỉ phân bố người có vào/ra hôm nay, không lấy tổng nhân sự làm mẫu số. Không trộn phép vào các phần của vòng. Bảng hôm nay tối đa 5 người, xếp giờ vào/ra hiệu lực gần nhất, không giả làm audit sự kiện mới nhất; không hiện GPS/ảnh bằng chứng. Avatar chữ viết tắt, không lấy ảnh người khác.
- Đọc detail riêng có loading/error/retry và cleanup phản hồi sau unmount; cập nhật chính xóa dữ liệu cũ, lấy lại summary/portal và detail. Lỗi không chuyển thành số 0. Mở panel/cột có animation một lượt, hover card nhẹ, reduced-motion tắt; không thêm chart library. Mobile 2 cột metric, panel 1 cột; chart tháng/bảng cuộn riêng, không tràn trang. DOM panel theo thứ tự đọc, cùng thứ tự layout.

Kiểm tra PASS: Frontend noEmit, ESLint page/component, isolated Next build `.next-r13` 23 routes; đã gỡ đúng hai include build tạm khỏi tsconfig, giữ dev `.next`. Chrome Admin desktop: tổng 9/0/0/2 đúng dữ liệu nhận được; 7 ngày không có vào/ra hiển thị 0, chọn tháng 20 ngày thấy dữ liệu thực 05/06/09/10-10 (10-10 có cả văn phòng và hiện trường), tooltip bàn phím và phân đoạn cột có dữ liệu. Bảng/vòng hôm nay empty/0 đúng, không seed. Nút báo cáo chuyển `/dashboard/reports`, cập nhật tải lại dữ liệu thành công. Viewport 390 px (375 px content do scrollbar) không tràn ngang, metric 2 cột, panel 1 cột; chọn tháng được, đã reset viewport. Tab giữ mở `/dashboard`, chọn tháng để Tech Lead xem. Không mutation dữ liệu, không xuất/chốt kỳ, không test suite/commit/push/deploy.

Rà cuối phát hiện class `field` trùng CSS form cũ (margin-top 20 px), đã namespace toàn bộ màu `db-office/db-field/db-other`. Chrome xác nhận cột 10-10 tổng 2 người cao 92 px trên plot 184 px/max 4; hai đoạn 44.5 px + gap 3 px, không còn margin sai. Scoped ESLint và isolated build 23 routes đã chạy lại PASS sau sửa.

Giới hạn: chưa có lượt hôm nay để nghiệm thu bảng populated/vòng nhiều màu trên UI; chưa ép lỗi mạng để thao tác retry hoặc đăng nhập đổi role thật trong lượt này; nhánh lỗi/quyền/cleanup đã kiểm source và compile, không ghi runtime PASS. Dữ liệu hiện hữu không được đổi chỉ vì mục đích thẩm mỹ. Chờ Tech Lead xem thiết kế, không tự áp dụng module/app khác. Ảnh local: `logs/dashboard-pastel-desktop-20261020.png`, `logs/dashboard-pastel-overview-20261020.png`, `logs/dashboard-pastel-mobile-20261020.png`.

## Danh sách nhân viên gọn hơn — 2026-10-20

Theo yêu cầu Tech Lead: giảm 25 xuống 10 hồ sơ/trang và thêm bộ chuyển trang phía trên bảng, giữ bộ phía dưới. Hai bộ dùng chung callback/trạng thái, chuyển trang giữ bộ lọc đã áp dụng; tìm kiếm vẫn qua API trên toàn bộ phạm vi và quay về trang 1. Không thay component Pagination dùng chung, Backend/API, tổng thống kê hoặc roster overlay. Chỉ sửa `employees/page.tsx`, `workspace.css` và hai tài liệu FLOWS/biên bản này; giữ nguyên thay đổi sẵn có của Tech Lead. GitNexus chưa có index/runner của repo, đã đối chiếu source/diff trực tiếp.

Kiểm tra PASS: Frontend noEmit, ESLint trang Nhân viên, isolated Next build `.next-r13` (23 routes); đã gỡ hai include tạm do build sinh, không ghi đè dev `.next`. Chrome: 37 hồ sơ → 4 trang (10/10/10/7), trước/sau và trạng thái đầu/cuối đúng, hai bộ đồng bộ; gõ nhưng chưa gửi tìm kiếm không đổi bộ lọc khi sang trang. Tìm “Demo” trả 5 hồ sơ từ toàn danh sách, ẩn paginator; xóa lọc về trang 1. Viewport mobile 390 px không tràn trang, nút cao 44 px, chuyển trước/sau được; đã reset viewport và về trang 1 không lọc. Không chạy test suite, không sửa dữ liệu, không commit/push/deploy. Ảnh local: `logs/employee-directory-pagination-desktop-20261020.png`, `logs/employee-directory-pagination-mobile-20261020.png`.

## Tiểu tiết trên bản Tech Lead chỉnh — 2026-10-20

Giữ nguyên bố cục bento/kính, tilt nhẹ, tooltip, tìm nhanh avatar, scrollspy và phím tắt mới của Tech Lead. Không redesign hoặc đổi Backend, API, migration, app/dependency. Chỉ chạm `employee-profile-overlay.tsx`, `employee-portrait.tsx`, `employee-profile.css`, FLOWS và biên bản này; các thay đổi khác trong worktree được giữ nguyên.

- Chỉ lớp aurora tím trôi chậm 36 giây trên desktop; teal/amber đứng yên, mobile dừng ambient animation. Radar và badge phản hồi một lượt, icon đối soát không xoay liên tục; reduced-motion vẫn tắt toàn bộ chuyển động.
- Nhãn đối soát đổi thành “Chưa phát hiện cảnh báo” theo dữ liệu hiện có và nhắc kiểm tra tính đầy đủ trước chốt. Ngày thiếu công vẫn được hiển thị theo summary; không coi không cảnh báo là chứng nhận dữ liệu đầy đủ. Không đổi phép tính hoặc blocker Backend.
- Vòng luôn là fullWorkdays/scheduledDays. Ba chỉ số ngày là các hàng thông tin độc lập, không còn button/nhãn “bộ lọc” và không đổi màu cùng một tập vạch theo nhãn khác. Chú thích, accessible ring label, cỡ chữ và màu ba chấm được đồng bộ; không cộng các chỉ số chồng lấp.
- Copy mã nhân viên và tên đăng nhập chỉ báo thành công sau khi await Clipboard API. Có trạng thái chờ/chặn bấm lặp, báo lỗi có hướng dẫn chép thủ công, cleanup timeout và bỏ phản hồi đến sau khi đóng/chuyển người. Đổi “Chép email” thành “Chép tài khoản” vì username không bắt buộc là email. Chừa chỗ riêng cho nút copy để không đè lên tên đăng nhập.
- Mobile nút tìm 44 px nằm cạnh dải avatar; ô tìm chỉ mở rộng khi cần, chữ input 16 px, Esc thu về mà không đóng hồ sơ. Tại 390 px dải roster giảm 126 xuống 88 px; header giữ nguyên. Tooltip rail cũng hiện khi focus bàn phím.

Kiểm tra: scoped Frontend TypeScript noEmit, ESLint ba file TS/TSX và isolated Next build `.next-r13` (23 routes) PASS. Không chạy test suite tự động. Build không ghi đè `.next` dev; hai include `.next-r13` tự sinh được gỡ đúng phần khỏi tsconfig.

Chrome localhost Admin DEMO-NV: nhãn/ý nghĩa vòng đúng, không còn button lọc giả; copy mã và username đã kiểm clipboard ngay sau thao tác mới, nội dung khớp. Mobile 390/360 không tràn ngang; mở tìm “Demo” ra 5/37, input 16 px, Esc giữ hồ sơ và trả dải về 88 px. Computed animation desktop chỉ aurora tím lặp, mobile không chạy ambient. Đã reset viewport về mặc định. Không sửa/xóa/seed hồ sơ, upload/gỡ ảnh hoặc đổi quyền/phiên để test. Clipboard thử chỉ dùng mã/tên đăng nhập demo.

Giới hạn: chưa cưỡng bức lỗi/quyền Clipboard ở OS hoặc bật reduced-motion thật trong lượt này; nhánh lỗi/cleanup đã kiểm code và compile, không ghi runtime PASS. Chưa kiểm GPU/touch trên điện thoại thật. Web/API dev giữ chạy, chưa commit/push/deploy. GitNexus vẫn chưa có repo này trong registry và thiếu runner; đối chiếu source/diff thay graph khác.

Ảnh tham chiếu: `logs/employee-profile-polish-desktop-20261020.png`, `logs/employee-profile-polish-mobile-20261020.png`. Dừng để Tech Lead xem tiểu tiết, không tự phủ phong cách sang module/app khác.

## V3 — motion cho hồ sơ nhân sự, 2026-10-20

Chỉ bổ sung presentation của overlay V2, không đổi API/schema/quyền hoặc app. Không thêm thư viện. Ba file: `employee-profile-overlay.tsx`, `employee-profile.css`, hook cục bộ mới `employee-profile-motion.ts`.

- Mở khung 620 ms (mobile 440 ms), nền mờ dần; chân dung/card xuất hiện lệch nhịp 40–60 ms. Các phần chi tiết chỉ reveal khi đi vào vùng cuộn, không lặp lại mỗi lần cuộn qua.
- Chuyển nhân viên: hồ sơ hiện hành rời theo hướng 200 ms, sau đó mới đổi id/header và đọc hồ sơ kế tiếp; dữ liệu người cũ không được giữ dưới tên mới. Nội dung rời đi inert/ẩn với accessibility, mutation bị guard; chuyển nhanh không xếp hàng callback. Esc/X hủy timer chuyển và đóng 240 ms; cleanup timer/listener/observer khi unmount.
- Dải avatar tự căn giữa như V2, thêm viền sáng ngắn khi chọn. Desktop hover card nổi 3 px và có spotlight theo con trỏ, chỉ tính trong vùng overlay và gộp bằng requestAnimationFrame; không chạy vòng lặp khi nghỉ. Không hiệu ứng rê chuột trên touch.
- Vòng công vẽ nét và cột mọc từ đáy một lần khi card xuất hiện; vẫn đúng giá trị Backend, không tạo chart khi thiếu dữ liệu, không đếm số giả. Lưu ảnh thành công thật mới có dấu check/viền xác nhận; không mô phỏng lưu thành công để xem hiệu ứng.
- `prefers-reduced-motion` tắt animation/transition/spotlight, bỏ chờ chuyển 200 ms, hiện đầy đủ nội dung. Focus bàn phím làm card hiện; ảnh/biểu đồ vẫn đọc được khi không hỗ trợ IntersectionObserver. Chưa tuyên bố tối ưu trên mọi GPU/điện thoại.

TypeScript noEmit, scoped ESLint hai file TS và Next isolated production build (23 routes) PASS, kiểm lại sau sửa điểm neo cuộn; không ghi đè `.next` dev. Hai include `.next-r13` do build tự thêm vào tsconfig đã gỡ đúng phần phát sinh. Không chạy test suite, không commit/push/triển khai production. Web/API health 200. Bản V2 và giới hạn ảnh máy thật bên dưới vẫn giữ nguyên.

Kiểm tra trực tiếp Chrome sau khi Tech Lead đăng nhập lại:

- Mở DEMO-NV: khung/card hiện đầy đủ; 10 card tổng quan đã reveal, bảy phần dưới chờ vào vùng cuộn. Quan sát được pha `ep-person-leave`, nội dung inert trong khi header vẫn là người cũ; hoàn tất sang DEMO-TP thì header/chân dung/avatar cùng đúng người mới. Bấm đúp Next chỉ chuyển một người, chiều Previous hoạt động.
- Esc trong pha Previous hủy chuyển/đóng; chờ xong không tự mở lại hoặc chuyển ngầm. Danh sách nền bỏ inert/khóa cuộn, focus trở lại đúng nút DEMO-NV. Mở lại và nút X đóng được.
- Desktop click vùng tiêu đề card (không action nghiệp vụ) tạo spotlight theo điểm trỏ, hover lift quan sát qua computed transform; ring dùng animation `ep-ring-draw` 520 ms. Cuộn xóa spotlight. Phần chi tiết opacity 1 khi tới; không replay chỉ vì quay lại tổng quan.
- Sửa hai lỗi presentation phát hiện lúc kiểm: viền avatar không làm xuất hiện scrollbar dọc (`overflow-y:hidden`); nút tới chi tiết dùng offset layout thay bounding rect bị transform reveal làm sai. Đã kiểm lại section top ≈ body top + 20 px.
- Viewport 390×844: body/document không tràn ngang, animation mở mobile 440 ms, chuyển người được; PageDown cuộn nội dung tới đơn từ và reveal card, header top vẫn 0. Đã reset viewport về mặc định. Đây không phải kiểm tra GPU/touch trên điện thoại thật.
- Không ghi/sửa dữ liệu nhân sự hoặc upload/gỡ ảnh. Chart tháng demo rỗng giữ empty state; chưa kiểm animation cột với tháng có giờ công, hiệu ứng save ảnh với thao tác lưu thật hoặc bật reduced motion ở OS trong lượt này. Các nhánh này đã có CSS/JS nhưng không ghi runtime PASS khi chưa thao tác.
- Screenshot bằng chứng: `logs/employee-profile-motion-desktop-20261020.png`, `logs/employee-profile-motion-mobile-20261020.png`. Ảnh tĩnh không thể hiện đầy đủ timing, cần xem bản live để đánh giá cảm giác chuyển động.

## V2 hiện hành — dark-glass bento và ảnh profile chung, 2026-10-20

Phần V2 này thay các giới hạn “chưa có ảnh / không chạm Backend, schema, Mobile” của bản V1 bên dưới. Tech Lead duyệt cảm hứng Nixtio: khung tối trên nền sáng mờ, bố cục bento, chân dung lớn, avatar ngang, radial work ring, chart và timeline; không sao chép tên/ảnh/số liệu mẫu hoặc thêm module ERP ngoài phạm vi.

### Trình bày và thao tác

- Lớp nền blur còn nhận ra trang phía sau; khung kính đen, card charcoal, tím Thiên Minh/mint/beige tiết chế. Animation mở/card/ảnh/cột ngắn; giảm chuyển động theo OS, không autoplay hoặc animation số liệu giả.
- Tổng quan nhận diện, giờ thực tế/OT đã duyệt, đơn từ, ngày đủ công, cảnh báo, dấu mốc và tài khoản ở đầu; bảy phần chi tiết cũ vẫn cuộn liền mạch. Vòng tròn dùng fullWorkdays/scheduledDays từ monthly report; các số văn phòng/hiện trường/nghỉ là độc lập, không cộng gộp. Chart dùng workedMinutes từng ngày, rỗng thì ghi rõ. Không gán online, năng suất hay lương giả.
- Chuyển người bằng strip/trước/sau/←→; giữ danh sách, bộ lọc và vị trí cuộn nền. Rail desktop cuộn đến từng phần; header/strip cố định. Điện thoại toàn màn hình, một cột, nút chạm phù hợp; không ép bố cục desktop co nhỏ.
- Esc/X trả về danh sách, nháp ảnh có confirmation và beforeunload. Panel sửa/reset/xóa cũ mở bên trên, hồ sơ tạm inert, không đổi quy tắc nghiệp vụ/confirmation. Lỗi đọc từng nguồn không biến thành số 0.

### Ảnh chung và quyền

- Một ảnh profile theo employee, không lưu hai bản độc lập Admin/app. Nhân viên vào nút avatar ở Hôm nay, chụp hoặc chọn ảnh thiết bị; Admin thêm/thay/gỡ trên card chân dung. Xem trước trước khi Lưu. Không tự lấy ảnh bằng chứng, GPS hoặc mẫu sinh trắc; không phải nhận diện khuôn mặt.
- Chưa có ảnh dùng silhouette/initial, không gán ảnh người thật bất kỳ. Admin tải lại hồ sơ, app trở lại/mở lại để lấy ảnh phiên bản mới; chưa có realtime push invalidation cho ảnh.
- Backend private JWT: Admin đọc metadata/byte và quản lý `/employees/:id/portrait`; app dùng `/profile/portrait/info` và `/profile/portrait`, tự xác định employee liên kết với authenticated account, active; không cho tự truyền id người khác. Những quyền module khác giữ nguyên.
- Nguồn JPEG/PNG/WebP tối đa 8 MiB được chuẩn hóa phía client thành JPEG tối đa 1200 px + thumbnail 160 px, nền trong suốt chuyển nền sáng, loại EXIF. Server giới hạn 768 KiB/40 KiB, cấu trúc JPEG baseline và dimensions, bỏ APP/comment; không phải full image decoder/antivirus. Ảnh không public URL, Web dùng authenticated blob, app giữ byte trong bộ nhớ; no-store/nosniff middleware hiện hữu.
- expectedVersion CAS trả 409 khi ảnh đã đổi; không tự upload lại khi timeout/mất mạng. Ownership recheck dưới khóa, audit PHOTO_UPDATED/REMOVED chỉ chứa version, không ảnh/filename/EXIF. Admin vẫn có thể sửa ảnh do nhân viên tự thêm; chưa thêm workflow duyệt ảnh hay phân quyền ảnh cho Head/Leader xem người khác.

### Phạm vi thay đổi V2

- Web: `employee-profile-overlay.tsx`, `employee-profile.css`, mới `employee-portrait.tsx`; `auth-api.ts` giữ boundary multipart; trang employees thêm nhãn ảnh trong preview xóa.
- Backend bắt buộc cho ảnh mới: `employee-portraits.controller/service.ts`, pure validator `domain/employee-portrait.ts`, employees.module, migration/registry. `employee-admin.service.ts` đưa ảnh vào preview/fingerprint/xóa và giữ thứ tự khóa với upload. Không sửa rule chấm công, phê duyệt hay báo cáo.
- Mobile được Tech Lead bổ sung rõ trong phản hồi về ảnh: `features/profile/profile_screen.dart`, `profile_portrait.dart`, entry avatar trong attendance_home, các method ApiClient riêng; image 4.10.1 chuyển từ transitive sang direct, không nâng version/SDK/native plugin. Không chuyển toàn app sang dark theme.
- Tests bổ sung (chưa chạy): `backend/test/employee-portrait.spec.ts` cho định dạng/metadata/version/Admin/self-owner; FormData regression trong `web-auth-refresh.spec.ts`; `mobile/test/profile_portrait_test.dart` dùng pixel tổng hợp, không ảnh nhân viên.
- PROJECT/FLOWS/IMPLEMENTATION/README và mobile README cập nhật contract/flow. Những thay đổi cũ ngoài V2 trong worktree được giữ nguyên, không commit/push/deploy.

### Migration và dữ liệu development

`EmployeePortraits1793060000000` đã apply local; table employee_portraits dùng bytea có giới hạn, cascade theo employee, audit/updated_by giữ technical actor như R3. Xóa nhân viên đếm ảnh vào preview, thay ảnh khiến fingerprint/confirmation cũ phải đọc lại. DB backup tăng tối đa khoảng 808 KiB/nhân viên chưa kể overhead; cần theo dõi dung lượng khi vận hành. Down từ chối khi có ảnh, không âm thầm xóa.

Đã tạo pg_dump custom **trước migration**: `logs/employee-portraits-before-20261020.dump` (ignored), SHA256 `1001D30D22A72D657550094400975F326BFA48C2DCE21068E7ACA8B8CCB2A78B`. Lần đọc TOC đầu bị ngắt do pipe lấy 12 dòng; sau đó đã đọc đầy đủ TOC, kiểm exit code, copy/hash archive gốc. Việc kiểm TOC/hash hoàn tất sau migration; **chưa restore thử archive này**, không coi đó là nghiệm thu disaster recovery mới. Không seed/ghi ảnh thử hoặc sửa thông tin nhân viên trong lượt này.

### Kiểm tra V2 và giới hạn

- Backend/Frontend TypeScript noEmit, scoped ESLint: PASS. Backend isolated emit vào logs: PASS. Next production build `.next-r13`: PASS, 23 routes; không ghi đè `.next` dev. Hai include build tự sinh đã gỡ đúng phần phát sinh khỏi tsconfig.
- Flutter pub get offline: PASS, chỉ chuyển image hiện hữu sang direct. Scoped analyze gồm feature mới, home, ApiClient và file test mới: PASS. Không chạy Vitest/Flutter test suite theo chỉ thị tiết kiệm của Tech Lead; test mới chưa được chứng minh PASS bằng thực thi.
- Flutter debug bundle (Dart/assets, không APK): PASS với asset-dir tuyệt đối trong logs. Lần đầu dùng đường dẫn tương đối `../logs/...` lỗi ghi shader trên Windows; chạy lại đường dẫn tuyệt đối thành công, không sửa SDK hay native config để né lỗi. Đây là kiểm tra biên dịch, chưa thay cho thao tác camera/gallery trên điện thoại.
- Chrome Admin localhost: mở DEMO-NV, chuyển DEMO-TP/trở lại, cuộn nút đơn từ đúng vị trí dưới header; form Sửa mở trên hồ sơ, đóng không submit. Desktop 1920, tablet 1024, mobile 390 và 360 px không tràn ngang; overview/placeholder/trạng thái thật hiển thị. Viewport override được trả về mặc định sau kiểm tra. Screenshot: `logs/employee-profile-bento-desktop-20261020.png`, `logs/employee-profile-bento-mobile-20261020.png`. Backend health 200; API ảnh self-service không đăng nhập trả 401.
- Chưa nghiệm thu chọn/Lưu/gỡ **ảnh thực** xuyên app → API → Admin trên máy thật; không dùng ảnh cá nhân thay người dùng hoặc tự gán ảnh mẫu. Chưa cài debug/hot restart lên điện thoại, không tạo APK, không deploy Pages/production. Không gọi đây là nghiệm thu mọi role/module; các giới hạn aggregate/pagination của V1 vẫn còn.
- PostgreSQL/Web/API giữ chạy local. GitNexus không có index repository này, thiếu runner local; dùng source/diff trực tiếp theo fallback, không tra graph repo khác. Dừng để Tech Lead đánh giá hình thức mới và cung cấp/chọn ảnh thử trên thiết bị; không tự phủ toàn bộ UI.

Tech Lead duyệt hướng: tham chiếu khung dashboard sáng, điều hướng phân nhóm và ưu tiên công việc; không sao chép nguyên mẫu. Giữ logo/tím thương hiệu Thiên Minh, cam/vàng làm điểm nhấn nhỏ. Đây là bản mẫu vận hành trước khi phủ phong cách hoàn thiện lên các module.

## Bổ sung: hồ sơ overlay — 2026-10-20

Phần này thay cách **bấm tên mở drawer thao tác** của bản mẫu 19/10; nút ba chấm vẫn giữ drawer thao tác cũ. Chỉ chỉnh trang Nhân viên, không triển khai thêm module hoặc app.

- Bấm tên/avatar hoặc vùng trống của dòng mở hồ sơ lớn, giữ URL/danh sách nền. Tổng quan nhận diện và bốn số công/phút/OT/đối soát ở đầu; tiếp đó cuộn qua thông tin tổ chức, quỹ phép, bảng công mở rộng, đơn từ, công tác, kỷ luật, tài khoản/quyền/tuyến và lịch sử. Không có tab chi tiết, biểu đồ/trend giả, trạng thái online hoặc dữ liệu lương tự dựng.
- Trước/sau, dải tên/initial cuộn ngang và phím ←/→ đi theo toàn bộ kết quả Backend đã áp dụng, không chỉ trang 25 người. Không tự chuyển/vòng lại; tắt ở hai biên. Đổi người về đầu hồ sơ, đóng trả focus và giữ bộ lọc/trang/cuộn nền; không bắt phím mũi tên trong input/select/textarea. Không dùng ảnh đại diện giả khi hệ thống chưa có ảnh.
- Mobile: toàn màn hình, safe area, header/dải nhân viên cố định, thân cuộn một vùng, metric 2×2, nội dung một cột, nút tối thiểu 44 px. Bảng ngày có vùng cuộn ngang riêng, không làm tràn trang. Không thêm swipe ngang trên thân vì xung đột cuộn/nhập liệu.
- Hiệu ứng CSS: mở fade/translate/scale rất nhẹ, đóng 160ms, nội dung đổi người 180ms, hover/pressed có phản hồi; không autoplay, count-up hay thư viện animation. Tôn trọng `prefers-reduced-motion`, không animation trạng thái nghiệp vụ.
- Sửa/reset/ngừng/xóa/lịch sử vẫn dùng panel và confirmation hiện hữu; overlay nền không nhận phím khi panel mở, chặn đổi người/đóng lúc chuẩn bị thao tác. Confirmation/toast của riêng trang này portal lên body để không bị nền inert. Response lịch sử đến trễ không tự mở lại panel đã đóng. Không thay endpoint, rule hoặc quyền.
- Công lấy monthly document có employeeId và tháng, ghi rõ LIVE/SNAPSHOT/kỳ khóa; quỹ phép theo policy, chuẩn ngày và năm hiện tại tại thời điểm đọc, không phải cuối tháng. Đơn/công tác/kỷ luật là toàn lịch sử nhân viên, không bị bộ lọc tháng công chi phối. Giữ người xử lý/trạng thái/thu hồi; không tự coi có grant/tuyến là còn quyền duyệt, hoặc suy diễn team từ phòng ban. Không tự fetch ảnh/GPS chi tiết.

File mới: `frontend/components/employee-profile-overlay.tsx`, `frontend/app/dashboard/employees/employee-profile.css`. Wiring và hai chỉnh sửa vòng đời panel/toast/confirmation chỉ trong `frontend/app/dashboard/employees/page.tsx`. Cập nhật FLOWS/IMPLEMENTATION/README/biên bản này. Không chạm Backend, migration, Mobile, dependency; giữ tất cả sửa cũ trong working tree.

Kiểm tra lượt này:

- TypeScript noEmit/scoped ESLint: PASS; Next build biệt lập `.next-r13`: PASS, 23 routes. Include build tạm trong tsconfig được bỏ lại đúng các dòng do Next thêm; không ghi đè `.next` dev. Không chạy test suite tự động, không commit/push/deploy.
- Chrome Admin: mở DEMO-NV, chuyển Leader/Trưởng phòng và hồ sơ QA thứ 27 ngoài trang đầu; nội dung về đầu khi đổi người. Tìm DEMO-NV → 1/1, trước/sau disabled; Esc/X đóng, trả focus, nền bỏ inert và giữ query. Phím mũi tên trong ô tháng không chuyển người. Mở bảng ngày, account username và lịch sử đọc được.
- Nhập nháp form sửa → đóng → Quay lại vẫn giữ nháp; đóng → Bỏ thay đổi quay về hồ sơ. Panel account Esc chỉ đóng panel, giữ hồ sơ. Không submit form, reset password, xóa hay sửa dữ liệu để kiểm UI.
- Desktop mặc định, tablet 1024×768, mobile 390×844 và 360×740: overlay không tràn ngang; 360 px có nút đóng 44 px. Cuộn dài vẫn giữ header, dải nhân sự tự đưa người đang chọn vào vùng nhìn sau đổi người/resize. Viewport kiểm tra được reset sau QA. Chưa thao tác iPhone/Safari thật hoặc bật giảm chuyển động ở cấp OS; có nhánh CSS/JS hỗ trợ giảm chuyển động, không coi đó là chứng nhận mọi trình duyệt.

Giới hạn: chưa có endpoint aggregate hồ sơ, dùng collection Admin hiện hữu cho đơn/quyền/tuyến và tái sử dụng khi chuyển người trong overlay. Dữ liệu nhiều sẽ cần endpoint lọc/pagination/aggregate riêng được duyệt; không tải N+1 thành viên mọi team. Hồ sơ này không phải kho hồ sơ HCNS/giấy tờ/lương; chưa bổ sung ảnh nhân viên, lương, tổng hợp membership team đầy đủ hoặc API mới. Role khác vẫn chỉ xem danh sách theo quyền cũ, chưa nghiệm thu lại từng role trong lượt UI này. Lỗi/mất mạng có state riêng, không biến thành số 0; chưa ngắt Backend để kiểm lỗi cưỡng bức lần này. Đây là bản UI đầu để Tech Lead xem và chỉnh tiếp, chưa phủ phong cách lên toàn hệ thống.

## Đã triển khai

1. Shell: sáu nhóm menu đóng/mở, mặc định mở nhóm trang hiện tại; vẫn lọc từng link bằng Backend `portal.navigation`. Breadcrumb, header cố định, nhãn phạm vi và môi trường thật. Trên màn hẹp dùng drawer có backdrop, Escape và giới hạn focus bàn phím.
2. Nhân viên: danh sách và tìm kiếm/phân trang Backend là nội dung chính; gộp họ tên/mã, loại/chức vụ, phòng/chi nhánh thành các ô phân cấp nhưng không bỏ trường. Nút Thêm nhân viên/Danh mục tổ chức mở panel; tên hoặc nút ba chấm mở thao tác. Tài khoản/reset, sửa, lịch sử, ngừng/khôi phục và preview xóa giữ flow/API/confirmation hiện có, chuyển từ panel đầu trang sang drawer có focus trap. Xóa vẫn có vùng cảnh báo riêng, không thực thi ngay từ nút ba chấm.
3. Xử lý nghỉ phép/giải trình/OT: dùng cùng lớp trình bày mẫu cho summary, hàng đợi, bộ lọc ngang và tab cấu hình tuyến; giữ capability, drawer chi tiết, audit và quyết định hai bước hiện có. Không tự duyệt, đổi tuyến hoặc tạo đơn.
4. Dashboard: bốn chỉ số chính trên một hàng desktop; việc cần xử lý chiếm vùng chính, hai chỉ số còn lại và mô tả nguồn ở cột phụ. Giữ tất cả số liệu/giải thích R13, không cộng các nhóm chồng lấp, không thêm biểu đồ hoặc dữ liệu giả. Bỏ hero quảng bá/nhãn ACTIVE tĩnh khỏi trang vận hành.

## Phạm vi file

- `frontend/app/dashboard/layout.tsx`, stylesheet mới `workspace.css`.
- `frontend/app/dashboard/employees/page.tsx`, `page.tsx` Dashboard và wrappers `leave-workflow`, `explanations`, `overtime`.
- `frontend/components/workflow-ui.tsx`: chỉ thêm hai props trình bày tùy chọn cho drawer dùng lại; mặc định nghiệp vụ giữ nguyên. Không đổi công cụ focus/busy/confirmation của workflow. Employee lookup form giữ tham chiếu DOM trước `await` để reset không phụ thuộc React event đã kết thúc.
- README/FLOWS/IMPLEMENTATION và biên bản này. Không chạm Backend, API contract, migration, Mobile, dependencies hay file cấu hình lâu dài. Build tự thêm include `.next-r13` vào tsconfig đã được hoàn nguyên đúng hai dòng phát sinh, giữ phần sửa cũ của người dùng.

## Kiểm tra

- Frontend TypeScript noEmit và ESLint các file TSX đã chạm: PASS.
- Next production build biệt lập `NEXT_BUILD_DIR=.next-r13`: PASS, 23 routes; không ghi đè `.next` của dev server. Không deploy Pages/production, không commit/push.
- Chrome localhost: Dashboard/menu nhóm; bảng nhân viên, tìm DEMO-NV, tìm không có kết quả và xóa bộ lọc; mở panel thao tác/tài khoản, tên đăng nhập đúng. Form thêm nhập nháp → đóng → Quay lại giữ nguyên giá trị; đóng → Bỏ thay đổi xóa nháp, không gửi tạo hồ sơ. Mở form sửa và lịch sử DEMO-NV, chỉ đọc rồi đóng. Không submit/reset mật khẩu, xóa nhân sự hoặc sửa bản ghi để kiểm UI.
- Hàng đợi nghỉ phép, tab cấu hình tuyến và chi tiết đơn đọc được; quyền quyết định vẫn do Backend trả. Màn giải trình/OT mở được với lớp trình bày mới. Hàng đợi và menu kiểm tra ở desktop mặc định, 1024×768 và 390×844; chip/tab cuộn ngang có chủ đích, menu Escape đóng được. Form sửa nhân viên ở 390 px chuyển một cột, không tràn màn hình. Override viewport được trả về mặc định sau kiểm tra.
- Backend health/Web trả 200. Hot Reload giữ hoạt động; trong lần kiểm đã reload Chrome để lấy đầy đủ JS/CSS mới. Không chạy test suite tự động theo chỉ thị tiết kiệm của Tech Lead; không coi build/quan sát UI là nghiệm thu lại nghiệp vụ R1–R14.
- GitNexus không có repo này trong danh sách index và thiếu `.gitnexus/run.cjs`; đọc source/diff trực tiếp, không dùng graph repository khác hoặc cài lại công cụ.

## Chưa làm / điểm dừng

Chưa phủ giao diện chi tiết sang Tổ chức, Chấm công, Công tác, Chính sách phép, Thông báo, Báo cáo, KPI hoặc Vận hành; các trang này chỉ nhận shell chung. Không thêm dark mode, animation nặng, global search giả hoặc chức năng ERP từ ảnh tham khảo. Chưa kiểm lại UI từng role Head/Leader trong lượt chỉnh này; quyền/menu vẫn giữ allow-list Backend, không cấp quyền mới. CSS dùng scope riêng để hạn chế ảnh hưởng.

Tech Lead xem trước `/dashboard`, `/dashboard/employees`, `/dashboard/leave-workflow`; sau phản hồi mới chốt mật độ/typography/độ nhấn và mở rộng phong cách. Không tự triển khai giai đoạn phủ toàn bộ hoặc đổi app.
