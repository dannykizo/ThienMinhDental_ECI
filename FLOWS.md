# Business and UI Flows

Các flow Backend/Admin Web dưới đây đã được triển khai trong Web-first MVP, trừ các giới hạn được ghi rõ. Mobile Android đã triển khai đăng nhập/khôi phục phiên, chấm công văn phòng, giải trình có ảnh bằng chứng/hàng đợi mạng yếu, phiếu công tác, đơn nghỉ phép và hộp thư thông báo; trạng thái FCM và các giới hạn còn lại được ghi tại từng mục.

## Organization and access scope

1. Admin tạo nhân viên và chọn chi nhánh, phòng ban chính, các phòng ban kiêm nhiệm, chức vụ và quản lý trực tiếp.
2. Mỗi nhân viên có đúng một phân công chính đang hiệu lực; các phân công cũ được đóng ngày hiệu lực thay vì xóa.
3. Admin và Kế toán trưởng có phạm vi dữ liệu toàn cục theo quyền nghiệp vụ được cấp.
4. Quản lý khu vực chỉ thấy nhân viên thuộc các chi nhánh trong `user_branch_scopes`.
5. Admin chỉnh sửa hồ sơ và phân công tổ chức; phân công cũ được đóng ngày hiệu lực và vẫn xuất hiện trong lịch sử.
6. Khi nhân viên nghỉ việc, Admin phải nhập ngày hiệu lực và lý do. Backend khóa hồ sơ/tài khoản, thu hồi mọi phiên đang hoạt động và vô hiệu hóa push token nhưng giữ mã nhân viên cùng toàn bộ lịch sử nghiệp vụ.
7. Admin có thể khôi phục hồ sơ bằng ngày hiệu lực và lý do. Tài khoản được mở lại nhưng phiên cũ không được phục hồi; nhân viên phải đăng nhập lại.

**Implementation status:** Migration `1790035200000-customer-organization-rbac` đã bổ sung HCM/HN, phân công tổ chức nhiều-nhiều, phạm vi chi nhánh và role Kế toán trưởng/Quản lý khu vực. Customer review CR1 và migration `1790899200000-employee-lifecycle` bổ sung sửa hồ sơ/cơ cấu, ngừng làm việc, khôi phục, thu hồi phiên và lịch sử audit trên Admin Web. Danh sách nhân viên và Dashboard đã áp dụng scope; các module nghiệp vụ còn lại chỉ cấp quyền mới khi truy vấn theo scope tương ứng được triển khai.

## PQ1 — team and scoped management (implemented)

1. Admin tạo team trong một phòng ban. Mã duy nhất trong phòng ban; mã và phòng ban không được chuyển sau khi tạo. Thành viên có thể thuộc HCM/HN nhưng phải có phân công còn hiệu lực trong phòng ban của team.
2. Admin thêm/rút thành viên. Rút yêu cầu lý do, đóng record và giữ lịch sử; thêm lại tạo record mới. Thành viên không tự có quyền Leader, rút thành viên không tự thu hồi quyền quản lý đã cấp riêng.
3. Admin cấp Trưởng phòng theo phòng ban hoặc Leader theo team cho hồ sơ có tài khoản đang hoạt động. Người được chỉ định không bắt buộc là thành viên phạm vi đó. Hình thức tạm thời/chính thức và thời hạn/vô thời hạn là hai lựa chọn độc lập. Thời điểm có múi giờ rõ ràng; không cho quyền cùng người/vai trò/phạm vi trùng khoảng hiệu lực.
4. Chỉ Admin sửa team/cấp/thu hồi quyền/xem audit. Thu hồi yêu cầu lý do và có hiệu lực ngay cho lần yêu cầu Backend tiếp theo, kể cả JWT/phiên cũ vẫn còn hợp lệ. Ngừng team tạm ngừng hiệu lực grant của team; khôi phục team cho grant chưa hết hạn/thu hồi hoạt động lại nếu các điều kiện khác hợp lệ.
5. `/organization/mine` trả quyền hiện hành/capability; `/organization/teams` chỉ trả team trong phạm vi quản lý; `/organization/teams/:id/members` trả nhân sự cơ bản còn đủ điều kiện. Trưởng phòng đọc `/organization/departments/:id/employees` trong phòng được cấp; Leader không được mở rộng sang toàn phòng. Không lộ liên hệ, tài khoản, phòng/chi nhánh ngoài phạm vi qua các API này.
6. Phân công tổ chức/tài khoản/team/phòng ban không hợp lệ làm quyền hoặc thành viên mất hiệu lực khi đọc; giữ record để Admin xử lý, không âm thầm xóa. Audit tạo/sửa team, thêm/rút thành viên, cấp/thu hồi quyền nằm trong transaction của thao tác.

