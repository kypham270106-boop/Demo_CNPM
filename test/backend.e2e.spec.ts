import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/auth.module';
import { Database } from '../src/common/database';
import { configureHttp } from '../src/common/http';
import { OperationalJobs } from '../src/jobs';

jest.setTimeout(45_000);

const fixtures = Array.from({length: 15}, () => randomUUID());
const [student, student2, operator, locked, source, target, full, slotA, slotB, slotC, slotD, slotE,
  vehicle, charger, faulted] = fixtures;
const password = 'e2e-fixture-password-2026';
const coords = {latitude: 10.88, longitude: 106.8};
const iso = (deltaMinutes = 0) => new Date(Date.now() + deltaMinutes * 60_000).toISOString();
const email = (id: string) => `${id}@example.com`;
const bearer = (token: string) => ({Authorization: `Bearer ${token}`});

let app: INestApplication;
let db: Database;
let alice: string;
let bob: string;
let admin: string;

async function login(id: string) {
  return request(app.getHttpServer()).post('/api/auth/login').send({email: email(id), password});
}
function reserve(token: string, data: object) {
  return request(app.getHttpServer()).post('/api/reservations').set(bearer(token)).send(data);
}

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Use a migrated database with a name ending in _test');
  process.env.JOB_INTERVAL_SECONDS = '3600';
  process.env.HUB_STALE_SECONDS = '3600';
  process.env.MOCK_DISPATCH_FAILURE_PERCENT = '0';
  const module = await Test.createTestingModule({imports: [AppModule]}).compile();
  app = module.createNestApplication();
  configureHttp(app);
  await app.init();
  db = app.get(Database);
  const passwordHash = await hashPassword(password);
  await db.user.createMany({data: [
    {id: student, name: 'Alice', email: email(student), passwordHash},
    {id: student2, name: 'Bob', email: email(student2), passwordHash},
    {id: operator, name: 'Operator', email: email(operator), passwordHash, role: 'OPERATOR'},
    {id: locked, name: 'Locked', email: email(locked), passwordHash, active: false},
  ]});
  await db.hub.createMany({data: [source, target, full].map(id => ({
    id, code: id, name: id, address: 'Campus', ...coords, lastSeenAt: new Date(),
  }))});
  await db.parkingSlot.createMany({data: [
    {id: slotA, hubId: source, code: 'A', status: 'OCCUPIED'},
    {id: slotB, hubId: source, code: 'B'},
    {id: slotC, hubId: source, code: 'C'},
    {id: slotD, hubId: target, code: 'D'},
    {id: slotE, hubId: full, code: 'E', status: 'OCCUPIED'},
  ]});
  await db.vehicle.create({data: {id: vehicle, code: vehicle, hubId: source, slotId: slotA, type: 'E_BIKE', battery: 90}});
  await db.chargingPoint.createMany({data: [
    {id: charger, hubId: source, slotId: slotB, code: 'C-01', powerKw: 0.6},
    {id: faulted, hubId: source, slotId: slotC, code: 'C-02', powerKw: 0.6, status: 'FAULTED'},
  ]});
  [alice, bob, admin] = await Promise.all([student, student2, operator].map(async id => (await login(id)).body.accessToken as string));
});

afterAll(async () => {
  if (db) {
    const hubIds = [source, target, full];
    await db.$transaction([
      db.simulationReport.deleteMany({where: {scenario: {operatorId: operator}}}),
      db.simulationScenario.deleteMany({where: {operatorId: operator}}),
      db.dispatchOrderItem.deleteMany({where: {order: {operatorId: operator}}}),
      db.dispatchOrder.deleteMany({where: {operatorId: operator}}),
      db.incident.deleteMany({where: {hubId: {in: hubIds}}}),
      db.searchHistory.deleteMany({where: {userId: {in: [student, student2, operator, locked]}}}),
      db.chargingSchedule.deleteMany({where: {request: {hubId: {in: hubIds}}}}),
      db.chargingRequest.deleteMany({where: {hubId: {in: hubIds}}}),
      db.reservation.deleteMany({where: {hubId: {in: hubIds}}}),
      db.vehicle.deleteMany({where: {id: vehicle}}),
      db.chargingPoint.deleteMany({where: {hubId: {in: hubIds}}}),
      db.parkingSlot.deleteMany({where: {hubId: {in: hubIds}}}),
      db.hub.deleteMany({where: {id: {in: hubIds}}}),
      db.user.deleteMany({where: {id: {in: [student, student2, operator, locked]}}}),
    ]);
  }
  await app?.close();
});

