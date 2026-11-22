import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, ValidationPipe,
  type INestApplication, Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiProperty, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { config } from './config';
import { completeOpenApi } from './openapi';

export function error(status: number, code: string, message: string) {
  return new HttpException({ code, message }, status);
}
export function missing(name: string) {
  return error(404, `${name}_NOT_FOUND`, 'The requested record does not exist');
}
export function conflict(code: string, message: string) {
  return error(409, code, message);
}

export class ErrorResponse {
  @ApiProperty() statusCode!: number;
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ type: [String], required: false }) details?: string[];
  @ApiProperty() path!: string;
  @ApiProperty() timestamp!: string;
}

@Catch()
export class HttpErrors implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrors.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: string[] | undefined;
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      } else {
        const payload = body as {code?: string; message?: string | string[]};
        code = payload.code ?? (status === 400 ? 'VALIDATION_ERROR' : (HttpStatus[status] ?? 'HTTP_ERROR'));
        details = Array.isArray(payload.message) ? payload.message : undefined;
        message = typeof payload.message === 'string' ? payload.message : 'Request validation failed';
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const overlap = /23P01|resource_overlap/i.test(exception.message);
      if (overlap || ['P2002', 'P2003', 'P2004'].includes(exception.code)) {
        status = 409;
        code = overlap ? 'RESOURCE_CONFLICT' : 'DATA_CONFLICT';
        message = 'The operation conflicts with existing data';
      } else if (exception.code === 'P2025') {
        status = 404;
        code = 'RECORD_NOT_FOUND';
        message = 'The requested record does not exist';
      } else if (['P1001', 'P1002', 'P1017', 'P2024', 'P2028', 'P2034'].includes(exception.code)) {
        status = 503;
        code = 'DATABASE_UNAVAILABLE';
        message = 'Please retry the operation';
      }
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = 503;
      code = 'DATABASE_UNAVAILABLE';
      message = 'Please retry the operation';
    }
    if (status >= 500) this.logger.error(`${request.method} ${request.path}: ${code}`);
    context.getResponse<Response>().status(status).json({
      statusCode: status, code, message, details, path: request.path, timestamp: new Date().toISOString(),
    });
  }
}

export function configureHttp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config().origins });
  app.useGlobalPipes(new ValidationPipe({
    transform: true, whitelist: true, forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: false },
  }));
  app.useGlobalFilters(new HttpErrors());
  const swagger = new DocumentBuilder()
    .setTitle('Smart E-Mobility Hub').setVersion('0.1.0').addBearerAuth().build();
  const document = SwaggerModule.createDocument(app, swagger, {extraModels: [ErrorResponse]});
  completeOpenApi(document, ErrorResponse);
  SwaggerModule.setup('docs', app, document, {useGlobalPrefix: true});
}
