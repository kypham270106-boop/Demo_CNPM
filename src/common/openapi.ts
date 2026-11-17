import { getSchemaPath, OpenAPIObject } from '@nestjs/swagger';
import type { OperationObject, SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { Prisma } from '@prisma/client';
import type { Type } from '@nestjs/common';

const uuid = {type: 'string', format: 'uuid', example: '00000000-0000-4000-8000-000000000010'} as const;
const instant = {type: 'string', format: 'date-time', example: '2026-11-17T09:00:00.000Z'} as const;
const number = {type: 'integer', example: 1} as const;
const boolean = {type: 'boolean', example: true} as const;
const string = {type: 'string', example: 'BK'} as const;
const json = {type: 'object', additionalProperties: true} as const;
const array = (items: SchemaObject): SchemaObject => ({type: 'array', items});
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object', properties, required: Object.keys(properties),
});
const page = (item: SchemaObject) => object({items: array(item), total: number, page: number, limit: number});
const scalars: Record<string, SchemaObject> = {
  String: string, DateTime: instant, Float: {type: 'number', example: 0.6}, Int: number, Boolean: boolean, Json: json,
};
const hidden = new Set(['passwordHash', 'googleSub', 'attemptId', 'activeKey', 'vehicleKey']);

function model(name: string, extras: Record<string, SchemaObject> = {}, only?: string[]): SchemaObject {
  const metadata = Prisma.dmmf.datamodel.models.find(item => item.name === name);
  if (!metadata) throw new Error(`Unknown API model ${name}`);
  const fields = metadata.fields.filter(field =>
    field.kind !== 'object' && !hidden.has(field.name) && (!only || only.includes(field.name)));
  return object({
    ...Object.fromEntries(fields.map(field => {
      const values = Prisma.dmmf.datamodel.enums.find(item => item.name === field.type)?.values.map(item => item.name);
      const scalar = values ? {type: 'string' as const, enum: values, example: values[0]} :
        field.type === 'String' && (field.name === 'id' || field.name.endsWith('Id')) ? uuid : scalars[field.type];
      return [field.name, {...scalar, nullable: !field.isRequired}];
    })),
    ...extras,
  });
}

const user = model('User', {}, ['id', 'name', 'email', 'studentCode', 'role', 'active', 'createdAt']);
const hub = model('Hub', {stale: boolean});
const vehicle = model('Vehicle');
const slot = model('ParkingSlot');
const point = model('ChargingPoint');
const reservation = model('Reservation');
const schedule = model('ChargingSchedule');
const charging = model('ChargingRequest');
const proposal = object({
  request: charging,
  proposal: model('ChargingSchedule', {durationMinutes: number}),
});
const incident = model('Incident');
const order = model('DispatchOrder', {items: array(model('DispatchOrderItem'))});
const report = model('SimulationReport');
const scenario = model('SimulationScenario', {reports: array(report)});
const hubSnapshot = model('Hub', {
  stale: boolean, overloaded: boolean,
  vehicles: object({total: number, available: number}),
  parking: object({total: number, free: number, occupied: number, utilizationPercent: number}),
  charging: object({total: number, available: number, charging: number, faulted: number, utilizationPercent: number}),
});
const dashboard = object({
  snapshotAt: instant, hubs: array(hubSnapshot), incidents: array(incident),
  totals: object({
    hubs: number, vehicles: number, freeSlots: number, chargingAvailable: number,
    chargingActive: number, chargingFaulted: number, overloaded: number,
  }),
  utilization: array(object({status: {...string, example: 'COMPLETED'}, count: number})),
});
const session = object({user, accessToken: {...string, example: 'eyJ...'}, tokenType: {...string, example: 'Bearer'}, expiresIn: {...number, example: 3600}});

type Route = [operation: string, role: 'Public' | 'Authenticated' | 'STUDENT' | 'OPERATOR', purpose: string,
  response: SchemaObject | null, status?: number, errors?: string[]];

