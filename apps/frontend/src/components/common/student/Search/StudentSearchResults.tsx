import { usePreferences } from "../../../../preferences/PreferencesContext";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bike,
  Zap,
  PlugZap,
  BatteryCharging,
  MapPin,
  Check,
  Navigation,
  Flag,
} from "lucide-react";

import routeService, {
  type FilterType,
  type Hub,
} from "../../../../services/route.service";

import type { BookingSearchState } from "./types";
import "./StudentSearchResults.css";

const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const toRadians = (degree: number) => (degree * Math.PI) / 180;
  const earthRadius = 6371;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

function StudentSearchResults() {
  const { t } = usePreferences();

  const navigate = useNavigate();
  const location = useLocation();

  const searchState = location.state as BookingSearchState | null;

  const [filter, setFilter] = useState<FilterType>("all");
  const [batteryAbove50, setBatteryAbove50] = useState(false);
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [suggestedReturnHub, setSuggestedReturnHub] =
    useState<Hub | null>(null);

  // Hub nhận xe: lọc phương tiện, mức pin và sắp xếp theo khoảng cách.
  const pickupHubs = useMemo(() => {
    if (!searchState?.hubs || !searchState.startLocation) return [];

    return routeService
      .filterHubs(searchState.hubs, filter)
      .filter((hub) => !batteryAbove50 || hub.batteryLevel > 50)
      .map((hub) => ({
        ...hub,
        distanceKm: calculateDistance(
          searchState.startLocation!.latitude,
          searchState.startLocation!.longitude,
          hub.latitude,
          hub.longitude
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [searchState, filter, batteryAbove50]);

  // Hub trả xe đề xuất: không áp dụng bộ lọc nhận xe.
  const returnHubs = useMemo(() => {
    if (!searchState?.hubs || !searchState.destinationLocation) return [];

    return searchState.hubs
      .map((hub) => ({
        ...hub,
        distanceKm: calculateDistance(
          searchState.destinationLocation!.latitude,
          searchState.destinationLocation!.longitude,
          hub.latitude,
          hub.longitude
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [searchState]);

  // Gộp Hub trên bản đồ và loại bỏ marker trùng lặp.
  const mapHubs = useMemo(() => {
    const uniqueHubs = new Map<string, Hub>();

    [...pickupHubs, ...returnHubs].forEach((hub) => {
      const hubID = String(hub.id);
      if (!uniqueHubs.has(hubID)) uniqueHubs.set(hubID, hub);
    });

    return Array.from(uniqueHubs.values());
  }, [pickupHubs, returnHubs]);

  if (
    !searchState ||
    !searchState.startLocation ||
    !searchState.destinationLocation
  ) {
    return (
      <div className="booking-page booking-empty-state">
        <div className="booking-empty-icon">
          <MapPin size={35} />
        </div>

        <h2>{t("Không tìm thấy thông tin tìm kiếm")}</h2>
        <p>{t("Vui lòng quay lại và nhập điểm đi, điểm đến để tìm Hub.")}</p>

        <button
          className="booking-primary-button"
          onClick={() => navigate("/student/booking/search")}
        >{t("Quay lại tìm kiếm")}</button>
      </div>
    );
  }

  const handleContinue = () => {
    if (!selectedHub || !suggestedReturnHub) return;

    navigate("/student/booking/options", {
      state: {
        ...searchState,
        selectedHub,
        suggestedReturnHub,
      },
    });
  };

  const formatDistance = (distance: number) => `${distance.toFixed(2)} km`;

  const renderHubCard = (hub: Hub, type: "pickup" | "return") => {
    const isPickup = type === "pickup";
    const isSelected = isPickup
      ? selectedHub?.id === hub.id
      : suggestedReturnHub?.id === hub.id;

    const handleSelect = () => {
      if (isPickup) setSelectedHub(hub);
      else setSuggestedReturnHub(hub);
    };

    const selectedText = isPickup
      ? t("Đã chọn Hub nhận xe")
      : t("Đã chọn Hub trả xe đề xuất");

    const unselectedText = isPickup
      ? t("Chọn Hub nhận xe")
      : t("Chọn Hub trả xe đề xuất");

    return (
      <article
        key={`${type}-${hub.id}`}
        className={`booking-hub-card ${isSelected ? "selected" : ""} ${
          !isPickup ? "return-hub-card" : ""
        }`}
      >
        <div className="booking-hub-card-top">
          <div className="booking-hub-icon">
            <MapPin size={20} />
          </div>

          <div className="booking-hub-name">
            <h3>{hub.name}</h3>
            <span>{hub.code}</span>
          </div>

          {isSelected && (
            <span className="booking-selected-check">
              <Check size={15} />
            </span>
          )}
        </div>

        <div className="booking-hub-address">
          <MapPin size={14} />
          <span>{hub.address}</span>
        </div>

        <div className="booking-hub-distance">
          <Navigation size={14} />
          <span>{t("Cách điểm ")}{isPickup ? t("xuất phát") : t("đến")}:{" "}
            {formatDistance(hub.distanceKm)}
          </span>
        </div>

        <div className="booking-hub-stats">
          <div className="hub-stat bike">
            <Bike size={16} />
            <div>
              <strong>{hub.bikes}</strong>
              <span>{t("Xe đạp")}</span>
            </div>
          </div>

          <div className="hub-stat scooter">
            <Zap size={16} />
            <div>
              <strong>{hub.scooters}</strong>
              <span>{t("Xe máy")}</span>
            </div>
          </div>

          <div className="hub-stat charging">
            <PlugZap size={16} />
            <div>
              <strong>{hub.chargingSlots}</strong>
              <span>{t("Điểm sạc")}</span>
            </div>
          </div>

          <div className="hub-stat battery">
            <BatteryCharging size={16} />
            <div>
              <strong>{hub.batteryLevel}%</strong>
              <span>{t("Mức pin")}</span>
            </div>
          </div>
        </div>

        <button
          className={`booking-select-hub-button ${
            isSelected ? "selected" : ""
          } ${!isPickup ? "return-select-button" : ""}`}
          onClick={handleSelect}
        >
          {isSelected ? selectedText : unselectedText}
        </button>

        {!isPickup && (
          <p className="return-hub-note">{t("Đây chỉ là Hub gợi ý để tham khảo lộ trình, chưa đặt chỗ trả xe.")}</p>
        )}
      </article>
    );
  };

  return (
    <div className="booking-page">
      <header className="booking-header">
        <button
          className="booking-back-button"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={19} />
          <span>{t("Quay lại")}</span>
        </button>

        <div className="booking-header-brand">
          <span className="booking-brand-icon">
            <MapPin size={19} />
          </span>
          Smart E-Mobility Hub
        </div>
      </header>

      <main className="booking-results-container">
        <section className="booking-results-heading">
          <span className="booking-eyebrow">{t("KẾT QUẢ TÌM KIẾM")}</span>
          <h1>{t("Các Hub phù hợp với bạn")}</h1>
          <p>{t("Chọn Hub nhận xe gần điểm xuất phát và Hub trả xe đề xuất gần điểm đến.")}</p>
        </section>

        <section className="booking-route-summary">
          <div className="booking-summary-point">
            <span className="summary-dot start" />
            <div>
              <span>{t("Điểm xuất phát")}</span>
              <strong>{searchState.startPoint}</strong>
            </div>
          </div>

          <div className="booking-summary-divider">
            <Navigation size={16} />
          </div>

          <div className="booking-summary-point">
            <span className="summary-dot destination" />
            <div>
              <span>{t("Điểm đến")}</span>
              <strong>{searchState.destination}</strong>
            </div>
          </div>
        </section>

        <div className="booking-results-layout">
          <section className="booking-map-section">
            <div className="booking-section-title">
              <div>
                <h2>{t("Bản đồ Hub")}</h2>
                <p>{t("Vị trí các Hub trên hành trình")}</p>
              </div>
              <span className="booking-result-count">{mapHubs.length} Hub</span>
            </div>

            <div className="booking-map">
              <div className="map-grid-pattern" />
              <div className="map-road map-road-one" />
              <div className="map-road map-road-two" />
              <div className="map-road map-road-three" />

              <div className="map-route-line">
                <span className="map-route-start" />
                <span className="map-route-end" />
              </div>

              {mapHubs.map((hub) => {
                const isPickup = pickupHubs.some((item) => item.id === hub.id);
                const isReturn = returnHubs.some((item) => item.id === hub.id);
                const isPickupSelected = selectedHub?.id === hub.id;
                const isReturnSelected = suggestedReturnHub?.id === hub.id;

                return (
                  <button
                    key={hub.id}
                    className={`map-hub-marker ${
                      isPickupSelected ? "selected" : ""
                    } ${isReturnSelected ? "return-selected" : ""}`}
                    style={{
                      top: hub.position.top,
                      left: hub.position.left,
                    }}
                    onClick={() => {
                      if (isPickup) setSelectedHub(hub);
                      else if (isReturn) setSuggestedReturnHub(hub);
                    }}
                    title={`${hub.name} - ${
                      isPickup ? t("Hub nhận xe") : t("Hub trả xe đề xuất")
                    }`}
                  >
                    <MapPin size={22} fill="currentColor" />
                  </button>
                );
              })}

              <div className="map-location-label map-start-label">
                <span className="map-label-dot start" />{t("Điểm đi")}</div>

              <div className="map-location-label map-end-label">
                <span className="map-label-dot end" />{t("Điểm đến")}</div>

              {mapHubs.length === 0 && (
                <div className="map-no-results">{t("Không tìm thấy Hub trên hành trình.")}</div>
              )}

              <div className="map-legend">
                <span>
                  <i className="legend-dot hub" />
                  Hub
                </span>
                <span>
                  <i className="legend-dot selected" />{t("Hub nhận xe")}</span>
                <span>
                  <i className="legend-dot return" />{t("Hub trả xe")}</span>
              </div>
            </div>
          </section>

          <section className="booking-hub-section">
            <div className="booking-section-title">
              <div>
                <h2>{t("Danh sách Hub")}</h2>
                <p>{t("Chọn Hub cho hành trình của bạn")}</p>
              </div>
            </div>

            <div className="booking-filter-list">
              <button
                className={filter === "all" ? "active" : ""}
                onClick={() => setFilter("all")}
              >{t("Tất cả")}</button>

              <button
                className={filter === "bike" ? "active" : ""}
                onClick={() => setFilter("bike")}
              >
                <Bike size={15} />{t("Xe đạp")}</button>

              <button
                className={filter === "scooter" ? "active" : ""}
                onClick={() => setFilter("scooter")}
              >
                <Zap size={15} />{t("Xe máy")}</button>

              <label className="booking-battery-filter">
                <input
                  type="checkbox"
                  checked={batteryAbove50}
                  onChange={(event) => setBatteryAbove50(event.target.checked)}
                />
                <BatteryCharging size={17} />
                <span>{t("Pin trên 50%")}</span>
              </label>
            </div>

            <div className="booking-hub-list">
              <div className="booking-hub-group">
                <div className="booking-hub-group-heading">
                  <div>
                    <h3>
                      <Bike size={17} />{t("1. Hub nhận xe")}</h3>
                    <p>{t("Chọn Hub gần điểm xuất phát để đặt phương tiện.")}</p>
                  </div>
                  <span>{pickupHubs.length} Hub</span>
                </div>

                {pickupHubs.length > 0 ? (
                  pickupHubs.map((hub) => renderHubCard(hub, "pickup"))
                ) : (
                  <div className="booking-no-hubs">
                    <MapPin size={30} />
                    <h3>{t("Không tìm thấy Hub nhận xe")}</h3>
                    <p>{t("Không có Hub phù hợp với loại phương tiện bạn đã chọn.")}</p>
                    <button
                      onClick={() => {
                        setFilter("all");
                        setBatteryAbove50(false);
                      }}
                    >{t("Xem tất cả phương tiện")}</button>
                  </div>
                )}
              </div>

              <div className="booking-hub-group">
                <div className="booking-hub-group-heading return">
                  <div>
                    <h3>
                      <Flag size={17} />{t("2. Hub trả xe đề xuất")}</h3>
                    <p>{t("Tham khảo Hub gần điểm đến để định hướng nơi trả xe.")}</p>
                  </div>
                  <span>{returnHubs.length} Hub</span>
                </div>

                {returnHubs.length > 0 ? (
                  returnHubs.map((hub) => renderHubCard(hub, "return"))
                ) : (
                  <div className="booking-no-hubs">
                    <MapPin size={30} />
                    <h3>{t("Không tìm thấy Hub trả xe")}</h3>
                    <p>{t("Hiện chưa có Hub phù hợp gần điểm đến.")}</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {(selectedHub || suggestedReturnHub) && (
          <div className="booking-selection-bar">
            <div className="booking-selection-info">
              <span className="selection-check-icon">
                <Check size={17} />
              </span>

              <div>
                <span>{t("Hub nhận xe")}</span>
                <strong>{selectedHub?.name || t("Chưa chọn")}</strong>
              </div>

              <div>
                <span>{t("Hub trả xe đề xuất")}</span>
                <strong>{suggestedReturnHub?.name || t("Chưa chọn")}</strong>
              </div>
            </div>

            <button
              className="booking-continue-button"
              onClick={handleContinue}
              disabled={!selectedHub || !suggestedReturnHub}
            >{t("Tiếp tục")}<span>→</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default StudentSearchResults;