**Boundary:** Admin Web có trang `/dashboard/organization`. PQ1 không thay guard/role/luồng duyệt của module cũ. PQ2 bổ sung đăng nhập và khu vực quản lý chỉ đọc; PQ3 bổ sung giải trình hai bước ở dưới. PQ4 quản lý trên app vẫn `NOT_IMPLEMENTED`. Quyết định đã kết thúc giữ nguyên lịch sử/người duyệt.

## PQ2 — đăng nhập và khu vực quản lý

1. Backend đọc role hiện hành và cùng policy grant của PQ1. Trưởng phòng/Leader có grant `ACTIVE` được dùng một Web + một Mobile; membership hoặc chức vụ không tự cấp ngoại lệ. Role toàn cục chưa có grant giữ chính sách phiên cũ, chờ Tech Lead chốt phạm vi ngoại lệ.
2. Login khóa row tài khoản, kiểm tra tài khoản/hồ sơ còn hoạt động và chọn policy trong transaction. Với quản lý có grant, login chỉ thay cùng kênh; với chính sách một phiên, login thay toàn bộ phiên. Nhân viên thường login Web nhận `WEB_ACCESS_DENIED` trước khi thay phiên Mobile.
3. `/auth/login`, `/auth/refresh`, `/auth/me`, `/auth/admin-session` trả thêm `user.portal`: quyền vào Web, policy phiên, route mặc định, menu, nhãn phạm vi và grant hiện hành đã lọc metadata quản trị. Không thêm role toàn cục vào tài khoản hay JWT.
4. Web đưa quản lý mới tới `/dashboard/managed`; chỉ menu/phạm vi Backend cho phép. Danh sách dùng API tổ chức cơ bản của PQ1, không dùng API nhân viên đầy đủ hay Dashboard số liệu. Leader chỉ team; Trưởng phòng được xem nhân sự phòng và team thuộc phòng.
5. Mỗi request xác thực/refresh kiểm tra lại điều kiện grant. Mất grant cuối cùng làm Web bị thu hồi nếu không còn quyền Web độc lập; Mobile nhân viên được giữ. Người có role Web độc lập vẫn phải trở về một phiên nếu không còn grant: giữ Mobile nếu đang hoạt động, nếu chỉ có Web thì giữ Web. Có grant khác còn hiệu lực thì không hạ policy.
6. Logout, Admin thu hồi hoặc reuse refresh token chỉ thu hồi SID liên quan, không ngắt kênh kia. Ngừng hồ sơ/tài khoản vẫn thu hồi tất cả. Refresh không kéo dài hạn phiên tuyệt đối; Web idle timeout không đổi.
7. Web kiểm tra lại portal khi đổi trang hoặc trở lại cửa sổ. Không polling/heartbeat làm kéo dài idle. Lỗi DB được trả như lỗi server, không ngụy trang thành `401`; lỗi mạng/server khi refresh Web không được coi là bằng chứng phiên bị thu hồi.

**Giới hạn:** Quyền Backend hiệu lực ngay ở request tiếp theo; menu/danh sách đang mở là snapshot cho tới khi kiểm tra/tải lại. Không có quản lý/duyệt mới trên Mobile, không sửa tuyến duyệt hoặc module nghiệp vụ cũ.

## Authentication session and device