const routes: Route[] = [
  ['HealthController_check', 'Public', 'Check API and PostgreSQL readiness', object({status: {...string, example: 'ok'}})],
  ['AuthController_login', 'Public', 'Get an access token with email and password', session, 200, ['INVALID_CREDENTIALS', 'ACCOUNT_LOCKED']],
  ['AuthController_google', 'Public', 'Start Google authorization with state and PKCE', null, 302, ['OAUTH_DISABLED']],
  ['AuthController_callback', 'Public', 'Exchange Google authorization code for an API session', session, 200, ['OAUTH_REJECTED', 'OAUTH_EMAIL_UNVERIFIED', 'OAUTH_ACCOUNT_EXISTS', 'OAUTH_PROVIDER_ERROR', 'OAUTH_DISABLED']],
  ['AuthController_me', 'Authenticated', 'Get the current account', user],
  ['UsersController_me', 'Authenticated', 'Get your profile', user],
  ['UsersController_profile', 'Authenticated', 'Update your profile', user],
  ['UsersController_list', 'OPERATOR', 'List users by email, name, student code, role or status', page(user)],
  ['UsersController_create', 'OPERATOR', 'Provision a local user', user, 201, ['DATA_CONFLICT']],
  ['UsersController_update', 'OPERATOR', 'Lock or unlock an account', user, 200, ['SELF_LOCK', 'RECORD_NOT_FOUND']],
  ['SettingsController_get', 'Authenticated', 'Get or initialize your preferences', model('UserSettings')],
  ['SettingsController_update', 'Authenticated', 'Update your preferences', model('UserSettings')],
  ['SettingsController_reset', 'Authenticated', 'Restore the default Vietnamese and light preferences', model('UserSettings')],
  ['HubsController_list', 'Authenticated', 'List Hubs ordered by code', page(hub)],
  ['HubsController_find', 'Authenticated', 'Find nearby Hubs by GPS or along a supplied route', object({
    items: array(model('Hub', {stale: boolean, distanceKm: {type: 'number'}, counts: object({vehicles: number, parkingSlots: number, chargingPoints: number})})),
    suggestedRadiusKm: {type: 'number', nullable: true},
  }), 201, ['INVALID_SEARCH']],
  ['HubsController_history', 'Authenticated', 'List your saved searches and Hub view history', page(model('SearchHistory'))],
  ['HubsController_detail', 'Authenticated', 'Read Hub inventory and freshness', model('Hub', {
    stale: boolean, vehicles: array(vehicle), parkingSlots: array(slot), chargingPoints: array(point),
  }), 200, ['HUB_NOT_FOUND']],
  ['HubsController_availability', 'Authenticated', 'Find inventory available in a time window', object({
    vehicles: array(vehicle), parkingSlots: array(model('ParkingSlot', {point: {...point, nullable: true}})), chargingPoints: array(point),
  }), 200, ['HUB_NOT_FOUND', 'HUB_INACTIVE', 'HUB_STALE', 'INVALID_WINDOW']],
  ['HubsController_alternatives', 'Authenticated', 'Find nearby available parking and the first feasible window at this Hub', object({
    nearby: array(object({hubId: uuid, code: string, distanceKm: {type: 'number'}, slotIds: array(uuid)})),
    nextWindow: {...object({startsAt: instant, endsAt: instant, slotId: uuid}), nullable: true},
  }), 200, ['HUB_NOT_FOUND', 'INVALID_WINDOW']],
  ['HubsController_create', 'OPERATOR', 'Create a Hub', model('Hub'), 201, ['DATA_CONFLICT']],
  ['HubsController_patch', 'OPERATOR', 'Update Hub configuration', model('Hub'), 200, ['RECORD_NOT_FOUND', 'DATA_CONFLICT']],
  ['VehicleController_list', 'Authenticated', 'List vehicles with Hub, status, type and battery filters', page(vehicle)],
  ['VehicleController_create', 'OPERATOR', 'Add a vehicle and occupy its parking slot', vehicle, 201, ['HUB_NOT_FOUND', 'HUB_STALE', 'SLOT_UNAVAILABLE', 'DATA_CONFLICT']],
  ['VehicleController_update', 'OPERATOR', 'Update an idle vehicle’s battery or maintenance state', vehicle, 200, ['VEHICLE_NOT_FOUND', 'VEHICLE_BUSY']],
  ['SlotsController_list', 'Authenticated', 'List parking slots by Hub or code', page(slot)],
  ['SlotsController_create', 'OPERATOR', 'Create a parking slot', slot, 201, ['DATA_CONFLICT']],
  ['PointsController_list', 'Authenticated', 'List charging points by Hub or code', page(point)],
  ['PointsController_create', 'OPERATOR', 'Attach a charger to a parking slot', point, 201, ['PARKING_SLOT_NOT_FOUND', 'DATA_CONFLICT']],
  ['PointControl_status', 'OPERATOR', 'Report or clear a charger fault', point, 200, ['CHARGING_POINT_NOT_FOUND', 'CHARGING_ACTIVE']],
  ['ReservationsController_list', 'Authenticated', 'List your reservations or, for an operator, all reservations', page(reservation)],
  ['ReservationsController_detail', 'Authenticated', 'Read a visible reservation', reservation, 200, ['RESERVATION_NOT_FOUND']],
  ['ReservationsController_hold', 'STUDENT', 'Temporarily hold a vehicle or parking slot', reservation, 201, ['INVALID_RESOURCE', 'INVALID_WINDOW', 'HUB_NOT_FOUND', 'HUB_STALE', 'RESOURCE_UNAVAILABLE', 'RESOURCE_CONFLICT']],
  ['ReservationsController_confirm', 'STUDENT', 'Confirm a standalone reservation', reservation, 200, ['RESERVATION_NOT_FOUND', 'RESERVATION_EXPIRED', 'RESERVATION_STATE', 'CHARGING_CONFIRMATION_REQUIRED', 'HUB_STALE']],
  ['ReservationsController_cancel', 'Authenticated', 'Cancel a held or confirmed reservation', reservation, 200, ['RESERVATION_NOT_FOUND', 'RESERVATION_EXPIRED', 'RESERVATION_STATE', 'CHARGING_ACTIVE']],
  ['ReservationsController_pickup', 'STUDENT', 'Check in at the Hub and pick up the reserved vehicle', reservation, 200, ['RESERVATION_NOT_FOUND', 'RESERVATION_EXPIRED', 'RESERVATION_STATE', 'PICKUP_INVALID', 'PICKUP_TOO_FAR', 'VEHICLE_UNAVAILABLE', 'HUB_STALE']],
  ['ReservationsController_returnVehicle', 'STUDENT', 'Return the vehicle to a Hub and assign parking', reservation, 200, ['RESERVATION_NOT_FOUND', 'RESERVATION_STATE', 'RETURN_INVALID', 'RETURN_HUB_FULL', 'RETURN_HUB_REQUIRED', 'HUB_NOT_FOUND', 'HUB_STALE']],
  ['ChargingRequestsController_list', 'Authenticated', 'List charging requests with their latest proposal', page(model('ChargingRequest', {schedules: array(schedule)}))],
  ['ChargingRequestsController_create', 'STUDENT', 'Create a charging request and hold its best feasible interval', proposal, 201, ['INVALID_CHARGING_VEHICLE', 'INVALID_CHARGING_NEED', 'INVALID_PARKING_RESERVATION', 'BATTERY_MISMATCH', 'CHARGING_POINT_FAULTED', 'NO_CHARGING_SLOT']],
  ['ChargingRequestsController_replan', 'Authenticated', 'Replace a charging proposal and release its previous interval', proposal, 200, ['CHARGING_REQUEST_NOT_FOUND', 'CHARGING_STATE', 'CHARGING_WINDOW_ENDED', 'NO_CHARGING_SLOT']],
  ['SchedulesController_list', 'Authenticated', 'List scheduled sessions', page(schedule)],
  ['SchedulesController_confirm', 'Authenticated', 'Confirm a charging proposal and any linked parking hold', schedule, 200, ['CHARGING_SCHEDULE_NOT_FOUND', 'CHARGING_STATE', 'CHARGING_POINT_FAULTED', 'RESERVATION_STATE']],
  ['SchedulesController_cancel', 'Authenticated', 'Cancel a charging proposal and any linked parking hold', schedule, 200, ['CHARGING_SCHEDULE_NOT_FOUND', 'CHARGING_STATE', 'CHARGING_SUPERSEDED']],
  ['MonitoringController_get', 'OPERATOR', 'Read the latest monitoring snapshot', dashboard],
  ['MonitoringController_check', 'OPERATOR', 'Recompute overload and stale-data alerts', array(hubSnapshot)],
  ['DashboardController_get', 'OPERATOR', 'Read operational KPIs, incidents and usage counts', dashboard],
  ['DispatchController_list', 'OPERATOR', 'List dispatch orders by status', page(order)],
  ['DispatchController_propose', 'OPERATOR', 'Find eligible source Hubs sorted by distance', object({
    targetFreeSlots: number, sources: array(object({hubId: uuid, code: string, name: string, available: number, distanceKm: {type: 'number'}})),
  }), 200, ['HUB_NOT_FOUND', 'HUB_INACTIVE', 'HUB_STALE']],
  ['DispatchController_detail', 'OPERATOR', 'Read a dispatch order', order, 200, ['DISPATCH_ORDER_NOT_FOUND']],
  ['DispatchController_create', 'OPERATOR', 'Allocate vehicles and destination parking for a dispatch', order, 201, ['INVALID_DISPATCH', 'HUB_NOT_FOUND', 'HUB_STALE', 'DISPATCH_VEHICLES_UNAVAILABLE', 'DISPATCH_DESTINATION_FULL']],
  ['DispatchController_run', 'OPERATOR', 'Execute an order and return its tracked state', order, 200, ['DISPATCH_ORDER_NOT_FOUND']],
  ['IncidentsController_list', 'OPERATOR', 'List incidents by Hub, type or status', page(incident)],
  ['IncidentsController_detail', 'OPERATOR', 'Read an incident', incident, 200, ['INCIDENT_NOT_FOUND']],
  ['IncidentsController_create', 'OPERATOR', 'Report an incident', incident, 201, ['HUB_NOT_FOUND']],
  ['IncidentsController_update', 'OPERATOR', 'Update or resolve an incident', incident, 200, ['INCIDENT_NOT_FOUND', 'INCIDENT_RESOLVED', 'INCIDENT_RESOLUTION_REQUIRED']],
  ['SimulationController_list', 'OPERATOR', 'List saved scenarios', page(model('SimulationScenario'))],
  ['SimulationController_create', 'OPERATOR', 'Run What-if against a consistent snapshot', scenario, 201, ['INVALID_SIMULATION_HUB']],
  ['SimulationController_compare', 'OPERATOR', 'Compare completed reports in the requested order', object({
    items: array(model('SimulationReport', {scenario: object({name: string, parameters: json})})),
  }), 200, ['SIMULATION_REPORT_NOT_FOUND']],
  ['SimulationController_detail', 'OPERATOR', 'Read a scenario and its reports', scenario, 200, ['SIMULATION_NOT_FOUND']],
];

