# Phân quyền theo tổ chức — kế hoạch và bàn giao

## Quyết định đã duyệt

- Admin quản trị cơ cấu, quyền và tuyến. Nhân viên gửi → Leader xác nhận → Trưởng phòng duyệt/từ chối; Admin không phải duyệt thêm, được xem lịch sử và người xử lý.
- Mỗi team thuộc đúng một phòng ban, chỉ xuyên chi nhánh; không có team xuyên phòng ban trong phạm vi hiện tại. Một người có thể thuộc nhiều phòng/team và được Admin cấp nhiều phạm vi quản lý.
- Membership không phải management grant. Quyền có hình thức tạm thời/chính thức, độc lập với thời hạn có giới hạn/vô thời hạn.
- Admin chỉnh tuyến là thao tác quản trị trực tiếp: lưu là áp dụng ngay cho bước chưa thực hiện; không tạo đơn xin đổi tuyến, không sửa người từng xử lý, không tự cấp quyền ngoài phạm vi.
- Quản lý dùng Web và app hiện tại, không thêm app riêng. Kế hoạch PQ2 cho phép một phiên Web + một thiết bị Mobile với nhóm quản lý được duyệt; không tự nới cho mọi nhân viên. Giữ Web 24h/idle 30m, Mobile tối đa 30 ngày, JWT 15 phút.
- Giữ quyền chuyên biệt của Kế toán trưởng/Quản lý khu vực. Không có kế thừa quyền Admin mặc định. Không mở rộng ERP/payroll/kho/tài chính.

## Thứ tự triển khai

| Lát cắt | Phạm vi | Trạng thái |
|---|---|---|
| PQ1 | Team, thành viên, quyền theo phạm vi/thời hạn, Admin Web, danh sách tổ chức cơ bản có scope | Implemented; API và Web đã kiểm tra |
| PQ2 | Quản lý đăng nhập Web + một Mobile đồng thời; refresh/revocation và quyền hiện hành | Implemented; API đã kiểm tra, UI authenticated chưa xác nhận do Chrome chặn API |
| PQ3 | Giải trình hai bước, tuyến mặc định theo nhân viên, Admin đổi bước chưa xử lý, evidence/audit/inbox/push | Implemented; API/build đã kiểm tra, UI authenticated bị Chrome chặn API |
| PQ4 | Khu vực quản lý trong app hiện tại, dùng cùng API | NOT_IMPLEMENTED |
| PQ5 | Nghỉ phép trước; quyền công tác/chấm công/báo cáo/thông báo theo từng module đã xác định | NOT_IMPLEMENTED |

Mỗi lát cắt đi Database → Backend API → Web/App liên quan → kiểm tra phù hợp → bàn giao. Không triển khai đồng thời các lát cắt. Theo chỉ thị Tech Lead, không tự chạy test suite; vẫn bổ sung test cho thay đổi API/permission và báo rõ chưa chạy.

## PQ1 — phạm vi hoàn thành

- Migration `1791504000000-organization-management-access`: ba bảng team, lịch sử membership, management grant; FK/check/index, không backfill quyền và không chạm dữ liệu workflow cũ. Down bị chặn nếu đã có team/quyền để không mất lịch sử.
- Admin tạo team; sửa tên/ngừng/khôi phục. Mã và phòng ban bất biến; mã duy nhất trong phòng ban. Thành viên phải có phân công hiện hành trong phòng đó tại chi nhánh đang hoạt động, gồm phân công chính hoặc kiêm nhiệm.
- Thêm/rút thành viên có audit; thêm lại tạo record khác. Rút cần lý do và không tự thu hồi quyền quản lý đã cấp độc lập.
- Admin cấp Trưởng phòng theo phòng hoặc Leader theo team cho hồ sơ/tài khoản hoạt động. Người quản lý không bắt buộc thuộc đơn vị đó, vì quyền do Admin chỉ định. Không cấp role toàn cục, không đổi các quyền toàn cục có sẵn.
- Grant kiểm tra hiệu lực `[bắt đầu,kết thúc)` mỗi request; hỗ trợ mốc tương lai, hết hạn, vô thời hạn, thu hồi. Không cho cùng người/vai trò/phạm vi có khoảng quyền chưa thu hồi bị trùng. Sửa phạm vi/thời hạn bằng thu hồi và cấp lại.
- Tài khoản/hồ sơ/team/phòng không hoạt động khiến grant tạm không hiệu lực. Khôi phục phạm vi cho phép grant chưa hết hạn/thu hồi hiệu lực lại; không hồi sinh quyền hết hạn/thu hồi. Membership mất điều kiện vẫn giữ record để Admin xử lý.
- Web có loading/error/empty/success, xác nhận cấp/thu hồi/ngừng team/rút thành viên, bộ chọn nhân sự và phân trang. Audit xem 200 record mới nhất và giá trị trước/sau.