1. Web hoặc Mobile gửi định danh thiết bị ổn định cùng thông tin đăng nhập.
2. Backend xác thực mật khẩu, chọn chính sách một phiên hoặc Web + Mobile theo PQ2 rồi tạo phiên Web tối đa 24 giờ hoặc Mobile tối đa 30 ngày; không ảnh hưởng kênh kia khi được cấp ngoại lệ.
3. JWT truy cập chứa mã phiên và sống 15 phút. Web giữ refresh token trong cookie HttpOnly; Mobile giữ refresh token trong secure storage. Refresh token được xoay vòng sau mỗi lần cấp access token mới.
4. Mọi request được bảo vệ phải kiểm tra đồng thời chữ ký token, tài khoản đang hoạt động và phiên chưa hết hạn/chưa bị thu hồi. Web hết phiên sau 30 phút không hoạt động.
5. Đăng xuất, Admin thu hồi phiên, đăng nhập mới cùng phạm vi thay thế hoặc phát hiện refresh token cũ bị dùng lại làm phiên liên quan mất truy cập. Khóa tài khoản thu hồi mọi phiên.
6. Backend gửi email cảnh báo tới danh sách Admin cấu hình qua SMTP. Nếu SMTP chưa cấu hình hoặc gửi lỗi, đăng nhập vẫn thành công và trạng thái được lưu trong lịch sử để Admin nhìn thấy.
7. Chỉ Admin được xem toàn bộ lịch sử đăng nhập/đăng xuất và chủ động đăng xuất thiết bị.

**Implementation status:** C2 sử dụng bảng `auth_sessions`, endpoint `/auth/refresh`, endpoint quản trị `/auth/admin/sessions` và trang `Tài khoản & thiết bị`. Mobile chỉ xóa token khi Backend từ chối phiên; lỗi mạng tạm thời giữ nguyên phiên để người dùng thử khôi phục lại. Khi Admin thu hồi thiết bị, tài khoản đăng nhập trên máy khác hoặc hồ sơ ngừng hoạt động, app quay về đăng nhập và hiển thị rõ nhóm nguyên nhân thay vì im lặng xóa phiên. Mobile CR7 phân biệt thiết bị mất mạng với Backend timeout/tạm ngắt, giữ nguyên credential cho mọi lỗi có thể thử lại và hiển thị banner vận hành toàn cục; chỉ phản hồi xác thực `401/403` hợp lệ mới kết thúc phiên. Phiên bản/build ứng dụng được đọc từ package metadata và hiển thị ở màn đăng nhập cùng trang Hôm nay. Không triển khai tự đăng ký hoặc tự khôi phục mật khẩu vì tài khoản do Admin cung cấp.

## Admin Web — schedule and workplace configuration

1. Admin tạo lịch gồm ngày làm, giờ bắt đầu/kết thúc, dung sai đi muộn/về sớm và số phút đủ công.
2. Admin áp dụng lịch mặc định cho một cặp chi nhánh/phòng ban theo khoảng hiệu lực. Có thể tạo ngoại lệ theo nhân viên; ngoại lệ cá nhân được ưu tiên khi Backend tính công.
3. Khi một lịch mới bắt đầu, assignment cũ đang mở được đóng vào ngày liền trước thay vì bị xóa; mọi thao tác được ghi vào lịch sử cấu hình chỉ Admin truy cập.
4. Admin cấu hình vị trí văn phòng gắn với chi nhánh hoặc địa điểm làm việc bên ngoài. Có thể lấy một mẫu tọa độ từ thiết bị hoặc chọn/kéo điểm trên bản đồ; bán kính geofence tối đa 100 m và ngưỡng accuracy tối đa 50 m.
5. Khi chấm công văn phòng, Backend chỉ xét các vị trí đang hoạt động phù hợp chi nhánh của nhân viên (và địa điểm bên ngoài dùng chung), chọn vị trí gần nhất rồi lưu `office_location_id` vào sự kiện.
6. Backend cho phép check-in sớm, gắn cờ `LATE` sau dung sai 3 phút, gắn cờ `EARLY_LEAVE` trước giờ kết thúc, xác định đủ công từ 480 phút và tính OT sau giờ kết thúc.

