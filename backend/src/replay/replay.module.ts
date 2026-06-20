import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ReplayTask } from '../entities/replay-task.entity';
import { ReplayItem } from '../entities/replay-item.entity';
import { DeliveryLog } from '../entities/delivery-log.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { ReplayController } from './replay.controller';
import { ReplayService } from './replay.service';
import { RedisModule } from '../redis/redis.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReplayTask, ReplayItem, DeliveryLog, Endpoint]),
    RedisModule,
    ConfigModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [ReplayController],
  providers: [ReplayService],
  exports: [ReplayService],
})
export class ReplayModule {}
