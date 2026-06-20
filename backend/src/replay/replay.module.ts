import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReplayTask } from '../entities/replay-task.entity';
import { ReplayItem } from '../entities/replay-item.entity';
import { DeliveryLog } from '../entities/delivery-log.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { ReplayController } from './replay.controller';
import { ReplayService } from './replay.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReplayTask, ReplayItem, DeliveryLog, Endpoint]),
    RedisModule,
  ],
  controllers: [ReplayController],
  providers: [ReplayService],
  exports: [ReplayService],
})
export class ReplayModule {}
