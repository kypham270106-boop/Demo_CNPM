
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import {
  ArrowLeft,
  MapPin,
  LocateFixed,
  Search,
  X,
} from "lucide-react";

import routeService, {
  type LocationPoint,
} from "../../../../services/route.service";

import {
  MIN_QUERY_LENGTH,
  useLocationField,
  type LocationField,
} from "../../../../services/useLocationField";

import type { BookingSearchState } from "./types";

import "./StudentSearchRoute.css";

type ActiveInput = "start" | "destination" | null;
type MapTarget = "start" | "destination";

interface FavoriteLocation {
  label: string;
  latitude: number;
  longitude: number;
}

interface SearchHistoryItem {
  id: number;
  startPoint: string;
  destination: string;
  startLocation: LocationPoint;
  destinationLocation: LocationPoint;
}

interface LocationInputProps {
  id: string;
  label: string;
  placeholder: string;
  clearLabel: string;
  field: LocationField;
  active: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
  onSelect: (location: LocationPoint) => void;
  children?: ReactNode;
}

interface MapPickerProps {
  position: [number, number] | null;
  onPick: (latitude: number, longitude: number) => void;
}

// ================================
// Ô nhập địa điểm
// ================================

function LocationInput({
  id,
  label,
  placeholder,
  clearLabel,
  field,
  active,
  onFocus,
  onChange,
  onSelect,
  children,
}: LocationInputProps) {
  return (
    <div className="route-input-block">
      <label htmlFor={id}>{label}</label>

      <div className="route-input-wrapper">
        <MapPin size={19} />

        <input
          id={id}
          type="text"
          placeholder={placeholder}
          value={field.text}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
        />

        {field.text && (
          <button
            type="button"
            className="route-clear-button"
            onClick={() => onChange("")}
            aria-label={clearLabel}
          >
            <X size={17} />
          </button>
        )}
      </div>

      {active && (
        <div className="route-suggestions">
          {field.loading ? (
            <div className="route-suggestion-message">
              Đang tìm địa điểm...
            </div>
          ) : field.suggestions.length > 0 ? (
            field.suggestions.map((location, index) => (
              <button
                type="button"
                key={`${location.latitude}-${location.longitude}-${index}`}
                className="route-suggestion-item"
                onClick={() => onSelect(location)}
              >
                <MapPin size={17} />
                <span>{location.label}</span>
              </button>
            ))
          ) : field.text.trim().length >= MIN_QUERY_LENGTH ? (
            <div className="route-suggestion-message">
              Không tìm thấy địa điểm phù hợp.
            </div>
          ) : null}
        </div>
      )}

      {children}
    </div>
  );
}

// ================================
// Bản đồ chọn vị trí
// ================================

