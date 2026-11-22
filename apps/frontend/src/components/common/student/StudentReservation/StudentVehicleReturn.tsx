import { usePreferences } from "../../../../preferences/PreferencesContext";

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  BatteryCharging,
  Clock,
  MapPin,
  Navigation,
  CheckCircle,
  LoaderCircle,
  AlertCircle,
  ParkingSquare,
} from "lucide-react";

import reservationService, {
  type Hub,
} from "../../../../services/reservation.service";
import routeService from "../../../../services/route.service";

import "./StudentVehicleReturn.css";

interface Reservation {
  id?: string;
  _id?: string;
  vehicleId?: string;
  hubId?: string;
  status?: string;
  pickedUpAt?: string;
  createdAt?: string;
  vehicle?: {
    name?: string;
    code?: string;
    type?: string;
    batteryLevel?: number;
    battery?: number;
  };
  hub?: {
    id?: string;
    name?: string;
    code?: string;
    latitude?: number;
    longitude?: number;
  };
}

interface LocationPoint {
  latitude: number;
  longitude: number;
  label: string;
}

const getErrorMessage = (error: any) => {
  const code =
    error?.response?.data?.code ||
    error?.response?.data?.error?.code;

  const messages: Record<string, string> = {
    RESERVATION_NOT_FOUND: "Không tìm thấy lượt đặt xe.",
    RESERVATION_STATE: "Lượt đặt xe hiện không thể trả.",
    RETURN_INVALID: "Thông tin trả xe không hợp lệ.",
    RETURN_HUB_FULL: "Hub đã hết chỗ đỗ. Vui lòng chọn Hub khác.",
    RETURN_HUB_REQUIRED: "Vui lòng chọn Hub trả xe.",
    HUB_NOT_FOUND: "Không tìm thấy Hub đã chọn.",
    HUB_STALE: "Thông tin Hub đã cũ. Vui lòng chọn Hub khác.",
  };

  return (
    messages[code] ||
    error?.response?.data?.message ||
    "Không thể trả xe. Vui lòng thử lại."
  );
};

const unwrapData = (response: any) =>
  response?.data?.data ?? response?.data ?? response;

