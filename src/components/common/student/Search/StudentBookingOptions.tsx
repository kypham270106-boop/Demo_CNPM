import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bike,
  ParkingSquare,
  MapPin,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

import type { BookingResultsState } from "./types";

import "./StudentBookingOptions.css";

type BookingType = "vehicle" | "parking";

const BOOKING_OPTIONS = [
  {
    type: "vehicle",
    Icon: Bike,
    label: "DỊCH VỤ DI CHUYỂN",
    title: "Đặt xe",
    description:
      "Tìm và lựa chọn xe điện có sẵn tại Hub để sử dụng cho hành trình của bạn.",
    footer: "Chọn xe điện",
    path: "/student/reservation/vehicle",
  },
  {
    type: "parking",
    Icon: ParkingSquare,
    label: "DỊCH VỤ BÃI ĐỖ",
    title: "Đặt chỗ đỗ cá nhân",
    description:
      "Đặt trước vị trí đỗ cho phương tiện cá nhân tại Hub. Có thể lựa chọn chỗ đỗ thông thường hoặc chỗ đỗ có hỗ trợ sạc điện.",
    footer: "Chọn chỗ đỗ",
    path: "/student/reservation/parking",
  },
] as const;

function StudentBookingOptions() {
  const navigate = useNavigate();
  const location = useLocation();

  const bookingState = location.state as BookingResultsState | null;

  const [selectedType, setSelectedType] =
    useState<BookingType | null>(null);

  if (!bookingState?.selectedHub) {
    return (
      <div className="booking-options-page booking-options-empty">
        <div className="options-empty-icon">
          <MapPin size={35} />
        </div>

        <h2>Chưa có Hub được chọn</h2>

        <p>Vui lòng tìm kiếm và chọn một Hub trước khi tiếp tục.</p>

        <button
          className="options-primary-button"
          onClick={() => navigate("/student/booking/search")}
        >
          Tìm kiếm Hub
        </button>
      </div>
    );
  }

  const { selectedHub } = bookingState;

  const hubDetails = [
    { label: "Mã Hub", value: selectedHub.code },
    { label: "Địa chỉ", value: selectedHub.address },
    { label: "Khoảng cách đến lộ trình", value: selectedHub.distance },
  ];

  // Chuyển sang màn hình đặt dịch vụ và truyền Hub đã chọn
  const handleContinue = () => {
    const option = BOOKING_OPTIONS.find(({ type }) => type === selectedType);

    if (option) navigate(option.path, { state: { selectedHub } });
  };

  return (
    <div className="booking-options-page">
      <header className="options-header">
        <button
          className="options-back-button"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={19} />
          <span>Quay lại kết quả</span>
        </button>

        <div className="options-header-brand">
          <span className="options-brand-icon">
            <MapPin size={19} />
          </span>
          Smart E-Mobility Hub
        </div>
      </header>

      <main className="booking-options-container">
        <section className="options-intro">
          <span className="options-eyebrow">LỰA CHỌN DỊCH VỤ</span>

          <h1>Bạn muốn sử dụng dịch vụ nào?</h1>

          <p>
            Chọn hình thức phù hợp với nhu cầu của bạn tại Hub đã lựa chọn.
          </p>
        </section>

        {/* Hub đã lựa chọn */}
        <section className="selected-hub-card">
          <div className="selected-hub-top">
            <div className="selected-hub-icon">
              <MapPin size={23} />
            </div>

            <div className="selected-hub-heading">
              <span>HUB ĐÃ LỰA CHỌN</span>
              <h2>{selectedHub.name}</h2>
            </div>

            <span className="selected-hub-check">
              <CheckCircle2 size={18} />
              Đã chọn
            </span>
          </div>

          <div className="selected-hub-details">
            {hubDetails.map(({ label, value }) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>

        {/* Các hình thức dịch vụ */}
        <section className="booking-options-section">
          <div className="options-section-heading">
            <h2>Chọn hình thức dịch vụ</h2>

            <p>
              Bạn có thể thuê xe điện dùng chung hoặc đặt trước chỗ đỗ
              cho phương tiện cá nhân.
            </p>
          </div>

          <div className="booking-options-grid">
            {BOOKING_OPTIONS.map(
              ({ type, Icon, label, title, description, footer }) => {
                const isSelected = selectedType === type;

                return (
                  <button
                    key={type}
                    type="button"
                    className={`booking-option-card ${type}-option ${
                      isSelected ? "selected" : ""
                    }`}
                    onClick={() => setSelectedType(type)}
                  >
                    <div className="option-card-top">
                      <div className={`booking-option-icon ${type}`}>
                        <Icon size={30} />
                      </div>

                      {isSelected && (
                        <span className="option-selected-check">
                          <CheckCircle2 size={20} />
                        </span>
                      )}
                    </div>

                    <div className="booking-option-content">
                      <span className="option-label">{label}</span>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </div>

                    <div className="option-card-footer">
                      <span>{footer}</span>
                      <ArrowRight size={18} />
                    </div>
                  </button>
                );
              }
            )}
          </div>
        </section>

        {/* Thông báo */}
        <section className="options-notice">
          <span>ℹ</span>

          <p>
            Vị trí đỗ chỉ được giữ khi bạn hoàn tất yêu cầu đặt chỗ
            và hệ thống xác nhận vị trí còn trống.
          </p>
        </section>

        {/* Nút điều hướng */}
        <div className="options-actions">
          <button
            className="options-cancel-button"
            onClick={() => navigate(-1)}
          >
            Quay lại
          </button>

          <button
            className="options-primary-button"
            onClick={handleContinue}
            disabled={!selectedType}
          >
            Tiếp tục
            <ArrowRight size={18} />
          </button>
        </div>
      </main>
    </div>
  );
}

export default StudentBookingOptions;