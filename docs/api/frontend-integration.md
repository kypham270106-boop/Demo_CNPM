# Tích hợp frontend

API mặc định `http://localhost:3000/api`. Frontend Next.js có thể đặt `NEXT_PUBLIC_API_BASE_URL` và chạy cổng 3001 tương ứng với `CORS_ORIGINS`. Swagger UI ở `/api/docs`, JSON ở `/api/docs-json`. Mỗi operation khai báo role, input schema, response schema, HTTP status và ví dụ lỗi.

## Xác thực

1. Gửi `POST /auth/login` với `{email,password}`; nhận `{accessToken,tokenType,expiresIn,user}`. Dùng `Authorization: Bearer <accessToken>` cho request tiếp theo.
2. Dùng `GET /auth/me` để tải role. `STUDENT` vào Student Portal và `OPERATOR` vào Operator Portal. Khi 401 hoặc mã `INVALID_TOKEN`, chuyển về đăng nhập. `ACCOUNT_LOCKED` trả 403. JWT mặc định hết hạn sau một giờ.
3. Google OAuth dùng navigation tới `GET /auth/google`. Google quay lại `GET /auth/google/callback` với cookie state và trả session JSON. Với frontend tách origin, tích hợp callback qua reverse proxy/cùng origin hoặc dùng local login trong quá trình phát triển. OAuth cần credentials và redirect URI đăng ký đúng. Tài khoản email đã có sẽ nhận `OAUTH_ACCOUNT_EXISTS`.
4. `GET /users/me` đọc profile, `PATCH /users/me` cập nhật `name`. `GET/PATCH /settings` lưu `language` (`vi/en`), `theme` (`light/dark/system`) và `notifications` (boolean). `POST /settings/reset` phục hồi thiết lập tiếng Việt và giao diện sáng.

## Student Portal

| Màn hình | Request | Kết quả |
|---|---|---|
| Bản đồ | `GET /hubs`, `POST /hubs/search` | Hub, độ tươi telemetry, khoảng cách, đếm tài nguyên và `suggestedRadiusKm` |
| Chi tiết và tìm kiếm | `GET /hubs/:id`, `GET /hubs/search-history` | Hub, xe, chỗ đỗ, cổng sạc và lịch sử của user |
| Chọn tài nguyên | `GET /hubs/:id/availability?startsAt=...&endsAt=...`, `GET /vehicles`, `GET /parking-slots`, `GET /charging-points` | Availability theo thời gian và danh sách tài nguyên |
| Giữ chỗ và xác nhận | `POST /reservations`, `POST /reservations/:id/confirm` | `HELD` kèm `holdExpiresAt`, rồi `CONFIRMED` kèm `confirmationCode` và `pickupBy` nếu là xe |
| Quản lý đặt chỗ | `GET /reservations`, `GET /reservations/:id`, `POST /reservations/:id/cancel` | Chi tiết và lịch sử của user |
| Nhận/trả | `POST /reservations/:id/pickup`, `POST /reservations/:id/return` | `IN_USE`, sau đó `COMPLETED`; body nhận gồm tọa độ, body trả gồm `hubId` và `condition` tùy chọn |
| Đăng ký và điều chỉnh sạc | `POST /charging-requests`, `GET /charging-requests`, `POST /charging-requests/:id/replan` | Nhu cầu và `proposal` |
| Xác nhận/hủy sạc | `GET /charging-schedules`, `POST /charging-schedules/:id/confirm`, `POST /charging-schedules/:id/cancel` | Lịch sạc và trạng thái, kèm cập nhật reservation liên kết |

Body tra Hub theo GPS là `{"gps":{"latitude":10.8808,"longitude":106.8052},"radiusKm":3}`. Với tuyến đường dùng `route` là mảng từ 2 đến 250 cặp `{latitude,longitude}`. Frontend lấy polyline từ routing provider đã chọn. Mở rộng bằng cách gửi lại request với bán kính mới. Khi hết chỗ, `GET /hubs/:id/parking-alternatives?startsAt=...&endsAt=...&charging=true` trả tối đa năm Hub lân cận và khung giờ thay thế gần nhất trong 24 giờ tại Hub đã chọn. Gửi lại yêu cầu giữ chỗ khi người dùng chọn phương án.

### Ví dụ đặt và sạc

Chọn ID thật từ availability và gửi ngày giờ ISO 8601 có timezone. Thay thời gian ví dụ bằng cửa sổ tương lai.

```json
{
  "hubId": "00000000-0000-4000-8000-000000000010",
  "slotId": "00000000-0000-4000-8000-000000000022",
  "startsAt": "2026-11-17T10:00:00+07:00",
  "endsAt": "2026-11-17T11:00:00+07:00"
}
```

Đặt xe dùng `vehicleId` thay `slotId`. Với chỗ đỗ kèm sạc, gửi ID hold từ response và body sau tới `POST /charging-requests`.

