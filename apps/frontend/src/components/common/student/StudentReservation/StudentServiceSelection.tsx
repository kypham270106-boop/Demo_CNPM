import { usePreferences } from "../../../../preferences/PreferencesContext";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  ParkingSquare,
  CheckCircle2,
  MapPin,
} from "lucide-react";

import "./StudentServiceSelection.css";

type ServiceType = "vehicle" | "parking";

const SERVICES = [
  {
    type: "vehicle",
    Icon: Bike,
    label: "DỊCH VỤ DI CHUYỂN",
    title: "Đặt xe",
    description:
      "Tìm kiếm và đặt trước xe điện dùng chung tại Hub để phục vụ hành trình di chuyển của bạn.",
    footer: "Khám phá phương tiện",
    path: "/student/reservation/vehicle",
  },
  {
    type: "parking",
    Icon: ParkingSquare,
    label: "DỊCH VỤ BÃI ĐỖ",
    title: "Đặt chỗ đỗ",
    description:
      "Đặt trước vị trí đỗ cho xe cá nhân. Dịch vụ này dành cho nhu cầu đỗ xe thông thường.",
    footer: "Tìm kiếm chỗ đỗ",
    path: "/student/reservation/parking",
  },
] as const;

function StudentServiceSelection() {
  const { t } = usePreferences();

  const navigate = useNavigate();

  const [selectedType, setSelectedType] =
    useState<ServiceType | null>(null);

  const handleContinue = () => {
    const service = SERVICES.find(({ type }) => type === selectedType);

    if (service) navigate(service.path);
  };

  return (
    <div className="service-selection-page">
      <header className="service-selection-header">
        <button
          className="service-back-button"
          onClick={() => navigate("/student")}
        >
          <ArrowLeft size={19} />
          <span>{t("Quay lại Dashboard")}</span>
        </button>

        <div className="service-header-brand">
          <MapPin size={19} />
          Smart E-Mobility Hub
        </div>
      </header>

      <main className="service-selection-container">
        <section className="service-intro">
          <span className="service-eyebrow">{t("DỊCH VỤ SINH VIÊN")}</span>

          <h1>{t("Bạn muốn sử dụng dịch vụ nào?")}</h1>

          <p>{t("Chọn dịch vụ phù hợp với nhu cầu của bạn. Hệ thống sẽ hướng dẫn bạn thực hiện các bước tiếp theo.")}</p>
        </section>

        <section className="service-options-section">
          <div className="service-section-heading">
            <h2>{t("Chọn loại dịch vụ")}</h2>
            <p>{t("Vui lòng chọn một trong hai dịch vụ dưới đây.")}</p>
          </div>

          <div className="service-options-grid">
            {SERVICES.map(
              ({ type, Icon, label, title, description, footer }) => (
                <button
                  key={type}
                  className={`service-option-card ${type}-service ${
                    selectedType === type ? "selected" : ""
                  }`}
                  onClick={() => setSelectedType(type)}
                >
                  <div className="service-card-top">
                    <div className={`service-option-icon ${type}`}>
                      <Icon size={30} />
                    </div>

                    {selectedType === type && (
                      <CheckCircle2
                        className="service-selected-check"
                        size={22}
                      />
                    )}
                  </div>

                  <div className="service-card-content">
                    <span className="service-option-label">{label}</span>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>

                  <div className="service-card-footer">
                    <span>{footer}</span>
                    <ArrowRight size={18} />
                  </div>
                </button>
              )
            )}
          </div>
        </section>

        <section className="service-selection-notice">
          <span>ⓘ</span>

          <p>{t("Đặt xe dành cho phương tiện dùng chung của hệ thống. Đặt chỗ đỗ dành cho phương tiện cá nhân của sinh viên. Yêu cầu sạc pin được thực hiện riêng từ Dashboard.")}</p>
        </section>

        <div className="service-selection-actions">
          <button
            className="service-cancel-button"
            onClick={() => navigate("/student")}
          >{t("Quay lại")}</button>

          <button
            className="service-primary-button"
            onClick={handleContinue}
            disabled={!selectedType}
          >{t("Tiếp tục")}<ArrowRight size={18} />
          </button>
        </div>
      </main>
    </div>
  );
}

export default StudentServiceSelection;