it('TC-01 logs in and serves public health and OpenAPI', async () => {
  const session = await login(student);
  expect(session.status).toBe(200);
  expect(session.body.user).toMatchObject({id: student, role: 'STUDENT'});
  expect(session.body.user).not.toHaveProperty('passwordHash');
  expect(session.body.accessToken).toEqual(expect.any(String));
  await request(app.getHttpServer()).get('/api/health').expect(200, {status: 'ok'});
  const swagger = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
  expect(swagger.body.paths['/api/reservations'].post.responses['201'].content['application/json'].schema.properties.confirmationCode).toBeDefined();
  expect(swagger.body.paths['/api/reservations'].post.responses['409']).toBeDefined();
});

it('rejects bad credentials, locked accounts, invalid DTOs and disallowed roles', async () => {
  await request(app.getHttpServer()).post('/api/auth/login').send({email: email(student), password: 'wrong'})
    .expect(401).expect(response => expect(response.body.code).toBe('INVALID_CREDENTIALS'));
  expect((await login(locked)).body.code).toBe('ACCOUNT_LOCKED');
  await request(app.getHttpServer()).get('/api/dashboard').set(bearer(alice)).expect(403);
  await request(app.getHttpServer()).get('/api/vehicles').expect(401);
  const invalid = await reserve(alice, {hubId: source, startsAt: 'bad', endsAt: iso(10), slotId: slotB});
  expect(invalid.body).toMatchObject({statusCode: 400, code: 'VALIDATION_ERROR'});
});

it('handles PostgreSQL readiness failure and returns the stable error response', async () => {
  const failure = jest.spyOn(db, '$queryRaw').mockRejectedValueOnce(new Error('Database is unavailable'));
  try {
    await request(app.getHttpServer()).get('/api/health').expect(503)
      .expect(response => expect(response.body.code).toBe('DATABASE_UNAVAILABLE'));
  } finally {
    failure.mockRestore();
  }
});

it('returns a later parking window and a nearby alternative', async () => {
  const dates = {startsAt: iso(110), endsAt: iso(120)};
  const hold = await reserve(alice, {hubId: source, slotId: slotB, ...dates});
  expect(hold.status).toBe(201);
  const result = await request(app.getHttpServer()).get(`/api/hubs/${source}/parking-alternatives`)
    .set(bearer(alice)).query({...dates, charging: 'true'}).expect(200);
  expect(result.body.nextWindow).toMatchObject({startsAt: dates.endsAt, slotId: slotB});
  const parking = await request(app.getHttpServer()).get(`/api/hubs/${full}/parking-alternatives`)
    .set(bearer(alice)).query(dates).expect(200);
  expect(parking.body.nearby).toEqual(expect.arrayContaining([expect.objectContaining({hubId: target})]));
  await request(app.getHttpServer()).post(`/api/reservations/${hold.body.id}/cancel`).set(bearer(alice)).expect(200);
});

