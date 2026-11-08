# Kế hoạch rà soát nghiệp vụ theo module

Ngày: 2026-10-09. Tech Lead: Nguyễn Thành Nam.

## Mục tiêu và ranh giới

Rà soát → kiểm thử → sửa lỗi nghiệp vụ của sản phẩm hiện có, từng module một; custom giao diện sau khi các luồng vận hành đạt nghiệm thu. Đây là kế hoạch đề xuất, không phải bằng chứng các module đã đạt hoặc chỉ thị triển khai toàn bộ cùng lúc.

- Nguồn chuẩn: PROJECT.md, FLOWS.md, IMPLEMENTATION.md, README.md và các quyết định trực tiếp của Tech Lead. Hành vi hiện có trong code không tự động là hành vi đúng nếu mâu thuẫn với nguồn chuẩn.
- Không đổi stack, chuyển sang Firebase, thêm ERP/tính lương/nhận diện khuôn mặt/SSO hoặc sao chép tính năng bên khác chỉ vì hình thức demo.
- Backend là nơi kiểm tra rule/quyền; kiểm thử cả gọi API trực tiếp, không chỉ nút bấm. Không tấn công, đăng nhập hoặc dò dữ liệu hệ thống của bên khác.
- Chỉ sửa UI trong đợt này khi cần luồng nghiệp vụ hoạt động, thể hiện đúng trạng thái/lỗi/quyền; redesign, animation, bố cục và style để sau.
- Chỉ dùng fixture development có nhãn rõ; không thay dữ liệu/tài khoản nghiệm thu hiện hữu để thử lỗi, không dùng dữ liệu thật hoặc secret trong tài liệu/log/Git.
- Worktree đang có thay đổi chưa commit, gồm chỉnh sửa Mobile của người dùng. Review/snapshot phạm vi trước sửa; không reset, scaffold lại hoặc gom toàn bộ worktree vào commit.

## Quy trình cho mỗi module

Bổ sung được Tech Lead duyệt trước R2: vòng đời chi nhánh/phòng ban/chức vụ/team và lọc hiện hành/lịch sử. Migration/API/Web đã bổ sung; không đồng nghĩa R2 đã PASS, không tự dọn dữ liệu cũ. Chi tiết và các case chưa chạy tại `ORGANIZATION_CATALOG_LIFECYCLE.md`.

1. Ghi rule đã chốt, trạng thái/chuyển trạng thái, API/schema liên quan và ma trận actor/phạm vi. Tách rule còn thiếu thành NEEDS_DECISION, không tự suy diễn.
2. Tạo checklist có đầu vào, thao tác, kết quả mong đợi, dữ liệu/audit/thông báo phải phát sinh hoặc tuyệt đối không phát sinh.
3. Kiểm tra happy path, dữ liệu biên/sai, truy cập sai người/sai scope, thao tác trùng/đồng thời, mạng gián đoạn, quyền/phiên thay đổi giữa thao tác và lịch sử cũ.
4. Ghi lỗi tái hiện: endpoint/màn hình, expected/actual, mức độ, dữ liệu fixture và bằng chứng không chứa secret. Lỗi kỹ thuật trái rule đã chốt được sửa đúng vùng; thay đổi policy/API có tác động mới cần chốt trước.
5. Sửa Database → Backend → Web/App liên quan; schema thay đổi có migration. Không sửa module khác trừ dependency bắt buộc, phải ghi rõ lý do.
6. Chạy lại case bị lỗi và regression trực tiếp của module/dependency; typecheck/lint/build theo vùng chạm. Không chạy cả suite sau từng edit. Test tự động chạy có mục tiêu trong lượt được giao kiểm thử module; yêu cầu lập kế hoạch hiện tại không kích hoạt suite.
7. Bàn giao PASS/FAIL/NEEDS_DECISION/NOT_IMPLEMENTED với bằng chứng. Chỉ chuyển module sau khi lỗi chặn được giải quyết hoặc Tech Lead chấp nhận rõ ngoại lệ; commit/push theo chỉ thị áp dụng cho lượt thực thi, không tự deploy production.

## Thứ tự đề xuất