### API mới

| Endpoint `/api/organization` | Quyền/phạm vi |
|---|---|
| `GET /mine` | Tài khoản hiện tại; active grants/capabilities, không liệt kê quyền người khác |
| `GET /teams` | Admin toàn bộ; Trưởng phòng team hoạt động trong phòng được cấp; Leader chỉ team được cấp; người không có grant nhận danh sách trống |
| `GET /teams/:id/members` | Admin xem lịch sử; quản lý chỉ nhân sự hiện hành đủ điều kiện trong phạm vi |
| `GET /departments/:id/employees` | Admin hoặc Trưởng phòng đúng phòng; Leader không được mở rộng thành toàn phòng |
| `POST /teams`, `PATCH /teams/:id` | Chỉ Admin |
| `POST /teams/:id/members`, `POST /teams/:id/members/:membershipId/end` | Chỉ Admin |
| `GET/POST /grants`, `POST /grants/:id/revoke`, `GET /history` | Chỉ Admin |

Các danh sách scoped không trả email/số điện thoại/tài khoản/phân công ở đơn vị khác. Grant không cho truy cập API nhân viên đầy đủ, ảnh giải trình, báo cáo, xuất Excel hay duyệt đơn. Trạng thái Web là snapshot lần tải; quyết định truy cập luôn ở Backend.

## Kiểm tra PQ1

- `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm build`: đạt cho Backend/Admin Web.
- Build với `NEXT_STATIC_EXPORT=true`: đạt, có route `/dashboard/organization` trong static output cho Cloudflare Pages. Development server vẫn hoạt động, không dùng static build để thay development mode.
- Migration: đã áp dụng một migration trên PostgreSQL local. Backend health `ok`; route Web `/dashboard/organization` trả HTTP 200.
- Kiểm tra API development-only: thêm thành viên cùng phòng ở HCM/HN; trùng thành viên 409; sai phòng 400; trùng khoảng grant 409; Leader đọc team mình 200 và team khác/toàn phòng/quản trị grant/API nhân viên đầy đủ 403; thu hồi chặn ngay trên phiên cũ; Trưởng phòng đọc danh sách cơ bản đúng phòng và bị chặn ngoài phòng/team ngừng hoạt động; grant hết hạn/tương lai không vào active access; rút và thêm lại có ID/lịch sử mới; audit được ghi.
- Fixture kiểm tra có tên `PQ1 DEVELOPMENT ONLY`: tài khoản đã ngừng hoạt động, hai team đã ngừng hoạt động; membership đã kết thúc, grant hiện hành/tương lai đã thu hồi. Không đăng nhập/thu hồi phiên của tài khoản Mobile demo đang dùng. Lịch sử fixture được giữ, không xóa vật lý.
- `backend/test/organization-management-access.spec.ts` bổ sung policy/authorization cases nhưng **chưa chạy automated test suite**, theo yêu cầu Tech Lead.
- Chrome ban đầu không gắn được debugger; mở tab Chrome mới đã khôi phục. Đã kiểm tra trang/biểu mẫu cấp quyền, lưu tên team development-only thành công có toast và audit trước/sau, lịch sử phân công kết thúc, phân trang audit. Không thao tác cấp quyền thật qua UI; API cấp/thu hồi đã được kiểm tra ở trên.
- Đã xem desktop và viewport 390×844: sidebar chuyển drawer, form một cột, tab/table cuộn ngang cục bộ. Topbar `DEVELOPMENT` hiện có tràn ngang khoảng 11 px ở màn hình hẹp; nằm ở layout có sẵn, không sửa ngoài PQ1. Chưa kiểm tra mọi trình duyệt/độ lớn chữ hoặc toàn bộ trạng thái lỗi UI.
- Không sửa `mobile/`; giữ thay đổi có sẵn ở `mobile/lib/features/leave/leave_request_screen.dart`, không đưa vào commit PQ1.

