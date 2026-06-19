import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AlertService } from './alert.service';
import { AlertStatus, AlertType } from '../entities/alert.entity';
import { AlertRuleType } from '../entities/alert-rule.entity';

@ApiTags('Alerts')
@Controller('api/alerts')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get()
  @ApiOperation({ summary: 'List alerts' })
  async listAlerts(
    @Request() req: any,
    @Query('status') status?: AlertStatus,
    @Query('limit') limit?: string,
  ) {
    return this.alertService.listAlerts(
      req.user.tenantId,
      status,
      limit ? parseInt(limit, 10) : 100,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread alert count' })
  async getUnreadCount(@Request() req: any) {
    return this.alertService.getUnreadCount(req.user.tenantId);
  }

  @Put(':alertId/acknowledge')
  @ApiOperation({ summary: 'Acknowledge alert' })
  async acknowledge(@Request() req: any, @Param('alertId') alertId: string) {
    return this.alertService.acknowledgeAlert(req.user.tenantId, alertId);
  }

  @Put(':alertId/resolve')
  @ApiOperation({ summary: 'Resolve alert' })
  async resolve(@Request() req: any, @Param('alertId') alertId: string) {
    return this.alertService.resolveAlert(req.user.tenantId, alertId);
  }

  @Get('rules')
  @ApiOperation({ summary: 'List alert rules' })
  async listRules(@Request() req: any) {
    return this.alertService.listRules(req.user.tenantId);
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create alert rule' })
  async createRule(
    @Request() req: any,
    @Body()
    dto: {
      appId?: string;
      endpointId?: string;
      type: AlertRuleType;
      name: string;
      conditions: any;
    },
  ) {
    return this.alertService.createRule(req.user.tenantId, dto);
  }

  @Put('rules/:ruleId')
  @ApiOperation({ summary: 'Update alert rule' })
  async updateRule(
    @Request() req: any,
    @Param('ruleId') ruleId: string,
    @Body() dto: any,
  ) {
    return this.alertService.updateRule(req.user.tenantId, ruleId, dto);
  }

  @Delete('rules/:ruleId')
  @ApiOperation({ summary: 'Delete alert rule' })
  async deleteRule(@Request() req: any, @Param('ruleId') ruleId: string) {
    return this.alertService.deleteRule(req.user.tenantId, ruleId);
  }
}
