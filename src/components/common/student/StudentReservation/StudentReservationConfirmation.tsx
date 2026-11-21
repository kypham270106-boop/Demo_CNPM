
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Bike,
  ParkingSquare,
  Zap,
  CalendarDays,
  MapPin,
  LoaderCircle,
  Clock3,
  Hash,
  BatteryCharging,
  ShieldCheck,
} from "lucide-react";

import reservationService from "../../../../services/reservation.service";
import type { ReservationNavigationState } from "./types";

import "./StudentReservationConfirmation.css";

const formatDate = (value?: string) => {
  if (!value) return "Chưa có thông tin";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Chưa có thông tin"
    : date.toLocaleString("vi-VN");
};

const getReservationDuration = (
  startsAt?: string,
  endsAt?: string
) => {
  if (!startsAt || !endsAt) return "Chưa có thông tin";

  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    end <= start
  ) {
    return "Chưa có thông tin";
  }

  const totalMinutes = Math.floor((end - start) / 60000);

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  return [
    days > 0 ? `${days} ngày` : "",
    hours > 0 ? `${hours} giờ` : "",
    minutes > 0 ? `${minutes} phút` : "",
  ]
    .filter(Boolean)
    .join(" ");
};

const getErrorMessage = (error: any) =>
  error?.response?.data?.message ||
  error?.message ||
  "Không thể xác nhận đặt chỗ. Vui lòng thử lại.";

