# Smart E-Mobility Hub - Frontend

Giao diện web frontend của dự án **Smart E-Mobility Hub**, được xây dựng bằng **React + TypeScript + Vite**. Ứng dụng cung cấp các màn hình và luồng thao tác cho hai nhóm người dùng chính: **Sinh viên (Student)** và **Operator**, bao gồm đăng nhập, tra cứu hub theo lộ trình, đặt dịch vụ (xe/chỗ đỗ/sạc), theo dõi đặt chỗ và các màn hình quản trị/giám sát ở phía Operator.

> Tài liệu này được viết dựa trên mã nguồn frontend hiện có trong thư mục `frontend/`. Một số chức năng phụ thuộc vào API backend và các dịch vụ bản đồ bên ngoài được frontend gọi trực tiếp.

## Mục lục

- [Giới thiệu](#giới-thiệu)
- [Chức năng chính](#chức-năng-chính)
  - [Sinh viên (Student)](#sinh-viên-student)
  - [Operator](#operator)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Kiến trúc và cấu trúc thư mục](#kiến-trúc-và-cấu-trúc-thư-mục)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Cài đặt và chạy Frontend](#cài-đặt-và-chạy-frontend)
- [Biến môi trường](#biến-môi-trường)
- [Hướng dẫn sử dụng](#hướng-dẫn-sử-dụng)
- [Scripts có sẵn](#scripts-có-sẵn)
- [Lưu ý](#lưu-ý)

## Giới thiệu

Frontend của Smart E-Mobility Hub là một ứng dụng SPA (Single Page Application) sử dụng **React Router** để điều hướng giữa các trang dành cho Student và Operator. Ứng dụng giao tiếp với backend thông qua **Axios** (`baseURL` lấy từ biến môi trường `VITE_API_BASE_URL`) và sử dụng token truy cập (Bearer token) được lưu ở `localStorage` hoặc `sessionStorage` sau khi đăng nhập.

Bên cạnh dữ liệu từ backend, một số tính năng tìm kiếm lộ trình/hub trên giao diện Student sử dụng các dịch vụ bản đồ và định tuyến bên ngoài (được gọi trực tiếp từ frontend).

## Chức năng chính

### Sinh viên (Student)

Dựa trên các route và component hiện có (`src/App.tsx`, `src/components/auth`, `src/components/common/student/*`, `src/services/*`):

- **Đăng nhập Student**
  - Màn hình đăng nhập tại `/login` (chế độ `student`).
  - Gửi yêu cầu đăng nhập tới endpoint `/auth/login`.
  - Kiểm tra vai trò người dùng trả về là `student` trước khi cho phép truy cập.
  - Hỗ trợ tùy chọn ghi nhớ đăng nhập (`Remember me`) để lưu `accessToken` và thông tin `user` vào `localStorage` hoặc `sessionStorage`.
  - Có liên kết chuyển sang trang đăng nhập Operator.

- **Dashboard sinh viên** (`/student`)
  - Tải và hiển thị dữ liệu đặt chỗ và yêu cầu sạc từ dịch vụ frontend (`studentService`/API reservations & charging requests).
  - Hiển thị các khu vực/thao tác liên quan đến đặt chỗ, lịch/yêu cầu sạc, điều hướng đến các luồng đặt dịch vụ và trả xe (theo logic hiện có trong component dashboard).
  - Hỗ trợ các thao tác như xem trạng thái, hủy (đặt chỗ/yêu cầu sạc tùy trạng thái), nhận xe (pickup) và điều hướng trả xe khi dữ liệu/điều kiện phù hợp.
  - Có chức năng đăng xuất và điều hướng trong giao diện dashboard.

- **Tìm kiếm lộ trình và Hub** (`/student/booking/search`, `/student/booking/results`, `/student/booking/options`)
  - Nhập điểm xuất phát và điểm đến, hỗ trợ gợi ý địa điểm, chọn từ gợi ý, chọn vị trí trên bản đồ (Leaflet), và lấy vị trí hiện tại (GPS trình duyệt) cho điểm đi.
  - Hỗ trợ đổi chiều điểm đi/điểm đến, xóa thông tin, lưu địa điểm yêu thích (lưu trong `localStorage`), và lịch sử tìm kiếm (lưu trong `localStorage`).
  - Tính toán tuyến đường và tìm Hub liên quan đến lộ trình thông qua `route.service`.
  - Trang kết quả hiển thị Hub phù hợp trên bản đồ/danh sách, hỗ trợ lọc (ví dụ: theo loại phương tiện, mức pin > 50%), chọn **Hub nhận xe** và **Hub trả xe đề xuất**.
  - Trang lựa chọn dịch vụ sau khi chọn Hub (`/student/booking/options`) cho phép tiếp tục sang luồng đặt xe hoặc đặt chỗ đỗ cá nhân tại Hub đã chọn.

- **Chọn và đặt dịch vụ**
  - **Chọn loại dịch vụ** (`/student/reservation`): chọn đặt xe hoặc đặt chỗ đỗ.
  - **Đặt xe điện dùng chung** (`/student/reservation/vehicle`): chọn Hub, thời gian sử dụng, kiểm tra phương tiện khả dụng theo thời gian/Hub, chọn phương tiện và tạo yêu cầu đặt xe.
  - **Đặt chỗ đỗ xe cá nhân** (`/student/reservation/parking`): chọn Hub, thời gian sử dụng (có lựa chọn thời gian kết thúc cụ thể hoặc chưa xác định), tải và chọn chỗ đỗ trống, tạo yêu cầu đặt chỗ.
  - **Đặt chỗ kèm sạc** (`/student/reservation/charging`): chọn Hub và thời gian, chọn vị trí đỗ có cổng sạc khả dụng, nhập thông tin sạc (ví dụ: mã tham chiếu xe cá nhân, pin hiện tại/mục tiêu), hệ thống frontend tính thời lượng sạc dự kiến và gửi yêu cầu đặt chỗ + yêu cầu sạc (theo luồng trong component).

- **Xác nhận / hủy / hoàn tất luồng đặt chỗ** (`/student/reservation/confirmation`)
  - Hiển thị thông tin tóm tắt yêu cầu đặt dịch vụ (xe/chỗ đỗ/chỗ đỗ kèm sạc) từ dữ liệu điều hướng.
  - Thực hiện xác nhận đặt chỗ hoặc xác nhận lịch sạc (tùy loại dịch vụ).
  - Hỗ trợ hủy yêu cầu/lịch sạc trước khi hoàn tất (theo luồng và trạng thái tại màn hình).
  - Hiển thị trạng thái kết quả (chờ xác nhận/đã xác nhận/đã hủy) và thông báo lỗi/thành công.

- **Trả xe** (`/student/vehicle-return`)
  - Màn hình trả xe nhận thông tin đặt chỗ/xe từ điều hướng (navigation state) hoặc tải dữ liệu liên quan.
  - Cho phép chọn Hub trả xe, hiển thị thông tin chuyến đi và hỗ trợ lấy vị trí hiện tại/tính tuyến đường đến Hub trả xe (khi có dữ liệu phù hợp).
  - Gửi yêu cầu trả xe qua API (qua `reservationService`).

### Operator

Dựa trên các route và component hiện có (`/operator/login`, `/operator`, `src/components/common/operator/*`, `src/services/operator.service.ts`):

- **Đăng nhập Operator**
  - Màn hình đăng nhập tại `/operator/login` (chế độ `operator`).
  - Gửi yêu cầu đăng nhập tới endpoint `/auth/login`.
  - Kiểm tra vai trò người dùng trả về là `operator` trước khi cho phép truy cập.
  - Có liên kết quay lại trang đăng nhập Student.

- **Dashboard Operator** (`/operator`)
  - Tải dữ liệu tổng hợp cho dashboard thông qua `operatorDashboardService` (gọi các endpoint như `/hubs`, `/vehicles`, `/parking-slots`, `/charging-points`, `/reservations`, có xử lý phân trang để lấy dữ liệu).
  - Hiển thị tổng quan hệ thống (ví dụ: thẻ thống kê, hoạt động gần đây, khu vực bản đồ/marker hub, khu vực biểu đồ/tình trạng theo dữ liệu frontend xử lý).
  - Điều hướng giữa các trang quản lý trong dashboard (menu/tabs): Tổng quan, Mobility Hub, Phương tiện, Chỗ đỗ & cổng sạc, Đặt chỗ.
  - Có chức năng đăng xuất.

- **Các trang quản lý trong khu vực Operator**
  - **Mobility Hub (`MobilityHubManagement`)**: giao diện quản lý danh sách Hub với tìm kiếm/lọc/thống kê và biểu mẫu thêm/sửa/xóa trong component hiện tại. (Theo mã nguồn hiện tại, component này sử dụng dữ liệu mẫu và trạng thái cục bộ trong frontend.)
  - **Phương tiện (`VehicleManagement`)**: tải dữ liệu phương tiện và Hub từ API, hiển thị danh sách/thống kê, tìm kiếm/lọc, thêm phương tiện và cập nhật thông tin phương tiện (theo form/API hiện có).
  - **Chỗ đỗ & cổng sạc (`ParkingChargingManagement`)**: tải dữ liệu chỗ đỗ, cổng sạc và Hub từ API, hiển thị theo tab (chỗ đỗ/cổng sạc), tìm kiếm/lọc, thêm chỗ đỗ/cổng sạc và cập nhật trạng thái cổng sạc (theo API hiện có).
  - **Đặt chỗ (`ParkingManagement` component, được import và hiển thị như trang quản lý đặt chỗ trong dashboard)**: tải danh sách đặt chỗ và Hub từ API, hiển thị thống kê/tìm kiếm/lọc, xem chi tiết đặt chỗ trong modal (chế độ xem dữ liệu).

## Công nghệ sử dụng

### Frontend runtime & framework
- **React** (`react`, `react-dom`) + **TypeScript**
- **Vite** (dev server/build tool)
- **React Router DOM** (điều hướng SPA)

### UI, bản đồ, biểu tượng
- **Leaflet** và **React Leaflet** (hiển thị bản đồ/chọn vị trí trong các luồng tìm kiếm/lộ trình)
- **Lucide React** (icon)

### Giao tiếp API & tiện ích
- **Axios** (HTTP client, interceptor gắn Bearer token, xử lý thông báo lỗi 401/403 ở tầng client)

### Chất lượng mã nguồn & cấu hình TypeScript
- **ESLint** (`eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`)
- **TypeScript** (`typescript`, `@types/*`)

> Phiên bản cụ thể được khai báo trong `frontend/package.json`.

## Kiến trúc và cấu trúc thư mục

### Tổng quan kiến trúc frontend

- **Entry point**: `src/main.tsx` khởi tạo React app và render `App`.
- **Routing**: `src/App.tsx` định nghĩa toàn bộ route chính cho Student và Operator bằng `react-router-dom`.
- **Tầng giao tiếp API**:
  - `src/services/api.ts`: tạo Axios instance, cấu hình `baseURL` từ `import.meta.env.VITE_API_BASE_URL`, gắn token tự động vào header `Authorization`, chuẩn hóa một số thông báo lỗi xác thực/quyền truy cập.
  - `src/services/student.service.ts`, `reservation.service.ts`, `operator.service.ts`, `route.service.ts`: gom logic gọi API và xử lý dữ liệu theo miền chức năng.
  - `src/services/reservationUtils.ts`, `useLocationField.ts`: tiện ích/hook hỗ trợ form, xử lý thời gian, nhập địa điểm.
- **Tầng UI**: component theo vai trò/chức năng trong `src/components/auth` và `src/components/common/{student,operator}`.
- **Styling**: CSS theo từng component/trang (ví dụ `.css` cùng thư mục component) và stylesheet chung (`src/index.css`, `src/App.css`).
- **Tài nguyên tĩnh**: `public/` và `src/assets/`.

### Cấu trúc thư mục (frontend)

```text
frontend/
├─ public/                         # Tài nguyên tĩnh phục vụ trực tiếp
│  ├─ favicon.svg
│  └─ icons.svg
├─ src/
│  ├─ assets/                      # Ảnh/tài nguyên dùng trong mã nguồn
│  ├─ components/
│  │  ├─ auth/
│  │  │  └─ Login.tsx              # Đăng nhập Student/Operator (theo mode)
│  │  └─ common/
│  │     ├─ student/
│  │     │  ├─ Dashboard/          # Dashboard sinh viên
│  │     │  ├─ Search/             # Tìm lộ trình, kết quả Hub, chọn dịch vụ sau tìm kiếm
│  │     │  ├─ Charging/           # Đặt chỗ kèm sạc
│  │     │  └─ StudentReservation/ # Chọn dịch vụ, đặt xe/chỗ đỗ, xác nhận, trả xe
│  │     └─ operator/
│  │        ├─ Dashboard/          # Dashboard operator
│  │        └─ Management/         # Quản lý Hub, phương tiện, chỗ đỗ/cổng sạc, đặt chỗ
│  ├─ services/                    # Axios client, services gọi API/nghiệp vụ frontend
│  ├─ App.tsx                      # Khai báo routes
│  ├─ main.tsx                     # Bootstrap ứng dụng React
│  ├─ index.css
│  └─ App.css
├─ .env                            # Biến môi trường Vite (cục bộ)
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
├─ tsconfig.app.json
└─ tsconfig.node.json
```

## Yêu cầu hệ thống

- **Node.js**: khuyến nghị phiên bản LTS hiện tại (tương thích với toolchain Vite/React trong dự án).
- **npm**: đi kèm Node.js (dự án có `package-lock.json`).
- **Trình duyệt**: hỗ trợ JavaScript hiện đại; một số tính năng dùng Geolocation API (GPS) và cần quyền truy cập vị trí từ người dùng.
- **Backend API**: cần có backend đang chạy và truy cập được tại địa chỉ cấu hình trong `VITE_API_BASE_URL` để các chức năng gọi API của frontend hoạt động.

## Cài đặt và chạy Frontend

### 1. Di chuyển vào thư mục frontend

```bash
cd frontend
```

### 2. Cài đặt dependencies

```bash
npm install
```

### 3. Cấu hình biến môi trường

Tạo hoặc cập nhật file `.env` trong thư mục `frontend/` và khai báo biến môi trường cần thiết (xem mục [Biến môi trường](#biến-môi-trường)).

Ví dụ (theo cấu hình hiện có trong mã nguồn/frontend):

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

### 4. Chạy ứng dụng ở chế độ development

```bash
npm run dev
```

Theo `vite.config.ts`, dev server được cấu hình chạy tại:
- **Host mặc định của Vite** (thường `localhost`)
- **Port**: `3001`
- **`strictPort: true`** (nếu port 3001 đang bận, Vite sẽ không tự đổi sang port khác)

### 5. Build và preview (tùy chọn)

Build production:

```bash
npm run build
```

Preview bản build:

```bash
npm run preview
```

## Biến môi trường

Frontend sử dụng biến môi trường kiểu Vite (`import.meta.env`). Dựa trên mã nguồn hiện tại:

| Biến | Bắt buộc | Mô tả | Nguồn tham chiếu trong mã nguồn |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | Có | Base URL cho Axios client dùng để gọi backend API (ví dụ: `http://localhost:3000/api`) | `src/services/api.ts` (`baseURL: import.meta.env.VITE_API_BASE_URL`) |

> Lưu ý: Các dịch vụ bản đồ/tìm kiếm địa điểm/định tuyến trong `src/services/route.service.ts` và một phần logic trong `src/components/common/student/Search/StudentSearchRoute.tsx` đang gọi trực tiếp endpoint công khai (Photon/OSRM/Nominatim) từ frontend và **không** cấu hình qua biến môi trường trong mã nguồn hiện tại.

## Hướng dẫn sử dụng

### Chạy ứng dụng

1. Cài đặt dependencies và cấu hình biến môi trường trong file `.env` của thư mục `frontend/` (xem mục [Biến môi trường](#biến-môi-trường)).
2. Chạy `npm run dev` trong thư mục `frontend/`.
3. Mở trình duyệt tại địa chỉ dev server của Vite (mặc định theo cấu hình: `http://localhost:3001`).

### Điều hướng và luồng cơ bản

- **Trang đăng nhập Student**: `/login`
- **Trang đăng nhập Operator**: `/operator/login`
- **Khu vực Student**:
  - `/student` - Dashboard sinh viên
  - `/student/booking/search` - Tìm kiếm lộ trình
  - `/student/booking/results` - Kết quả Hub theo lộ trình
  - `/student/booking/options` - Chọn dịch vụ sau khi chọn Hub
  - `/student/reservation` - Chọn loại dịch vụ
  - `/student/reservation/vehicle` - Đặt xe
  - `/student/reservation/parking` - Đặt chỗ đỗ
  - `/student/reservation/charging` - Đặt chỗ kèm sạc
  - `/student/reservation/confirmation` - Xác nhận/hủy yêu cầu đặt dịch vụ
  - `/student/vehicle-return` - Trả xe
- **Khu vực Operator**:
  - `/operator` - Dashboard và các trang quản lý (chuyển tab trong dashboard)

> Route mặc định (`*`) sẽ điều hướng về `/login`.

### Đăng nhập

- Chọn đúng trang đăng nhập theo vai trò (Student hoặc Operator).
- Frontend kiểm tra `user.role` trả về từ API đăng nhập để quyết định điều hướng và hiển thị lỗi nếu sai vai trò.
- Token và thông tin người dùng được lưu ở `localStorage` (nếu chọn ghi nhớ) hoặc `sessionStorage`.

## Scripts có sẵn

Các scripts được định nghĩa trong `frontend/package.json`:

| Script | Lệnh | Mô tả |
| --- | --- | --- |
| `dev` | `npm run dev` | Chạy Vite development server |
| `build` | `npm run build` | Biên dịch TypeScript project references (`tsc -b`) và build production bằng Vite |
| `lint` | `npm run lint` | Chạy ESLint trên toàn bộ project |
| `preview` | `npm run preview` | Chạy Vite preview server cho bản build |

## Lưu ý

- **Kết nối API**: Frontend sử dụng `VITE_API_BASE_URL` (trong `src/services/api.ts`) làm địa chỉ gọi API cho các chức năng như đăng nhập, dữ liệu hub/phương tiện/chỗ đỗ/cổng sạc, đặt chỗ, yêu cầu sạc/lịch sạc và dashboard operator. Backend cần đang chạy và truy cập được tại địa chỉ này; nếu chưa cấu hình đúng hoặc API không phản hồi, các chức năng liên quan có thể không hoạt động đầy đủ.
- **Token và phiên đăng nhập**: Axios interceptor đọc token từ `localStorage`/`sessionStorage` và tự gắn `Authorization: Bearer <token>`. Khi gặp lỗi `401/403`, frontend hiển thị thông báo phù hợp ở tầng client (theo logic trong `api.ts` và các màn hình).
- **Dịch vụ bên ngoài trong luồng tìm kiếm lộ trình**: frontend gọi trực tiếp các dịch vụ như Photon (gợi ý địa điểm), OSRM (tuyến đường), Nominatim (reverse geocoding trong màn hình tìm kiếm). Chất lượng/độ sẵn sàng của các dịch vụ này có thể ảnh hưởng trải nghiệm tìm kiếm.
- **Quyền trình duyệt**: tính năng lấy vị trí hiện tại sử dụng Geolocation API của trình duyệt và cần người dùng cấp quyền.
- **Dữ liệu lưu cục bộ trên trình duyệt**: một số tính năng Student lưu dữ liệu vào `localStorage` (ví dụ: địa điểm yêu thích, lịch sử tìm kiếm lộ trình, và thông tin đăng nhập khi chọn ghi nhớ).
- **Trang quản lý Mobility Hub (Operator)**: component `MobilityHubManagement` trong mã nguồn hiện tại sử dụng dữ liệu mẫu và thao tác trên trạng thái cục bộ của frontend (không gọi API backend trong component này). Cần lưu ý khi đánh giá mức độ tích hợp backend của trang này.
- **Không có tài khoản mẫu trong mã nguồn frontend**: README không cung cấp tài khoản đăng nhập mặc định vì thông tin này không được định nghĩa trong frontend. Vui lòng sử dụng tài khoản do hệ thống cung cấp.
