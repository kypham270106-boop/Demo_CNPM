import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IncidentStatus, IncidentType } from '@prisma/client';
import { IsEnum, ValidateIf, IsString, IsUUID, Length } from 'class-validator';
import { Operator } from '../auth/auth.module';
import { Database, Tx } from '../common/database';
import { PageQuery, paginate } from '../common/dto';
import { conflict, missing } from '../common/http';
import { freeSlots, freeVehicles, stale } from '../common/inventory';

export function utilization(total: number, free: number) {
  return total === 0 ? 0 : Math.round((total - free) * 100 / total);
}

export interface HubDataProvider {
  read(hub: {
    id: string; enabled: boolean; vehicles: {id: string; battery: number}[];
  }, now: Date): {seenAt: Date; batteries: {id: string; battery: number}[]} | null;
}

const HUB_PROVIDER = Symbol('HubDataProvider');

@Injectable()
class MockHubDataProvider implements HubDataProvider {
  read(hub: Parameters<HubDataProvider['read']>[0], now: Date) {
    if (!hub.enabled) return null;
    return {seenAt: now, batteries: hub.vehicles.map(vehicle => ({
      id: vehicle.id,
      battery: Math.max(0, vehicle.battery - Number(
        (Math.floor(+now / 900_000) + vehicle.id.charCodeAt(0)) % 4 === 0,
      )),
    }))};
  }
}

@Injectable()
export class HubStateSyncService {
  constructor(@Inject(HUB_PROVIDER) private readonly provider: HubDataProvider) {}
  async sync(tx: Tx, now: Date) {
    const hubs = await tx.hub.findMany({where: {active: true}, orderBy: {id: 'asc'}});
    for (const hub of hubs) {
      const vehicles = await tx.vehicle.findMany({
        where: {
          ...freeVehicles(hub.id, now, new Date('9999-01-01T00:00:00Z')),
          battery: {gte: 16},
          updatedAt: {lte: new Date(+now - 900_000)},
        },
        select: {id: true, battery: true},
      });
      const reading = this.provider.read({id: hub.id, enabled: hub.telemetryEnabled, vehicles}, now);
      if (!reading) continue;
      await tx.hub.update({where: {id: hub.id}, data: {lastSeenAt: reading.seenAt}});
      for (const item of reading.batteries) {
        const previous = vehicles.find(vehicle => vehicle.id === item.id);
        if (previous && previous.battery !== item.battery) {
          await tx.vehicle.update({where: {id: item.id}, data: {battery: item.battery}});
        }
      }
    }
  }
}

@Injectable()
export class MonitoringService {
  constructor(private readonly db: Database) {}

  async snapshot(tx: Tx, now: Date) {
    const hubs = await tx.hub.findMany({orderBy: {code: 'asc'}, include: {_count: {select: {
      vehicles: true, parkingSlots: true, chargingPoints: true,
    }}}});
    const end = new Date(+now + 1);
    return Promise.all(hubs.map(async ({_count, ...hub}) => {
      const [availableVehicles, free, occupancy, points] = await Promise.all([
        tx.vehicle.count({where: freeVehicles(hub.id, now, end)}),
        tx.parkingSlot.count({where: freeSlots(hub.id, now, end)}),
        tx.parkingSlot.count({where: {hubId: hub.id, status: 'OCCUPIED'}}),
        tx.chargingPoint.groupBy({by: ['status'], where: {hubId: hub.id}, _count: {_all: true}}),
      ]);
      const ports = {available: 0, charging: 0, faulted: 0};
      for (const item of points) {
        if (item.status === 'AVAILABLE') ports.available = item._count._all;
        if (item.status === 'CHARGING') ports.charging = item._count._all;
        if (item.status === 'FAULTED') ports.faulted = item._count._all;
      }
      const parkingUtilization = utilization(_count.parkingSlots, free);
      const chargingUtilization = utilization(_count.chargingPoints, ports.available);
      const isStale = stale(hub.lastSeenAt, now);
      return {
        ...hub, stale: isStale, vehicles: {total: _count.vehicles, available: availableVehicles},
        parking: {total: _count.parkingSlots, free, occupied: occupancy, utilizationPercent: parkingUtilization},
        charging: {...ports, total: _count.chargingPoints, utilizationPercent: chargingUtilization},
        overloaded: hub.active && Math.max(parkingUtilization, chargingUtilization) >= hub.overloadThreshold,
      };
    }));
  }

  async scan(tx: Tx, now: Date) {
    const hubs = await this.snapshot(tx, now);
    for (const hub of hubs.filter(item => item.active)) {
      if (hub.stale) {
        await this.alert(tx, hub.id, 'STALE_DATA', {lastSeenAt: hub.lastSeenAt?.toISOString() ?? null});
      }
      if (hub.overloaded) {
        await this.alert(tx, hub.id, 'OVERLOAD', {
          parkingPercent: hub.parking.utilizationPercent, chargingPercent: hub.charging.utilizationPercent,
          threshold: hub.overloadThreshold, verified: !hub.stale,
          severity: Math.max(hub.parking.utilizationPercent, hub.charging.utilizationPercent) >= 100 ? 'critical' : 'warning',
        });
      }
    }
    return hubs;
  }

  private alert(tx: Tx, hubId: string, type: IncidentType, details: { [key: string]: string | number | boolean | null }) {
    const activeKey = `${hubId}:${type}`;
    return tx.incident.upsert({where: {activeKey}, create: {activeKey, hubId, type, details}, update: {details}});
  }