**Implementation status:** Customer alignment C3 được lưu bằng migration `1790208000000-schedule-location-alignment`; Customer review CR2 dùng migration `1790985600000-geofence-radius-alignment` để nâng giới hạn bán kính lên 100 m. Admin Web có cấu hình, assignment, trạng thái, lịch sử, bản đồ tương tác và lấy một mẫu vị trí thiết bị khi Admin chủ động bấm. Tọa độ HN/địa điểm bên ngoài phải được Admin nhập hoặc lấy tại thiết bị sau khi khách hàng xác nhận; hệ thống không theo dõi vị trí liên tục.

## Shared attendance state

Nguồn trạng thái nằm ở Backend; Web và Mobile chỉ hiển thị kết quả API.

```text
NOT_CHECKED_IN
  -> CHECKED_IN
  -> CHECKED_OUT

Exceptional review flags (orthogonal):
LATE | EARLY_LEAVE | OUTSIDE_GEOFENCE | LOW_ACCURACY | MOCK_LOCATION_SIGNAL
```

Không dùng `ABSENT` như một nút trong event flow. `ABSENT`, `LEAVE` và `BUSINESS_TRIP` là kết quả tổng hợp ngày sau khi đối chiếu lịch làm việc, đơn nghỉ và phiếu công tác.

## Mobile — office attendance

1. Nhân viên mở Home; App lấy trạng thái attendance hôm nay.
2. Khi bấm Check-in/out, App xin quyền và lấy một GPS sample kèm accuracy.
3. App gửi event, thời gian thiết bị, vị trí và device signals lên Backend.
4. Backend dùng server time, office configuration và schedule để đánh giá.
5. Mobile hiển thị một trong các UI state: `SUBMITTING`, `SUCCESS`, `REVIEW_REQUIRED`, `FAILED`.
6. Không giữ foreground/background location sau khi request hoàn tất.

**Implementation status:** Backend đã có persistence, geofence/accuracy/mock-location validation và risk flags. Mobile Android xin permission khi người dùng bấm chấm công, lấy đúng một mẫu GPS, gửi device time/accuracy/mock-location signal và hiển thị trạng thái ngày từ Backend. Sau mỗi sự kiện thành công, Backend trả vị trí văn phòng được đối chiếu, khoảng cách đo được, bán kính cấu hình và ngưỡng accuracy; Mobile chỉ trình bày kết quả này, không tự tính geofence và không hiển thị tọa độ chi tiết. Không theo dõi vị trí nền hoặc liên tục.

## Admin Web + Mobile API — attendance explanation and period closing

```text
Employee creates -> SUBMITTED (WAITING_ROUTING if no valid route)
                 -> Leader confirmation -> Head approval -> APPROVED / REJECTED
Legacy only: REQUESTED -> SUBMITTED
```

1. Employee proactively creates an explanation with a work date, issue type and content. Backend derives employee identity from the authenticated account; submissions go directly to `SUBMITTED`, without an Admin deadline.
2. Evidence is optional for every issue type. Employee may take a photo or attach one JPEG/PNG/WebP image (maximum 5 MB). Gallery images do not claim a capture time; neither path requests GPS. Backend accepts only uploaded images belonging to the employee.
3. App queues unsent content/images in private storage when the network is weak, scoped to the submitting account. A stable submission UUID makes retry idempotent; changed content under the same UUID is rejected. Existing open employee/date/issue duplicates and new submissions in locked periods remain blocked.
4. Admin configures each employee's default team/Leader/Head route; saving applies directly to unfinished steps of pending requests and future submissions. Membership must be eligible and both scoped grants active when configured. No implicit selection from the primary department. Per-request reroute leaves the default unchanged.
5. The assigned Leader confirms only, with an optional note. The assigned Head then approves/rejects with an optional note/reason. Actors are different and neither is the owner; a Head cannot bypass confirmation. Admin sees actors/history and reroutes, not approval override. Live grants and scope are checked on each list/evidence/action; unrelated managers have no access.
6. Missing/ineligible routing waits for Admin, never skips a step. Reroute requires a reason and expected version. Completed confirmation keeps its actor/time/team; only the unfinished Head may change within that department. Defaults may change for future requests but cannot rewrite completed steps on existing ones; invalid cross-scope replacement aborts the transaction.
7. Audit and inbox notifications are written in the operation transaction. Push is attempted after commit through the existing tracked sender; failures do not undo the decision. Notifications do not grant access to the referenced request. Approval does not automatically adjust attendance.
8. Admin adjustments preserve old/new values, reason, actor and timestamp. No adjustment is accepted after the month is locked.
9. Admin or Chief Accountant can lock a month after incomplete check-outs and open explanations are resolved. Waiting routing/confirmation/Head all remain `SUBMITTED`, blocking period closing and duplicate submissions. Only Chief Accountant can reopen with a mandatory reason.