Các mục bắt đầu ở NOT_REVIEWED. R1 đã chạy ngày 2026-10-09: PARTIAL / NEEDS_DECISION, 100/100 targeted tests qua, còn quyết định hash mật khẩu dài và UI máy thật chưa nghiệm thu đầy đủ; xem [biên bản R1](R1_AUTH_ACCEPTANCE.md). R2: Backend/API targeted PASS (85/85), toàn bộ Web/App PARTIAL do chưa nghiệm thu UI Head/Leader/thiết bị; xem [biên bản R2](R2_ORGANIZATION_ACCEPTANCE.md). R3: Backend/API targeted PASS 59/59, UI mở/xem/hủy đã kiểm tra, thao tác cuối/thiết bị PARTIAL; xem [biên bản R3](R3_EMPLOYEES_ACCEPTANCE.md). R4: PARTIAL, lát cắt lịch/schedule-policy 36/36 targeted PASS ngày 2026-10-09; tiếp nối chấm công ngày chung văn phòng/hiện trường ngày 2026-10-10 đã triển khai, 63/63 Backend và 4/4 Mobile targeted PASS, thiết bị thực tế chưa nghiệm thu đầy đủ. Đơn từ và OT hai bước/tuyến riêng đã triển khai tiếp nối: 73/73 Backend, 8/8 Mobile targeted PASS; máy thật vẫn PARTIAL, xem [OT/Đơn từ](R4_OT_FORMS_ACCEPTANCE.md), [lịch](R4_SCHEDULES_ACCEPTANCE.md) và [chấm công ngày](R4_DAILY_ATTENDANCE_ACCEPTANCE.md). R5–R14 vẫn NOT_REVIEWED. Tính năng đã triển khai không đồng nghĩa đã qua đợt nghiệm thu này.

