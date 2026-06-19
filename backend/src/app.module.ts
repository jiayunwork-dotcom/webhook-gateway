import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE, BaseExceptionFilter } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
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
      }),
    },
    {
      provide: APP_FILTER,
      useClass: BaseExceptionFilter,
    },
    Logger,
  ],
})
export class AppModule {}