it('TC-02 holds, confirms, picks up, validates return capacity and returns a vehicle', async () => {
  const held = await reserve(alice, {hubId: source, vehicleId: vehicle, startsAt: iso(), endsAt: iso(15)});
  expect(held.status).toBe(201);
  const visit = `/api/reservations/${held.body.id}`;
  await request(app.getHttpServer()).get(visit).set(bearer(bob)).expect(404);
  await request(app.getHttpServer()).post(`${visit}/confirm`).set(bearer(alice)).expect(200)
    .expect(response => expect(response.body).toMatchObject({status: 'CONFIRMED', confirmationCode: expect.stringMatching(/^[A-F0-9]{16}$/)}));
  await request(app.getHttpServer()).post(`${visit}/pickup`).set(bearer(alice)).send({latitude: 0, longitude: 0})
    .expect(409).expect(response => expect(response.body.code).toBe('PICKUP_TOO_FAR'));
  await request(app.getHttpServer()).post(`${visit}/pickup`).set(bearer(alice)).send(coords).expect(200);
  expect((await db.vehicle.findUniqueOrThrow({where: {id: vehicle}})).slotId).toBeNull();
  await request(app.getHttpServer()).post(`${visit}/return`).set(bearer(alice)).send({hubId: full})
    .expect(409).expect(response => expect(response.body.code).toBe('RETURN_HUB_FULL'));
  await request(app.getHttpServer()).post(`${visit}/return`).set(bearer(alice)).send({hubId: source, condition: 'Good'})
    .expect(200).expect(response => expect(response.body.status).toBe('COMPLETED'));
  expect((await db.vehicle.findUniqueOrThrow({where: {id: vehicle}})).slotId).toBe(slotA);
});

it('TC-03 admits one of two overlapping requests and PostgreSQL rejects a direct overlap', async () => {
  const data = {hubId: source, vehicleId: vehicle, startsAt: iso(20), endsAt: iso(30)};
  const results = await Promise.all([reserve(alice, data), reserve(bob, data)]);
  expect(results.map(item => item.status).sort()).toEqual([201, 409]);
  const winner = results.find(item => item.status === 201)!;
  const dates = {startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt)};
  await expect(db.reservation.create({data: {
    hubId: source, vehicleId: vehicle, userId: student, ...dates, holdExpiresAt: new Date(iso(2)),
  }})).rejects.toThrow(/23P01|vehicle_resource_overlap/);
  const adjacent = await reserve(alice, {...data, startsAt: data.endsAt, endsAt: iso(40)});
  expect(adjacent.status).toBe(201);
  await db.reservation.updateMany({
    where: {id: {in: [winner.body.id, adjacent.body.id]}}, data: {holdExpiresAt: new Date(iso(-1))},
  });
  await app.get(OperationalJobs).tick();
  await app.get(OperationalJobs).tick();
  expect(await db.reservation.count({where: {id: {in: [winner.body.id, adjacent.body.id]}, status: 'EXPIRED'}})).toBe(2);
});

it('TC-04 detects overload and de-duplicates alerts', async () => {
  for (let count = 0; count < 2; count++) {
    const response = await request(app.getHttpServer()).post('/api/monitoring/check').set(bearer(admin)).expect(200);
    expect(response.body.find((hub: {id: string}) => hub.id === full).overloaded).toBe(true);
  }
  expect(await db.incident.count({where: {hubId: full, type: 'OVERLOAD'}})).toBe(1);
});

it('TC-05 saves and compares reports without changing operational inventory', async () => {
  const before = await db.vehicle.findUniqueOrThrow({where: {id: vehicle}});
  const payload = {name: 'Peak hour', horizonMinutes: 60, demandMultiplier: 2, demand: [{hubId: source, rides: 12, parking: 5, charging: 5}]};
  const a = await request(app.getHttpServer()).post('/api/simulations').set(bearer(admin)).send(payload).expect(201);
  const b = await request(app.getHttpServer()).post('/api/simulations').set(bearer(admin)).send({...payload, demandMultiplier: 0}).expect(201);
  expect(a.body.reports[0].results.totals.overloadedHubs).toBeGreaterThan(0);
  expect(b.body.reports[0].results.totals.overloadedHubs).toBe(0);
  await request(app.getHttpServer()).post('/api/simulations/compare').set(bearer(admin))
    .send({reportIds: [a.body.reports[0].id, b.body.reports[0].id]}).expect(200)
    .expect(response => expect(response.body.items).toHaveLength(2));
  expect(await db.vehicle.findUniqueOrThrow({where: {id: vehicle}})).toEqual(before);
  await request(app.getHttpServer()).post('/api/simulations').set(bearer(admin))
    .send({...payload, demand: [{...payload.demand[0], hubId: randomUUID()}]}).expect(400);
});

