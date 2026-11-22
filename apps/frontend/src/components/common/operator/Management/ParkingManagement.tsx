import { usePreferences } from "../../../../preferences/PreferencesContext";
import type { Language } from "../../../../preferences/translations";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Clock,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  CalendarDays,
  MapPin,
} from "lucide-react";
import api from "../../../../services/api";
import "./ParkingManagement.css";

interface Reservation {
  id: string;
  userId: string;
  hubId: string;
  vehicleId?: string;
  slotId?: string;
  startsAt: string;
  endsAt: string;
  holdExpiresAt?: string;
  confirmationCode?: string;
  pickupBy?: string;
  pickedUpAt?: string;
  returnedAt?: string;
  returnCondition?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Hub {
  id: string;
  name: string;
  code: string;
}

const unwrap = (response: any) =>
  response?.data?.data ?? response?.data ?? response;

const getItems = (data: any) =>
  Array.isArray(data) ? data : data?.items ?? [];

const statusLabels: Record<string, string> = {
  HELD: "Đang giữ chỗ",
  CONFIRMED: "Đã xác nhận",
  IN_USE: "Đang sử dụng",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
  EXPIRED: "Hết hạn",
};

const formatDate = (value: string | undefined, language: Language) => {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(language === "en" ? "en-US" : "vi-VN");
};

const ReservationManagement = () => {
  const { t, preferences: { language } } = usePreferences();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [hubFilter, setHubFilter] = useState("ALL");
  const [selected, setSelected] = useState<Reservation | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const [reservationResponse, hubResponse] = await Promise.all([
        api.get("/reservations", {
          params: { page: 1, limit: 100 },
        }),
        api.get("/hubs", {
          params: { page: 1, limit: 100 },
        }),
      ]);

      setReservations(getItems(unwrap(reservationResponse)));
      setHubs(getItems(unwrap(hubResponse)));
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          t("Không thể tải danh sách đặt chỗ.")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredReservations = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return reservations
      .filter((item) => {
        const matchesKeyword =
          !q ||
          item.id.toLowerCase().includes(q) ||
          (item.confirmationCode ?? "").toLowerCase().includes(q) ||
          item.userId.toLowerCase().includes(q);

        return (
          matchesKeyword &&
          (statusFilter === "ALL" || item.status === statusFilter) &&
          (hubFilter === "ALL" || item.hubId === hubFilter)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime()
      );
  }, [reservations, keyword, statusFilter, hubFilter]);

  const countStatus = (status: string) =>
    reservations.filter((item) => item.status === status).length;

  const resetFilters = () => {
    setKeyword("");
    setStatusFilter("ALL");
    setHubFilter("ALL");
  };

  // Summary calculations
  const totalReservations = reservations.length;
  const heldCount = countStatus("HELD");
  const confirmedCount = countStatus("CONFIRMED");
  const inUseCount = countStatus("IN_USE");
  const completedCount = countStatus("COMPLETED");

  const getPercentage = (count: number) =>
    totalReservations > 0
      ? Math.round((count / totalReservations) * 100)
      : 0;

  return (
    <div className="reservation-management">
      <div className="hub-management-toolbar">
        <div className="hub-management-description">
          <div className="hub-management-icon">
            <Clock size={23} />
          </div>

          <div>
            <h2>{t("Danh sách đặt chỗ")}</h2>
            <p>{t("Theo dõi các lượt đặt xe và đặt chỗ trong hệ thống.")}</p>
          </div>
        </div>

        <button
          className="hub-reset-button"
          onClick={loadData}
          title={t("Làm mới dữ liệu")}
          disabled={loading}
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {error && (
        <div className="operator-error">
          <AlertCircle size={18} />
          {t(error)}
        </div>
      )}

      {/* Reservation summary cards */}
      <div className="hub-summary-grid reservation-summary-grid">
        {/* Total reservations */}
        <div className="hub-summary-card reservation-summary-total">
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <CalendarDays size={21} />
            </div>

            <span className="hub-summary-label">{t("TỔNG LƯỢT ĐẶT")}</span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{totalReservations}</strong>
            <span className="hub-summary-unit">{t("lượt đặt")}</span>
          </div>

          <div className="hub-summary-footer">
            <span>{t("Quy mô đặt chỗ")}</span>
            <span className="hub-summary-badge">{t("Tất cả")}</span>
          </div>
        </div>

        {/* Held reservations */}
        <div className="hub-summary-card reservation-summary-held">
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <Clock size={21} />
            </div>

            <span className="hub-summary-label">{t("ĐANG GIỮ CHỖ")}</span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{heldCount}</strong>
            <span className="hub-summary-unit">{t("lượt")}</span>
          </div>

          <div className="hub-summary-progress">
            <div
              className="hub-summary-progress-fill"
              style={{
                width: `${getPercentage(heldCount)}%`,
              }}
            />
          </div>

          <div className="hub-summary-footer">
            <span>{t("Tỷ lệ lượt giữ chỗ")}</span>
            <strong>{getPercentage(heldCount)}%</strong>
          </div>
        </div>

        {/* Confirmed reservations */}
        <div className="hub-summary-card reservation-summary-confirmed">
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <CalendarDays size={21} />
            </div>

            <span className="hub-summary-label">{t("ĐÃ XÁC NHẬN")}</span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{confirmedCount}</strong>
            <span className="hub-summary-unit">{t("lượt")}</span>
          </div>

          <div className="hub-summary-progress">
            <div
              className="hub-summary-progress-fill"
              style={{
                width: `${getPercentage(confirmedCount)}%`,
              }}
            />
          </div>

          <div className="hub-summary-footer">
            <span>{t("Tỷ lệ đã xác nhận")}</span>
            <strong>{getPercentage(confirmedCount)}%</strong>
          </div>
        </div>

        {/* In-use reservations */}
        <div className="hub-summary-card reservation-summary-in-use">
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <MapPin size={21} />
            </div>

            <span className="hub-summary-label">{t("ĐANG SỬ DỤNG")}</span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{inUseCount}</strong>
            <span className="hub-summary-unit">{t("lượt")}</span>
          </div>

          <div className="hub-summary-progress">
            <div
              className="hub-summary-progress-fill"
              style={{
                width: `${getPercentage(inUseCount)}%`,
              }}
            />
          </div>

          <div className="hub-summary-footer">
            <span>{t("Tỷ lệ đang sử dụng")}</span>
            <strong>{getPercentage(inUseCount)}%</strong>
          </div>
        </div>

        {/* Completed reservations */}
        <div className="hub-summary-card reservation-summary-completed">
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <RotateCcw size={21} />
            </div>

            <span className="hub-summary-label">{t("HOÀN THÀNH")}</span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{completedCount}</strong>
            <span className="hub-summary-unit">{t("lượt")}</span>
          </div>

          <div className="hub-summary-progress">
            <div
              className="hub-summary-progress-fill"
              style={{
                width: `${getPercentage(completedCount)}%`,
              }}
            />
          </div>

          <div className="hub-summary-footer">
            <span>{t("Tỷ lệ hoàn thành")}</span>
            <strong>{getPercentage(completedCount)}%</strong>
          </div>
        </div>
      </div>

      <section className="hub-management-panel">
        <div className="hub-filter-toolbar">
          <div className="hub-search-box">
            <Search size={18} />

            <input
              placeholder={t("Tìm mã đặt chỗ, mã xác nhận hoặc người dùng...")}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">{t("Tất cả trạng thái")}</option>

            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>

          <select
            value={hubFilter}
            onChange={(e) => setHubFilter(e.target.value)}
          >
            <option value="ALL">{t("Tất cả Hub")}</option>

            {hubs.map((hub) => (
              <option key={hub.id} value={hub.id}>
                {hub.name}
              </option>
            ))}
          </select>

          <button
            className="hub-reset-button"
            onClick={resetFilters}
            title={t("Đặt lại bộ lọc")}
          >
            <RotateCcw size={17} />
          </button>
        </div>

        <div className="hub-table-heading">
          <div>
            <h3>{t("Quản lý đặt chỗ")}</h3>
            <p>{t("Hiển thị ")}{filteredReservations.length} /{" "}
              {reservations.length}{t(" lượt đặt")}</p>
          </div>
        </div>

        <div className="hub-table-wrapper">
          <table className="hub-table">
            <thead>
              <tr>
                <th>{t("Mã xác nhận")}</th>
                <th>{t("Người dùng")}</th>
                <th>Mobility Hub</th>
                <th>{t("Loại đặt chỗ")}</th>
                <th>{t("Thời gian tạo")}</th>
                <th>{t("Trạng thái")}</th>
                <th>{t("Chi tiết")}</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="hub-empty-state">{t("Đang tải dữ liệu...")}</td>
                </tr>
              ) : filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="hub-empty-state">{t("Không tìm thấy lượt đặt chỗ phù hợp.")}</td>
                </tr>
              ) : (
                filteredReservations.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong className="hub-code">
                        {item.confirmationCode || item.id.slice(0, 8)}
                      </strong>
                    </td>

                    <td>{item.userId}</td>

                    <td>
                      {hubs.find((h) => h.id === item.hubId)?.name ??
                        item.hubId}
                    </td>

                    <td>
                      {item.vehicleId
                        ? t("Phương tiện")
                        : item.slotId
                          ? t("Chỗ đỗ")
                          : "—"}
                    </td>

                    <td>{formatDate(item.createdAt, language)}</td>

                    <td>
                      <span
                        className={`hub-status ${
                          item.status === "COMPLETED"
                            ? "hub-status-active"
                            : item.status === "CANCELLED" ||
                                item.status === "EXPIRED"
                              ? "hub-status-inactive"
                              : "hub-status-maintenance"
                        }`}
                      >
                        <i />
                        {t(statusLabels[item.status] ?? item.status)}
                      </span>
                    </td>

                    <td>
                      <button
                        className="hub-edit-button"
                        title={t("Xem chi tiết")}
                        onClick={() => setSelected(item)}
                      >
                        <CalendarDays size={17} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reservation detail modal */}
      {selected && (
        <div
          className="hub-modal-overlay"
          onClick={(e) =>
            e.target === e.currentTarget && setSelected(null)
          }
        >
          <div className="hub-modal">
            <div className="hub-modal-header">
              <div>
                <h2>{t("Chi tiết đặt chỗ")}</h2>
                <p>{selected.confirmationCode || selected.id}</p>
              </div>

              <button
                className="hub-modal-close"
                onClick={() => setSelected(null)}
              >
                <span>{t("×")}</span>
              </button>
            </div>

            <div className="hub-form-grid">
              <label>{t("Mã đặt chỗ")}<input readOnly value={selected.id} />
              </label>

              <label>{t("Mã xác nhận")}<input
                  readOnly
                  value={selected.confirmationCode || "—"}
                />
              </label>

              <label>{t("Người dùng")}<input readOnly value={selected.userId} />
              </label>

              <label>
                Mobility Hub
                <input
                  readOnly
                  value={
                    hubs.find((h) => h.id === selected.hubId)?.name ??
                    selected.hubId
                  }
                />
              </label>

              <label>{t("Phương tiện")}<input readOnly value={selected.vehicleId || "—"} />
              </label>

              <label>{t("Chỗ đỗ")}<input readOnly value={selected.slotId || "—"} />
              </label>

              <label>{t("Thời gian bắt đầu")}<input readOnly value={formatDate(selected.startsAt, language)} />
              </label>

              <label>{t("Thời gian kết thúc")}<input readOnly value={formatDate(selected.endsAt, language)} />
              </label>

              <label>{t("Hạn nhận xe")}<input readOnly value={formatDate(selected.pickupBy, language)} />
              </label>

              <label>{t("Thời điểm nhận xe")}<input readOnly value={formatDate(selected.pickedUpAt, language)} />
              </label>

              <label>{t("Thời điểm trả xe")}<input readOnly value={formatDate(selected.returnedAt, language)} />
              </label>

              <label>{t("Trạng thái")}<input
                  readOnly
                  value={
                    t(statusLabels[selected.status] ?? selected.status)
                  }
                />
              </label>

              <label className="hub-form-full">{t("Tình trạng khi trả")}<input
                  readOnly
                  value={selected.returnCondition || "—"}
                />
              </label>
            </div>

            <div className="hub-modal-actions">
              <button
                className="hub-cancel-button"
                onClick={() => setSelected(null)}
              >{t("Đóng")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReservationManagement;
