import { usePreferences } from "../../../../preferences/PreferencesContext";
import { statusText } from "../statusLabels";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Plus,
  Search,
  ParkingSquare,
  PlugZap,
  RotateCcw,
  X,
  Save,
  RefreshCw,
  AlertCircle,
  ParkingCircle,
  Activity,
} from "lucide-react";
import api from "../../../../services/api";
import "./ParkingChargingManagement.css";

interface Hub {
  id: string;
  name: string;
}

interface ParkingSlot {
  id: string;
  hubId: string;
  code: string;
  status: string;
}

interface ChargingPoint {
  id: string;
  hubId: string;
  slotId: string;
  code: string;
  status: string;
  powerKw?: number;
}

const unwrap = (response: any) =>
  response?.data?.data ?? response?.data ?? response;

const getItems = (data: any) =>
  Array.isArray(data) ? data : data?.items ?? [];

const ParkingManagement = () => {
  const { t } = usePreferences();

  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [chargers, setChargers] = useState<ChargingPoint[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [hubFilter, setHubFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState<"slots" | "chargers">("slots");
  const [showModal, setShowModal] = useState(false);
  const [formType, setFormType] = useState<"slot" | "charger">("slot");

  const [form, setForm] = useState({
    hubId: "",
    code: "",
    slotId: "",
    powerKw: 0,
  });

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const [slotResponse, chargerResponse, hubResponse] = await Promise.all([
        api.get("/parking-slots", {
          params: { page: 1, limit: 100 },
        }),
        api.get("/charging-points", {
          params: { page: 1, limit: 100 },
        }),
        api.get("/hubs", {
          params: { page: 1, limit: 100 },
        }),
      ]);

      setSlots(getItems(unwrap(slotResponse)));
      setChargers(getItems(unwrap(chargerResponse)));
      setHubs(getItems(unwrap(hubResponse)));
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          t("Không thể tải dữ liệu chỗ đỗ và cổng sạc.")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const currentItems = activeTab === "slots" ? slots : chargers;

  const filteredSlots = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return slots.filter(
      (item) =>
        (!q ||
          item.code.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q)) &&
        (hubFilter === "ALL" || item.hubId === hubFilter) &&
        (statusFilter === "ALL" || item.status === statusFilter)
    );
  }, [slots, keyword, hubFilter, statusFilter]);

  const filteredChargers = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return chargers.filter(
      (item) =>
        (!q ||
          item.code.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q)) &&
        (hubFilter === "ALL" || item.hubId === hubFilter) &&
        (statusFilter === "ALL" || item.status === statusFilter)
    );
  }, [chargers, keyword, hubFilter, statusFilter]);

  const openAdd = (type: "slot" | "charger") => {
    setFormType(type);
    setForm({
      hubId: hubs[0]?.id ?? "",
      code: "",
      slotId: "",
      powerKw: 0,
    });
    setShowModal(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");

      if (formType === "slot") {
        await api.post("/parking-slots", {
          hubId: form.hubId,
          code: form.code.trim(),
        });
      } else {
        await api.post("/charging-points", {
          hubId: form.hubId,
          code: form.code.trim(),
          slotId: form.slotId,
          powerKw: Number(form.powerKw),
        });
      }

      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          t("Không thể thêm dữ liệu.")
      );
    } finally {
      setSaving(false);
    }
  };

  const updateChargerStatus = async (
    charger: ChargingPoint,
    status: string
  ) => {
    try {
      setError("");

      await api.patch(`/charging-points/${charger.id}/status`, {
        status,
      });

      await loadData();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          t("Không thể cập nhật trạng thái cổng sạc.")
      );
    }
  };

  const resetFilters = () => {
    setKeyword("");
    setHubFilter("ALL");
    setStatusFilter("ALL");
  };

  // Summary statistics
  const totalSlots = slots.length;

  const freeSlots = slots.filter(
    (slot) => slot.status === "FREE"
  ).length;

  const totalChargers = chargers.length;

  const availableChargers = chargers.filter(
    (charger) => charger.status === "AVAILABLE"
  ).length;

  const getPercentage = (count: number, total: number) =>
    total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="parking-management">
      <div className="hub-management-toolbar">
        <div className="hub-management-description">
          <div className="hub-management-icon">
            <ParkingSquare size={23} />
          </div>

          <div>
            <h2>{t("Quản lý chỗ đỗ & cổng sạc")}</h2>
            <p>{t("Theo dõi vị trí đỗ xe và tình trạng các cổng sạc tại từng Hub.")}</p>
          </div>
        </div>

        <button
          className="hub-add-button"
          onClick={() =>
            openAdd(activeTab === "slots" ? "slot" : "charger")
          }
        >
          <Plus size={18} />
          {activeTab === "slots" ? t("Thêm chỗ đỗ") : t("Thêm cổng sạc")}
        </button>
      </div>

      {error && (
        <div className="operator-error">
          <AlertCircle size={18} />
          {t(error)}
        </div>
      )}

      {/* Summary cards */}
      <div className="hub-summary-grid">
        {/* Tổng chỗ đỗ */}
        <div
          className="hub-summary-card parking-summary-total"
          aria-label={`${t("Tổng số chỗ đỗ: ")}${totalSlots}`}
        >
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <ParkingSquare size={22} />
            </div>
            <span className="hub-summary-label">{t("TỔNG SỐ CHỖ ĐỖ")}</span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{totalSlots}</strong>
            <span className="hub-summary-unit">{t("Chỗ")}</span>
          </div>

          <div className="hub-summary-footer">
            <span>{t("Quy mô bãi đỗ xe")}</span>
            <span className="hub-summary-badge">{t("Tất cả")}</span>
          </div>
        </div>

        {/* Chỗ đỗ còn trống */}
        <div
          className="hub-summary-card parking-summary-free"
          aria-label={`${t("Chỗ đỗ còn trống: ")}${freeSlots}`}
        >
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <ParkingCircle size={22} />
            </div>
            <span className="hub-summary-label">{t("CHỖ ĐỖ CÒN TRỐNG")}</span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{freeSlots}</strong>
            <span className="hub-summary-unit">{t("Chỗ")}</span>
          </div>

          <div className="hub-summary-progress">
            <div
              className="hub-summary-progress-fill"
              style={{
                width: `${getPercentage(freeSlots, totalSlots)}%`,
              }}
            />
          </div>

          <div className="hub-summary-footer">
            <span>{t("Tỷ lệ còn trống")}</span>
            <strong>{getPercentage(freeSlots, totalSlots)}%</strong>
          </div>
        </div>

        {/* Tổng cổng sạc */}
        <div
          className="hub-summary-card parking-summary-chargers"
          aria-label={`${t("Tổng số cổng sạc: ")}${totalChargers}`}
        >
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <PlugZap size={22} />
            </div>
            <span className="hub-summary-label">{t("TỔNG SỐ CỔNG SẠC")}</span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{totalChargers}</strong>
            <span className="hub-summary-unit">{t("Cổng")}</span>
          </div>

          <div className="hub-summary-footer">
            <span>{t("Quy mô hệ thống sạc")}</span>
            <span className="hub-summary-badge">{t("Tất cả")}</span>
          </div>
        </div>

        {/* Cổng sạc khả dụng */}
        <div
          className="hub-summary-card parking-summary-available"
          aria-label={`${t("Cổng sạc khả dụng: ")}${availableChargers}`}
        >
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <Activity size={22} />
            </div>
            <span className="hub-summary-label">{t("CỔNG SẠC KHẢ DỤNG")}</span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{availableChargers}</strong>
            <span className="hub-summary-unit">{t("Cổng")}</span>
          </div>

          <div className="hub-summary-progress">
            <div
              className="hub-summary-progress-fill"
              style={{
                width: `${getPercentage(
                  availableChargers,
                  totalChargers
                )}%`,
              }}
            />
          </div>

          <div className="hub-summary-footer">
            <span>{t("Tỷ lệ khả dụng")}</span>
            <strong>
              {getPercentage(availableChargers, totalChargers)}%
            </strong>
          </div>
        </div>
      </div>

      <section className="hub-management-panel">
        {/* Tabs chỗ đỗ và cổng sạc */}
        <div className="parking-tabs">
          <button
            type="button"
            className={`parking-tab ${
              activeTab === "slots" ? "active" : ""
            }`}
            onClick={() => {
              setActiveTab("slots");
              resetFilters();
            }}
          >
            <ParkingSquare size={17} />{t("Chỗ đỗ xe")}<span>{slots.length}</span>
          </button>

          <button
            type="button"
            className={`parking-tab ${
              activeTab === "chargers" ? "active" : ""
            }`}
            onClick={() => {
              setActiveTab("chargers");
              resetFilters();
            }}
          >
            <PlugZap size={17} />{t("Cổng sạc")}<span>{chargers.length}</span>
          </button>
        </div>

        {/* Search và filters */}
        <div className="hub-filter-toolbar">
          <div className="hub-search-box">
            <Search size={18} />
            <input
              placeholder={t("Tìm theo mã...")}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          <select
            value={hubFilter}
            onChange={(e) => setHubFilter(e.target.value)}
          >
            <option value="ALL">{t("Tất cả Hub")}</option>
            {hubs.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">{t("Tất cả trạng thái")}</option>
            {[...new Set(currentItems.map((item) => item.status))].map(
              (status) => (
                <option key={status} value={status}>
                  {statusText(status, t)}
                </option>
              )
            )}
          </select>

          <button className="hub-reset-button" onClick={resetFilters}>
            <RotateCcw size={17} />
          </button>

          <button className="hub-reset-button" onClick={loadData}>
            <RefreshCw size={17} />
          </button>
        </div>

        <div className="hub-table-heading">
          <div>
            <h3>
              {activeTab === "slots"
                ? t("Danh sách chỗ đỗ")
                : t("Danh sách cổng sạc")}
            </h3>
            <p>{t("Hiển thị")}{" "}
              {activeTab === "slots"
                ? filteredSlots.length
                : filteredChargers.length}
              {" / "}
              {activeTab === "slots" ? slots.length : chargers.length}{t(" mục")}</p>
          </div>
        </div>

        <div className="hub-table-wrapper">
          <table className="hub-table">
            {activeTab === "slots" ? (
              <>
                <thead>
                  <tr>
                    <th>{t("Mã chỗ đỗ")}</th>
                    <th>Mobility Hub</th>
                    <th>{t("Trạng thái")}</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="hub-empty-state">{t("Đang tải dữ liệu...")}</td>
                    </tr>
                  ) : filteredSlots.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="hub-empty-state">{t("Không tìm thấy chỗ đỗ phù hợp.")}</td>
                    </tr>
                  ) : (
                    filteredSlots.map((slot) => (
                      <tr key={slot.id}>
                        <td>
                          <strong className="hub-code">{slot.code}</strong>
                        </td>
                        <td>
                          {hubs.find((h) => h.id === slot.hubId)?.name ??
                            slot.hubId}
                        </td>
                        <td>
                          <span
                            className={`hub-status ${
                              slot.status === "FREE"
                                ? "hub-status-active"
                                : "hub-status-inactive"
                            }`}
                          >
                            <i />
                            {statusText(slot.status, t)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    <th>{t("Mã cổng sạc")}</th>
                    <th>Mobility Hub</th>
                    <th>{t("Mã chỗ đỗ")}</th>
                    <th>{t("Công suất")}</th>
                    <th>{t("Trạng thái")}</th>
                    <th>{t("Cập nhật")}</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="hub-empty-state">{t("Đang tải dữ liệu...")}</td>
                    </tr>
                  ) : filteredChargers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="hub-empty-state">{t("Không tìm thấy cổng sạc phù hợp.")}</td>
                    </tr>
                  ) : (
                    filteredChargers.map((charger) => (
                      <tr key={charger.id}>
                        <td>
                          <strong className="hub-code">
                            {charger.code}
                          </strong>
                        </td>
                        <td>
                          {hubs.find((h) => h.id === charger.hubId)?.name ??
                            charger.hubId}
                        </td>
                        <td>{charger.slotId}</td>
                        <td>
                          {charger.powerKw == null
                            ? "—"
                            : `${charger.powerKw} kW`}
                        </td>
                        <td>
                          <span
                            className={`hub-status ${
                              charger.status === "AVAILABLE"
                                ? "hub-status-active"
                                : "hub-status-inactive"
                            }`}
                          >
                            <i />
                            {statusText(charger.status, t)}
                          </span>
                        </td>
                        <td>
                          <select
                            value={charger.status}
                            onChange={(e) =>
                              updateChargerStatus(charger, e.target.value)
                            }
                          >
                            <option value={charger.status}>
                              {statusText(charger.status, t)}
                            </option>
                            <option value="AVAILABLE">{statusText("AVAILABLE", t)}</option>
                            <option value="FAULT">{statusText("FAULT", t)}</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </>
            )}
          </table>
        </div>
      </section>

      {/* Modal thêm chỗ đỗ / cổng sạc */}
      {showModal && (
        <div
          className="hub-modal-overlay"
          onClick={(e) =>
            e.target === e.currentTarget && setShowModal(false)
          }
        >
          <div className="hub-modal">
            <div className="hub-modal-header">
              <div>
                <h2>
                  {formType === "slot"
                    ? t("Thêm chỗ đỗ")
                    : t("Thêm cổng sạc")}
                </h2>
                <p>{t("Nhập thông tin theo Hub tương ứng.")}</p>
              </div>

              <button
                className="hub-modal-close"
                type="button"
                onClick={() => setShowModal(false)}
              >
                <X size={21} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="hub-form-grid">
                <label className="hub-form-full">
                  Mobility Hub
                  <select
                    value={form.hubId}
                    required
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        hubId: e.target.value,
                      }))
                    }
                  >
                    <option value="">{t("Chọn Hub")}</option>
                    {hubs.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="hub-form-full">{t("Mã ")}{formType === "slot" ? t("chỗ đỗ") : t("cổng sạc")}
                  <input
                    value={form.code}
                    required
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        code: e.target.value,
                      }))
                    }
                    placeholder={t("Nhập mã")}
                  />
                </label>

                {formType === "charger" && (
                  <>
                    <label className="hub-form-full">{t("Chỗ đỗ gắn cổng sạc")}<select
                        value={form.slotId}
                        required
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            slotId: e.target.value,
                          }))
                        }
                      >
                        <option value="">{t("Chọn chỗ đỗ")}</option>
                        {slots
                          .filter((s) => s.hubId === form.hubId)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.code}
                            </option>
                          ))}
                      </select>
                    </label>

                    <label className="hub-form-full">{t("Công suất (kW)")}<input
                        type="number"
                        min="0.1"
                        step="0.1"
                        required
                        value={form.powerKw}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            powerKw: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  </>
                )}
              </div>

              <div className="hub-modal-actions">
                <button
                  type="button"
                  className="hub-cancel-button"
                  onClick={() => setShowModal(false)}
                >{t("Hủy")}</button>

                <button
                  type="submit"
                  className="hub-save-button"
                  disabled={saving}
                >
                  <Save size={17} />
                  {saving ? t("Đang lưu...") : t("Lưu")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParkingManagement;
