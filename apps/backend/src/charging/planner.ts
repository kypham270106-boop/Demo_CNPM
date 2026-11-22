export type Interval = {startsAt: Date; endsAt: Date};

export function firstGap(window: Interval, blocked: Interval[], requiredMs: number) {
  let start = +window.startsAt;
  for (const interval of [...blocked].sort((a, b) => +a.startsAt - +b.startsAt)) {
    if (+interval.endsAt <= start) continue;
    if (+interval.startsAt - start >= requiredMs && +window.endsAt - start >= requiredMs) break;
    start = Math.max(start, +interval.endsAt);
  }
  if (+window.endsAt - start < requiredMs) return null;
  return {startsAt: new Date(start), endsAt: new Date(start + requiredMs)};
}

export function estimateBattery(current: number, capacityKwh: number, powerKw: number, durationMs: number) {
  return Math.min(100, Math.floor(current + (powerKw * durationMs * 100) / (3_600_000 * capacityKwh) + 1e-8));
}
