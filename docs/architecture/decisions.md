# Quyết định kiến trúc

## Kiểm tra repository và nguồn nghiệp vụ

- Checkout ban đầu chỉ gồm README và commit `17c7e76` trên `main`. Workspace chưa có backend, frontend, API contract, schema, migration, Docker hay CI có thể tái sử dụng.
- Submission 1 được đối chiếu trong `L03_11.pdf` tháng 9/2026. Submission 2 được đối chiếu trong `Phase2_L03_11.pdf`, đặc biệt các luồng tra Hub, reservation, sạc, điều phối, sự cố, What-if và settings.
- Nhóm tài liệu thiết kế tìm thấy gồm `Class_Diagram_Revised.drawio`, `Component_View_Revised.drawio`, `Deployment_View_Revised.drawio`, `Class_Diagram_Method_Description.docx.pdf` và bản giao diện `BTL_CNPM.pdf`. Final Submission 3 được xác nhận theo tiêu đề và nội dung của bản 32 trang `L03_11.pdf` trong thư mục Desktop dự án. Bản này có Deployment/Development View, class model và TC-01 đến TC-05.
- Thứ tự triển khai là schema và migration, luồng Student, luồng Operator, kiểm thử PostgreSQL và bàn giao hợp đồng API. Các quyết định dưới đây ghi lại khoảng trống trong đặc tả dùng để triển khai.

## Assumption

| Quyết định | Ảnh hưởng |
|---|---|
| Role điều phối chuẩn hóa thành `OPERATOR` | Hai role duy nhất là `STUDENT` và `OPERATOR`. Quyền được đọc từ database mỗi lần xác thực nên việc khóa có hiệu lực với token đã cấp. |
| Sạc, đặt chỗ và điều phối dùng chung transaction advisory lock PostgreSQL | Một writer nghiệp vụ tại một thời điểm, kể cả nhiều API replicas. Database có GiST exclusion constraints riêng cho xe, chỗ đỗ, cổng sạc và danh tính xe sạc. Kiểm tra chéo giữa các bảng được thực hiện trong transaction. Giải pháp phù hợp quy mô nhóm Hub MVP. |
| Cửa sổ tài nguyên là nửa mở `[startsAt, endsAt)` | Hai hoạt động có thể kề nhau. Hold giữ 5 phút theo ví dụ luồng hết hạn của Submission 1, có thể cấu hình 10 phút theo giá trị trong mô tả lớp Submission 3. Mã xác nhận sinh khi confirm và được lưu cùng giao dịch. Thời điểm nhận xe từ lúc bắt đầu đến tối đa 15 phút, đồng thời trước giờ kết thúc. Xe đang trên đường giữ trạng thái `IN_USE` đến khi trả. |
| Check-in bằng tọa độ do thiết bị gửi, bán kính 150 m | Chạy được với prototype GPS. Xác thực QR, định danh thiết bị và xác minh vị trí bằng phần cứng nằm trong Planned. |
| Chỗ đỗ xe trả/xe điều phối phải khả dụng từ hiện tại trở đi | Xe dùng chung chiếm chỗ đến lần xuất tiếp theo. Xe có đặt chỗ kế tiếp phải được trả về Hub giữ xe cho lần đặt đó. |
| Ngưỡng pin xe sẵn sàng 15% | Áp dụng yêu cầu Submission 1 vào tìm xe khả dụng. Pin giả lập chỉ giảm trên xe rảnh, không có lịch giữ tương lai, cách lần cập nhật ít nhất 15 phút, với mức sàn 15%. |
| Khoảng cách GPS dùng Haversine, lộ trình dùng polyline đã có | Frontend gọi routing provider riêng để biến điểm đầu/cuối hoặc địa chỉ thành polyline. API tính khoảng cách tới các đoạn trong phạm vi campus. Tìm lại với bán kính lớn hơn hoặc dùng gợi ý khi không có kết quả. |
| Sạc dùng công suất cổng và dung lượng pin khai báo | Công suất được giả định ổn định. Cửa sổ có thể sinh đề xuất rút ngắn, tối đa 24 giờ mỗi phiên. Cổng lỗi đưa lịch sang `NEEDS_REPLAN`. Sạc và trạng thái cổng được cập nhật định kỳ bằng dữ liệu mock. |
| Mỗi cổng gắn vào một chỗ đỗ cùng Hub | Có thể đặt chỗ độc lập hoặc liên kết hold với đề xuất sạc. Xác nhận đề xuất liên kết cập nhật cả hai trong cùng transaction. Xe cá nhân dùng alias chuẩn hóa trong phạm vi tài khoản. |
| Stale và overload được đánh giá theo từng Hub | Mặc định stale sau 120 giây, ngưỡng 85% cho parking/charging. Cảnh báo gắn mức độ và được coi là chưa xác minh khi dữ liệu stale. Operator xử lý và ghi lý do đóng. |
| Điều phối dùng executor mock | Lệnh được tạo Pending và chạy qua thao tác Execute. Khi bắt đầu, hệ thống ghi attempt và trạng thái xe. Khi thành công mới đổi Hub và chỗ đỗ. Worker ghi Failed nếu attempt hết hạn. |
| What-if dùng snapshot nhất quán với demand mỗi giờ | Làm tròn lên sau khi nhân hệ số và thời lượng. Công suất dựa trên tồn kho tại thời điểm snapshot, không tái sử dụng tài nguyên trong cùng kịch bản. Chỉ scenario/report được ghi. |
| Google cấp tài khoản Student mới theo subject | Cookie state ký JWT dùng PKCE. Email đã tồn tại phải dùng phương thức đăng nhập cũ. Operator được cấp bằng CLI hoặc một Operator đang hoạt động. |

