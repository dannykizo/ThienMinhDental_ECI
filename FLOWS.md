# Business and UI Flows

Dashboard pastel (2026-10-20): giữ bốn chỉ số và hàng đợi hiện hữu, thêm biểu đồ 7 ngày/tháng đến ngày Backend hiện tại, bảng tối đa 5 người có giờ vào/ra hôm nay và vòng văn phòng/hiện trường/chưa phân loại. Các khối chi tiết chỉ đọc document báo cáo có sẵn khi phiên Admin/Kế toán trưởng có quyền báo cáo; quản lý phạm vi không gọi document toàn công ty. Biểu đồ đếm mỗi dòng nhân viên/ngày có giờ vào hoặc ra, không tự tính đủ công/vắng/OT. Đơn chờ vẫn mọi ngày, không thay theo bộ chọn biểu đồ. Báo cáo & Excel mở module báo cáo, không tự xuất/chốt. Có loading/error/retry, tooltip focus, cuộn trong biểu đồ/bảng, reduced-motion. Chi tiết và giới hạn nghiệm thu: [Web UI](docs/WEB_UI_REFRESH.md).

Danh sách nhân viên (2026-10-20): hiển thị tối đa 10 hồ sơ/trang; nút Trang trước/Trang sau có ở cả phía trên và dưới bảng, dùng chung trạng thái trang. Tìm kiếm vẫn thực hiện trên toàn bộ phạm vi được cấp, gửi tìm kiếm/xóa lọc quay về trang 1; chuyển trang giữ từ khóa đã áp dụng, không tự áp dụng nội dung chưa bấm tìm. Khi kết quả chỉ có một trang thì ẩn bộ chuyển trang. Overlay vẫn dùng danh sách phù hợp bộ lọc, không bị giới hạn bởi 10 hàng của bảng.

Tiểu tiết overlay nhân sự (2026-10-20): giữ tìm nhanh/phím tắt/scrollspy và kính tối của Tech Lead. Vòng công chỉ thể hiện ngày đủ công/ngày theo lịch; văn phòng/hiện trường/nghỉ là các chỉ số độc lập, không phải bộ lọc hoặc các phần của vòng. Khi chưa có cảnh báo chỉ ghi “Chưa phát hiện cảnh báo”, không khẳng định dữ liệu hoàn hảo. Copy mã/tài khoản có trạng thái chờ, chỉ xác nhận sau Clipboard API thành công; lỗi có hướng dẫn chép thủ công, không tự gửi lại. Tìm nhanh mobile thu gọn thành nút cạnh avatar và mở ô nhập khi cần; Esc đóng tìm kiếm trước, giữ hồ sơ. Không đổi số liệu hoặc rule Backend. Xem [ghi nhận UI](docs/WEB_UI_REFRESH.md).

Motion hồ sơ nhân sự (2026-10-20): mở nền/khung rồi reveal card có nhịp; trước/sau cho hồ sơ cũ rời 200 ms, khóa nội dung đang chuyển, sau đó đổi id/header và tải dữ liệu mới. Esc/X hủy chuyển đang chờ và đóng; giảm chuyển động bỏ hiệu ứng/chờ. Đây chỉ là state presentation, không trì hoãn hoặc tự gửi thao tác nghiệp vụ. Chi tiết [Web UI V3](docs/WEB_UI_REFRESH.md).

## Ảnh profile và overlay bento — cập nhật 2026-10-20

Phần này bổ sung API/schema/app cho ảnh profile, thay giới hạn presentation-only trong mô tả overlay ban đầu bên dưới. Danh sách Admin vẫn sáng; hồ sơ là lớp kính tối, nền danh sách mờ, chân dung/bento tổng quan phía trên, bảy phần chi tiết cuộn liên tục. Dải avatar và trước/sau giữ kết quả tìm kiếm; Esc/X đóng, header cố định, mobile một cột. Không thêm chỉ số nghiệp vụ suy diễn.

App: Hôm nay → nút avatar cạnh logo → Ảnh cá nhân → Chụp ảnh/Thư viện → xem trước → Lưu. Admin: Nhân viên → mở hồ sơ → Thêm/Thay ảnh → xem trước → Lưu ảnh; Gỡ ảnh cần xác nhận. Cả hai ghi cùng ảnh của hồ sơ, không tạo ảnh riêng cho từng bên. Tải lại hồ sơ Admin hoặc trở lại/mở lại app để đọc phiên bản mới, chưa có push đồng bộ ảnh tức thời. Chọn ảnh không tự upload; thoát/đổi người/tải lại có nháp cần xác nhận bỏ. Lỗi mạng không tự gửi lại; nếu phiên bản đã thay ở nơi khác trả 409, tải lại kiểm tra trước khi lưu tiếp. Ảnh lỗi không chặn nghiệp vụ chấm công.

## Hồ sơ nhân sự overlay — 2026-10-20

Admin bấm tên/avatar hoặc vùng không có nút trong dòng nhân viên → mở hồ sơ lớn ngay trên danh sách, không chuyển URL. Tổng quan ở đầu; cuộn liên tục qua tổ chức, công/phép, đơn từ, công tác, kỷ luật, tài khoản/quyền và lịch sử. Dải tên/initial cuộn ngang và nút trước/sau dùng đúng kết quả tìm kiếm Backend đã áp dụng, không giới hạn trang 25 người, không tự chạy/vòng lại. Chuyển người đưa nội dung về đầu, không đổi bộ lọc/trang/cuộn của danh sách nền. Esc/X đóng và trả focus về điểm mở. Phím ←/→ không áp dụng trong ô nhập.

Sửa/tài khoản/lịch sử/ngừng/xóa mở panel thao tác riêng phía trên hồ sơ; không cho chuyển người khi panel/confirmation đang mở hoặc đang chuẩn bị thao tác. Nháp tạo/sửa vẫn cần xác nhận bỏ; xóa/reset giữ bước xác nhận, lý do và quyền Backend cũ. Màn điện thoại dùng overlay toàn màn hình, header/dải chuyển người cố định, nội dung một cột. CSS chuyển động ngắn, tắt với `prefers-reduced-motion`. Không bổ sung rule/API/schema hoặc quyền xem cho vai trò khác. Chi tiết và giới hạn: [Web UI](docs/WEB_UI_REFRESH.md).

## Web UI sơ bộ — 2026-10-19

Điều hướng gom sáu nhóm trình bày, chỉ mở nhóm đang dùng; mỗi link vẫn cần Backend portal.navigation. Trang Nhân viên mở danh sách trước; Thêm/Danh mục hoặc thao tác một nhân viên mở drawer bên cạnh, không cuộn lên form đầu trang. Đóng form tạo/sửa còn dữ liệu dùng cảnh báo bỏ thay đổi hiện hữu; tài khoản/reset/xóa/ngừng/khôi phục vẫn giữ endpoint, lý do và bước xác nhận cũ. Hàng đợi phê duyệt và cấu hình tuyến vẫn là hai khu vực riêng. Dashboard đưa việc cần xử lý lên vùng chính và giữ mô tả nguồn thật, không thêm số liệu/đồ thị minh họa. Không thay state nghiệp vụ/API hoặc Mobile. [Phạm vi bản mẫu](docs/WEB_UI_REFRESH.md).

