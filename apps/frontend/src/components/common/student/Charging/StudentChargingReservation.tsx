import { usePreferences } from "../../../../preferences/PreferencesContext";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ParkingSquare,
  Zap,
  LoaderCircle,
  Clock,
} from "lucide-react";

import reservationService, {
  type Hub,
  type ParkingSlot,
  type ChargingPoint,
} from "../../../../services/reservation.service";

import "../StudentReservation/StudentParkingReservation.css";

// Cấu hình tính toán sạc
const BATTERY_CAPACITY_KWH = 0.6;
const CHARGING_EFFICIENCY = 0.85;

// Thời hạn kỹ thuật khi người dùng chưa xác định thời gian kết thúc
const DEFAULT_RESERVATION_DAYS = 7;

const unwrap = (response: any) =>
  response?.data?.data ?? response?.data ?? response;

const toLocalInput = (date: Date) => {
  const offset = date.getTimezoneOffset();

  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 16);
};

const getErrorMessage = (error: any) =>
  error?.response?.data?.message ||
  error?.message ||
  "Không thể thực hiện yêu cầu. Vui lòng thử lại.";

// Tính thời lượng sạc dự kiến theo phút
const calculateChargingDuration = (
  currentBattery: number,
  targetBattery: number,
  chargingPower: number
) => {
  if (
    !Number.isFinite(chargingPower) ||
    chargingPower <= 0 ||
    targetBattery <= currentBattery
  ) {
    return 0;
  }

  const energyNeeded =
    BATTERY_CAPACITY_KWH *
    ((targetBattery - currentBattery) / 100);

  const chargingHours =
    energyNeeded / (chargingPower * CHARGING_EFFICIENCY);

  return Math.ceil(chargingHours * 60);
};

// Hiển thị thời lượng theo giờ và phút


