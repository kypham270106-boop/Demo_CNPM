import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { Prisma, VehicleStatus, VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsObject, ValidateIf, IsString,
  IsUUID, Length, Max, Min, ValidateNested,
} from 'class-validator';
import { Actor, CurrentUser, Operator } from '../auth/auth.module';
import { Database } from '../common/database';
import { PageQuery, paginate, WindowDto, windowDates } from '../common/dto';
import { conflict, error, missing } from '../common/http';
import { expireReservations, freeSlots, freeVehicles, requireHub, reservationOverlap, stale } from '../common/inventory';
import { distanceKm, routeDistanceKm } from './geo';

class CoordinateDto {
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) longitude!: number;
}
class SearchDto {
  @ApiPropertyOptional({type: CoordinateDto}) @ValidateIf((_, value) => value !== undefined) @IsObject() @ValidateNested() @Type(() => CoordinateDto) gps?: CoordinateDto;
  @ApiPropertyOptional({type: [CoordinateDto]}) @ValidateIf((_, value) => value !== undefined) @IsArray() @ArrayMinSize(2) @ArrayMaxSize(250)
  @ValidateNested({each: true}) @Type(() => CoordinateDto) route?: CoordinateDto[];
  @ApiProperty({example: 3}) @IsNumber() @Min(0.05) @Max(100) radiusKm!: number;
}
class ParkingAlternativesDto extends WindowDto {
  @ApiPropertyOptional({enum: ['true', 'false']})
  @ValidateIf((_, value) => value !== undefined) @IsIn(['true', 'false']) charging?: string;
}
class HubDto extends CoordinateDto {
  @ApiProperty() @IsString() @Length(1, 32) code!: string;
  @ApiProperty() @IsString() @Length(1, 120) name!: string;
  @ApiProperty() @IsString() @Length(1, 240) address!: string;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsBoolean() telemetryEnabled?: boolean;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsInt() @Min(1) @Max(100) overloadThreshold?: number;
}
class HubPatch extends PartialType(HubDto, {skipNullProperties: false}) {}
class VehicleQuery extends PageQuery {
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsUUID() hubId?: string;
  @ApiPropertyOptional({enum: VehicleType}) @ValidateIf((_, value) => value !== undefined) @IsEnum(VehicleType) type?: VehicleType;
  @ApiPropertyOptional({enum: VehicleStatus}) @ValidateIf((_, value) => value !== undefined) @IsEnum(VehicleStatus) status?: VehicleStatus;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @Type(() => Number) @IsInt() @Min(0) @Max(100) minBattery?: number;
}
class VehicleDto {
  @ApiProperty() @IsString() @Length(1, 32) code!: string;
  @ApiProperty({enum: VehicleType}) @IsEnum(VehicleType) type!: VehicleType;
  @ApiProperty() @IsUUID() hubId!: string;
  @ApiProperty() @IsUUID() slotId!: string;
  @ApiProperty() @IsInt() @Min(0) @Max(100) battery!: number;
}
class VehiclePatch {
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsInt() @Min(0) @Max(100) battery?: number;
  @ApiPropertyOptional({enum: ['AVAILABLE', 'MAINTENANCE']})
  @ValidateIf((_, value) => value !== undefined) @IsIn(['AVAILABLE', 'MAINTENANCE']) status?: 'AVAILABLE' | 'MAINTENANCE';
}
class AssetQuery extends PageQuery {
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsUUID() hubId?: string;
}
class SlotDto {
  @ApiProperty() @IsUUID() hubId!: string;
  @ApiProperty() @IsString() @Length(1, 32) code!: string;
}
class PointDto extends SlotDto {
  @ApiProperty() @IsUUID() slotId!: string;
  @ApiProperty() @IsNumber() @Min(0.05) @Max(25) powerKw!: number;
}

@Injectable()
class HubsService {
  constructor(private readonly db: Database) {}

  async list(query: PageQuery) {
    const where: Prisma.HubWhereInput = { OR: query.q ? [
      {name: {contains: query.q, mode: 'insensitive'}}, {code: {contains: query.q, mode: 'insensitive'}},
    ] : undefined };
    const [items, total] = await this.db.$transaction([
      this.db.hub.findMany({where, ...paginate(query), orderBy: {code: 'asc'}}), this.db.hub.count({where}),
    ]);
    return {items: items.map(hub => ({...hub, stale: stale(hub.lastSeenAt, new Date())})), total, page: query.page, limit: query.limit};
  }

