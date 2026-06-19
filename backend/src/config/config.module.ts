import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      cache: true,
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}

import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private readonly configService: NestConfigService) {}

  get appPort(): number {
    return parseInt(this.configService.get('APP_PORT', '3000'), 10);
  }

  get jwtSecret(): string {
    return this.configService.get('JWT_SECRET', 'default_secret');
  }

  get dbHost(): string {
    return this.configService.get('DB_HOST', 'localhost');
  }

  get dbPort(): number {
    return parseInt(this.configService.get('DB_PORT', '5432'), 10);
  }

  get dbUser(): string {
    return this.configService.get('DB_USER', 'webhook');
  }

  get dbPassword(): string {
    return this.configService.get('DB_PASSWORD', 'webhook_secret_2024');
  }

  get dbName(): string {
    return this.configService.get('DB_NAME', 'webhook_gateway');
  }

  get dbSsl(): boolean {
    return this.configService.get('DB_SSL', 'false') === 'true';
  }

  get redisHost(): string {
    return this.configService.get('REDIS_HOST', 'localhost');
  }

  get redisPort(): number {
    return parseInt(this.configService.get('REDIS_PORT', '6379'), 10);
  }

  get redisPassword(): string {
    return this.configService.get('REDIS_PASSWORD', '');
  }

  get deliveryTimeoutMs(): number {
    return parseInt(this.configService.get('DELIVERY_TIMEOUT_MS', '30000'), 10);
  }

  get maxRetryCount(): number {
    return parseInt(this.configService.get('MAX_RETRY_COUNT', '6'), 10);
  }

  get transitionPeriodHours(): number {
    return parseInt(this.configService.get('TRANSITION_PERIOD_HOURS', '72'), 10);
  }

  get unhealthyThreshold(): number {
    return parseInt(this.configService.get('UNHEALTHY_THRESHOLD', '5'), 10);
  }

  get probeIntervalMs(): number {
    return parseInt(this.configService.get('PROBE_INTERVAL_MS', '600000'), 10);
  }

  get probeSuccessThreshold(): number {
    return parseInt(this.configService.get('PROBE_SUCCESS_THRESHOLD', '3'), 10);
  }

  get defaultRateLimit(): number {
    return parseInt(this.configService.get('DEFAULT_RATE_LIMIT', '50'), 10);
  }

  get maxAppsPerTenant(): number {
    return parseInt(this.configService.get('MAX_APPS_PER_TENANT', '20'), 10);
  }

  get maxEndpointsPerApp(): number {
    return parseInt(this.configService.get('MAX_ENDPOINTS_PER_APP', '50'), 10);
  }

  get maxEventSizeBytes(): number {
    return parseInt(this.configService.get('MAX_EVENT_SIZE_BYTES', '262144'), 10);
  }

  get retryIntervals(): number[] {
    return [10000, 30000, 120000, 600000, 3600000, 21600000];
  }

  get nodeEnv(): string {
    return this.configService.get('NODE_ENV', 'development');
  }
}
