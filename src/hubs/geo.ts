export type Coordinate = {latitude: number; longitude: number};

const earthKm = 6371.0088;
const radians = (degrees: number) => degrees * Math.PI / 180;

export function distanceKm(a: Coordinate, b: Coordinate) {
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude))
    * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function routeDistanceKm(point: Coordinate, route: Coordinate[]) {
  const offset = (lng: number) => ((lng - point.longitude + 540) % 360) - 180;
  const scale = Math.cos(radians(point.latitude));
  const project = (item: Coordinate) => ({
    x: earthKm * scale * radians(offset(item.longitude)),
    y: earthKm * radians(item.latitude - point.latitude),
  });
  // Local tangent plane around the Hub for the campus-scale search.
  let distance = Infinity;
  for (let index = 1; index < route.length; index++) {
    const a = project(route[index - 1]);
    const b = project(route[index]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx ** 2 + dy ** 2;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared));
    distance = Math.min(distance, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return distance;
}
