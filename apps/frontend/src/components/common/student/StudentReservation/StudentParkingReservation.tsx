import { usePreferences } from "../../../../preferences/PreferencesContext";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ParkingSquare,
  LoaderCircle,
  Clock,
} from "lucide-react";

import reservationService, {
  type Hub,
  type ParkingSlot,
} from "../../../../services/reservation.service";

import "./StudentParkingReservation.css";

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

function StudentParkingReservation() {
  const { t } = usePreferences();

  const navigate = useNavigate();

  const [hubs, setHubs] = useState<Hub[]>([]);
  const [slots, setSlots] = useState<ParkingSlot[]>([]);

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

  const [loadingHubs, setLoadingHubs] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Nếu chưa xác định thời gian kết thúc,
  // hệ thống tạm sử dụng thời hạn kỹ thuật 7 ngày.
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

  // Lấy danh sách chỗ đỗ theo Hub
  useEffect(() => {
    setSlots([]);
    setSlotID("");

    if (!hubID) return;

    let cancelled = false;

    const loadAvailability = async () => {
      setLoadingAvailability(true);
      setError("");

      try {
        const parkingSlots =
          await reservationService.getParkingSlots(hubID);

        if (cancelled) return;

        console.log("PARKING SLOTS:", parkingSlots);

        setSlots(
          parkingSlots.filter(
            (slot) => slot.status === "FREE"
          )
        );
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setLoadingAvailability(false);
        }
      }
    };

    loadAvailability();

    return () => {
      cancelled = true;
    };
  }, [hubID]);

  const selectedHub = hubs.find(
    (hub) => hub.id === hubID
  );

  const selectedSlot = slots.find(
    (slot) => slot.id === slotID
  );

  // Kiểm tra dữ liệu trước khi gửi
  const validateForm = () => {
    const startDate = new Date(startsAt);
    const endDate = getEffectiveEndDate();

    if (!hubID || !selectedHub || !slotID || !selectedSlot) {
      return t("Vui lòng chọn Hub và vị trí đỗ xe.");
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

    return "";
  };

  // Gửi yêu cầu đặt chỗ
  const handleSubmit = async () => {
    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!selectedHub || !selectedSlot) return;

    setSubmitting(true);
    setError("");

    try {
      const startDate = new Date(startsAt);
      const endDate = getEffectiveEndDate();

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

      const reservationID =
        reservation?.id ?? reservation?._id ?? "";

      if (!reservationID) {
        throw new Error(t("API không trả về mã đặt chỗ đỗ."));
      }

      navigate("/student/reservation/confirmation", {
        state: {
          serviceType: "parking",
          reservationID,
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
          <ParkingSquare size={19} />{t("Đặt chỗ đỗ")}</div>
      </header>

      <main className="service-selection-container">
        <section className="service-intro">
          <span className="service-eyebrow">{t("DỊCH VỤ BÃI ĐỖ")}</span>

          <h1>{t("Đặt chỗ đỗ xe cá nhân")}</h1>

          <p>{t("Chọn Hub, thời gian sử dụng và vị trí đỗ phù hợp với phương tiện cá nhân của bạn.")}</p>
        </section>

        <div className="reservation-form">
          {/* 01. Chọn Hub và thời gian */}
          <section className="reservation-panel">
            <h2>{t("01. Chọn Hub và thời gian")}</h2>

            <div className="reservation-grid">
              <div className="reservation-field full">
                <label htmlFor="parking-hub">{t("Trạm Hub")}</label>

                <select
                  id="parking-hub"
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
                <label htmlFor="parking-start">{t("Thời gian bắt đầu")}</label>

                <input
                  id="parking-start"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) =>
                    setStartsAt(event.target.value)
                  }
                />
              </div>

              {endTimeMode === "specified" ? (
                <div className="reservation-field">
                  <label htmlFor="parking-end">{t("Thời gian kết thúc")}</label>

                  <input
                    id="parking-end"
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

          {/* 02. Chọn vị trí đỗ */}
          <section className="reservation-panel">
            <h2>{t("02. Chọn vị trí đỗ")}</h2>

            {!hubID ? (
              <div className="reservation-empty">{t("Vui lòng chọn Hub trước.")}</div>
            ) : loadingAvailability ? (
              <div className="reservation-loading">
                <LoaderCircle size={18} />{t("Đang tải danh sách chỗ đỗ...")}</div>
            ) : slots.length === 0 ? (
              <div className="reservation-empty">{t("Không có chỗ đỗ trống trong Hub này.")}</div>
            ) : (
              <div className="reservation-choice-grid">
                {slots.map((slot) => (
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
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {error && (
            <div className="reservation-error">
              {t(error)}
            </div>
          )}

          <div className="service-selection-actions">
            <button
              className="service-cancel-button"
              onClick={() =>
                navigate(-1)
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
                !selectedSlot
              }
            >
              {submitting ? t("Đang xử lý...") : t("Tiếp tục")}

              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default StudentParkingReservation;
