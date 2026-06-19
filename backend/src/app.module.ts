import { Module, Catch, ArgumentsHost, HttpException, Logger, HttpStatus } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_PIPE, BaseExceptionFilter } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppController } from './app.controller';
import { Tenant } from './entities/tenant.entity';
import { App as AppEntity } from './entities/app.entity';
import { Endpoint } from './entities/endpoint.entity';
import { WebhookEvent } from './entities/webhook-event.entity';
import { DeliveryLog } from './entities/delivery-log.entity';
import { DeadLetter } from './entities/dead-letter.entity';
import { Alert } from './entities/alert.entity';
import { AlertRule } from './entities/alert-rule.entity';
import { Metric } from './entities/metric.entity';
import { ConfigModule, ConfigService } from './config/config.module';
import { DatabaseConfig } from './database/database-config';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { AppsModule } from './apps/app.module';
import { EndpointsModule } from './endpoints/endpoint.module';
import { SignatureModule } from './signature/signature.module';
import { EventsModule } from './events/event.module';
import { DeliveryModule } from './delivery/delivery.module';
import { MetricsModule } from './metrics/metrics.module';
import { AlertsModule } from './alerts/alert.module';
import { LogsModule } from './logs/logs.module';

@Catch()
class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp: any = exception.getResponse();
      message = typeof resp === 'string' ? resp : resp?.message || message;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    this.logger.error(
      `[${request.method}] ${request.url} -> ${status} ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    if (response && typeof response.status === 'function') {
      response.status(status).json({
        statusCode: status,
        message,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    } else {
      super.catch(exception, host);
    }
  }
}

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useClass: DatabaseConfig,
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Tenant, AppEntity, Endpoint, WebhookEvent, DeliveryLog, DeadLetter, Alert, AlertRule, Metric]),
    RedisModule,
    AuthModule,
    AppsModule,
    EndpointsModule,
    SignatureModule,
    EventsModule,
    DeliveryModule,
    MetricsModule,
    AlertsModule,
    LogsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
        exceptionFactory: (errors) => {
          const messages = errors
            .map(e => Object.values(e.constraints || {}).join(', '))
            .filter(Boolean);
          return new HttpException(messages.join('; ') || 'Validation failed', HttpStatus.BAD_REQUEST);
        },
      }),
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    Logger,
  ],
})
export class AppModule {}