  async search(actor: Actor, dto: SearchDto) {
    if (Boolean(dto.gps) === Boolean(dto.route)) throw error(400, 'INVALID_SEARCH', 'Provide either GPS or a route');
    const hubs = await this.db.hub.findMany({where: {active: true}, include: {
      _count: {select: {
        vehicles: {where: {
          status: 'AVAILABLE', battery: {gte: 15}, reservations: {none: {OR: [
            {status: 'HELD', holdExpiresAt: {gt: new Date()}, startsAt: {lte: new Date()}, endsAt: {gt: new Date()}},
            {status: 'CONFIRMED', pickupBy: {gt: new Date()}, startsAt: {lte: new Date()}, endsAt: {gt: new Date()}},
          ]}},
        }},
        parkingSlots: {where: {status: 'FREE'}},
        chargingPoints: {where: {status: 'AVAILABLE'}},
      }},
    }});
    const items = hubs.map(({_count, ...hub}) => ({
      ...hub, stale: stale(hub.lastSeenAt, new Date()), counts: _count,
      distanceKm: dto.gps ? distanceKm(dto.gps, hub) : routeDistanceKm(hub, dto.route!),
    })).filter(hub => hub.distanceKm <= dto.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm || a.code.localeCompare(b.code));
    await this.db.searchHistory.create({data: {userId: actor.id, query: {radiusKm: dto.radiusKm, gps: dto.gps ? {...dto.gps} : null, route: dto.route?.map(point => ({...point})) ?? null}}});
    return {items, suggestedRadiusKm: items.length || dto.radiusKm === 100 ? null : Math.min(100, dto.radiusKm * 2)};
  }

  async detail(actor: Actor, id: string) {
    const hub = await this.db.hub.findUnique({where: {id}, include: {
      vehicles: {orderBy: {code: 'asc'}, where: actor.role === 'STUDENT' ? {battery: {gte: 15}} : undefined},
      parkingSlots: {orderBy: {code: 'asc'}}, chargingPoints: {orderBy: {code: 'asc'}},
    }});
    if (!hub) throw missing('HUB');
    await this.db.searchHistory.create({data: {userId: actor.id, hubId: id, query: {kind: 'detail'}}});
    return {...hub, stale: stale(hub.lastSeenAt, new Date())};
  }

  availability(id: string, dto: WindowDto) {
    const {startsAt, endsAt} = windowDates(dto);
    return this.db.write(async (tx, now) => {
      await requireHub(tx, id, now);
      if (endsAt <= now) throw error(400, 'INVALID_WINDOW', 'The end must be in the future');
      await expireReservations(tx, now);
      const vehicles = await tx.vehicle.findMany({where: freeVehicles(id, startsAt, endsAt), orderBy: {code: 'asc'}});
      const parkingSlots = await tx.parkingSlot.findMany({
        where: freeSlots(id, startsAt, endsAt), include: {point: true}, orderBy: {code: 'asc'},
      });
      return {vehicles, parkingSlots, chargingPoints: parkingSlots.flatMap(slot =>
        slot.point?.status === 'AVAILABLE' ? [slot.point] : [])};
    });
  }

