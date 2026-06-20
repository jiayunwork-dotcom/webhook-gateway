import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { NotificationRule } from '../entities/notification-rule.entity';
import { NotificationHistory } from '../entities/notification-history.entity';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { NotificationRuleService } from './notification-rule.service';
import { NotificationHistoryService } from './notification-history.service';
import { NotificationController } from './notification.controller';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationRule, NotificationHistory]),
    JwtModule.register({}),
    ConfigModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationGateway,
    NotificationService,
    NotificationRuleService,
    NotificationHistoryService,
  ],
  exports: [NotificationService, NotificationRuleService, NotificationHistoryService],
})
export class NotificationModule {}
