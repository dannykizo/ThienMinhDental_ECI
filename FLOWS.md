# Business and UI Flows

Các flow Backend/Admin Web dưới đây đã được triển khai trong Web-first MVP, trừ các giới hạn được ghi rõ. Mobile Android đã triển khai vertical slice đăng nhập và chấm công văn phòng; các flow mobile khác vẫn theo trạng thái ghi tại từng mục.

## Organization and access scope

1. Admin tạo nhân viên và chọn chi nhánh, phòng ban chính, các phòng ban kiêm nhiệm, chức vụ và quản lý trực tiếp.
2. Mỗi nhân viên có đúng một phân công chính đang hiệu lực; các phân công cũ được đóng ngày hiệu lực thay vì xóa.
3. Admin và Kế toán trưởng có phạm vi dữ liệu toàn cục theo quyền nghiệp vụ được cấp.
4. Quản lý khu vực chỉ thấy nhân viên thuộc các chi nhánh trong `user_branch_scopes`.
5. Khi nhân viên nghỉ việc, hồ sơ và tài khoản bị khóa nhưng mã nhân viên cùng lịch sử vẫn được giữ lại.

**Implementation status:** Migration `1790035200000-customer-organization-rbac` đã bổ sung HCM/HN, phân công tổ chức nhiều-nhiều, phạm vi chi nhánh và role Kế toán trưởng/Quản lý khu vực. Danh sách nhân viên và Dashboard đã áp dụng scope; các module nghiệp vụ còn lại chỉ cấp quyền mới khi truy vấn theo scope tương ứng được triển khai.

## Authentication session and device

1. Web hoặc Mobile gửi định danh thiết bị ổn định cùng thông tin đăng nhập.
2. Backend xác thực mật khẩu, thu hồi phiên đang hoạt động trước đó của tài khoản và tạo một phiên mới có hạn 30 ngày.
3. JWT chứa mã phiên; mọi request được bảo vệ phải kiểm tra đồng thời chữ ký token, tài khoản đang hoạt động và phiên chưa hết hạn/chưa bị thu hồi.
4. Đăng xuất, Admin thu hồi phiên, đăng nhập trên thiết bị mới hoặc khóa tài khoản đều làm thiết bị cũ mất quyền truy cập.
5. Backend gửi email cảnh báo tới danh sách Admin cấu hình qua SMTP. Nếu SMTP chưa cấu hình hoặc gửi lỗi, đăng nhập vẫn thành công và trạng thái được lưu trong lịch sử để Admin nhìn thấy.
6. Chỉ Admin được xem toàn bộ lịch sử đăng nhập/đăng xuất và chủ động đăng xuất thiết bị.

**Implementation status:** C2 sử dụng bảng `auth_sessions`, endpoint quản trị `/auth/admin/sessions` và trang `Tài khoản & thiết bị`. Không triển khai tự đăng ký hoặc tự khôi phục mật khẩu vì khách hàng xác nhận tài khoản do Admin cung cấp.

## Admin Web — schedule and workplace configuration

1. Admin tạo lịch gồm ngày làm, giờ bắt đầu/kết thúc, dung sai đi muộn/về sớm và số phút đủ công.
2. Admin áp dụng lịch mặc định cho một cặp chi nhánh/phòng ban theo khoảng hiệu lực. Có thể tạo ngoại lệ theo nhân viên; ngoại lệ cá nhân được ưu tiên khi Backend tính công.
3. Khi một lịch mới bắt đầu, assignment cũ đang mở được đóng vào ngày liền trước thay vì bị xóa; mọi thao tác được ghi vào lịch sử cấu hình chỉ Admin truy cập.
4. Admin cấu hình vị trí văn phòng gắn với chi nhánh hoặc địa điểm làm việc bên ngoài, với bán kính geofence và ngưỡng accuracy tối đa 50 m.
5. Khi chấm công văn phòng, Backend chỉ xét các vị trí đang hoạt động phù hợp chi nhánh của nhân viên (và địa điểm bên ngoài dùng chung), chọn vị trí gần nhất rồi lưu `office_location_id` vào sự kiện.
6. Backend cho phép check-in sớm, gắn cờ `LATE` sau dung sai 3 phút, gắn cờ `EARLY_LEAVE` trước giờ kết thúc, xác định đủ công từ 480 phút và tính OT sau giờ kết thúc.

**Implementation status:** Customer alignment C3 được lưu bằng migration `1790208000000-schedule-location-alignment`; Admin Web có cấu hình, assignment, trạng thái và lịch sử. Tọa độ HN/địa điểm bên ngoài phải được Admin nhập sau khi khách hàng cung cấp dữ liệu chính thức.

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

