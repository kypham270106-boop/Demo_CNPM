ALTER TABLE "Reservation" ADD COLUMN "confirmationCode" TEXT;
UPDATE "Reservation"
SET "confirmationCode" = upper(substring(md5(id::text) for 16))
WHERE "status" IN ('CONFIRMED', 'IN_USE', 'COMPLETED');
CREATE UNIQUE INDEX "Reservation_confirmationCode_key" ON "Reservation"("confirmationCode");

ALTER TABLE "ChargingSchedule" ADD COLUMN "adjusted" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ChargingSchedule" AS s
SET "adjusted" = true
FROM "ChargingRequest" AS r
WHERE r.id = s."requestId"
  AND ((r."targetBattery" IS NOT NULL AND s."estimatedBattery" < r."targetBattery")
    OR (r."targetBattery" IS NULL AND r."durationMinutes" IS NOT NULL
      AND extract(epoch FROM (s."endsAt" - s."startsAt")) < r."durationMinutes" * 60));

ALTER TABLE "UserSettings" ALTER COLUMN "theme" SET DEFAULT 'light';