function StudentReservationConfirmation() {
  const location = useLocation();
  const navigate = useNavigate();

  const booking =
    location.state as ReservationNavigationState | null;

  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  if (!booking?.reservationID) {
    return (
      <div className="service-selection-page">
        <main className="service-selection-container">
          <div className="reservation-error">
            Không tìm thấy thông tin đặt chỗ. Vui lòng thực hiện đặt dịch vụ lại.
          </div>

          <button
            className="service-primary-button"
            onClick={() => navigate("/student/reservation")}
          >
            Quay lại chọn dịch vụ
          </button>
        </main>
      </div>
    );
  }

  const isVehicle = booking.serviceType === "vehicle";
  const isCharging =
    !isVehicle && booking.parkingType === "charging";

  const handleConfirm = async () => {
    setSubmitting(true);
    setError("");

    try {
      if (isCharging) {
        if (!booking.chargingScheduleID) {
          throw new Error("Không tìm thấy lịch sạc đề xuất.");
        }

        await reservationService.confirmChargingSchedule(
          booking.chargingScheduleID
        );
      } else {
        await reservationService.confirmReservation(
          booking.reservationID
        );
      }

      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (cancelling || submitting || success || cancelled) return;

    const accepted = window.confirm(
      isCharging
        ? "Bạn có chắc chắn muốn hủy lịch sạc này không?"
        : "Bạn có chắc chắn muốn hủy yêu cầu đặt dịch vụ này không?"
    );

    if (!accepted) return;

    setCancelling(true);
    setError("");

    try {
      if (isCharging) {
        if (!booking.chargingScheduleID) {
          throw new Error("Không tìm thấy mã lịch sạc cần hủy.");
        }

        await reservationService.cancelChargingSchedule(
          booking.chargingScheduleID
        );
      } else {
        await reservationService.cancelReservation(
          booking.reservationID
        );
      }

      setCancelled(true);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        "Không thể hủy dịch vụ. Vui lòng thử lại."
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="service-selection-page confirmation-page">
      <header className="service-selection-header">
        <button
          className="service-back-button"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={19} />
          Quay lại
        </button>

        <div className="service-header-brand">
          {isVehicle ? (
            <Bike size={19} />
          ) : (
            <ParkingSquare size={19} />
          )}
          Xác nhận dịch vụ
        </div>
      </header>

      <main className="service-selection-container confirmation-container">
        {/* Tiêu đề xác nhận */}
        <section className="reservation-confirm-heading">
          <div
            className={`confirmation-status-icon ${
              success || cancelled ? "is-success" : ""
            }`}
          >
            <CheckCircle2 size={32} />
          </div>

          <span className="service-eyebrow">
            {cancelled
              ? "ĐÃ HỦY DỊCH VỤ"
              : success
              ? "ĐẶT DỊCH VỤ THÀNH CÔNG"
              : "KIỂM TRA THÔNG TIN"}
          </span>

          <h1>
            {cancelled
              ? "Đã hủy dịch vụ!"
              : success
              ? "Đặt dịch vụ thành công!"
              : "Xác nhận thông tin đặt dịch vụ"}
          </h1>

          <p>
            {cancelled
              ? "Yêu cầu hủy của bạn đã được hệ thống xử lý thành công."
              : success
              ? "Yêu cầu của bạn đã được hệ thống xác nhận. Hãy lưu lại thông tin đặt chỗ bên dưới."
              : "Kiểm tra lại thông tin dịch vụ trước khi gửi yêu cầu xác nhận."}
          </p>
        </section>

        <div className="confirmation-content">
          {/* Thẻ thông tin dịch vụ chính */}
          <section
            className={`confirmation-resource-card ${
              isVehicle ? "vehicle-card" : "parking-card"
            }`}
          >
            <div className="confirmation-resource-top">
              <div className="confirmation-resource-icon">
                {isVehicle ? (
                  <Bike size={30} />
                ) : isCharging ? (
                  <Zap size={30} />
                ) : (
                  <ParkingSquare size={30} />
                )}
              </div>

              <div className="confirmation-resource-title">
                <span>
                  {isVehicle
                    ? "PHƯƠNG TIỆN DÙNG CHUNG"
                    : "DỊCH VỤ ĐỖ XE CÁ NHÂN"}
                </span>

                <h2>{booking.resourceName}</h2>
                <p>{booking.resourceCode}</p>
              </div>

              <div
                className={`confirmation-status-badge ${
                  cancelled
                    ? "cancelled"
                    : success
                    ? "confirmed"
                    : "pending"
                }`}
              >
                <span />
                {cancelled
                  ? "Đã hủy"
                  : success
                  ? "Đã xác nhận"
                  : "Chờ xác nhận"}
              </div>
            </div>

            <div className="confirmation-resource-divider" />

            {/* Hub nhận xe / địa điểm sử dụng */}
            <div className="confirmation-resource-location">
              <div className="confirmation-location-icon">
                <MapPin size={19} />
              </div>

              <div>
                <span>
                  {isVehicle
                    ? "Hub nhận phương tiện"
                    : "Địa điểm sử dụng dịch vụ"}
                </span>

                <strong>{booking.hubName}</strong>
                <small>Mã Hub: {booking.hubCode}</small>
              </div>
            </div>
          </section>

          {/* Thông tin đặt chỗ */}
          <section className="confirmation-detail-panel">
            <div className="confirmation-panel-heading">
              <div className="confirmation-panel-icon">
                <CalendarDays size={20} />
              </div>

              <div>
                <h2>Thông tin đặt chỗ</h2>
                <p>Thời gian và thông tin đăng ký dịch vụ</p>
              </div>
            </div>

            <div className="confirmation-detail-grid">
              <div className="confirmation-detail-item">
                <div className="confirmation-detail-label">
                  <CalendarDays size={16} />
                  Thời gian bắt đầu
                </div>

                <strong>{formatDate(booking.startsAt)}</strong>
              </div>

              <div className="confirmation-detail-item">
                <div className="confirmation-detail-label">
                  <Clock3 size={16} />
                  Thời gian kết thúc
                </div>

                <strong>{formatDate(booking.endsAt)}</strong>
              </div>

              {/* Tổng thời gian giữ xe */}
              {isVehicle && (
                <div className="confirmation-detail-item full">
                  <div className="confirmation-detail-label">
                    <Clock3 size={16} />
                    Tổng thời gian giữ xe
                  </div>

                  <strong>
                    {getReservationDuration(
                      booking.startsAt,
                      booking.endsAt
                    )}
                  </strong>
                </div>
              )}

              {/* Mã đặt chỗ */}
              <div className="confirmation-detail-item full">
                <div className="confirmation-detail-label">
                  <Hash size={16} />
                  Mã yêu cầu đặt chỗ
                </div>

                <div className="confirmation-code-value">
                  <strong>{booking.reservationID}</strong>
                  <span>RESERVATION ID</span>
                </div>
              </div>
            </div>
          </section>

          {/* Thông tin riêng cho dịch vụ đỗ xe */}
          {!isVehicle && (
            <section className="confirmation-detail-panel">
              <div className="confirmation-panel-heading">
                <div className="confirmation-panel-icon charging-icon">
                  {isCharging ? (
                    <BatteryCharging size={20} />
                  ) : (
                    <ParkingSquare size={20} />
                  )}
                </div>

                <div>
                  <h2>Chi tiết dịch vụ đỗ xe</h2>
                  <p>Thông tin hình thức đỗ xe đã lựa chọn</p>
                </div>
              </div>

              <div className="confirmation-parking-type">
                <div className="confirmation-parking-type-icon">
                  {isCharging ? (
                    <Zap size={22} />
                  ) : (
                    <ParkingSquare size={22} />
                  )}
                </div>

                <div>
                  <span>Hình thức sử dụng</span>
                  <strong>
                    {isCharging
                      ? "Chỗ đỗ kèm sạc"
                      : "Chỗ đỗ thường"}
                  </strong>
                </div>

                <span className="confirmation-type-tag">
                  {isCharging
                    ? "PARKING + CHARGING"
                    : "PARKING"}
                </span>
              </div>

              {isCharging && (
                <>
                  <div className="confirmation-battery-grid">
                    <div className="confirmation-battery-item">
                      <BatteryCharging size={20} />
                      <span>Pin hiện tại</span>
                      <strong>{booking.currentBattery}%</strong>
                    </div>

                    <div className="confirmation-battery-item target">
                      <Zap size={20} />
                      <span>Pin mục tiêu</span>
                      <strong>{booking.targetBattery}%</strong>
                    </div>
                  </div>

                  <div className="confirmation-charging-schedule">
                    <div className="confirmation-detail-label">
                      <CalendarDays size={16} />
                      Lịch sạc đề xuất
                    </div>

                    <strong>
                      {formatDate(booking.chargingStartsAt)}
                      {" – "}
                      {formatDate(booking.chargingEndsAt)}
                    </strong>

                    <small>
                      Mã lịch sạc:{" "}
                      {booking.chargingScheduleID || "Chưa có thông tin"}
                    </small>
                  </div>

                  <p className="reservation-hint">
                    Khi bạn xác nhận lịch sạc, hệ thống đồng thời xác nhận
                    chỗ đỗ liên kết với yêu cầu sạc này.
                  </p>
                </>
              )}
            </section>
          )}

          {/* Lưu ý dành riêng cho từng loại dịch vụ */}
          <section className="confirmation-notice">
            <div className="confirmation-notice-icon">
              <ShieldCheck size={21} />
            </div>

            <div>
              <strong>Lưu ý dành cho bạn</strong>

              {isVehicle ? (
                <ul className="confirmation-notice-list">
                  <li>
                    Bạn cần đến đúng Hub đã chọn và nhận xe trong vòng
                    <strong> 10 phút </strong>
                    kể từ khi đặt xe thành công.
                  </li>

                  <li>
                    Sau khi nhận xe thành công, thời gian sử dụng xe tối đa là
                    <strong> 8 giờ</strong>.
                  </li>

                  <li>
                    Thời hạn nhận xe được tính từ thời điểm đặt xe thành công;
                    thời gian sử dụng được tính từ thời điểm nhận xe thành công.
                  </li>

                  <li>
                    Các mốc thời gian được hệ thống quản lý dựa trên
                    timestamp từ máy chủ.
                  </li>
                </ul>
              ) : (
                <p>
                  Vui lòng kiểm tra lại Hub và thông tin chỗ đỗ.
                  Trạng thái đặt chỗ sẽ được cập nhật theo hệ thống.
                </p>
              )}
            </div>
          </section>

          {/* Thông báo lỗi */}
          {error && (
            <div className="reservation-error">
              {error}
            </div>
          )}

          {/* Thông báo thành công */}
          {(success || cancelled) && (
            <div className="confirmation-success-message">
              <CheckCircle2 size={20} />

              <span>
                {cancelled
                  ? "Lịch sạc đã được hủy thành công."
                  : "Thông tin đặt dịch vụ đã được xác nhận thành công."}
              </span>
            </div>
          )}

          {/* Nút hành động */}
          {success || cancelled ? (
            <div className="service-selection-actions confirmation-actions">
              <button
                className="service-primary-button"
                onClick={() => navigate("/student", { replace: true })}
              >
                Về Dashboard
                <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <div className="service-selection-actions confirmation-actions">
              <button
                className="service-cancel-button"
                onClick={handleCancel}
                disabled={cancelling || submitting}
              >
                {cancelling ? (
                  <>
                    <LoaderCircle
                      size={17}
                      className="confirmation-spinner"
                    />
                    Đang hủy...
                  </>
                ) : (
                  "Hủy yêu cầu"
                )}
              </button>

              <button
                className="service-primary-button reservation-submit"
                onClick={handleConfirm}
                disabled={submitting || cancelling}
              >
                {submitting ? (
                  <>
                    <LoaderCircle
                      size={17}
                      className="confirmation-spinner"
                    />
                    Đang xác nhận...
                  </>
                ) : (
                  <>
                    Xác nhận đặt dịch vụ
                    <CheckCircle2 size={18} />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default StudentReservationConfirmation;