function MapClickHandler({
  onPick,
}: {
  onPick: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

function MapPicker({ position, onPick }: MapPickerProps) {
  const defaultCenter: [number, number] = [
    10.8231,
    106.6297,
  ];

  return (
    <MapContainer
      center={position || defaultCenter}
      zoom={position ? 16 : 13}
      className="route-map"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapClickHandler onPick={onPick} />

      {position && (
        <CircleMarker
          center={position}
          radius={10}
          pathOptions={{
            color: "#ffffff",
            weight: 3,
            fillColor: "#0f766e",
            fillOpacity: 1,
          }}
        />
      )}
    </MapContainer>
  );
}

// ================================
// Trang tìm kiếm lộ trình
// ================================

function StudentSearchRoute() {
  const navigate = useNavigate();

  const start = useLocationField("Start location search error:");
  const destination = useLocationField("Destination search error:");

  // Trạng thái giao diện
  const [activeInput, setActiveInput] =
    useState<ActiveInput>(null);

  const [loadingGPS, setLoadingGPS] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  // Trạng thái bản đồ
  const [showMap, setShowMap] = useState(false);
  const [mapTarget, setMapTarget] = useState<MapTarget | null>(
    null
  );
  const [mapPoint, setMapPoint] =
    useState<LocationPoint | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState("");

  // Địa điểm yêu thích
  const [favorites, setFavorites] = useState<FavoriteLocation[]>(
    () => {
      try {
        return JSON.parse(
          localStorage.getItem("bookingFavorites") || "[]"
        );
      } catch {
        return [];
      }
    }
  );

  // Lịch sử tìm kiếm
  const [history, setHistory] = useState<SearchHistoryItem[]>(
    () => {
      try {
        return JSON.parse(
          localStorage.getItem("bookingSearchHistory") || "[]"
        );
      } catch {
        return [];
      }
    }
  );

  const [showAllHistory, setShowAllHistory] = useState(false);

  // ================================
  // Xử lý ô nhập địa điểm
  // ================================

  const handleChange = (
    field: LocationField,
    value: string
  ) => {
    field.change(value);
    setError("");
  };

  const handleSelect = (
    field: LocationField,
    location: LocationPoint
  ) => {
    field.choose(location);
    setActiveInput(null);
    setError("");
  };

  // ================================
  // Lấy vị trí GPS
  // ================================

  const handleGetCurrentLocation = async () => {
    try {
      setLoadingGPS(true);
      setError("");

      start.choose(await routeService.getCurrentLocation());

      setActiveInput(null);
    } catch (err) {
      console.error("GPS error:", err);

      setError(
        "Không thể xác định vị trí hiện tại. Vui lòng kiểm tra quyền truy cập vị trí."
      );
    } finally {
      setLoadingGPS(false);
    }
  };

  // ================================
  // Chọn vị trí trên bản đồ
  // ================================

  const handleOpenMap = (target: MapTarget) => {
    const field = target === "start" ? start : destination;

    setMapTarget(target);
    setMapPoint(field.location);
    setMapError("");
    setMapLoading(false);
    setShowMap(true);
    setActiveInput(null);
  };

  // Nhấn lên bản đồ để chọn tọa độ
  const handleMapPick = async (
    latitude: number,
    longitude: number
  ) => {
    const temporaryPoint: LocationPoint = {
      label: "Đang lấy địa chỉ...",
      latitude,
      longitude,
    };

    setMapPoint(temporaryPoint);
    setMapLoading(true);
    setMapError("");

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=vi`
      );

      if (!response.ok) {
        throw new Error("Không thể lấy địa chỉ.");
      }

      const data = await response.json();

      setMapPoint({
        label:
          data.display_name ||
          `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        latitude,
        longitude,
      });
    } catch (err) {
      console.error("Reverse geocoding error:", err);

      setMapPoint({
        label: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        latitude,
        longitude,
      });

      setMapError(
        "Không lấy được tên địa chỉ. Bạn vẫn có thể xác nhận tọa độ này."
      );
    } finally {
      setMapLoading(false);
    }
  };

  // Xác nhận vị trí trên bản đồ
  const handleConfirmMapLocation = () => {
    if (!mapPoint || !mapTarget || mapLoading) {
      return;
    }

    if (mapTarget === "start") {
      start.choose(mapPoint);
    } else {
      destination.choose(mapPoint);
    }

    setShowMap(false);
    setMapTarget(null);
    setMapError("");
    setActiveInput(null);
    setError("");
  };

  // Đóng bản đồ
  const handleCloseMap = () => {
    setShowMap(false);
    setMapTarget(null);
    setMapError("");
    setMapLoading(false);
  };

  // ================================
  // Đổi điểm đi và điểm đến
  // ================================

  const handleSwapLocations = () => {
    const { text, location } = start;

    start.set(destination.text, destination.location);
    destination.set(text, location);

    setError("");
  };

  // ================================
  // Xóa thông tin
  // ================================

  const handleReset = () => {
    start.reset();
    destination.reset();

    setActiveInput(null);
    setError("");
  };

  // ================================
  // Địa điểm yêu thích
  // ================================

  const handleAddFavorite = () => {
    if (!destination.location) {
      setError(
        "Vui lòng chọn điểm đến từ danh sách gợi ý hoặc bản đồ trước."
      );
      return;
    }

    const newFavorite: FavoriteLocation = {
      label: destination.text,
      latitude: destination.location.latitude,
      longitude: destination.location.longitude,
    };

    const exists = favorites.some(
      (item) =>
        item.latitude === newFavorite.latitude &&
        item.longitude === newFavorite.longitude
    );

    if (exists) {
      setError("Địa điểm này đã có trong danh sách yêu thích.");
      return;
    }

    const updatedFavorites = [
      ...favorites,
      newFavorite,
    ];

    setFavorites(updatedFavorites);

    localStorage.setItem(
      "bookingFavorites",
      JSON.stringify(updatedFavorites)
    );

    setError("");
  };

  // Chọn địa điểm yêu thích
  const handleSelectFavorite = (
    favorite: FavoriteLocation
  ) => {
    destination.set(favorite.label, {
      label: favorite.label,
      latitude: favorite.latitude,
      longitude: favorite.longitude,
    });

    setActiveInput(null);
    setError("");
  };

  // Xóa địa điểm yêu thích
  const handleRemoveFavorite = (
    favorite: FavoriteLocation
  ) => {
    const updatedFavorites = favorites.filter(
      (item) =>
        item.latitude !== favorite.latitude ||
        item.longitude !== favorite.longitude
    );

    setFavorites(updatedFavorites);

    localStorage.setItem(
      "bookingFavorites",
      JSON.stringify(updatedFavorites)
    );
  };

  // ================================
  // Lịch sử tìm kiếm
  // ================================

  const handleSelectHistory = (
    item: SearchHistoryItem
  ) => {
    start.set(item.startPoint, item.startLocation);

    destination.set(
      item.destination,
      item.destinationLocation
    );

    setActiveInput(null);
    setError("");
  };

  // ================================
  // Tìm kiếm Hub
  // ================================

  const handleSearch = async () => {
    if (!start.text.trim() || !destination.text.trim()) {
      setError("Vui lòng nhập đầy đủ điểm đi và điểm đến.");
      return;
    }

    if (!start.location || !destination.location) {
      setError(
        "Vui lòng chọn địa điểm từ danh sách gợi ý hoặc bản đồ."
      );
      return;
    }

    try {
      setSearching(true);
      setError("");

      const startLocation = start.location;
      const destinationLocation = destination.location;

      const routeCoordinates =
        await routeService.getRouteCoordinates(
          startLocation,
          destinationLocation
        );

      const hubs = await routeService.searchHubs(
        routeCoordinates,
        3
      );

      // Lưu lịch sử tìm kiếm
      const newHistoryItem: SearchHistoryItem = {
        id: Date.now(),
        startPoint: start.text,
        destination: destination.text,
        startLocation,
        destinationLocation,
      };

      const updatedHistory = [
        newHistoryItem,
        ...history.filter(
          (item) =>
            item.startLocation.latitude !==
              startLocation.latitude ||
            item.startLocation.longitude !==
              startLocation.longitude ||
            item.destinationLocation.latitude !==
              destinationLocation.latitude ||
            item.destinationLocation.longitude !==
              destinationLocation.longitude
        ),
      ].slice(0, 20);

      setHistory(updatedHistory);

      localStorage.setItem(
        "bookingSearchHistory",
        JSON.stringify(updatedHistory)
      );

      const searchState: BookingSearchState = {
        startPoint: start.text,
        destination: destination.text,
        startLocation,
        destinationLocation,
        routeCoordinates,
        hubs,
      };

      navigate("/student/booking/results", {
        state: searchState,
      });
    } catch (err) {
      console.error("Route search error:", err);

      setError(
        "Không thể tìm kiếm lộ trình. Vui lòng kiểm tra kết nối và thử lại."
      );
    } finally {
      setSearching(false);
    }
  };

  // ================================
  // Giao diện
  // ================================

  return (
    <div className="search-route-page">
      <header className="route-header">
        <button
          type="button"
          className="route-back-button"
          onClick={() => navigate("/student")}
        >
          <ArrowLeft size={19} />
          <span>Quay lại Dashboard</span>
        </button>

        <div className="route-header-title">
          <span className="route-header-icon">
            <MapPin size={20} />
          </span>

          <span>Smart E-Mobility Hub</span>
        </div>
      </header>

      <main className="search-route-container">
        <section className="search-route-intro">
          <span className="route-eyebrow">
            HÀNH TRÌNH CỦA BẠN
          </span>

          <h1>Tìm kiếm lộ trình</h1>

          <p>
            Nhập điểm xuất phát và điểm đến để tìm các Hub phù hợp
            trên hành trình di chuyển của bạn.
          </p>
        </section>

        <section className="search-route-form">
          <div className="route-form-heading">
            <div>
              <h2>Bạn muốn đi đâu?</h2>

              <p>
                Chọn vị trí bắt đầu và điểm đến của hành trình.
              </p>
            </div>

            <span className="route-form-badge">
              Tìm Hub gần lộ trình
            </span>
          </div>

          {/* Hai ô nhập điểm đi và điểm đến */}
          <div className="route-input-group">
            <div className="route-input-marker">
              <span className="start-marker" />
              <span className="marker-line" />
              <span className="destination-marker" />
            </div>

            <div className="route-input-fields">
              {/* Điểm xuất phát */}
              <LocationInput
                id="start-location"
                label="Điểm xuất phát"
                placeholder="Nhập vị trí bắt đầu..."
                clearLabel="Xóa điểm xuất phát"
                field={start}
                active={activeInput === "start"}
                onFocus={() => setActiveInput("start")}
                onChange={(value) =>
                  handleChange(start, value)
                }
                onSelect={(location) =>
                  handleSelect(start, location)
                }
              >
                <div className="route-location-actions">
                  <button
                    type="button"
                    className="route-gps-button"
                    onClick={handleGetCurrentLocation}
                    disabled={loadingGPS}
                  >
                    <LocateFixed size={16} />

                    {loadingGPS
                      ? "Đang xác định vị trí..."
                      : "Sử dụng vị trí hiện tại"}
                  </button>

                  <button
                    type="button"
                    className="route-map-button"
                    onClick={() => handleOpenMap("start")}
                  >
                    <MapPin size={16} />
                    Chọn trên bản đồ
                  </button>
                </div>
              </LocationInput>

              {/* Nút đổi điểm */}
              <div className="route-input-divider">
                <button
                  type="button"
                  className="route-swap-button"
                  onClick={handleSwapLocations}
                  title="Đổi điểm đi và điểm đến"
                >
                  ↕
                </button>
              </div>

              {/* Điểm đến */}
              <LocationInput
                id="destination-location"
                label="Điểm đến"
                placeholder="Nhập điểm đến..."
                clearLabel="Xóa điểm đến"
                field={destination}
                active={activeInput === "destination"}
                onFocus={() =>
                  setActiveInput("destination")
                }
                onChange={(value) =>
                  handleChange(destination, value)
                }
                onSelect={(location) =>
                  handleSelect(destination, location)
                }
              >
                <button
                  type="button"
                  className="route-map-button"
                  onClick={() =>
                    handleOpenMap("destination")
                  }
                >
                  <MapPin size={16} />
                  Chọn trên bản đồ
                </button>
              </LocationInput>
            </div>
          </div>

          {/* Địa điểm yêu thích */}
          <section className="route-extra-section">
            <div className="route-extra-heading">
              <div>
                <h3>Địa điểm yêu thích</h3>

                <p>
                  Lưu những địa điểm bạn thường xuyên di chuyển đến.
                </p>
              </div>

              <button
                type="button"
                className="route-add-favorite"
                onClick={handleAddFavorite}
                disabled={!destination.location}
                title="Lưu điểm đến hiện tại"
              >
                <span>+</span>
                Thêm yêu thích
              </button>
            </div>

            <div className="route-favorite-list">
              {favorites.length > 0 ? (
                favorites.map((favorite, index) => (
                  <div
                    className="route-favorite-item"
                    key={`${favorite.latitude}-${favorite.longitude}-${index}`}
                  >
                    <button
                      type="button"
                      className="route-favorite-chip"
                      onClick={() =>
                        handleSelectFavorite(favorite)
                      }
                    >
                      <MapPin size={15} />
                      {favorite.label}
                    </button>

                    <button
                      type="button"
                      className="route-remove-favorite"
                      onClick={() =>
                        handleRemoveFavorite(favorite)
                      }
                      title="Xóa địa điểm yêu thích"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="route-extra-empty">
                  Chưa có địa điểm yêu thích. Hãy chọn điểm đến
                  rồi nhấn Thêm yêu thích.
                </p>
              )}
            </div>
          </section>

          {/* Lịch sử tìm kiếm */}
          <section className="route-extra-section">
            <div className="route-extra-heading">
              <div>
                <h3>Lịch sử tìm kiếm</h3>

                <p>
                  Chọn lại hành trình bạn đã tìm kiếm trước đó.
                </p>
              </div>

              {history.length > 4 && (
                <button
                  type="button"
                  className="route-history-toggle"
                  onClick={() =>
                    setShowAllHistory(!showAllHistory)
                  }
                >
                  {showAllHistory
                    ? "Thu gọn"
                    : "Xem tất cả"}
                </button>
              )}
            </div>

            <div className="route-history-list">
              {history.length > 0 ? (
                (showAllHistory
                  ? history
                  : history.slice(0, 4)
                ).map((item) => (
                  <button
                    type="button"
                    className="route-history-item"
                    key={item.id}
                    onClick={() =>
                      handleSelectHistory(item)
                    }
                  >
                    <span className="route-history-icon">
                      <MapPin size={17} />
                    </span>

                    <span className="route-history-info">
                      <strong>{item.destination}</strong>

                      <small>
                        Xuất phát: {item.startPoint}
                      </small>
                    </span>

                    <span className="route-history-arrow">
                      ›
                    </span>
                  </button>
                ))
              ) : (
                <p className="route-extra-empty">
                  Chưa có lịch sử tìm kiếm.
                </p>
              )}
            </div>
          </section>

          {/* Thông báo lỗi */}
          {error && (
            <div className="route-error-message">
              <span>⚠</span>
              {error}
            </div>
          )}

          {/* Nút thao tác */}
          <div className="route-actions">
            <button
              type="button"
              className="route-reset-button"
              onClick={handleReset}
              disabled={searching}
            >
              Xóa thông tin
            </button>

            <button
              type="button"
              className="route-search-button"
              onClick={handleSearch}
              disabled={searching}
            >
              <Search size={18} />

              {searching
                ? "Đang tìm kiếm..."
                : "Tìm kiếm Hub"}
            </button>
          </div>
        </section>

        {/* Mẹo tìm kiếm */}
        <section className="route-help-card">
          <div className="route-help-icon">💡</div>

          <div>
            <h3>Mẹo tìm kiếm</h3>

            <p>
              Bạn có thể sử dụng vị trí hiện tại làm điểm xuất phát,
              nhập tên địa điểm hoặc chọn trực tiếp trên bản đồ.
            </p>
          </div>
        </section>

        {/* ================================
            Modal chọn vị trí trên bản đồ
        ================================= */}
        {showMap && (
          <div
            className="route-map-overlay"
            onClick={handleCloseMap}
          >
            <section
              className="route-map-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="route-map-heading">
                <div>
                  <h2>Chọn vị trí trên bản đồ</h2>

                  <p>
                    {mapTarget === "start"
                      ? "Chọn vị trí xuất phát của bạn."
                      : "Chọn vị trí điểm đến của bạn."}
                  </p>
                </div>

                <button
                  type="button"
                  className="route-map-close"
                  onClick={handleCloseMap}
                  aria-label="Đóng bản đồ"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="route-map-instruction">
                <MapPin size={16} />

                Nhấn trực tiếp lên bản đồ để đặt ghim tại vị trí mong muốn.
              </div>

              <MapPicker
                position={
                  mapPoint
                    ? [
                        mapPoint.latitude,
                        mapPoint.longitude,
                      ]
                    : null
                }
                onPick={handleMapPick}
              />

              <div className="route-map-selected">
                <strong>Vị trí đã chọn</strong>

                {mapPoint ? (
                  <>
                    <p>{mapPoint.label}</p>

                    <small>
                      Tọa độ:{" "}
                      {mapPoint.latitude.toFixed(6)},{" "}
                      {mapPoint.longitude.toFixed(6)}
                    </small>
                  </>
                ) : (
                  <p>
                    Chưa chọn vị trí. Hãy nhấn lên bản đồ.
                  </p>
                )}

                {mapLoading && (
                  <small>
                    Đang xác định địa chỉ...
                  </small>
                )}

                {mapError && (
                  <small className="route-map-error">
                    {mapError}
                  </small>
                )}
              </div>

              <div className="route-map-actions">
                <button
                  type="button"
                  className="route-map-cancel"
                  onClick={handleCloseMap}
                >
                  Hủy
                </button>

                <button
                  type="button"
                  className="route-map-confirm"
                  disabled={!mapPoint || mapLoading}
                  onClick={handleConfirmMapLocation}
                >
                  Xác nhận vị trí
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default StudentSearchRoute;