```json
{
  "hubId": "00000000-0000-4000-8000-000000000010",
  "reservationId": "<hold-uuid>",
  "pointId": "00000000-0000-4000-8000-000000000050",
  "personalVehicleRef": "xe-dien-ca-nhan",
  "currentBattery": 35,
  "targetBattery": 80,
  "capacityKwh": 0.6,
  "startsAt": "2026-11-17T10:00:00+07:00",
  "endsAt": "2026-11-17T11:00:00+07:00"
}
```

Dùng `proposal.id` để xác nhận sạc và chỗ đỗ trong một thao tác. `proposal.adjusted` báo hệ thống đề xuất phiên ngắn hơn hoặc mức pin dự kiến thấp hơn yêu cầu. Có thể gửi `durationMinutes` nếu muốn đặt giới hạn thời lượng. `NEEDS_REPLAN` yêu cầu gửi cửa sổ mới. Lịch `CHARGING` chạy đến hết phiên; lỗi cổng chuyển sang `NEEDS_REPLAN`.

## Operator Portal

| Màn hình | Request | Kết quả |
|---|---|---|
| Dashboard | `GET /dashboard`, `GET /monitoring`, `POST /monitoring/check` | Hub snapshot, vị trí, tổng tài nguyên, cảnh báo và thống kê theo trạng thái booking |
| Tài khoản | `GET/POST /users`, `PATCH /users/:id` | Danh sách, cấp người dùng, khóa/mở bằng `{active}` |
| Inventory | `POST /hubs`, `PATCH /hubs/:id`, `POST /vehicles`, `PATCH /vehicles/:id`, `POST /parking-slots`, `POST /charging-points` | Cấu hình Hub và quản lý tài nguyên |
| Cổng sạc | `PATCH /charging-points/:id/status` | Nhận `{status:"FAULTED"}` hoặc `{status:"AVAILABLE"}`; báo lỗi tạo incident |
| Reservations và lịch sạc | `GET /reservations`, `POST /reservations/:id/cancel`, `GET /charging-requests`, `GET /charging-schedules` | Phạm vi toàn hệ thống với Operator |
| Dispatch | `POST /dispatch-orders/proposals`, `GET/POST /dispatch-orders`, `GET /dispatch-orders/:id`, `POST /dispatch-orders/:id/execute` | Hub nguồn, đơn, danh sách xe và trạng thái thực thi |
| Incidents | `GET/POST /incidents`, `GET/PATCH /incidents/:id` | Cảnh báo và việc xử lý. Khi `RESOLVED` cung cấp `resolution`. |
| What-if | `GET/POST /simulations`, `GET /simulations/:id`, `POST /simulations/compare` | Scenario, kết quả nhu cầu/đáp ứng, nguy cơ quá tải, so sánh theo `reportIds` |

Dispatch proposal dùng `{targetId,type,count}`; tạo lệnh thêm `sourceId`. Lệnh trả một trong `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`. Thất bại đã theo dõi có HTTP 200 và trường `failure`. What-if nhận `{name,horizonMinutes,demandMultiplier,demand:[{hubId,rides,parking,charging}]}` với demand theo giờ.

## Danh sách, thời gian và lỗi

Danh sách có `page` bắt đầu từ 1 và `limit` mặc định 25, tối đa 100. Response `{items,total,page,limit}`. Inventory sắp xếp theo mã, các danh sách lịch sử theo `createdAt` giảm dần rồi theo ID, GPS theo khoảng cách. `q` được dùng để tìm Hub/xe/chỗ/cổng/tài khoản/tên kịch bản và ID reservation hợp lệ. Chi tiết filter `hubId`, `status`, `type`, `minBattery`, `role` và `active` theo Swagger.

| HTTP | Ví dụ mã | Hành động frontend |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_WINDOW` | Hiển thị trường lỗi từ `details` hoặc hướng dẫn sửa cửa sổ |
| 401/403 | `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `FORBIDDEN` | Hiển thị lỗi đăng nhập, trạng thái khóa hoặc quyền |
| 404 | `HUB_NOT_FOUND`, `RESERVATION_NOT_FOUND` | Tải lại danh sách hoặc về màn hình trước |
| 409 | `RESOURCE_UNAVAILABLE`, `RESOURCE_CONFLICT`, `RESERVATION_EXPIRED`, `HUB_STALE`, `RETURN_HUB_FULL`, `CHARGING_POINT_FAULTED`, `NO_CHARGING_SLOT` | Tải lại availability, đổi tài nguyên, Hub hoặc cửa sổ |
| 502/503 | `OAUTH_PROVIDER_ERROR`, `DATABASE_UNAVAILABLE`, `OAUTH_DISABLED` | Hiển thị lỗi dịch vụ; có thể quay về login local hoặc thử lại |

Lỗi luôn có `statusCode`, `code`, `message`, `path`, `timestamp`; `details` xuất hiện khi validation có danh sách lỗi. Popup thông báo nên ánh xạ theo `code`.

Seed local cung cấp `student@demo.local` và `operator@demo.local` dùng `DEMO_PASSWORD`. Có thể dùng Hub BK, KTX-A và LIB để lấy ID qua `GET /hubs`. Frontend repo hiện chưa có mã gọi API cần chuyển đổi.
