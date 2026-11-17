import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { DispatchStatus, VehicleType } from '@prisma/client';
import { IsEnum, IsInt, ValidateIf, IsUUID, Max, Min } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Actor, CurrentUser, Operator } from '../auth/auth.module';
import { after, config } from '../common/config';
import { Database, Tx } from '../common/database';
import { PageQuery, paginate } from '../common/dto';
import { conflict, error, missing } from '../common/http';
import { expireReservations, freeSlots, freeVehicles, requireHub, stale } from '../common/inventory';
import { distanceKm } from '../hubs/geo';

class DispatchCriteria {
  @ApiProperty() @IsUUID() targetId!: string;
  @ApiProperty({enum: VehicleType}) @IsEnum(VehicleType) type!: VehicleType;
  @ApiProperty() @IsInt() @Min(1) @Max(25) count!: number;
}
class DispatchDto extends DispatchCriteria {
  @ApiProperty() @IsUUID() sourceId!: string;
}
class DispatchQuery extends PageQuery {
  @ApiPropertyOptional({enum: DispatchStatus}) @ValidateIf((_, value) => value !== undefined) @IsEnum(DispatchStatus) status?: DispatchStatus;
}

export interface DispatchExecutor {
  execute(order: {orderId: string; attemptId: string; vehicleIds: string[]}, signal: AbortSignal): Promise<void>;
}

export const DISPATCH_EXECUTOR = Symbol('DispatchExecutor');
const unbounded = new Date('9999-01-01T00:00:00Z');

@Injectable()
export class MockDispatchExecutor implements DispatchExecutor {
  async execute(_order: unknown, signal: AbortSignal) {
    signal.throwIfAborted();
    if (Math.random() * 100 < config().mockFailure) throw new Error('Mock execution failed');
  }
}

@Injectable()
export class DispatchService {
  constructor(private readonly db: Database, @Inject(DISPATCH_EXECUTOR) private readonly executor: DispatchExecutor) {}

  propose(dto: DispatchCriteria) {
    return this.db.write(async (tx, now) => {
      await expireReservations(tx, now);
      const target = await requireHub(tx, dto.targetId, now);
      const targetFreeSlots = await tx.parkingSlot.count({where: freeSlots(target.id, now, unbounded)});
      const candidates = await tx.hub.findMany({where: {active: true, id: {not: target.id}}});
      const sources = [];
      if (targetFreeSlots >= dto.count) {
        for (const hub of candidates) {
          if (stale(hub.lastSeenAt, now)) continue;
          const available = await tx.vehicle.count({where: {...freeVehicles(hub.id, now, unbounded), type: dto.type}});
          if (available >= dto.count) {
            sources.push({hubId: hub.id, code: hub.code, name: hub.name, available, distanceKm: distanceKm(hub, target)});
          }
        }
      }
      return {targetFreeSlots, sources: sources.sort((a, b) => a.distanceKm - b.distanceKm)};
    });
  }

  create(actor: Actor, dto: DispatchDto) {
    if (dto.sourceId === dto.targetId) throw error(400, 'INVALID_DISPATCH', 'Source and destination must differ');
    return this.db.write(async (tx, now) => {
      await expireReservations(tx, now);
      await requireHub(tx, dto.sourceId, now);
      await requireHub(tx, dto.targetId, now);
      const vehicles = await tx.vehicle.findMany({
        where: {...freeVehicles(dto.sourceId, now, unbounded), type: dto.type},
        orderBy: [{battery: 'desc'}, {code: 'asc'}], take: dto.count,
      });
      if (vehicles.length < dto.count) throw conflict('DISPATCH_VEHICLES_UNAVAILABLE', 'Source does not have enough eligible vehicles');
      const slots = await tx.parkingSlot.findMany({
        where: freeSlots(dto.targetId, now, unbounded), orderBy: {code: 'asc'}, take: dto.count,
      });
      if (slots.length < dto.count) throw conflict('DISPATCH_DESTINATION_FULL', 'Destination has insufficient parking capacity');
      return tx.dispatchOrder.create({
        data: {operatorId: actor.id, sourceId: dto.sourceId, targetId: dto.targetId, items: {
          create: vehicles.map((vehicle, i) => ({vehicleId: vehicle.id, targetSlotId: slots[i].id})),
        }}, include: {items: true},
      });
    });
  }

