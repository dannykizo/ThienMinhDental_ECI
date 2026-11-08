# Project Definition

## Hồ sơ nhân sự và ảnh profile chung — 2026-10-20

Tech Lead duyệt overlay Admin dạng dark-glass/bento, giữ trang danh sách sáng và màu tím Thiên Minh. Chân dung lớn, dải chuyển người, tổng quan công/đơn/lịch sử ở đầu; chi tiết cuộn bên dưới, không đổi nghiệp vụ hay thêm số liệu giả. Phạm vi này thay bản overlay trắng ban đầu.

Ảnh profile là **một ảnh chung trên hồ sơ nhân viên**: nhân viên chụp/chọn từ thiết bị và lưu ảnh của chính mình trên app; Admin được thêm/thay/gỡ ảnh trên hồ sơ Admin. Không phải ảnh bằng chứng chấm công, không nhận diện khuôn mặt, không tự lấy ảnh/GPS từ lượt chấm công. Không có ảnh thì hiển thị placeholder, không dùng ảnh người khác. Đọc ảnh phải có phiên hợp lệ và đúng quyền; Backend tự xác định hồ sơ của nhân viên từ tài khoản đăng nhập. Chi tiết: [Web UI / ảnh profile](docs/WEB_UI_REFRESH.md).

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
6. Đơn nghỉ phép: Leader xác nhận → Trưởng phòng quyết định (PQ5); Admin quản trị chính sách/số dư/tuyến.
7. Giải trình/điều chỉnh chấm công có lý do và audit log.
8. Thông báo nội bộ + push notification + trạng thái đã đọc.
9. Dashboard và báo cáo chấm công ngày/tuần/tháng, xuất Excel.
10. KPI Lite theo tháng, không tính lương/thưởng.

## Product rules

- R13 (2026-10-14): Dashboard chấm công ngày và KPI Lite dùng cùng projection/summary với R12; KPI chỉ chỉ số vận hành đã có, không thêm điểm hoặc payroll. Mỗi nhân viên/ngày có cảnh báo/điều chỉnh chỉ đếm một lần; chưa checkout hôm nay có thể đang làm, không tự kết luận quên ra. Hồ sơ/đơn chờ/phiếu/thông báo trên Dashboard là trạng thái hiện tại, đơn chờ tính mọi ngày; không đồng nhất số phiếu công tác với ngày công. Quản lý chi nhánh theo phân công hiện hành inclusive ngày kết thúc và catalogue active; không có scope trả 0, không fallback toàn cục. Thông báo ngoài phạm vi/kỷ luật riêng không vào số đếm quản lý. KPI global vẫn chỉ Admin/Kế toán trưởng; Head/Leader dùng màn theo dõi scoped hiện hữu, không mở quyền KPI/Excel/chốt. Báo cáo scoped tách nghỉ cả ngày/một phần, chỉ OT đã duyệt, không lộ phòng chính ngoài grant. Source/revision/giới hạn bản chốt cũ theo R12.

- R12 (Tech Lead duyệt 2026-10-13): bốn báo cáo Excel độc lập đã triển khai: bảng công tháng; nghỉ phép/số dư; OT; giải trình/điều chỉnh. Giờ thực tế, phép và OT tách riêng; Kế toán tự tổng hợp/tính lương. Dữ liệu thiếu/chờ xử lý vẫn xuất được, ghi chú vàng/đỏ bên cạnh, không tự điền giả hoặc duyệt đơn. Chốt kỳ vẫn chặn thiếu checkout/giải trình/phép/OT chờ trên toàn công ty. Khi chốt tạo bản lưu bất biến có phiên bản cho cả bốn báo cáo, giữ nguyên kể cả nhân sự bị xóa; mở/chốt lại không thay bản cũ. Bản chốt cũ thiếu snapshot/chi tiết vẫn xuất dữ liệu hiện tại nhưng ghi rõ KHÔNG phải lịch sử đã chốt, không backfill giả. Quỹ phép là số dư năm tại thời điểm lấy dữ liệu/chốt, không phải số dư cuối tháng; đơn giao tháng không tự phân bổ phút theo tháng. Ngày phép quy đổi dùng phút/ngày chính sách tại lúc lấy dữ liệu, chưa có basis lịch sử lúc nộp đơn. Nghiệm thu Kế toán/HCNS còn PARTIAL: `docs/R12_REPORTING_ACCEPTANCE.md`.

