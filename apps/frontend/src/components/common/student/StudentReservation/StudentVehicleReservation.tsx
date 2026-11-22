import { usePreferences } from "../../../../preferences/PreferencesContext";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bike,
  LoaderCircle,
} from "lucide-react";

import reservationService, {
  type Hub,
  type Vehicle,
} from "../../../../services/reservation.service";

import {
  defaultTimeInput,
  extractReservationID,
  getErrorMessage,
  isUsableHub,
  validateTimeRange,
} from "../../../../services/reservationUtils";

import "./StudentVehicleReservation.css";

type VehicleType = "E_BIKE" | "E_MOTORBIKE";

const VEHICLE_TYPES: Record<VehicleType, { emoji: string; name: string }> = {
  E_BIKE: { emoji: "🚲", name: "Xe đạp điện" },
  E_MOTORBIKE: { emoji: "🛵", name: "Xe máy điện" },
};

// Mọi xe không phải E_BIKE đều được tính là xe máy điện
const getVehicleType = (vehicle: Vehicle): VehicleType =>
  vehicle.type === "E_BIKE" ? "E_BIKE" : "E_MOTORBIKE";

const getVehicleTypeLabel = (type: VehicleType) =>
  `${VEHICLE_TYPES[type].emoji} ${VEHICLE_TYPES[type].name}`;