**Implementation status:** PQ3 migration `1791676800000-explanation-two-step-workflow` bổ sung tuyến mặc định, snapshot tuyến/phiên bản/bước và người xác nhận. Đơn đang chờ cũ chuyển sang chờ tuyến hoặc chờ nhân viên phản hồi, không tạo người xử lý giả; đơn hoàn tất giữ nguyên. Web `/dashboard/explanations` cho Admin/Leader/Trưởng phòng, hàng đợi tại Chấm công dùng cùng component. API thêm `routes`, `routing-options`, `:id/reroute`, `:id/confirm`, `:id/history`; `:id/review` chỉ Trưởng phòng được chỉ định sau xác nhận, có `expectedVersion`. Mobile cũ vẫn gửi/hàng đợi được nhờ status tương thích và metadata bổ sung; UI quản lý/bước chi tiết trên app thuộc PQ4, chưa triển khai. Yêu cầu `REQUESTED` cũ giữ chủ sở hữu/hạn và tuyến chỉ định khi phản hồi. Ảnh vẫn JPEG/PNG/WebP 5 MB, không ghi đè, chỉ owner/Admin/người được chỉ định có grant live đọc. Nhiều ảnh/PDF, sửa/hủy đơn và trả về bổ sung chưa triển khai.

## Mobile + Admin Web — business trip

Business trip state machine:

```text
DRAFT -> ASSIGNED -> IN_PROGRESS -> COMPLETED
  |         |             |
  +------> CANCELLED <-----+
```

1. Admin tạo phiếu với khách hàng/phòng khám, địa chỉ, thời gian, nội dung và thành viên. Backend cấp mã tuần tự theo tháng tạo phiếu ở định dạng `CT-YYYYMM-NNNN`; Admin không nhập mã.
2. Khi `ASSIGNED`, nhân viên nhận thông báo và thấy phiếu trên Mobile.
3. Mỗi phiếu có một người phụ trách thuộc danh sách thành viên. Admin chỉ được sửa nội dung và thành viên khi phiếu còn `DRAFT`.
4. Thành viên bấm Bắt đầu công tác; Backend kiểm tra đúng người được giao, lưu GPS vào attendance event và chuyển riêng phần tham gia của người đó sang `IN_PROGRESS`.
5. Khi kết thúc, thành viên gửi GPS, ghi chú và ảnh nếu phiếu yêu cầu. Backend chỉ chuyển toàn phiếu sang `COMPLETED` khi mọi thành viên đều hoàn tất.
6. Admin có thể hủy phiếu chưa hoàn tất nhưng phải nhập lý do. Mọi lần tạo, sửa, giao, hủy, bắt đầu và hoàn tất đều có audit.
7. Attendance daily projection nhận diện ngày đó là công tác, không tự tính vắng văn phòng.
8. Admin lọc danh sách người phụ trách/thành viên theo phòng ban. Người phụ trách luôn phải nằm trong danh sách thành viên; Backend tiếp tục kiểm tra nhân viên đang hoạt động.
9. Admin xem, tìm kiếm, thêm, sửa, ngừng sử dụng hoặc khôi phục khách hàng/phòng khám. Ngừng sử dụng chỉ loại khách hàng khỏi lựa chọn phiếu mới; phiếu cũ và audit được giữ nguyên.

