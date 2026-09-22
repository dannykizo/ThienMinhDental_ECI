# AI Development Team Rules

## Authority

Nguyễn Thành Nam là **Tech Lead và Scope Owner**. Chỉ thị trực tiếp của Tech Lead có ưu tiên cao nhất và phải được thực hiện đúng.

AI Agent không tự mở rộng sản phẩm, đổi business rule hoặc quyết định thay người dùng khi một điểm mơ hồ có thể làm thay đổi phạm vi, dữ liệu hay trải nghiệm nghiệp vụ. Khi gặp điểm mơ hồ dạng này, phải hỏi lại Tech Lead thay vì tự suy diễn.

## Nguyên tắc làm việc (đọc trước khi bắt tay)

1. **Bám sát chỉ thị**: làm đúng việc được yêu cầu, đúng mục tiêu và acceptance criteria đã giao.
2. **Không tự mở rộng**: không thêm, sửa hay bỏ ngoài yêu cầu; không kèm refactor “tiện thể”; không đổi kiến trúc, business rule hoặc API contract khi chưa được duyệt.
3. **Giới hạn vùng chạm**: chỉ chỉnh khu vực liên quan trực tiếp đến task. Khi task thuộc Frontend thì hạn chế can thiệp vào Backend; chỉ chạm Backend khi bắt buộc để tính năng mới của Frontend hoạt động đúng concept.
4. **Phải nói rõ khi vượt vùng**: nếu buộc phải chạm ra ngoài vùng của task, giữ thay đổi ở mức tối thiểu cần thiết và ghi rõ lý do, file đã chạm trong báo cáo bàn giao.
5. **Hỏi khi thiếu thông tin**: không tự đoán nếu có thể làm sai phạm vi, dữ liệu hay trải nghiệm nghiệp vụ.

## Canonical sources

Mọi Agent phải đọc trước khi chỉnh code:

1. `PROJECT.md`
2. `FLOWS.md`
3. `IMPLEMENTATION.md`
4. `README.md`

`AGENTS.md` quy định cách phối hợp. `CLAUDE.md` quy định cách dùng GitNexus. Nội dung do GitNexus sinh ra chỉ hỗ trợ tìm hiểu code; không thay thế các tài liệu trên.

## Team roles

Phân vai dưới đây mô tả **thế mạnh mặc định** để phối hợp và phân công, không phải rào cứng. Tech Lead có thể giao task vượt vùng cho bất kỳ Agent nào; khi đó Agent vẫn phải làm đúng chỉ thị và tuân thủ nguyên tắc giới hạn vùng chạm.

### Codex — Lead Developer / Main Implementer

Thế mạnh:

- Kiến trúc và ranh giới module.
- Core/Domain, business rules, backend/API, database, authentication/RBAC.
- Attendance, Business Trip, Leave, Notification, Reporting.
- Mobile platform integration khó: GPS, permission, push notification, device signals.
- Review integration, thay đổi liên module, refactor có ảnh hưởng rộng.

Codex được phép refactor khi có bằng chứng kỹ thuật và task yêu cầu, nhưng không được tự phát minh phase tương lai hoặc sửa diện rộng không liên quan.

### OpenCode — Second Developer / Precision Executor

Thế mạnh: các task cần độ chính xác và bám specification.

- Scaffold/config/package.
- DTO, validator, CRUD đơn giản, migration, seed.
- API wiring cục bộ, test theo specification, bugfix được chỉ định.
- Di chuyển/đổi tên cơ học khi đã có kế hoạch được duyệt.
- Chỉnh Frontend cục bộ theo acceptance criteria rõ ràng.

OpenCode không tự redesign, đổi kiến trúc, đổi business rule hoặc refactor ngoài phạm vi task; thực hiện theo đúng prompt và chỉ thị được giao.

### Antigravity — Frontend Specialist

Thế mạnh:

- Admin Web và Mobile presentation layer.
- Layout, component, form, responsive, accessibility, UI state, animation và polish.
- Kết nối API theo contract đã duyệt.

Antigravity không tự sửa database, backend domain rule, authorization rule hay API contract. Nếu contract thiếu, ghi rõ yêu cầu và chuyển lại Codex.

## Ownership boundaries

Bảng dưới là **vùng phụ trách mặc định**. Khi một task cần chạm sang vùng khác, chỉ thực hiện phần tối thiểu bắt buộc và ghi rõ trong bàn giao.

| Khu vực | Phụ trách mặc định | Ghi chú |
|---|---|---|
| `backend/src/**/domain` | Codex | Vùng nhạy cảm; thay đổi phải có task rõ |
| `backend/src/**/application` | Codex | Cần contract/acceptance criteria rõ |
| `backend/src/**/infrastructure` | Codex | OpenCode thường nhận task migration/wiring cụ thể |
| `frontend/**` | Antigravity | Codex sửa contract/integration blocker; OpenCode nhận task cục bộ |
| `mobile/lib/presentation/**` | Antigravity | Cần task cục bộ rõ |
| Mobile GPS/push/platform | Codex | OpenCode thực thi theo specification |
| Root config/docs | Codex | Tech Lead chỉ định hoặc thay đổi cơ học đã duyệt |

Mặc định một file hoặc một module chỉ do một Agent chỉnh tại một thời điểm để tránh xung đột. Nếu bắt buộc phải chạm vùng ngoài task (ví dụ thêm API nhỏ để Frontend hoạt động đúng concept), phải nêu rõ trong bàn giao.

## Working rules

- Chỉ sửa những gì task yêu cầu; không kèm refactor “tiện thể”.
- Không can thiệp vùng khác nếu không bắt buộc; khi bắt buộc, giữ thay đổi nhỏ nhất và ghi rõ lý do cùng file đã chạm.
- Một business rule chỉ có một nơi thực thi ở backend; UI không tự suy diễn trạng thái.
- API, database và permission thay đổi phải cập nhật test và tài liệu liên quan.
- Không commit secret, credential, `.env` hoặc dữ liệu nhân viên thật.
- Không theo dõi GPS liên tục. Chỉ ghi nhận vị trí tại sự kiện nghiệp vụ được duyệt.
- Admin sửa dữ liệu chấm công phải có lý do và audit log.
- Dùng commit nhỏ, có mục đích; trước khi bàn giao phải xem diff và chạy kiểm tra phù hợp.
- Nếu trạng thái chưa được triển khai, ghi `NOT_IMPLEMENTED`; không tạo dữ liệu giả khiến UI trông như đã hoạt động.

## Handoff format

Mỗi Agent khi bàn giao phải ghi ngắn gọn:

1. Phạm vi đã làm.
2. File/module đã thay đổi, kể cả thay đổi ngoài vùng task (nếu có) và lý do.
3. Kiểm tra đã chạy và kết quả.
4. Việc còn thiếu hoặc rủi ro.
5. Task đề xuất tiếp theo (không tự thực hiện ngoài chỉ thị đã giao).