## Quyết định bổ sung đã chốt cho PQ3

1. Admin đặt tuyến mặc định cho từng nhân viên, gắn một team/phòng cụ thể; không tự chọn theo phòng chính hoặc nhiều membership. Lưu áp dụng ngay cho bước chưa xử lý của đơn đang mở; đổi riêng một đơn không sửa mặc định.
2. Leader chỉ xác nhận. Hai bước do hai người khác nhau, không xử lý đơn của chính mình; cần người độc lập có grant đúng phạm vi do Admin chỉ định.
3. Thiếu/hết hạn/thu hồi người xử lý: tiếp nhận đơn, chờ Admin phân tuyến; không bỏ bước. Xác nhận đã hoàn tất giữ nguyên ngay cả khi quyền Leader sau đó hết hiệu lực.
4. Đơn đang chờ cũ chuyển sang hai bước/chờ tuyến; đơn đã kết thúc giữ nguyên lịch sử, không tạo xác nhận giả. Legacy `REQUESTED` vẫn cần phản hồi đúng owner/hạn trước bước xác nhận.
5. Chỉ giải trình trong PQ3. Chính sách hai bước của nghỉ phép và rollout module khác cần PQ5; không sao chép sang vòng đời giao việc công tác. Trả về bổ sung chưa triển khai.

## PQ2 — phạm vi bàn giao

- Đăng nhập quản lý dùng tài khoản nhân viên hiện có, không tạo tài khoản/app quản lý riêng. Người có grant Trưởng phòng/Leader `ACTIVE` được một Web + một Mobile; membership không tự cấp quyền. Role toàn cục chưa có grant giữ policy phiên cũ; đang chờ Tech Lead chốt có mở ngoại lệ cho Admin/Kế toán trưởng/Quản lý khu vực hay không.
- Migration `1791590400000-manager-channel-sessions` đổi unique index sang `(user_id,client_type)`; không đăng xuất/backfill/xóa phiên hiện có. Backend khóa row tài khoản và đọc policy mới trong transaction để serialize cả login cùng kênh và khác kênh. Rollback bị chặn nếu còn nhiều phiên chưa thu hồi/tài khoản; phải chủ động thu hồi phiên dư trước.
- Xác thực và refresh kiểm tra grant, account, employee và scope hiện hành. Grant mất hiệu lực làm Web không đủ quyền bị thu hồi ở request tiếp theo; Mobile nhân viên được giữ. Nếu còn role Web độc lập thì giữ quyền module cũ nhưng trở lại một phiên: Mobile được ưu tiên nếu cả hai đang hoạt động. Grant còn hiệu lực khác giữ ngoại lệ; cấp lại quyền không hồi sinh SID đã thu hồi.
- Logout, Admin thu hồi và refresh reuse chỉ ảnh hưởng SID liên quan; offboarding vẫn thu hồi tất cả. Web 24h/idle30m, Mobile30d, JWT15m và hạn tuyệt đối không đổi. Nhân viên thường login Web bị từ chối trước khi thay phiên app.
- `user.portal` bổ sung `webAllowed`, `sessionMode`, `homePath`, `navigation`, `scopeLabel`, `managementGrants` vào login/refresh/me/admin-session. Role/JWT không được nâng thành MANAGER; grant view không lộ reason/actor/grant history.
- Web `/dashboard/managed` chỉ đọc scoped directory: Trưởng phòng được chọn phòng/team của mình; Leader chỉ team được cấp. Sidebar/route mặc định và chặn page ngoài quyền dùng contract Backend; không mount page nghiệp vụ ngoài quyền. Revalidate khi đổi trang/focus, không heartbeat kéo dài idle.
- Tái sử dụng grant reader chung ở persistence để Auth không import OrganizationAccessModule vòng tròn hoặc copy rule. JWT guard không đổi lỗi DB thành lỗi phiên; Web refresh không biến lỗi mạng/server thành hết phiên.

