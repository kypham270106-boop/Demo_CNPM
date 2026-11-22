import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './common/config';
import { configureHttp } from './common/http';

async function bootstrap() {
  const {port} = config();
  const app = await NestFactory.create(AppModule);
  configureHttp(app);
  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
