import { usePreferences } from "../../../../preferences/PreferencesContext";

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  LayoutDashboard,
  Map,
  Bike,
  ParkingSquare,
  Zap,
  History,
  Menu,
  ChevronLeft,
  ChevronRight,
  Bell,
  RefreshCw,
  LogOut,
  UserRound,
  X,
  Settings,
} from "lucide-react";

import studentService from "../../../../services/student.service";
import reservationService from "../../../../services/reservation.service";
import "./StudentDashboard.css";
import SettingsPanel from "../../../../preferences/SettingsPanel";

interface StudentDashboardProps {
  settingsMode?: boolean;
  onRequestCharging?: () => void;
  onReturnVehicle?: (reservationID: string) => void;
}

interface Reservation {
  id?: string;
  _id?: string;
  userId?: string;
  hubId?: string;
  vehicleId?: string | null;
  slotId?: string | null;
  status?: string;
  confirmationCode?: string;

  vehicle?: {
    name?: string;
    code?: string;
    type?: string;
  };

  hub?: {
    id?: string;
    name?: string;
    code?: string;
    latitude?: number;
    longitude?: number;
  };

  slot?: {
    id?: string;
    code?: string;
  };

  startTime?: string;
  endTime?: string;
  startsAt?: string;
  endsAt?: string;
  pickedUpAt?: string;
  createdAt?: string;
}

interface ChargingSchedule {
  id?: string;
  requestId?: string;
  pointId?: string;
  status?: string;
  startsAt?: string;
  endsAt?: string;
}

interface ChargingRequest {
  id?: string;
  _id?: string;
  scheduleId?: string;
  chargingScheduleId?: string;
  status?: string;

  schedules?: ChargingSchedule[];

  hub?: {
    name?: string;
    code?: string;
  };

  hubId?: string;
  startsAt?: string;
  endsAt?: string;
  createdAt?: string;
}

type CancelTarget =
  | { type: "reservation"; id: string }
  | { type: "charging"; id: string };