## R14 — nâng cấp, backup và phục hồi (2026-10-14)

1. Chọn rõ project/env đích → preflight → worktree sạch → khóa vận hành → build từ dependency lockfile. Khởi động riêng DB và đọc có dữ liệu hay không, không dựa vào việc container cũ còn tồn tại. DB đã có bảng phải backup trước migration/Backend mới.
2. Dừng ingress/Backend đang chạy, bao gồm worker ảnh → dump + archive ảnh cùng mốc ngừng ghi → kiểm cấu trúc → manifest SHA256 cuối cùng. Backup lỗi không được coi là một cặp hoàn chỉnh; standalone resume đúng dịch vụ đã dừng. Không tự xóa backup cũ chưa đối chiếu off-host.
3. Deploy Backend migration dưới lease riêng → readiness DB/schema → Web/proxy healthy → mở traffic. Fail giữ ingress dừng; operator kiểm log/backup và kế hoạch recovery, không tự down migration/seed hoặc ghi vào schema chưa rõ.
4. Restore drill yêu cầu cặp đúng ID/manifest, checksum → PostgreSQL tạm không public → restore schema/dữ liệu thật → giải nén ảnh riêng, không link/traversal → kiểm local refs DB → cleanup container/anonymous volume tạm. Source backup và DB/evidence đang phục vụ không bị đổi. External/legacy refs vẫn cần người vận hành kiểm riêng.
5. DB/Backend/tunnel gián đoạn: liveness khác readiness; 5xx/mất mạng không phải phiên bị thu hồi. Gateway demo trả JSON 503 có timeout, không replay mutation. Phục hồi → đọc lại quyền/trạng thái/đơn trước gửi lại có chủ đích; JWT/refresh/SID và idempotency hiện hữu không đổi. Backup/restore có thể hồi sinh trạng thái phiên/quyền ở mốc cũ, cần kiểm access/audit trước cutover.
6. R14 chỉ nghiệm thu local biệt lập do chưa có VPS/domain. Không coi build/GET health/inbox/test fixture là bằng chứng production, push background hoặc biometric máy thật; không tự đóng các PARTIAL trước đó.

## R13 — Dashboard/KPI và phạm vi quản lý (2026-10-14)

1. Dashboard đọc một REPEATABLE READ view: ngày/giờ server +07 → scope chi nhánh hiện hành → dữ liệu công R12 → số đếm nghiệp vụ trong scope. Cảnh báo/điều chỉnh đếm ngày, không đếm từng event; giờ vào/ra hiệu lực theo báo cáo, không mặc định đã đủ công. Phiếu là tiến độ độc lập, không tự sinh công.
2. Thẻ/hàng đợi nêu phạm vi, thời điểm, nguồn công LIVE/SNAPSHOT. Đơn chờ là mọi ngày trong scope; công hôm nay chỉ ngày server. Chưa ra trong ngày không tự là quên checkout. Nhóm cảnh báo và thiếu checkout có thể cùng ngày, không cộng thành tổng người duy nhất. Link chỉ hiện khi portal cho workspace đó; không tạo quyền bằng UI.
3. Admin/Kế toán trưởng mở KPI → chọn tháng/phiên bản → Xem KPI. Backend lấy cùng report document và dùng summary chung; bản chốt giữ nguyên sau sửa/xóa hồ sơ/mở kỳ, chọn revision cũ theo R12. Ngày có dữ liệu không chỉ ngày phân lịch; nghỉ một phần không phải ngày phép quy đổi; OT chỉ APPROVED. Không chấm điểm/lương/thưởng/phạt.
4. Head/Leader → Theo dõi phạm vi quản lý → Báo cáo: grant/membership/assignment live và dữ liệu đọc trong cùng view; tổng hợp sau lọc nhân viên. Nghỉ cả ngày/một phần riêng, minutes/OT và blockers chỉ trong scope. Giữ alias workedMinutes/overtimeMinutes cho client cũ. Không trả departmentId/phòng chính ngoài grant hoặc tên người chốt/tổng toàn công ty. Quyền KPI global/Excel/chốt không đổi.
5. Loading/error/zero/empty tách biệt, lỗi không biến thành 0 hoặc loading vô hạn. Reload/focus đọc lại dữ liệu/quyền, không polling kéo phiên. Chống phản hồi cũ ghi đè reload/đổi tháng/module; KPI không hiển thị dữ liệu tháng cũ dưới nhãn bộ lọc mới. Không auto-retry mutation.

## R12 — Báo cáo theo từng phần và chốt phiên bản (2026-10-13)

1. Admin/Kế toán trưởng → Báo cáo tháng → chọn tháng/phòng/nhân viên → Tổng hợp. Kỳ mở là tạm tính; kỳ khóa đọc bản lưu mới nhất, không tính lại dữ liệu sống. Đổi bộ lọc phải tổng hợp lại trước xuất/chốt.
2. Bốn nút Xuất Excel riêng: Bảng công tháng (5 sheet), Nghỉ phép & số dư, Phiếu OT, Giải trình & điều chỉnh. Mục thiếu/chưa hoàn tất vẫn có trong file kèm ghi chú vàng/đỏ; đơn chờ/từ chối/hủy không tự được tính như đã duyệt. Thiếu checkout/giải trình/phép/OT chờ chỉ chặn CHỐT trên toàn công ty, không chặn XUẤT. Giờ thực tế/phép/OT riêng, Kế toán tự tính lương.
3. Chốt kỳ kiểm tra lại dữ liệu dưới khóa, lưu kỳ + snapshot + audit cùng transaction. Request chấm công sau khi khóa bị từ chối trước ghi/tiêu thụ chứng thực thiết bị. Ghi đang chạy phải hoàn tất trước khi đọc bản chốt, hoặc rollback khi xung đột khóa; không tự retry.
4. Xóa nhân sự không sửa bản báo cáo đã chốt. Kế toán trưởng mở lại có lý do → đối soát → chốt tạo v2, giữ v1; chọn v1 để đọc/xuất. Migration supporting_reports chỉ thêm khả năng lưu chi tiết cho các lần chốt mới. Bản cũ chưa có phần này vẫn xuất dữ liệu hiện tại với cảnh báo KHÔNG phải dữ liệu lịch sử của bản chốt; không tự backfill/mở/chốt.
5. Phép giữ phút toàn đơn và loại cả ngày/nửa ngày/giờ; đơn giao tháng xuất đầy đủ nhưng loại thời lượng toàn đơn khỏi tổng phút tháng để không cộng trùng, Kế toán/HCNS đối soát riêng. Quỹ năm ghi thời điểm lấy số dư, không coi là cuối tháng; ngày quy đổi theo phút/ngày chính sách hiện có, chưa lưu basis tại lúc nộp. OT chỉ APPROVED vào tổng. Giải trình và điều chỉnh là hai danh sách độc lập, không suy duyệt đơn = sửa công.
6. Bốn workbook đã triển khai, kiểm định Kế toán/HCNS vẫn riêng từng phần/PARTIAL. Không thêm payroll hoặc xuất tất cả một lượt. Xem `docs/R12_REPORTING_ACCEPTANCE.md`.

