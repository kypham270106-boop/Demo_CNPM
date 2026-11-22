import { Controller, Get, Module } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthModule, Public } from './auth/auth.module';
import { ChargingModule } from './charging/charging.module';
import { Database, DatabaseModule } from './common/database';
import { error } from './common/http';
import { HubsModule } from './hubs/hubs.module';
import { OperationalJobs } from './jobs';
import { DispatchModule } from './operations/dispatch.module';
import { MonitoringModule } from './operations/monitoring.module';
import { ReservationsModule } from './reservations/reservations.module';
import { SimulationsModule } from './simulations/simulations.module';
import { UsersModule } from './users/users.module';

@ApiTags('health')
@Controller('health')
class HealthController {
  constructor(private readonly db: Database) {}
  @Public() @Get() @ApiOkResponse({schema: {example: {status: 'ok'}}})
  async check() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return {status: 'ok'};
    } catch {
      throw error(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable');
    }
  }
}

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule, HubsModule, ReservationsModule, ChargingModule,
    MonitoringModule, DispatchModule, SimulationsModule],
  providers: [OperationalJobs],
  controllers: [HealthController],
})
export class AppModule {}
