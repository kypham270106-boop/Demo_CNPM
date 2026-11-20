# Smart E-Mobility Hub

Backend quản lý xe điện dùng chung, chỗ đỗ và cổng sạc tại các Mobility Hub ở ĐHQG-HCM. **Student** tìm Hub, đặt/nhận/trả xe, đặt chỗ và đăng ký sạc. **Operator** theo dõi mạng lưới, quản lý tài nguyên và tài khoản, xử lý sự cố, điều phối và chạy What-if.

- Swagger UI tại `http://localhost:3000/api/docs` và OpenAPI JSON tại `/api/docs-json`.
- API base URL mặc định `http://localhost:3000/api`. Health check PostgreSQL tại `GET /api/health`.
- [Tích hợp Student Portal và Operator Portal](docs/api/frontend-integration.md)
- [Nguồn nghiệp vụ, ràng buộc và giả định](docs/architecture/decisions.md)
- [Quy trình làm việc nhóm](CONTRIBUTING.md)

## Công nghệ

| Thành phần | Phiên bản | Vai trò |
|---|---|---|
| Node.js / npm | 22.12+ / npm 10+ | Runtime LTS, khóa dependency qua npm |
| TypeScript | 5.9.3 | Kiểu dữ liệu và DTO |
| NestJS / Express | 11.2.10 / 5.3.0 | Module, controller và HTTP |
| PostgreSQL | 17 trong Compose/CI, 18 dùng kiểm thử cục bộ | Transaction, advisory lock và GiST constraints |
| Prisma Client / CLI | 6.19.3 | Data access có kiểu, schema, migration |
| Nest JWT / Google Auth Library | 11.0.2 / 10.9.1 | Bearer token và Google authorization-code flow với PKCE |
| class-validator / class-transformer | 0.14.4 / 0.5.1 | Validation, chuyển kiểu DTO |
| Nest Swagger | 11.4.8 | Hợp đồng OpenAPI từ DTO và response schema |
| Jest / Supertest | 30.5.2 / 7.3.2 | Unit test và test HTTP qua PostgreSQL |
| ESLint / Docker Compose | 9.39.5 / Compose v2 | Kiểm tra code và môi trường chạy tái lập |

Phiên bản đầy đủ và phụ thuộc gián tiếp được khóa trong `package-lock.json`. Phần mềm dùng Node crypto scrypt với salt ngẫu nhiên cho password.

## Kiến trúc và thư mục

```text
Next.js / React (frontend dự kiến)
     -> NestJS Controller + Validation + RBAC
     -> Service theo nghiệp vụ
     -> Prisma Client / Database.write()
     -> PostgreSQL
```

```text
src/
  auth/           Local credentials, Google OAuth, JWT guard
  users/          Hồ sơ, cài đặt, quản trị tài khoản
  hubs/           GPS/polyline, lịch sử tìm kiếm, tài nguyên
  reservations/   Hold, confirm, cancel, pickup, return
  charging/       Nhu cầu sạc, tính lịch, xác nhận, lập lại
  operations/     Mock telemetry, monitoring, incident, dispatch, dashboard
  simulations/    Engine và báo cáo What-if
  common/         Cấu hình, DTO, Prisma, lỗi HTTP, OpenAPI
  jobs.ts         Job đồng bộ trạng thái dựa trên database
prisma/            Schema, migrations, demo seed, khởi tạo Operator
test/              Unit, e2e HTTP trên PostgreSQL
docs/              Hợp đồng frontend và quyết định kiến trúc
.github/workflows/ CI cho backend
```

Backend là modular monolith. Controller nhận/kiểm tra HTTP, Service áp dụng business rule, Prisma thực hiện data access. MockHubDataProvider cung cấp telemetry và DispatchExecutor mô phỏng thực thi lệnh. Engine What-if đọc snapshot PostgreSQL và lưu scenario/report.

## Quick start

Với Node.js, Docker Engine và Docker Compose v2:

```bash
git clone https://github.com/kypham270106-boop/Demo_CNPM.git
cd Demo_CNPM
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Nếu backend đang trong PR, chuyển sang nhánh backend sau khi clone và trước khi chạy `npm ci`. Trên PowerShell dùng `Copy-Item .env.example .env`. Điền chuỗi vừa sinh vào `JWT_SECRET`. Để seed, đặt `ALLOW_DEMO_SEED=true` và tự chọn `DEMO_PASSWORD` dài ít nhất 12 ký tự.

```bash
docker compose up -d --wait db
npm run db:deploy
npm run db:seed
npm run dev
```

Có thể dùng PostgreSQL cài sẵn thay Compose. Tạo database mới, cập nhật `DATABASE_URL`, rồi chạy các lệnh npm. Để chạy toàn bộ bằng container, dùng `docker compose up --build -d --wait`, sau đó `docker compose exec api npm run db:seed` nếu đã bật seed. Nếu cổng host PostgreSQL thay đổi, sửa cả `POSTGRES_PORT` và cổng trong `DATABASE_URL` ở máy host.

Tài khoản demo gồm `student@demo.local` và `operator@demo.local`. Cả hai dùng giá trị `DEMO_PASSWORD` lúc tạo lần đầu. Ba Hub BK, KTX-A, LIB có xe, chỗ đỗ và cổng sạc nhiều trạng thái. Seed có lịch sử trip, phiên sạc mẫu, sự cố và báo cáo mô phỏng.

### Gọi API

```bash
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"student@demo.local","password":"<DEMO_PASSWORD>"}'
curl http://localhost:3000/api/hubs -H "Authorization: Bearer <accessToken>"
```

Swagger có nút **Authorize** để nhập access token. Nếu backend đang trong PR, chuyển sang nhánh backend sau khi clone và trước khi chạy `npm ci`. Trên PowerShell dùng `curl.exe` hoặc `Invoke-RestMethod`. API trả thành công dưới dạng object, array hoặc `{items,total,page,limit}` với danh sách phân trang. Lỗi ví dụ:

```json
{"statusCode":409,"code":"RESOURCE_UNAVAILABLE","message":"The selected resource is unavailable for this window","path":"/api/reservations","timestamp":"2026-11-17T08:00:00.000Z"}
```

### Kiểm thử

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tạo PostgreSQL database riêng có tên kết thúc bằng `_test`. Đặt `DATABASE_URL` của shell vào database đó, giữ `JWT_SECRET` hợp lệ và chạy:

```bash
npm run db:deploy
npm run test:e2e
```

E2e tạo và dọn dữ liệu riêng theo ID ngẫu nhiên. Các ca bao gồm TC-01 đến TC-05, RBAC, validation, timeout, nhận/trả xe, sạc và điều phối. CI lặp lại quy trình trên PostgreSQL 17.

## Biến môi trường

| Biến | Bắt buộc | Mục đích và ví dụ |
|---|---|---|
| `DATABASE_URL` | Có | Kết nối Prisma, ví dụ `postgresql://hub:local_password@localhost:5432/smart_hub` |
| `JWT_SECRET` | Có | Ít nhất 32 byte ngẫu nhiên từ lệnh Quick start |
| `PORT` | Không | Cổng API, mặc định `3000` |
| `JWT_TTL_SECONDS` | Không | Tuổi thọ JWT, mặc định `3600` |
| `CORS_ORIGINS` | Không | Origin frontend phân tách bằng dấu phẩy, mặc định `http://localhost:3001` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Có với Compose | Tên DB, user và mật khẩu riêng cho môi trường |
| `POSTGRES_PORT` | Không | Cổng publish trên loopback, mặc định `5432` |
| `HOLD_MINUTES` | Không | Giữ chỗ và đề xuất sạc, mặc định `5` |
| `PICKUP_GRACE_MINUTES` | Không | Khoảng nhận xe kể từ giờ bắt đầu, mặc định `15` |
| `JOB_INTERVAL_SECONDS`, `HUB_SYNC_SECONDS` | Không | Job polling và telemetry sync, mặc định `10` và `30` |
| `HUB_STALE_SECONDS` | Không | Tuổi tối đa telemetry, mặc định `120` |
| `DISPATCH_TIMEOUT_SECONDS` | Không | Thời hạn thực thi lệnh, mặc định `60` |
| `MOCK_DISPATCH_FAILURE_PERCENT` | Không | Tỉ lệ mô phỏng thất bại 0–100, mặc định `0` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Cả ba khi dùng Google | Đăng ký chính xác callback `http://localhost:3000/api/auth/google/callback` cho local |
| `ALLOW_DEMO_SEED`, `DEMO_PASSWORD` | Có khi seed demo | Bật `true` ở dev và đặt password từ 12 ký tự |
| `BOOTSTRAP_OPERATOR_EMAIL`, `BOOTSTRAP_OPERATOR_NAME`, `BOOTSTRAP_OPERATOR_PASSWORD` | Chỉ khi cấp Operator qua CLI | Email, tên và mật khẩu từ 16 đến 128 ký tự, cấp qua môi trường thực thi |
| `NODE_ENV` | Có khi chạy production | `production` bật cookie Secure và chặn demo seed |

## Database và triển khai