- R9 (Tech Lead duyệt 2026-10-12): ngày có lịch nhưng là ngày nghỉ tính **0 phút phép**; ngày chưa có lịch mới dùng phút/ngày policy. Chọn lịch cá nhân/phòng chính trước khi xét weekday; cả ngày cộng từng ngày. Khoảng không có phút làm việc không tạo đơn/giữ quỹ. Áp dụng đơn mới, không tính lại đơn lịch sử. Năm chưa khởi tạo trả số dư/cộng dồn dự kiến với `initialized=false`, không ghi DB từ GET; app ghi rõ dự kiến. Quỹ/overlap theo khoảng ngày và tuyến hai bước giữ nguyên. [R9 acceptance](docs/R9_LEAVE_ACCEPTANCE.md).

- R4 hoàn thiện chức năng Đơn từ/OT ngày 2026-10-10: App gom Giải trình/Nghỉ phép/Tăng ca; tuyến OT độc lập, Leader xác nhận → Trưởng phòng quyết định, Admin dự phòng chỉ khi tuyến thiếu/không hợp lệ và không tự duyệt. Mỗi nhân viên/ngày tối đa một phiếu SUBMITTED hoặc APPROVED; bị từ chối có thể gửi lại. Ngày OT không tương lai, giờ quy đổi chính xác đến phút (1–1440), có lý do và công việc. Chỉ OT đã duyệt vào Today/báo cáo/Excel; phiếu đang chờ chặn chốt tháng và kỳ khóa chặn ghi/duyệt/đổi tuyến. Các chức năng này đã triển khai, thay trạng thái NOT_IMPLEMENTED của OT/Đơn từ trong các ghi nhận lịch sử bên dưới. R4 vẫn PARTIAL về nghiệm thu máy thật/camera/push; chưa có sửa/hủy phiếu OT hoặc hàng đợi OT offline. Xem `docs/R4_OT_FORMS_ACCEPTANCE.md`.
- R4 bổ sung ngày 2026-10-10 (thay mô tả phiếu công tác là điều kiện chấm công bên dưới): công hiện trường không cần phiếu được giao, nhân viên nhập nội dung tại check-in và công được tính ngay từ in/out hợp lệ, không có bước duyệt công hiện trường. **Cả văn phòng và hiện trường chụp ảnh mới tại check-in, không chọn thư viện; checkout không chụp**, lấy một mẫu GPS tại thao tác ra. Tọa độ checkout chỉ Admin đọc được qua API chi tiết, không trả về App/người quản lý/Kế toán trưởng hoặc Excel. Thông báo quyền riêng tư nói rõ việc lấy GPS, không theo dõi nền/liên tục. Timemark là mốc chuẩn bị chụp do Backend cấp; giờ công là giờ Backend nhận sự kiện. Ảnh/GPS không chứng nhận chống gian lận tuyệt đối. Lát cắt này đã triển khai; R4 còn PARTIAL vì phiếu OT/tuyến riêng/Đơn từ chưa triển khai.
- OT cấu hình tuyến **riêng** như nghỉ phép, không tự lấy tuyến giải trình/nghỉ phép. Gom Giải trình/Nghỉ phép/Tăng ca vào hạng mục Đơn từ trên App; không tự thêm đăng ký công tác/làm online/thời tiết/microphone chỉ vì ảnh tham khảo có. Tuyến OT, phiếu và tích hợp số phút được duyệt còn `NOT_IMPLEMENTED`.