export function completeOpenApi(document: OpenAPIObject, errorModel: Type<unknown>) {
  const operations = new Map<string, OperationObject>();
  for (const path of Object.values(document.paths)) {
    for (const method of ['get', 'post', 'patch'] as const) {
      const operation = path[method];
      if (operation?.operationId) operations.set(operation.operationId, operation);
    }
  }
  for (const [id, role, purpose, schema, status = 200, errors = []] of routes) {
    const operation = operations.get(id);
    if (!operation) throw new Error(`Missing OpenAPI operation ${id}`);
    operation.summary = purpose;
    operation.description = `Access: ${role}.${errors.length ? ` Business codes: ${errors.join(', ')}.` : ''}`;
    if (role !== 'Public') operation.security = [{bearer: []}];
    if (status === 302) delete operation.responses[200];
    operation.responses[status] = schema
      ? {description: purpose, content: {'application/json': {schema}}}
      : {description: 'Redirect to Google authorization', headers: {Location: {schema: {type: 'string', format: 'uri'}}}};
    const responses = new Map<number, string>([[503, 'DATABASE_UNAVAILABLE']]);
    if (operation.parameters?.length || operation.requestBody) responses.set(400, 'VALIDATION_ERROR');
    if (role !== 'Public' || id === 'AuthController_login' || id === 'AuthController_callback') {
      responses.set(401, role === 'Public' ? errors[0] : 'AUTH_REQUIRED');
      responses.set(403, 'ACCOUNT_LOCKED');
    }
    const notFound = errors.find(code => code.endsWith('_NOT_FOUND'));
    if (notFound) responses.set(404, notFound);
    const conflict = errors.find(code => !code.endsWith('_NOT_FOUND') && !code.startsWith('INVALID_') && !code.startsWith('OAUTH_'));
    if (conflict && !id.startsWith('AuthController_')) responses.set(409, conflict);
    if (id === 'AuthController_callback') {
      responses.set(400, 'OAUTH_REJECTED');
      responses.set(401, 'OAUTH_EMAIL_UNVERIFIED');
      responses.set(409, 'OAUTH_ACCOUNT_EXISTS');
      responses.set(502, 'OAUTH_PROVIDER_ERROR');
    }
    if (id.startsWith('AuthController_google') || id === 'AuthController_callback') responses.set(503, 'OAUTH_DISABLED');
    for (const [status, code] of responses) {
      operation.responses[status] = {
        description: code,
        content: {'application/json': {
          schema: {$ref: getSchemaPath(errorModel)},
          example: {statusCode: status, code, message: code.toLowerCase().replaceAll('_', ' '), path: '/api', timestamp: instant.example},
        }},
      };
    }
    operations.delete(id);
  }
  if (operations.size) throw new Error(`OpenAPI response definitions missing for: ${[...operations.keys()].join(', ')}`);
}
