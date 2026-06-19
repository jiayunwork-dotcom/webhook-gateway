import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EndpointService } from './endpoint.service';
import { IsString, MinLength, MaxLength, IsOptional, IsArray, IsInt, Min, Max, IsObject } from 'class-validator';

class CreateEndpointDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MaxLength(2000)
  url: string;

  @IsArray()
  subscribedEvents: string[];

  @IsOptional()
  @IsObject()
  customHeaders?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  rateLimitPerSecond?: number;
}

class UpdateEndpointDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsArray()
  subscribedEvents?: string[];

  @IsOptional()
  @IsObject()
  customHeaders?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  rateLimitPerSecond?: number;

  @IsOptional()
  isActive?: boolean;
}

@ApiTags('Endpoints')
@Controller('api/endpoints')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class EndpointController {
  constructor(private readonly endpointService: EndpointService) {}

  @Post('app/:appId')
  @ApiOperation({ summary: 'Create a new endpoint in an app' })
  async create(
    @Request() req: any,
    @Param('appId') appId: string,
    @Body() dto: CreateEndpointDto,
  ) {
    return this.endpointService.create(req.user.tenantId, appId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all endpoints' })
  async findAll(@Request() req: any, @Query('appId') appId?: string) {
    return this.endpointService.findAll(req.user.tenantId, appId);
  }

  @Get('event-types')
  @ApiOperation({ summary: 'Get available event types' })
  async getEventTypes() {
    return {
      builtIn: this.endpointService.getAvailableEventTypes(),
    };
  }

  @Get(':endpointId')
  @ApiOperation({ summary: 'Get endpoint by ID' })
  async findOne(@Request() req: any, @Param('endpointId') endpointId: string) {
    return this.endpointService.findOne(req.user.tenantId, endpointId);
  }

  @Put(':endpointId')
  @ApiOperation({ summary: 'Update endpoint' })
  async update(
    @Request() req: any,
    @Param('endpointId') endpointId: string,
    @Body() dto: UpdateEndpointDto,
  ) {
    return this.endpointService.update(req.user.tenantId, endpointId, dto);
  }

  @Delete(':endpointId')
  @ApiOperation({ summary: 'Delete endpoint' })
  async remove(@Request() req: any, @Param('endpointId') endpointId: string) {
    return this.endpointService.remove(req.user.tenantId, endpointId);
  }
}
