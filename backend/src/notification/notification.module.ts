import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    JwtModule.register({}),
    ConfigModule,
  ],
  providers: [NotificationGateway, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
