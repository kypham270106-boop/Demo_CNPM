export type HubCapacity = {
  id: string; code: string; availableVehicles: number; freeSlots: number; availableChargers: number;
};
export type Demand = {hubId: string; rides: number; parking: number; charging: number};

export function evaluateScenario(hubs: HubCapacity[], demands: Demand[], horizonMinutes: number, demandMultiplier: number) {
  const byHub = new Map(demands.map(item => [item.hubId, item]));
  const results = hubs.map(hub => {
    const demand = byHub.get(hub.id);
    const estimate = (rate: number) => Math.ceil(rate * horizonMinutes / 60 * demandMultiplier);
    const requested = {rides: estimate(demand?.rides ?? 0), parking: estimate(demand?.parking ?? 0), charging: estimate(demand?.charging ?? 0)};
    const served = {
      rides: Math.min(requested.rides, hub.availableVehicles),
      parking: Math.min(requested.parking, hub.freeSlots),
      charging: Math.min(requested.charging, hub.availableChargers),
    };
    const totalRequested = requested.rides + requested.parking + requested.charging;
    const totalServed = served.rides + served.parking + served.charging;
    return {
      hubId: hub.id, code: hub.code, capacity: hub, requested, served, unmet: totalRequested - totalServed,
      overloadRisk: totalServed < totalRequested, serviceRate: totalRequested ? totalServed / totalRequested : 1,
    };
  });
  return {
    hubs: results,
    totals: results.reduce((acc, hub) => ({
      requested: acc.requested + hub.requested.rides + hub.requested.parking + hub.requested.charging,
      served: acc.served + hub.served.rides + hub.served.parking + hub.served.charging,
      overloadedHubs: acc.overloadedHubs + Number(hub.overloadRisk),
    }), {requested: 0, served: 0, overloadedHubs: 0}),
  };
}
