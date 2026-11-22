
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import MobilityHubManagement from "../Management/MobilityHubManagement";
import VehicleManagement from "../Management/VehicleManagement";
import ParkingManagement from "../Management/ParkingChargingManagement";
import ReservationManagement from "../Management/ParkingManagement";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Bike,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  ParkingSquare,
  PlugZap,
  RefreshCw,
  Settings,
  Users,
  Zap,
  CarFront,
} from "lucide-react";

import operatorDashboardService, {
  type OperatorDashboardData,
  type OperatorHub,
  type OperatorReservation,
} from "../../../../services/operator.service";

import "./OperatorDashboard.css";

interface OperatorDashboardProps {
  operatorName?: string;
  onNavigate?: (page: string) => void;
}

type DashboardPage =
  | "overview"
  | "hubs"
  | "vehicles"
  | "parking"
  | "reservations"
  | "users"
  | "settings";

const menuItems: {
  id: DashboardPage;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "hubs", label: "Mobility Hub", icon: MapPin },
  { id: "vehicles", label: "Phương tiện", icon: CarFront },
  { id: "parking", label: "Chỗ đỗ & cổng sạc", icon: ParkingSquare },
  { id: "reservations", label: "Đặt chỗ", icon: Clock },
  { id: "users", label: "Người dùng", icon: Users },
  { id: "settings", label: "Cài đặt", icon: Settings },
];

const pageTitles: Record<DashboardPage, string> = {
  overview: "Tổng quan hệ thống",
  hubs: "Quản lý Mobility Hub",
  vehicles: "Quản lý phương tiện",
  parking: "Quản lý chỗ đỗ & cổng sạc",
  reservations: "Quản lý đặt chỗ",
  users: "Quản lý người dùng",
  settings: "Cài đặt hệ thống",
};

const formatTime = (date?: string) => {
  if (!date) return "--:--";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) return "--:--";

  return parsedDate.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDate = (date?: string) => {
  if (!date) return "";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) return "";

  return parsedDate.toLocaleDateString("vi-VN");
};

const getReservationStatus = (status: string) => {
  const normalized = status?.toUpperCase();

  const labels: Record<string, string> = {
    HELD: "Đang giữ chỗ",
    CONFIRMED: "Đã xác nhận",
    IN_USE: "Đang sử dụng",
    COMPLETED: "Hoàn thành",
    CANCELLED: "Đã hủy",
    EXPIRED: "Hết hạn",
  };

  return labels[normalized] ?? normalized ?? "Không xác định";
};

interface ActivityItem {
  id: string;
  title: string;
  description: string;
  time: string;
  timestamp: number;
  type: "booking" | "pickup" | "return";
}

const buildActivities = (
  reservations: OperatorReservation[],
  hubMap: Map<string, OperatorHub>,
  vehicleMap: Map<string, string>
): ActivityItem[] => {
  const activities: ActivityItem[] = [];

  reservations.forEach((reservation) => {
    const hubName =
      hubMap.get(reservation.hubId)?.name ?? "Mobility Hub";

    const vehicleCode = reservation.vehicleId
      ? vehicleMap.get(reservation.vehicleId) ?? "Phương tiện"
      : "Chỗ đỗ";

    const addActivity = (
      eventDate: string | undefined,
      type: ActivityItem["type"],
      title: string,
      description: string
    ) => {
      if (!eventDate) return;

      const timestamp = new Date(eventDate).getTime();

      if (Number.isNaN(timestamp)) return;

      activities.push({
        id: `${reservation.id}-${type}`,
        title,
        description,
        time: formatTime(eventDate),
        timestamp,
        type,
      });
    };

    addActivity(
      reservation.createdAt,
      "booking",
      "Có lượt đặt chỗ mới",
      `${vehicleCode} tại ${hubName}`
    );

    addActivity(
      reservation.pickedUpAt,
      "pickup",
      "Phương tiện đã được nhận",
      `${vehicleCode} tại ${hubName}`
    );

    addActivity(
      reservation.returnedAt,
      "return",
      "Phương tiện đã được trả",
      `${vehicleCode} tại ${hubName}`
    );
  });

  return activities
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 8);
};

