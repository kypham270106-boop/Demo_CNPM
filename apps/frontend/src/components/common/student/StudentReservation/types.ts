export type ReservationServiceType = "vehicle" | "parking";

export type ParkingType = "normal" | "charging";

export interface ReservationNavigationState {
  serviceType: ReservationServiceType;
  reservationID: string;
  hubName: string;
  hubCode: string;
  startsAt: string;
  endsAt: string;
  resourceName: string;
  resourceCode: string;
  parkingType?: ParkingType;
  chargingScheduleID?: string;
  chargingStartsAt?: string;
  chargingEndsAt?: string;
  currentBattery?: number;
  targetBattery?: number;
}

export interface HubOption {
  id: string;
  code: string;
  name: string;
  address?: string;
}
