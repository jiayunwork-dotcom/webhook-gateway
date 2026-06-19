import { Injectable } from '@nestjs/common';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '../config/config.module';
import { Tenant } from '../entities/tenant.entity';
import { App } from '../entities/app.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { WebhookEvent } from '../entities/webhook-event.entity';
import { DeliveryLog } from '../entities/delivery-log.entity';
import { DeadLetter } from '../entities/dead-letter.entity';
import { Alert } from '../entities/alert.entity';
import { AlertRule } from '../entities/alert-rule.entity';
import { Metric } from '../entities/metric.entity';

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      host: this.configService.dbHost,
      port: this.configService.dbPort,
      username: this.configService.dbUser,
      password: this.configService.dbPassword,
      database: this.configService.dbName,
      entities: [
        Tenant,
        App,
        Endpoint,
        WebhookEvent,
        DeliveryLog,
        DeadLetter,
        Alert,
        AlertRule,
        Metric,
      ],
      synchronize: this.configService.nodeEnv !== 'production',
      logging: this.configService.nodeEnv === 'development',
      ssl: this.configService.dbSsl ? { rejectUnauthorized: false } : false,
      poolSize: 20,
      extra: {
        max: 20,
        connectionTimeoutMillis: 5000,
      },
    };
  }
}
