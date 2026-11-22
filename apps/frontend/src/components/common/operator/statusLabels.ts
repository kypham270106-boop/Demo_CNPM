export function statusText(status: string, t: (text: string) => string) {
  const labels: Record<string, string> = {
    AVAILABLE: "Khả dụng", FREE: "Còn trống", OCCUPIED: "Đã có xe",
    UNAVAILABLE: "Không khả dụng", MAINTENANCE: "Đang bảo trì",
    IN_USE: "Đang sử dụng", CHARGING: "Đang sạc", FAULT: "Lỗi", FAULTED: "Lỗi",
    ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động",
  };
  return t(labels[status] ?? status);
}