| Mã | Module và source chính | Case trọng tâm / đầu ra nghiệm thu |
| --- | --- | --- |
| R1 | Đăng nhập, phiên, RBAC — auth, Web access, Mobile auth | Mật khẩu hợp lệ/sai; JWT hết hạn/giả; refresh/reuse/thu hồi; Web idle 30 phút và hạn 24 giờ, Mobile 30 ngày; chính sách một phiên và ngoại lệ Head/Leader; mất mạng không xóa phiên; Admin không PIN nhưng vẫn có quyền Backend. |
| R2 | Cơ cấu và quyền quản lý — organization-access, Web organization | Team thuộc một phòng, xuyên chi nhánh; membership không tự cấp quyền; nhiều scope; grant bắt đầu/kết thúc/thu hồi; dữ liệu và ảnh không lọt sang phòng/team khác; đổi tuyến chưa xử lý giữ lịch sử bước đã xong. |
| R3 | Nhân viên/tài khoản — employees, Web employees | Backend/API targeted PASS 59/59; UI/thiết bị PARTIAL. Tạo/sửa, mã/email trùng, phân công chính; whitelist/scope/detail ADMIN; ngừng/khôi phục không hồi sinh phiên. Bổ sung được Tech Lead duyệt: Admin xem username/reset mật khẩu, xóa vĩnh viễn cả hồ sơ đã dùng/kỳ khóa với preview/mã/lý do/audit; giữ dữ liệu chung, hủy quyền/phiên, không tự đổi tuyến. Xem R3_EMPLOYEES_ACCEPTANCE.md. |
| R4 | Lịch làm/chấm công ngày — work-schedules, attendance schedule-policy | PARTIAL: lịch/schedule-policy đã rà; 36/36 targeted ở lát cắt 2026-10-09. Lát cắt 2026-10-10 triển khai một cặp/ngày chung văn phòng/hiện trường, ảnh check-in cả hai, field không cần ticket, checkout GPS chỉ Admin, báo cáo/Excel hình thức. Xem R4_DAILY_ATTENDANCE_ACCEPTANCE.md. Đơn từ/phiếu OT/tuyến riêng/approved OT đã triển khai; 73/73 Backend và 8/8 Mobile targeted PASS, camera/GPS/push máy thật còn NOT_RUN. Xem R4_OT_FORMS_ACCEPTANCE.md. Không tự chuyển R5. |
| R5 | Vị trí văn phòng — office-locations, geofence, Web locations | 2026-10-10: Backend/API 38/38 targeted PASS; sửa validation/null/undefined/concurrent audit và NaN geofence. Web lỗi/retry giữ form đã kiểm tra. Toàn module PARTIAL: ảnh nền bị DNS trên máy dev; quyền vị trí/GPS thật và mutation UI chưa nghiệm thu. Xem R5_LOCATIONS_ACCEPTANCE.md. |
| R6 | Chấm công — attendance, Mobile attendance | Nhân viên/giờ do Backend xác định; một cặp chung office/field theo quyết định R4; request đồng thời thật trên PostgreSQL và xen công tác; replay/mất phản hồi; tọa độ hợp lệ nhưng giả, mock/accuracy thiếu; camera/timemark/ownership/GPS Admin-only; đồng hồ thiết bị sai/ngày mới; bản ghi rủi ro không bị UI/báo cáo coi nhầm là công hợp lệ. |
| R7 | Giải trình/điều chỉnh công — explanation-workflow, adjustments | Nhân viên chủ động gửi, ảnh tùy chọn và quyền đọc; hàng đợi không tạo trùng; Leader xác nhận → Head quyết định; hai actor khác nhau, không tự duyệt; Admin dự phòng chỉ khi tuyến thiếu/hỏng; expectedVersion, lý do/audit/người xử lý thật; duyệt giải trình không tự sửa bảng công; khóa kỳ và sửa công đồng thời. |
| R8 | Công tác/khách hàng — business-trips, Mobile business_trips | Mã CT theo tháng và cấp mã đồng thời; người phụ trách/thành viên đúng; draft/giao/hủy/bắt đầu/kết thúc; không thao tác phiếu người khác; ảnh và quyền truy cập; phiếu/khách hàng ngừng dùng giữ lịch sử; tổng hợp không tính công tác thành vắng hoặc cộng công hai lần. |
| R9 | Nghỉ phép/quỹ phép — leave, leave-workflow, Mobile leave | Loại nghỉ/chính sách, cả ngày/nửa ngày/giờ; trùng đơn, dự trữ quỹ, duyệt/hủy/thu hồi đồng thời không vượt hoặc cộng quỹ sai; tuyến phép độc lập; Admin fallback theo rule; hiệu lực chính sách, cộng dồn, kỳ khóa và thông báo người duyệt thật. |
| R10 | Kỷ luật — disciplinary-actions | Nháp → ban hành → thu hồi; lý do và ngày đình chỉ; hồ sơ bất biến sau ban hành; inbox/audit cùng transaction; không tự trừ lương, khóa tài khoản hoặc sửa công. |
| R11 | Hộp thư/push — announcements, push sender, Mobile announcements | Toàn công ty/phòng/cá nhân đúng người; active recipient snapshot; đọc và xác nhận riêng; gửi lại/thu hồi; foreground/background/app không mở trên máy thật; quyền tắt, token/phiên thu hồi, Firebase lỗi; provider SENT không đồng nghĩa đã nhận/đọc. Thiếu credential: NOT_IMPLEMENTED hoặc chưa nghiệm thu đúng trạng thái, không giả PASS. |
| R12 | Chốt kỳ/báo cáo/Excel — reporting | IMPLEMENTED bốn workbook/nút riêng ngày 2026-10-13; nghiệm thu Kế toán/HCNS PARTIAL. Targeted 47/47 PASS, gồm snapshot/close đồng thời/writer/audit rollback/xóa nhân sự, incomplete export, legacy warning, units và literal text. Thiếu/chờ không chặn xuất nhưng vẫn chặn chốt. Đã seed biệt lập tạo bốn mẫu development-only. Xem R12_REPORTING_ACCEPTANCE.md. |
| R13 | Dashboard/KPI Lite/theo dõi quản lý — Dashboard, kpi, managed-modules | IMPLEMENTED ngày 2026-10-14; Backend/API targeted PASS 46/46 (14 R13 mới, 32 regression trực tiếp R12/managed). Nguồn/chỉ số R12 dùng chung, branch/grant scope/dates/notice privacy, partial leave/approved OT và immutable revision. Web kiểm tra Admin Dashboard/KPI, đổi tháng/empty và đối chiếu báo cáo; chưa nghiệm thu UI đổi vai trò quản lý trên máy thật hoặc production load. Không thêm KPI điểm/payroll/quyền mới. Xem R13_DASHBOARD_KPI_ACCEPTANCE.md. |
| R14 | Vận hành/deployment — operations, deploy, scripts/prod | LOCAL TECHNICAL PASS ngày 2026-10-14: 41/41 targeted (30 unit/regression + 11 Docker/HTTP), migration 24→35 giữ lịch sử, backup/restore DB+ảnh thật và API biệt lập từ bản restore, outages/restart/phiên/snapshot/4 Excel, proxy/log và source-clean gate. Typecheck/lint/Docker builds/Caddy validate PASS. Tech Lead chốt chưa có VPS/domain, chỉ hoàn thiện/nghiệm thu local: production/TLS public/FCM và UI-máy thật/load chưa chứng nhận, các PARTIAL R1–R13 không tự đóng. Xem R14_OPERATIONS_ACCEPTANCE.md/DEPLOYMENT.md. Không coi tunnel development là production. |

