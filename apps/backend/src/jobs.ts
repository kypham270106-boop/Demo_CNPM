import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { SmartChargingService } from './charging/charging.module';
import { config } from './common/config';
import { Database } from './common/database';
import { expireReservations } from './common/inventory';
import { DispatchService } from './operations/dispatch.module';
import { HubStateSyncService, MonitoringService } from './operations/monitoring.module';

@Injectable()
export class OperationalJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OperationalJobs.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private nextSync = 0;
  private stopping = false;

  constructor(
    private readonly db: Database, private readonly smart: SmartChargingService,
    private readonly dispatch: DispatchService, private readonly sync: HubStateSyncService,
    private readonly monitoring: MonitoringService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      if (!this.running && !this.stopping) {
        this.running = this.tick()
          .catch(() => this.logger.error('Operational jobs failed and will retry on the next interval'))
          .finally(() => { this.running = undefined; });
      }
    }, config().pollSeconds * 1000);
    this.timer.unref();
  }

  async onModuleDestroy() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
  }

  async tick() {
    const synced = await this.db.write(async (tx, now) => {
      await this.smart.tick(tx, now);
      await expireReservations(tx, now);
      await this.dispatch.recover(tx, now);
      if (+now < this.nextSync) return null;
      await this.sync.sync(tx, now);
      await this.monitoring.scan(tx, now);
      return now;
    });
    if (synced) this.nextSync = +synced + config().mockSeconds * 1000;
  }
}
