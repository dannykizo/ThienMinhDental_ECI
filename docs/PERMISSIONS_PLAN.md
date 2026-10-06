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
| PQ2 | Quản lý đăng nhập Web + một Mobile đồng thời; refresh/revocation và quyền hiện hành | NOT_IMPLEMENTED |
| PQ3 | Giải trình: Leader xác nhận → Trưởng phòng duyệt, bằng chứng có scope, Admin đổi tuyến trực tiếp, audit/thông báo | NOT_IMPLEMENTED |
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

## Những quyết định cần chốt trước PQ3/PQ5

1. Đơn do chính Leader/Trưởng phòng gửi: đề xuất không tự xác nhận/duyệt, cần người thay thế do Admin chỉ định.
2. Leader chỉ xác nhận hay được trả về yêu cầu bổ sung; không tự thêm quyền từ chối cuối cùng.
3. Thiếu/hết hạn người xử lý: đề xuất chờ Admin phân tuyến, không tự bỏ bước.
4. Chuyển đơn cũ đang chờ sang tuyến mới; giữ lịch sử hoàn tất, không tạo xác nhận giả.
5. Phạm vi áp dụng hai bước theo từng module; không sao chép sang công tác có vòng đời giao việc khác.

Điểm dừng: PQ1. Chưa triển khai PQ2 hoặc mở quyền duyệt mới.
