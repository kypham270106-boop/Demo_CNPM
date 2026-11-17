import { Body, Controller, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Prisma, ReservationStatus } from '@prisma/client';
import { IsEnum, IsNumber, ValidateIf, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Actor, CurrentUser, Student } from '../auth/auth.module';
import { after, config, minutes } from '../common/config';
import { Database, Tx } from '../common/database';
import { PageQuery, paginate, WindowDto, windowDates } from '../common/dto';
import { conflict, error, missing } from '../common/http';
import { assignConfirmationCode, expireReservations, freeSlots, freeVehicles, requireHub } from '../common/inventory';
import { distanceKm } from '../hubs/geo';

class HoldDto extends WindowDto {
  @ApiProperty() @IsUUID() hubId!: string;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsUUID() vehicleId?: string;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsUUID() slotId?: string;
}
class PickupDto {
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) longitude!: number;
}
class ReturnDto {
  @ApiProperty() @IsUUID() hubId!: string;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(500) condition?: string;
}
class ReservationQuery extends PageQuery {
  @ApiPropertyOptional({enum: ReservationStatus}) @ValidateIf((_, value) => value !== undefined) @IsEnum(ReservationStatus) status?: ReservationStatus;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsUUID() hubId?: string;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsUUID() userId?: string;
}
const farFuture = new Date('9999-01-01T00:00:00Z');

@Injectable()
class ReservationsService {
  constructor(private readonly db: Database) {}

  private async owned(tx: Tx, actor: Actor, id: string) {
    const item = await tx.reservation.findFirst({where: {id, userId: actor.role === 'OPERATOR' ? undefined : actor.id}});
    if (!item) throw missing('RESERVATION');
    return item;
  }

  hold(actor: Actor, dto: HoldDto) {
    const {startsAt, endsAt} = windowDates(dto);
    if (Boolean(dto.vehicleId) === Boolean(dto.slotId)) {
      throw error(400, 'INVALID_RESOURCE', 'Select exactly one vehicle or parking slot');
    }
    return this.db.write(async (tx, now) => {
      if (startsAt.getTime() < now.getTime() - 60_000 || endsAt <= now) {
        throw error(400, 'INVALID_WINDOW', 'Start must be in the future or within the last minute');
      }
      await expireReservations(tx, now);
      await requireHub(tx, dto.hubId, now);
      const resource = dto.vehicleId
        ? await tx.vehicle.findFirst({where: {id: dto.vehicleId, ...freeVehicles(dto.hubId, startsAt, endsAt)}})
        : await tx.parkingSlot.findFirst({where: {id: dto.slotId, ...freeSlots(dto.hubId, startsAt, endsAt)}});
      if (!resource) throw conflict('RESOURCE_UNAVAILABLE', 'The selected resource is unavailable for this window');
      const holdExpiresAt = new Date(Math.min(+endsAt, +after(now, minutes(config().holdMinutes))));
      return tx.reservation.create({
        data: {userId: actor.id, hubId: dto.hubId, vehicleId: dto.vehicleId, slotId: dto.slotId, startsAt, endsAt, holdExpiresAt},
      });
    });
  }

  confirm(actor: Actor, id: string) {
    return this.db.write(async (tx, now) => {
      await expireReservations(tx, now);
      const item = await this.owned(tx, actor, id);
      if (item.status === 'CONFIRMED') return item;
      this.assertState(item.status, 'HELD');
      await requireHub(tx, item.hubId, now);
      if (await tx.chargingRequest.findUnique({where: {reservationId: id}, select: {id: true}})) {
        throw conflict('CHARGING_CONFIRMATION_REQUIRED', 'Confirm the linked charging proposal to book both resources');
      }
      const pickupBy = item.vehicleId ? new Date(Math.min(+item.endsAt, +after(item.startsAt, minutes(config().pickupMinutes)))) : null;
      if (pickupBy && pickupBy <= now) throw conflict('RESERVATION_EXPIRED', 'The pickup window has ended');
      return tx.reservation.update({where: {id}, data: {status: 'CONFIRMED', pickupBy, confirmationCode: assignConfirmationCode()}});
    });
  }

  cancel(actor: Actor, id: string) {
    return this.db.write(async (tx, now) => {
      await expireReservations(tx, now);
      const item = await this.owned(tx, actor, id);
      if (item.status === 'CANCELLED') return item;
      if (!['HELD', 'CONFIRMED'].includes(item.status)) this.assertState(item.status, 'HELD');
      if (await tx.chargingSchedule.count({where: {request: {reservationId: id}, status: 'CHARGING'}})) {
        throw conflict('CHARGING_ACTIVE', 'An active charging session cannot be cancelled');
      }
      await tx.chargingSchedule.updateMany({
        where: {request: {reservationId: id}, status: {in: ['PROPOSED', 'CONFIRMED']}}, data: {status: 'CANCELLED'},
      });
      await tx.chargingRequest.updateMany({
        where: {reservationId: id, status: {in: ['PROPOSED', 'CONFIRMED', 'NEEDS_REPLAN']}}, data: {status: 'CANCELLED'},
      });
      return tx.reservation.update({where: {id}, data: {status: 'CANCELLED'}});
    });
  }

