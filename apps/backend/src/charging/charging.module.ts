import { Body, Controller, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ChargingRequest, ChargingStatus, Prisma } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsNumber, ValidateIf, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { Actor, CurrentUser, Operator, Student } from '../auth/auth.module';
import { after, config, minutes } from '../common/config';
import { Database, Tx } from '../common/database';
import { PageQuery, paginate, WindowDto, windowDates } from '../common/dto';
import { conflict, error, missing } from '../common/http';
import { assignConfirmationCode, expireReservations, overlap, requireHub, reservationOverlap } from '../common/inventory';
import { estimateBattery, firstGap } from './planner';

class ChargingDto extends WindowDto {
  @ApiProperty() @IsUUID() hubId!: string;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsUUID() vehicleId?: string;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsUUID() reservationId?: string;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsUUID() pointId?: string;
  @ApiPropertyOptional({description: 'Stable alias for a personal vehicle, within this account'})
  @ValidateIf((_, value) => value !== undefined) @IsString() @Length(1, 80) personalVehicleRef?: string;
  @ApiProperty() @IsInt() @Min(0) @Max(99) currentBattery!: number;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsInt() @Min(1) @Max(100) targetBattery?: number;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsInt() @Min(1) @Max(1440) durationMinutes?: number;
  @ApiProperty({example: 0.6}) @IsNumber() @Min(0.05) @Max(30) capacityKwh!: number;
}
class ScheduleQuery extends PageQuery {
  @ApiPropertyOptional({enum: ChargingStatus}) @ValidateIf((_, value) => value !== undefined) @IsEnum(ChargingStatus) status?: ChargingStatus;
}
class PointStateDto {
  @ApiProperty({enum: ['AVAILABLE', 'FAULTED']})
  @IsIn(['AVAILABLE', 'FAULTED']) status!: 'AVAILABLE' | 'FAULTED';
}
export const activeCharging = ['PROPOSED', 'CONFIRMED', 'CHARGING'] as const;

function publicSchedule<T extends {vehicleKey: string}>(schedule: T) {
  const {vehicleKey, ...safe} = schedule;
  void vehicleKey;
  return safe;
}

@Injectable()
export class SmartChargingService {
  constructor(private readonly db: Database) {}

  async plan(tx: Tx, request: ChargingRequest, now: Date) {
    const {id, hubId, currentBattery, targetBattery, durationMinutes, capacityKwh, vehicleId, pointId, reservationId} = request;
    const held = reservationId ? await tx.reservation.findUnique({where: {id: reservationId}}) : null;
    if (held && !['HELD', 'CONFIRMED'].includes(held.status)) {
      throw conflict('RESERVATION_STATE', 'The parking reservation is no longer active');
    }
    const startsAt = new Date(Math.max(+request.earliestAt, +now, +(held?.startsAt ?? now)));
    const endsAt = new Date(Math.min(+request.latestAt, +(held?.endsAt ?? request.latestAt)));
    if (endsAt <= startsAt) throw conflict('CHARGING_WINDOW_ENDED', 'No time remains in the requested window');
    const vehicleKey = vehicleId ?? `personal:${request.userId}:${request.personalVehicleRef}`;
    if (pointId && await tx.chargingPoint.count({where: {id: pointId, hubId, status: 'FAULTED'}})) {
      throw conflict('CHARGING_POINT_FAULTED', 'The charging point is faulty');
    }
    const points = await tx.chargingPoint.findMany({
      where: {id: pointId ?? undefined, hubId, status: {not: 'FAULTED'}, slotId: held?.slotId ?? undefined},
      include: {slot: {include: {
        reservations: {where: {id: {not: reservationId ?? undefined}, ...reservationOverlap(startsAt, endsAt)}, select: {startsAt: true, endsAt: true}},
        destinations: {where: {order: {status: {in: ['PENDING', 'IN_PROGRESS']}},}, select: {orderId: true}},
        vehicle: {select: {id: true}},
      }}},
      orderBy: {code: 'asc'},
    });
    const existing = await tx.chargingSchedule.findMany({
      where: {status: {in: [...activeCharging]}, AND: [
        {OR: [{vehicleKey}, {point: {hubId}}]},
        {OR: [overlap(startsAt, endsAt), {status: 'CHARGING', point: {hubId}}]},
      ]},
      select: {pointId: true, vehicleKey: true, startsAt: true, endsAt: true},
    });
    const reservations = vehicleId ? await tx.reservation.findMany({
      where: {vehicleId, ...reservationOverlap(startsAt, endsAt)}, select: {startsAt: true, endsAt: true},
    }) : [];
    const options = points.flatMap(point => {
      if (point.status === 'CHARGING' && !existing.some(item => item.pointId === point.id)) return [];
      if (point.slot.destinations.length || point.slot.status === 'UNAVAILABLE') return [];
      if (point.slot.vehicle && point.slot.vehicle.id !== vehicleId) return [];
      if (vehicleId && point.slot.vehicle?.id !== vehicleId) return [];
      const blocked = [
        ...point.slot.reservations, ...reservations,
        ...existing.filter(item => item.pointId === point.id || item.vehicleKey === vehicleKey),
      ];
      const targetMinutes = targetBattery === null ? Infinity :
        Math.ceil(capacityKwh * (targetBattery - currentBattery) * 60 / (point.powerKw * 100));
      const desired = Math.min(durationMinutes ?? 1440, targetMinutes);
      // A shorter feasible session is an explicit adjusted proposal.
      for (let length = Math.min(desired, Math.floor((+endsAt - +startsAt) / minutes(1))); length >= 1; length--) {
        const gap = firstGap({startsAt, endsAt}, blocked, minutes(length));
        if (!gap) continue;
        return [{...gap, pointId: point.id, estimatedBattery: estimateBattery(currentBattery, capacityKwh, point.powerKw, minutes(length)),
          adjusted: length < desired || (targetBattery !== null && estimateBattery(currentBattery, capacityKwh, point.powerKw, minutes(length)) < targetBattery),
          length}];
      }
      return [];
    }).sort((a, b) => Number(a.adjusted) - Number(b.adjusted) || +a.endsAt - +b.endsAt || b.estimatedBattery - a.estimatedBattery);
    const best = options[0];
    if (!best) throw conflict('NO_CHARGING_SLOT', 'No feasible charge interval is available at this Hub');
    const {adjusted, length, ...data} = best;
    return {
      ...await tx.chargingSchedule.create({data: {
        ...data, adjusted, requestId: id, vehicleKey, expiresAt: new Date(Math.min(
          +data.endsAt, +after(now, minutes(config().holdMinutes)), +(held?.status === 'HELD' ? held.holdExpiresAt : data.endsAt),
        )),
      }}),
      durationMinutes: length,
    };
  }