## R4 — Đơn từ và OT riêng (2026-10-10)

Trạng thái hiện tại thay ghi nhận OT/Đơn từ chưa triển khai ở các lát cắt lịch sử bên dưới:

1. App → Đơn từ → Giải trình/Nghỉ phép/Tăng ca. OT nhập ngày hôm nay/quá khứ, giờ chính xác đến phút, lý do và nội dung công việc; Backend quyết định quyền/trạng thái. Không thêm đơn online/công tác từ ảnh tham khảo.
2. `POST /overtime-requests/mine` bind chủ theo phiên, idempotent cùng submission UUID/payload. Một SUBMITTED/APPROVED mỗi employee/ngày; REJECTED cho gửi phiếu mới. Không suy OT từ checkout muộn; không tự tạo công từ phiếu OT.
3. SUBMITTED/PENDING_LEADER → Leader xác nhận → PENDING_HEAD → Head APPROVED/REJECTED. Admin chỉ quyết định thay khi tuyến thiếu/không còn hợp lệ, cần lý do; cấm tự xử lý, hai reviewer độc lập. Mỗi bước kiểm tra quyền hiện hành, expectedVersion và kỳ khóa; audit/inbox cùng transaction, push sau commit, thông báo ghi người quyết định thật.
4. Admin cấu hình tuyến mặc định OT riêng hoặc đổi tuyến đơn đang mở; bước xác nhận hoàn tất không bị viết lại. Sao chép tuyến giải trình chỉ điền form, phải lưu rõ ràng; thay tuyến phép/giải trình không tự thay OT.
5. Chỉ APPROVED cộng phút vào Today/daily/monthly/Excel; ngày chỉ có OT vẫn không tự có mặt/đủ công. Phiếu pending là blocker chốt kỳ và được kiểm tra lại trong transaction khóa kỳ.
6. Mất phản hồi khi gửi: giữ UUID/payload, người dùng thử lại rõ ràng hoặc tải danh sách; không tự retry quyết định phê duyệt. Không có sửa/hủy OT hoặc hàng đợi offline trong R4. Đã triển khai chức năng, nhưng UI/camera/push thực tế còn NOT_RUN: `docs/R4_OT_FORMS_ACCEPTANCE.md`.

## R4 — chấm công ngày/ảnh và quyền riêng tư (2026-10-10)

Quyết định mới thay các trạng thái NOT_IMPLEMENTED và flow phiếu gắn công trong phần lịch sử bên dưới:

1. Chấm công vào chọn Văn phòng/Hiện trường, cùng một lượt/ngày +07:00. Hiện trường nhập nội dung ít nhất 5 ký tự, không cần phiếu công tác hay phê duyệt. Backend kiểm tra lượt hôm nay dưới cùng employee lock cho cả hai loại.
2. App lấy một GPS, Backend tạo context chụp thuộc employee/account/type/sample, thời gian server và hạn 10 phút (hết ngày phải tạo lại). Mở camera hệ thống, không thư viện; App đóng timemark từ context, cho xem ảnh/hủy/xác nhận. Upload có ownership; record không có context/ảnh, context sai chủ/sai hình thức/vị trí/hết hạn bị từ chối. Lượt bị hủy không ghi công. Backend không chứng minh nguồn camera bằng metadata do App gửi; ảnh là bằng chứng đối soát, không attestation.
3. Backend ghi giờ vào theo lúc nhận sự kiện, không theo giờ điện thoại hoặc chữ timemark. Chấm ra dùng loại của lượt vào, lấy GPS tại thao tác và không chụp. Một lượt ra tối đa; không vào lại sau ra. 00:00 mở cửa sổ ngày mới, không xóa lịch sử; không hỗ trợ chuyển lượt checkout qua nửa đêm.
4. API record checkout/today không trả tọa độ, vị trí đối chiếu hay khoảng cách checkout. Chỉ Admin đọc GET `/attendance/daily/:employeeId/details?date=YYYY-MM-DD`. App và onboarding công khai việc lấy mẫu GPS tại checkout; không xin quyền nền. Lịch sử check-in/out/ảnh/nội dung Admin xem tại Chấm công.
5. Bắt đầu/hoàn tất phiếu công tác giữ vòng đời/audit lịch sử nhưng **không tự ghi attendance event mới**. Công hằng ngày độc lập; công hiện trường nhiều ngày ghi mỗi ngày một cặp. Báo cáo lấy hình thức từ sự kiện; phiếu được giao không tự tính là đã đi công tác. Hiện trường thiếu checkout là INCOMPLETE; đã ra là BUSINESS_TRIP, công phút từ cặp in/out; OT=0 cho tới tích hợp phiếu đã duyệt. Ngày có sự kiện daily mới vẫn được đưa vào báo cáo dù chưa có lịch/ngày nghỉ, dùng chuẩn mặc định 480 nếu không có lịch phù hợp. Excel thêm Hình thức, không có GPS.
6. Timeout/không rõ kết quả yêu cầu đọc lại trạng thái, không tự replay chấm công. Ảnh đã gắn sự kiện bất biến; xóa nhân sự R3 có thêm capture records và queue xóa ảnh theo ownership.

**PARTIAL:** Đơn từ và phiếu OT/tuyến OT riêng chưa triển khai; chưa chứng nhận camera/ảnh/checkout trên điện thoại hoặc production. Chi tiết: `docs/R4_DAILY_ATTENDANCE_ACCEPTANCE.md`.

## R4 — quyết định mới và trạng thái triển khai (2026-10-09)

Quyết định trực tiếp của Tech Lead dưới đây thay các mô tả OT tự động/multiple check-in trong phần lịch sử của tài liệu:

- Chọn lịch đang active theo ngoại lệ nhân viên trước, sau đó chi nhánh/phòng chính đang hiệu lực; chọn lịch rồi mới xét thứ trong tuần. Ngày nghỉ của lịch cá nhân không rơi về lịch phòng. Reporting và Attendance đã đồng bộ lựa chọn này.
- Một phút công chỉ tính khi đủ 60 giây; mặc định đủ công tại 480 phút, không tự trừ nghỉ trưa. Đi muộn vượt dung sai (mặc định 3 phút) có tính giây; về sớm theo dung sai cấu hình.
- Checkout trễ không tự thành OT. Đã bỏ phép tính OT tự động. Phiếu OT gồm ngày/số giờ/lý do/công việc, Leader xác nhận → Head duyệt; Admin chỉ dự phòng khi tuyến thiếu/hỏng, chỉ phút đã duyệt vào báo cáo. Phiếu OT và tích hợp số phút được duyệt `NOT_IMPLEMENTED`; hiện OT=0, kể cả báo cáo lịch sử tính lại.
- Mỗi nhân viên một lượt in/out mỗi ngày, chung hạn mức văn phòng/hiện trường; chuyển ngày 00:00 +07:00 không xóa lịch sử. Hiện trường chụp ảnh trực tiếp, không đính ảnh. Công tác nhiều ngày ghi in/out hằng ngày độc lập với hoàn tất phiếu. Enforcement chung/nghiệp vụ công tác ngày/App hai lựa chọn `NOT_IMPLEMENTED` trong lát cắt lịch này; endpoints start/complete cũ chưa đáp ứng yêu cầu mới.

R4 đang PARTIAL, chưa chuyển R5. Bằng chứng và phần tiếp nối: `docs/R4_SCHEDULES_ACCEPTANCE.md`.

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

### Danh mục tổ chức — bổ sung trước R2 (2026-10-09)

- `/dashboard/organization` có tab Danh mục tổ chức: chi nhánh/phòng ban/chức vụ, thêm/sửa/ngừng/khôi phục và xóa nếu chưa sử dụng. Mã của ba danh mục được sửa có audit, UUID liên kết không đổi; mã/phòng ban team vẫn bất biến.
- Trước sửa trạng thái/xóa/lưu thay đổi, Web đọc `GET /organization/catalog/:kind/:id/impact`: liên kết hiện tại, việc từng sử dụng, các số đếm phạm vi liên quan và token xác nhận. Các số đếm là phạm vi cần xem xét, không khẳng định mọi quyền/nhân sự sẽ bị khóa. Hủy dialog không gửi mutation.
- `PATCH`/`DELETE` yêu cầu lý do ≥5 ký tự và `confirmationToken`. Backend khóa bản ghi, đọc lại liên kết/usage/ảnh hưởng; token khác trả `CATALOG_CHANGED` 409. Xóa bản ghi đã dùng trả `CATALOG_IN_USE` 409 dù liên kết hiện tại đã được thay thế. Xóa bản ghi chưa dùng vẫn giữ audit trước và lý do.
- Ngừng danh mục không chuyển nhân sự, đóng membership, thu hồi grant, sửa tuyến hay lịch/sự kiện cũ. Phòng/team không hoạt động làm scoped grant không hợp lệ theo PQ1; chi nhánh không hoạt động làm phân công/membership tại chi nhánh đó mất điều kiện đọc scope. Tài khoản và role độc lập không tự khóa. Khôi phục có thể kích hoạt lại quyền chưa hết hạn/chưa thu hồi; SID đã thu hồi không phục hồi.
- Đối chiếu geofence cho sự kiện văn phòng mới chỉ lấy chi nhánh đang hoạt động; ngừng chi nhánh không sửa vị trí hay sự kiện lịch sử. Địa điểm bên ngoài dùng chung vẫn theo cấu hình hiện hữu.
- Bộ chọn phân công mới, lịch phòng ban, vị trí và đối tượng thông báo ẩn danh mục ngừng. Hồ sơ cũ vẫn hiển thị danh mục ngừng; sửa hồ sơ mà không đổi cơ cấu không tạo lại assignment. Backend chặn danh mục ngừng tại điểm tạo/phân công mới; lỗi có thể tải lại/chọn danh mục hoạt động.
- Team có tìm kiếm/lọc hoạt động, ngừng hoặc tất cả. Grant mặc định hiển thị ACTIVE/SCHEDULED; INACTIVE/EXPIRED/REVOKED có bộ lọc riêng, không xóa quyền lịch sử. Audit danh mục được đọc trong tab Lịch sử.
- Không xóa dữ liệu kiểm thử/hồ sơ/đơn cũ trong task này. R2 toàn bộ chưa nghiệm thu; xem `docs/ORGANIZATION_CATALOG_LIFECYCLE.md`.

1. Admin tạo team trong một phòng ban. Mã duy nhất trong phòng ban; mã và phòng ban không được chuyển sau khi tạo. Thành viên có thể thuộc HCM/HN nhưng phải có phân công còn hiệu lực trong phòng ban của team.
2. Admin thêm/rút thành viên. Rút yêu cầu lý do, đóng record và giữ lịch sử; thêm lại tạo record mới. Thành viên không tự có quyền Leader, rút thành viên không tự thu hồi quyền quản lý đã cấp riêng.
3. Admin cấp Trưởng phòng theo phòng ban hoặc Leader theo team cho hồ sơ có tài khoản đang hoạt động. Người được chỉ định không bắt buộc là thành viên phạm vi đó. Hình thức tạm thời/chính thức và thời hạn/vô thời hạn là hai lựa chọn độc lập. Thời điểm có múi giờ rõ ràng; không cho quyền cùng người/vai trò/phạm vi trùng khoảng hiệu lực.
4. Chỉ Admin sửa team/cấp/thu hồi quyền/xem audit. Thu hồi yêu cầu lý do và có hiệu lực ngay cho lần yêu cầu Backend tiếp theo, kể cả JWT/phiên cũ vẫn còn hợp lệ. Ngừng team tạm ngừng hiệu lực grant của team; khôi phục team cho grant chưa hết hạn/thu hồi hoạt động lại nếu các điều kiện khác hợp lệ.
5. `/organization/mine` trả quyền hiện hành/capability; `/organization/teams` chỉ trả team trong phạm vi quản lý; `/organization/teams/:id/members` trả nhân sự cơ bản còn đủ điều kiện. Trưởng phòng đọc `/organization/departments/:id/employees` trong phòng được cấp; Leader không được mở rộng sang toàn phòng. Không lộ liên hệ, tài khoản, phòng/chi nhánh ngoài phạm vi qua các API này.
6. Phân công tổ chức/tài khoản/team/phòng ban không hợp lệ làm quyền hoặc thành viên mất hiệu lực khi đọc; giữ record để Admin xử lý, không âm thầm xóa. Audit tạo/sửa team, thêm/rút thành viên, cấp/thu hồi quyền nằm trong transaction của thao tác.