**Implementation status:** Customer alignment C5 đã triển khai Admin Web, Backend API và Mobile Android cho tạo/giao phiếu, danh sách phân công, trạng thái từng thành viên, GPS một lần lúc bắt đầu/kết thúc, ghi chú và ảnh hiện trường bắt buộc theo cấu hình. Customer review CR3 và migration `1791072000000-business-trip-customer-management` bổ sung mã phiếu tự sinh an toàn khi tạo đồng thời, lọc nhân sự theo phòng ban và danh bạ khách hàng có trạng thái/audit. Mobile dùng mã do Backend cấp, hiển thị khách hàng/phòng khám, địa chỉ và liên hệ do Backend trả về, đồng thời phân biệt nhân viên hiện tại có phải người phụ trách hay không; app không có quyền sửa danh bạ hoặc thành viên phiếu. Ảnh development được lưu local qua adapter riêng và Admin Web mở được ảnh có xác thực. Do W25–W29 chưa có quyết định khách hàng, luồng chưa hỗ trợ nhiều địa điểm, chữ ký khách hàng hoặc nhiều cấp duyệt.

## Mobile + Admin Web — leave request

```text
SUBMITTED -> APPROVED
          -> REJECTED
          -> CANCELLED
APPROVED  -> CANCELLED (chỉ khi chính sách cho phép)
```

1. Admin cấu hình từng chính sách nghỉ: định mức, quy đổi phút/ngày, cộng dồn, báo trước, hình thức cả ngày/nửa ngày/theo giờ và quyền hủy đơn đã duyệt.
2. Admin khởi tạo số dư theo năm. Số dư năm mới lấy định mức tại thời điểm khởi tạo và phần còn lại năm trước trong giới hạn cộng dồn; điều chỉnh tăng/giảm phải có lý do và được lưu bất biến.
3. Nhân viên chọn một chính sách đang hoạt động, thời lượng được chính sách cho phép và lý do. Backend tính số phút từ lịch làm việc; khi không có lịch mới dùng số phút/ngày của chính sách.
4. Backend kiểm tra báo trước, nhân viên đang hoạt động, kỳ công chưa khóa, không trùng đơn và đủ số dư. Đơn `SUBMITTED` giữ trước số dư để tránh gửi vượt quỹ.
5. Admin/Manager duyệt một cấp hoặc từ chối; lý do từ chối là bắt buộc. Backend kiểm tra lại số dư trong transaction khi duyệt.
6. Nhân viên có thể hủy đơn chờ duyệt. Đơn đã duyệt chỉ hủy được khi chính sách cho phép và kỳ công chưa khóa; số dư được giải phóng theo trạng thái mới.
7. Mọi lần gửi, duyệt/từ chối, hủy, đổi chính sách và điều chỉnh số dư đều có audit. Đơn đang chờ là blocker khi chốt kỳ công.
8. Mobile hiển thị số dư và kết quả do Backend trả về; báo cáo ngày phân biệt nghỉ cả ngày với nghỉ một phần.

**Implementation status:** Customer review CR6 và migration `1791331200000-leave-policies-balances` đã triển khai chính sách nghỉ cấu hình được, số dư theo năm/cộng dồn, điều chỉnh có audit, nghỉ nửa ngày/theo giờ và hủy đơn theo policy trên Backend, Admin Web và Mobile Android. Bốn loại nghỉ cũ được tạo thành chính sách tương thích với theo dõi số dư mặc định tắt, nên dữ liệu cũ không bị tự động trừ quỹ. File minh chứng, cấp phép tự động theo thâm niên và quy trình duyệt nhiều cấp vẫn ngoài phạm vi.

## Admin Web — attendance adjustment

1. Admin mở bản ghi bất thường.
2. Nhập giá trị điều chỉnh và lý do bắt buộc.
3. Backend kiểm tra quyền, lưu bản mới và audit record bất biến.
4. Báo cáo dùng giá trị hiệu lực mới nhưng vẫn truy vết được giá trị cũ.

**Web-first status:** Đã triển khai authorization, lý do bắt buộc, tự chụp giá trị cũ tại Backend, record audit bất biến và giá trị hiệu lực trong báo cáo.

## Admin Web + Mobile — announcements

```text
DRAFT -> PUBLISHED -> WITHDRAWN
  |
  +----> CANCELLED

Per recipient: DELIVERED -> READ -> ACKNOWLEDGED (chỉ tin quan trọng)
```