R1–R3 có thể dùng cùng bộ fixture nhưng vẫn bàn giao riêng từng mục. R4–R6 là cụm ưu tiên nghiệp vụ check-in; R7–R12 kiểm tra chứng cứ, phê duyệt và bảng công. Không triển khai đồng thời nhiều R.

Cập nhật R5 2026-10-10 thay trạng thái NOT_REVIEWED của R5 trong tổng kết lịch sử phía trên; R6–R14 chưa bắt đầu. Chưa tự chuyển R6 hoặc coi bản đồ nền/GPS đã PASS.

Cập nhật R6 2026-10-10 thay trạng thái chưa bắt đầu ở trên: **PARTIAL**. Đã harden transaction/phiên, chặn GPS reported risk, khóa điện thoại Admin duyệt + per-use sinh trắc/challenge và budget tài khoản 10/20/60. Backend targeted 96 ca qua các lượt cuối (76 + R5 rerun20), Mobile8, Web/build/debug đã kiểm tra; có ca OPEN GAP tọa độ giả được nhận bởi khóa đã duyệt. Chưa nghiệm thu sinh trắc máy thật/root/repacked-app, chưa attestation hoặc production. [Biên bản R6](R6_ATTENDANCE_ACCEPTANCE.md). Không tự chuyển R7.

Cập nhật R7 2026-10-10: **PARTIAL (API/DB + targeted app tests PASS)**. Backend 51 ca qua các lượt cuối (47 + evidence4), Mobile13; typecheck/scoped lint/isolated compile PASS. Đã sửa race điều chỉnh/chốt kỳ và lý do chỉ dấu cách; dùng cùng transaction reader khi kiểm tra ảnh. Kiểm chứng hai bước, fallback đúng điều kiện, quyết định/reroute đồng thời, audit/inbox atomic và ảnh private/immutable trên DB/API biệt lập. Chưa chạy lại end-to-end UI Web/điện thoại thật, offline ảnh/camera và FCM nền; không coi widget test hoặc inbox là nghiệm thu push máy thật. [Biên bản R7](R7_EXPLANATIONS_ACCEPTANCE.md). Không tự chuyển R8.

Tiếp nối R7 cùng ngày: đã thao tác Chrome kiểm tra tìm kiếm/empty/filter và drawer/audit của fixture đã duyệt, không duyệt đơn mới hoặc sửa dữ liệu khách. Native phone UI không khả dụng trong computer-use; đã nhờ Tech Lead gửi đơn/ảnh từ app. Push bị chặn bởi Firebase chưa cấu hình (Backend disabled, thiếu project/service-account), không phải chỉ thiếu thao tác test. Giữ PARTIAL, không ghi máy thật/FCM PASS hoặc chạy lại toàn suite.

Tiếp nối R7 máy thật: đã xác định đơn R7-UAT của DEV-EMPLOYEE thiếu tuyến, mở ảnh có xác thực và duyệt dự phòng qua Admin trên Chrome với lý do. DB/audit/inbox có đúng một quyết định, không giả xác nhận Leader và không tạo điều chỉnh công; Tech Lead xác nhận thấy thông báo trên app. Đây là inbox, không phải FCM. Chọn DEMO-NV có tuyến cho đơn mới kiểm tra hai bước; đang chờ thao tác gửi đơn/đăng nhập Leader. Giữ PARTIAL vì hai bước UI mới/offline/push chưa đủ bằng chứng; không chạy thêm automated test hoặc build.

Cập nhật R8 2026-10-12 thay trạng thái chưa bắt đầu trong tổng kết lịch sử: **PARTIAL** — Backend42/42, Mobile7/7 targeted PASS, typecheck/scoped lint/isolated compile/analyze PASS. Chrome đọc/filter/history PASS; máy thật happy path/mạng yếu và FCM chưa nghiệm thu. Sửa PATCH mất customer link, nháp lộ mine, validation, cancelled completion và ảnh owner/immutable; assignment inbox atomic/push tracked. Migration đã backup/apply development, giữ lịch sử/công ngày. [Biên bản R8](R8_BUSINESS_TRIPS_ACCEPTANCE.md). Không tự chuyển R9 hoặc xuất APK bàn giao.