  async tick(tx: Tx, now: Date) {
    const expired = await tx.chargingSchedule.updateManyAndReturn({
      where: {status: 'PROPOSED', expiresAt: {lte: now}}, data: {status: 'NEEDS_REPLAN'}, select: {requestId: true},
    });
    if (expired.length) {
      await tx.chargingRequest.updateMany({
        where: {id: {in: expired.map(row => row.requestId)}, status: 'PROPOSED'}, data: {status: 'NEEDS_REPLAN'},
      });
    }
    const finished = await tx.chargingSchedule.findMany({
      where: {status: {in: ['CHARGING', 'CONFIRMED']}, endsAt: {lte: now}}, include: {request: true},
    });
    for (const item of finished) {
      const status = item.status === 'CHARGING' ? 'COMPLETED' : 'NEEDS_REPLAN';
      await tx.chargingSchedule.update({where: {id: item.id}, data: {status}});
      await tx.chargingRequest.update({where: {id: item.requestId}, data: {status}});
      if (item.status === 'CHARGING') {
        await tx.chargingPoint.updateMany({where: {id: item.pointId, status: 'CHARGING'}, data: {status: 'AVAILABLE'}});
        if (item.request.vehicleId) {
          await tx.vehicle.update({where: {id: item.request.vehicleId}, data: {battery: item.estimatedBattery}});
        }
      }
    }
    const due = await tx.chargingSchedule.findMany({
      where: {status: 'CONFIRMED', startsAt: {lte: now}, endsAt: {gt: now}},
      include: {point: true, request: {include: {reservation: true}}},
    });
    for (const item of due) {
      const ready = item.point.status === 'AVAILABLE'
        && (!item.request.reservation || item.request.reservation.status === 'CONFIRMED');
      const status = ready ? 'CHARGING' : 'NEEDS_REPLAN';
      await tx.chargingSchedule.update({where: {id: item.id}, data: {status}});
      await tx.chargingRequest.update({where: {id: item.requestId}, data: {status}});
      if (ready) await tx.chargingPoint.update({where: {id: item.pointId}, data: {status: 'CHARGING'}});
    }
  }