R2 (2026-10-09): danh bạ team/phòng kiểm tra cả tài khoản nhân viên active, nhất quán với routing/managed reads; Admin vẫn thấy membership không còn đủ điều kiện để xử lý lịch sử. Backend/API targeted acceptance 85/85; UI Head/Leader và thiết bị thật chưa nghiệm thu trong lượt này. Bằng chứng và giới hạn: `docs/R2_ORGANIZATION_ACCEPTANCE.md`.

**Boundary:** Admin Web có trang `/dashboard/organization`. PQ1 không thay guard/role/luồng duyệt của module cũ. PQ2 bổ sung đăng nhập và khu vực quản lý chỉ đọc; PQ3 bổ sung giải trình hai bước ở dưới; PQ4 dùng cùng API trong app hiện tại. Quyết định đã kết thúc giữ nguyên lịch sử/người duyệt. PQ5 bổ sung nghỉ phép hai bước và theo dõi vận hành chỉ đọc theo scope.

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

### R3 — tài khoản và xóa nhân sự (2026-10-09)

- Web Nhân viên có `Tài khoản / Reset`: Backend ADMIN-only trả tên đăng nhập/trạng thái, không trả hash/plaintext. Admin nhập mật khẩu mới và xác nhận lại, lý do ≥5 ký tự; reset ghi audit an toàn, thu hồi mọi phiên/refresh/push trong transaction. Nhân viên đăng nhập lại; reset không mở hồ sơ bị ngừng. Reset chính mình chuyển về login. Login kiểm tra lại hash đã xác thực dưới account lock, chặn đăng nhập mật khẩu cũ chạy đua với reset.
- `Xóa` đọc impact ở trạng thái nhất quán: số lượng dữ liệu riêng sẽ mất và liên kết chung cần xử lý. Nhập đúng mã + lý do, xác nhận vĩnh viễn; hủy không gửi DELETE. Backend khóa/recheck snapshot trước khi xóa; thay đổi dữ liệu/lock conflict trả 409, cần đọc lại, không tự retry mutation.
- Xóa được hồ sơ đã sử dụng/đang active/inactive/kỳ đã khóa. Xóa vật lý hồ sơ và dữ liệu riêng, bỏ người phụ trách/quản lý trực tiếp qua FK SET NULL, không xóa phiếu công tác chung hoặc quyết định của nhân viên khác. User chỉ còn định danh kỹ thuật inactive, không còn email/hash/quyền/phiên. Tuyến của người khác trỏ quản lý bị xóa mất hiệu lực; giữ xác nhận đã hoàn tất, Admin phân tuyến/xử lý dự phòng theo policy hiện có. Audit xóa giữ actor/thời gian/lý do/counts.
- Ảnh hệ thống có liên kết/ownership được đưa vào queue bền vững trong cùng transaction, unlink sau commit và retry mỗi phút; tệp chờ xóa bị từ chối đọc. Không xóa đường dẫn tùy ý/external, file backup hoặc dữ liệu HCNS riêng. Không có khôi phục trong UI; phục hồi cần backup quản trị. Đây không phải xóa sạch PII trong audit/backup cũ.
- Quyết định R3 thay giới hạn không hard-delete nhân sự ở các flow CR1/C1 cũ; không đổi vòng đời danh mục tổ chức/khách hàng. Bằng chứng và giới hạn: `docs/R3_EMPLOYEES_ACCEPTANCE.md`.

1. Web hoặc Mobile gửi định danh thiết bị ổn định cùng thông tin đăng nhập.
2. Backend xác thực mật khẩu, chọn chính sách một phiên hoặc Web + Mobile theo PQ2 rồi tạo phiên Web tối đa 24 giờ hoặc Mobile tối đa 30 ngày; không ảnh hưởng kênh kia khi được cấp ngoại lệ.
3. JWT truy cập chứa mã phiên và sống 15 phút. Web giữ refresh token trong cookie HttpOnly; Mobile giữ refresh token trong secure storage. Refresh token được xoay vòng sau mỗi lần cấp access token mới.
4. Mọi request được bảo vệ phải kiểm tra đồng thời chữ ký token, tài khoản đang hoạt động và phiên chưa hết hạn/chưa bị thu hồi. Web hết phiên sau 30 phút không hoạt động.
5. Đăng xuất, Admin thu hồi phiên, đăng nhập mới cùng phạm vi thay thế hoặc phát hiện refresh token cũ bị dùng lại làm phiên liên quan mất truy cập. Khóa tài khoản thu hồi mọi phiên.
6. Backend gửi email cảnh báo tới danh sách Admin cấu hình qua SMTP. Nếu SMTP chưa cấu hình hoặc gửi lỗi, đăng nhập vẫn thành công và trạng thái được lưu trong lịch sử để Admin nhìn thấy.
7. Chỉ Admin được xem toàn bộ lịch sử đăng nhập/đăng xuất và chủ động đăng xuất thiết bị.

**Implementation status:** C2 sử dụng bảng `auth_sessions`, endpoint `/auth/refresh`, endpoint quản trị `/auth/admin/sessions` và trang `Tài khoản & thiết bị`. Mobile chỉ xóa token khi Backend từ chối phiên; lỗi mạng tạm thời giữ nguyên phiên để người dùng thử khôi phục lại. Khi Admin thu hồi thiết bị, tài khoản đăng nhập trên máy khác hoặc hồ sơ ngừng hoạt động, app quay về đăng nhập và hiển thị rõ nhóm nguyên nhân thay vì im lặng xóa phiên. Mobile CR7 phân biệt thiết bị mất mạng với Backend timeout/tạm ngắt, giữ nguyên credential cho mọi lỗi có thể thử lại và hiển thị banner vận hành toàn cục; chỉ phản hồi xác thực `401/403` hợp lệ mới kết thúc phiên. Phiên bản/build ứng dụng được đọc từ package metadata và hiển thị ở màn đăng nhập cùng trang Hôm nay. Không triển khai tự đăng ký hoặc tự khôi phục mật khẩu vì tài khoản do Admin cung cấp.

R1 (2026-10-09): Web điều phối refresh giữa các tab có Web Locks, kiểm tra lại phiên sau khi lấy lock; không nới reuse protection hoặc tạo heartbeat. App bỏ qua phản hồi refresh của credential đã đổi vì logout/login khác. Danh sách phiên thể hiện Web idle đã hết hạn, không touch/thu hồi khi chỉ đọc. Production kiểm tra Origin cả khi login WEB lần đầu tạo cookie; Mobile không cookie vẫn dùng Bearer. Middleware đọc JSON trước tính rate limit theo account. Policy mật khẩu dài đang NEEDS_DECISION do bcrypt giới hạn 72 byte; biên bản tại `docs/R1_AUTH_ACCEPTANCE.md`.

## Truy cập Admin không PIN (2026-10-09)

