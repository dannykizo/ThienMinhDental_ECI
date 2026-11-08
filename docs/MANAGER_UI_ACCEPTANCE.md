# Nghiệm thu giao diện Leader / Trưởng phòng — 2026-10-07

## Phạm vi và cách kiểm tra

- Nghiệm thu thủ công Web localhost:3000 và Android RMX5555, USB `32a65649`, API localhost:3001/api qua ADB reverse. Không chạy test suite tự động, không tạo APK release/bàn giao, không thay đổi business rule.
- Fixture riêng `QAM-AE3B1CEE`, Development Only: một phòng, một team, bốn nhân viên QA, hai grant tạm thời 24 giờ, hai đơn nghỉ và hai giải trình. Team chỉ có nhân viên và Leader; Trưởng phòng/nhân viên ngoài team thuộc cùng phòng. Không ghi GPS/chấm công hoặc quyết định trên hồ sơ nhân viên thật.
- Hai tuyến độc lập: nhân viên → QA Leader → QA Trưởng phòng. Fixture không có quyền quản trị dữ liệu phòng ban thật. Credential/token chỉ nằm trong artifact local ignored, không đưa vào Git/báo cáo.
- Việc cài bản debug onboarding đã hoàn tất. Màn hướng dẫn quyền xuất hiện, thao tác **Để sau** vào Home được; không cấp quyền hệ điều hành. Push Firebase thật chưa có cấu hình, không coi inbox/analyze/build là chứng cứ giao thông báo ngoài màn hình.

## Kết quả thủ công

| Hạng mục | Quan sát | Kết quả |
|---|---|---|
| Web Leader | Menu chỉ khu vực quản lý, xử lý phép/giải trình và theo dõi scope; directory đúng hai thành viên, không mở toàn phòng | PASS |
| Web Leader xác nhận phép A | Chuyển sang bước 2, vẫn SUBMITTED; không có nút phê duyệt/từ chối; audit actual Leader và ghi chú | PASS |
| Web Leader xác nhận giải trình A | Toast chuyển Trưởng phòng, giảm đếm actionable 2→1; audit actual Leader, thời điểm/ghi chú | PASS |
| Android Leader | Vào Home, thấy entry quản lý; giải trình B và phép B xác nhận thành công, vẫn chờ Head. Sau xác nhận không còn quyền quyết định/confirm lại | PASS |
| Web Trưởng phòng | Directory đúng bốn người trong phòng, chọn được phòng/team QA; mở trực tiếp `/dashboard/access` bị chặn, không mount form quản trị | PASS |
| Web Head quyết định | Duyệt phép A, từ chối giải trình A có ghi chú. Terminal không còn nút xử lý; actual confirmer/reviewer và thời điểm riêng | PASS |
| Android Head quyết định | Từ chối phép B, chặn lý do trống (≥5 ký tự); duyệt giải trình B không cần ghi chú. Status/actor thật và queue empty sau xử lý | PASS |
| Đồng bộ Web/App | Hai kênh cùng đăng nhập được; xác nhận Web phản ánh trên app và ngược lại, quyết định terminal xuất hiện trong API owner | PASS |
| Theo dõi chỉ đọc | Web/App có notice giới hạn quyền, filter tháng/module, trạng thái trống khi QA không có lịch/chấm công; không có mutation/export | PASS, dữ liệu populated chưa kiểm tra UI |
| Backend tạm không truy cập từ phone | Tạm tháo riêng ADB reverse, app giữ phiên + báo lỗi + Thử lại; khôi phục reverse tải được, không restart Backend | PASS |
| Thu hồi grant QA Head | Sau reload Web về login; app refresh báo không còn quyền quản lý, dữ liệu cũ không hiển thị; quay Home vẫn là tài khoản nhân viên QA Head | PASS |
| Inbox API owner | Tám mục riêng nhân viên QA: bốn confirmation và bốn final decisions; final body có actual QA Trưởng phòng và ghi chú đúng, không broadcast | PASS |
| Inbox trên app nhân viên QA | Badge 8, danh sách đủ tám mục; mở giải trình B đã duyệt thấy actual Head bằng tiếng Việt, notice gửi riêng; đọc qua UI thành công | PASS |
| Ngừng tài khoản QA | Sau cleanup app về login với thông báo phiên không còn hiệu lực; dữ liệu quản lý/inbox không còn trên màn hình | PASS |

## Phát hiện cần xử lý