  pointStatus(id: string, dto: PointStateDto) {
    return this.db.write(async tx => {
      const point = await tx.chargingPoint.findUnique({where: {id}});
      if (!point) throw missing('CHARGING_POINT');
      if (dto.status === 'AVAILABLE' && point.status === 'CHARGING') {
        throw conflict('CHARGING_ACTIVE', 'A charging session is active');
      }
      const updated = await tx.chargingPoint.update({where: {id}, data: dto});
      if (dto.status === 'FAULTED') {
        const affected = await tx.chargingSchedule.updateManyAndReturn({
          where: {pointId: id, status: {in: [...activeCharging]}}, data: {status: 'NEEDS_REPLAN'}, select: {requestId: true},
        });
        await tx.chargingRequest.updateMany({
          where: {id: {in: affected.map(row => row.requestId)}, status: {in: [...activeCharging]}}, data: {status: 'NEEDS_REPLAN'},
        });
        await tx.incident.upsert({
          where: {activeKey: `charger:${id}`}, update: {},
          create: {activeKey: `charger:${id}`, hubId: point.hubId, pointId: id, type: 'CHARGER_FAULT', details: {code: point.code}},
        });
      }
      return updated;
    });
  }
}

@Injectable()
class ChargingRequestService {
  constructor(private readonly db: Database, private readonly smart: SmartChargingService) {}

  create(actor: Actor, dto: ChargingDto) {
    const {startsAt, endsAt} = windowDates(dto);
    if (Boolean(dto.vehicleId) === Boolean(dto.personalVehicleRef)) {
      throw error(400, 'INVALID_CHARGING_VEHICLE', 'Provide a shared vehicle or personal vehicle reference');
    }
    if ((!dto.targetBattery && !dto.durationMinutes) || (dto.targetBattery && dto.targetBattery <= dto.currentBattery)) {
      throw error(400, 'INVALID_CHARGING_NEED', 'Provide a duration or a target greater than the current battery');
    }
    return this.db.write(async (tx, now) => {
      await this.smart.tick(tx, now);
      await expireReservations(tx, now);
      await requireHub(tx, dto.hubId, now);
      if (endsAt <= now) throw error(400, 'INVALID_WINDOW', 'The end must be in the future');
      if (dto.pointId && !(await tx.chargingPoint.findFirst({where: {id: dto.pointId, hubId: dto.hubId}}))) {
        throw missing('CHARGING_POINT');
      }
      if (dto.reservationId) {
        const item = await tx.reservation.findFirst({where: {
          id: dto.reservationId, userId: actor.id, hubId: dto.hubId, slotId: {not: null}, status: {in: ['HELD', 'CONFIRMED']},
        }});
        if (!item || dto.vehicleId) throw conflict('INVALID_PARKING_RESERVATION', 'A personal vehicle requires an active parking reservation at this Hub');
      }
      if (dto.vehicleId) {
        const vehicle = await tx.vehicle.findFirst({where: {id: dto.vehicleId, hubId: dto.hubId, status: 'AVAILABLE'}});
        if (!vehicle) throw conflict('VEHICLE_UNAVAILABLE', 'Shared vehicle is unavailable');
        if (vehicle.battery !== dto.currentBattery) throw conflict('BATTERY_MISMATCH', 'Use the current recorded battery level');
      }
      const request = await tx.chargingRequest.create({data: {
        userId: actor.id, hubId: dto.hubId, vehicleId: dto.vehicleId, pointId: dto.pointId, reservationId: dto.reservationId,
        personalVehicleRef: dto.personalVehicleRef?.toLowerCase(), currentBattery: dto.currentBattery,
        targetBattery: dto.targetBattery, durationMinutes: dto.durationMinutes, capacityKwh: dto.capacityKwh,
        earliestAt: startsAt, latestAt: endsAt,
      }});
      return {request, proposal: publicSchedule(await this.smart.plan(tx, request, now))};
    });
  }

  async list(actor: Actor, dto: ScheduleQuery, schedules: boolean) {
    const owner = actor.role === 'OPERATOR' ? undefined : actor.id;
    const page = {page: dto.page, limit: dto.limit};
    const args = {...paginate(dto), orderBy: [{createdAt: 'desc' as const}, {id: 'asc' as const}]};
    if (schedules) {
      const where: Prisma.ChargingScheduleWhereInput = {status: dto.status, request: {userId: owner}};
      const [items, total] = await this.db.$transaction([
        this.db.chargingSchedule.findMany({where, ...args}), this.db.chargingSchedule.count({where}),
      ]);
      return {items: items.map(publicSchedule), total, ...page};
    }
    const where = {status: dto.status, userId: owner};
    const [items, total] = await this.db.$transaction([
      this.db.chargingRequest.findMany({where, ...args, include: {schedules: {orderBy: {createdAt: 'desc'}, take: 1}}}),
      this.db.chargingRequest.count({where}),
    ]);
    return {items: items.map(item => ({...item, schedules: item.schedules.map(publicSchedule)})), total, ...page};
  }

