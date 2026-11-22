
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./MobilityHubManagement.css";

import {
  Plus,
  Search,
  MapPin,
  Edit,
  Trash2,
  X,
  Save,
  RotateCcw,
  Building2,
  Activity,
  CirclePause,
  Wrench,
} from "lucide-react";

interface Hub {
  id: string;
  name: string;
  address: string;
  region: string;
  status: "ACTIVE" | "INACTIVE" | "MAINTENANCE";
  description: string;
}

const initialHubs: Hub[] = [
  {
    id: "H001",
    name: "Mobility Hub Bách Khoa",
    address: "268 Lý Thường Kiệt, Quận 10",
    region: "Quận 10",
    status: "ACTIVE",
    description: "Hub tại khuôn viên trường Đại học Bách Khoa",
  },
  {
    id: "H002",
    name: "Mobility Hub Suối Tiên",
    address: "Ga Metro Suối Tiên, TP. Thủ Đức",
    region: "TP. Thủ Đức",
    status: "ACTIVE",
    description: "Hub kết nối với tuyến Metro số 1",
  },
  {
    id: "H003",
    name: "Mobility Hub Bến Thành",
    address: "Quận 1, TP. Hồ Chí Minh",
    region: "Quận 1",
    status: "MAINTENANCE",
    description: "Hub khu vực trung tâm thành phố",
  },
  {
    id: "H004",
    name: "Mobility Hub Thảo Điền",
    address: "Thảo Điền, TP. Thủ Đức",
    region: "TP. Thủ Đức",
    status: "INACTIVE",
    description: "Hub khu vực Thảo Điền",
  },
];

const emptyHub: Hub = {
  id: "",
  name: "",
  address: "",
  region: "",
  status: "ACTIVE",
  description: "",
};

const statusLabels: Record<Hub["status"], string> = {
  ACTIVE: "Đang hoạt động",
  INACTIVE: "Ngừng hoạt động",
  MAINTENANCE: "Đang bảo trì",
};