- Bỏ PIN Admin theo yêu cầu Tech Lead/khách hàng ngày 2026-10-09. Hồ sơ chi tiết, tài khoản và phân quyền vẫn yêu cầu JWT, phiên hiện hành và role ADMIN ở Backend; không bỏ đăng nhập/RBAC/audit. Ngừng các flow khôi phục/bàn giao phụ thuộc PIN; mã và lời mời cũ bị vô hiệu hóa, lịch sử giữ nguyên. Bàn giao tự phục vụ không dùng PIN: `NOT_IMPLEMENTED`, cần task riêng. Chi tiết: `docs/ADMIN_SECURITY.md`.
- Mật khẩu do Admin chọn: 6–128 ký tự, không bắt buộc loại ký tự. R3 (2026-10-09): chỉ Admin xem tên đăng nhập và reset mật khẩu có lý do/audit; reset thu hồi mọi phiên và ngừng push, không tự khôi phục hồ sơ bị khóa. Database chỉ lưu hash bcrypt, không cho xem lại mật khẩu cũ. Nhân viên tự đổi mật khẩu vẫn `NOT_IMPLEMENTED`. Giới hạn bcrypt 72 byte so với policy 128 ký tự còn là quyết định R1 chưa chốt; R3 không tự đổi thuật toán/policy.
- Nhân viên văn phòng và nhân viên kỹ thuật dùng hai luồng chấm công khác nhau nhưng cùng tạo dữ liệu attendance chuẩn hóa.
- Không GPS tracking liên tục. Vị trí chỉ được lấy tại check-in, check-out, bắt đầu và kết thúc công tác.
- Geofence văn phòng phải cấu hình được; không hard-code bán kính trong app.
- Một ngày không chấm công tại văn phòng không tự động đồng nghĩa vắng mặt nếu nhân viên có công tác hoặc nghỉ đã duyệt.
- Phát hiện mock location chỉ là tín hiệu rủi ro; hệ thống không tuyên bố chống giả GPS tuyệt đối.
- Mọi sửa đổi thủ công với bảng công phải có người sửa, thời gian, lý do, giá trị cũ và mới.
- Nhân viên chủ động tạo đơn giải trình với ngày công, loại vấn đề và nội dung; có thể chụp hoặc đính kèm một ảnh minh chứng, không bắt buộc. PQ3: Leader được chỉ định xác nhận, sau đó Trưởng phòng được chỉ định duyệt/từ chối; ghi chú/lý do tùy chọn. Hai người xử lý phải khác nhau, không là người gửi; Admin chỉ quyết định thay khi tuyến thiếu hoặc không còn hợp lệ, theo điều chỉnh sau PQ5; không duyệt thêm quyết định đã kết thúc. Duyệt giải trình không tự điều chỉnh bảng công. Không yêu cầu GPS khi tạo/chọn ảnh. Đơn cũ từ Admin giữ tương thích nhưng không tạo yêu cầu Admin mới.
- Admin cấu hình tuyến giải trình mặc định cho từng nhân viên, gắn với một team/phòng rõ ràng; không tự chọn tuyến từ phòng chính hoặc nhiều membership. Lưu cấu hình áp dụng ngay cho các bước chưa xử lý của đơn đang mở và đơn mới. Đổi riêng một đơn không đổi tuyến mặc định. Leader đã xác nhận giữ nguyên người/thời điểm/team; chỉ được đổi Trưởng phòng đủ quyền trong phạm vi đó. Mọi thay đổi có lý do, audit và kiểm tra phiên bản chống thao tác từ dữ liệu cũ.
- Chưa có tuyến hợp lệ hoặc quyền xử lý hết hạn/thu hồi: tiếp nhận đơn và chờ Admin phân tuyến hoặc quyết định thay với lý do/audit; không tạo xác nhận Leader giả. Đơn `SUBMITTED` cũ phải qua đủ hai bước; đơn đã kết thúc giữ lịch sử cũ, không tạo xác nhận giả. Nội dung/ảnh chỉ chủ sở hữu, Admin hoặc người được chỉ định có grant hiện hành đúng phạm vi được đọc. Hộp thư thông báo nằm cùng transaction với thao tác, push thử sau commit và phụ thuộc Firebase deployment.
- Một nhân viên có thể thuộc nhiều phòng ban nhưng phải có đúng một phân công tổ chức chính tại một thời điểm.
- PQ1 bổ sung team thuộc đúng một phòng ban, có thể xuyên chi nhánh. Thành viên phải có phân công còn hiệu lực trong phòng đó; rút thành viên giữ lịch sử, không xóa vật lý. Mã/phòng ban của team không đổi sau khi tạo.
- Vòng đời danh mục tổ chức (Tech Lead duyệt trước R2, 2026-10-09): Admin thêm/sửa chi nhánh, phòng ban, chức vụ; ngừng/khôi phục có lý do và audit. Team giữ mã/phòng ban bất biến. Chỉ xóa vĩnh viễn bản ghi chưa từng được sử dụng và không có liên kết; đã dùng thì chỉ ngừng, kể cả liên kết đã được thay thế. Mặc định Web xem hiện hành, dữ liệu ngừng/hết hạn/thu hồi qua bộ lọc. Backend kiểm tra lại ảnh hưởng khi xác nhận; không tự chuyển nhân sự, đổi tuyến, khóa hồ sơ hoặc xóa lịch sử. Khôi phục phạm vi không hồi sinh quyền/phiên đã thu hồi. Dữ liệu kiểm thử development không được tự dọn lẫn dữ liệu vận hành.
- Tư cách thành viên và quyền quản lý độc lập. Chỉ Admin cấp/thu hồi quyền `DEPARTMENT_HEAD` theo phòng ban hoặc `TEAM_LEADER` theo team; một người có thể nhận nhiều phạm vi. Hình thức tạm thời/chính thức độc lập với thời hạn có giới hạn/vô thời hạn. Quyền có hiệu lực từ thời điểm bắt đầu (bao gồm) đến kết thúc (không bao gồm), được kiểm tra tại Backend mỗi request.
- PQ1 chỉ mở danh sách tổ chức cơ bản trong đúng phạm vi, không gán role toàn cục `MANAGER`, không mở dữ liệu liên hệ/tài khoản hay quyền duyệt đơn. Tài khoản/hồ sơ/phạm vi ngừng hoạt động khiến quyền tạm không hiệu lực; khôi phục không phục hồi quyền đã thu hồi/hết hạn. Quyền toàn cục có sẵn được giữ nguyên, không tự bị giới hạn bởi grant mới.
- Ngừng/khôi phục nhân viên vẫn là thao tác giữ lịch sử. Quyết định mới của Tech Lead tại R3 (2026-10-09) bổ sung **xóa vĩnh viễn chỉ Admin**, không giới hạn bởi trạng thái, dữ liệu đã phát sinh hoặc kỳ công đã chốt. Xóa hồ sơ cùng dữ liệu riêng: công/điều chỉnh/giải trình/phép/quỹ phép/kỷ luật/lịch/phân công/membership/phần tham gia công tác/thông báo riêng. Báo cáo sẽ thay đổi; HCNS lưu hồ sơ gốc ở hệ thống riêng. Cần preview ảnh hưởng mới nhất, nhập đúng mã, lý do và xác nhận; không có restore trong UI. Phiếu chung và lịch sử quyết định/audit của người khác giữ nguyên; tài khoản bị gỡ quyền/phiên/push, xóa tên đăng nhập/hash và chỉ giữ actor kỹ thuật inactive để không phá liên kết lịch sử. Không tự thay người phụ trách/quản lý/duyệt. Admin được xóa cả hồ sơ của mình, có cảnh báo mất truy cập.
- Phiên Mobile tối đa 30 ngày; Web tối đa 24 giờ, hết phiên sau 30 phút không hoạt động; JWT 15 phút. PQ2 cho người có grant Trưởng phòng/Leader còn hiệu lực dùng một Web + một thiết bị Mobile đồng thời; đăng nhập lại cùng kênh chỉ thay phiên kênh đó. Nhân viên thường và các role toàn cục chưa có grant giữ chính sách một phiên/tài khoản. Không tự mở ngoại lệ cho role toàn cục trước khi Tech Lead chốt.
- Khi mất grant cuối cùng, Web chỉ còn được dùng nếu có quyền toàn cục độc lập. Nếu phải trở về chính sách một phiên và có Mobile đang hoạt động, giữ Mobile, thu hồi Web ở request xác thực/refresh tiếp theo; không phục hồi phiên đã thu hồi khi được cấp lại grant. Quyền tổ chức được đánh giá mỗi request, không tin snapshot JWT. Web Trưởng phòng/Leader có danh sách tổ chức và giải trình hai bước theo scope/chỉ định; PQ5 bổ sung nghỉ phép hai bước và các màn vận hành chỉ đọc theo scope, không mở quyền quản trị.
- PQ4 dùng app nhân viên hiện có: lối vào xử lý giải trình theo capability hiện hành, Leader xác nhận/Trưởng phòng quyết định theo nút Backend cho phép; xem ảnh có xác thực và audit. Nhân viên xem bước/người xử lý của đơn mình. Không cấu hình tuyến trên app, không đưa quyết định quản lý vào hàng đợi offline, không tự mở quyền nghỉ phép/công tác hoặc module khác.
- Mỗi lần nhân sự đăng nhập phải tạo cảnh báo email tới địa chỉ Admin đã cấu hình. Lỗi gửi email không được chặn đăng nhập nhưng phải hiển thị trạng thái giao nhận trong Admin Web.
- Lịch làm việc do Admin cấu hình theo chi nhánh và phòng ban; ngoại lệ theo nhân viên được ưu tiên và mọi lần thay đổi cấu hình phải có lịch sử chỉ Admin xem.
- Mặc định đủ công khi thời gian check-in đến check-out đạt 480 phút, chưa tự trừ nghỉ trưa. Cho phép check-in sớm; đi muộn khi quá giờ bắt đầu hơn dung sai (mặc định 3 phút, đối chiếu cả giây); về trước giờ kết thúc trừ dung sai cấu hình là về sớm. R4 ngày 2026-10-09 thay quy tắc OT: **check-out muộn không tự được tính OT**. Nhân viên lập phiếu riêng gồm ngày OT, số giờ, lý do và công việc đã làm; Leader xác nhận → Trưởng phòng duyệt, Admin dự phòng khi tuyến thiếu/không hợp lệ; chỉ OT đã duyệt mới vào báo cáo. Phiếu/tuyến/đồng bộ báo cáo OT còn `NOT_IMPLEMENTED`; hiện Backend trả OT=0, không suy diễn từ giờ ra.
- Quyết định R4 ngày 2026-10-09: một nhân viên chỉ một lượt check-in/check-out mỗi ngày, dùng chung hạn mức văn phòng và hiện trường công tác; ngày mới tính từ 00:00 Asia/Bangkok (+07:00), giữ lịch sử cũ. App có hai lựa chọn văn phòng/hiện trường; hiện trường chụp ảnh trực tiếp, không đính ảnh. Công tác nhiều ngày phải chấm công hằng ngày, không đồng nhất check-out ngày với hoàn tất phiếu công tác. Luồng mới này còn `NOT_IMPLEMENTED`; không coi các endpoint bắt đầu/kết thúc phiếu hiện hữu là đã đạt yêu cầu R4 mới.
- Hệ thống hỗ trợ hai văn phòng HCM/HN và địa điểm làm việc bên ngoài. Bán kính geofence cấu hình được nhưng không vượt quá 100 m; ngưỡng sai số GPS cấu hình được nhưng không vượt quá 50 m. Không điền tọa độ giả khi chưa có dữ liệu chính thức.
- Mã phiếu công tác do Backend tự sinh theo tháng tạo phiếu với định dạng `CT-YYYYMM-NNNN`; Admin không nhập hoặc sửa mã. Khách hàng/phòng khám đã phát sinh phiếu chỉ được ngừng sử dụng, không xóa vật lý khỏi lịch sử.
- Thông báo nội bộ có thể gửi tới toàn công ty, một phòng ban hoặc một cá nhân. Backend chốt danh sách nhân viên đang hoạt động khi xuất bản; hộp thư là kênh giao nhận chính, còn push notification là kênh báo thêm có trạng thái và cơ chế gửi lại riêng.
- Push chỉ nhắm tới thiết bị có phiên Mobile còn hiệu lực. Provider chấp nhận gửi không đồng nghĩa điện thoại đã hiển thị/nhân viên đã đọc; banner, âm thanh và preview phụ thuộc quyền/cài đặt thiết bị. Nhắc check-out tự động chưa có policy được duyệt, giữ NOT_IMPLEMENTED tới khi Tech Lead chốt.
- Cảnh cáo, đình chỉ và quyết định xử lý vi phạm phải có lý do, nội dung xử lý, ngày hiệu lực và audit. Đình chỉ bắt buộc có ngày kết thúc. Khi ban hành, nhân viên nhận ngay thông báo cá nhân yêu cầu xác nhận; hệ thống không tự trừ lương, sửa bảng công hoặc khóa tài khoản nếu chưa có chính sách riêng được duyệt.
- Chính sách nghỉ phép do Admin cấu hình theo loại nghỉ: định mức năm, số phút quy đổi một ngày, báo trước tối thiểu, cộng dồn có giới hạn, nghỉ nửa ngày/theo giờ và quyền hủy đơn đã duyệt. Backend giữ trước số dư cho đơn chờ duyệt và là nguồn duy nhất tính số dư; mọi điều chỉnh thủ công phải có lý do và audit.