  parkingAlternatives(id: string, dto: ParkingAlternativesDto) {
    const {startsAt, endsAt} = windowDates(dto);
    return this.db.write(async (tx, now) => {
      const origin = await tx.hub.findUnique({where: {id}});
      if (!origin) throw missing('HUB');
      if (endsAt <= now) throw error(400, 'INVALID_WINDOW', 'The end must be in the future');
      await expireReservations(tx, now);
      const charging = dto.charging === 'true' ? {point: {status: 'AVAILABLE' as const}} : {};
      const hubs = await tx.hub.findMany({where: {active: true, id: {not: id}}});
      const nearby = [];
      for (const hub of hubs) {
        if (stale(hub.lastSeenAt, now)) continue;
        const slots = await tx.parkingSlot.findMany({
          where: {...freeSlots(hub.id, startsAt, endsAt), ...charging}, select: {id: true}, orderBy: {code: 'asc'},
        });
        if (slots.length) nearby.push({hubId: hub.id, code: hub.code, distanceKm: distanceKm(hub, origin), slotIds: slots.map(slot => slot.id)});
      }
      const candidates = new Set<number>([Math.max(+now, +startsAt)]);
      const cutoff = new Date(Math.max(+now, +startsAt) + 86400_000);
      let nextWindow: {startsAt: Date; endsAt: Date; slotId: string} | null = null;
      if (origin.active && !stale(origin.lastSeenAt, now)) {
        const sameHubSlots = await tx.parkingSlot.findMany({
          where: {hubId: id, status: 'FREE', ...charging},
          include: {
            reservations: {where: reservationOverlap(startsAt, cutoff), select: {endsAt: true}},
            point: {include: {schedules: {where: {
              status: {in: ['PROPOSED', 'CONFIRMED', 'CHARGING']}, endsAt: {gt: startsAt, lte: cutoff},
            }, select: {endsAt: true}}}},
          },
        });
        for (const slot of sameHubSlots) {
          for (const allocation of [...slot.reservations, ...(slot.point?.schedules ?? [])]) {
            if (allocation.endsAt <= cutoff) candidates.add(+allocation.endsAt);
          }
        }
        for (const start of [...candidates].sort((a, b) => a - b)) {
          const begins = new Date(start);
          const finishes = new Date(start + (+endsAt - +startsAt));
          const slot = await tx.parkingSlot.findFirst({
            where: {...freeSlots(id, begins, finishes), ...charging}, select: {id: true}, orderBy: {code: 'asc'},
          });
          if (slot) {
            nextWindow = {startsAt: begins, endsAt: finishes, slotId: slot.id};
            break;
          }
        }
      }
      return {nearby: nearby.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 5), nextWindow};
    });
  }

  create(dto: HubDto) {
    return this.db.hub.create({data: {...dto, lastSeenAt: dto.telemetryEnabled === false ? null : new Date()}});
  }
  update(id: string, dto: HubPatch) {
    return this.db.write(tx => tx.hub.update({where: {id}, data: dto}));
  }

  async vehicles(actor: Actor, query: VehicleQuery) {
    const {hubId, type, status, q} = query;
    const where: Prisma.VehicleWhereInput = {
      hubId, type, status, battery: {gte: Math.max(query.minBattery ?? 0, actor.role === 'STUDENT' ? 15 : 0)},
      code: q ? {contains: q, mode: 'insensitive'} : undefined,
    };
    const [items, total] = await this.db.$transaction([
      this.db.vehicle.findMany({where, ...paginate(query), orderBy: {code: 'asc'}}), this.db.vehicle.count({where}),
    ]);
    return {items, total, page: query.page, limit: query.limit};
  }

  addVehicle(dto: VehicleDto) {
    return this.db.write(async (tx, now) => {
      await requireHub(tx, dto.hubId, now);
      const slot = await tx.parkingSlot.findFirst({
        where: {id: dto.slotId, ...freeSlots(dto.hubId, now, new Date('9999-01-01T00:00:00Z'))},
      });
      if (!slot) throw conflict('SLOT_UNAVAILABLE', 'The parking slot cannot be assigned');
      await tx.parkingSlot.update({where: {id: slot.id}, data: {status: 'OCCUPIED'}});
      return tx.vehicle.create({data: dto});
    });
  }

  editVehicle(id: string, dto: VehiclePatch) {
    return this.db.write(async (tx, now) => {
      const vehicle = await tx.vehicle.findUnique({where: {id}, include: {
        reservations: {where: reservationOverlap(now, new Date('9999-01-01T00:00:00Z')), take: 1},
        dispatches: {where: {order: {status: {in: ['PENDING', 'IN_PROGRESS']}}}, take: 1},
        charging: {where: {status: {in: ['PROPOSED', 'CONFIRMED', 'CHARGING']}}, take: 1},
      }});
      if (!vehicle) throw missing('VEHICLE');
      if (!['AVAILABLE', 'MAINTENANCE'].includes(vehicle.status) || vehicle.reservations.length || vehicle.dispatches.length || vehicle.charging.length) {
        throw conflict('VEHICLE_BUSY', 'Vehicle has an active operation');
      }
      return tx.vehicle.update({where: {id}, data: dto});
    });
  }

  async assets(kind: 'slots' | 'points', query: AssetQuery) {
    const where = {hubId: query.hubId, code: query.q ? {contains: query.q, mode: 'insensitive' as const} : undefined};
    const args = {where, ...paginate(query), orderBy: [{code: 'asc' as const}, {id: 'asc' as const}]};
    const [items, total] = kind === 'slots'
      ? await this.db.$transaction([this.db.parkingSlot.findMany(args), this.db.parkingSlot.count({where})])
      : await this.db.$transaction([this.db.chargingPoint.findMany(args), this.db.chargingPoint.count({where})]);
    return {items, total, page: query.page, limit: query.limit};
  }
  addSlot(dto: SlotDto) {
    return this.db.parkingSlot.create({data: dto});
  }
  addPoint(dto: PointDto) {
    return this.db.write(async tx => {
      if (!(await tx.parkingSlot.findFirst({where: {id: dto.slotId, hubId: dto.hubId}}))) throw missing('PARKING_SLOT');
      return tx.chargingPoint.create({data: dto});
    });
  }
  async history(actor: Actor, query: PageQuery) {
    const where = {userId: actor.id};
    const [items, total] = await this.db.$transaction([
      this.db.searchHistory.findMany({where, ...paginate(query), orderBy: [{createdAt: 'desc'}, {id: 'asc'}]}),
      this.db.searchHistory.count({where}),
    ]);
    return {items, total, page: query.page, limit: query.limit};
  }
}

