# Project Definition

## Product statement

Thiên Minh Dental Workforce là hệ thống **Chấm công – Công tác – Thông báo nội bộ** cho hai khu vực vận hành TP.HCM và Hà Nội. Văn phòng TP.HCM hiện tại ở **Số 9A Phạm Cự Lượng, Phường 2, Quận Tân Bình, TP. Hồ Chí Minh**; địa chỉ/tọa độ Hà Nội được cấu hình bởi Admin khi có dữ liệu chính thức.

Sản phẩm ưu tiên xác nhận đáng tin cậy: **ai, lúc nào, ở đâu và đang làm việc theo hình thức nào**, sau đó tạo được bảng công cuối tháng sạch. Đây không phải hệ HRM/ERP nhân sự toàn diện.

## Primary users

| Nhóm | Nhu cầu chính |
|---|---|
| Admin/Người phụ trách chấm công | Quản lý tài khoản, theo dõi hôm nay, xử lý bất thường, xuất báo cáo |
| Kế toán trưởng | Đối soát báo cáo tháng và mở lại kỳ công đã chốt |
| Quản lý khu vực | Chỉ xem và xử lý nhân viên thuộc chi nhánh được phân quyền |
| Nhân viên văn phòng | Check-in/out tại văn phòng, gửi đơn, nhận thông báo |
| Nhân viên kỹ thuật | Nhận phiếu công tác, check-in/out hiện trường, ghi chú/ảnh khi được yêu cầu |

## MVP scope

1. Đăng nhập và phân quyền cơ bản.
2. Quản lý nhân viên, phòng ban, chức vụ và loại nhân viên.
3. Chấm công văn phòng bằng thời gian + GPS/geofence cấu hình được.
4. Chấm công công tác gắn với phiếu công tác.
5. Quản lý phiếu công tác, khách hàng, địa điểm và thành viên.
6. Đơn nghỉ phép với một cấp duyệt.
7. Giải trình/điều chỉnh chấm công có lý do và audit log.
8. Thông báo nội bộ + push notification + trạng thái đã đọc.
9. Dashboard và báo cáo chấm công ngày/tuần/tháng, xuất Excel.
10. KPI Lite theo tháng, không tính lương/thưởng.

## Product rules