## Explicit non-goals for MVP

- Payroll, bảng lương, thưởng/phạt tự động.
- Tuyển dụng, onboarding, đào tạo, hợp đồng lao động, BHXH.
- Quản lý tài sản và kho thiết bị.
- GPS tracking nền/liên tục hoặc bản đồ theo dõi nhân viên cả ngày.
- Microservices, Kubernetes, message broker hoặc workflow nhiều cấp ngoài tuyến Leader xác nhận → Trưởng phòng duyệt của giải trình (PQ3) và nghỉ phép (PQ5).
- Bộ máy phân quyền tùy biến tổng quát ngoài role hiện có và quyền quản lý theo phạm vi/thời hạn đã chốt trong PQ.

## Success criteria

- Nhân viên hoàn tất check-in/out trong vài giây với phản hồi trạng thái rõ ràng.
- Công tác ngoài văn phòng không bị tính sai thành vắng mặt.
- Admin nhìn được trạng thái trong ngày và lý do bất thường.
- Cuối tháng xuất được bảng công đối soát được đến từng ngày và từng sự kiện.
- Thông báo có đối tượng nhận và thống kê đã đọc/chưa đọc.

## PQ5 — ma trận quyền được Tech Lead duyệt

- Nghỉ phép dùng tuyến riêng theo nhân viên/team. Admin có nút sao chép tuyến giải trình để điền form rồi lưu rõ ràng; hai tuyến không tự liên kết. Lưu cập nhật ngay bước chưa xử lý, giữ team/Leader/thời điểm xác nhận đã hoàn tất. Thiếu/mất quyền chờ Admin phân tuyến hoặc quyết định thay có lý do/audit; tuyến hợp lệ vẫn cần hai actor độc lập. Admin không tự xử lý đơn mình, đơn do mình gửi hoặc bước mình đã xác nhận; không quyết định lại đơn đã kết thúc. Lý do từ chối phép vẫn bắt buộc ≥5 ký tự.
- Leader xác nhận giữ SUBMITTED và số dư dự trữ. Head quyết định cuối kiểm tra lại quỹ phép trong transaction. Hủy đơn vẫn theo chính sách/kỳ công; đơn đang chờ cũ cần phân tuyến/xác nhận thật, terminal cũ không backfill actor.
- Leader/Trưởng phòng đọc chấm công, tổng hợp báo cáo, phần tham gia công tác và trạng thái nhận/đọc/xác nhận thông báo của nhân viên đủ điều kiện trong grant live. Leader chỉ team, Head cả phòng kể cả xuyên chi nhánh. Tổng hợp lọc trước khi tính; không lộ tổng toàn công ty/thành viên ngoài scope/GPS/ảnh công tác/body thông báo riêng tư.
- Admin quản trị công tác/thông báo, policy/quỹ phép/tuyến, chỉnh công có lý do/audit. Quyền chốt/mở lại kỳ/xuất Excel hiện hữu không đổi; scoped grant không cấp các quyền đó. Không cấp role MANAGER hoặc mở thêm kỷ luật/payroll/ERP.
- Web/app hiện tại dùng capabilities Backend; nhân viên xem tuyến đơn phép mình. Không cấu hình tuyến trên app, duyệt offline hoặc tự retry quyết định. Lifetimes và một Web + một Mobile giữ nguyên PQ2. Các giới hạn PQ1–PQ4 ở trên là lịch sử từng lát cắt, được PQ5 mở rộng đúng ma trận này.

