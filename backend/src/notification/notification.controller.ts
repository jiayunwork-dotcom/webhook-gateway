import { Controller, Get, Put, Query, Body, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsIn } from 'class-validator';
import { NotificationRuleService } from './notification-rule.service';
import { NotificationHistoryService } from './notification-history.service';

class SaveRuleDto {
  @IsOptional()
  @IsArray()
  endpointIds?: string[] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  statusFilters?: string[] | null;
}

@ApiTags('Notifications')
@Controller('api/notifications')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class NotificationController {
  constructor(
    private readonly ruleService: NotificationRuleService,
    private readonly historyService: NotificationHistoryService,
  ) {}

  @Get('rules')
  @ApiOperation({ summary: 'Get notification rules for current tenant' })
  async getRules(@Request() req: any) {
    const rule = await this.ruleService.getRule(req.user.tenantId);
    if (!rule) {
      return {
        endpointIds: null,
        statusFilters: null,
      };
    }
    return {
      endpointIds: rule.endpointIds,
      statusFilters: rule.statusFilters,
    };
  }

  @Put('rules')
  @ApiOperation({ summary: 'Save notification rules for current tenant' })
  async saveRules(@Request() req: any, @Body() dto: SaveRuleDto) {
    return this.ruleService.saveRule(req.user.tenantId, {
      endpointIds: dto.endpointIds,
      statusFilters: dto.statusFilters as ('success' | 'failed' | 'timeout')[] | null,
    });
  }

  @Get('history')
  @ApiOperation({ summary: 'Query notification history' })
  async getHistory(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: 'success' | 'failed' | 'timeout',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const p = Math.max(1, parseInt(page || '1', 10) || 1);
    const ps = Math.min(100, Math.max(1, parseInt(pageSize || '20', 10) || 20));
    return this.historyService.query(req.user.tenantId, {
      startDate,
      endDate,
      status,
      page: p,
      pageSize: ps,
    });
  }
}
