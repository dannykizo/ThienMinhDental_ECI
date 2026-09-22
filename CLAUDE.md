# Claude Code Instructions

## Start here

Trước khi sửa code, đọc theo thứ tự:

1. `AGENTS.md`
2. `PROJECT.md`
3. `FLOWS.md`
4. `IMPLEMENTATION.md`
5. `README.md`

Claude tuân thủ vai trò và ownership trong `AGENTS.md`. Không thay đổi business rule, API contract hoặc phạm vi MVP chỉ dựa trên suy đoán.

## GitNexus workflow

GitNexus là lớp **code intelligence**, không phải nguồn sự thật kiến trúc. Khi code và graph mâu thuẫn với tài liệu canonical, dừng lại, xác minh behavior thực tế và đề xuất cập nhật đúng chỗ; không âm thầm sửa tài liệu theo graph.

### First analysis / regenerate repository skills

Chạy từ repository root sau khi code đã đủ ý nghĩa:

```bash
pnpm --allow-build=@ladybugdb/core --allow-build=gitnexus --allow-build=tree-sitter \
  dlx gitnexus@latest analyze --skills --skip-agents-md
```

`--skills` tạo repo-specific skill tại `.claude/skills/gitnexus-area-*/SKILL.md`.  
`--skip-agents-md` giữ nguyên nội dung hand-authored của `AGENTS.md` và `CLAUDE.md`.

Sau lần analyze đầu, ưu tiên runner cục bộ mà GitNexus tạo:

```bash
node .gitnexus/run.cjs status
node .gitnexus/run.cjs analyze --skills --skip-agents-md
```

Chỉ chạy lại khi có thay đổi code đáng kể, di chuyển/đổi tên module lớn, hoặc index báo stale. Không commit `.gitnexus/`.

### One-time MCP setup on the developer machine

```bash
pnpm dlx gitnexus@latest setup
```

Không cài trùng GitNexus bằng cả plugin và CLI setup cho cùng một Agent. Kiểm tra cấu hình hiện có trước khi setup lại.

### Skills to use

Khi tồn tại, đọc skill phù hợp trước khi làm task:

- `.claude/skills/gitnexus-exploring/SKILL.md`: tìm module, symbol, dependency và execution flow.
- `.claude/skills/gitnexus-impact-analysis/SKILL.md`: kiểm tra blast radius trước thay đổi liên module/API/schema.
- `.claude/skills/gitnexus-debugging/SKILL.md`: trace lỗi theo call chain và flow.
- `.claude/skills/gitnexus-refactoring/SKILL.md`: lập kế hoạch refactor có kiểm soát.
- `.claude/skills/gitnexus-area-*/SKILL.md`: ngữ cảnh theo khu vực nghiệp vụ được sinh bằng `analyze --skills`.

Không dùng GitNexus thay cho test, đọc diff hoặc kiểm tra runtime.

## Task discipline

- Xác định owner và acceptance criteria trước khi sửa.
- Dùng GitNexus để định vị/đánh giá ảnh hưởng khi index còn mới; dùng search cục bộ để xác nhận.
- Không chỉnh file thuộc Agent khác nếu task chưa chuyển ownership.
- Thực hiện thay đổi nhỏ nhất đủ đúng.
- Chạy test/typecheck/lint phù hợp và xem `git diff` trước khi bàn giao.
- Cập nhật `FLOWS.md` khi state/transition đổi; cập nhật `PROJECT.md` khi scope/business rule đổi; cập nhật `IMPLEMENTATION.md` khi kiến trúc hoặc delivery sequence đổi.

