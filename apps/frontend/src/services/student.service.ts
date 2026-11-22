
import api from "./api";

export interface Hub {
  id: string;
  code: string;
  name: string;
  address?: string;
  active?: boolean;
  stale?: boolean;
}

export interface Vehicle {
  id: string;
  code: string;
  type: "E_BIKE" | "E_SCOOTER";
  status: string;
  battery?: number;
  hubId: string;
}

export interface ParkingSlot {
  id: string;
  hubId: string;
  code: string;
  status: string;
  point?: {
    id?: string;
    code?: string;
    status?: string;
  };
}

export interface ChargingPoint {
  id: string;
  code: string;
  status: string;
  powerKw?: number;
}

export interface HubAvailability {
  vehicles?: Vehicle[];
  parkingSlots?: ParkingSlot[];
  chargingPoints?: ChargingPoint[];
}

export interface CreateReservationPayload {
  startsAt: string;
  endsAt: string;
  hubId: string;
  vehicleId?: string;
  slotId?: string;
}

export interface CreateChargingRequestPayload {
  startsAt: string;
  endsAt: string;
  hubId: string;
  reservationId: string;
  personalVehicleRef: string;
  pointId: string;
  currentBattery: number;
  targetBattery: number;
  durationMinutes: number;
  capacityKwh: number;
}

export interface PickupPayload {
  latitude: number;
  longitude: number;
}

export interface ReturnPayload {
  hubId: string;
  condition: string;
}

const unwrap = (response: any) =>
  response?.data?.data ?? response?.data ?? response;

const studentService = {
  // ==============================
  // Hubs
  // ==============================

  getHubs: async (): Promise<Hub[]> => {
    const response = await api.get("/hubs", {
      params: { page: 1, limit: 100 },
    });

    const data = unwrap(response);
    return Array.isArray(data) ? data : data?.items ?? [];
  },

  getHubAvailability: async (
    hubID: string,
    startsAt: string,
    endsAt: string
  ): Promise<HubAvailability> => {
    const response = await api.get(
      `/hubs/${hubID}/availability`,
      { params: { startsAt, endsAt } }
    );

    return unwrap(response);
  },

  // ==============================
  // Reservations
  // ==============================

  getReservations: (params?: {
    page?: number;
    limit?: number;
    q?: string;
    status?: string;
    hubId?: string;
    userId?: string;
  }) => api.get("/reservations", { params }),

  getReservation: (reservationID: string) =>
    api.get(`/reservations/${reservationID}`),

  createReservation: (payload: CreateReservationPayload) =>
    api.post("/reservations", payload),

  confirmReservation: (reservationID: string) =>
    api.post(`/reservations/${reservationID}/confirm`),

  cancelReservation: (reservationID: string) =>
    api.post(`/reservations/${reservationID}/cancel`),

  pickupVehicle: (
    reservationID: string,
    payload: PickupPayload
  ) => api.post(`/reservations/${reservationID}/pickup`, payload),

  returnVehicle: (
    reservationID: string,
    payload: ReturnPayload
  ) => api.post(`/reservations/${reservationID}/return`, payload),

  // ==============================
  // Charging Requests
  // ==============================

  getChargingRequests: () =>
    api.get("/charging-requests"),

  createChargingRequest: (
    payload: CreateChargingRequestPayload
  ) => api.post("/charging-requests", payload),

  // ==============================
  // Charging Schedules
  // ==============================

  confirmChargingSchedule: (scheduleID: string) =>
    api.post(`/charging-schedules/${scheduleID}/confirm`),

  cancelChargingSchedule: (scheduleID: string) =>
    api.post(`/charging-schedules/${scheduleID}/cancel`),
};

export default studentService;