const StudentVehicleReturn = () => {
  const { t } = usePreferences();

  const navigate = useNavigate();
  const location = useLocation();

  const navigationState = location.state as {
    reservationID?: string;
    reservation?: Reservation;
  } | null;

  const reservationID = navigationState?.reservationID || "";
  const initialReservation = navigationState?.reservation || null;

  const [reservation, setReservation] = useState<Reservation | null>(
    initialReservation
  );

  const [hubs, setHubs] = useState<Hub[]>([]);
  const [selectedHubID, setSelectedHubID] = useState("");
  const [currentLocation, setCurrentLocation] =
    useState<LocationPoint | null>(null);

  const [routeCoordinates, setRouteCoordinates] = useState<
    [number, number][]
  >([]);

  const [loading, setLoading] = useState(true);
  const [routeLoading, setRouteLoading] = useState(false);
  const [returnLoading, setReturnLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const availableHubs = useMemo(
    () =>
      hubs.filter(
        (hub) =>
          hub.active !== false &&
          hub.stale !== true &&
          typeof hub.latitude === "number" &&
          typeof hub.longitude === "number"
      ),
    [hubs]
  );

  const selectedHub = availableHubs.find(
    (hub) => hub.id === selectedHubID
  );

  const batteryLevel =
    reservation?.vehicle?.batteryLevel ??
    reservation?.vehicle?.battery ??
    78;

  useEffect(() => {
    if (!reservationID) {
      navigate("/student", { replace: true });
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setErrorMessage("");

        const [hubsResponse, reservationResponse] = await Promise.all([
          reservationService.getHubs(),
          initialReservation
            ? Promise.resolve(null)
            : reservationService.getReservation(reservationID),
        ]);

        const hubData = unwrapData(hubsResponse);
        const reservationData = reservationResponse
          ? unwrapData(reservationResponse)
          : initialReservation;

        setHubs(Array.isArray(hubData) ? hubData : []);

        if (reservationData) {
          setReservation(reservationData);
        }

        const validHubs = (Array.isArray(hubData) ? hubData : []).filter(
          (hub: Hub) =>
            hub.active !== false &&
            hub.stale !== true &&
            typeof hub.latitude === "number" &&
            typeof hub.longitude === "number"
        );

        const originalHubID =
          reservationData?.hubId ||
          reservationData?.hub?.id ||
          "";

        const defaultHub =
          validHubs.find((hub: Hub) => hub.id === originalHubID) ||
          validHubs[0];

        if (defaultHub) {
          setSelectedHubID(defaultHub.id);
        } else {
          setErrorMessage(t("Hiện không có Hub phù hợp để trả xe."));
        }
      } catch (error) {
        console.error("Load return screen error:", error);
        setErrorMessage(t("Không thể tải thông tin trả xe."));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [reservationID, navigate]);

  useEffect(() => {
    if (!reservation) return;

    const updateElapsedTime = () => {
      const start = reservation.pickedUpAt
        ? new Date(reservation.pickedUpAt).getTime()
        : Date.now();

      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - start) / 1000))
      );
    };

    updateElapsedTime();

    const interval = window.setInterval(updateElapsedTime, 1000);

    return () => window.clearInterval(interval);
  }, [reservation]);

  useEffect(() => {
    if (!selectedHub) return;

    let cancelled = false;

    const loadRoute = async () => {
      try {
        setRouteLoading(true);

        const destination: LocationPoint = {
          latitude: selectedHub.latitude!,
          longitude: selectedHub.longitude!,
          label: selectedHub.name,
        };

        let start: LocationPoint;

        try {
          start = await routeService.getCurrentLocation();
        } catch {
          // Vị trí demo khi trình duyệt không cấp quyền GPS.
          start = {
            latitude: destination.latitude + 0.008,
            longitude: destination.longitude + 0.008,
            label: t("Vị trí hiện tại (demo)"),
          };
        }

        if (cancelled) return;

        setCurrentLocation(start);

        try {
          const coordinates = await routeService.getRouteCoordinates(
            start,
            destination
          );

          if (!cancelled) {
            setRouteCoordinates(
              Array.isArray(coordinates) ? coordinates : []
            );
          }
        } catch (error) {
          console.error("Load route error:", error);
          if (!cancelled) setRouteCoordinates([]);
        }
      } catch (error) {
        console.error("Get current location error:", error);

        if (!cancelled) {
          setCurrentLocation({
            latitude: selectedHub.latitude! + 0.008,
            longitude: selectedHub.longitude! + 0.008,
            label: t("Vị trí hiện tại (demo)"),
          });
          setRouteCoordinates([]);
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    };

    loadRoute();

    return () => {
      cancelled = true;
    };
  }, [selectedHub]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours} ${t("giờ")} ${minutes} ${t("phút")}`;
    }

    if (minutes > 0) {
      return `${minutes} ${t("phút")} ${remainingSeconds} ${t("giây")}`;
    }

    return `${remainingSeconds} ${t("giây")}`;
  };

  const mapPoints = useMemo(() => {
    const coordinates =
      routeCoordinates.length >= 2
        ? routeCoordinates
        : currentLocation && selectedHub
          ? [
              [currentLocation.latitude, currentLocation.longitude],
              [selectedHub.latitude!, selectedHub.longitude!],
            ] as [number, number][]
          : [];

    if (coordinates.length < 2) return "";

    const latitudes = coordinates.map((point) => point[0]);
    const longitudes = coordinates.map((point) => point[1]);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const latRange = maxLat - minLat || 0.0001;
    const lngRange = maxLng - minLng || 0.0001;

    return coordinates
      .map(([lat, lng]) => {
        const x = 35 + ((lng - minLng) / lngRange) * 330;
        const y = 35 + ((maxLat - lat) / latRange) * 230;

        return `${x},${y}`;
      })
      .join(" ");
  }, [routeCoordinates, currentLocation, selectedHub]);

  const handleReturnVehicle = async () => {
    if (!reservationID || !selectedHubID) {
      setErrorMessage(t("Vui lòng chọn Hub trả xe."));
      return;
    }

    try {
      setReturnLoading(true);
      setErrorMessage("");

      await reservationService.returnVehicle(reservationID, {
        hubId: selectedHubID,
        condition: "GOOD",
      });

      navigate("/student", {
        replace: true,
        state: {
          returnSuccess: true,
        },
      });
    } catch (error) {
      console.error("Return vehicle error:", error);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setReturnLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="vehicle-return-loading">
        <LoaderCircle className="spinning" size={32} />
        <p>{t("Đang tải thông tin chuyến đi...")}</p>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="vehicle-return-loading">
        <AlertCircle size={32} />
        <p>{t("Không tìm thấy thông tin chuyến đi.")}</p>
        <button onClick={() => navigate("/student")}>{t("Quay lại Dashboard")}</button>
      </div>
    );
  }

  return (
    <div className="vehicle-return-page">
      <header className="vehicle-return-header">
        <button
          className="return-back-button"
          onClick={() => navigate("/student")}
        >
          <ArrowLeft size={19} />
          <span>Dashboard</span>
        </button>

        <div className="return-header-title">
          <h1>{t("Trả xe")}</h1>
          <p>{t("Hoàn tất chuyến đi của bạn")}</p>
        </div>
      </header>

      <main className="vehicle-return-container">
        <section className="return-welcome">
          <div>
            <span className="return-eyebrow">SMART E-MOBILITY HUB</span>
            <h2>{t("Đã đến lúc trả xe?")}</h2>
            <p>{t("Chọn Hub phù hợp để hoàn tất chuyến đi của bạn.")}</p>
          </div>

          <div className="return-welcome-icon">
            <Bike size={42} />
          </div>
        </section>

        <section className="return-trip-card">
          <div className="return-section-heading">
            <div>
              <h3>{t("Thông tin chuyến đi")}</h3>
              <p>{t("Thông tin sử dụng xe hiện tại")}</p>
            </div>
            <span className="return-status">
              <span />{t("Đang sử dụng")}</span>
          </div>

          <div className="return-vehicle-info">
            <div className="return-vehicle-icon">
              <Bike size={30} />
            </div>

            <div>
              <strong>
                {reservation.vehicle?.name || t("Phương tiện của bạn")}
              </strong>
              <span>
                {reservation.vehicle?.code || t("Xe điện")}
              </span>
            </div>
          </div>

          <div className="return-trip-stats">
            <div className="return-stat">
              <span className="return-stat-icon">
                <Clock size={19} />
              </span>
              <div>
                <small>{t("Thời gian sử dụng")}</small>
                <strong>{formatDuration(elapsedSeconds)}</strong>
              </div>
            </div>

            <div className="return-stat">
              <span className="return-stat-icon">
                <Navigation size={19} />
              </span>
              <div>
                <small>{t("Quãng đường demo")}</small>
                <strong>2.4 km</strong>
              </div>
            </div>

            <div className="return-stat">
              <span className="return-stat-icon">
                <BatteryCharging size={19} />
              </span>
              <div>
                <small>{t("Dung lượng pin")}</small>
                <strong>{batteryLevel}%</strong>
              </div>
            </div>
          </div>

          <p className="return-demo-note">{t("* Thời gian được tính từ lúc nhận xe. Quãng đường là dữ liệu demo.")}</p>
        </section>

        <section className="return-hub-section">
          <div className="return-section-heading">
            <div>
              <h3>{t("Chọn Hub trả xe")}</h3>
              <p>{t("Chọn địa điểm bạn muốn trả phương tiện")}</p>
            </div>
            <ParkingSquare size={24} />
          </div>

          <div className="return-hub-list">
            {availableHubs.map((hub) => (
              <button
                key={hub.id}
                className={`return-hub-option ${
                  selectedHubID === hub.id ? "selected" : ""
                }`}
                onClick={() => setSelectedHubID(hub.id)}
              >
                <span className="return-hub-icon">
                  <MapPin size={21} />
                </span>

                <span className="return-hub-details">
                  <strong>{hub.name}</strong>
                  <small>
                    {hub.address || hub.code || t("Điểm trả xe")}
                  </small>
                </span>

                <span className="return-hub-radio">
                  {selectedHubID === hub.id && (
                    <CheckCircle size={20} />
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="return-map-section">
          <div className="return-section-heading">
            <div>
              <h3>{t("Đường đến Hub trả xe")}</h3>
              <p>
                {selectedHub?.name || t("Chưa chọn Hub")}
              </p>
            </div>
            <Navigation size={23} />
          </div>

          <div className="return-map">
            {routeLoading ? (
              <div className="return-map-loading">
                <LoaderCircle className="spinning" size={28} />
                <span>{t("Đang tìm đường đến Hub...")}</span>
              </div>
            ) : (
              <>
                <div className="map-road map-road-one" />
                <div className="map-road map-road-two" />
                <div className="map-road map-road-three" />

                <svg
                  className="return-route-svg"
                  viewBox="0 0 400 300"
                  preserveAspectRatio="none"
                >
                  {mapPoints && (
                    <>
                      <polyline
                        points={mapPoints}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <polyline
                        points={mapPoints}
                        fill="none"
                        stroke="#159b83"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="8 5"
                      />
                    </>
                  )}
                </svg>

                {currentLocation && (
                  <div className="return-map-marker current-marker">
                    <span />
                    <small>{t("Vị trí của bạn")}</small>
                  </div>
                )}

                {selectedHub && (
                  <div className="return-map-marker destination-marker">
                    <MapPin size={25} />
                    <small>{t("Hub trả xe")}</small>
                  </div>
                )}

                <div className="return-map-caption">
                  <span>
                    <i className="current-dot" />{t("Vị trí hiện tại")}</span>
                  <span>
                    <i className="destination-dot" />{t("Hub trả xe")}</span>
                </div>
              </>
            )}
          </div>

          <p className="return-map-note">
            <MapPin size={15} />
            {currentLocation?.label ||
              t("Bản đồ hiển thị tuyến đường đến Hub được chọn.")}
          </p>
        </section>

        {errorMessage && (
          <div className="return-error">
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        <section className="return-confirm-section">
          <div>
            <h3>{t("Sẵn sàng hoàn tất chuyến đi?")}</h3>
            <p>{t("Sau khi xác nhận, hệ thống sẽ ghi nhận việc trả xe tại Hub đã chọn.")}</p>
          </div>

          <button
            className="return-confirm-button"
            onClick={handleReturnVehicle}
            disabled={returnLoading || !selectedHubID}
          >
            {returnLoading ? (
              <>
                <LoaderCircle className="spinning" size={19} />{t("Đang xử lý...")}</>
            ) : (
              <>{t("Xác nhận trả xe")}<ArrowRight size={19} />
              </>
            )}
          </button>
        </section>
      </main>
    </div>
  );
};

export default StudentVehicleReturn;