1. **Đăng nhập Web hiển thị sai lỗi khi rate-limited.** Quan sát màn Web “Không thể kết nối Backend API”, health vẫn OK. Diagnostic riêng fixture trả HTTP429, `AUTH_RATE_LIMITED`, `Retry-After: 328`, không có `Access-Control-Allow-Origin`. `backend/src/main.ts` trả 429 trong middleware trước middleware CORS; trình duyệt không đọc được JSON lỗi. Không tắt/nới/reset limiter để nghiệm thu. Cần xử lý thứ tự middleware/CORS và xác minh lại trên trình duyệt trong task sửa lỗi được duyệt.
2. **Sidebar quản lý chưa cân đối.** Bốn mục trên desktop cách nhau quá xa theo chiều dọc. Không chặn nghiệp vụ nhưng cần polish riêng, không tự redesign trong nghiệm thu.
3. **Định dạng thời gian app nghỉ phép chưa thống nhất.** Dòng “Đã xác nhận” hiển thị `2026-10-07T05:17:30.293Z`, trong khi decision/history có định dạng khác. Cần thống nhất giờ local dễ đọc; không thay đổi timestamp Backend.

Lý do từ chối phép B chứa `%20` do lệnh nhập ADB của agent dùng escape không phù hợp; đây là nội dung fixture nhập vào, **không** ghi nhận thành lỗi encoding của sản phẩm. Tiếng Việt nhập qua Web và nội dung Unicode hệ thống hiển thị đúng.

## Kết luận và bàn giao

**Nghiệp vụ cốt lõi Leader → Trưởng phòng trên Web/app đạt trong các ca đã thao tác; chưa ký hoàn tất nghiệm thu khách hàng/production.** Cần sửa lỗi Web HTTP429/CORS, polish sidebar và thời gian phép; hoàn tất cấu hình/kiểm chứng push và các ca UI còn thiếu bên dưới. Lượt này chỉ nghiệm thu/ghi biên bản, không sửa code ứng dụng hay đổi quyền/nghiệp vụ.

- Fixture cleanup qua API lifecycle: phép A đã duyệt được hủy theo policy QA cho phép, phép B và hai giải trình giữ trạng thái terminal/audit; hai grants revoked, hai memberships ended, team/policy ngừng, bốn employees/accounts ngừng. Department và QA bootstrap Admin được ngừng theo ID/code/email fixture chính xác. Không hard-delete, không còn đơn QA đang mở hay session QA active; đối soát database thấy năm tài khoản inactive và zero active sessions.
- Local artifact chứa credential/token được loại bỏ sau đối soát; chỉ giữ ảnh QA không chứa secret làm chứng cứ. Không phát hành thông báo toàn công ty, không chụp/ghi GPS, không sửa attendance.
- Web và app trở lại màn đăng nhập sau kết thúc QA. API/Web/PostgreSQL vẫn chạy; ADB reverse tcp:3001 đã khôi phục. Không claim Hot Reload mới, không build lại/suite tự động trong lượt nghiệm thu.
- Thay đổi tracked chỉ tài liệu: biên bản này, trạng thái `PERMISSIONS_PLAN.md`, trạng thái cài onboarding `PUSH_ACCEPTANCE.md`. Giữ nguyên file form nghỉ phép của Tech Lead, không stage/commit nó.

Ảnh chứng cứ local (không phải ảnh nhân viên thật): [Quyết định Head trên Web](../logs/qa-head-web-decision.png), [Head duyệt trên app](../logs/qa-head-app-approved.png), [Inbox nhân viên](../logs/qa-employee-inbox.png), [Leader/history](../logs/qa-leader-explanation.png).

## Giới hạn

- Firebase/push ngoài màn hình và chính sách nhắc checkout còn thiếu; xem `PUSH_ACCEPTANCE.md`.
- Chưa chứng nhận production, uptime tunnel/VPS hoặc iOS.
- Chưa nghiệm thu UI toàn bộ ma trận: ảnh minh chứng, Head trước confirmation, self-review, stale/reroute khi dialog mở, grant expiry theo đồng hồ, dữ liệu populated/pagination lớn, mọi viewport/font/keyboard. Các kiểm tra API trước đây không được thay cho chứng cứ UI ở lượt này.
- GitNexus registry không có repo này và runner local không tồn tại; rà source/audit trực tiếp, không dùng index repo khác.
- Giữ nguyên thay đổi của Tech Lead tại `mobile/lib/features/leave/leave_request_screen.dart`.