  dashboard() {
    return this.db.$transaction(async tx => {
      const [{now}] = await tx.$queryRaw<{now: Date}[]>`SELECT clock_timestamp() AS now`;
      const hubs = await this.snapshot(tx, now);
      const incidents = await tx.incident.findMany({
        where: {status: {not: 'RESOLVED'}}, orderBy: [{createdAt: 'desc'}, {id: 'asc'}], take: 25,
      });
      const reservationCounts = await tx.reservation.groupBy({by: ['status'], _count: {_all: true}});
      return {
        snapshotAt: now, hubs, incidents: incidents.map(safeIncident),
        totals: hubs.reduce((totals, hub) => ({
          hubs: totals.hubs + 1, vehicles: totals.vehicles + hub.vehicles.total,
          freeSlots: totals.freeSlots + hub.parking.free,
          chargingAvailable: totals.chargingAvailable + hub.charging.available,
          chargingActive: totals.chargingActive + hub.charging.charging,
          chargingFaulted: totals.chargingFaulted + hub.charging.faulted, overloaded: totals.overloaded + Number(hub.overloaded),
        }), {hubs: 0, vehicles: 0, freeSlots: 0, chargingAvailable: 0, chargingActive: 0, chargingFaulted: 0, overloaded: 0}),
        utilization: reservationCounts.map(row => ({status: row.status, count: row._count._all})),
      };
    }, {isolationLevel: 'RepeatableRead', timeout: 15000});
  }

  check() { return this.db.write((tx, now) => this.scan(tx, now)); }
}

class IncidentQuery extends PageQuery {
  @ApiPropertyOptional({enum: IncidentStatus}) @ValidateIf((_, value) => value !== undefined) @IsEnum(IncidentStatus) status?: IncidentStatus;
  @ApiPropertyOptional({enum: IncidentType}) @ValidateIf((_, value) => value !== undefined) @IsEnum(IncidentType) type?: IncidentType;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsUUID() hubId?: string;
}
class NewIncidentDto {
  @ApiProperty() @IsUUID() hubId!: string;
  @ApiProperty() @IsString() @Length(1, 1000) description!: string;
}
class UpdateIncidentDto {
  @ApiProperty({enum: IncidentStatus}) @IsEnum(IncidentStatus) status!: IncidentStatus;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsString() @Length(1, 1000) resolution?: string;
}
function safeIncident<T extends {activeKey: string | null}>(item: T) {
  const {activeKey, ...safe} = item;
  void activeKey;
  return safe;
}

@Injectable()
class IncidentService {
  constructor(private readonly db: Database) {}

  async list(dto: IncidentQuery) {
    const where = {status: dto.status, type: dto.type, hubId: dto.hubId};
    const [items, total] = await this.db.$transaction([
      this.db.incident.findMany({where, ...paginate(dto), orderBy: [{createdAt: 'desc'}, {id: 'asc'}]}),
      this.db.incident.count({where}),
    ]);
    return {items: items.map(safeIncident), total, page: dto.page, limit: dto.limit};
  }
  async detail(id: string) {
    const item = await this.db.incident.findUnique({where: {id}});
    if (!item) throw missing('INCIDENT');
    return safeIncident(item);
  }
  async create(dto: NewIncidentDto) {
    if (!(await this.db.hub.count({where: {id: dto.hubId}}))) throw missing('HUB');
    return safeIncident(await this.db.incident.create({
      data: {hubId: dto.hubId, type: 'MANUAL', details: {description: dto.description}},
    }));
  }
  update(id: string, dto: UpdateIncidentDto) {
    return this.db.write(async tx => {
      const item = await tx.incident.findUnique({where: {id}});
      if (!item) throw missing('INCIDENT');
      if (item.status === 'RESOLVED' && dto.status !== 'RESOLVED') {
        throw conflict('INCIDENT_RESOLVED', 'A resolved incident cannot be reopened');
      }
      if (dto.status === 'RESOLVED' && !dto.resolution?.trim() && !item.resolution) {
        throw conflict('INCIDENT_RESOLUTION_REQUIRED', 'Add a resolution before closing this incident');
      }
      return safeIncident(await tx.incident.update({where: {id}, data: {
        ...dto, activeKey: dto.status === 'RESOLVED' ? null : item.activeKey,
      }}));
    });
  }
}

@ApiTags('monitoring')
@ApiBearerAuth()
@Operator()
@Controller('monitoring')
class MonitoringController {
  constructor(private readonly service: MonitoringService) {}
  @Get() get() { return this.service.dashboard(); }
  @Post('check') @HttpCode(200) check() { return this.service.check(); }
}
@ApiTags('dashboard')
@ApiBearerAuth()
@Operator()
@Controller('dashboard')
class DashboardController {
  constructor(private readonly service: MonitoringService) {}
  @Get() get() { return this.service.dashboard(); }
}
@ApiTags('incidents')
@ApiBearerAuth()
@Operator()
@Controller('incidents')
class IncidentsController {
  constructor(private readonly service: IncidentService) {}
  @Get() list(@Query() dto: IncidentQuery) { return this.service.list(dto); }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) { return this.service.detail(id); }
  @Post() create(@Body() dto: NewIncidentDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateIncidentDto) {
    return this.service.update(id, dto);
  }
}

@Module({
  controllers: [MonitoringController, DashboardController, IncidentsController],
  providers: [HubStateSyncService, MonitoringService, IncidentService, {provide: HUB_PROVIDER, useClass: MockHubDataProvider}],
  exports: [HubStateSyncService, MonitoringService],
})
export class MonitoringModule {}
