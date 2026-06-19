import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Alert } from '../entities/alert.entity';
import { AlertRule } from '../entities/alert-rule.entity';
import { DeliveryLog } from '../entities/delivery-log.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { App } from '../entities/app.entity';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Alert, AlertRule, DeliveryLog, Endpoint, App]),
    ScheduleModule.forRoot(),
  ],
  controllers: [AlertController],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertsModule {}