1. Chỉ Admin tạo và sửa bản nháp, chọn toàn công ty, đúng một cá nhân hoặc một phòng ban rồi xuất bản.
2. Khi xuất bản, Backend chốt danh sách nhân viên đang hoạt động. Đối tượng toàn công ty lấy toàn bộ nhân viên đang hoạt động; đối tượng phòng ban dùng mọi phân công tổ chức còn hiệu lực, không chỉ projection phòng ban chính.
3. Mở thông báo ghi `READ`; tin quan trọng chỉ hoàn tất khi nhân viên chủ động xác nhận và Backend ghi `ACKNOWLEDGED`.
4. Admin xem toàn bộ trạng thái. Trưởng phòng chỉ xem nhân viên có phân công hiện hành trỏ tới mình tại `manager_employee_id`.
5. Admin có thể thu hồi tin đã đăng; nội dung không còn xuất hiện trong `/announcements/mine`, nhưng lịch sử người nhận và audit được giữ nguyên.
6. Sau khi inbox được tạo thành công, Backend gửi push và lưu trạng thái riêng cho từng người nhận. Push lỗi, chưa cấu hình hoặc chưa có thiết bị không làm rollback inbox; Admin xem được trạng thái và gửi lại khi thông báo còn đang phát hành.

**Trạng thái hiện tại:** Customer review CR4 đã triển khai Admin Web, Backend API và hộp thư Mobile cho nháp/chỉnh sửa/xuất bản/thu hồi, đối tượng toàn công ty/cá nhân/phòng ban, badge chưa đọc, chi tiết tin, xác nhận tin quan trọng, thống kê người chưa đọc/chưa xác nhận và phạm vi Trưởng phòng. API hộp thư trả phạm vi cùng tên đối tượng; Mobile gắn nhãn rõ `TOÀN CÔNG TY`, phòng ban hoặc cá nhân và giải thích phạm vi trong chi tiết thay vì suy đoán từ nội dung. Backend lưu trạng thái push theo từng người nhận, cung cấp chẩn đoán cấu hình/thiết bị và cho Admin gửi lại; Mobile báo rõ tình trạng thiếu cấu hình, quyền thông báo hoặc token. Môi trường chỉ gửi push thật sau khi cấu hình Firebase deployment. File/ảnh, mức khẩn cấp, hẹn giờ, thời hạn hiển thị và lưu trữ tự động vẫn là `NOT_IMPLEMENTED` do W39 chưa được khách hàng giải thích.

## Admin Web + Mobile Inbox — disciplinary actions

```text
DRAFT -> ISSUED -> REVOKED
```

1. Chỉ Admin lập và chỉnh sửa quyết định nháp với một trong ba hình thức: cảnh cáo, đình chỉ hoặc xử lý vi phạm.
2. Mọi quyết định có nhân viên, lý do, nội dung xử lý và ngày hiệu lực. Đình chỉ bắt buộc có ngày kết thúc không trước ngày bắt đầu.
3. Khi ban hành, Backend chốt nội dung và tạo trong cùng transaction một thông báo cá nhân bắt buộc xác nhận. Sau commit, Backend thử gửi push; lỗi push không làm mất quyết định hoặc inbox.
4. Quyết định đã ban hành không được sửa hoặc xóa. Admin chỉ có thể thu hồi với lý do bắt buộc; lịch sử và thông báo cũ vẫn được giữ, đồng thời nhân viên được báo về việc thu hồi nếu tài khoản còn hoạt động.
5. CR5 chỉ quản lý hồ sơ quyết định và giao nhận thông báo. Không tự động trừ lương, sửa bảng công, đổi trạng thái việc làm hoặc khóa tài khoản vì các hệ quả đó chưa có policy khách hàng được duyệt.

**Trạng thái hiện tại:** Customer review CR5 đã triển khai migration, API chỉ Admin, audit bất biến, trang quản trị và thông báo Mobile qua Hộp thư/push hiện có. `/announcements/mine` trả thêm trường cấu trúc (`source`, `disciplinaryActionType`, `disciplinaryEffectiveFrom/To`, `disciplinaryTitle`, `disciplinaryRevoked`) để Mobile phân loại trực tiếp; quyết định kỷ luật hiển thị bằng thẻ/banner cảnh báo riêng theo loại, kèm khoảng hiệu lực và bắt buộc xác nhận, thay vì suy diễn từ tiêu đề/nội dung. Nhân viên vẫn đăng nhập được để đọc và xác nhận quyết định.

