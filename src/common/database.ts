import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }

  // All operational writers coordinate on the same lock for this MVP.
  // The transaction starts in READ COMMITTED, so reads after the lock see the prior writer.
  write<T>(action: (tx: Tx, now: Date) => Promise<T>): Promise<T> {
    return this.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(271106, 1)`;
      const [{ now }] = await tx.$queryRaw<{now: Date}[]>`SELECT clock_timestamp() AS now`;
      return action(tx, now);
    }, { isolationLevel: 'ReadCommitted', maxWait: 8000, timeout: 15000 });
  }
}

@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
