import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Metric } from '../entities/metric.entity';
import { DeliveryLog } from '../entities/delivery-log.entity';
import { DeadLetter } from '../entities/dead-letter.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { AlertsModule } from '../alerts/alert.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Metric, DeliveryLog, DeadLetter, Endpoint]),
    ScheduleModule.forRoot(),
    forwardRef(() => AlertsModule),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