## Điều chỉnh sau PQ5 — Admin dự phòng và workspace UX

Tech Lead duyệt cho cả nghỉ phép/giải trình: Admin chỉ quyết định thay đơn SUBMITTED khi tuyến thiếu hoặc không còn hợp lệ. Backend trả canAdminReview riêng và kiểm tra lại trong transaction; không mở bypass tuyến hợp lệ, tự duyệt đơn mình/người gửi/người đã xác nhận, REQUESTED chưa phản hồi, terminal hoặc kỳ khóa. Review cần expectedVersion + adminOverrideReason ít nhất 5 ký tự. Phép từ chối vẫn cần reviewNote hợp lệ, duyệt vẫn kiểm tra quỹ. Xác nhận đã hoàn tất giữ nguyên; không tạo xác nhận Leader giả.

Migration 1791849600000-admin-fallback-review thêm decision_method (ROUTED/ADMIN_FALLBACK, nullable cho lịch sử) và admin_override_reason vào hai bảng. Audit ADMIN_FALLBACK_REVIEW và inbox cùng transaction; push tracked sau commit. Thông báo quyết định, kể cả Head theo tuyến, ghi tên người xử lý thực tế. App hiện tại nhận qua Hộp thư và hiển thị reviewedByName; không cần đổi form/đóng gói APK trong task này. Cập nhật migration + Backend trước Web.