1. Admin đăng nhập bằng tài khoản hiện tại; không có bước thiết lập/xác nhận PIN.
2. Hồ sơ chi tiết/lịch sử, sửa hồ sơ, quản lý phiên và cấp/thu hồi quyền vẫn được Backend kiểm tra JWT, phiên và role ADMIN. Danh sách dùng trường cơ bản; email đăng nhập/liên hệ thuộc API chi tiết Admin.
3. Không còn trang Bảo mật Admin hoặc bàn giao bằng PIN. API `/auth/admin-security` ngừng phục vụ (404). Migration retirement vô hiệu hóa recovery, lời mời và lượt mở khóa cũ; giữ lịch sử audit và tài khoản/phiên thông thường.
4. Mật khẩu chỉ lưu hash, không có chức năng xem plaintext. Không thay flow Head/Leader/app hoặc policy phiên.

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

### Thiết lập quyền lần đầu (2026-10-07)

- Sau đăng nhập/khôi phục phiên hợp lệ lần đầu trên bản cập nhật, app hiện `Thiết lập ứng dụng`. `Tiếp tục` hoặc `Để sau` ghi cờ đã xem trên thiết bị; không phụ thuộc việc đã cấp quyền. Mở lại từ biểu tượng thiết lập tại Trang chủ. Mỗi lần mở/resume màn này đều đọc lại quyền OS.
- Chỉ nút `Cho phép thông báo` mới mở hộp thoại Android; quyền bị chặn hoặc cần chỉnh kênh có nút Cài đặt. Khởi động, đăng nhập, retry push và resume không tự xin quyền. Cấp quyền trước khi có Firebase không được coi là nghiệm thu push.
- Màn này chỉ kiểm tra permission/dịch vụ/độ chính xác, không lấy tọa độ. Vị trí vẫn xin tại chấm công/bắt đầu/kết thúc công tác; không xin Always/background.
- Camera dùng thao tác chụp hiện hữu qua camera hệ thống. Đính kèm dùng Android Photo Picker (fallback trình chọn hệ thống khi không hỗ trợ); không xin đọc toàn bộ thư viện/storage. Hai mục hiển thị cách sử dụng, không gắn nhãn `Đã cấp` giả.
- Từ chối/để sau vẫn vào app/hộp thư/nghỉ phép; chỉ thao tác phụ thuộc quyền bị hạn chế. Không tự gửi thông báo, tạo đơn hoặc ghi chấm công trong onboarding.

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
5. The assigned Leader confirms only, with an optional note. The assigned Head then approves/rejects with an optional note/reason. Actors are different and neither is the owner; a Head cannot bypass confirmation. Admin sees actors/history and reroutes; the post-PQ5 correction allows an explicit Admin fallback decision only when live routing is missing/ineligible, never on a healthy route. Live grants and scope are checked on each list/evidence/action; unrelated managers have no access.
6. Missing/ineligible routing waits for Admin to reroute or make an explicitly reasoned fallback decision. Fallback does not fabricate a Leader confirmation and preserves any completed confirmation. Reroute requires a reason and expected version. Completed confirmation keeps its actor/time/team; only the unfinished Head may change within that department. Defaults may change for future requests but cannot rewrite completed steps on existing ones; invalid cross-scope replacement aborts the transaction.
7. Audit and inbox notifications are written in the operation transaction. Push is attempted after commit through the existing tracked sender; failures do not undo the decision. Notifications do not grant access to the referenced request. Approval does not automatically adjust attendance.
8. Admin adjustments preserve old/new values, reason, actor and timestamp. Backend rejects whitespace-only reasons and non-calendar work dates. Period validation, reading the effective old value and appending the adjustment share one transaction and the month row lock used by period closing. No adjustment is accepted after the month is locked, including concurrent closing when that month had no persisted OPEN row yet.
9. Admin or Chief Accountant can lock a month after incomplete check-outs and open explanations are resolved. Waiting routing/confirmation/Head all remain `SUBMITTED`, blocking period closing and duplicate submissions. Only Chief Accountant can reopen with a mandatory reason.

**Implementation status:** PQ3 migration `1791676800000-explanation-two-step-workflow` bổ sung tuyến mặc định, snapshot tuyến/phiên bản/bước và người xác nhận. Đơn đang chờ cũ chuyển sang chờ tuyến hoặc chờ nhân viên phản hồi, không tạo người xử lý giả; đơn hoàn tất giữ nguyên. Web `/dashboard/explanations` cho Admin/Leader/Trưởng phòng, hàng đợi tại Chấm công dùng cùng component. API thêm `routes`, `routing-options`, `:id/reroute`, `:id/confirm`, `:id/history`; `:id/review` cho Trưởng phòng được chỉ định sau xác nhận, hoặc Admin dự phòng khi tuyến thiếu/không hợp lệ với `adminOverrideReason`; có `expectedVersion`. PQ4 app hiển thị bước/người xử lý của đơn cá nhân và khu vực xử lý dành cho grant hiện hành, dùng cùng API/capabilities/version. Không suy quyền từ membership/role; không duyệt offline/tự retry quyết định. Reload/resume kiểm tra lại quyền và bỏ cache quản lý cũ; lỗi 403 nghiệp vụ giữ phiên nhân viên. Yêu cầu `REQUESTED` cũ giữ chủ sở hữu/hạn và tuyến chỉ định khi phản hồi. Ảnh vẫn JPEG/PNG/WebP 5 MB, không ghi đè, chỉ owner/Admin/người được chỉ định có grant live đọc. Nhiều ảnh/PDF, sửa/hủy đơn và trả về bổ sung chưa triển khai.

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

## R9 — nghỉ phép/quỹ (2026-10-12)

Ngày có lịch nhưng là ngày nghỉ = 0 phút phép theo quyết định Tech Lead; ngày thiếu lịch fallback policy riêng từng ngày. Ưu tiên lịch cá nhân rồi phòng chính trước weekday; không lấy lịch phòng kiêm nhiệm hoặc rơi về lịch phòng khi override là ngày nghỉ. Khoảng 0 phút trả LEAVE_NO_WORKING_MINUTES, không tạo/giữ quỹ; không recalculate đơn cũ. Nửa ngày/giờ theo policy và phút ngày, không tự thêm khung ca/nghỉ trưa.

Quỹ vẫn derived từ SUBMITTED/APPROVED: confirm giữ reserve; approve chuyển sang used; reject/cancel giải phóng một lần theo state. Initialize mới luôn có một audit kể cả auto-init; snapshot entitlement/carry giữ nguyên sau policy sửa. GET chưa khởi tạo preview carry cùng công thức initialize, trả initialized=false và không tạo row; app ghi rõ dự kiến. Overlap vẫn theo ngày, không mở nhiều đơn AM/PM/giờ cùng ngày. App lỗi mạng/409/5xx khi submit yêu cầu kiểm tra danh sách, lỗi cancel/refresh bỏ action stale, không replay. [Bằng chứng và giới hạn R9](docs/R9_LEAVE_ACCEPTANCE.md).

