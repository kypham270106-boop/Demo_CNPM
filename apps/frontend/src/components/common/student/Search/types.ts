import type {
  Hub,
  LocationPoint,
} from "../../../../services/route.service";

export interface BookingSearchState {
  startPoint: string;
  destination: string;
  startLocation: LocationPoint;
  destinationLocation: LocationPoint;
  routeCoordinates: [number, number][];
  hubs: Hub[];
}

export interface BookingResultsState extends BookingSearchState {
  selectedHub: Hub;
}