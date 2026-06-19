import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Alert, AlertType, AlertSeverity, AlertStatus } from '../entities/alert.entity';
import { AlertRule } from '../entities/alert-rule.entity';
import { DeliveryLog } from '../entities/delivery-log.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { App } from '../entities/app.entity';
import { DeliveryTask } from '../delivery/delivery-engine.service';

interface DeliveryResult {
  success: boolean;
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private endpointFailureWindows = new Map<string, { total: number; failed: number; windowStart: number }>();

  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(AlertRule)
    private readonly alertRuleRepository: Repository<AlertRule>,
    @InjectRepository(DeliveryLog)
    private readonly deliveryLogRepository: Repository<DeliveryLog>,
    @InjectRepository(Endpoint)
    private readonly endpointRepository: Repository<Endpoint>,
    @InjectRepository(App)
    private readonly appRepository: Repository<App>,
  ) {}

  async checkDeliveryAlert(
    task: DeliveryTask,
    endpoint: Endpoint,
    result: DeliveryResult,
  ): Promise<void> {
    try {
      const windowKey = `${task.endpointId}:failure`;
      const WINDOW_MS = 5 * 60 * 1000;
      const now = Date.now();

      let window = this.endpointFailureWindows.get(windowKey);
      if (!window || now - window.windowStart > WINDOW_MS) {
        window = { total: 0, failed: 0, windowStart: now };
      }

      window.total += 1;
      if (!result.success) window.failed += 1;
      this.endpointFailureWindows.set(windowKey, window);

      if (window.total >= 10) {
        const failureRate = window.failed / window.total;
        if (failureRate > 0.3) {
          await this.triggerFailureRateAlert(
            task.tenantId,
            task.appId,
            task.endpointId,
            failureRate,
            window.total,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Alert check error: ${err.message}`);
    }
  }

  async triggerFailureRateAlert(
    tenantId: string,
    appId: string,
    endpointId: string,
    failureRate: number,
    totalEvents: number,
  ): Promise<void> {
    const recent = await this.alertRepository.findOne({
      where: {
        tenantId,
        endpointId,
        type: 'endpoint_failure_rate',
        status: 'active',
      },
      order: { createdAt: 'DESC' },
    });

    if (recent) {
      const age = Date.now() - new Date(recent.createdAt).getTime();
      if (age < 30 * 60 * 1000) return;
    }

    const endpoint = await this.endpointRepository.findOne({ where: { id: endpointId } });
    const severity: AlertSeverity = failureRate > 0.6 ? 'critical' : failureRate > 0.4 ? 'warning' : 'info';

    const alert = this.alertRepository.create({
      tenantId,
      appId,
      endpointId,
      type: 'endpoint_failure_rate',
      severity,
      status: 'active',
      message: `Endpoint "${endpoint?.name || endpointId}" failure rate is ${(failureRate * 100).toFixed(1)}% over ${totalEvents} deliveries`,
      metadata: { failureRate, totalEvents },
    });
    await this.alertRepository.save(alert);
    this.logger.warn(`Alert triggered: failure rate ${failureRate.toFixed(2)} for endpoint ${endpointId}`);
  }

  async triggerEndpointUnhealthy(
    tenantId: string,
    appId: string,
    endpointId: string,
  ): Promise<void> {
    const endpoint = await this.endpointRepository.findOne({ where: { id: endpointId } });

    const existing = await this.alertRepository.findOne({
      where: {
        tenantId,
        endpointId,
        type: 'endpoint_unhealthy',
        status: 'active',
      },
    });
    if (existing) return;

    const alert = this.alertRepository.create({
      tenantId,
      appId,
      endpointId,
      type: 'endpoint_unhealthy',
      severity: 'critical',
      status: 'active',
      message: `Endpoint "${endpoint?.name || endpointId}" has been marked unhealthy and paused`,
      metadata: {},
    });
    await this.alertRepository.save(alert);
  }

  async resolveEndpointRecovered(
    tenantId: string,
    appId: string,
    endpointId: string,
  ): Promise<void> {
    const activeAlerts = await this.alertRepository.find({
      where: {
        tenantId,
        endpointId,
        type: In(['endpoint_unhealthy', 'endpoint_failure_rate']),
        status: 'active',
      },
    });

    for (const alert of activeAlerts) {
      alert.status = 'resolved';
      alert.resolvedAt = new Date();
      alert.message += ' - Auto-resolved after endpoint recovery';
      await this.alertRepository.save(alert);
    }
  }

  async createRule(
    tenantId: string,
    dto: {
      appId?: string;
      endpointId?: string;
      type: AlertType;
      name: string;
      conditions: AlertRule['conditions'];
    },
  ) {
    if (dto.appId) {
      const app = await this.appRepository.findOne({ where: { id: dto.appId, tenantId } });
      if (!app) throw new Error('App not found');
    }
    if (dto.endpointId) {
      const ep = await this.endpointRepository
        .createQueryBuilder('e')
        .innerJoin('e.app', 'app')
        .where('e.id = :id AND app.tenantId = :tid', { id: dto.endpointId, tid: tenantId })
        .getOne();
      if (!ep) throw new Error('Endpoint not found');
    }

    const rule = this.alertRuleRepository.create({
      tenantId,
      appId: dto.appId || null,
      endpointId: dto.endpointId || null,
      type: dto.type,
      name: dto.name,
      conditions: dto.conditions,
      channels: ['in_app'],
    });
    return this.alertRuleRepository.save(rule);
  }

  async listRules(tenantId: string) {
    return this.alertRuleRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateRule(tenantId: string, ruleId: string, dto: Partial<AlertRule>) {
    const rule = await this.alertRuleRepository.findOne({
      where: { id: ruleId, tenantId },
    });
    if (!rule) throw new Error('Rule not found');
    Object.assign(rule, dto);
    return this.alertRuleRepository.save(rule);
  }

  async deleteRule(tenantId: string, ruleId: string) {
    const rule = await this.alertRuleRepository.findOne({
      where: { id: ruleId, tenantId },
    });
    if (!rule) throw new Error('Rule not found');
    await this.alertRuleRepository.remove(rule);
    return { success: true };
  }

  async listAlerts(tenantId: string, status?: AlertStatus, limit = 100) {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.alertRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async acknowledgeAlert(tenantId: string, alertId: string) {
    const alert = await this.alertRepository.findOne({
      where: { id: alertId, tenantId },
    });
    if (!alert) throw new Error('Alert not found');
    alert.status = 'acknowledged';
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = tenantId;
    return this.alertRepository.save(alert);
  }

  async resolveAlert(tenantId: string, alertId: string) {
    const alert = await this.alertRepository.findOne({
      where: { id: alertId, tenantId },
    });
    if (!alert) throw new Error('Alert not found');
    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    return this.alertRepository.save(alert);
  }

  async getUnreadCount(tenantId: string): Promise<{ critical: number; warning: number; info: number }> {
    const alerts = await this.alertRepository.find({
      where: { tenantId, status: 'active' },
    });
    return {
      critical: alerts.filter(a => a.severity === 'critical').length,
      warning: alerts.filter(a => a.severity === 'warning').length,
      info: alerts.filter(a => a.severity === 'info').length,
    };
  }

  @Cron('*/30 * * * *')
  async evaluateAlertRules() {
    try {
      const activeRules = await this.alertRuleRepository.find({ where: { isActive: true } });
      for (const rule of activeRules) {
        await this.evaluateRule(rule);
      }
    } catch (err) {
      this.logger.error(`Rule evaluation error: ${err.message}`);
    }
  }

  private async evaluateRule(rule: AlertRule): Promise<void> {
    if (rule.type !== 'endpoint_failure_rate') return;

    const windowMinutes = rule.conditions.windowMinutes || 5;
    const minEvents = rule.conditions.minEvents || 10;
    const threshold = rule.conditions.failureRateThreshold || 0.3;

    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    const query = this.deliveryLogRepository
      .createQueryBuilder('dl')
      .select('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN dl.status != 'success' THEN 1 ELSE 0 END)`, 'failed')
      .where('dl.tenantId = :tid', { tid: rule.tenantId })
      .andWhere('dl.createdAt >= :ws', { ws: windowStart });

    if (rule.endpointId) {
      query.andWhere('dl.endpointId = :eid', { eid: rule.endpointId });
    } else if (rule.appId) {
      query.andWhere('dl.appId = :aid', { aid: rule.appId });
    }

    const result = await query.getRawOne();
    const total = parseInt(result.total || '0');
    const failed = parseInt(result.failed || '0');

    if (total >= minEvents) {
      const rate = failed / total;
      if (rate >= threshold) {
        await this.triggerFailureRateAlert(
          rule.tenantId,
          rule.appId || '',
          rule.endpointId || '',
          rate,
          total,
        );
      }
    }
  }
}
