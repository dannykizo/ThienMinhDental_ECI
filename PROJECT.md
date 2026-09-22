# Project Definition

## Product statement

Thiên Minh Dental Workforce là hệ thống **Chấm công – Công tác – Thông báo nội bộ** cho Chi nhánh TP.HCM tại **Số 9A Phạm Cự Lượng, Phường 2, Quận Tân Bình, TP. Hồ Chí Minh**.

Sản phẩm ưu tiên xác nhận đáng tin cậy: **ai, lúc nào, ở đâu và đang làm việc theo hình thức nào**, sau đó tạo được bảng công cuối tháng sạch. Đây không phải hệ HRM/ERP nhân sự toàn diện.

## Primary users

| Nhóm | Nhu cầu chính |
|---|---|
| Admin/Người phụ trách chấm công | Quản lý tài khoản, theo dõi hôm nay, xử lý bất thường, xuất báo cáo |
| Quản lý chi nhánh | Giao công tác, duyệt nghỉ/giải trình, gửi thông báo, xem KPI Lite |
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

## Explicit non-goals for MVP

- Payroll, bảng lương, thưởng/phạt tự động.
- Tuyển dụng, onboarding, đào tạo, hợp đồng lao động, BHXH.
- Quản lý tài sản và kho thiết bị.
- GPS tracking nền/liên tục hoặc bản đồ theo dõi nhân viên cả ngày.
- Microservices, Kubernetes, message broker hoặc workflow nhiều cấp.
- Đa chi nhánh và phân quyền động phức tạp.

## Success criteria

- Nhân viên hoàn tất check-in/out trong vài giây với phản hồi trạng thái rõ ràng.
- Công tác ngoài văn phòng không bị tính sai thành vắng mặt.
- Admin nhìn được trạng thái trong ngày và lý do bất thường.
- Cuối tháng xuất được bảng công đối soát được đến từng ngày và từng sự kiện.
- Thông báo có đối tượng nhận và thống kê đã đọc/chưa đọc.

