
import api from "./api";

export interface OperatorHub {
  id: string;
  code: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  active: boolean;
  telemetryEnabled?: boolean;
  lastSeenAt?: string;
  stale?: boolean;
}

export interface OperatorVehicle {
  id: string;
  code: string;
  type: "E_BIKE" | "E_SCOOTER";
  status: string;
  battery?: number;
  hubId: string;
}

export interface OperatorParkingSlot {
  id: string;
  hubId: string;
  code: string;
  status: string;
}

export interface OperatorChargingPoint {
  id: string;
  hubId: string;
  slotId: string;
  code: string;
  status: string;
  powerKw?: number;
}

export interface OperatorReservation {
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

export interface OperatorDashboardData {
  hubs: OperatorHub[];
  vehicles: OperatorVehicle[];
  parkingSlots: OperatorParkingSlot[];
  chargingPoints: OperatorChargingPoint[];
  reservations: OperatorReservation[];
}

const unwrap = (response: any) =>
  response?.data?.data ?? response?.data ?? response;

const getAllPages = async <T,>(
  endpoint: string
): Promise<T[]> => {
  const limit = 100;

  const firstResponse = await api.get(endpoint, {
    params: { page: 1, limit },
  });

  const firstData = unwrap(firstResponse);

  if (Array.isArray(firstData)) {
    return firstData;
  }

  const firstItems: T[] = firstData?.items ?? [];
  const total = Number(firstData?.total ?? firstItems.length);

  if (firstItems.length >= total || firstItems.length === 0) {
    return firstItems;
  }

  const totalPages = Math.ceil(total / limit);

  const remainingRequests = Array.from(
    { length: totalPages - 1 },
    (_, index) =>
      api.get(endpoint, {
        params: {
          page: index + 2,
          limit,
        },
      })
  );

  const remainingResponses = await Promise.all(remainingRequests);

  const remainingItems = remainingResponses.flatMap((response) => {
    const data = unwrap(response);
    return Array.isArray(data) ? data : data?.items ?? [];
  });

  return [...firstItems, ...remainingItems];
};

const operatorDashboardService = {
  getDashboardData: async (): Promise<OperatorDashboardData> => {
    const [
      hubs,
      vehicles,
      parkingSlots,
      chargingPoints,
      reservations,
    ] = await Promise.all([
      getAllPages<OperatorHub>("/hubs"),
      getAllPages<OperatorVehicle>("/vehicles"),
      getAllPages<OperatorParkingSlot>("/parking-slots"),
      getAllPages<OperatorChargingPoint>("/charging-points"),
      getAllPages<OperatorReservation>("/reservations"),
    ]);

    return {
      hubs,
      vehicles,
      parkingSlots,
      chargingPoints,
      reservations,
    };
  },
};

export default operatorDashboardService;
