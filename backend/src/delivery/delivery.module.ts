import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DeliveryEngineService } from './delivery-engine.service';
import { DeliveryLog } from '../entities/delivery-log.entity';
import { DeadLetter } from '../entities/dead-letter.entity';
import { WebhookEvent } from '../entities/webhook-event.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { Tenant } from '../entities/tenant.entity';
import { ConfigModule } from '../config/config.module';
import { SignatureModule } from '../signature/signature.module';
import { EndpointsModule } from '../endpoints/endpoint.module';
import { EventsModule } from '../events/event.module';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeliveryLog, DeadLetter, WebhookEvent, Endpoint, Tenant]),
    ScheduleModule.forRoot(),
    ConfigModule,
    SignatureModule,
    EndpointsModule,
    forwardRef(() => EventsModule),
    forwardRef(() => MetricsModule),
    NotificationModule,
  ],
  providers: [DeliveryEngineService],
  exports: [DeliveryEngineService],
})
export class DeliveryModule {}
