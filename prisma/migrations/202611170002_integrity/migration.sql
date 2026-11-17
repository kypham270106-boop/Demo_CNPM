CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Hub"
  ADD CONSTRAINT "hub_coordinates" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "hub_threshold" CHECK ("overloadThreshold" BETWEEN 1 AND 100);
ALTER TABLE "Vehicle" ADD CONSTRAINT "vehicle_battery" CHECK ("battery" BETWEEN 0 AND 100);
ALTER TABLE "ChargingPoint" ADD CONSTRAINT "charging_power" CHECK ("powerKw" > 0 AND "powerKw" <= 25);
ALTER TABLE "Reservation"
  ADD CONSTRAINT "reservation_window" CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "one_reservation_resource" CHECK (num_nonnulls("vehicleId", "slotId") = 1),
  ADD CONSTRAINT "vehicle_resource_overlap" EXCLUDE USING gist
    ("vehicleId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
    WHERE ("vehicleId" IS NOT NULL AND "status" IN ('HELD', 'CONFIRMED', 'IN_USE')),
  ADD CONSTRAINT "slot_resource_overlap" EXCLUDE USING gist
    ("slotId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
    WHERE ("slotId" IS NOT NULL AND "status" IN ('HELD', 'CONFIRMED', 'IN_USE'));
CREATE UNIQUE INDEX "vehicle_one_active_ride" ON "Reservation" ("vehicleId") WHERE "status" = 'IN_USE';

ALTER TABLE "ChargingRequest"
  ADD CONSTRAINT "charging_request_window" CHECK ("latestAt" > "earliestAt"),
  ADD CONSTRAINT "charging_request_vehicle" CHECK (num_nonnulls("vehicleId", "personalVehicleRef") = 1),
  ADD CONSTRAINT "charging_request_need" CHECK (
    "currentBattery" BETWEEN 0 AND 99 AND "capacityKwh" BETWEEN 0.05 AND 30
    AND ("targetBattery" IS NULL OR "targetBattery" BETWEEN "currentBattery" + 1 AND 100)
    AND ("durationMinutes" IS NULL OR "durationMinutes" BETWEEN 1 AND 1440)
    AND num_nonnulls("targetBattery", "durationMinutes") >= 1
  );
ALTER TABLE "ChargingSchedule"
  ADD CONSTRAINT "charging_schedule_window" CHECK ("endsAt" > "startsAt" AND "estimatedBattery" BETWEEN 0 AND 100),
  ADD CONSTRAINT "point_resource_overlap" EXCLUDE USING gist
    ("pointId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
    WHERE ("status" IN ('PROPOSED', 'CONFIRMED', 'CHARGING')),
  ADD CONSTRAINT "charged_vehicle_resource_overlap" EXCLUDE USING gist
    ("vehicleKey" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
    WHERE ("status" IN ('PROPOSED', 'CONFIRMED', 'CHARGING'));
CREATE UNIQUE INDEX "charging_request_one_active_schedule"
  ON "ChargingSchedule" ("requestId") WHERE "status" IN ('PROPOSED', 'CONFIRMED', 'CHARGING');

ALTER TABLE "DispatchOrder" ADD CONSTRAINT "different_dispatch_hubs" CHECK ("sourceId" <> "targetId");