- Nhân viên văn phòng và nhân viên kỹ thuật dùng hai luồng chấm công khác nhau nhưng cùng tạo dữ liệu attendance chuẩn hóa.
- Không GPS tracking liên tục. Vị trí chỉ được lấy tại check-in, check-out, bắt đầu và kết thúc công tác.
- Geofence văn phòng phải cấu hình được; không hard-code bán kính trong app.
- Một ngày không chấm công tại văn phòng không tự động đồng nghĩa vắng mặt nếu nhân viên có công tác hoặc nghỉ đã duyệt.
- Phát hiện mock location chỉ là tín hiệu rủi ro; hệ thống không tuyên bố chống giả GPS tuyệt đối.
- Mọi sửa đổi thủ công với bảng công phải có người sửa, thời gian, lý do, giá trị cũ và mới.
- Nhân viên chủ động tạo đơn giải trình với ngày công, loại vấn đề và nội dung; có thể chụp hoặc đính kèm một ảnh minh chứng, không bắt buộc. Admin tiếp nhận và duyệt/từ chối; lý do từ chối không bắt buộc. Duyệt giải trình không tự điều chỉnh bảng công. Không yêu cầu GPS khi tạo/chọn ảnh giải trình. Đơn cũ từ Admin được giữ tương thích nhưng không tạo yêu cầu Admin mới.
- Một nhân viên có thể thuộc nhiều phòng ban nhưng phải có đúng một phân công tổ chức chính tại một thời điểm.
- PQ1 bổ sung team thuộc đúng một phòng ban, có thể xuyên chi nhánh. Thành viên phải có phân công còn hiệu lực trong phòng đó; rút thành viên giữ lịch sử, không xóa vật lý. Mã/phòng ban của team không đổi sau khi tạo.
- Tư cách thành viên và quyền quản lý độc lập. Chỉ Admin cấp/thu hồi quyền `DEPARTMENT_HEAD` theo phòng ban hoặc `TEAM_LEADER` theo team; một người có thể nhận nhiều phạm vi. Hình thức tạm thời/chính thức độc lập với thời hạn có giới hạn/vô thời hạn. Quyền có hiệu lực từ thời điểm bắt đầu (bao gồm) đến kết thúc (không bao gồm), được kiểm tra tại Backend mỗi request.
- PQ1 chỉ mở danh sách tổ chức cơ bản trong đúng phạm vi, không gán role toàn cục `MANAGER`, không mở dữ liệu liên hệ/tài khoản hay quyền duyệt đơn. Tài khoản/hồ sơ/phạm vi ngừng hoạt động khiến quyền tạm không hiệu lực; khôi phục không phục hồi quyền đã thu hồi/hết hạn. Quyền toàn cục có sẵn được giữ nguyên, không tự bị giới hạn bởi grant mới.
- Nhân viên nghỉ việc được chuyển sang trạng thái ngừng làm việc với ngày hiệu lực và lý do bắt buộc; hồ sơ, tài khoản và phiên đăng nhập bị khóa nhưng mã nhân viên cùng lịch sử nghiệp vụ không bị xóa vật lý. Admin có thể khôi phục hồ sơ bằng một quyết định có audit.
- Phiên Mobile tối đa 30 ngày; Web tối đa 24 giờ, hết phiên sau 30 phút không hoạt động; JWT 15 phút. PQ2 cho người có grant Trưởng phòng/Leader còn hiệu lực dùng một Web + một thiết bị Mobile đồng thời; đăng nhập lại cùng kênh chỉ thay phiên kênh đó. Nhân viên thường và các role toàn cục chưa có grant giữ chính sách một phiên/tài khoản. Không tự mở ngoại lệ cho role toàn cục trước khi Tech Lead chốt.
- Khi mất grant cuối cùng, Web chỉ còn được dùng nếu có quyền toàn cục độc lập. Nếu phải trở về chính sách một phiên và có Mobile đang hoạt động, giữ Mobile, thu hồi Web ở request xác thực/refresh tiếp theo; không phục hồi phiên đã thu hồi khi được cấp lại grant. Quyền tổ chức được đánh giá mỗi request, không tin snapshot JWT. Web của Trưởng phòng/Leader hiện chỉ đọc danh sách tổ chức có scope; không tự mở quyền duyệt, báo cáo hoặc quản trị.
- Mỗi lần nhân sự đăng nhập phải tạo cảnh báo email tới địa chỉ Admin đã cấu hình. Lỗi gửi email không được chặn đăng nhập nhưng phải hiển thị trạng thái giao nhận trong Admin Web.
- Lịch làm việc do Admin cấu hình theo chi nhánh và phòng ban; ngoại lệ theo nhân viên được ưu tiên và mọi lần thay đổi cấu hình phải có lịch sử chỉ Admin xem.
- Mặc định đủ công khi tổng thời gian check-in đến check-out đạt 480 phút. Cho phép check-in sớm; đi muộn khi quá giờ bắt đầu hơn 3 phút; về trước giờ kết thúc là về sớm và thời gian sau giờ kết thúc được ghi nhận là tăng ca.
- Hệ thống hỗ trợ hai văn phòng HCM/HN và địa điểm làm việc bên ngoài. Bán kính geofence cấu hình được nhưng không vượt quá 100 m; ngưỡng sai số GPS cấu hình được nhưng không vượt quá 50 m. Không điền tọa độ giả khi chưa có dữ liệu chính thức.
- Mã phiếu công tác do Backend tự sinh theo tháng tạo phiếu với định dạng `CT-YYYYMM-NNNN`; Admin không nhập hoặc sửa mã. Khách hàng/phòng khám đã phát sinh phiếu chỉ được ngừng sử dụng, không xóa vật lý khỏi lịch sử.
- Thông báo nội bộ có thể gửi tới toàn công ty, một phòng ban hoặc một cá nhân. Backend chốt danh sách nhân viên đang hoạt động khi xuất bản; hộp thư là kênh giao nhận chính, còn push notification là kênh báo thêm có trạng thái và cơ chế gửi lại riêng.
- Cảnh cáo, đình chỉ và quyết định xử lý vi phạm phải có lý do, nội dung xử lý, ngày hiệu lực và audit. Đình chỉ bắt buộc có ngày kết thúc. Khi ban hành, nhân viên nhận ngay thông báo cá nhân yêu cầu xác nhận; hệ thống không tự trừ lương, sửa bảng công hoặc khóa tài khoản nếu chưa có chính sách riêng được duyệt.
- Chính sách nghỉ phép do Admin cấu hình theo loại nghỉ: định mức năm, số phút quy đổi một ngày, báo trước tối thiểu, cộng dồn có giới hạn, nghỉ nửa ngày/theo giờ và quyền hủy đơn đã duyệt. Backend giữ trước số dư cho đơn chờ duyệt và là nguồn duy nhất tính số dư; mọi điều chỉnh thủ công phải có lý do và audit.

## Explicit non-goals for MVP

- Payroll, bảng lương, thưởng/phạt tự động.
- Tuyển dụng, onboarding, đào tạo, hợp đồng lao động, BHXH.
- Quản lý tài sản và kho thiết bị.
- GPS tracking nền/liên tục hoặc bản đồ theo dõi nhân viên cả ngày.
- Microservices, Kubernetes, message broker hoặc workflow nhiều cấp ngoài tuyến Leader xác nhận → Trưởng phòng duyệt đã được duyệt trong kế hoạch PQ (tuyến này còn `NOT_IMPLEMENTED` tại PQ1).
- Bộ máy phân quyền tùy biến tổng quát ngoài role hiện có và quyền quản lý theo phạm vi/thời hạn đã chốt trong PQ.

## Success criteria

- Nhân viên hoàn tất check-in/out trong vài giây với phản hồi trạng thái rõ ràng.
- Công tác ngoài văn phòng không bị tính sai thành vắng mặt.
- Admin nhìn được trạng thái trong ngày và lý do bất thường.
- Cuối tháng xuất được bảng công đối soát được đến từng ngày và từng sự kiện.
- Thông báo có đối tượng nhận và thống kê đã đọc/chưa đọc.
