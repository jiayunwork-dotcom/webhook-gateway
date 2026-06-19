import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Endpoint } from '../entities/endpoint.entity';
import { App } from '../entities/app.entity';
import { EndpointService } from './endpoint.service';
import { EndpointController } from './endpoint.controller';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [TypeOrmModule.forFeature([Endpoint, App]), ConfigModule],
  controllers: [EndpointController],
  providers: [EndpointService],
  exports: [EndpointService],
})
export class EndpointsModule {}