### File/module và phạm vi

- Backend: `auth` (Domain policy, session port/repository/service/controller/JWT guard), migration/data-source; `organization-access` chỉ tách query đọc grant dùng chung, không đổi rule/team API.
- Web: auth client, login, dashboard layout/menu, diễn giải policy tại Tài khoản & thiết bị, page mới `dashboard/managed` dùng component hiện có; không redesign toàn bộ Admin.
- Tests: cập nhật `auth.service.spec.ts`, bổ sung `manager-channel-policy.spec.ts`, `manager-session.repository.spec.ts`, `jwt-session-access.spec.ts`. Có policy boundary, lock/replacement, current rights, outage-vs-revocation và per-SID isolation cases; không chạy suite theo chỉ thị Tech Lead.
- Canonical docs: `PROJECT.md`, `FLOWS.md`, `IMPLEMENTATION.md`, `README.md`, file kế hoạch này. Không sửa Mobile; vẫn loại thay đổi có sẵn `mobile/lib/features/leave/leave_request_screen.dart` khỏi commit.

### Kiểm tra và giới hạn PQ2

- Đã áp dụng migration local. Backend health `ok`; Web `/dashboard/managed` HTTP200. Typecheck, lint, build thường và build static Cloudflare đều đạt; test suite tự động chưa chạy.
- API development-only: nhân viên Web403 và Mobile cũ200; Mobile mới thay Mobile cũ401; Leader role vẫn EMPLOYEE, portal chỉ `/dashboard/managed`; Web+Mobile200; thay Web cũ401/Mobile200, thay Mobile cũ401/Web200; refresh hai kênh thành công; logout Web giữ Mobile200. Thu hồi grant: Web401/refresh401/Mobile200; grant hết hạn: Web401/Mobile200. Trưởng phòng có portal scope đúng phòng.
- Chrome hiển thị trang login mới và lỗi kết nối có thể thử lại, nhưng truy cập thẳng health3001 bị `ERR_BLOCKED_BY_CLIENT`. Không thay extension/privacy/security settings. Chưa xác nhận authenticated UI, scoped selectors, responsive manager page trên Chrome; không coi HTTP200/static build là bằng chứng login UI thành công.
- Ban đầu kiểm tra thêm bị HTTP429; đã đợi cửa sổ giới hạn hết hạn, không tắt/nới/reset limiter. Lượt cuối: hai Mobile login đồng thời cùng nhân viên đều HTTP200 nhưng chỉ một SID còn dùng được (401/200); Web + Mobile concurrent của Leader đều login200 và authenticated200/200; logout Mobile giữ Web200; reuse refresh Mobile401 và SID đó401, Web200; Admin thu hồi Web401, Mobile200; ngừng team Web401, Mobile200. Trưởng phòng đọc danh sách phòng200, chỉ các trường `id/employeeCode/fullName/branches`; Admin không có grant vẫn `SINGLE_ACCOUNT`.
- Fixture `PQ2-DEV-220C3A7E` là development-only: tài khoản/hồ sơ đã ngừng hoạt động và mọi phiên bị thu hồi, các grant hiện hành đã thu hồi (grant ngắn giữ trạng thái hết hạn), membership đã kết thúc, team đã ngừng hoạt động. Dọn qua API có audit, không xóa vật lý và không thay quyền/phiên tài khoản Mobile demo trên điện thoại. Không có credential fixture trong Git.
- GitNexus MCP không có index repo này và local runner không tồn tại; dùng search/diff/call-site inspection, không query graph repo khác hoặc giả định đã chạy impact/detect_changes.
- Deploy cần migration + Backend trước Web; schema mới bảo vệ duy nhất theo kênh, invariant nhân viên một phiên được thực thi bởi transaction account-lock. Chưa kiểm chứng mọi concurrency/DB outage/rollback variant trên môi trường production.

