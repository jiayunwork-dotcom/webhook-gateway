import { Controller, Post, Body, UseGuards, Request, Param, Get, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { EventService, PublishEventDto } from './event.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { IsString, MinLength, MaxLength, IsOptional, IsObject } from 'class-validator';

class PublishEventBody {
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  eventType: string;

  @IsOptional()
  @IsString()
  eventSource?: string;

  @IsObject()
  payload: Record<string, any>;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

@ApiTags('Events')
@Controller()
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Post('api/v1/events/publish')
  @UseGuards(ApiKeyGuard)
  @ApiHeader({ name: 'X-API-Key', description: 'API Public Key' })
  @ApiOperation({ summary: 'Publish event via API key' })
  async publishWithApiKey(
    @Request() req: any,
    @Body('appId') appId: string,
    @Body() dto: PublishEventBody,
  ) {
    const publishDto: PublishEventDto = {
      eventType: dto.eventType,
      eventSource: dto.eventSource || 'api',
      payload: dto.payload,
      idempotencyKey: dto.idempotencyKey,
    };
    return this.eventService.publish(req.tenant, appId, publishDto);
  }

  @Post('api/events/app/:appId/publish')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish event (admin)' })
  async publishAdmin(
    @Request() req: any,
    @Param('appId') appId: string,
    @Body() dto: PublishEventBody,
  ) {
    const publishDto: PublishEventDto = {
      eventType: dto.eventType,
      eventSource: dto.eventSource || 'admin_panel',
      payload: dto.payload,
      idempotencyKey: dto.idempotencyKey,
    };
    return this.eventService.publish(req.user.tenant, appId, publishDto);
  }

  @Post('api/events/test/:endpointId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send test event to endpoint' })
  async testDelivery(
    @Request() req: any,
    @Param('endpointId') endpointId: string,
  ) {
    return this.eventService.publishTestEvent(req.user.tenantId, endpointId);
  }

  @Get('api/events/app/:appId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List events for an app' })
  async findByApp(
    @Request() req: any,
    @Param('appId') appId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.eventService.findByApp(
      req.user.tenantId,
      appId,
      limit ? parseInt(limit, 10) : 100,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get('api/events/:eventId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get event by ID' })
  async findOne(@Request() req: any, @Param('eventId') eventId: string) {
    return this.eventService.findOne(req.user.tenantId, eventId);
  }
}
