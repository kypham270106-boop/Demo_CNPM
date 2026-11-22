-- Composite keys let the database verify that related resources belong to
-- the same Hub, even when writes bypass the application services.
ALTER TABLE "ParkingSlot"
  ADD CONSTRAINT "ParkingSlot_hubId_id_key" UNIQUE ("hubId", "id");
ALTER TABLE "ChargingPoint"
  ADD CONSTRAINT "ChargingPoint_hubId_id_key" UNIQUE ("hubId", "id");
ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_hubId_id_key" UNIQUE ("hubId", "id");

ALTER TABLE "Vehicle"
  ADD CONSTRAINT "Vehicle_hubId_slotId_fkey"
  FOREIGN KEY ("hubId", "slotId") REFERENCES "ParkingSlot" ("hubId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChargingPoint"
  ADD CONSTRAINT "ChargingPoint_hubId_slotId_fkey"
  FOREIGN KEY ("hubId", "slotId") REFERENCES "ParkingSlot" ("hubId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_hubId_slotId_fkey"
  FOREIGN KEY ("hubId", "slotId") REFERENCES "ParkingSlot" ("hubId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChargingRequest"
  ADD CONSTRAINT "ChargingRequest_hubId_reservationId_fkey"
  FOREIGN KEY ("hubId", "reservationId") REFERENCES "Reservation" ("hubId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ChargingRequest_hubId_pointId_fkey"
  FOREIGN KEY ("hubId", "pointId") REFERENCES "ChargingPoint" ("hubId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_hubId_pointId_fkey"
  FOREIGN KEY ("hubId", "pointId") REFERENCES "ChargingPoint" ("hubId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A reservation records its Hub at booking time. Do not constrain Vehicle.hubId
-- with a permanent FK: a shared vehicle may later move, while old bookings stay
-- as history for the original Hub.
CREATE FUNCTION enforce_reservation_vehicle_hub() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  resource_hub UUID;
BEGIN
  IF NEW."vehicleId" IS NOT NULL THEN
    SELECT v."hubId" INTO resource_hub
    FROM "Vehicle" AS v
    WHERE v."id" = NEW."vehicleId"
    FOR SHARE;
    IF resource_hub IS DISTINCT FROM NEW."hubId" THEN
      RAISE EXCEPTION 'Reservation vehicle must belong to the reservation Hub'
        USING ERRCODE = '23514', CONSTRAINT = 'reservation_vehicle_hub';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Reservation_vehicle_hub_check"
BEFORE INSERT OR UPDATE OF "hubId", "vehicleId" ON "Reservation"
FOR EACH ROW EXECUTE FUNCTION enforce_reservation_vehicle_hub();

-- Historical charging requests may remain after a shared vehicle moves.
CREATE FUNCTION enforce_charging_request_vehicle_hub() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  resource_hub UUID;
BEGIN
  IF NEW."vehicleId" IS NOT NULL THEN
    SELECT v."hubId" INTO resource_hub
    FROM "Vehicle" AS v
    WHERE v."id" = NEW."vehicleId"
    FOR SHARE;
    IF resource_hub IS DISTINCT FROM NEW."hubId" THEN
      RAISE EXCEPTION 'Charging request vehicle must belong to the request Hub'
        USING ERRCODE = '23514', CONSTRAINT = 'charging_request_vehicle_hub';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChargingRequest_vehicle_hub_check"
BEFORE INSERT OR UPDATE OF "hubId", "vehicleId" ON "ChargingRequest"
FOR EACH ROW EXECUTE FUNCTION enforce_charging_request_vehicle_hub();

-- A charging schedule must use a point at the same Hub as its request.
CREATE FUNCTION enforce_charging_schedule_hub() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  request_hub UUID;
  point_hub UUID;
BEGIN
  SELECT r."hubId" INTO request_hub
  FROM "ChargingRequest" AS r
  WHERE r."id" = NEW."requestId"
  FOR SHARE;
  SELECT p."hubId" INTO point_hub
  FROM "ChargingPoint" AS p
  WHERE p."id" = NEW."pointId"
  FOR SHARE;
  IF request_hub IS DISTINCT FROM point_hub THEN
    RAISE EXCEPTION 'Charging schedule point must belong to the request Hub'
      USING ERRCODE = '23514', CONSTRAINT = 'charging_schedule_hub';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChargingSchedule_hub_check"
BEFORE INSERT OR UPDATE OF "requestId", "pointId" ON "ChargingSchedule"
FOR EACH ROW EXECUTE FUNCTION enforce_charging_schedule_hub();

-- Dispatch items are checked when attached to an order. Once dispatched, the
-- vehicle's current Hub changes, but the order remains a historical record.
CREATE FUNCTION enforce_dispatch_item_hubs() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  source_hub UUID;
  target_hub UUID;
  vehicle_hub UUID;
  slot_hub UUID;
BEGIN
  SELECT o."sourceId", o."targetId" INTO source_hub, target_hub
  FROM "DispatchOrder" AS o
  WHERE o."id" = NEW."orderId"
  FOR SHARE;
  SELECT v."hubId" INTO vehicle_hub
  FROM "Vehicle" AS v
  WHERE v."id" = NEW."vehicleId"
  FOR SHARE;
  SELECT s."hubId" INTO slot_hub
  FROM "ParkingSlot" AS s
  WHERE s."id" = NEW."targetSlotId"
  FOR SHARE;

  IF vehicle_hub IS DISTINCT FROM source_hub THEN
    RAISE EXCEPTION 'Dispatch vehicle must belong to the source Hub'
      USING ERRCODE = '23514', CONSTRAINT = 'dispatch_item_source_hub';
  END IF;
  IF slot_hub IS DISTINCT FROM target_hub THEN
    RAISE EXCEPTION 'Dispatch target slot must belong to the destination Hub'
      USING ERRCODE = '23514', CONSTRAINT = 'dispatch_item_target_hub';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DispatchOrderItem_hub_check"
BEFORE INSERT OR UPDATE OF "orderId", "vehicleId", "targetSlotId" ON "DispatchOrderItem"
FOR EACH ROW EXECUTE FUNCTION enforce_dispatch_item_hubs();