## Mobile + Admin Web — leave request

```text
SUBMITTED (WAITING_ROUTING nếu thiếu tuyến)
  -> LEADER_CONFIRMATION -> HEAD_APPROVAL -> APPROVED / REJECTED
  -> CANCELLED (khi chưa quyết định cuối)
APPROVED  -> CANCELLED (chỉ khi chính sách cho phép)
```

1. Admin cấu hình từng chính sách nghỉ: định mức, quy đổi phút/ngày, cộng dồn, báo trước, hình thức cả ngày/nửa ngày/theo giờ và quyền hủy đơn đã duyệt.
2. Admin khởi tạo số dư theo năm. Số dư năm mới lấy định mức tại thời điểm khởi tạo và phần còn lại năm trước trong giới hạn cộng dồn; điều chỉnh tăng/giảm phải có lý do và được lưu bất biến.
3. Nhân viên chọn một chính sách đang hoạt động, thời lượng được chính sách cho phép và lý do. Backend tính số phút từ lịch làm việc; khi không có lịch mới dùng số phút/ngày của chính sách.
4. Backend kiểm tra báo trước, nhân viên đang hoạt động, kỳ công chưa khóa, không trùng đơn và đủ số dư. Đơn `SUBMITTED` giữ trước số dư để tránh gửi vượt quỹ.
5. PQ5: Admin đặt tuyến phép riêng, có lý do/expectedVersion; sao chép tuyến giải trình chỉ điền form, cần lưu rõ ràng, không liên kết tự động. Leader chỉ định xác nhận, giữ SUBMITTED/quỹ dự trữ; Head chỉ định quyết định sau xác nhận thật, hai actor độc lập và không owner/người gửi. Điều chỉnh sau PQ5 cho Admin quyết định thay chỉ khi tuyến thiếu/không còn hợp lệ, có adminOverrideReason ≥5 ký tự; không tự duyệt đơn mình/người gửi/người đã xác nhận. Từ chối phép vẫn cần reviewNote ≥5 ký tự; duyệt kiểm tra số dư cùng transaction. Thiếu/mất grant chờ Admin phân tuyến hoặc quyết định thay có audit; đổi bước chưa xử lý giữ team/Leader/actor/time đã xác nhận. Pending cũ cần tuyến/xác nhận thật; terminal cũ giữ nguyên.
6. Nhân viên có thể hủy đơn chờ duyệt. Đơn đã duyệt chỉ hủy được khi chính sách cho phép và kỳ công chưa khóa; số dư được giải phóng theo trạng thái mới.
7. Mọi lần gửi, duyệt/từ chối, hủy, đổi chính sách và điều chỉnh số dư đều có audit. Đơn đang chờ là blocker khi chốt kỳ công.
8. Mobile hiển thị số dư và kết quả do Backend trả về; báo cáo ngày phân biệt nghỉ cả ngày với nghỉ một phần.

**Implementation status:** Customer review CR6 và migration `1791331200000-leave-policies-balances` đã triển khai chính sách nghỉ cấu hình được, số dư theo năm/cộng dồn, điều chỉnh có audit, nghỉ nửa ngày/theo giờ và hủy đơn theo policy trên Backend, Admin Web và Mobile Android. Bốn loại nghỉ cũ được tạo thành chính sách tương thích với theo dõi số dư mặc định tắt, nên dữ liệu cũ không bị tự động trừ quỹ. PQ5 migration 1791763200000-leave-two-step-workflow thêm tuyến riêng/snapshot/actor/version. Audit/inbox cùng transaction, push sau commit. Web /dashboard/leave-workflow xử lý/phân tuyến; /dashboard/leave quản trị policy/quỹ, không còn nút duyệt tại trang chính sách/quỹ; Admin dự phòng xử lý tại workspace. App mở Xử lý nghỉ phép theo capability; employee xem tuyến mình từ Home, giữ form hiện tại. Stale/mất quyền/mạng cần tải lại, không tự retry quyết định. Minh chứng/thâm niên/workflow ngoài hai bước vẫn ngoài scope.

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

**Android push readiness (2026-10-07):** Foreground có system notification và refresh inbox, background dùng FCM notification payload; tap mở đúng tin sau khi API xác thực quyền, không tự đánh dấu đọc/xác nhận chỉ vì nhận push. Đăng ký lỗi hoặc Backend chưa bật push phải hiện rõ và có retry; resume/mạng phục hồi thử lại đăng ký. Không gửi tới máy thiếu phiên Mobile còn hiệu lực. Nhân viên tự kiểm soát quyền/banner/âm thanh/kênh tại hệ điều hành. Nút thông báo thử trên máy chỉ kiểm tra local, không xác nhận FCM hoạt động. Nhắc check-out chưa triển khai, chờ Tech Lead chốt thời điểm/chính sách. Checklist và giới hạn thực tế tại docs/PUSH_ACCEPTANCE.md.

## R11 — Thông báo/push acceptance update (2026-10-13)

Department publish giải roster theo effective_from/to hiện hành (ngày Việt Nam, inclusive), không chỉ effective_to NULL; snapshot/dedup và ALL active employee giữ nguyên. Publish recheck target/content; read/ack khóa announcement shared trước recipient, serialize với withdraw. Đọc/list/push không tự acknowledge; retry giữ timestamp đầu. Token register bắt buộc đúng authenticated MOBILE session và device; FCM token được serialize giữa accounts. Không đổi normal request payload, không replay publication tự động. Phone background FCM còn chờ IAM/config/real evidence, [R11](docs/R11_PUSH_ACCEPTANCE.md).

## Admin Web + Mobile Inbox — disciplinary actions

### R10 — tập thể (2026-10-13)

Admin nhập nội dung/chọn team hoặc phòng → Backend preview roster/fingerprint (không ghi DB) → popup tích sẵn, bỏ ngoại lệ → xác nhận. Backend kiểm quyền/nội dung/ngày, khóa và đọc lại roster; đổi roster trả 409 yêu cầu chọn lại, ngoài scope/rỗng/trùng người trả 400. Request UUID chống ban hành trùng cùng lượt.

Một transaction chốt master ISSUED, snapshot người được chọn, từng hồ sơ cá nhân ISSUED + inbox bắt buộc xác nhận + audit. Tập thể không lưu bản nháp riêng; luồng nháp cá nhân giữ nguyên. App dùng inbox cá nhân hiện hữu, không nhận danh sách đồng nghiệp. Push chỉ sau commit, lỗi provider không xóa inbox.

Thu hồi có lý do → khóa master/hồ sơ con → thu hồi mọi hồ sơ còn tồn tại của danh sách gốc, inbox thu hồi cho tài khoản còn hoạt động + audit cùng transaction. Không giải lại membership hoặc tái tạo hồ sơ bị xóa theo R3. Hai tin giữ để đối soát, không thu hồi riêng tại Thông báo. Quản lý scoped/legacy không đọc kỷ luật người khác qua tracking. [R10 acceptance](docs/R10_DISCIPLINARY_ACCEPTANCE.md).

