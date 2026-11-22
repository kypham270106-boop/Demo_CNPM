
import api from "./api";

export type FilterType = "all" | "bike" | "scooter";

export interface LocationPoint {
  label: string;
  latitude: number;
  longitude: number;
}

export interface Hub {
  id: string;
  code: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance: string;
  distanceKm: number;
  bikes: number;
  scooters: number;
  chargingSlots: number;
  batteryLevel: number;
  position: {
    top: string;
    left: string;
  };
}

interface PhotonFeature {
  geometry: {
    coordinates: [number, number];
  };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

interface HubListItem {
  id: string;
  code: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  active: boolean;
}

interface HubListResponse {
  items: HubListItem[];
  total: number;
  page: number;
  limit: number;
}

interface HubSearchItem extends HubListItem {
  distanceKm: number;
  counts?: {
    vehicles: number;
    parkingSlots: number;
    chargingPoints: number;
  };
}

interface HubSearchResponse {
  items: HubSearchItem[];
  suggestedRadiusKm: number;
}

interface Vehicle {
  id: string;
  type: "E_BIKE" | "E_SCOOTER";
  status: string;
  battery: number;
  hubId: string;
}

interface VehicleResponse {
  items: Vehicle[];
  total: number;
  page: number;
  limit: number;
}

interface OSRMResponse {
  code: string;
  routes: {
    distance: number;
    duration: number;
    geometry: {
      coordinates: [number, number][];
    };
  }[];
}

const photonURL = "https://photon.komoot.io/api/";
const osrmURL = "https://router.project-osrm.org/route/v1/driving";

const getMarkerPositions = (hubs: Hub[]): Hub[] => {
  if (hubs.length === 0) {
    return [];
  }

  const latitudes = hubs.map((hub) => hub.latitude);
  const longitudes = hubs.map((hub) => hub.longitude);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);

  return hubs.map((hub) => {
    const latRange = maxLat - minLat || 1;
    const lonRange = maxLon - minLon || 1;

    return {
      ...hub,
      position: {
        top: `${
          20 + ((maxLat - hub.latitude) / latRange) * 60
        }%`,
        left: `${
          20 + ((hub.longitude - minLon) / lonRange) * 60
        }%`,
      },
    };
  });
};

const mapHub = (
  hub: HubListItem,
  vehicles: Vehicle[],
  distanceKm = 0,
  chargingPoints = 0
): Hub => {
  const availableVehicles = vehicles.filter(
    (vehicle) =>
      vehicle.hubId === hub.id &&
      vehicle.status === "AVAILABLE"
  );

  const bikes = availableVehicles.filter(
    (vehicle) => vehicle.type === "E_BIKE"
  );

  const scooters = availableVehicles.filter(
    (vehicle) => vehicle.type === "E_SCOOTER"
  );

  const batteries = availableVehicles.map(
    (vehicle) => vehicle.battery
  );

  const batteryLevel =
    batteries.length > 0
      ? Math.round(
          batteries.reduce(
            (total, battery) => total + battery,
            0
          ) / batteries.length
        )
      : 0;

  return {
    id: hub.id,
    code: hub.code,
    name: hub.name,
    address: hub.address,
    latitude: hub.latitude,
    longitude: hub.longitude,
    distanceKm,
    distance:
      distanceKm > 0
        ? `${distanceKm.toFixed(2)} km`
        : "Chưa xác định",
    bikes: bikes.length,
    scooters: scooters.length,
    chargingSlots: chargingPoints,
    batteryLevel,
    position: {
      top: "50%",
      left: "50%",
    },
  };
};