## Admin Web — monthly report

1. Admin chọn tháng và bộ lọc nhân viên/phòng ban.
2. Backend tổng hợp schedule + attendance event + trip + approved leave + adjustments.
3. Hệ thống trả summary và các ngày cần đối soát.
4. Chỉ cho xuất bản công “final” khi không còn lỗi blocking; cảnh báo không blocking phải hiện trong file.

**Trạng thái CR7:** Đã triển khai đối soát theo tháng, lọc nhân viên/phòng ban, tổng giờ làm/giờ chuẩn/OT, cảnh báo và Excel gồm sheet tổng hợp nhân viên + chi tiết ngày. Backend chặn khóa kỳ khi còn ngày `INCOMPLETE`, giải trình đang mở hoặc đơn nghỉ đang chờ; Admin Web dùng cùng summary blocker nên không tự suy diễn. Biểu mẫu payroll đặc thù doanh nghiệp vẫn ngoài phạm vi.

## Admin Web — production operations

1. Chỉ Admin truy cập tổng quan vận hành và audit tập trung.
2. Backend chỉ trả chỉ số kỹ thuật an toàn: phiên hoạt động, workflow tồn, lỗi email/push, migration, release và uptime; không trả secret hay đường dẫn nhạy cảm.
3. Mỗi request production có request ID và log metadata tối thiểu để tra lỗi; body, token, GPS và mật khẩu không được ghi log.
4. Trước mỗi deploy đang vận hành phải tạo backup; deploy chỉ hoàn tất sau khi health check đạt yêu cầu. Restore được kiểm tra trong database tạm biệt lập.

## Admin Web — UX và khả năng mở rộng danh sách

1. Dashboard chỉ dùng số liệu Backend và dẫn thẳng tới hàng đợi chấm công, nghỉ phép hoặc công tác; không tạo số liệu minh họa.
2. Thao tác có thể đổi trạng thái nghiệp vụ phải mở hộp thoại mô tả hậu quả. Lý do bắt buộc tiếp tục do Backend kiểm tra; đóng hộp thoại không phát sinh request.
3. Danh sách nhân viên tìm kiếm và phân trang tại Backend. Request nội bộ không truyền `page` tiếp tục nhận toàn bộ mảng để không đổi contract của các bộ chọn nhân sự hiện hữu.
4. Audit vận hành phân trang tại Backend. Các danh sách nghiệp vụ đang cần tổng hợp toàn bộ để tính metric giữ contract hiện tại và phân trang tại client.
5. Menu mobile dùng drawer có backdrop; focus bàn phím, reduced motion, loading/empty/error/success state phải sử dụng component thống nhất.

**Trạng thái CR8:** Đã triển khai trên Admin Web và hai endpoint danh sách liên quan. Không thay đổi state machine, authorization hay schema database.

### Final Web polish (CR9)

1. Thanh điều hướng và Dashboard mô tả phạm vi dữ liệu theo role: Admin/Kế toán trưởng xem toàn bộ chi nhánh; Quản lý chỉ thấy nhãn phạm vi được phân quyền. Đây là nhãn giải thích quyền hiện có, không tạo bộ lọc chi nhánh giả ở Frontend.
2. Các luồng chọn nhân viên dài cho phép tìm theo mã/họ tên và lọc phòng ban từ assignment Backend trả về. Nhân viên ngừng hoạt động không được đưa vào lựa chọn nghiệp vụ mới.
3. Biểu mẫu hồ sơ nhân viên và phiếu công tác cảnh báo trước khi điều hướng nội bộ, tải lại trang hoặc đóng phần chỉnh sửa đang có thay đổi chưa lưu.
4. Admin có thể mở drawer chi tiết audit để xem metadata cùng giá trị trước/sau; các trường có tên nhạy cảm được che ở lớp hiển thị, audit bất biến trong Backend không bị sửa.

**Trạng thái CR9:** Đã triển khai hoàn toàn ở Admin Web, không thêm migration và không thay đổi business rule/API contract.
