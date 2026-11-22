import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { Tx } from './database';
import { config } from './config';
import { conflict, missing } from './http';

export const minBattery = 15;
export const activeReservations = ['HELD', 'CONFIRMED', 'IN_USE'] as const;
const activeDispatches = ['PENDING', 'IN_PROGRESS'] as const;

export function overlap(startsAt: Date, endsAt: Date) {
  return { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } };
}

export function reservationOverlap(startsAt: Date, endsAt: Date): Prisma.ReservationWhereInput {
  return { status: { in: [...activeReservations] }, ...overlap(startsAt, endsAt) };
}

export function assignConfirmationCode() {
  return randomBytes(8).toString('hex').toUpperCase();
}

export async function expireReservations(tx: Tx, now: Date) {
  const expired = await tx.reservation.updateManyAndReturn({
    where: { OR: [
      { status: 'HELD', holdExpiresAt: { lte: now } },
      { status: 'CONFIRMED', pickupBy: { lte: now }, vehicleId: { not: null } },
      { status: 'CONFIRMED', endsAt: { lte: now }, vehicleId: null },
    ] },
    data: { status: 'EXPIRED' },
    select: { id: true },
  });
  const ids = expired.map(row => row.id);
  if (ids.length) {
    await tx.chargingSchedule.updateMany({
      where: { request: { reservationId: { in: ids } }, status: { in: ['PROPOSED', 'CONFIRMED'] } },
      data: { status: 'CANCELLED' },
    });
    await tx.chargingRequest.updateMany({
      where: { reservationId: { in: ids }, status: { in: ['PROPOSED', 'CONFIRMED', 'NEEDS_REPLAN'] } },
      data: { status: 'CANCELLED' },
    });
  }
  return ids.length;
}

export async function requireHub(tx: Tx, id: string, now: Date) {
  const hub = await tx.hub.findUnique({ where: { id } });
  if (!hub) throw missing('HUB');
  if (!hub.active) throw conflict('HUB_INACTIVE', 'Hub is inactive');
  if (stale(hub.lastSeenAt, now)) throw conflict('HUB_STALE', 'Hub telemetry is stale');
  return hub;
}

export function stale(lastSeenAt: Date | null, now: Date) {
  return lastSeenAt === null || now.getTime() - lastSeenAt.getTime() > config().staleSeconds * 1000;
}

export function freeSlots(hubId: string, startsAt: Date, endsAt: Date): Prisma.ParkingSlotWhereInput {
  return {
    hubId, status: 'FREE',
    reservations: { none: reservationOverlap(startsAt, endsAt) },
    destinations: { none: { order: { status: { in: [...activeDispatches] } } } },
    OR: [{ point: null }, { point: { status: { not: 'CHARGING' }, schedules: {
      none: { status: { in: ['PROPOSED', 'CONFIRMED', 'CHARGING'] }, ...overlap(startsAt, endsAt) },
    } } }],
  };
}

export function freeVehicles(hubId: string, startsAt: Date, endsAt: Date): Prisma.VehicleWhereInput {
  return {
    hubId, status: 'AVAILABLE', battery: { gte: minBattery },
    reservations: { none: reservationOverlap(startsAt, endsAt) },
    dispatches: { none: { order: { status: { in: [...activeDispatches] } } } },
    charging: { none: { schedules: { some: {
      status: { in: ['PROPOSED', 'CONFIRMED', 'CHARGING'] }, ...overlap(startsAt, endsAt),
    } } } },
  };
}
