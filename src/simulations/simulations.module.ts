import { Body, Controller, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, IsNumber, IsString, IsUUID, Length, Max, Min, ValidateNested } from 'class-validator';
import { Actor, CurrentUser, Operator } from '../auth/auth.module';
import { Database } from '../common/database';
import { PageQuery, paginate } from '../common/dto';
import { error, missing } from '../common/http';
import { MonitoringModule, MonitoringService } from '../operations/monitoring.module';
import { evaluateScenario } from './engine';

class DemandDto {
  @ApiProperty() @IsUUID() hubId!: string;
  @ApiProperty() @IsInt() @Min(0) @Max(10000) rides!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(10000) parking!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(10000) charging!: number;
}
class ScenarioDto {
  @ApiProperty() @IsString() @Length(1, 120) name!: string;
  @ApiProperty() @IsInt() @Min(15) @Max(1440) horizonMinutes!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(10) demandMultiplier!: number;
  @ApiProperty({type: [DemandDto]}) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ArrayUnique((entry: DemandDto) => entry?.hubId) @ValidateNested({each: true}) @Type(() => DemandDto) demand!: DemandDto[];
}
class CompareDto {
  @ApiProperty({type: [String]}) @IsArray() @ArrayMinSize(2) @ArrayMaxSize(8)
  @ArrayUnique() @IsUUID(undefined, {each: true}) reportIds!: string[];
}

@Injectable()
class SimulationService {
  constructor(private readonly db: Database, private readonly monitor: MonitoringService) {}

  create(actor: Actor, dto: ScenarioDto) {
    return this.db.$transaction(async tx => {
      const [{now}] = await tx.$queryRaw<{now: Date}[]>`SELECT clock_timestamp() AS now`;
      const hubs = (await this.monitor.snapshot(tx, now)).filter(hub => hub.active);
      const hubIds = new Set(hubs.map(hub => hub.id));
      if (dto.demand.some(item => !hubIds.has(item.hubId))) {
        throw error(400, 'INVALID_SIMULATION_HUB', 'Demand must reference active Hubs');
      }
      const results = evaluateScenario(hubs.map(hub => ({
        id: hub.id, code: hub.code, availableVehicles: hub.vehicles.available,
        freeSlots: hub.parking.free, availableChargers: hub.charging.available,
      })), dto.demand, dto.horizonMinutes, dto.demandMultiplier);
      return tx.simulationScenario.create({
        data: {name: dto.name, operatorId: actor.id, parameters: {
          horizonMinutes: dto.horizonMinutes, demandMultiplier: dto.demandMultiplier, demand: dto.demand.map(item => ({...item})),
        }, reports: {create: {snapshotAt: now, results}}},
        include: {reports: true},
      });
    }, {isolationLevel: 'RepeatableRead', timeout: 15000});
  }

  async list(dto: PageQuery) {
    const where = {name: dto.q ? {contains: dto.q, mode: 'insensitive' as const} : undefined};
    const [items, total] = await this.db.$transaction([
      this.db.simulationScenario.findMany({where, ...paginate(dto), orderBy: [{createdAt: 'desc'}, {id: 'asc'}]}),
      this.db.simulationScenario.count({where}),
    ]);
    return {items, total, page: dto.page, limit: dto.limit};
  }

  async detail(id: string) {
    const item = await this.db.simulationScenario.findUnique({where: {id}, include: {reports: {orderBy: {createdAt: 'desc'}}}});
    if (!item) throw missing('SIMULATION');
    return item;
  }

  async compare(ids: string[]) {
    const reports = await this.db.simulationReport.findMany({
      where: {id: {in: ids}}, include: {scenario: {select: {name: true, parameters: true}}},
    });
    if (reports.length !== ids.length) throw missing('SIMULATION_REPORT');
    return {items: ids.map(id => reports.find(report => report.id === id)!)};
  }
}

@ApiTags('simulations')
@ApiBearerAuth()
@Operator()
@Controller('simulations')
class SimulationController {
  constructor(private readonly service: SimulationService) {}
  @Get() list(@Query() dto: PageQuery) { return this.service.list(dto); }
  @Post() create(@CurrentUser() actor: Actor, @Body() dto: ScenarioDto) { return this.service.create(actor, dto); }
  @Post('compare') @HttpCode(200) compare(@Body() dto: CompareDto) { return this.service.compare(dto.reportIds); }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) { return this.service.detail(id); }
}

@Module({imports: [MonitoringModule], controllers: [SimulationController], providers: [SimulationService]})
export class SimulationsModule {}