function StudentChargingReservation() {
  const { t } = usePreferences();

const formatDuration = (minutes: number) => {
  if (minutes <= 0) return t("Chưa xác định");

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} ${t("phút")}`;
  }

  if (remainingMinutes === 0) {
    return `${hours} ${t("giờ")}`;
  }

  return `${hours} ${t("giờ")} ${remainingMinutes} ${t("phút")}`;
};

  const navigate = useNavigate();

  const [hubs, setHubs] = useState<Hub[]>([]);
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [chargingPoints, setChargingPoints] = useState<ChargingPoint[]>([]);

  const [hubID, setHubID] = useState("");
  const [slotID, setSlotID] = useState("");

  const [endTimeMode, setEndTimeMode] =
    useState<"specified" | "unspecified">("specified");

  const [startsAt, setStartsAt] = useState(() => {
    const date = new Date();
    date.setHours(date.getHours() + 1, 0, 0, 0);
    return toLocalInput(date);
  });

  const [endsAt, setEndsAt] = useState(() => {
    const date = new Date();
    date.setHours(date.getHours() + 3, 0, 0, 0);
    return toLocalInput(date);
  });

  const [currentBattery, setCurrentBattery] = useState("30");
  const [targetBattery, setTargetBattery] = useState("80");
  const [personalVehicleRef, setPersonalVehicleRef] = useState("");

  const [loadingHubs, setLoadingHubs] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Lấy thời gian kết thúc thực tế gửi đến API
  const getEffectiveEndDate = () => {
    const startDate = new Date(startsAt);

    if (endTimeMode === "unspecified") {
      const endDate = new Date(startDate);
      endDate.setDate(
        endDate.getDate() + DEFAULT_RESERVATION_DAYS
      );

      return endDate;
    }

    return new Date(endsAt);
  };

  // Lấy danh sách Hub
  useEffect(() => {
    const loadHubs = async () => {
      try {
        const data = await reservationService.getHubs();

        setHubs(
          data.filter(
            (hub) => hub.active !== false && hub.stale !== true
          )
        );
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoadingHubs(false);
      }
    };

    loadHubs();
  }, []);

  // Lấy danh sách chỗ đỗ và cổng sạc theo Hub
  useEffect(() => {
    setSlots([]);
    setChargingPoints([]);
    setSlotID("");

    if (!hubID) return;

    const loadAvailability = async () => {
      setLoadingAvailability(true);
      setError("");

      try {
        const [parkingSlots, points] = await Promise.all([
          reservationService.getParkingSlots(hubID),
          reservationService.getChargingPoints(hubID),
        ]);

        console.log("PARKING SLOTS:", parkingSlots);
        console.log("CHARGING POINTS:", points);

        // Lấy tất cả chỗ đỗ đang FREE
        setSlots(
          parkingSlots.filter(
            (slot) => slot.status === "FREE"
          )
        );

        // Lấy các cổng sạc đang AVAILABLE
        setChargingPoints(
          points.filter(
            (point) =>
            point.hubId === hubID &&
            point.status === "AVAILABLE"
          )
        );
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoadingAvailability(false);
      }
    };

    loadAvailability();
  }, [hubID]);

  const selectedHub = hubs.find(
    (hub) => hub.id === hubID
  );

  // Chỉ hiển thị chỗ đỗ FREE có cổng sạc AVAILABLE
  const visibleSlots = slots.filter((slot) =>
    chargingPoints.some(
      (point) =>
        point.hubId === hubID &&
        point.slotId === slot.id &&
        point.status === "AVAILABLE"
    )
  );

  // Xác định vị trí đỗ đang chọn
  const selectedSlot = visibleSlots.find(
    (slot) => slot.id === slotID
  );

  // Tự động xác định cổng sạc theo vị trí đỗ
  const selectedPoint = selectedSlot
    ? chargingPoints.find(
        (point) =>
          point.slotId === selectedSlot.id &&
          point.status === "AVAILABLE"
      )
    : undefined;

  const currentBatteryValue = Number(currentBattery);
  const targetBatteryValue = Number(targetBattery);
  const chargingPower = Number(selectedPoint?.powerKw ?? 0);

  const estimatedDuration = selectedPoint
    ? calculateChargingDuration(
        currentBatteryValue,
        targetBatteryValue,
        chargingPower
      )
    : 0;

  // Kiểm tra dữ liệu trước khi gửi
  const validateForm = () => {
    const startDate = new Date(startsAt);
    const endDate = getEffectiveEndDate();

    if (!hubID || !slotID || !selectedSlot) {
      return t("Vui lòng chọn Hub và vị trí đỗ xe có cổng sạc.");
    }

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      return t("Thời gian kết thúc phải sau thời gian bắt đầu.");
    }

    if (startDate <= new Date()) {
      return t("Thời gian bắt đầu phải ở tương lai.");
    }

    if (!personalVehicleRef.trim()) {
      return t("Vui lòng nhập mã tham chiếu xe cá nhân.");
    }

    const current = Number(currentBattery);
    const target = Number(targetBattery);

    if (!selectedPoint) {
      return t("Vui lòng chọn vị trí đỗ có cổng sạc khả dụng.");
    }

    if (
      !Number.isFinite(current) ||
      !Number.isFinite(target) ||
      current < 0 ||
      current >= 100 ||
      target > 100 ||
      target <= current
    ) {
      return t("Mức pin mục tiêu phải lớn hơn mức pin hiện tại và không vượt quá 100%.");
    }

    if (
      !Number.isFinite(chargingPower) ||
      chargingPower <= 0
    ) {
      return t("Điểm sạc được chọn chưa có thông tin công suất hợp lệ.");
    }

    if (estimatedDuration <= 0) {
      return t("Không thể tính thời lượng sạc. Vui lòng kiểm tra thông tin pin và điểm sạc.");
    }

    const parkingDurationMinutes =
      (endDate.getTime() - startDate.getTime()) / 60000;

    if (estimatedDuration > parkingDurationMinutes) {
      return t("Thời gian đỗ xe không đủ để hoàn thành thời lượng sạc dự kiến. Vui lòng điều chỉnh thời gian đỗ.");
    }

    return "";
  };

  // Gửi yêu cầu đặt chỗ và đăng ký sạc
  const handleSubmit = async () => {
    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!selectedHub || !selectedSlot || !selectedPoint) return;

    setSubmitting(true);
    setError("");

    let createdReservationID = "";

    try {
      const startDate = new Date(startsAt);
      const endDate = getEffectiveEndDate();

      // Tạo yêu cầu giữ chỗ đỗ
      const reservationResponse =
        await reservationService.createReservation({
          startsAt: startDate.toISOString(),
          endsAt: endDate.toISOString(),
          hubId: hubID,
          slotId: slotID,
        });

      const reservationData = unwrap(reservationResponse);

      const reservation =
        reservationData?.reservation ?? reservationData;

      createdReservationID =
        reservation?.id ?? reservation?._id ?? "";

      if (!createdReservationID) {
        throw new Error(t("API không trả về mã đặt chỗ đỗ."));
      }

      let chargingScheduleID = "";
      let chargingStartsAt = "";
      let chargingEndsAt = "";

      try {
        // Tạo yêu cầu sạc liên kết với chỗ đỗ vừa giữ
        const chargingResponse =
          await reservationService.createChargingRequest({
            startsAt: startDate.toISOString(),
            endsAt: endDate.toISOString(),
            hubId: hubID,
            reservationId: createdReservationID,
            pointId: selectedPoint.id,
            personalVehicleRef: personalVehicleRef.trim(),
            currentBattery: currentBatteryValue,
            targetBattery: targetBatteryValue,
            durationMinutes: estimatedDuration,
            capacityKwh: BATTERY_CAPACITY_KWH,
          });

        const chargingData = unwrap(chargingResponse);
        const proposal = chargingData?.proposal;

        chargingScheduleID = proposal?.id ?? "";

        if (!chargingScheduleID) {
          throw new Error(t("API không trả về lịch sạc đề xuất."));
        }

        chargingStartsAt = proposal?.startsAt ?? "";
        chargingEndsAt = proposal?.endsAt ?? "";
      } catch (chargingError) {
        // Hủy chỗ đỗ nếu tạo yêu cầu sạc thất bại
        await reservationService
          .cancelReservation(createdReservationID)
          .catch(() => undefined);

        throw chargingError;
      }

      // Chuyển thẳng sang màn hình xác nhận
      navigate("/student/reservation/confirmation", {
        state: {
          serviceType: "parking",
          reservationID: createdReservationID,
          hubName: selectedHub.name,
          hubCode: selectedHub.code,
          startsAt: startDate.toISOString(),
          endsAt: endDate.toISOString(),
          endTimeMode,
          hubEndTimeNote:
            endTimeMode === "unspecified"
              ? t("Thời hạn kỹ thuật 7 ngày do hệ thống áp dụng, không phải thời điểm người dùng cam kết kết thúc.")
              : "",
          resourceName: t("Chỗ đỗ xe cá nhân"),
          resourceCode: selectedSlot.code,
          parkingType: "charging",
          chargingScheduleID,
          chargingStartsAt,
          chargingEndsAt,
          chargingPointCode: selectedPoint.code,
          currentBattery: currentBatteryValue,
          targetBattery: targetBatteryValue,
          estimatedDuration,
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
          <Zap size={19} />{t("Đặt chỗ kèm sạc")}</div>
      </header>

      <main className="service-selection-container">
        <section className="service-intro">
          <span className="service-eyebrow">{t("DỊCH VỤ SẠC PIN")}</span>

          <h1>{t("Đặt lịch sạc pin")}</h1>

          <p>{t("Chọn Hub, vị trí đỗ có tích hợp cổng sạc và đăng ký lịch sạc cho phương tiện cá nhân của bạn.")}</p>
        </section>

        <div className="reservation-form">
          {/* 01. Chọn Hub và thời gian */}
          <section className="reservation-panel">
            <h2>{t("01. Chọn Hub và thời gian")}</h2>

            <div className="reservation-grid">
              <div className="reservation-field full">
                <label htmlFor="charging-hub">{t("Trạm Hub")}</label>

                <select
                  id="charging-hub"
                  value={hubID}
                  onChange={(event) =>
                    setHubID(event.target.value)
                  }
                  disabled={loadingHubs}
                >
                  <option value="">
                    {loadingHubs
                      ? t("Đang tải Hub...")
                      : t("Chọn trạm Hub")}
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
              </div>

              <div className="reservation-field full">
                <label>{t("Thời gian kết thúc")}</label>

                <div className="reservation-choice-grid">
                  <button
                    type="button"
                    className={`reservation-choice ${
                      endTimeMode === "specified"
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      setEndTimeMode("specified")
                    }
                  >
                    <strong>{t("Có thời gian kết thúc")}</strong>

                    <span>{t("Chủ động chọn ngày và giờ kết thúc sử dụng.")}</span>
                  </button>

                  <button
                    type="button"
                    className={`reservation-choice ${
                      endTimeMode === "unspecified"
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      setEndTimeMode("unspecified")
                    }
                  >
                    <strong>{t("Chưa xác định thời gian kết thúc")}</strong>

                    <span>{t("Chưa cần chọn trước thời điểm kết thúc sử dụng.")}</span>
                  </button>
                </div>
              </div>

              <div className="reservation-field">
                <label htmlFor="charging-start">{t("Thời gian bắt đầu")}</label>

                <input
                  id="charging-start"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) =>
                    setStartsAt(event.target.value)
                  }
                />
              </div>

              {endTimeMode === "specified" ? (
                <div className="reservation-field">
                  <label htmlFor="charging-end">{t("Thời gian kết thúc")}</label>

                  <input
                    id="charging-end"
                    type="datetime-local"
                    min={startsAt}
                    value={endsAt}
                    onChange={(event) =>
                      setEndsAt(event.target.value)
                    }
                  />
                </div>
              ) : (
                <div className="reservation-field full">
                  <div className="reservation-time-notice">
                    <Clock size={18} />

                    <span>{t("Bạn chưa cần xác định thời điểm kết thúc. Do API hiện tại yêu cầu thời gian kết thúc, hệ thống sẽ tạm sử dụng thời hạn kỹ thuật 7 ngày kể từ lúc bắt đầu để gửi yêu cầu đặt chỗ.")}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 02. Chọn vị trí đỗ có cổng sạc */}
          <section className="reservation-panel">
            <h2>{t("02. Chọn vị trí cổng sạc")}</h2>

            {!hubID ? (
              <div className="reservation-empty">{t("Vui lòng chọn Hub trước.")}</div>
            ) : loadingAvailability ? (
              <div className="reservation-loading">
                <LoaderCircle size={18} />{t("Đang tải danh sách chỗ đỗ...")}</div>
            ) : visibleSlots.length === 0 ? (
              <div className="reservation-empty">{t("Không có chỗ đỗ kèm cổng sạc khả dụng trong Hub này.")}</div>
            ) : (
              <div className="reservation-choice-grid">
                {visibleSlots.map((slot) => {
                  const slotPoint = chargingPoints.find(
                    (point) =>
                      point.slotId === slot.id &&
                      point.status === "AVAILABLE"
                  );

                  return (
                    <button
                      type="button"
                      key={slot.id}
                      className={`reservation-choice ${
                        slotID === slot.id ? "selected" : ""
                      }`}
                      onClick={() => setSlotID(slot.id)}
                    >
                      <strong>
                        <ParkingSquare size={17} />{t("Chỗ đỗ ")}{slot.code}
                      </strong>

                      <div className="slot-details">
                        <span>{t("Trạng thái: Còn trống")}</span>

                        {slotPoint && (
                          <span className="slot-charging-info">
                            <Zap
                              size={14}
                              className="slot-charging-icon"
                            />
                            {slotPoint.code}
                            {" · "}
                            {slotPoint.powerKw ?? t("Chưa có")} kW
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* 03. Đăng ký nhu cầu sạc */}
          <section className="reservation-panel">
            <h2>{t("03. Đăng ký nhu cầu sạc")}</h2>

            <div className="reservation-grid">
              <div className="reservation-field full">
                <label htmlFor="personal-vehicle-ref">{t("Mã tham chiếu xe cá nhân")}</label>

                <input
                  id="personal-vehicle-ref"
                  type="text"
                  value={personalVehicleRef}
                  onChange={(event) =>
                    setPersonalVehicleRef(event.target.value)
                  }
                  placeholder={t("Nhập mã tham chiếu xe cá nhân")}
                />
              </div>

              <div className="reservation-field">
                <label htmlFor="current-battery">{t("Mức pin hiện tại (%)")}</label>

                <input
                  id="current-battery"
                  type="number"
                  min="0"
                  max="99"
                  value={currentBattery}
                  onChange={(event) =>
                    setCurrentBattery(event.target.value)
                  }
                />
              </div>

              <div className="reservation-field">
                <label htmlFor="target-battery">{t("Mức pin mục tiêu (%)")}</label>

                <input
                  id="target-battery"
                  type="number"
                  min="1"
                  max="100"
                  value={targetBattery}
                  onChange={(event) =>
                    setTargetBattery(event.target.value)
                  }
                />
              </div>

              <div className="reservation-field">
                <label>{t("Cổng sạc liên kết")}</label>

                <input
                  value={
                    selectedPoint
                      ? `${selectedPoint.code} - ${selectedPoint.powerKw ?? t("Chưa có")} kW`
                      : ""
                  }
                  placeholder={t("Cổng sạc sẽ tự động hiển thị khi chọn chỗ đỗ")}
                  readOnly
                />
              </div>

              <div className="reservation-field">
                <label>{t("Hiệu suất sạc")}</label>

                <input
                  value="85%"
                  readOnly
                />
              </div>
            </div>

            <div className="charging-estimate">
              <div className="charging-estimate-icon">
                <Clock size={22} />
              </div>

              <div className="charging-estimate-content">
                <span>{t("Thời lượng sạc dự kiến")}</span>

                <strong>
                  {selectedPoint && estimatedDuration > 0
                    ? formatDuration(estimatedDuration)
                    : t("Chọn chỗ đỗ để tính toán")}
                </strong>

                <p>
                  {selectedPoint
                    ? `${t("Công suất sạc:")} ${chargingPower} kW · ${t("Dung lượng pin:")} ${BATTERY_CAPACITY_KWH} kWh`
                    : t("Thời lượng sạc sẽ được hệ thống tự động tính dựa trên mức pin và công suất điểm sạc.")}
                </p>
              </div>
            </div>
          </section>

          {/* Thông báo lỗi */}
          {error && (
            <div className="reservation-error">
              {t(error)}
            </div>
          )}

          {/* Các nút thao tác */}
          <div className="service-selection-actions">
            <button
              className="service-cancel-button"
              onClick={() =>
                navigate("/student")
              }
            >{t("Quay lại")}</button>

            <button
              className="service-primary-button"
              onClick={handleSubmit}
              disabled={
                submitting ||
                loadingAvailability ||
                !hubID ||
                !slotID ||
                !selectedSlot ||
                !selectedPoint ||
                estimatedDuration <= 0
              }
            >
              {submitting
                ? t("Đang xử lý...")
                : t("Xác nhận đặt chỗ và sạc")}

              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default StudentChargingReservation;