it('books charging and parking together and handles a failed charger', async () => {
  const dates = {startsAt: iso(60), endsAt: iso(90)};
  const pending = await reserve(alice, {hubId: source, slotId: slotB, ...dates});
  expect(pending.status).toBe(201);
  const input = {hubId: source, personalVehicleRef: 'my-bike', currentBattery: 30, targetBattery: 50, capacityKwh: 0.6, ...dates};
  await request(app.getHttpServer()).post('/api/charging-requests').set(bearer(alice)).send({...input, pointId: faulted})
    .expect(409).expect(response => expect(response.body.code).toBe('CHARGING_POINT_FAULTED'));
  const response = await request(app.getHttpServer()).post('/api/charging-requests').set(bearer(alice))
    .send({...input, reservationId: pending.body.id, pointId: charger}).expect(201);
  await request(app.getHttpServer()).post(`/api/charging-schedules/${response.body.proposal.id}/confirm`)
    .set(bearer(alice)).expect(200);
  expect((await db.reservation.findUniqueOrThrow({where: {id: pending.body.id}}))).toMatchObject({
    status: 'CONFIRMED', confirmationCode: expect.stringMatching(/^[A-F0-9]{16}$/),
  });
  const firstSchedule = await db.chargingSchedule.findUniqueOrThrow({where: {id: response.body.proposal.id}});
  await expect(db.chargingSchedule.create({data: {
    pointId: charger, requestId: firstSchedule.requestId, vehicleKey: 'direct-fixture',
    startsAt: firstSchedule.startsAt, endsAt: firstSchedule.endsAt, expiresAt: firstSchedule.expiresAt,
    estimatedBattery: firstSchedule.estimatedBattery,
  }})).rejects.toThrow(/23P01|point_resource_overlap|charging_request_one_active_schedule/);
  await request(app.getHttpServer()).patch(`/api/charging-points/${charger}/status`)
    .set(bearer(admin)).send({status: 'FAULTED'}).expect(200);
  expect((await db.chargingRequest.findUniqueOrThrow({where: {id: response.body.request.id}})).status).toBe('NEEDS_REPLAN');
});

it('dispatch checks destination capacity, tracks failure, then moves only on success', async () => {
  const create = (targetId: string) => request(app.getHttpServer()).post('/api/dispatch-orders')
    .set(bearer(admin)).send({sourceId: source, targetId, count: 1, type: 'E_BIKE'});
  await create(full).expect(409).expect(response => expect(response.body.code).toBe('DISPATCH_DESTINATION_FULL'));
  const first = await create(target).expect(201);
  const run = (id: string) => request(app.getHttpServer()).post(`/api/dispatch-orders/${id}/execute`).set(bearer(admin));
  process.env.MOCK_DISPATCH_FAILURE_PERCENT = '100';
  try {
    await run(first.body.id).expect(200).expect(response => expect(response.body.status).toBe('FAILED'));
  } finally {
    process.env.MOCK_DISPATCH_FAILURE_PERCENT = '0';
  }
  expect((await db.vehicle.findUniqueOrThrow({where: {id: vehicle}})).hubId).toBe(source);
  const second = await create(target).expect(201);
  await run(second.body.id).expect(200).expect(response => expect(response.body.status).toBe('COMPLETED'));
  expect((await db.vehicle.findUniqueOrThrow({where: {id: vehicle}})).hubId).toBe(target);
  expect(await db.incident.count({where: {hubId: source, type: 'DISPATCH_FAILURE'}})).toBe(1);
});