Hai workspace Admin tách Hàng đợi đơn/Cấu hình tuyến; thẻ tóm tắt từ dữ liệu thật, chip lọc ngang, tìm kiếm/phân trang và drawer chi tiết/timeline/audit/nút xử lý. Form lưu nằm dưới các trường thay vì bị kéo cao; CSS giới hạn trong workspace, giữ brand tím/trắng. Menu phân biệt Chính sách & quỹ phép và Xử lý nghỉ phép. Không redesign module khác hay mở thêm ERP. Bàn giao/kiểm tra tại docs/PERMISSIONS_PLAN.md.

## R11 — nghiệm thu thông báo/push (2026-10-13)

Giữ snapshot recipients employee active tại publish; phòng theo phân công hiện hành (chính/kiêm nhiệm, effective range inclusive), không tự thêm người vào sau. Đọc và xác nhận tách biệt, không tự xác nhận khi nhận push; register FCM token chỉ đúng authenticated Mobile session/device. Tech Lead cung cấp Firebase project riêng cho nghiệm thu; chưa thay SQL/NestJS stack, chưa nâng billing hoặc triển khai Firebase database/hosting. Backend18 targeted PASS, Firebase FCM-only credential/public app options đã cấu hình sau phê duyệt, debug đã cài; phone push thật chờ đăng nhập/cấp lại quyền sau reinstall và verification, [R11](docs/R11_PUSH_ACCEPTANCE.md).

