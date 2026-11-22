import 'reflect-metadata';
import 'dotenv/config';
import { PrismaClient, SlotStatus } from '@prisma/client';
import { hashPassword } from '../src/auth/auth.module';
import { evaluateScenario } from '../src/simulations/engine';

const db = new PrismaClient();
const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

async function seed() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Demo seed requires ALLOW_DEMO_SEED=true and a non-production environment');
  }
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12) throw new Error('Set DEMO_PASSWORD with at least 12 characters');
  const passwordHash = await hashPassword(password);
  const now = new Date();
  const hour = (count: number) => new Date(+now + 3600_000 * count);
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(271106, 1)`;
    const student = await tx.user.upsert({
      where: {email: 'student@demo.local'}, update: {},
      create: {id: id(1), email: 'student@demo.local', passwordHash, name: 'Sinh viên Demo', studentCode: 'DEMO01', settings: {create: {}}},
    });
    const operator = await tx.user.upsert({
      where: {email: 'operator@demo.local'}, update: {},
      create: {id: id(2), email: 'operator@demo.local', passwordHash, name: 'Điều phối Demo', role: 'OPERATOR', settings: {create: {}}},
    });

    const hubs = [
      {id: id(10), code: 'BK', name: 'Bách Khoa', address: 'Cơ sở Dĩ An', latitude: 10.8808, longitude: 106.8052},
      {id: id(11), code: 'KTX-A', name: 'Ký túc xá Khu A', address: 'ĐHQG-HCM', latitude: 10.8783, longitude: 106.8056},
      {id: id(12), code: 'LIB', name: 'Thư viện Trung tâm', address: 'ĐHQG-HCM', latitude: 10.8689, longitude: 106.7983},
    ];
    for (const hub of hubs) {
      await tx.hub.upsert({where: {id: hub.id}, update: {}, create: {...hub, lastSeenAt: now}});
    }
    const slots: [number, number, SlotStatus][] = [
      [20, 10, 'OCCUPIED'], [21, 10, 'OCCUPIED'], [22, 10, 'FREE'], [23, 10, 'FREE'], [24, 10, 'UNAVAILABLE'],
      [25, 11, 'OCCUPIED'], [26, 11, 'FREE'], [27, 11, 'FREE'],
      [28, 12, 'OCCUPIED'], [29, 12, 'FREE'], [30, 12, 'FREE'],
    ];
    for (const [slot, hub, status] of slots) {
      await tx.parkingSlot.upsert({
        where: {id: id(slot)}, update: {}, create: {id: id(slot), hubId: id(hub), code: `P-${slot}`, status},
      });
    }
    for (const [vehicle, hub, slot, battery] of [[40, 10, 20, 92], [41, 10, 21, 62], [42, 11, 25, 12], [43, 12, 28, 48]]) {
      await tx.vehicle.upsert({where: {id: id(vehicle)}, update: {}, create: {
        id: id(vehicle), code: `EV-${vehicle}`, hubId: id(hub), slotId: id(slot), battery,
        type: vehicle % 2 ? 'E_SCOOTER' : 'E_BIKE', status: vehicle === 42 ? 'MAINTENANCE' : 'AVAILABLE',
      }});
    }
    await tx.chargingPoint.upsert({where: {id: id(50)}, update: {}, create: {
      id: id(50), hubId: id(10), slotId: id(22), code: 'C-01', powerKw: 0.6,
    }});
    await tx.chargingPoint.upsert({where: {id: id(51)}, update: {}, create: {
      id: id(51), hubId: id(11), slotId: id(26), code: 'C-02', powerKw: 0.9, status: 'FAULTED',
    }});
    await tx.chargingPoint.upsert({where: {id: id(52)}, update: {}, create: {
      id: id(52), hubId: id(12), slotId: id(29), code: 'C-03', powerKw: 0.8, status: 'CHARGING',
    }});
    await tx.reservation.upsert({where: {id: id(60)}, update: {}, create: {
      id: id(60), userId: student.id, hubId: id(10), vehicleId: id(41), startsAt: hour(-48), endsAt: hour(-47),
      holdExpiresAt: hour(-48), pickupBy: hour(-47.75), pickedUpAt: hour(-47.9), returnedAt: hour(-47.4),
      status: 'COMPLETED', confirmationCode: 'DEMO000000000060', returnCondition: 'Good',
    }});
    await tx.chargingRequest.upsert({where: {id: id(61)}, update: {}, create: {
      id: id(61), userId: student.id, hubId: id(12), pointId: id(52), personalVehicleRef: 'demo-bike',
      currentBattery: 40, targetBattery: 80, capacityKwh: 0.7, earliestAt: hour(-0.1), latestAt: hour(0.5), status: 'CHARGING',
      schedules: {create: {id: id(62), pointId: id(52), vehicleKey: `personal:${student.id}:demo-bike`,
        startsAt: hour(-0.1), endsAt: hour(0.5), expiresAt: hour(-0.09), estimatedBattery: 80, status: 'CHARGING'}},
    }});
    await tx.incident.upsert({where: {id: id(63)}, update: {}, create: {
      id: id(63), hubId: id(11), pointId: id(51), type: 'CHARGER_FAULT', activeKey: `charger:${id(51)}`,
      details: {description: 'Cổng sạc mẫu cần kiểm tra'},
    }});
    const demand = [{hubId: id(10), rides: 4, parking: 5, charging: 2}];
    const results = evaluateScenario(
      [{id: id(10), code: 'BK', availableVehicles: 2, freeSlots: 2, availableChargers: 1}], demand, 60, 1,
    );
    await tx.simulationScenario.upsert({where: {id: id(64)}, update: {}, create: {
      id: id(64), operatorId: operator.id, name: 'Giờ cao điểm', parameters: {horizonMinutes: 60, demandMultiplier: 1, demand},
      reports: {create: {id: id(65), snapshotAt: now, results}},
    }});
  });
  console.log('Demo accounts: student@demo.local and operator@demo.local');
}

void seed().catch((failure: unknown) => {
  console.error(failure instanceof Error ? failure.message : 'Seed failed');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