  async run(id: string) {
    const attempt = await this.db.write(async (tx, now) => {
      const order = await tx.dispatchOrder.findUnique({where: {id}, include: {items: true}});
      if (!order) throw missing('DISPATCH_ORDER');
      if (order.status !== 'PENDING') return {order, claimed: false};
      const attemptId = randomUUID();
      await tx.vehicle.updateMany({
        where: {id: {in: order.items.map(item => item.vehicleId)}}, data: {status: 'DISPATCHING'},
      });
      return {order: await tx.dispatchOrder.update({
        where: {id}, data: {status: 'IN_PROGRESS', startedAt: now, attemptId}, include: {items: true},
      }), claimed: true};
    });
    if (!attempt.claimed) return this.clientOrder(attempt.order);
    const {attemptId, items} = attempt.order;
    let success = false;
    const signal = AbortSignal.timeout(config().dispatchSeconds * 1000);
    try {
      await this.executor.execute({orderId: id, attemptId: attemptId!, vehicleIds: items.map(item => item.vehicleId)}, signal);
      success = !signal.aborted;
    } catch {
      success = false;
    }
    return this.db.write(async (tx, now) => {
      const order = await tx.dispatchOrder.findUniqueOrThrow({where: {id}, include: {items: true}});
      if (order.status !== 'IN_PROGRESS' || order.attemptId !== attemptId) return this.clientOrder(order);
      if (!success) {
        await this.fail(tx, order, now, 'EXECUTION_FAILED');
      } else {
        const vehicles = await tx.vehicle.findMany({where: {id: {in: items.map(item => item.vehicleId)}}});
        const originalSlots = vehicles.flatMap(vehicle => vehicle.slotId ? [vehicle.slotId] : []);
        await tx.parkingSlot.updateMany({where: {id: {in: originalSlots}}, data: {status: 'FREE'}});
        await tx.parkingSlot.updateMany({where: {id: {in: items.map(item => item.targetSlotId)}}, data: {status: 'OCCUPIED'}});
        for (const item of items) {
          await tx.vehicle.update({
            where: {id: item.vehicleId}, data: {status: 'AVAILABLE', hubId: order.targetId, slotId: item.targetSlotId},
          });
        }
        await tx.dispatchOrder.update({where: {id}, data: {status: 'COMPLETED', finishedAt: now}});
      }
      return this.detailWith(tx, id);
    });
  }

  async recover(tx: Tx, now: Date) {
    const staleOrders = await tx.dispatchOrder.findMany({
      where: {status: 'IN_PROGRESS', startedAt: {lte: after(now, -config().dispatchSeconds * 1000)}},
      include: {items: true},
    });
    for (const order of staleOrders) await this.fail(tx, order, now, 'EXECUTION_TIMEOUT');
  }

  private async fail(tx: Tx, order: {id: string; sourceId: string; items: {vehicleId: string}[]}, now: Date, failure: string) {
    await tx.vehicle.updateMany({
      where: {id: {in: order.items.map(item => item.vehicleId)}, status: 'DISPATCHING'}, data: {status: 'AVAILABLE'},
    });
    await tx.dispatchOrder.update({where: {id: order.id}, data: {status: 'FAILED', failure, finishedAt: now}});
    await tx.incident.create({data: {
      hubId: order.sourceId, type: 'DISPATCH_FAILURE', details: {orderId: order.id, failure},
    }});
  }

  private clientOrder<T extends {attemptId: string | null}>(order: T) {
    const {attemptId, ...safe} = order;
    void attemptId;
    return safe;
  }

  private async detailWith(tx: Tx, id: string) {
    const order = await tx.dispatchOrder.findUnique({where: {id}, include: {items: true}});
    if (!order) throw missing('DISPATCH_ORDER');
    return this.clientOrder(order);
  }

  detail(id: string) { return this.detailWith(this.db, id); }

  async list(dto: DispatchQuery) {
    const where = {status: dto.status};
    const [items, total] = await this.db.$transaction([
      this.db.dispatchOrder.findMany({where, include: {items: true}, ...paginate(dto), orderBy: [{createdAt: 'desc'}, {id: 'asc'}]}),
      this.db.dispatchOrder.count({where}),
    ]);
    return {items: items.map(order => this.clientOrder(order)), total, page: dto.page, limit: dto.limit};
  }
}

@ApiTags('dispatch-orders')
@ApiBearerAuth()
@Operator()
@Controller('dispatch-orders')
class DispatchController {
  constructor(private readonly service: DispatchService) {}
  @Get() list(@Query() dto: DispatchQuery) { return this.service.list(dto); }
  @Post('proposals') @HttpCode(200) propose(@Body() dto: DispatchCriteria) { return this.service.propose(dto); }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) { return this.service.detail(id); }
  @Post() async create(@CurrentUser() user: Actor, @Body() dto: DispatchDto) {
    const {attemptId, ...result} = await this.service.create(user, dto);
    void attemptId;
    return result;
  }
  @Post(':id/execute') @HttpCode(200) run(@Param('id', ParseUUIDPipe) id: string) { return this.service.run(id); }
}

@Module({
  controllers: [DispatchController], providers: [DispatchService, {provide: DISPATCH_EXECUTOR, useClass: MockDispatchExecutor}],
  exports: [DispatchService],
})
export class DispatchModule {}
