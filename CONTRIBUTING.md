# Làm việc trên Demo_CNPM

1. Lấy nhánh `main` mới nhất và tạo branch `feature/<scope>`, `fix/<scope>` hoặc `docs/<scope>`.
2. Commit theo Conventional Commits, ví dụ `feat(reservations): reject overlapping holds`. Dùng commit nhỏ, có mục đích rõ ràng. Giữ `.env`, log và dữ liệu local ngoài Git.
3. Mở PR vào `main` kèm yêu cầu nghiệp vụ, phạm vi thay đổi hợp đồng, migration, kết quả test và ảnh hưởng đến frontend. Reviewer xác minh các mục bên dưới. Merge khi CI và review đạt.
4. Trước khi merge, vào `apps/backend` rồi chạy `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:deploy` với database kiểm thử, `npm run test:e2e` và `npm run build`.

## Vị trí làm việc

- `apps/backend`: mã nguồn NestJS, Prisma, test, dependency, cấu hình môi trường và Docker. Chạy các lệnh npm, Prisma và Docker Compose tại đây; tạo `.env` từ `.env.example` trong cùng thư mục.
- `apps/frontend`: thư mục dành cho frontend, hiện chỉ có README giữ chỗ.
- `docs`: tài liệu nghiệp vụ, kiến trúc và hợp đồng API dùng chung, tính từ gốc repository.
- `.github/workflows`: cấu hình CI dùng chung. Backend CI chạy trong `apps/backend` và dùng lockfile của backend.

## Review checklist

- Controller dùng DTO và đúng role/owner. Response không lộ password hash, JWT secret hay trường nội bộ.
- Service xử lý lifecycle, idempotency và lỗi có code ổn định. Writer thay đổi phân bổ tài nguyên đi qua `Database.write()`. Kiểm tra cả tranh chấp trên khoảng thời gian nửa mở và tính nhất quán sau rollback.
- Migration có thể áp dụng lên DB đã có dữ liệu và giữ constraint tùy chỉnh. Sau khi migration đã dùng chung, thêm migration mới cho mọi thay đổi.
- Dữ liệu thử nghiệm dùng fixture riêng. Nếu cần test một regression, tái tạo đường gọi HTTP và xác minh trạng thái PostgreSQL.
- Lint dùng ESLint và TypeScript. Đặt tên rõ nghĩa, dùng 2 dấu cách, giữ DTO/controller/service tại module sở hữu và tách hàm domain thuần khi có thể dùng độc lập.

## Thêm module hoặc sửa hợp đồng

1. Tạo module NestJS và đăng ký trong `AppModule`. Khai báo DTO validation, access metadata, Controller và Service. Dùng `Database` cho data access và đưa các luồng chuyển nhiều bảng vào một transaction.
2. Với schema mới, tạo migration bằng `npm run db:migrate -- --create-only --name <name>`. Review SQL và chạy `npm run db:deploy` trên DB sạch và DB dev hiện có. Kiểm tra index, FK, PostgreSQL constraint và khả năng nâng cấp.
3. Khi thêm hoặc đổi route, cập nhật schema phản hồi trong `apps/backend/src/common/openapi.ts`, ví dụ sử dụng và mapping trong `docs/api/frontend-integration.md`. Thảo luận với frontend trước khi xóa trường, đổi enum, HTTP status hoặc business code mà portal đã dùng.
4. Cập nhật README khi đổi lệnh setup, môi trường hoặc trạng thái bàn giao. Ghi quyết định nghiệp vụ mới vào `docs/architecture/decisions.md`.