const MobilityHubManagement = () => {
  const [hubs, setHubs] = useState<Hub[]>(initialHubs);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [regionFilter, setRegionFilter] = useState("ALL");

  const [showModal, setShowModal] = useState(false);
  const [editingHub, setEditingHub] = useState<Hub | null>(null);
  const [formData, setFormData] = useState<Hub>(emptyHub);

  const [deleteTarget, setDeleteTarget] = useState<Hub | null>(null);

  const regions = useMemo(
    () => Array.from(new Set(hubs.map((hub) => hub.region))),
    [hubs]
  );

  const filteredHubs = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return hubs.filter((hub) => {
      const matchesSearch =
        !keyword ||
        hub.id.toLowerCase().includes(keyword) ||
        hub.name.toLowerCase().includes(keyword) ||
        hub.address.toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "ALL" || hub.status === statusFilter;

      const matchesRegion =
        regionFilter === "ALL" || hub.region === regionFilter;

      return matchesSearch && matchesStatus && matchesRegion;
    });
  }, [hubs, searchTerm, statusFilter, regionFilter]);

  const openAddModal = () => {
    setEditingHub(null);
    setFormData({
      ...emptyHub,
      id: `H${String(Date.now()).slice(-4)}`,
    });
    setShowModal(true);
  };

  const openEditModal = (hub: Hub) => {
    setEditingHub(hub);
    setFormData({ ...hub });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingHub(null);
    setFormData(emptyHub);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !formData.name.trim() ||
      !formData.address.trim() ||
      !formData.region.trim()
    ) {
      return;
    }

    if (editingHub) {
      setHubs((previous) =>
        previous.map((hub) =>
          hub.id === editingHub.id
            ? { ...formData, id: editingHub.id }
            : hub
        )
      );
    } else {
      setHubs((previous) => [
        ...previous,
        {
          ...formData,
          id: formData.id,
        },
      ]);
    }

    closeModal();
  };

  const handleDelete = () => {
    if (!deleteTarget) return;

    setHubs((previous) =>
      previous.filter((hub) => hub.id !== deleteTarget.id)
    );

    setDeleteTarget(null);
  };

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
    setRegionFilter("ALL");
  };

  const getStatusClass = (status: Hub["status"]) => {
    switch (status) {
      case "ACTIVE":
        return "hub-status-active";
      case "INACTIVE":
        return "hub-status-inactive";
      case "MAINTENANCE":
        return "hub-status-maintenance";
      default:
        return "";
    }
  };

  // ========================================
  // HUB STATISTICS
  // ========================================

  const totalHubCount = hubs.length;

  const activeHubCount = hubs.filter(
    (hub) => hub.status === "ACTIVE"
  ).length;

  const inactiveHubCount = hubs.filter(
    (hub) => hub.status === "INACTIVE"
  ).length;

  const maintenanceHubCount = hubs.filter(
    (hub) => hub.status === "MAINTENANCE"
  ).length;

  const getPercentage = (count: number) =>
    totalHubCount > 0
      ? Math.round((count / totalHubCount) * 100)
      : 0;

  return (
    <div className="mobility-hub-management">
      {/* Toolbar */}
      <div className="hub-management-toolbar">
        <div className="hub-management-description">
          <div className="hub-management-icon">
            <MapPin size={23} />
          </div>

          <div>
            <h2>Danh sách Mobility Hub</h2>
            <p>
              Quản lý thông tin và trạng thái các trạm Mobility Hub
              trong hệ thống.
            </p>
          </div>
        </div>

        <button
          className="hub-add-button"
          onClick={openAddModal}
        >
          <Plus size={19} />
          Thêm Mobility Hub
        </button>
      </div>

      {/* ========================================
          HUB SUMMARY
      ======================================== */}

      <div className="hub-summary-grid">
        {/* Tổng số Hub */}
        <div className="hub-summary-card hub-summary-total">
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <Building2 size={22} />
            </div>

            <span className="hub-summary-label">
              TỔNG SỐ HUB
            </span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{totalHubCount}</strong>
            <span className="hub-summary-unit">Hub</span>
          </div>

          <div className="hub-summary-footer">
            <span>Quy mô hệ thống</span>
            <span className="hub-summary-badge">Tất cả</span>
          </div>
        </div>

        {/* Đang hoạt động */}
        <div className="hub-summary-card hub-summary-active">
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <Activity size={22} />
            </div>

            <span className="hub-summary-label">
              ĐANG HOẠT ĐỘNG
            </span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{activeHubCount}</strong>
            <span className="hub-summary-unit">Hub</span>
          </div>

          <div className="hub-summary-progress">
            <div
              className="hub-summary-progress-fill"
              style={{
                width: `${getPercentage(activeHubCount)}%`,
              }}
            />
          </div>

          <div className="hub-summary-footer">
            <span>Tỷ lệ hoạt động</span>
            <strong>{getPercentage(activeHubCount)}%</strong>
          </div>
        </div>

        {/* Ngừng hoạt động */}
        <div className="hub-summary-card hub-summary-inactive">
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <CirclePause size={22} />
            </div>

            <span className="hub-summary-label">
              NGỪNG HOẠT ĐỘNG
            </span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{inactiveHubCount}</strong>
            <span className="hub-summary-unit">Hub</span>
          </div>

          <div className="hub-summary-progress">
            <div
              className="hub-summary-progress-fill"
              style={{
                width: `${getPercentage(inactiveHubCount)}%`,
              }}
            />
          </div>

          <div className="hub-summary-footer">
            <span>Tỷ lệ ngừng hoạt động</span>
            <strong>{getPercentage(inactiveHubCount)}%</strong>
          </div>
        </div>

        {/* Đang bảo trì */}
        <div className="hub-summary-card hub-summary-maintenance">
          <div className="hub-summary-top">
            <div className="hub-summary-icon">
              <Wrench size={22} />
            </div>

            <span className="hub-summary-label">
              ĐANG BẢO TRÌ
            </span>
          </div>

          <div className="hub-summary-value-row">
            <strong>{maintenanceHubCount}</strong>
            <span className="hub-summary-unit">Hub</span>
          </div>

          <div className="hub-summary-progress">
            <div
              className="hub-summary-progress-fill"
              style={{
                width: `${getPercentage(maintenanceHubCount)}%`,
              }}
            />
          </div>

          <div className="hub-summary-footer">
            <span>Tỷ lệ bảo trì</span>
            <strong>{getPercentage(maintenanceHubCount)}%</strong>
          </div>
        </div>
      </div>

      {/* ========================================
          FILTER AND TABLE
      ======================================== */}

      <section className="hub-management-panel">
        <div className="hub-filter-toolbar">
          <div className="hub-search-box">
            <Search size={19} />

            <input
              type="text"
              placeholder="Tìm theo mã Hub, tên hoặc địa chỉ..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="INACTIVE">Ngừng hoạt động</option>
            <option value="MAINTENANCE">Đang bảo trì</option>
          </select>

          <select
            value={regionFilter}
            onChange={(event) => setRegionFilter(event.target.value)}
          >
            <option value="ALL">Tất cả khu vực</option>

            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>

          <button
            className="hub-reset-button"
            onClick={resetFilters}
            title="Đặt lại bộ lọc"
          >
            <RotateCcw size={17} />
          </button>
        </div>

        <div className="hub-table-heading">
          <div>
            <h3>Mobility Hub</h3>
            <p>
              Hiển thị {filteredHubs.length} / {hubs.length} Hub
            </p>
          </div>
        </div>

        <div className="hub-table-wrapper">
          <table className="hub-table">
            <thead>
              <tr>
                <th>Mã Hub</th>
                <th>Tên Mobility Hub</th>
                <th>Địa chỉ</th>
                <th>Khu vực</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>

            <tbody>
              {filteredHubs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="hub-empty-state">
                    Không tìm thấy Mobility Hub phù hợp.
                  </td>
                </tr>
              ) : (
                filteredHubs.map((hub) => (
                  <tr key={hub.id}>
                    <td>
                      <strong className="hub-code">
                        {hub.id}
                      </strong>
                    </td>

                    <td>
                      <div className="hub-name-cell">
                        <div className="hub-row-icon">
                          <MapPin size={18} />
                        </div>

                        <div>
                          <strong>{hub.name}</strong>
                          <span>{hub.description}</span>
                        </div>
                      </div>
                    </td>

                    <td>{hub.address}</td>
                    <td>{hub.region}</td>

                    <td>
                      <span
                        className={`hub-status ${getStatusClass(
                          hub.status
                        )}`}
                      >
                        <i />
                        {statusLabels[hub.status]}
                      </span>
                    </td>

                    <td>
                      <div className="hub-action-group">
                        <button
                          className="hub-edit-button"
                          onClick={() => openEditModal(hub)}
                          title="Chỉnh sửa"
                        >
                          <Edit size={17} />
                        </button>

                        <button
                          className="hub-delete-button"
                          onClick={() => setDeleteTarget(hub)}
                          title="Xóa"
                        >
                          <Trash2 size={17} />
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

      {/* ========================================
          ADD / EDIT MODAL
      ======================================== */}

      {showModal && (
        <div
          className="hub-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <div className="hub-modal">
            <div className="hub-modal-header">
              <div>
                <h2>
                  {editingHub
                    ? "Chỉnh sửa Mobility Hub"
                    : "Thêm Mobility Hub"}
                </h2>

                <p>
                  Nhập thông tin cơ bản của Mobility Hub.
                </p>
              </div>

              <button
                className="hub-modal-close"
                onClick={closeModal}
                type="button"
              >
                <X size={21} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="hub-form-grid">
                <label>
                  Mã Hub
                  <input
                    value={formData.id}
                    disabled
                    placeholder="Mã Hub"
                  />
                </label>

                <label>
                  Tên Mobility Hub
                  <input
                    value={formData.name}
                    onChange={(event) =>
                      setFormData((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Nhập tên Hub"
                    required
                  />
                </label>

                <label className="hub-form-full">
                  Địa chỉ
                  <input
                    value={formData.address}
                    onChange={(event) =>
                      setFormData((previous) => ({
                        ...previous,
                        address: event.target.value,
                      }))
                    }
                    placeholder="Nhập địa chỉ Hub"
                    required
                  />
                </label>

                <label>
                  Khu vực
                  <input
                    value={formData.region}
                    onChange={(event) =>
                      setFormData((previous) => ({
                        ...previous,
                        region: event.target.value,
                      }))
                    }
                    placeholder="Ví dụ: Quận 1"
                    required
                  />
                </label>

                <label>
                  Trạng thái
                  <select
                    value={formData.status}
                    onChange={(event) =>
                      setFormData((previous) => ({
                        ...previous,
                        status: event.target.value as Hub["status"],
                      }))
                    }
                  >
                    <option value="ACTIVE">
                      Đang hoạt động
                    </option>
                    <option value="INACTIVE">
                      Ngừng hoạt động
                    </option>
                    <option value="MAINTENANCE">
                      Đang bảo trì
                    </option>
                  </select>
                </label>

                <label className="hub-form-full">
                  Mô tả
                  <textarea
                    value={formData.description}
                    onChange={(event) =>
                      setFormData((previous) => ({
                        ...previous,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Nhập mô tả Hub..."
                    rows={3}
                  />
                </label>
              </div>

              <div className="hub-modal-actions">
                <button
                  type="button"
                  className="hub-cancel-button"
                  onClick={closeModal}
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  className="hub-save-button"
                >
                  <Save size={17} />
                  {editingHub ? "Lưu thay đổi" : "Thêm Hub"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================
          DELETE CONFIRMATION
      ======================================== */}

      {deleteTarget && (
        <div className="hub-modal-overlay">
          <div className="hub-confirm-modal">
            <div className="hub-confirm-icon">
              <Trash2 size={25} />
            </div>

            <h2>Xóa Mobility Hub?</h2>

            <p>
              Bạn có chắc chắn muốn xóa{" "}
              <strong>{deleteTarget.name}</strong> không? Thao tác
              này không thể hoàn tác.
            </p>

            <div className="hub-modal-actions">
              <button
                className="hub-cancel-button"
                onClick={() => setDeleteTarget(null)}
              >
                Hủy
              </button>

              <button
                className="hub-confirm-delete-button"
                onClick={handleDelete}
              >
                <Trash2 size={17} />
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobilityHubManagement;
