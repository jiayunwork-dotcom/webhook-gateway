import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { App } from '../entities/app.entity';
import { Tenant } from '../entities/tenant.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [TypeOrmModule.forFeature([App, Tenant, Endpoint]), ConfigModule],
  controllers: [AppController],
  providers: [AppService],
  exports: [AppService],
})
export class AppsModule {}