const routeService = {
  // Search location suggestions using OpenStreetMap.
  searchPlaces: async (
    query: string
  ): Promise<LocationPoint[]> => {
    if (query.trim().length < 2) {
      return [];
    }

    const params = new URLSearchParams({
      q: query.trim(),
      limit: "5",
      lang: "en",
    });

    const response = await fetch(`${photonURL}?${params}`);

    if (!response.ok) {
      throw new Error("Không thể tìm kiếm địa điểm.");
    }

    const data: PhotonResponse = await response.json();

    return data.features
      .filter(
        (feature) =>
          feature.geometry?.coordinates?.length === 2
      )
      .map((feature) => {
        const properties = feature.properties;

        const label = [
          properties.name,
          properties.street,
          properties.housenumber,
          properties.district,
          properties.city,
          properties.state,
          properties.country,
        ]
          .filter(Boolean)
          .filter(
            (value, index, array) =>
              array.indexOf(value) === index
          )
          .join(", ");

        return {
          label,
          longitude: feature.geometry.coordinates[0],
          latitude: feature.geometry.coordinates[1],
        };
      });
  },

  // Get the current GPS location.
  getCurrentLocation: (): Promise<LocationPoint> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(
          new Error("Trình duyệt không hỗ trợ định vị GPS.")
        );
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            label: "Vị trí hiện tại của bạn",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              reject(
                new Error("Bạn chưa cho phép truy cập vị trí.")
              );
              break;
            case error.POSITION_UNAVAILABLE:
              reject(
                new Error("Không thể xác định vị trí hiện tại.")
              );
              break;
            case error.TIMEOUT:
              reject(
                new Error("Đã hết thời gian chờ lấy vị trí GPS.")
              );
              break;
            default:
              reject(new Error("Không thể lấy vị trí GPS."));
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  },

  // Get Hubs for the initial map.
  getHubs: async (): Promise<Hub[]> => {
    const [hubResponse, vehicleResult] = await Promise.all([
      api.get<HubListResponse>("/hubs", {
        params: {
          page: 1,
          limit: 100,
        },
      }),

      api
        .get<VehicleResponse>("/vehicles", {
          params: {
            page: 1,
            limit: 100,
            status: "AVAILABLE",
          },
        })
        .catch(() => null),
    ]);

    const hubItems = hubResponse.data.items || [];
    const vehicles = vehicleResult?.data.items || [];

    const mappedHubs = hubItems
      .filter((hub) => hub.active)
      .map((hub) => mapHub(hub, vehicles));

    return getMarkerPositions(mappedHubs);
  },

  // Get route coordinates using OSRM.
  getRouteCoordinates: async (
    start: LocationPoint,
    destination: LocationPoint
  ): Promise<[number, number][]> => {
    const coordinates = [
      `${start.longitude},${start.latitude}`,
      `${destination.longitude},${destination.latitude}`,
    ].join(";");

    const response = await fetch(
      `${osrmURL}/${coordinates}?overview=full&geometries=geojson&steps=false`
    );

    if (!response.ok) {
      throw new Error("Không thể tính toán tuyến đường.");
    }

    const data: OSRMResponse = await response.json();

    if (data.code !== "Ok" || !data.routes?.length) {
      throw new Error(
        "Không tìm thấy tuyến đường phù hợp giữa hai địa điểm."
      );
    }

    const points = data.routes[0].geometry.coordinates;

    const maxPoints = 50;
    const step = Math.max(
      1,
      Math.ceil(points.length / maxPoints)
    );

    return points
      .filter(
        (_, index) =>
          index % step === 0 ||
          index === points.length - 1
      )
      .map(([longitude, latitude]) => [
        latitude,
        longitude,
      ]);
  },

  // Search Hubs along the selected route.
  searchHubs: async (
    route: [number, number][],
    radiusKm = 3
  ): Promise<Hub[]> => {
    const payload = {
      route: route.map(([latitude, longitude]) => ({
        latitude,
        longitude,
      })),
      radiusKm,
    };

    const [hubResponse, vehicleResult] = await Promise.all([
      api.post<HubSearchResponse>("/hubs/search", payload),

      api
        .get<VehicleResponse>("/vehicles", {
          params: {
            page: 1,
            limit: 100,
            status: "AVAILABLE",
          },
        })
        .catch(() => null),
    ]);

    const hubItems = hubResponse.data.items || [];
    const vehicles = vehicleResult?.data.items || [];

    const mappedHubs = hubItems.map((hub) =>
      mapHub(
        hub,
        vehicles,
        hub.distanceKm,
        hub.counts?.chargingPoints ?? 0
      )
    );

    return getMarkerPositions(mappedHubs);
  },

  // Filter Hubs by available vehicle type.
  filterHubs: (
    hubs: Hub[],
    filter: FilterType
  ): Hub[] => {
    switch (filter) {
      case "bike":
        return hubs.filter((hub) => hub.bikes > 0);

      case "scooter":
        return hubs.filter((hub) => hub.scooters > 0);

      default:
        return hubs;
    }
  },
};

export default routeService;
