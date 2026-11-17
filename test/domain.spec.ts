import { estimateBattery, firstGap } from '../src/charging/planner';
import { minutes } from '../src/common/config';
import { distanceKm, routeDistanceKm } from '../src/hubs/geo';
import { utilization } from '../src/operations/monitoring.module';
import { evaluateScenario } from '../src/simulations/engine';

const time = (minute: number) => new Date(minutes(minute));
const interval = (starts: number, ends: number) => ({startsAt: time(starts), endsAt: time(ends)});

describe('charging rules', () => {
  it('uses half-open boundaries and finds a gap after overlapping allocations', () => {
    expect(firstGap(interval(0, 60), [interval(15, 35), interval(10, 25)], minutes(10))).toEqual(interval(0, 10));
    expect(firstGap(interval(0, 60), [interval(15, 35), interval(10, 25)], minutes(12))).toEqual(interval(35, 47));
    expect(firstGap(interval(0, 45), [interval(15, 35), interval(10, 25)], minutes(16))).toBeNull();
  });

  it('estimates charge and caps the result at 100 percent', () => {
    expect(estimateBattery(30, 1, 0.6, minutes(30))).toBe(60);
    expect(estimateBattery(90, 1, 0.6, minutes(30))).toBe(100);
  });
});

describe('hub and simulation calculations', () => {
  it('finds Hubs along segments and computes GPS distance', () => {
    const a = {latitude: 10.8, longitude: 106.8};
    const b = {latitude: 10.8, longitude: 106.82};
    const mid = {latitude: 10.8, longitude: 106.81};
    expect(distanceKm(a, b)).toBeCloseTo(2.18, 1);
    expect(routeDistanceKm(mid, [a, b])).toBeCloseTo(0, 4);
    expect(routeDistanceKm({...mid, latitude: 10.81}, [a, b])).toBeCloseTo(1.11, 2);
  });

  it('calculates utilization for full or empty capacity', () => {
    expect(utilization(0, 0)).toBe(0);
    expect(utilization(4, 1)).toBe(75);
    expect(utilization(4, 0)).toBe(100);
  });

  it('scales demand without mutating the input snapshot', () => {
    const hubs = [{id: 'a', code: 'BK', availableVehicles: 2, freeSlots: 1, availableChargers: 0}];
    const before = structuredClone(hubs);
    const report = evaluateScenario(hubs, [{hubId: 'a', rides: 4, parking: 2, charging: 1}], 30, 2);
    expect(report.totals).toEqual({requested: 7, served: 3, overloadedHubs: 1});
    expect(hubs).toEqual(before);
  });
});