function StudentDashboard({
  settingsMode = false,
  onRequestCharging,
  onReturnVehicle,
}: StudentDashboardProps) {
  const { t, preferences: { language }, reload, loading: preferencesLoading } = usePreferences();

  const navigate = useNavigate();
  const { hash } = useLocation();

  // Trạng thái Sidebar và Header
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [chargingRequests, setChargingRequests] = useState<ChargingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [pickupTarget, setPickupTarget] = useState<Reservation | null>(null);
  const [pickupLoadingID, setPickupLoadingID] = useState("");
  const [pickupError, setPickupError] = useState("");

  const [toastMessage, setToastMessage] = useState("");

  // Lấy dữ liệu Dashboard
  const fetchDashboardData = async () => {
    setLoading(true);
    setError("");

    try {
      const [reservationsRes, chargingRes] = await Promise.all([
        studentService.getReservations(),
        studentService.getChargingRequests(),
      ]);

      const reservationData =
        reservationsRes.data?.data ?? reservationsRes.data;

      const chargingData =
        chargingRes.data?.data ?? chargingRes.data;

      setReservations(
        Array.isArray(reservationData)
          ? reservationData
          : reservationData?.items ?? []
      );

      setChargingRequests(
        Array.isArray(chargingData)
          ? chargingData
          : chargingData?.items ?? []
      );
    } catch (err) {
      console.error("Student dashboard error:", err);
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          for (const storage of [localStorage, sessionStorage]) {
            storage.removeItem("accessToken");
            storage.removeItem("user");
          }
          navigate("/login", { replace: true, state: { sessionExpired: true } });
          return;
        }
        if (err.response?.status === 403) {
          setError(err.message);
          return;
        }
        if (!err.response) {
          setError(t("Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối và thử lại."));
          return;
        }
        if (err.response.data?.code === "DATABASE_UNAVAILABLE") {
          setError(t("Hệ thống hiện không khả dụng. Vui lòng thử lại sau."));
          return;
        }
      }
      setError(t("Không thể tải dữ liệu bảng điều khiển. Vui lòng thử lại."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (!settingsMode && !loading && hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
    }
  }, [hash, loading, settingsMode]);

  // Lấy ID
  const getReservationID = (reservation: Reservation) =>
    reservation.id || reservation._id || "";

  const getChargingScheduleID = (request: ChargingRequest) =>
    request.schedules?.[0]?.id || "";

  // Mở màn hình trả xe
  const goToReturn = (reservation: Reservation) => {
    const reservationID = getReservationID(reservation);

    if (!reservationID) return;

    if (onReturnVehicle) {
      onReturnVehicle(reservationID);
      return;
    }

    navigate("/student/vehicle-return", {
      state: {
        reservationID,
        reservation,
      },
    });
  };

  // Cuộn đến khu vực được chọn trên Dashboard
  const scrollToSection = (sectionID: string) => {
    if (settingsMode) {
      navigate(`/student#${sectionID}`);
      return;
    }
    document.getElementById(sectionID)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  // Điều hướng đến các chức năng
  const navigateTo = (path: string) => {
    setShowNotifications(false);
    setShowProfile(false);
    navigate(path);
  };

  // Mở màn hình đặt lịch sạc
  const goToCharging = () => {
    setShowNotifications(false);

    if (onRequestCharging) {
      onRequestCharging();
      return;
    }

    navigate("/student/reservation/charging");
  };

  // Đăng xuất
  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");

    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("user");

    setShowProfile(false);
    setShowNotifications(false);

    navigate("/login", { replace: true });
  };

  // Kiểm tra quyền hủy
  const canCancelReservation = (reservation: Reservation) =>
    reservation.status === "HELD" || reservation.status === "CONFIRMED";

  const canCancelChargingRequest = (request: ChargingRequest) =>
    Boolean(
      request.status &&
        !["COMPLETED", "CANCELLED", "REJECTED"].includes(request.status)
    );

  // Hủy đặt xe hoặc lịch sạc
  const handleCancel = async () => {
    if (!cancelTarget || cancelling) return;

    const target = cancelTarget;

    setCancelling(true);
    setError("");

    try {
      if (target.type === "reservation") {
        await reservationService.cancelReservation(target.id);

        setReservations((prev) =>
          prev.map((item) =>
            getReservationID(item) === target.id
              ? { ...item, status: "CANCELLED" }
              : item
          )
        );

        setToastMessage(t("Đã hủy lượt đặt chỗ thành công!"));
      } else {
        console.log(t("Charging schedule ID gửi lên:"), target.id);

        await reservationService.cancelChargingSchedule(target.id);

        setChargingRequests((prev) =>
          prev.map((item) =>
            getChargingScheduleID(item) === target.id
              ? { ...item, status: "CANCELLED" }
              : item
          )
        );

        setToastMessage(t("Đã hủy lịch sạc thành công!"));
      }

      setCancelTarget(null);
    } catch (err: any) {
      console.error(
        "Cancel item error:",
        err?.response?.data || err
      );

      setError(
        err?.response?.data?.message ||
          err?.message ||
          (target.type === "charging"
            ? t("Không thể hủy lịch sạc. Vui lòng thử lại.")
            : t("Không thể hủy đặt chỗ. Vui lòng thử lại."))
      );
    } finally {
      setCancelling(false);
    }
  };

  // Xác nhận nhận xe
  const handleConfirmPickup = async () => {
    if (!pickupTarget || pickupLoadingID) return;

    const target = pickupTarget;
    const reservationID = getReservationID(target);

    if (!reservationID) {
      setPickupError(t("Không tìm thấy mã đặt xe."));
      return;
    }

    setPickupLoadingID(reservationID);
    setPickupError("");

    try {
      // Lấy danh sách Hub từ API
      const hubs = await reservationService.getHubs();

      const selectedHub = hubs.find(
        (hub) => hub.id === target.hubId
      );

      if (!selectedHub) {
        throw new Error(t("Không tìm thấy Hub của lượt đặt xe."));
      }

      const { latitude, longitude } = selectedHub;

      if (latitude == null || longitude == null) {
        throw new Error(
          t("Hub chưa có thông tin tọa độ. Vui lòng kiểm tra dữ liệu Hub.")
        );
      }

      // Gọi API nhận xe
      const response = await reservationService.pickupVehicle(
        reservationID,
        {
          latitude,
          longitude,
        }
      );

      console.log("Pickup response:", response);

      // Nhận xe thành công: ở lại Dashboard và tải lại dữ liệu
      setPickupTarget(null);
      setToastMessage(t("Nhận xe thành công!"));
      await fetchDashboardData();
    } catch (err: any) {
      console.error("Pickup failed:", err);

      setPickupError(
        err.response?.data?.message ||
          err.message ||
          t("Không thể nhận xe. Vui lòng thử lại.")
      );
    } finally {
      setPickupLoadingID("");
    }
  };

  // Phân loại đặt chỗ
  const vehicleReservations = reservations.filter(
    (item) => Boolean(item.vehicleId)
  );

  const parkingReservations = reservations.filter(
    (item) => Boolean(item.slotId)
  );

  const upcomingReservations = vehicleReservations.filter(
    (item) => item.status === "HELD" || item.status === "CONFIRMED"
  );

  const activeReservations = vehicleReservations.filter(
    (item) => item.status === "IN_USE"
  );

  // Không hiển thị chuyến đang sử dụng trong lịch sử đặt xe
  const vehicleReservationHistory = vehicleReservations.filter(
    (item) => item.status !== "IN_USE"
  );

  const completedReservations = vehicleReservations.filter(
    (item) => item.status === "COMPLETED"
  );

  const pendingChargingRequests = chargingRequests.filter(
    (item) =>
      item.status !== "COMPLETED" &&
      item.status !== "CANCELLED" &&
      item.status !== "REJECTED"
  );

  // Định dạng ngày tháng
  const formatDate = (date?: string) => {
    if (!date) return t("Chưa có thông tin");

    const parsedDate = new Date(date);

    return Number.isNaN(parsedDate.getTime())
      ? t("Chưa có thông tin")
      : parsedDate.toLocaleString((language === "en" ? "en-US" : "vi-VN"));
  };

  // Dịch trạng thái
  const statusMap: Record<string, string> = {
    HELD: t("Đã giữ chỗ"),
    CONFIRMED: t("Đã xác nhận"),
    IN_USE: t("Đang sử dụng"),
    COMPLETED: t("Hoàn thành"),
    CANCELLED: t("Đã hủy"),
    PENDING: t("Đang chờ xử lý"),
    APPROVED: t("Đã duyệt"),
    REJECTED: t("Từ chối"),
  };

  const translateStatus = (status?: string) =>
    status ? statusMap[status] || status : t("Đang chờ xử lý");

  // Thống kê
  const stats = [
    {
      label: t("Đặt xe sắp tới"),
      value: upcomingReservations.length,
      icon: "📅",
      color: "purple",
    },
    {
      label: t("Chuyến đi đang hoạt động"),
      value: activeReservations.length,
      icon: "🚲",
      color: "green",
    },
    {
      label: t("Chuyến đi đã hoàn thành"),
      value: completedReservations.length,
      icon: "✓",
      color: "blue",
    },
    {
      label: t("Yêu cầu sạc đang chờ"),
      value: pendingChargingRequests.length,
      icon: "⚡",
      color: "orange",
    },
  ];

  return (
    <div
      className={`student-layout ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      }`}
    >
      {/* SIDEBAR BÊN TRÁI */}
      <aside className="student-sidebar">
        <div className="student-sidebar-brand">
          <div className="student-brand-logo">
            <Zap size={24} />
          </div>

          {!sidebarCollapsed && (
            <div className="student-brand-text">
              <strong>Smart E-Mobility</strong>
              <span>STUDENT PORTAL</span>
            </div>
          )}
        </div>

        <div className="student-sidebar-label">
          {!sidebarCollapsed && t("MENU CHÍNH")}
        </div>

        <nav className="student-sidebar-menu">
          <button
            type="button"
            className={`student-menu-item ${!settingsMode ? "active" : ""}`}
            onClick={() => navigateTo("/student")}
            title={t("Tổng quan")}
          >
            <LayoutDashboard size={20} />
            {!sidebarCollapsed && <span>{t("Tổng quan")}</span>}
          </button>

          <button
            type="button"
            className="student-menu-item"
            onClick={() => navigateTo("/student/booking/search")}
            title={t("Tìm kiếm lộ trình")}
          >
            <Map size={20} />
            {!sidebarCollapsed && <span>{t("Tìm kiếm lộ trình")}</span>}
          </button>

          <button
            type="button"
            className="student-menu-item"
            onClick={() => navigateTo("/student/reservation/vehicle")}
            title={t("Đặt xe")}
          >
            <Bike size={20} />
            {!sidebarCollapsed && <span>{t("Đặt xe")}</span>}
          </button>

          <button
            type="button"
            className="student-menu-item"
            onClick={() => navigateTo("/student/reservation/parking")}
            title={t("Đặt chỗ đỗ xe")}
          >
            <ParkingSquare size={20} />
            {!sidebarCollapsed && <span>{t("Đặt chỗ đỗ xe")}</span>}
          </button>

          <button
            type="button"
            className="student-menu-item"
            onClick={goToCharging}
            title={t("Đặt lịch sạc")}
          >
            <Zap size={20} />
            {!sidebarCollapsed && <span>{t("Đặt lịch sạc")}</span>}
          </button>

          <button
            type="button"
            className="student-menu-item"
            onClick={() => {
              if (activeReservations[0]) {
                goToReturn(activeReservations[0]);
              } else {
                scrollToSection("active-trips");
              }
            }}
            title={t("Trả xe")}
          >
            <Bike size={20} />
            {!sidebarCollapsed && <span>{t("Trả xe")}</span>}
          </button>

          <button
            type="button"
            className="student-menu-item"
            onClick={() => scrollToSection("vehicle-history")}
            title={t("Lịch sử đặt chỗ")}
          >
            <History size={20} />
            {!sidebarCollapsed && <span>{t("Lịch sử")}</span>}
          </button>
          <button type="button" className={`student-menu-item ${settingsMode ? "active" : ""}`}
            onClick={() => navigateTo("/student/settings")} title={t("Cài đặt")}>
            <Settings size={20} />
            {!sidebarCollapsed && <span>{t("Cài đặt")}</span>}
          </button>
        </nav>

        <div className="student-sidebar-bottom">
          <div className="student-sidebar-account">
            <div className="student-account-avatar">
              <UserRound size={20} />
            </div>

            {!sidebarCollapsed && (
              <div className="student-account-info">
                <strong>{t("Sinh viên")}</strong>
                <span>{t("Tài khoản sinh viên")}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="student-collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={
              sidebarCollapsed
                ? t("Mở rộng thanh bên")
                : t("Thu gọn thanh bên")
            }
          >
            {sidebarCollapsed ? (
              <ChevronRight size={19} />
            ) : (
              <>
                <ChevronLeft size={19} />
                <span>{t("Thu gọn menu")}</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* KHU VỰC BÊN PHẢI */}
      <main className="student-main">
        {/* HEADER NGANG */}
        <header className="student-header">
          <div className="student-header-left">
            <button
              type="button"
              className="student-header-menu-btn"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={t("Thu gọn hoặc mở rộng menu")}
            >
              <Menu size={21} />
            </button>

            <div className="student-breadcrumb">
              <span>{t("Trang sinh viên")}</span>
              <ChevronRight size={15} />
              <strong>{settingsMode ? t("Cài đặt") : t("Tổng quan")}</strong>
            </div>
          </div>

          <div className="student-header-right">
            <button
              type="button"
              className="student-header-action"
              onClick={settingsMode ? reload : fetchDashboardData}
              disabled={settingsMode ? preferencesLoading : loading}
              title={t("Làm mới dữ liệu")}
            >
              <RefreshCw
                size={19}
                className={loading ? "student-spinning" : ""}
              />
            </button>

            {/* Thông báo */}
            <div className="student-header-dropdown">
              <button
                type="button"
                className="student-header-action"
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setShowProfile(false);
                }}
                title={t("Thông báo")}
              >
                <Bell size={19} />
                {pendingChargingRequests.length +
                  upcomingReservations.length > 0 && (
                  <span className="student-notification-dot" />
                )}
              </button>

              {showNotifications && (
                <div className="student-dropdown-panel">
                  <div className="student-dropdown-heading">
                    <strong>{t("Thông báo")}</strong>
                    <button
                      type="button"
                      onClick={() => setShowNotifications(false)}
                      aria-label={t("Đóng thông báo")}
                    >
                      <X size={17} />
                    </button>
                  </div>

                  {loading ? (
                    <p>{t("Đang tải dữ liệu...")}</p>
                  ) : (
                    <>
                      <div className="student-notification-item">
                        <Bike size={18} />
                        <span>{t("Bạn có")}{" "}
                          <strong>{upcomingReservations.length}</strong>{" "}{t("lượt đặt xe sắp tới.")}</span>
                      </div>

                      <div className="student-notification-item">
                        <Zap size={18} />
                        <span>{t("Bạn có")}{" "}
                          <strong>{pendingChargingRequests.length}</strong>{" "}{t("yêu cầu sạc đang chờ.")}</span>
                      </div>

                      {upcomingReservations.length === 0 &&
                        pendingChargingRequests.length === 0 && (
                          <p className="student-no-notification">{t("Bạn hiện không có thông báo mới.")}</p>
                        )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Tài khoản */}
            <div className="student-header-dropdown">
              <button
                type="button"
                className="student-profile-btn"
                onClick={() => {
                  setShowProfile(!showProfile);
                  setShowNotifications(false);
                }}
              >
                <div className="student-profile-avatar">
                  <UserRound size={19} />
                </div>

                <div className="student-profile-text">
                  <strong>{t("Sinh viên")}</strong>
                  <span>{t("Tài khoản")}</span>
                </div>

                <ChevronRight size={16} />
              </button>

              {showProfile && (
                <div className="student-dropdown-panel student-profile-dropdown">
                  <div className="student-dropdown-heading">
                    <strong>{t("Tài khoản")}</strong>
                    <button
                      type="button"
                      onClick={() => setShowProfile(false)}
                      aria-label={t("Đóng tài khoản")}
                    >
                      <X size={17} />
                    </button>
                  </div>

                  <div className="student-profile-detail">
                    <UserRound size={20} />
                    <div>
                      <strong>{t("Sinh viên")}</strong>
                      <span>Smart E-Mobility Hub</span>
                    </div>
                  </div>

                  {/* Nút đăng xuất */}
                  <button
                    type="button"
                    className="student-logout-btn"
                    onClick={handleLogout}
                  >
                    <LogOut size={17} />
                    <span>{t("Đăng xuất")}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* NỘI DUNG DASHBOARD */}
        <div className="student-page-content">
          {settingsMode ? <SettingsPanel /> : <>
          <div className="student-page-heading">
            <div>
              <span className="student-page-eyebrow">
                STUDENT PORTAL
              </span>
              <h1>{t("Tổng quan")}</h1>
              <p>{t("Quản lý các hoạt động và dịch vụ di chuyển của bạn.")}</p>
            </div>
          </div>

          <div className="student-dashboard">
            {/* Chào mừng */}
            <section className="student-welcome">
              <div className="welcome-content">
                <span className="welcome-label">
                  <span className="online-dot" />{t("CỔNG THÔNG TIN SINH VIÊN")}</span>

                <h1>{t("Chào mừng đến với Smart E-Mobility Hub")}</h1>

                <p>{t("Hành trình của bạn bắt đầu từ đây. Tìm kiếm lộ trình, đặt xe điện và quản lý các dịch vụ di chuyển một cách dễ dàng.")}</p>

                <div className="welcome-actions">
                  <button
                    className="dashboard-btn dashboard-btn-light"
                    onClick={() => navigateTo("/student/booking/search")}
                  >{t("Khám phá trạm ")}<span>→</span>
                  </button>

                  <button
                    className="dashboard-btn dashboard-btn-outline"
                    onClick={fetchDashboardData}
                    disabled={loading}
                  >
                    {loading ? t("Đang tải...") : t("↻ Làm mới")}
                  </button>
                </div>
              </div>

              <div className="welcome-illustration">
                <div className="illustration-circle">
                  <span>🚲</span>
                </div>
                <div className="illustration-bolt">⚡</div>
              </div>
            </section>

            {/* Thông báo lỗi */}
            {error && (
              <div className="dashboard-error">
                <span>⚠</span>
                <p>{t(error)}</p>
                <button onClick={fetchDashboardData}>{t("Thử lại")}</button>
              </div>
            )}

            {/* Thống kê */}
            <section className="dashboard-section" id="student-overview">
              <div className="section-heading">
                <div>
                  <span className="section-eyebrow">{t("TỔNG QUAN")}</span>
                  <h2>{t("Hoạt động của bạn")}</h2>
                </div>

                <span className="section-description">{t("Tổng hợp các hoạt động di chuyển của bạn")}</span>
              </div>

              <div className="stats-grid">
                {stats.map((item) => (
                  <div className="stat-card" key={t(item.label)}>
                    <div className={`stat-icon ${item.color}`}>
                      {item.icon}
                    </div>

                    <div className="stat-info">
                      <span>{t(item.label)}</span>
                      <strong>{loading ? "—" : item.value}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Dịch vụ */}
            <section className="dashboard-section" id="student-services">
              <div className="section-heading">
                <div>
                  <span className="section-eyebrow">{t("DỊCH VỤ DI CHUYỂN")}</span>
                  <h2>{t("Bạn muốn thực hiện thao tác nào?")}</h2>
                </div>
              </div>

              <div className="services-grid">
                <div className="service-card">
                  <div className="service-icon route-icon">📍</div>
                  <h3>{t("Tìm kiếm lộ trình")}</h3>
                  <p>{t("Tìm kiếm các trạm trung chuyển phù hợp dựa trên vị trí hiện tại hoặc lộ trình di chuyển của bạn.")}</p>
                  <button
                    onClick={() => navigateTo("/student/booking/search")}
                  >{t("Tìm lộ trình ")}<span>→</span>
                  </button>
                </div>

                <div className="service-card">
                  <div className="service-icon vehicle-icon">🚲</div>
                  <h3>{t("Đặt xe / Chỗ đỗ")}</h3>
                  <p>{t("Tìm kiếm Hub phù hợp và lựa chọn dịch vụ đặt xe hoặc đặt chỗ đỗ xe theo nhu cầu của bạn.")}</p>
                  <button onClick={() => navigateTo("/student/reservation")}>{t("Khám phá ngay ")}<span>→</span>
                  </button>
                </div>

                <div className="service-card">
                  <div className="service-icon charging-icon">⚡</div>
                  <h3>{t("Yêu cầu sạc pin")}</h3>
                  <p>{t("Gửi yêu cầu sạc pin và nhận lịch sạc phù hợp với nhu cầu của bạn.")}</p>
                  <button onClick={goToCharging}>{t("Gửi yêu cầu sạc ")}<span>→</span>
                  </button>
                </div>

                <div className="service-card">
                  <div className="service-icon return-icon">🏁</div>
                  <h3>{t("Trả xe")}</h3>
                  <p>{t("Kiểm tra các chuyến đi đang hoạt động và thực hiện trả xe tại trạm trung chuyển phù hợp.")}</p>
                  <button
                    onClick={() => {
                      if (activeReservations[0]) {
                        goToReturn(activeReservations[0]);
                      }
                    }}
                    disabled={activeReservations.length === 0}
                    className={
                      activeReservations.length === 0
                        ? "service-disabled"
                        : ""
                    }
                  >
                    {activeReservations.length > 0
                      ? t("Trả xe của tôi")
                      : t("Không có chuyến đi")}
                    <span>→</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Hoạt động gần đây */}
            <section className="dashboard-section">
              <div className="section-heading">
                <div>
                  <span className="section-eyebrow">{t("TRUNG TÂM HOẠT ĐỘNG")}</span>
                  <h2>{t("Hoạt động gần đây")}</h2>
                </div>
              </div>

              <div className="activity-grid">
                {/* Lịch sử đặt xe */}
                <div className="activity-card" id="vehicle-history">
                  <div className="activity-header">
                    <div>
                      <h3>{t("📅 Lịch sử đặt xe")}</h3>
                      <p>{t("Các lượt đặt phương tiện dùng chung của bạn")}</p>
                    </div>

                    <button
                      onClick={() => navigateTo("/student/reservation/vehicle")}
                    >{t("Đặt thêm +")}</button>
                  </div>

                  {loading ? (
                    <p className="empty-message">{t("Đang tải danh sách đặt xe...")}</p>
                  ) : vehicleReservationHistory.length > 0 ? (
                    vehicleReservationHistory.slice(0, 3).map((reservation, index) => {
                      const reservationID = getReservationID(reservation);

                      return (
                        <div
                          className="activity-item"
                          key={reservationID || index}
                        >
                          <div className="activity-item-icon purple">🚲</div>

                          <div className="activity-item-content">
                            <strong>
                              {reservation.vehicle?.name ||
                                reservation.vehicle?.code ||
                                t("Phương tiện đã đặt")}
                            </strong>

                            <span>{t("Trạm:")}{" "}
                              {reservation.hub?.name ||
                                reservation.hub?.code ||
                                "—"}
                            </span>

                            <span>{t("Thời gian bắt đầu:")}{" "}
                              {formatDate(
                                reservation.startsAt || reservation.startTime
                              )}
                            </span>

                            <span>{t("Thời gian kết thúc:")}{" "}
                              {formatDate(
                                reservation.endsAt || reservation.endTime
                              )}
                            </span>

                            <span>{t("Ngày tạo: ")}{formatDate(reservation.createdAt)}
                            </span>
                          </div>

                          <div className="activity-item-actions">
                            <span
                              className={`status-tag ${
                                reservation.status === "CANCELLED"
                                  ? "cancelled"
                                  : reservation.status === "COMPLETED"
                                    ? "completed"
                                    : "pending"
                              }`}
                            >
                              {translateStatus(reservation.status)}
                            </span>

                            {reservation.status === "CONFIRMED" && (
                              <button
                                type="button"
                                className="pickup-btn"
                                onClick={() => {
                                  setPickupError("");
                                  setPickupTarget(reservation);
                                }}
                                disabled={
                                  !reservationID || Boolean(pickupLoadingID)
                                }
                              >
                                {pickupLoadingID === reservationID
                                  ? t("Đang nhận...")
                                  : t("Nhận xe")}
                              </button>
                            )}

                            {canCancelReservation(reservation) && (
                              <button
                                type="button"
                                className="cancel-reservation-btn"
                                onClick={() =>
                                  setCancelTarget({
                                    type: "reservation",
                                    id: reservationID,
                                  })
                                }
                                disabled={!reservationID || cancelling}
                              >{t("Hủy đặt xe")}</button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="empty-message">{t("Bạn chưa có lịch sử đặt xe nào.")}</p>
                  )}
                </div>

                {/* Lịch sử đặt chỗ đỗ */}
                <div className="activity-card" id="parking-history">
                  <div className="activity-header">
                    <div>
                      <h3>{t("🅿️ Lịch sử đặt chỗ đỗ")}</h3>
                      <p>{t("Các lượt đặt chỗ đỗ xe của bạn")}</p>
                    </div>

                    <button
                      onClick={() => navigateTo("/student/reservation/parking")}
                    >{t("Đặt thêm +")}</button>
                  </div>

                  {loading ? (
                    <p className="empty-message">{t("Đang tải lịch sử đặt chỗ đỗ...")}</p>
                  ) : parkingReservations.length > 0 ? (
                    parkingReservations.slice(0, 3).map((reservation, index) => {
                      const reservationID = getReservationID(reservation);

                      return (
                        <div
                          className="activity-item"
                          key={reservationID || index}
                        >
                          <div className="activity-item-icon blue">🅿️</div>

                          <div className="activity-item-content">
                            <strong>{t("Chỗ đỗ xe ")}{reservation.slot?.code || ""}
                            </strong>

                            <span>
                              Hub:{" "}
                              {reservation.hub?.name ||
                                reservation.hub?.code ||
                                reservation.hubId ||
                                "—"}
                            </span>

                            <span>{t("Mã chỗ đỗ:")}{" "}
                              {reservation.slot?.code ||
                                reservation.slotId ||
                                "—"}
                            </span>

                            <span>{t("Thời gian bắt đầu:")}{" "}
                              {formatDate(
                                reservation.startsAt || reservation.startTime
                              )}
                            </span>

                            <span>{t("Thời gian kết thúc:")}{" "}
                              {formatDate(
                                reservation.endsAt || reservation.endTime
                              )}
                            </span>

                            <span>{t("Ngày đặt: ")}{formatDate(reservation.createdAt)}
                            </span>
                          </div>

                          <div className="activity-item-actions">
                            <span
                              className={`status-tag ${
                                reservation.status === "CANCELLED"
                                  ? "cancelled"
                                  : reservation.status === "COMPLETED"
                                    ? "completed"
                                    : "pending"
                              }`}
                            >
                              {translateStatus(reservation.status)}
                            </span>

                            {canCancelReservation(reservation) && (
                              <button
                                type="button"
                                className="cancel-reservation-btn"
                                onClick={() =>
                                  setCancelTarget({
                                    type: "reservation",
                                    id: reservationID,
                                  })
                                }
                                disabled={!reservationID || cancelling}
                              >{t("Hủy đặt chỗ đỗ")}</button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="empty-message">{t("Bạn chưa có lượt đặt chỗ đỗ nào.")}</p>
                  )}
                </div>

                {/* Chuyến đi đang hoạt động */}
                <div className="activity-card" id="active-trips">
                  <div className="activity-header">
                    <div>
                      <h3>{t("🚲 Chuyến đi đang hoạt động")}</h3>
                      <p>{t("Các chuyến đi bạn đang thực hiện")}</p>
                    </div>
                  </div>

                  {loading ? (
                    <p className="empty-message">{t("Đang tải danh sách chuyến đi...")}</p>
                  ) : activeReservations.length > 0 ? (
                    activeReservations.slice(0, 3).map((reservation, index) => {
                      const reservationID = getReservationID(reservation);

                      return (
                        <div
                          className="activity-item"
                          key={reservationID || index}
                        >
                          <div className="activity-item-icon green">🚲</div>

                          <div className="activity-item-content">
                            <strong>
                              {reservation.vehicle?.name ||
                                reservation.vehicle?.code ||
                                t("Phương tiện điện")}
                            </strong>

                            <span>{t("Bắt đầu:")}{" "}
                              {formatDate(
                                reservation.pickedUpAt ||
                                  reservation.startsAt ||
                                  reservation.startTime
                              )}
                            </span>

                            <button
                              className="return-link"
                              disabled={!reservationID}
                              onClick={() => goToReturn(reservation)}
                            >{t("Trả xe →")}</button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="empty-message">{t("Hiện tại bạn không có chuyến đi nào đang hoạt động.")}</p>
                  )}
                </div>

                {/* Yêu cầu sạc pin */}
                <div className="activity-card" id="charging-requests">
                  <div className="activity-header">
                    <div>
                      <h3>{t("⚡ Yêu cầu sạc pin")}</h3>
                      <p>{t("Các yêu cầu sạc pin của bạn")}</p>
                    </div>

                    <button onClick={goToCharging}>{t("Yêu cầu mới +")}</button>
                  </div>

                  {loading ? (
                    <p className="empty-message">{t("Đang tải danh sách yêu cầu sạc...")}</p>
                  ) : chargingRequests.length > 0 ? (
                    chargingRequests.slice(0, 3).map((request, index) => (
                      <div
                        className="activity-item"
                        key={request.id || request._id || index}
                      >
                        <div className="activity-item-icon blue">⚡</div>

                        <div className="activity-item-content">
                          <strong>{t("Yêu cầu sạc pin")}</strong>

                          <span>{t("Trạm:")}{" "}
                            {request.hub?.name ||
                              request.hub?.code ||
                              "—"}
                          </span>

                          <span>{t("Ngày tạo: ")}{formatDate(request.createdAt)}
                          </span>

                          {request.startsAt && (
                            <span>{t("Thời gian sạc: ")}{formatDate(request.startsAt)}
                              {request.endsAt
                                ? ` – ${formatDate(request.endsAt)}`
                                : ""}
                            </span>
                          )}
                        </div>

                        <div className="activity-item-actions">
                          <span className="status-tag charging">
                            {translateStatus(request.status)}
                          </span>

                          {canCancelChargingRequest(request) && (
                            <button
                              type="button"
                              className="cancel-reservation-btn"
                              onClick={() => {
                                const scheduleID =
                                  getChargingScheduleID(request);

                                if (scheduleID) {
                                  setCancelTarget({
                                    type: "charging",
                                    id: scheduleID,
                                  });
                                }
                              }}
                              disabled={
                                !getChargingScheduleID(request) || cancelling
                              }
                            >{t("Hủy lịch sạc")}</button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="empty-message">{t("Bạn chưa gửi yêu cầu sạc pin nào.")}</p>
                  )}
                </div>
              </div>
            </section>

            {/* Hộp xác nhận nhận xe */}
            {pickupTarget && (
              <div className="pickup-modal-overlay">
                <div className="pickup-modal">
                  <div className="pickup-modal-icon">🚲</div>

                  <h3>{t("Xác nhận nhận xe")}</h3>

                  <p>{t("Bạn có chắc chắn muốn nhận phương tiện này không?")}</p>

                  <div className="pickup-modal-info">
                    <div>
                      <span>{t("Phương tiện")}</span>
                      <strong>
                        {pickupTarget.vehicle?.name ||
                          pickupTarget.vehicle?.code ||
                          t("Phương tiện điện")}
                      </strong>
                    </div>

                    <div>
                      <span>{t("Hub nhận xe")}</span>
                      <strong>
                        {pickupTarget.hub?.name ||
                          pickupTarget.hub?.code ||
                          t("Chưa có thông tin")}
                      </strong>
                    </div>
                  </div>

                  <p className="pickup-modal-note">{t("Thời gian sử dụng tối đa 8 giờ sẽ được tính từ thời điểm nhận xe thành công.")}</p>

                  {pickupError && (
                    <div className="pickup-modal-error">
                      ⚠ {t(pickupError)}
                    </div>
                  )}

                  <div className="pickup-modal-actions">
                    <button
                      type="button"
                      className="pickup-modal-cancel"
                      onClick={() => setPickupTarget(null)}
                      disabled={Boolean(pickupLoadingID)}
                    >{t("Hủy")}</button>

                    <button
                      type="button"
                      className="pickup-modal-confirm"
                      onClick={handleConfirmPickup}
                      disabled={Boolean(pickupLoadingID)}
                    >
                      {pickupLoadingID
                        ? t("Đang xử lý...")
                        : t("Xác nhận nhận xe")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Hộp xác nhận hủy */}
            {cancelTarget && (
              <div className="cancel-modal-overlay">
                <div className="cancel-modal">
                  <div className="cancel-modal-icon">!</div>

                  <h3>
                    {cancelTarget.type === "charging"
                      ? t("Xác nhận hủy lịch sạc")
                      : t("Xác nhận hủy đặt chỗ")}
                  </h3>

                  <p>{t("Bạn có chắc chắn muốn hủy")}{" "}
                    {cancelTarget.type === "charging"
                      ? t("lịch sạc")
                      : t("lượt đặt chỗ")}{" "}{t("này không? Thao tác này không thể hoàn tác.")}</p>

                  <div className="cancel-modal-actions">
                    <button
                      type="button"
                      className="cancel-modal-close"
                      onClick={() => setCancelTarget(null)}
                      disabled={cancelling}
                    >{t("Đóng")}</button>

                    <button
                      type="button"
                      className="cancel-modal-confirm"
                      onClick={handleCancel}
                      disabled={cancelling}
                    >
                      {cancelling ? t("Đang hủy...") : t("Xác nhận hủy")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Thông báo */}
            {toastMessage && (
              <div className="cancel-toast">
                <span>✓</span>
                {t(toastMessage)}

                <button
                  type="button"
                  onClick={() => setToastMessage("")}
                >{t("×")}</button>
              </div>
            )}
          </div>
          </>}
        </div>
      </main>
    </div>
  );
}

export default StudentDashboard;