const getHubPosition = (
  hub: OperatorHub,
  hubs: OperatorHub[]
) => {
  const hubsWithCoordinates = hubs.filter(
    (item) =>
      typeof item.latitude === "number" &&
      typeof item.longitude === "number"
  );

  if (
    typeof hub.latitude !== "number" ||
    typeof hub.longitude !== "number"
  ) {
    return null;
  }

  if (hubsWithCoordinates.length === 1) {
    return { left: 50, top: 50 };
  }

  const latitudes = hubsWithCoordinates.map(
    (item) => item.latitude as number
  );
  const longitudes = hubsWithCoordinates.map(
    (item) => item.longitude as number
  );

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  const latRange = maxLat - minLat || 1;
  const lngRange = maxLng - minLng || 1;

  return {
    left: 12 + ((hub.longitude - minLng) / lngRange) * 76,
    top: 12 + ((maxLat - hub.latitude) / latRange) * 76,
  };
};

const OperatorDashboard = ({
  operatorName = "Operator",
  onNavigate,
}: OperatorDashboardProps) => {
  const navigate = useNavigate();

  const [activePage, setActivePage] =
    useState<DashboardPage>("overview");

  const [sidebarCollapsed, setSidebarCollapsed] =
    useState(false);

  const [showNotifications, setShowNotifications] =
    useState(false);

  const [showProfile, setShowProfile] = useState(false);

  const [dashboardData, setDashboardData] =
    useState<OperatorDashboardData | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const data =
        await operatorDashboardService.getDashboardData();

      setDashboardData(data);
    } catch (err: any) {
      console.error("Operator dashboard error:", err);

      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Không thể tải dữ liệu Dashboard."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();

    const interval = window.setInterval(() => {
      loadDashboard(true);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadDashboard]);

  const hubs = dashboardData?.hubs ?? [];
  const vehicles = dashboardData?.vehicles ?? [];
  const parkingSlots = dashboardData?.parkingSlots ?? [];
  const chargingPoints = dashboardData?.chargingPoints ?? [];
  const reservations = dashboardData?.reservations ?? [];

  const stats = useMemo(() => {
    const availableSlots = parkingSlots.filter(
      (slot) => slot.status?.toUpperCase() === "FREE"
    ).length;

    const availableChargers = chargingPoints.filter(
      (point) => point.status?.toUpperCase() === "AVAILABLE"
    ).length;

    return {
      totalHubs: hubs.length,
      activeHubs: hubs.filter((hub) => hub.active).length,
      staleHubs: hubs.filter((hub) => hub.stale).length,

      totalVehicles: vehicles.length,
      totalScooters: vehicles.filter(
        (vehicle) => vehicle.type === "E_SCOOTER"
      ).length,
      totalBikes: vehicles.filter(
        (vehicle) => vehicle.type === "E_BIKE"
      ).length,

      totalParking: parkingSlots.length,
      availableParking: availableSlots,
      occupiedParking: parkingSlots.length - availableSlots,

      totalChargers: chargingPoints.length,
      availableChargers,
      unavailableChargers:
        chargingPoints.length - availableChargers,
    };
  }, [
    hubs,
    vehicles,
    parkingSlots,
    chargingPoints,
  ]);

  const hubMap = useMemo(
    () => new Map(hubs.map((hub) => [hub.id, hub])),
    [hubs]
  );

  const vehicleMap = useMemo(
    () =>
      new Map(
        vehicles.map((vehicle) => [
          vehicle.id,
          vehicle.code,
        ])
      ),
    [vehicles]
  );

  const activities = useMemo(
    () => buildActivities(reservations, hubMap, vehicleMap),
    [reservations, hubMap, vehicleMap]
  );

  const notifications = useMemo(
    () =>
      hubs
        .filter((hub) => hub.stale)
        .map((hub) => ({
          id: hub.id,
          title: "Hub mất kết nối dữ liệu",
          description: hub.name,
        })),
    [hubs]
  );

  const handleNavigate = (page: DashboardPage) => {
    setActivePage(page);
    setShowNotifications(false);
    setShowProfile(false);
    onNavigate?.(page);
  };

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    sessionStorage.removeItem("accessToken");
    navigate("/login");
  };

  const renderOverview = () => (
    <>
      <div className="operator-welcome">
        <div>
          <span className="operator-welcome-label">
            OPERATOR DASHBOARD
          </span>
          <h1>Xin chào, {operatorName}!</h1>
          <p>
            Theo dõi và quản lý hoạt động của hệ thống
            Smart E-Mobility Hub.
          </p>
        </div>

        <div className="operator-welcome-icon">
          <Activity size={42} />
        </div>
      </div>

      {error && (
        <div className="operator-error">
          <AlertCircle size={19} />
          <span>{error}</span>
          <button onClick={() => loadDashboard()}>
            Thử lại
          </button>
        </div>
      )}

      <div className="operator-stats-grid">
        <div className="operator-stat-card">
          <div className="operator-stat-top">
            <div className="operator-stat-icon hub-icon">
              <MapPin size={22} />
            </div>
            <span className="operator-stat-caption">
              Mobility Hub
            </span>
          </div>

          <div className="operator-stat-value">
            {loading ? "—" : stats.totalHubs}
          </div>

          <div className="operator-stat-footer">
            <span className="operator-stat-positive">
              <CheckCircle2 size={14} />
              {stats.activeHubs} đang hoạt động
            </span>
            {stats.staleHubs > 0 && (
              <span className="operator-stat-warning">
                {stats.staleHubs} dữ liệu cũ
              </span>
            )}
          </div>
        </div>

        <div className="operator-stat-card">
          <div className="operator-stat-top">
            <div className="operator-stat-icon vehicle-icon">
              <CarFront size={22} />
            </div>
            <span className="operator-stat-caption">
              Phương tiện
            </span>
          </div>

          <div className="operator-stat-value">
            {loading ? "—" : stats.totalVehicles}
          </div>

          <div className="operator-stat-footer">
            <span>
              <Zap size={14} />
              {stats.totalScooters} xe máy điện
            </span>
            <span>
              <Bike size={14} />
              {stats.totalBikes} xe đạp điện
            </span>
          </div>
        </div>

        <div className="operator-stat-card">
          <div className="operator-stat-top">
            <div className="operator-stat-icon parking-icon">
              <ParkingSquare size={22} />
            </div>
            <span className="operator-stat-caption">
              Chỗ đỗ xe
            </span>
          </div>

          <div className="operator-stat-value">
            {loading ? "—" : stats.totalParking}
          </div>

          <div className="operator-stat-footer">
            <span className="operator-stat-positive">
              <CheckCircle2 size={14} />
              {stats.availableParking} còn trống
            </span>
            <span>
              {stats.occupiedParking} không trống
            </span>
          </div>
        </div>

        <div className="operator-stat-card">
          <div className="operator-stat-top">
            <div className="operator-stat-icon charging-icon">
              <PlugZap size={22} />
            </div>
            <span className="operator-stat-caption">
              Cổng sạc
            </span>
          </div>

          <div className="operator-stat-value">
            {loading ? "—" : stats.totalChargers}
          </div>

          <div className="operator-stat-footer">
            <span className="operator-stat-positive">
              <CheckCircle2 size={14} />
              {stats.availableChargers} khả dụng
            </span>
            <span>
              {stats.unavailableChargers} không khả dụng
            </span>
          </div>
        </div>
      </div>

      <div className="operator-content-grid">
        <section className="operator-panel operator-map-panel">
          <div className="operator-panel-header">
            <div>
              <h2>Vị trí Mobility Hub</h2>
              <p>Theo dõi trạng thái các Hub trong hệ thống</p>
            </div>

            <button
              className="operator-text-button"
              onClick={() => handleNavigate("hubs")}
            >
              Xem tất cả
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="operator-map">
            <div className="operator-map-grid" />

            <div className="operator-map-road road-one" />
            <div className="operator-map-road road-two" />
            <div className="operator-map-road road-three" />
            <div className="operator-map-road road-four" />

            {hubs.map((hub) => {
              const position = getHubPosition(hub, hubs);

              if (!position) return null;

              return (
                <button
                  key={hub.id}
                  className={`operator-map-marker ${
                    hub.stale
                      ? "marker-stale"
                      : hub.active
                      ? "marker-active"
                      : "marker-inactive"
                  }`}
                  style={{
                    left: `${position.left}%`,
                    top: `${position.top}%`,
                  }}
                  title={`${hub.name} - ${
                    hub.stale
                      ? "Dữ liệu cũ"
                      : hub.active
                      ? "Đang hoạt động"
                      : "Ngừng hoạt động"
                  }`}
                  onClick={() => handleNavigate("hubs")}
                >
                  <MapPin size={20} />
                  <span>{hub.name}</span>
                </button>
              );
            })}

            {!loading && hubs.length === 0 && (
              <div className="operator-map-empty">
                Chưa có Mobility Hub
              </div>
            )}

            {!loading &&
              hubs.length > 0 &&
              hubs.every(
                (hub) =>
                  typeof hub.latitude !== "number" ||
                  typeof hub.longitude !== "number"
              ) && (
                <div className="operator-map-empty">
                  Các Hub chưa có tọa độ để hiển thị
                </div>
              )}
          </div>

          <div className="operator-map-legend">
            <span>
              <i className="legend-dot legend-green" />
              Đang hoạt động
            </span>
            <span>
              <i className="legend-dot legend-yellow" />
              Dữ liệu cũ
            </span>
            <span>
              <i className="legend-dot legend-gray" />
              Ngừng hoạt động
            </span>
          </div>
        </section>

        <section className="operator-panel operator-activity-panel">
          <div className="operator-panel-header">
            <div>
              <h2>Hoạt động gần đây</h2>
              <p>Cập nhật từ dữ liệu đặt chỗ</p>
            </div>

            <Activity size={20} className="operator-muted-icon" />
          </div>

          <div className="operator-activity-list">
            {loading ? (
              <div className="operator-empty-state">
                Đang tải hoạt động...
              </div>
            ) : activities.length === 0 ? (
              <div className="operator-empty-state">
                Chưa có hoạt động để hiển thị
              </div>
            ) : (
              activities.map((activity) => (
                <div
                  className="operator-activity-item"
                  key={activity.id}
                >
                  <div
                    className={`operator-activity-icon activity-${activity.type}`}
                  >
                    {activity.type === "booking" ? (
                      <Clock size={17} />
                    ) : activity.type === "pickup" ? (
                      <ArrowUpRight size={17} />
                    ) : (
                      <ArrowDownRight size={17} />
                    )}
                  </div>

                  <div className="operator-activity-info">
                    <strong>{activity.title}</strong>
                    <p>{activity.description}</p>
                    <span>{activity.time}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            className="operator-activity-more"
            onClick={() => handleNavigate("reservations")}
          >
            Xem quản lý đặt chỗ
            <ChevronRight size={16} />
          </button>
        </section>
      </div>

      <section className="operator-panel operator-reservation-panel">
        <div className="operator-panel-header">
          <div>
            <h2>Đặt chỗ gần đây</h2>
            <p>Theo dõi các lượt đặt chỗ mới nhất</p>
          </div>

          <button
            className="operator-text-button"
            onClick={() => handleNavigate("reservations")}
          >
            Xem tất cả
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="operator-table-wrapper">
          <table className="operator-table">
            <thead>
              <tr>
                <th>Mã xác nhận</th>
                <th>Mobility Hub</th>
                <th>Loại đặt chỗ</th>
                <th>Ngày tạo</th>
                <th>Trạng thái</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="operator-table-empty">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : reservations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="operator-table-empty">
                    Chưa có lượt đặt chỗ
                  </td>
                </tr>
              ) : (
                [...reservations]
                  .sort(
                    (a, b) =>
                      new Date(b.createdAt).getTime() -
                      new Date(a.createdAt).getTime()
                  )
                  .slice(0, 5)
                  .map((reservation) => (
                    <tr key={reservation.id}>
                      <td>
                        <strong>
                          {reservation.confirmationCode ||
                            reservation.id.slice(0, 8)}
                        </strong>
                      </td>
                      <td>
                        {hubMap.get(reservation.hubId)?.name ??
                          "Không xác định"}
                      </td>
                      <td>
                        {reservation.vehicleId
                          ? "Phương tiện"
                          : reservation.slotId
                          ? "Chỗ đỗ"
                          : "Không xác định"}
                      </td>
                      <td>{formatDate(reservation.createdAt)}</td>
                      <td>
                        <span
                          className={`operator-status status-${reservation.status.toLowerCase()}`}
                        >
                          {getReservationStatus(reservation.status)}
                        </span>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );

  const renderPlaceholder = () => (
    <section className="operator-placeholder">
      <div className="operator-placeholder-icon">
        {activePage === "hubs" && <MapPin size={36} />}
        {activePage === "vehicles" && <CarFront size={36} />}
        {activePage === "parking" && <ParkingSquare size={36} />}
        {activePage === "reservations" && <Clock size={36} />}
        {activePage === "users" && <Users size={36} />}
        {activePage === "settings" && <Settings size={36} />}
      </div>

      <h2>{pageTitles[activePage]}</h2>
      <p>
        Khu vực quản lý này sẽ được triển khai riêng.
        Bạn có thể quay lại trang tổng quan để theo dõi hệ thống.
      </p>

      <button
        className="operator-primary-button"
        onClick={() => handleNavigate("overview")}
      >
        <ChevronLeft size={17} />
        Quay lại tổng quan
      </button>
    </section>
  );

  return (
    <div
      className={`operator-layout ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      }`}
    >
      <aside className="operator-sidebar">
        <div className="operator-brand">
          <div className="operator-brand-logo">
            <Zap size={23} />
          </div>

          {!sidebarCollapsed && (
            <div className="operator-brand-text">
              <strong>Smart E-Mobility</strong>
              <span>HUB MANAGEMENT</span>
            </div>
          )}
        </div>

        <div className="operator-sidebar-section">
          {!sidebarCollapsed && (
            <span className="operator-sidebar-label">
              MENU CHÍNH
            </span>
          )}

          <nav className="operator-menu">
            {menuItems.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  className={`operator-menu-item ${
                    activePage === item.id ? "active" : ""
                  }`}
                  onClick={() => handleNavigate(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon size={20} />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="operator-sidebar-bottom">
          <div className="operator-sidebar-divider" />

          <div className="operator-sidebar-account">
            <div className="operator-avatar">
              {operatorName.charAt(0).toUpperCase()}
            </div>

            {!sidebarCollapsed && (
              <div className="operator-account-info">
                <strong>{operatorName}</strong>
                <span>Operator</span>
              </div>
            )}
          </div>

          <button
            className="operator-collapse-button"
            onClick={() =>
              setSidebarCollapsed((previous) => !previous)
            }
            title={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
          >
            {sidebarCollapsed ? (
              <ChevronRight size={18} />
            ) : (
              <ChevronLeft size={18} />
            )}
            {!sidebarCollapsed && <span>Thu gọn menu</span>}
          </button>
        </div>
      </aside>

      <main className="operator-main">
        <header className="operator-header">
          <div className="operator-header-left">
            <button
              className="operator-header-menu"
              onClick={() =>
                setSidebarCollapsed((previous) => !previous)
              }
              aria-label="Thu gọn menu"
            >
              <Menu size={21} />
            </button>

            <div className="operator-breadcrumb">
              <span>Operator</span>
              <ChevronRight size={15} />
              <strong>{pageTitles[activePage]}</strong>
            </div>
          </div>

          <div className="operator-header-actions">
            <button
              className={`operator-refresh-button ${
                refreshing ? "spinning" : ""
              }`}
              onClick={() => loadDashboard(true)}
              disabled={refreshing}
              title="Làm mới dữ liệu"
            >
              <RefreshCw size={18} />
            </button>

            <div className="operator-dropdown-container">
              <button
                className="operator-header-icon"
                onClick={() => {
                  setShowNotifications((previous) => !previous);
                  setShowProfile(false);
                }}
                aria-label="Thông báo"
              >
                <Bell size={20} />
                {notifications.length > 0 && (
                  <span className="operator-notification-dot">
                    {notifications.length > 9
                      ? "9+"
                      : notifications.length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="operator-dropdown operator-notification-dropdown">
                  <div className="operator-dropdown-heading">
                    <strong>Thông báo</strong>
                    <span>{notifications.length}</span>
                  </div>

                  {notifications.length === 0 ? (
                    <div className="operator-dropdown-empty">
                      <CheckCircle2 size={22} />
                      <span>Không có cảnh báo mới</span>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        className="operator-notification-item"
                        key={notification.id}
                        onClick={() => handleNavigate("hubs")}
                      >
                        <AlertCircle size={19} />
                        <span>
                          <strong>{notification.title}</strong>
                          <small>{notification.description}</small>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="operator-dropdown-container">
              <button
                className="operator-profile-button"
                onClick={() => {
                  setShowProfile((previous) => !previous);
                  setShowNotifications(false);
                }}
              >
                <div className="operator-avatar header-avatar">
                  {operatorName.charAt(0).toUpperCase()}
                </div>

                <span>{operatorName}</span>
                <ChevronDown size={16} />
              </button>

              {showProfile && (
                <div className="operator-dropdown operator-profile-dropdown">
                  <div className="operator-profile-dropdown-info">
                    <strong>{operatorName}</strong>
                    <span>Operator</span>
                  </div>

                  <button
                    onClick={() => handleNavigate("settings")}
                  >
                    <Settings size={17} />
                    Cài đặt
                  </button>

                  <button
                    className="operator-logout-button"
                    onClick={handleLogout}
                  >
                    <LogOut size={17} />
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="operator-page-content">
          <div className="operator-page-heading">
            <div>
              <h1>{pageTitles[activePage]}</h1>
              <p>
                Quản lý và theo dõi hệ thống Smart E-Mobility Hub
              </p>
            </div>

            <div className="operator-system-status">
              <span className="operator-system-status-dot" />
              Hệ thống
            </div>
          </div>

          {activePage === "overview" ? (
            renderOverview()
          ) : activePage === "hubs" ? (
            <MobilityHubManagement />
          ) : activePage === "vehicles" ? (
            <VehicleManagement />
          ) : activePage === "parking" ? (
            <ParkingManagement />
          ) : activePage === "reservations" ? (
            <ReservationManagement />
          ) : (
            renderPlaceholder()
          )}
        </div>
      </main>
    </div>
  );
};

export default OperatorDashboard;
