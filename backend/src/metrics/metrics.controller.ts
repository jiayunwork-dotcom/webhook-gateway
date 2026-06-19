import { Controller, Get, Query, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { MetricGranularity } from '../entities/metric.entity';

@ApiTags('Metrics')
@Controller('api/metrics')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get tenant metrics overview' })
  async getOverview(
    @Request() req: any,
    @Query('granularity') granularity?: MetricGranularity,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.metricsService.getTenantOverview(
      req.user.tenantId,
      granularity || 'hour',
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('app/:appId')
  @ApiOperation({ summary: 'Get app metrics' })
  async getAppMetrics(
    @Request() req: any,
    @Param('appId') appId: string,
    @Query('granularity') granularity?: MetricGranularity,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.metricsService.getAppMetrics(
      req.user.tenantId,
      appId,
      granularity || 'hour',
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('endpoint/:endpointId')
  @ApiOperation({ summary: 'Get endpoint metrics' })
  async getEndpointMetrics(
    @Request() req: any,
    @Param('endpointId') endpointId: string,
    @Query('granularity') granularity?: MetricGranularity,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.metricsService.getEndpointMetrics(
      req.user.tenantId,
      endpointId,
      granularity || 'hour',
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}