  replan(actor: Actor, id: string, dto: WindowDto) {
    const {startsAt, endsAt} = windowDates(dto);
    return this.db.write(async (tx, now) => {
      await this.smart.tick(tx, now);
      await expireReservations(tx, now);
      const current = await tx.chargingRequest.findFirst({where: {id, userId: actor.role === 'OPERATOR' ? undefined : actor.id}});
      if (!current) throw missing('CHARGING_REQUEST');
      if (!['PROPOSED', 'CONFIRMED', 'NEEDS_REPLAN'].includes(current.status)) {
        throw conflict('CHARGING_STATE', 'The request cannot be replanned');
      }
      await requireHub(tx, current.hubId, now);
      await tx.chargingSchedule.updateMany({
        where: {requestId: id, status: {in: ['PROPOSED', 'CONFIRMED']}}, data: {status: 'CANCELLED'},
      });
      const request = await tx.chargingRequest.update({
        where: {id}, data: {earliestAt: startsAt, latestAt: endsAt, status: 'PROPOSED', pointId: null},
      });
      return {request, proposal: publicSchedule(await this.smart.plan(tx, request, now))};
    });
  }

  change(actor: Actor, id: string, confirm: boolean) {
    return this.db.write(async (tx, now) => {
      await this.smart.tick(tx, now);
      await expireReservations(tx, now);
      const item = await tx.chargingSchedule.findFirst({
        where: {id, request: {userId: actor.role === 'OPERATOR' ? undefined : actor.id}},
        include: {request: {include: {reservation: true}}, point: true},
      });
      if (!item) throw missing('CHARGING_SCHEDULE');
      const status = confirm ? 'CONFIRMED' : 'CANCELLED';
      if (item.status === status) {
        const {request, point, ...schedule} = item;
        void request;
        void point;
        return publicSchedule(schedule);
      }
      if (!confirm && item.status === 'NEEDS_REPLAN' && await tx.chargingSchedule.count({
        where: {requestId: item.requestId, id: {not: id}, status: {in: [...activeCharging]}},
      })) {
        throw conflict('CHARGING_SUPERSEDED', 'Use the current schedule for this request');
      }
      if (confirm ? item.status !== 'PROPOSED' : !['PROPOSED', 'CONFIRMED', 'NEEDS_REPLAN'].includes(item.status)) {
        throw conflict('CHARGING_STATE', 'The schedule cannot make this transition');
      }
      const request = item.request;
      if (confirm) {
        await requireHub(tx, request.hubId, now);
        if (item.point.status === 'FAULTED') throw conflict('CHARGING_POINT_FAULTED', 'The charging point is faulty');
      }
      if (request.reservation) {
        const hold = request.reservation;
        if (confirm && !['HELD', 'CONFIRMED'].includes(hold.status)) {
          throw conflict('RESERVATION_STATE', 'The linked parking hold has expired or been cancelled');
        }
        await tx.reservation.updateMany({
          where: {id: hold.id, status: {in: ['HELD', 'CONFIRMED']}}, data: {status,
            confirmationCode: confirm ? (hold.confirmationCode ?? assignConfirmationCode()) : undefined},
        });
      }
      await tx.chargingRequest.update({where: {id: item.requestId}, data: {status}});
      return publicSchedule(await tx.chargingSchedule.update({where: {id}, data: {status}}));
    });
  }
}

@ApiTags('charging-requests')
@ApiBearerAuth()
@Controller('charging-requests')
class ChargingRequestsController {
  constructor(private readonly service: ChargingRequestService) {}
  @Get() list(@CurrentUser() user: Actor, @Query() dto: ScheduleQuery) { return this.service.list(user, dto, false); }
  @Student() @Post() create(@CurrentUser() user: Actor, @Body() dto: ChargingDto) { return this.service.create(user, dto); }
  @Post(':id/replan') @HttpCode(200) replan(@CurrentUser() user: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WindowDto) {
    return this.service.replan(user, id, dto);
  }
}
@ApiTags('charging-schedules')
@ApiBearerAuth()
@Controller('charging-schedules')
class SchedulesController {
  constructor(private readonly service: ChargingRequestService) {}
  @Get() list(@CurrentUser() user: Actor, @Query() dto: ScheduleQuery) { return this.service.list(user, dto, true); }
  @Post(':id/confirm') @HttpCode(200) confirm(@CurrentUser() user: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.change(user, id, true);
  }
  @Post(':id/cancel') @HttpCode(200) cancel(@CurrentUser() user: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.change(user, id, false);
  }
}
@ApiTags('charging-points')
@ApiBearerAuth()
@Operator()
@Controller('charging-points')
class PointControl {
  constructor(private readonly service: SmartChargingService) {}
  @Patch(':id/status') status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PointStateDto) {
    return this.service.pointStatus(id, dto);
  }
}

@Module({
  controllers: [ChargingRequestsController, SchedulesController, PointControl],
  providers: [ChargingRequestService, SmartChargingService], exports: [SmartChargingService],
})
export class ChargingModule {}
