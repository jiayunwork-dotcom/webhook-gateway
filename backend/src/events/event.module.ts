import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEvent } from '../entities/webhook-event.entity';
import { App } from '../entities/app.entity';
import { Tenant } from '../entities/tenant.entity';
import { EventService } from './event.service';
import { EventController } from './event.controller';
import { ConfigModule } from '../config/config.module';
import { EndpointsModule } from '../endpoints/endpoint.module';
import { DeliveryModule } from '../delivery/delivery.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEvent, App, Tenant]),
    ConfigModule,
    EndpointsModule,
    forwardRef(() => DeliveryModule),
  ],
  controllers: [EventController],
  providers: [EventService],
  exports: [EventService],
})
export class EventsModule {}
