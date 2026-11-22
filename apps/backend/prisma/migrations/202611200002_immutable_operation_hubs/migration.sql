-- The Hub identifies the operation, including its historical allocations.
-- Enforce immutability even before children exist so a concurrent child insert
-- cannot race a Hub change. Replanning at the same Hub remains supported.
CREATE FUNCTION preserve_charging_request_hub() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."hubId" IS DISTINCT FROM OLD."hubId" THEN
    RAISE EXCEPTION 'Charging request Hub is immutable; create a new request for another Hub'
      USING ERRCODE = '23514', CONSTRAINT = 'charging_request_hub_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChargingRequest_preserve_hub"
BEFORE UPDATE OF "hubId" ON "ChargingRequest"
FOR EACH ROW EXECUTE FUNCTION preserve_charging_request_hub();

-- Only the vehicle's current location changes when dispatch completes.
-- The source and destination recorded on the order remain its original route.
CREATE FUNCTION preserve_dispatch_order_hubs() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."sourceId" IS DISTINCT FROM OLD."sourceId"
     OR NEW."targetId" IS DISTINCT FROM OLD."targetId" THEN
    RAISE EXCEPTION 'Dispatch order Hubs are immutable; create a new order for another route'
      USING ERRCODE = '23514', CONSTRAINT = 'dispatch_order_hubs_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DispatchOrder_preserve_hubs"
BEFORE UPDATE OF "sourceId", "targetId" ON "DispatchOrder"
FOR EACH ROW EXECUTE FUNCTION preserve_dispatch_order_hubs();