Điểm dừng tại thời điểm bàn giao PQ2: chưa triển khai PQ3–PQ5. Trạng thái hiện hành nằm ở bàn giao PQ3 bên dưới.

## PQ3 — phạm vi bàn giao

- Migration `1791676800000-explanation-two-step-workflow`: bảng tuyến mặc định theo employee, snapshot team/Leader/Head, stage/version và confirmed actor/time/note. Đơn `SUBMITTED` cũ → `WAITING_ROUTING`, `REQUESTED` → `EMPLOYEE_RESPONSE`; đơn terminal giữ nguyên. Down chặn khi có tuyến/decision/workflow dữ liệu mới, không tự xóa lịch sử.
- Domain policy độc lập ORM: hai actor khác nhau, không owner; grant live đúng team/phòng và đúng người được chỉ định. Leader xác nhận không được từ chối cuối cùng; Head quyết định sau xác nhận thật; Admin không override. Mất grant không hồi sinh quyết định/phiên cũ.
- Admin `PUT /attendance/explanations/routes/:employeeId` cấu hình mặc định, có lý do và `expectedVersion`, áp dụng ngay cho đơn đang mở trong transaction. `PATCH /:id/reroute` đổi riêng đơn. Completed Leader/team/confirmation không bị viết lại; chỉ Head trong phạm vi đã xác nhận thay được. Nếu tuyến mặc định mới không có Head đủ quyền ở phạm vi cũ của đơn đã xác nhận, toàn bộ save bị chặn thay vì chuyển phạm vi âm thầm.
- `GET /attendance/explanations` scoped queue; `GET /routing-options`, `/routes` chỉ Admin. `PATCH /:id/confirm`, `/:id/review` kiểm tra current grant và version; `GET /:id/history` kiểm tra owner/Admin/assigned reviewer live. Evidence có cùng scope policy, kể cả đoán trực tiếp filename. Giữ `SUBMITTED` tới quyết định cuối, đảm bảo duplicate/open/period blocker không bỏ qua bước.
- Hộp thư và audit tạo cùng transaction, push thử sau commit bằng sender hiện hữu. Missing route báo Admin có hồ sơ inbox; chuyển bước báo người xử lý và nhân viên, quyết định báo nhân viên. Inbox không lộ nội dung gửi/ảnh/GPS trong thông báo giao việc; notification không cấp quyền mở đơn. Push thật vẫn phụ thuộc Firebase, không tuyên bố đã giao push khi chưa cấu hình.
- Web `/dashboard/explanations`: lọc/tìm/phân trang, nhãn bước, actor/thời gian/ghi chú, ảnh có xác thực, lịch sử, cấu hình mặc định/đổi riêng đơn, confirmation dialog và loading/error/empty/success. Hàng đợi Chấm công dùng chung component, không còn nút Admin duyệt một cấp. Portal menu chỉ thêm route cho Admin/grant quản lý hiện hành; module khác giữ guards cũ.

### File/module và ranh giới

