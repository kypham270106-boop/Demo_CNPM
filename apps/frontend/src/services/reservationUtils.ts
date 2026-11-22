import type { Hub } from "./reservation.service";

export const unwrap = (response: any) =>
  response?.data?.data ?? response?.data ?? response;

export const getErrorMessage = (error: any) =>
  error?.response?.data?.message ||
  error?.message ||
  "Không thể thực hiện yêu cầu. Vui lòng thử lại.";

// Chuyển Date sang giá trị cho <input type="datetime-local">
export const toLocalInput = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

// Giờ tròn, cách hiện tại `hoursAhead` giờ
export const defaultTimeInput = (hoursAhead: number) => {
  const date = new Date();
  date.setHours(date.getHours() + hoursAhead, 0, 0, 0);
  return toLocalInput(date);
};

export const isUsableHub = (hub: Hub) =>
  hub.active !== false && hub.stale !== true;

// Lấy mã đặt chỗ từ response của createReservation
export const extractReservationID = (response: any): string => {
  const data = unwrap(response);
  const reservation = data?.reservation ?? data;

  return reservation?.id ?? reservation?._id ?? "";
};

// Trả về thông báo lỗi, hoặc "" nếu hợp lệ
export const validateTimeRange = (startDate: Date, endDate: Date) => {
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate <= startDate
  ) {
    return "Thời gian kết thúc phải sau thời gian bắt đầu.";
  }

  if (startDate <= new Date()) {
    return "Thời gian bắt đầu phải ở tương lai.";
  }

  return "";
};