## R10 — Kỷ luật cá nhân/tập thể (2026-10-13)

Tech Lead duyệt team/phòng: popup nhân sự đang hoạt động có tài khoản hoạt động, mặc định tích tất cả; Admin bỏ tick ngoại lệ trước ban hành. Phòng xét phân công chính/kiêm nhiệm hiện hành; team thuộc một phòng và được xuyên chi nhánh. Chốt danh sách được chọn, mỗi người có hồ sơ/inbox/đã đọc/xác nhận riêng. Thu hồi hàng loạt đúng danh sách này; người chuyển đi vẫn thuộc quyết định, người vào sau/người ngoại lệ không bị áp. Không thu hồi riêng từng người trong nhóm.

Giữ lịch sử quyết định và tin ban hành/thu hồi; không cho thu hồi riêng tin gắn quyết định tại Thông báo. REVOKED hiển thị đã thu hồi, không coi còn hiệu lực hoặc gọi hồ sơ là tiền án pháp lý. Không thêm trừ lương, khóa tài khoản hay sửa công. Xóa nhân sự R3 vẫn xóa hồ sơ cá nhân; master tập thể/audit giữ snapshot gốc và hồ sơ người khác, không tái tạo người đã xóa. [Bằng chứng và giới hạn R10](docs/R10_DISCIPLINARY_ACCEPTANCE.md).