Cập nhật R9 2026-10-12: **PARTIAL** — Backend46 ca khác nhau/Mobile15 targeted PASS, noEmit/scoped lint/isolated compile/analyze PASS. Kiểm giữ/trừ/hoàn/đơn trùng/partial/cancel-review races, audit rollback, carry/init và period locks. Tech Lead duyệt ngày có lịch nhưng ngày nghỉ 0 phút, thiếu lịch fallback policy; không tính lại đơn cũ hoặc mở nhiều đơn trong ngày. Không migration mới; Chrome chỉ đọc và Hot Reload PASS, mutation UI/máy thật/FCM chưa đủ nghiệm thu. [Biên bản R9](R9_LEAVE_ACCEPTANCE.md). Không tự chuyển R10.

## Bổ sung nghiệm thu app tích hợp 2026-10-14

Tech Lead giao kiểm một lượt Nhân viên → Leader → Trưởng phòng trên điện thoại thật; cho reset demo và skip sinh trắc đã nghiệm thu, không bypass. Các happy path/ảnh/offline/phép/OT/công tác/quyền quản lý/kỷ luật và push foreground/background/cold/tap đã có bằng chứng cụ thể trên RMX5555. Sửa hai lỗi OT-display/session-navigation, 17 regression có mục tiêu PASS; không phát hành APK mới. Xem [biên bản tích hợp](MOBILE_INTEGRATED_ACCEPTANCE.md) cho những ca đạt và NOT_RUN; các trạng thái thiếu bằng chứng máy thật phía trên là lịch sử, không tự coi toàn bộ module/production PASS.

## Ma trận kiểm thử dùng chung

Cập nhật R11 2026-10-13: PARTIAL / NEEDS_PHONE_VERIFICATION. Backend18 targeted/static/isolated compile PASS; audience current-date/target recheck, receipt withdrawal ordering, validation và token sid/race sửa. Firebase Android + FCM-only Backend credential đã cấu hình sau chấp thuận, OAuth/health/debug build-install-attach PASS. Flutter tự cài lại sau lỗi xác minh Android; chờ đăng nhập/cấp lại quyền và background/cold FCM máy thật, chưa PASS. [R11](R11_PUSH_ACCEPTANCE.md). Không tự chuyển R12.

Cập nhật R10 2026-10-13: **PARTIAL** — Backend27 targeted PASS (21 PostgreSQL/HTTP, 4 domain, 2 push adapter); noEmit/scoped lint/isolated compile và Web build riêng PASS. Chốt team/phòng, popup tích sẵn/bỏ ngoại lệ, hồ sơ/inbox riêng; thu hồi roster gốc, không thu hồi riêng notice. Race/rollback/tracking/private scope/xóa nhân sự đã kiểm; migration đã backup/apply development. Chrome preview/ngoại lệ/rỗng/hủy PASS, chưa ban hành thử cho người dùng đang hoạt động. UI mutation/app/FCM nền chưa đủ nghiệm thu. [Biên bản R10](R10_DISCIPLINARY_ACCEPTANCE.md). Không tự chuyển R11.

- Actor: Admin, Kế toán trưởng, Quản lý khu vực, Trưởng phòng, Leader, nhân viên thường; thêm actor ngoài scope và tài khoản/grant hết hiệu lực. Theo đúng quyền đã chốt, không gán quyền quản lý để thuận tiện chạy demo.
- Fixture tổ chức: ít nhất hai phòng/team, hai chi nhánh, team xuyên chi nhánh trong cùng phòng, người có nhiều scope; tách bộ acceptance và bộ thử lỗi.
- Backend: gọi thẳng API với UUID của người khác, body thừa/sai, token sai/hết hạn/thu hồi, expectedVersion cũ và request đồng thời. Test phía client không thay thế kiểm tra quyền tại Backend.
- Web: Admin và quản lý đúng khu vực; lỗi/loading/empty/success; không hiển thị dữ liệu bị Backend từ chối; tải lại khi quyền/scope thay đổi.
- App Android: thiết bị thật qua Wireless Debugging đã kết nối; từ chối quyền, mất Wi-Fi, Backend ngắt, resume/background và đăng nhập lại. Không đóng APK mỗi module; bản bàn giao chỉ build sau gate cuối hoặc yêu cầu riêng.
- Kịch bản xuyên module: office bình thường → giải trình/điều chỉnh → báo cáo; công tác + office → không đếm kép; phép một phần + office → quỹ/tổng giờ đúng; quyền bị thu hồi trong lúc duyệt → từ chối; ban hành kỷ luật → inbox/push → xác nhận; chốt/mở kỳ → audit/Excel.
- Thử nghiệm bảo mật chỉ trên môi trường và tài khoản của dự án do Tech Lead đặt trong scope. Không kiểm tra tấn công website bên khác.

