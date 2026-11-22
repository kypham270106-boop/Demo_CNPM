import api from "./api";

export interface Hub {
  id: string;
  code: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
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
}

export interface ChargingPoint {
  id: string;
  hubId: string;
  slotId: string;
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
  personalVehicleRef?: string;
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

export interface Reservation {
  id: string;
  userId: string;
  hubId: string;
  vehicleId?: string;
  slotId?: string;
  startsAt: string;
  endsAt: string;
  confirmationCode?: string;
  status:
    | "HELD"
    | "CONFIRMED"
    | "IN_USE"
    | "COMPLETED"
    | "CANCELLED"
    | "EXPIRED";
  createdAt: string;
  updatedAt: string;
}

const unwrap = (response: any) =>
  response?.data?.data ?? response?.data ?? response;

const reservationService = {
  getHubs: async (): Promise<Hub[]> => {
    const response = await api.get("/hubs", {
      params: {
        page: 1,
        limit: 100,
      },
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
      {
        params: {
          startsAt,
          endsAt,
        },
      }
    );

    return unwrap(response);
  },

  // Lấy danh sách chỗ đỗ theo Hub
  getParkingSlots: async (
    hubID: string
  ): Promise<ParkingSlot[]> => {
    const response = await api.get("/parking-slots", {
      params: {
        page: 1,
        limit: 100,
        hubId: hubID,
      },
    });

    const data = unwrap(response);

    return Array.isArray(data) ? data : data?.items ?? [];
  },

  // Lấy danh sách cổng sạc theo Hub
  getChargingPoints: async (
    hubID: string
  ): Promise<ChargingPoint[]> => {
    const response = await api.get("/charging-points", {
      params: {
        page: 1,
        limit: 100,
        hubId: hubID,
      },
    });

    const data = unwrap(response);

    return Array.isArray(data) ? data : data?.items ?? [];
  },

  getReservations: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
  }) => {
    const response = await api.get("/reservations", {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 25,
        status: params?.status,
      },
    });

    return unwrap(response);
  },

  createReservation: (payload: CreateReservationPayload) =>
    api.post("/reservations", payload),

  getReservation: (reservationID: string) =>
    api.get(`/reservations/${reservationID}`),

  confirmReservation: (reservationID: string) =>
    api.post(`/reservations/${reservationID}/confirm`),

  cancelReservation: (reservationID: string) =>
    api.post(`/reservations/${reservationID}/cancel`),

  createChargingRequest: (
    payload: CreateChargingRequestPayload
  ) => api.post("/charging-requests", payload),

  confirmChargingSchedule: (scheduleID: string) =>
    api.post(`/charging-schedules/${scheduleID}/confirm`),

  cancelChargingSchedule: (scheduleID: string) =>
    api.post(`/charging-schedules/${scheduleID}/cancel`),

  pickupVehicle: (
    reservationID: string,
    payload: PickupPayload
  ) => api.post(`/reservations/${reservationID}/pickup`, payload),

  returnVehicle: (
    reservationID: string,
    payload: ReturnPayload
  ) => api.post(`/reservations/${reservationID}/return`, payload),
};

export default reservationService;
