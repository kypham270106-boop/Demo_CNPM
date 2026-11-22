
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Plus,
  Search,
  CarFront,
  Bike,
  Zap,
  Edit,
  RotateCcw,
  X,
  Save,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import api from "../../../../services/api";
import "./VehicleManagement.css";

interface Vehicle {
  id: string;
  code: string;
  type: "E_BIKE" | "E_SCOOTER";
  status: string;
  battery?: number;
  hubId: string;
  slotId?: string;
}

interface Hub {
  id: string;
  name: string;
  code: string;
}

interface VehicleForm {
  code: string;
  type: "E_BIKE" | "E_SCOOTER";
  hubId: string;
  slotId: string;
  battery: number;
}

const unwrap = (response: any) =>
  response?.data?.data ?? response?.data ?? response;

const VehicleManagement = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [hubFilter, setHubFilter] = useState("ALL");
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

  const [form, setForm] = useState<VehicleForm>({
    code: "",
    type: "E_BIKE",
    hubId: "",
    slotId: "",
    battery: 100,
  });

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const [vehicleResponse, hubResponse] = await Promise.all([
        api.get("/vehicles", { params: { page: 1, limit: 100 } }),
        api.get("/hubs", { params: { page: 1, limit: 100 } }),
      ]);

      const vehicleData = unwrap(vehicleResponse);
      const hubData = unwrap(hubResponse);

      setVehicles(
        Array.isArray(vehicleData) ? vehicleData : vehicleData?.items ?? []
      );

      setHubs(
        Array.isArray(hubData) ? hubData : hubData?.items ?? []
      );
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Không thể tải dữ liệu phương tiện."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredVehicles = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return vehicles.filter((vehicle) => {
      const matchesKeyword =
        !q ||
        vehicle.code.toLowerCase().includes(q) ||
        vehicle.id.toLowerCase().includes(q);

      return (
        matchesKeyword &&
        (typeFilter === "ALL" || vehicle.type === typeFilter) &&
        (statusFilter === "ALL" || vehicle.status === statusFilter) &&
        (hubFilter === "ALL" || vehicle.hubId === hubFilter)
      );
    });
  }, [vehicles, keyword, typeFilter, statusFilter, hubFilter]);

  const openAdd = () => {
    setEditingVehicle(null);

    setForm({
      code: "",
      type: "E_BIKE",
      hubId: hubs[0]?.id ?? "",
      slotId: "",
      battery: 100,
    });

    setShowModal(true);
  };

  const openEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);

    setForm({
      code: vehicle.code,
      type: vehicle.type,
      hubId: vehicle.hubId,
      slotId: vehicle.slotId ?? "",
      battery: vehicle.battery ?? 100,
    });

    setShowModal(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");

      if (editingVehicle) {
        await api.patch(`/vehicles/${editingVehicle.id}`, {
          battery: Number(form.battery),
          status: editingVehicle.status,
        });
      } else {
        await api.post("/vehicles", {
          code: form.code.trim(),
          type: form.type,
          hubId: form.hubId,
          ...(form.slotId.trim()
            ? { slotId: form.slotId.trim() }
            : {}),
          battery: Number(form.battery),
        });
      }

      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Không thể lưu phương tiện."
      );
    } finally {
      setSaving(false);
    }
  };

  const resetFilters = () => {
    setKeyword("");
    setTypeFilter("ALL");
    setStatusFilter("ALL");
    setHubFilter("ALL");
  };

  const countByType = (type: Vehicle["type"]) =>
    vehicles.filter((item) => item.type === type).length;

  // Summary statistics
  const totalVehicles = vehicles.length;
  const totalBikes = countByType("E_BIKE");
  const totalScooters = countByType("E_SCOOTER");

  const availableVehicles = vehicles.filter(
    (vehicle) => vehicle.status === "AVAILABLE"
  ).length;

  const getPercentage = (count: number) =>
    totalVehicles > 0
      ? Math.round((count / totalVehicles) * 100)
      : 0;

  return (
    <div className="vehicle-management">
      <div className="hub-management-toolbar">
        <div className="hub-management-description">
          <div className="hub-management-icon">
            <CarFront size={23} />
          </div>

          <div>
            <h2>Danh sách phương tiện</h2>
            <p>
              Quản lý xe đạp điện và xe máy điện trong hệ thống.
            </p>
          </div>
        </div>

        <button className="hub-add-button" onClick={openAdd}>
          <Plus size={18} />
          Thêm phương tiện
        </button>
      </div>

      {error && (
        <div className="operator-error">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="hub-summary-grid vehicle-summary-grid">
        {/* Tổng phương tiện */}
        <div className="hub-summary-card vehicle-summary-total">
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <CarFront size={21} />
            </div>
            <span className="hub-summary-label">
              TỔNG PHƯƠNG TIỆN
            </span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{totalVehicles}</strong>
            <span className="hub-summary-unit">phương tiện</span>
          </div>

          <div className="hub-summary-footer">
            <span>Quy mô đội xe</span>
            <span className="hub-summary-badge">Tất cả</span>
          </div>
        </div>

        {/* Xe đạp điện */}
        <div className="hub-summary-card vehicle-summary-bike">
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <Bike size={21} />
            </div>
            <span className="hub-summary-label">XE ĐẠP ĐIỆN</span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{totalBikes}</strong>
            <span className="hub-summary-unit">xe</span>
          </div>

          <div className="hub-summary-progress">
            <div
              className="hub-summary-progress-fill"
              style={{
                width: `${getPercentage(totalBikes)}%`,
              }}
            />
          </div>

          <div className="hub-summary-footer">
            <span>Tỷ lệ trong đội xe</span>
            <strong>{getPercentage(totalBikes)}%</strong>
          </div>
        </div>

        {/* Xe máy điện */}
        <div className="hub-summary-card vehicle-summary-scooter">
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <Zap size={21} />
            </div>
            <span className="hub-summary-label">XE MÁY ĐIỆN</span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{totalScooters}</strong>
            <span className="hub-summary-unit">xe</span>
          </div>

          <div className="hub-summary-progress">
            <div
              className="hub-summary-progress-fill"
              style={{
                width: `${getPercentage(totalScooters)}%`,
              }}
            />
          </div>

          <div className="hub-summary-footer">
            <span>Tỷ lệ trong đội xe</span>
            <strong>{getPercentage(totalScooters)}%</strong>
          </div>
        </div>

        {/* Đang khả dụng */}
        <div className="hub-summary-card vehicle-summary-available">
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <CarFront size={21} />
            </div>
            <span className="hub-summary-label">ĐANG KHẢ DỤNG</span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{availableVehicles}</strong>
            <span className="hub-summary-unit">xe</span>
          </div>

          <div className="hub-summary-progress">
            <div
              className="hub-summary-progress-fill"
              style={{
                width: `${getPercentage(availableVehicles)}%`,
              }}
            />
          </div>

          <div className="hub-summary-footer">
            <span>Tỷ lệ xe khả dụng</span>
            <strong>{getPercentage(availableVehicles)}%</strong>
          </div>
        </div>
      </div>

      <section className="hub-management-panel">
        <div className="hub-filter-toolbar">
          <div className="hub-search-box">
            <Search size={18} />
            <input
              placeholder="Tìm theo mã phương tiện..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">Tất cả loại xe</option>
            <option value="E_BIKE">Xe đạp điện</option>
            <option value="E_SCOOTER">Xe máy điện</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">Tất cả trạng thái</option>
            {[...new Set(vehicles.map((v) => v.status))].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            value={hubFilter}
            onChange={(e) => setHubFilter(e.target.value)}
          >
            <option value="ALL">Tất cả Hub</option>
            {hubs.map((hub) => (
              <option key={hub.id} value={hub.id}>
                {hub.name}
              </option>
            ))}
          </select>

          <button className="hub-reset-button" onClick={resetFilters}>
            <RotateCcw size={17} />
          </button>

          <button
            className="hub-reset-button"
            onClick={loadData}
            title="Tải lại"
          >
            <RefreshCw size={17} />
          </button>
        </div>

        <div className="hub-table-heading">
          <div>
            <h3>Phương tiện</h3>
            <p>
              Hiển thị {filteredVehicles.length} / {vehicles.length} phương tiện
            </p>
          </div>
        </div>

        <div className="hub-table-wrapper">
          <table className="hub-table">
            <thead>
              <tr>
                <th>Mã xe</th>
                <th>Loại phương tiện</th>
                <th>Mobility Hub</th>
                <th>Pin</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="hub-empty-state">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="hub-empty-state">
                    Không tìm thấy phương tiện phù hợp.
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td>
                      <strong className="hub-code">
                        {vehicle.code}
                      </strong>
                    </td>

                    <td>
                      <div className="hub-name-cell">
                        <div className="hub-row-icon">
                          {vehicle.type === "E_BIKE" ? (
                            <Bike size={18} />
                          ) : (
                            <Zap size={18} />
                          )}
                        </div>

                        <strong>
                          {vehicle.type === "E_BIKE"
                            ? "Xe đạp điện"
                            : "Xe máy điện"}
                        </strong>
                      </div>
                    </td>

                    <td>
                      {hubs.find((h) => h.id === vehicle.hubId)?.name ??
                        vehicle.hubId}
                    </td>

                    <td>
                      {vehicle.battery == null
                        ? "—"
                        : `${vehicle.battery}%`}
                    </td>

                    <td>
                      <span
                        className={`hub-status ${
                          vehicle.status === "AVAILABLE"
                            ? "hub-status-active"
                            : "hub-status-inactive"
                        }`}
                      >
                        <i />
                        {vehicle.status}
                      </span>
                    </td>

                    <td>
                      <div className="hub-action-group">
                        <button
                          className="hub-edit-button"
                          title="Cập nhật pin"
                          onClick={() => openEdit(vehicle)}
                        >
                          <Edit size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

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
                  {editingVehicle
                    ? "Cập nhật phương tiện"
                    : "Thêm phương tiện"}
                </h2>
                <p>Nhập thông tin phương tiện.</p>
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
                <label>
                  Mã phương tiện
                  <input
                    value={form.code}
                    disabled={!!editingVehicle}
                    required
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        code: e.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  Loại phương tiện
                  <select
                    value={form.type}
                    disabled={!!editingVehicle}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        type: e.target.value as VehicleForm["type"],
                      }))
                    }
                  >
                    <option value="E_BIKE">Xe đạp điện</option>
                    <option value="E_SCOOTER">Xe máy điện</option>
                  </select>
                </label>

                <label>
                  Mobility Hub
                  <select
                    value={form.hubId}
                    disabled={!!editingVehicle}
                    required
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        hubId: e.target.value,
                      }))
                    }
                  >
                    <option value="">Chọn Hub</option>
                    {hubs.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </label>

                {!editingVehicle && (
                  <label>
                    Mã chỗ đỗ
                    <input
                      value={form.slotId}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          slotId: e.target.value,
                        }))
                      }
                      placeholder="Nhập slotId nếu có"
                    />
                  </label>
                )}

                <label className="hub-form-full">
                  Dung lượng pin (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.battery}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        battery: Number(e.target.value),
                      }))
                    }
                    required
                  />
                </label>
              </div>

              <div className="hub-modal-actions">
                <button
                  type="button"
                  className="hub-cancel-button"
                  onClick={() => setShowModal(false)}
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  className="hub-save-button"
                  disabled={saving}
                >
                  <Save size={17} />
                  {saving
                    ? "Đang lưu..."
                    : editingVehicle
                      ? "Lưu thay đổi"
                      : "Thêm phương tiện"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleManagement;