## Quyết định cần chốt tại đúng module

- R4 Tech Lead đã chốt: một lượt in/out/ngày chung văn phòng và hiện trường, 00:00 +07:00 mở ngày mới; hiện trường không cần phiếu, nhập nội dung công việc, chụp camera lúc check-in cả hai hình thức; checkout không ảnh, lấy một GPS chỉ Admin xem. Daily enforcement/field/report đã triển khai ngày 2026-10-10, xem R4_DAILY_ATTENDANCE_ACCEPTANCE.md. Phiếu OT riêng hai bước/tuyến độc lập và Đơn từ đã triển khai; một SUBMITTED/APPROVED mỗi ngày, từ chối cho gửi mới, không ngày tương lai, phút chính xác; chỉ OT đã duyệt vào báo cáo, không suy từ checkout muộn. Chưa tự trừ nghỉ trưa/không thêm lịch qua đêm.
- R6: GPS ngoài vùng, mock, độ chính xác thiếu/xấu được từ chối hay nhận chứng cứ chờ đối soát; cách chống giả tọa độ khác giữa APK và browser. Không hứa chống giả GPS tuyệt đối. Rủi ro đã ghi tại ATTENDANCE_SECURITY_REVIEW.md.
- R6: event idempotency/replay và giới hạn abuse cần contract/ngưỡng được duyệt; không âm thầm bật tự retry chấm công.
- R7/R12: giữ nhất quán writer/adjustment với kỳ bị khóa; rule được chốt trước khi thay transaction ordering hoặc blocker.
- R11: Firebase/SMTP deployment và quyền máy thật; nhắc check-out vẫn NOT_IMPLEMENTED nếu chưa chốt thời điểm/đối tượng/hành vi.
- Nếu nghiệm thu gồm nhân viên dùng iOS/web, xác nhận riêng phạm vi đã có/chưa có. Kế hoạch này không tự mở một employee web mới hoặc coi Android tương đương iOS.
- R3 đã triển khai Admin xem username/reset; nhân viên tự đổi mật khẩu và bàn giao Admin không PIN vẫn NOT_IMPLEMENTED, không tự thêm ngoài scope.

## Tiêu chí dừng/bàn giao

- P0: lộ dữ liệu/quyền, thay đổi công/phê duyệt trái quyền, mất dữ liệu — chặn bàn giao.
- P1: sai công/quỹ, ghi trùng, bỏ qua kỳ khóa, hỏng luồng chính — chặn nghiệm thu module cho đến khi sửa hoặc Tech Lead duyệt rõ ngoại lệ.
- P2: lỗi chức năng phụ hoặc UX không chặn — ghi rõ tác động; lỗi cosmetic gom sang đợt UI sau.
- PASS chỉ khi checklist bắt buộc có bằng chứng đúng môi trường/phiên bản; chưa chạy ghi NOT_RUN, thiếu policy ghi NEEDS_DECISION, chưa có tính năng ghi NOT_IMPLEMENTED. Không lấy typecheck/build hoặc mock test thay cho các case thiết bị/concurrency/push thật.

Mẫu bàn giao mỗi R:

```text
Module / trạng thái:
Rule và scope đã chốt:
Case đã chạy / kết quả / môi trường:
Lỗi phát hiện / sửa / còn mở:
File/API/migration đã chạm (gồm ngoài module và lý do):
Kiểm tra typecheck/lint/build và targeted tests:
Quyết định đang chờ:
Commit/deployment nếu thực sự có:
Bước tiếp theo được giao:
```

## Trạng thái lượt lập kế hoạch

- Đã đối chiếu tài liệu chuẩn, inventory Web/Backend/App và rà soát chấm công hiện có; tạo duy nhất tài liệu kế hoạch này.
- GitNexus chưa có index repo này: dùng source search trực tiếp, không dùng graph repo khác hoặc cài/reindex ngoài scope.
- Link đối chiếu bên ngoài không truy cập được bằng công cụ đọc web ở lượt này. Screenshot là thông tin tham khảo; chưa xác minh kiến trúc/chất lượng Backend bên khác, chưa đăng nhập hay tác động hệ thống đó.
- Không chạy test suite, build, migration, thay rule/code, commit/push hoặc deploy trong lượt lập kế hoạch. Đề xuất bắt đầu R1 khi được Tech Lead giao thực thi.