function StudentVehicleReservation() {
  const { t } = usePreferences();

  const navigate = useNavigate();
  const location = useLocation();

  // Hub được truyền từ màn hình StudentBookingOptions
  const passedHub = location.state?.selectedHub as Hub | undefined;

  const [hubs, setHubs] = useState<Hub[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Tự động chọn Hub đã được truyền sang
  const [hubID, setHubID] = useState(() => passedHub?.id ?? "");
  const [vehicleID, setVehicleID] = useState("");
  const [selectedVehicleType, setSelectedVehicleType] =
    useState<VehicleType | null>(null);

  const [startsAt, setStartsAt] = useState(() => defaultTimeInput(1));
  const [endsAt, setEndsAt] = useState(() => defaultTimeInput(2));

  const [loadingHubs, setLoadingHubs] = useState(true);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Tải danh sách Hub
  useEffect(() => {
    const loadHubs = async () => {
      try {
        const activeHubs = (await reservationService.getHubs()).filter(
          isUsableHub
        );

        // Đảm bảo Hub được truyền từ màn hình trước vẫn hiển thị
        setHubs(
          passedHub && !activeHubs.some((hub) => hub.id === passedHub.id)
            ? [passedHub, ...activeHubs]
            : activeHubs
        );

        // Giữ Hub đã chọn từ màn hình tìm kiếm
        if (passedHub?.id) {
          setHubID(passedHub.id);
        }
      } catch (err) {
        setError(getErrorMessage(err));

        // API tải Hub lỗi nhưng đã có Hub được truyền sang:
        // vẫn hiển thị Hub đó để người dùng không mất lựa chọn.
        if (passedHub) {
          setHubs([passedHub]);
          setHubID(passedHub.id);
        }
      } finally {
        setLoadingHubs(false);
      }
    };

    loadHubs();
  }, []);

  // Tải danh sách xe khả dụng theo Hub và thời gian
  useEffect(() => {
    setVehicleID("");
    setVehicles([]);
    setSelectedVehicleType(null);

    if (!hubID || !startsAt || !endsAt) return;

    const loadVehicles = async () => {
      setLoadingVehicles(true);
      setError("");

      try {
        const availability = await reservationService.getHubAvailability(
          hubID,
          new Date(startsAt).toISOString(),
          new Date(endsAt).toISOString()
        );

        setVehicles(
          (availability.vehicles ?? []).filter(
            (vehicle) => vehicle.status === "AVAILABLE"
          )
        );
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoadingVehicles(false);
      }
    };

    loadVehicles();
  }, [hubID, startsAt, endsAt]);

  const selectedHub = hubs.find((hub) => hub.id === hubID);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleID);

  const countByType = (type: VehicleType) =>
    vehicles.filter((vehicle) => getVehicleType(vehicle) === type).length;

  const filteredVehicles = selectedVehicleType
    ? vehicles.filter(
        (vehicle) => getVehicleType(vehicle) === selectedVehicleType
      )
    : [];

  const handleSubmit = async () => {
    setError("");

    if (!hubID || !vehicleID || !selectedHub || !selectedVehicle) {
      setError(t("Vui lòng chọn Hub và phương tiện."));
      return;
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    const timeError = validateTimeRange(startDate, endDate);

    if (timeError) {
      setError(timeError);
      return;
    }

    setSubmitting(true);

    try {
      const response = await reservationService.createReservation({
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        hubId: hubID,
        vehicleId: vehicleID,
      });

      const reservationID = extractReservationID(response);

      if (!reservationID) {
        throw new Error(t("API không trả về mã đặt xe."));
      }

      navigate("/student/reservation/confirmation", {
        state: {
          serviceType: "vehicle",
          reservationID,
          hubName: selectedHub.name,
          hubCode: selectedHub.code,
          startsAt: startDate.toISOString(),
          endsAt: endDate.toISOString(),
          resourceName: VEHICLE_TYPES[getVehicleType(selectedVehicle)].name,
          resourceCode: selectedVehicle.code,
        },
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="service-selection-page">
      <header className="service-selection-header">

        <div className="service-header-brand">
          <Bike size={19} />{t("Đặt xe")}</div>
      </header>

      <main className="service-selection-container">
        <section className="service-intro">
          <span className="service-eyebrow">{t("DỊCH VỤ DI CHUYỂN")}</span>

          <h1>{t("Đặt xe điện dùng chung")}</h1>

          <p>{t("Chọn Hub, phương tiện và khoảng thời gian bạn muốn sử dụng.")}</p>
        </section>

        <div className="reservation-form">
          {/* 01. Chọn Hub */}
          <section className="reservation-panel">
            <h2>{t("01. Chọn trạm Hub")}</h2>

            <div className="reservation-grid">
              <div className="reservation-field full">
                <label htmlFor="vehicle-hub">{t("Trạm Hub")}</label>

                <select
                  id="vehicle-hub"
                  value={hubID}
                  onChange={(event) => {
                    setHubID(event.target.value);
                    setVehicleID("");
                  }}
                  disabled={loadingHubs}
                >
                  <option value="">
                    {loadingHubs ? t("Đang tải Hub...") : t("Chọn trạm Hub")}
                  </option>

                  {hubs.map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {hub.name} ({hub.code})
                    </option>
                  ))}
                </select>

                {selectedHub?.address && (
                  <span className="reservation-hint">
                    {selectedHub.address}
                  </span>
                )}

                {passedHub && hubID === passedHub.id && (
                  <span className="reservation-hint">{t("Hub được chọn từ kết quả tìm kiếm lộ trình.")}</span>
                )}

                {!loadingHubs && hubs.length === 0 && (
                  <span className="reservation-hint">{t("Hiện chưa có Hub khả dụng.")}</span>
                )}
              </div>
            </div>
          </section>

          {/* 02. Thời gian */}
          <section className="reservation-panel">
            <h2>{t("02. Thời gian sử dụng")}</h2>

            <div className="reservation-grid">
              <div className="reservation-field">
                <label htmlFor="vehicle-start">{t("Thời gian bắt đầu")}</label>

                <input
                  id="vehicle-start"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </div>

              <div className="reservation-field">
                <label htmlFor="vehicle-end">{t("Thời gian kết thúc")}</label>

                <input
                  id="vehicle-end"
                  type="datetime-local"
                  min={startsAt}
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
              </div>
            </div>
          </section>

          {/* 03. Chọn loại phương tiện */}
          <section className="reservation-panel">
            <h2>{t("03. Chọn loại phương tiện")}</h2>

            {!hubID ? (
              <div className="reservation-empty">{t("Vui lòng chọn Hub trước.")}</div>
            ) : loadingVehicles ? (
              <div className="reservation-loading">
                <LoaderCircle size={18} />{t("Đang kiểm tra phương tiện...")}</div>
            ) : vehicles.length === 0 ? (
              <div className="reservation-empty">{t("Không có phương tiện khả dụng trong khoảng thời gian này.")}</div>
            ) : (
              <div className="reservation-choice-grid">
                {(Object.keys(VEHICLE_TYPES) as VehicleType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`reservation-choice ${
                      selectedVehicleType === type ? "selected" : ""
                    }`}
                    onClick={() => {
                      setSelectedVehicleType(type);
                      setVehicleID("");
                    }}
                  >
                    <strong>{t(getVehicleTypeLabel(type))}</strong>
                    <span>{countByType(type)}{t(" xe khả dụng")}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 04. Danh sách xe */}
          <section className="reservation-panel">
            <h2>{t("04. Danh sách phương tiện")}</h2>

            {!selectedVehicleType ? (
              <div className="reservation-empty">{t("Vui lòng chọn loại phương tiện để xem danh sách xe.")}</div>
            ) : filteredVehicles.length === 0 ? (
              <div className="reservation-empty">{t("Không có xe thuộc loại phương tiện này khả dụng.")}</div>
            ) : (
              <div className="reservation-choice-grid">
                {filteredVehicles.map((vehicle) => (
                  <button
                    type="button"
                    key={vehicle.id}
                    className={`reservation-choice ${
                      vehicleID === vehicle.id ? "selected" : ""
                    }`}
                    onClick={() => setVehicleID(vehicle.id)}
                  >
                    <strong>
                      {t(getVehicleTypeLabel(getVehicleType(vehicle)))}
                    </strong>

                    <span>{t("Mã phương tiện: ")}{vehicle.code}</span>

                    {vehicle.battery !== undefined && (
                      <span>Pin: {vehicle.battery}%</span>
                    )}

                    <span>{t("Trạng thái: Có thể đặt")}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {error && <div className="reservation-error">{t(error)}</div>}

          {/* Nút điều hướng */}
          <div className="service-selection-actions">
            <button
              className="service-cancel-button"
              onClick={() => navigate(-1)}
            >{t("Quay lại")}</button>

            <button
              className="service-primary-button"
              onClick={handleSubmit}
              disabled={
                submitting || loadingVehicles || !hubID || !vehicleID
              }
            >
              {submitting ? t("Đang tạo đặt xe...") : t("Tiếp tục")}

              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default StudentVehicleReservation;