## Ràng buộc và đầu mối dữ liệu

- `User`–`UserSettings` là một-một. User–Reservation/ChargingRequest/SearchHistory/DispatchOrder/SimulationScenario là một-nhiều.
- Hub–Vehicle, ParkingSlot, ChargingPoint và Incident là một-nhiều. Xe đang đỗ và ChargingPoint liên kết từng ParkingSlot bằng khóa duy nhất.
- Reservation liên kết đúng một Vehicle hoặc ParkingSlot. ChargingRequest có thể liên kết một ParkingSlot Reservation. ChargingRequest–ChargingSchedule là một-nhiều để giữ đề xuất cũ sau khi lập lại.
- DispatchOrder–Vehicle là nhiều-nhiều qua DispatchOrderItem; mỗi item giữ một chỗ đích riêng. SimulationScenario–SimulationReport là một-nhiều.
- FK bảo toàn lịch sử. Settings được xóa theo User nếu không có ràng buộc còn giữ User. Hub của SearchHistory được đặt null khi Hub bị xóa hợp lệ. Không có route xóa dữ liệu master. Index bao phủ truy vấn sẵn sàng, lịch sử, trạng thái và công việc định kỳ.
- Composite foreign keys giữ Vehicle/ChargingPoint/Reservation slot, ChargingRequest reservation/point, và Incident point trong cùng Hub. Trigger kiểm tra Hub cho liên kết tới xe ở thời điểm tạo/cập nhật và kiểm tra Hub nguồn/đích của DispatchOrderItem. Các ràng buộc lịch sử chỉ kiểm tra khi gắn tài nguyên; chuyển Hub xe sau đó không làm mất lịch sử đặt chỗ, sạc hay điều phối.
- `202611170001_init` tạo các bảng, enum, quan hệ và index Prisma. `202611170002_integrity` thêm `btree_gist`, CHECK, exclusion constraints và partial unique indexes. `202611170003_booking_confirmation` thêm mã xác nhận, lưu cờ lịch sạc điều chỉnh và đổi mặc định theme sang light. `202611200001_hub_resource_integrity` thêm khóa duy nhất tổng hợp, composite foreign keys và trigger Hub/resource. Kiểm tra migration mới để giữ nguyên SQL ngoài schema Prisma. [Prisma 6 Customizing migrations](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/customizing-migrations)

## Planned

Định tuyến từ địa chỉ, IoT thật, xác nhận trả bằng phần cứng/QR, recovery tài khoản hoặc liên kết OAuth vào tài khoản local, xác thực Google với credentials thực tế, xuất báo cáo theo tệp, chuỗi thời gian dài hạn, tối ưu giá điện/công suất theo toàn mạng, thông báo ngoài ứng dụng, tự động chuyển booking sang Hub khác, đánh giá chuyến đi và thanh toán.