  pickup(actor: Actor, id: string, dto: PickupDto) {
    return this.db.write(async (tx, now) => {
      await expireReservations(tx, now);
      const item = await this.owned(tx, actor, id);
      this.assertState(item.status, 'CONFIRMED');
      const hub = await requireHub(tx, item.hubId, now);
      if (!item.vehicleId || now < item.startsAt) throw conflict('PICKUP_INVALID', 'This reservation cannot be picked up now');
      if (distanceKm(dto, hub) > 0.15) throw conflict('PICKUP_TOO_FAR', 'You must be within 150 meters of the pickup Hub');
      const vehicle = await tx.vehicle.findFirst({where: {id: item.vehicleId, hubId: item.hubId, status: 'AVAILABLE'}});
      if (!vehicle) throw conflict('VEHICLE_UNAVAILABLE', 'Vehicle is not at the Hub or still in use');
      if (vehicle.slotId) await tx.parkingSlot.update({where: {id: vehicle.slotId}, data: {status: 'FREE'}});
      await tx.vehicle.update({where: {id: vehicle.id}, data: {status: 'IN_USE', slotId: null}});
      return tx.reservation.update({where: {id}, data: {status: 'IN_USE', pickedUpAt: now}});
    });
  }

  returnVehicle(actor: Actor, id: string, dto: ReturnDto) {
    return this.db.write(async (tx, now) => {
      const item = await this.owned(tx, actor, id);
      this.assertState(item.status, 'IN_USE');
      if (!item.vehicleId) throw conflict('RETURN_INVALID', 'This reservation has no vehicle');
      await requireHub(tx, dto.hubId, now);
      await expireReservations(tx, now);
      const slot = await tx.parkingSlot.findFirst({where: freeSlots(dto.hubId, now, farFuture), orderBy: {code: 'asc'}});
      if (!slot) throw conflict('RETURN_HUB_FULL', 'The target Hub has no assignable parking slot');
      const nextBooking = await tx.reservation.findFirst({where: {
        vehicleId: item.vehicleId, status: {in: ['HELD', 'CONFIRMED']}, endsAt: {gt: now},
      }});
      if (nextBooking && nextBooking.hubId !== dto.hubId) {
        throw conflict('RETURN_HUB_REQUIRED', 'A later booking requires the vehicle at its pickup Hub');
      }
      await tx.parkingSlot.update({where: {id: slot.id}, data: {status: 'OCCUPIED'}});
      await tx.vehicle.update({where: {id: item.vehicleId}, data: {status: 'AVAILABLE', hubId: dto.hubId, slotId: slot.id}});
      return tx.reservation.update({where: {id}, data: {status: 'COMPLETED', returnedAt: now, returnCondition: dto.condition}});
    });
  }

  detail(actor: Actor, id: string) {
    return this.db.write(async (tx, now) => {
      await expireReservations(tx, now);
      return this.owned(tx, actor, id);
    });
  }

  list(actor: Actor, dto: ReservationQuery) {
    return this.db.write(async (tx, now) => {
      await expireReservations(tx, now);
      const where: Prisma.ReservationWhereInput = {
        userId: actor.role === 'OPERATOR' ? dto.userId : actor.id, status: dto.status, hubId: dto.hubId,
        id: dto.q && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(dto.q) ? dto.q : undefined,
      };
      const items = await tx.reservation.findMany({where, ...paginate(dto), orderBy: [{createdAt: 'desc'}, {id: 'asc'}]});
      return {items, total: await tx.reservation.count({where}), page: dto.page, limit: dto.limit};
    });
  }

  private assertState(actual: ReservationStatus, expected: ReservationStatus) {
    if (actual === 'EXPIRED') throw conflict('RESERVATION_EXPIRED', 'The reservation has expired');
    if (actual !== expected) throw conflict('RESERVATION_STATE', `Expected a ${expected} reservation`);
  }
}

@ApiTags('reservations')
@ApiBearerAuth()
@Controller('reservations')
class ReservationsController {
  constructor(private readonly service: ReservationsService) {}
  @Get() list(@CurrentUser() user: Actor, @Query() dto: ReservationQuery) { return this.service.list(user, dto); }
  @Get(':id') detail(@CurrentUser() user: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.service.detail(user, id); }
  @Student() @Post() hold(@CurrentUser() user: Actor, @Body() dto: HoldDto) { return this.service.hold(user, dto); }
  @Student() @Post(':id/confirm') @HttpCode(200) confirm(@CurrentUser() user: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.confirm(user, id);
  }
  @Post(':id/cancel') @HttpCode(200) cancel(@CurrentUser() user: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(user, id);
  }
  @Student() @Post(':id/pickup') @HttpCode(200) pickup(@CurrentUser() user: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PickupDto) {
    return this.service.pickup(user, id, dto);
  }
  @Student() @Post(':id/return') @HttpCode(200) returnVehicle(@CurrentUser() user: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnDto) {
    return this.service.returnVehicle(user, id, dto);
  }
}

@Module({controllers: [ReservationsController], providers: [ReservationsService]})
export class ReservationsModule {}