### Luồng cá nhân hiện hữu

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

## PQ5 — scoped module reads

GET /organization/managed/attendance?month=YYYY-MM, reports?month=YYYY-MM, business-trips, announcements chỉ cho grant quản lý live. Backend lấy nhân viên active có tài khoản/phân công tổ chức hiện hành: Head đúng phòng hoặc Leader có membership team đúng phòng. Công tác chỉ phần tham gia trong scope; thông báo chỉ trạng thái nhận/đọc/xác nhận, không body/push credentials. Báo cáo dùng projection chuẩn, lọc employee IDs trước tổng hợp, không trả blocker toàn công ty. Web /dashboard/managed-modules và app Theo dõi phạm vi quản lý chỉ đọc; không mở mutation/export/lock. Thu hồi/hết hạn/ngừng phạm vi kiểm tra ở request tiếp theo; màn đang hiển thị là snapshot, reload/resume bỏ cache và đọc lại quyền.

## Điều chỉnh sau PQ5 — Admin dự phòng và workspace UX

Tech Lead duyệt cho cả nghỉ phép/giải trình: Admin chỉ quyết định thay đơn SUBMITTED khi tuyến thiếu hoặc không còn hợp lệ. Backend trả canAdminReview riêng và kiểm tra lại trong transaction; không mở bypass tuyến hợp lệ, tự duyệt đơn mình/người gửi/người đã xác nhận, REQUESTED chưa phản hồi, terminal hoặc kỳ khóa. Review cần expectedVersion + adminOverrideReason ít nhất 5 ký tự. Phép từ chối vẫn cần reviewNote hợp lệ, duyệt vẫn kiểm tra quỹ. Xác nhận đã hoàn tất giữ nguyên; không tạo xác nhận Leader giả.

Migration 1791849600000-admin-fallback-review thêm decision_method (ROUTED/ADMIN_FALLBACK, nullable cho lịch sử) và admin_override_reason vào hai bảng. Audit ADMIN_FALLBACK_REVIEW và inbox cùng transaction; push tracked sau commit. Thông báo quyết định, kể cả Head theo tuyến, ghi tên người xử lý thực tế. App hiện tại nhận qua Hộp thư và hiển thị reviewedByName; không cần đổi form/đóng gói APK trong task này. Cập nhật migration + Backend trước Web.

Hai workspace Admin tách Hàng đợi đơn/Cấu hình tuyến; thẻ tóm tắt từ dữ liệu thật, chip lọc ngang, tìm kiếm/phân trang và drawer chi tiết/timeline/audit/nút xử lý. Form lưu nằm dưới các trường thay vì bị kéo cao; CSS giới hạn trong workspace, giữ brand tím/trắng. Menu phân biệt Chính sách & quỹ phép và Xử lý nghỉ phép. Không redesign module khác hay mở thêm ERP. Bàn giao/kiểm tra tại docs/PERMISSIONS_PLAN.md.

## R8 — Phiếu công tác độc lập với công ngày (2026-10-12)

Quyết định R4 hiện hành thay mô tả lịch sử coi tiến độ phiếu là sự kiện công: phiếu chỉ theo dõi phân công/tiến độ; chấm công ngày office/field riêng tại Hôm nay, field không cần phiếu, nhiều phiếu hoàn tất không cộng thêm giờ công. Nháp chỉ Admin thấy; giao revalidate member active, inbox cá nhân đúng người cùng transaction, push tracked sau commit. Mã theo tháng tạo, không đổi khi sửa ngày kế hoạch. PATCH customerId bỏ qua giữ link, null bỏ link chủ động; khách hàng ngừng giữ lịch sử.

Ảnh công tác owned/private/immutable; chỉ uploader/Admin đọc, complete chỉ dùng ảnh local upload của chính actor. Legacy owner mơ hồ không tự suy đoán. App chụp lại UUID mới, lỗi API phải read trạng thái trước thao tác tiếp, không replay mutation hoặc complete phiếu hủy. [Biên bản R8](docs/R8_BUSINESS_TRIPS_ACCEPTANCE.md) phân biệt API/widget PASS với máy thật/push chưa nghiệm thu.

## R6 — Thiết bị và xác thực sự kiện chấm công

App tạo public key từ AndroidKeyStore → đăng ký bằng phiên MOBILE còn hiệu lực. Quyết định mới được Tech Lead duyệt ngày 2026-10-10: tài khoản chưa từng có bản ghi khóa → ACTIVE ngay với audit AUTO_BIND_FIRST_DEVICE (không tạo quyết định Admin giả). Có lịch sử REVOKED → PENDING → Admin đối chiếu trực tiếp nhân viên/mã khóa và APPROVE có lý do/audit → ACTIVE. PENDING cũ giữ nguyên, ACTIVE cùng máy/cùng khóa trả lại trạng thái hiện hành; khóa/máy khác không thay được ACTIVE. Mỗi tài khoản một ACTIVE/một PENDING; đổi máy phải REVOKE cũ rồi duyệt mới. Đăng xuất/đăng nhập, thu hồi hay reset key không xóa lịch sử để tự gắn lại.

App không còn mục Đăng ký/xem mã khóa: bấm chấm công tự thực hiện đăng ký khóa trước GPS/camera. Biểu tượng khóa chỉ mở xác nhận Tạo lại khóa (cần Admin duyệt); hủy không thay khóa. Mã khóa PENDING vẫn hiển thị trong lỗi chấm công/notice khôi phục để Admin đối chiếu. Nếu khôi phục gặp lỗi kết nối, Thử kết nối lại chỉ đăng ký khóa hiện tại, không reset lần nữa hoặc tự gửi sự kiện công.

App kiểm tra trạng thái khóa → lấy một mẫu GPS → Backend chuẩn bị capture hợp lệ → camera timemark/upload (check-in) → challenge server 120 giây gắn phiên/payload/ảnh → sinh trắc OS ký từng lượt → Backend khóa theo nhân viên, kiểm tra live phiên/thiết bị/chữ ký/GPS/ngày/ảnh và consume cùng transaction ghi công. Checkout bỏ capture/ảnh nhưng vẫn ký và lấy GPS. Mock/accuracy không đạt hoặc office check-in ngoài vùng bị chặn, không tính công; nhân viên dùng Giải trình. 429 không tự replay, response mơ hồ đọc trạng thái trước thao tác tiếp theo. Sinh trắc không đủ mạnh/khóa mất hiệu lực/máy chưa duyệt: fail closed, liên hệ Admin. [Giới hạn và nghiệm thu R6](docs/R6_ATTENDANCE_ACCEPTANCE.md).