**Implementation status:** Backend đã có persistence, geofence/accuracy/mock-location validation và risk flags. Mobile Android xin permission khi người dùng bấm chấm công, lấy đúng một mẫu GPS, gửi device time/accuracy/mock-location signal và hiển thị trạng thái ngày từ Backend. Không theo dõi vị trí nền hoặc liên tục.

## Admin Web + Mobile API — attendance explanation and period closing

```text
REQUESTED -> SUBMITTED -> APPROVED
                       -> REJECTED
```

1. Admin filters the daily attendance view and sends a mandatory explanation request with a deadline.
2. The employee response is accepted only while the request is `REQUESTED` and before its deadline.
3. A GPS-risk response must include an image reference, capture time, latitude and longitude together. Partial evidence is rejected by Backend.
4. Admin reviews a submitted explanation. A rejection requires a reason.
5. Admin adjustments preserve old/new values, reason, actor and timestamp. No adjustment is accepted after the month is locked.
6. Admin or Chief Accountant can lock a month after incomplete check-outs and open explanations are resolved. Only Chief Accountant can reopen it with a mandatory reason.

**Web-first status:** Admin Web and Backend API are implemented. The employee response API is ready for Mobile integration; Mobile photo capture/upload and on-image timestamp/coordinate overlay are not yet implemented.

## Mobile + Admin Web — business trip

Business trip state machine:

```text
DRAFT -> ASSIGNED -> IN_PROGRESS -> COMPLETED
  |         |             |
  +------> CANCELLED <-----+
```

1. Admin tạo phiếu với khách hàng/phòng khám, địa chỉ, thời gian, nội dung và thành viên.
2. Khi `ASSIGNED`, nhân viên nhận thông báo và thấy phiếu trên Mobile.
3. Thành viên bấm Bắt đầu công tác; Backend ghi location event và chuyển phần tham gia của nhân viên sang `IN_PROGRESS`.
4. Khi kết thúc, nhân viên gửi location, ghi chú và ảnh nếu phiếu yêu cầu.
5. Attendance daily projection nhận diện ngày đó là công tác, không tự tính vắng văn phòng.

**Web-first status:** Admin Web đã tạo/giao/chuyển trạng thái phiếu; Backend kiểm tra thành viên khi nhận attendance event công tác và daily projection không tính sai thành vắng. Mobile UI, push và ảnh hiện trường chưa triển khai.

## Mobile + Admin Web — leave request

```text
DRAFT -> SUBMITTED -> APPROVED
                  -> REJECTED
SUBMITTED/APPROVED -> CANCELLED (theo quyền và cutoff được duyệt sau)
```

1. Nhân viên chọn loại nghỉ, khoảng ngày và lý do.
2. Backend kiểm tra trùng lịch và dữ liệu bắt buộc.
3. Quản lý/Admin duyệt hoặc từ chối kèm ghi chú.
4. Mobile nhận kết quả; daily attendance projection cập nhật ngày đã duyệt.

**Web-first status:** Admin Web/API đã tạo đơn, kiểm tra trùng ngày và duyệt/từ chối một cấp. Mobile UI chưa triển khai. Leave balance/cutoff policy chưa được khách hàng chốt nên không được tự phát minh.

## Admin Web — attendance adjustment

1. Admin mở bản ghi bất thường.
2. Nhập giá trị điều chỉnh và lý do bắt buộc.
3. Backend kiểm tra quyền, lưu bản mới và audit record bất biến.
4. Báo cáo dùng giá trị hiệu lực mới nhưng vẫn truy vết được giá trị cũ.

**Web-first status:** Đã triển khai authorization, lý do bắt buộc, tự chụp giá trị cũ tại Backend, record audit bất biến và giá trị hiệu lực trong báo cáo.

## Admin Web + Mobile — announcements

```text
DRAFT -> PUBLISHED -> DELIVERED -> READ
                   -> DELIVERY_PARTIAL
DRAFT -> CANCELLED
```

`DELIVERED` là trạng thái theo từng người nhận, không phải toàn bộ thông báo. Push notification chỉ là tín hiệu mở App; nội dung chính thức được tải từ Backend.

**Web-first status:** Đã triển khai audience resolution, recipient delivery state, API danh sách cá nhân và read receipt. Push/FCM và Mobile UI chưa triển khai.

## Admin Web — monthly report

1. Admin chọn tháng và bộ lọc nhân viên/phòng ban.
2. Backend tổng hợp schedule + attendance event + trip + approved leave + adjustments.
3. Hệ thống trả summary và các ngày cần đối soát.
4. Chỉ cho xuất bản công “final” khi không còn lỗi blocking; cảnh báo không blocking phải hiện trong file.

**Web-first status:** Đã triển khai đối soát theo tháng, lọc nhân viên/phòng ban, cảnh báo và Excel. Export final bị chặn khi còn `INCOMPLETE`; template nâng cao theo biểu mẫu doanh nghiệp chưa được chốt.