- `202611200002_immutable_operation_hubs` cố định Hub của yêu cầu sạc và Hub nguồn/đích của lệnh điều phối ngay từ khi tạo. Áp dụng bằng `npm run db:deploy`. Khi cần đổi Hub sạc, hủy đề xuất có thể hủy và tạo yêu cầu mới. Với điều phối, xử lý lệnh hiện tại đến trạng thái kết thúc trước khi cấp tài nguyên cho lệnh mới. API lập lại lịch sạc vẫn làm việc tại Hub ban đầu.
- Schema tại `prisma/schema.prisma`. `202611170001_init` tạo bảng và quan hệ. `202611170002_integrity` thêm `btree_gist`, exclusion constraints cho khoảng thời gian đặt xe/chỗ đỗ/cổng sạc/xe sạc, và các CHECK/partial unique. `202611170003_booking_confirmation` bổ sung mã xác nhận, cờ đề xuất sạc điều chỉnh và mặc định giao diện light. `202611200001_hub_resource_integrity` thêm composite foreign keys và trigger để ngăn liên kết tài nguyên khác Hub.
- Khi thay đổi schema, chạy `npm run db:migrate -- --create-only --name ten_thay_doi` trên DB dev. Kiểm tra SQL sinh ra và giữ các constraint viết tay trước khi áp dụng. `npm run db:deploy` dùng để cập nhật DB theo migration có sẵn.
- Một số ràng buộc Hub/resource là SQL tùy chỉnh vì Prisma schema không mô tả trigger hoặc các composite foreign keys bổ sung. Giữ các ràng buộc này khi tạo migration tiếp theo; migration kiểm tra Hub của reservation, charging request và dispatch item tại thời điểm gắn tài nguyên để không làm hỏng lịch sử khi xe được chuyển Hub.
- `npm run db:seed` có thể chạy lại và giữ dữ liệu đã sửa. Để có dữ liệu demo mới từ đầu, tạo database/Compose project mới, áp dụng migrations và seed lại. Sử dụng DB hiện tại mà không yêu cầu reset.
- Ubuntu VPS dùng `docker build --target production -t smart-hub-api .`. Chạy migration như bước phát hành với image target `development` hoặc checkout đã `npm ci`, rồi khởi động image production cùng secrets environment và PostgreSQL riêng. Provision Operator đầu tiên bằng `npm run db:provision-operator` trong môi trường áp dụng migration. Proxy HTTPS tới API và khai báo origin frontend và Google callback HTTPS thực tế.

## Development status

| Module | Status | API | Tests | Notes |
|---|---|---|---|---|
| Auth, Users và Settings | Implemented | `/auth`, `/users`, `/settings` | TC-01, credentials và RBAC | Google flow có cấu hình, callback thực tế cần credentials |
| Hubs và Vehicles | Implemented | `/hubs`, `/vehicles`, `/parking-slots`, `/charging-points` | Unit geo và e2e liên module | Frontend cung cấp polyline |
| Reservations | Implemented | `/reservations` | TC-02, TC-03, timeout và trả xe | Geofence dựa trên dữ liệu gửi từ thiết bị |
| Charging | Implemented | `/charging-requests`, `/charging-schedules` | Unit planner, e2e đặt kèm chỗ và charger fault | Mô phỏng công suất cố định, trạng thái từ job |
| Monitoring, Incident và Dashboard | Implemented | `/monitoring`, `/incidents`, `/dashboard` | TC-04 và unit utilization | Mock telemetry, cảnh báo trong ứng dụng |
| Dispatch | Implemented | `/dispatch-orders` | E2e đủ chỗ, lỗi và thành công | Mock executor |
| What-if | Implemented | `/simulations` | TC-05, unit model và kiểm tra không đổi inventory | Dựa trên snapshot |
| Route từ địa chỉ, IoT, QR, email/push, báo cáo file, thanh toán | Planned | — | — | Ngoài phần backend MVP hiện có |

## Troubleshooting

| Triệu chứng | Cách xử lý |
|---|---|
| PostgreSQL connection failed | Kiểm tra `docker compose ps db`, cổng host, credentials và `DATABASE_URL`. Trong Compose hostname là `db`. |
| Prisma migration failed | Chạy `npx prisma migrate status`. Kiểm tra quyền cài `btree_gist` hoặc nhờ quản trị PostgreSQL bật extension. Kiểm tra backup và SQL lỗi trước khi xử lý migration trên dữ liệu hiện có. |
| Port already in use | Đổi `PORT` hoặc `POSTGRES_PORT`; cập nhật base URL hoặc DATABASE_URL tương ứng. |
| JWT configuration missing | Sinh secret ít nhất 32 byte và kiểm tra shell/Compose đọc đúng `.env`. |
| OAuth disabled | Điền cả ba biến Google hoặc thử email/password. Redirect URI phải giống cấu hình OAuth Client. |
| Docker errors | Kiểm tra `docker compose config`, Docker daemon và `docker compose logs api db`. |
| Seed issues | Kiểm tra migration, `ALLOW_DEMO_SEED=true`, `NODE_ENV` và độ dài password. Nếu đổi mật khẩu seed sau lần đầu, tài khoản hiện có vẫn dùng mật khẩu ban đầu. |
| Test failures | Dùng tên DB có suffix `_test`, chạy migrate trước và kiểm tra `JWT_SECRET`. |