@ApiTags('hubs')
@ApiBearerAuth()
@Controller('hubs')
class HubsController {
  constructor(private readonly service: HubsService) {}
  @Get() list(@Query() query: PageQuery) { return this.service.list(query); }
  @Post('search') find(@CurrentUser() actor: Actor, @Body() dto: SearchDto) { return this.service.search(actor, dto); }
  @Get('search-history') history(@CurrentUser() actor: Actor, @Query() query: PageQuery) { return this.service.history(actor, query); }
  @Get(':id') detail(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.service.detail(actor, id); }
  @Get(':id/availability') availability(@Param('id', ParseUUIDPipe) id: string, @Query() dto: WindowDto) {
    return this.service.availability(id, dto);
  }
  @Get(':id/parking-alternatives') alternatives(@Param('id', ParseUUIDPipe) id: string, @Query() dto: ParkingAlternativesDto) {
    return this.service.parkingAlternatives(id, dto);
  }
  @Operator() @Post() create(@Body() dto: HubDto) { return this.service.create(dto); }
  @Operator() @Patch(':id') patch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: HubPatch) {
    return this.service.update(id, dto);
  }
}

@ApiTags('vehicles')
@ApiBearerAuth()
@Controller('vehicles')
class VehicleController {
  constructor(private readonly service: HubsService) {}
  @Get() list(@CurrentUser() actor: Actor, @Query() query: VehicleQuery) { return this.service.vehicles(actor, query); }
  @Operator() @Post() create(@Body() dto: VehicleDto) { return this.service.addVehicle(dto); }
  @Operator() @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VehiclePatch) {
    return this.service.editVehicle(id, dto);
  }
}

@ApiTags('parking-slots')
@ApiBearerAuth()
@Controller('parking-slots')
class SlotsController {
  constructor(private readonly service: HubsService) {}
  @Get() list(@Query() query: AssetQuery) { return this.service.assets('slots', query); }
  @Operator() @Post() create(@Body() dto: SlotDto) { return this.service.addSlot(dto); }
}

@ApiTags('charging-points')
@ApiBearerAuth()
@Controller('charging-points')
class PointsController {
  constructor(private readonly service: HubsService) {}
  @Get() list(@Query() query: AssetQuery) { return this.service.assets('points', query); }
  @Operator() @Post() create(@Body() dto: PointDto) { return this.service.addPoint(dto); }
}

@Module({controllers: [HubsController, VehicleController, SlotsController, PointsController], providers: [HubsService]})
export class HubsModule {}