- `backend/src/modules/attendance`: Domain workflow mới, application workflow service, controller/DTO/module, tích hợp submit/legacy response và evidence scope.
- `backend/src/database`: migration, data-source và additive entity columns; không synchronize/scaffold lại.
- `auth/domain/portal-access.ts` chỉ thêm route Web mới; `organization-access/application` cập nhật capability cho giải trình PQ3. Không đổi lifetimes/session policy/role toàn cục.
- `frontend/components/explanations-workspace.tsx`, `app/dashboard/explanations/page.tsx`, attendance page, menu và notice managed: Web mới trong scope PQ3, dùng component/theme hiện có.
- Tests: `explanation-workflow.spec.ts` mới; cập nhật fixture/metadata delegation/evidence/menu tại `employee-explanations.spec.ts`, `attendance-evidence-access.spec.ts`, `manager-channel-policy.spec.ts`. Không chạy suite theo chỉ thị Tech Lead.
- Canonical docs: PROJECT/FLOWS/IMPLEMENTATION/README và kế hoạch này. Không chỉnh `mobile/`; thay đổi có sẵn `mobile/lib/features/leave/leave_request_screen.dart` vẫn thuộc Tech Lead, không đưa vào commit.

### Kiểm tra và giới hạn PQ3

- Migration local áp dụng thành công. Typecheck/lint/build thường và build static Cloudflare đạt; không chạy automated test suite. Backend health `ok`, development Web/API tiếp tục chạy.
- API development-only: thiếu route vẫn submit và `WAITING_ROUTING`; cùng UUID retry giữ ID, đổi payload409. Admin review403, Head trước Leader403, ordinary employee scoped queue403. Default save cập nhật pending ngay, assigned Leader evidence200, outside reviewer404.
- Leader confirm giữ `SUBMITTED`/`HEAD_APPROVAL`; stale version409. Head approve có đúng actor/confirmed actor. Đơn terminal reroute409; route self reviewer400. Reroute chưa confirm bỏ người cũ khỏi queue/action và ảnh đơn riêng trả404; không dựa vào menu để chặn.
- Thu hồi Head grant chặn review403 ngay trên Mobile SID còn hợp lệ. Admin đổi Head giữ nguyên confirmation/Leader/team; Head mới reject không cần note và owner nhận inbox tiếng Việt đúng. Audit có WORKFLOW_START/ADMIN_REROUTE/LEADER_CONFIRM/HEAD_REVIEW. Legacy response giữ tuyến riêng Admin đã chỉ định, rồi đi hai bước, không dùng mặc định để ghi đè.
- Default update khi đang chờ Head giữ team/Leader/actor đã xác nhận. Report summary vẫn đếm đơn này là open blocker; với lịch development-only đã cấu hình, lock trả409 `ATTENDANCE_PERIOD_HAS_BLOCKERS`, không chốt tháng. Các lần đầu probe báo `REPORT_HAS_NO_DATA` vì lịch chưa có ngày <= hôm nay; đã bổ sung lịch riêng fixture để kiểm tra đúng blocker, không sửa reporting ngoài scope.
- Fixture `PQ3-DEV-9F61F6E5` chỉ development: năm tài khoản đã ngừng hoạt động và phiên thu hồi, bốn grant thu hồi, hai memberships kết thúc, hai team và lịch kiểm tra ngừng hoạt động. Năm đơn đã hoàn tất bằng actor thật; giữ audit/inbox/ảnh/default record, không hard-delete. Admin verification SID đã logout, không thay phiên Mobile nhân viên demo trên điện thoại. Không commit credential fixture.
- Chrome truy cập health3001 vẫn `ERR_BLOCKED_BY_CLIENT`; không thay extension/privacy/security. Chưa xác nhận authenticated workspace/selectors/responsive UI qua Chrome. HTTP200/build/API không được coi là nghiệm thu UI.
- GitNexus không có index repo này/local runner; rà search/call-site/diff, không query repo khác hoặc giả định đã chạy impact/detect_changes.
- Deploy: migration + Backend trước Web. Mobile hiện tại vẫn gửi/hiển thị `SUBMITTED`/nhận thông báo, chưa hiển thị chi tiết stage hoặc có màn quản lý mới; thuộc PQ4. Chưa kiểm chứng push thật, concurrency/DB outage và rollback trên production.

Điểm dừng hiện hành: **PQ3**. PQ4/PQ5 `NOT_IMPLEMENTED`, không tự chuyển sang app quản lý hoặc module khác.
