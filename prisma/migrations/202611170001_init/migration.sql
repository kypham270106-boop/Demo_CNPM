-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'OPERATOR');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('E_BIKE', 'E_SCOOTER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'DISPATCHING', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('FREE', 'OCCUPIED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "PointStatus" AS ENUM ('AVAILABLE', 'CHARGING', 'FAULTED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'CONFIRMED', 'IN_USE', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ChargingStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'CHARGING', 'COMPLETED', 'CANCELLED', 'NEEDS_REPLAN');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('OVERLOAD', 'STALE_DATA', 'CHARGER_FAULT', 'DISPATCH_FAILURE', 'MANUAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "studentCode" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleSub" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" UUID NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'vi',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "notifications" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Hub" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "telemetryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMPTZ,
    "overloadThreshold" INTEGER NOT NULL DEFAULT 85,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Hub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "battery" INTEGER NOT NULL,
    "hubId" UUID NOT NULL,
    "slotId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingSlot" (
    "id" UUID NOT NULL,
    "hubId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ParkingSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargingPoint" (
    "id" UUID NOT NULL,
    "hubId" UUID NOT NULL,
    "slotId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "PointStatus" NOT NULL DEFAULT 'AVAILABLE',
    "powerKw" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ChargingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "hubId" UUID NOT NULL,
    "vehicleId" UUID,
    "slotId" UUID,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,
    "holdExpiresAt" TIMESTAMPTZ NOT NULL,
    "pickupBy" TIMESTAMPTZ,
    "pickedUpAt" TIMESTAMPTZ,
    "returnedAt" TIMESTAMPTZ,
    "returnCondition" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargingRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "hubId" UUID NOT NULL,
    "vehicleId" UUID,
    "reservationId" UUID,
    "personalVehicleRef" TEXT,
    "pointId" UUID,
    "currentBattery" INTEGER NOT NULL,
    "targetBattery" INTEGER,
    "durationMinutes" INTEGER,
    "capacityKwh" DOUBLE PRECISION NOT NULL,
    "earliestAt" TIMESTAMPTZ NOT NULL,
    "latestAt" TIMESTAMPTZ NOT NULL,
    "status" "ChargingStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ChargingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargingSchedule" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "pointId" UUID NOT NULL,
    "vehicleKey" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,
    "estimatedBattery" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "status" "ChargingStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ChargingSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchHistory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "query" JSONB NOT NULL,
    "hubId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" UUID NOT NULL,
    "hubId" UUID NOT NULL,
    "pointId" UUID,
    "type" "IncidentType" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "activeKey" TEXT,
    "details" JSONB NOT NULL,
    "resolution" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchOrder" (
    "id" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'PENDING',
    "failure" TEXT,
    "attemptId" UUID,
    "startedAt" TIMESTAMPTZ,
    "finishedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "DispatchOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchOrderItem" (
    "orderId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "targetSlotId" UUID NOT NULL,

    CONSTRAINT "DispatchOrderItem_pkey" PRIMARY KEY ("orderId","vehicleId")
);

-- CreateTable
CREATE TABLE "SimulationScenario" (
    "id" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationReport" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "snapshotAt" TIMESTAMPTZ NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_studentCode_key" ON "User"("studentCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "Hub_code_key" ON "Hub"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_code_key" ON "Vehicle"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_slotId_key" ON "Vehicle"("slotId");

-- CreateIndex
CREATE INDEX "Vehicle_hubId_status_type_battery_idx" ON "Vehicle"("hubId", "status", "type", "battery");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingSlot_hubId_code_key" ON "ParkingSlot"("hubId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ChargingPoint_slotId_key" ON "ChargingPoint"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "ChargingPoint_hubId_code_key" ON "ChargingPoint"("hubId", "code");

-- CreateIndex
CREATE INDEX "Reservation_status_holdExpiresAt_idx" ON "Reservation"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "Reservation_status_pickupBy_idx" ON "Reservation"("status", "pickupBy");

-- CreateIndex
CREATE INDEX "Reservation_userId_createdAt_idx" ON "Reservation"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChargingRequest_reservationId_key" ON "ChargingRequest"("reservationId");

-- CreateIndex
CREATE INDEX "ChargingRequest_userId_createdAt_idx" ON "ChargingRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChargingRequest_hubId_status_idx" ON "ChargingRequest"("hubId", "status");

-- CreateIndex
CREATE INDEX "ChargingSchedule_requestId_createdAt_idx" ON "ChargingSchedule"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "ChargingSchedule_status_expiresAt_idx" ON "ChargingSchedule"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "SearchHistory_userId_createdAt_idx" ON "SearchHistory"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_activeKey_key" ON "Incident"("activeKey");

-- CreateIndex
CREATE INDEX "Incident_status_type_createdAt_idx" ON "Incident"("status", "type", "createdAt");

-- CreateIndex
CREATE INDEX "DispatchOrder_status_createdAt_idx" ON "DispatchOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DispatchOrderItem_vehicleId_idx" ON "DispatchOrderItem"("vehicleId");

-- CreateIndex
CREATE INDEX "DispatchOrderItem_targetSlotId_idx" ON "DispatchOrderItem"("targetSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchOrderItem_orderId_targetSlotId_key" ON "DispatchOrderItem"("orderId", "targetSlotId");

-- CreateIndex
CREATE INDEX "SimulationReport_scenarioId_createdAt_idx" ON "SimulationReport"("scenarioId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ParkingSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSlot" ADD CONSTRAINT "ParkingSlot_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingPoint" ADD CONSTRAINT "ChargingPoint_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingPoint" ADD CONSTRAINT "ChargingPoint_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ParkingSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ParkingSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingRequest" ADD CONSTRAINT "ChargingRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingRequest" ADD CONSTRAINT "ChargingRequest_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingRequest" ADD CONSTRAINT "ChargingRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingRequest" ADD CONSTRAINT "ChargingRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingRequest" ADD CONSTRAINT "ChargingRequest_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "ChargingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingSchedule" ADD CONSTRAINT "ChargingSchedule_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ChargingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingSchedule" ADD CONSTRAINT "ChargingSchedule_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "ChargingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "ChargingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOrder" ADD CONSTRAINT "DispatchOrder_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOrder" ADD CONSTRAINT "DispatchOrder_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOrder" ADD CONSTRAINT "DispatchOrder_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOrderItem" ADD CONSTRAINT "DispatchOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DispatchOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOrderItem" ADD CONSTRAINT "DispatchOrderItem_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOrderItem" ADD CONSTRAINT "DispatchOrderItem_targetSlotId_fkey" FOREIGN KEY ("targetSlotId") REFERENCES "ParkingSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationScenario" ADD CONSTRAINT "SimulationScenario_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationReport" ADD CONSTRAINT "SimulationReport_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "SimulationScenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