## R6 — Quyết định chấm công ngày 2026-10-10

Quyết định này thay mô tả nhận bản ghi nghi vấn trước R6: chặn GPS báo mock/sai số quá ngưỡng và check-in văn phòng ngoài geofence; nhân viên gửi giải trình. Checkout không bắt buộc trong geofence nhưng vẫn cần mẫu GPS hợp lệ/không mock, chỉ Admin xem tọa độ chi tiết. Một cặp/ngày và OT đã duyệt giữ nguyên.

Điện thoại chấm công dùng khóa gắn tài khoản/phiên. Điều chỉnh được Tech Lead duyệt ngày 2026-10-10: **tự gắn thiết bị đầu tiên khi tài khoản chưa từng đăng ký khóa**, không chờ Admin; lần đầu phải do đúng nhân viên thực hiện, Backend chưa tự chứng minh danh tính người đăng ký. Có bất kỳ lịch sử khóa nào (kể cả REVOKED) thì khóa mới vẫn PENDING và chỉ Admin duyệt; yêu cầu PENDING cũ không tự được kích hoạt. Đổi máy/tạo lại khóa cần Admin thu hồi khóa cũ và duyệt mới. Sinh trắc hệ điều hành bắt buộc mỗi lượt vào/ra, không fallback PIN/không hỗ trợ thì xử lý giải trình theo quyền hiện có. Không nhận diện nhân viên bằng khuôn mặt, không lưu mẫu sinh trắc/không GPS liên tục. Theo tài khoản/phút cố định: capture 10, upload 20, event 60; 429, không tự retry. Chưa có attestation nên không tuyên bố chống GPS giả/app bị sửa tuyệt đối. Biên bản và phần chưa nghiệm thu: [R6](docs/R6_ATTENDANCE_ACCEPTANCE.md).
