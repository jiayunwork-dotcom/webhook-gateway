import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationRule } from '../entities/notification-rule.entity';

@Injectable()
export class NotificationRuleService {
  private readonly logger = new Logger(NotificationRuleService.name);

  constructor(
    @InjectRepository(NotificationRule)
    private readonly ruleRepository: Repository<NotificationRule>,
  ) {}

  async getRule(tenantId: string): Promise<NotificationRule | null> {
    return this.ruleRepository.findOne({ where: { tenantId } });
  }

  async saveRule(
    tenantId: string,
    data: { endpointIds?: string[] | null; statusFilters?: ('success' | 'failed' | 'timeout')[] | null },
  ): Promise<NotificationRule> {
    let rule = await this.ruleRepository.findOne({ where: { tenantId } });

    if (rule) {
      if (data.endpointIds !== undefined) {
        rule.endpointIds = data.endpointIds;
      }
      if (data.statusFilters !== undefined) {
        rule.statusFilters = data.statusFilters;
      }
    } else {
      rule = this.ruleRepository.create({
        tenantId,
        endpointIds: data.endpointIds ?? null,
        statusFilters: data.statusFilters ?? null,
      });
    }

    return this.ruleRepository.save(rule);
  }

  async shouldNotify(
    tenantId: string,
    notification: { endpointId?: string; status: 'success' | 'failed' | 'timeout' },
  ): Promise<boolean> {
    const rule = await this.ruleRepository.findOne({ where: { tenantId } });

    if (!rule) {
      return true;
    }

    if (rule.endpointIds && Array.isArray(rule.endpointIds) && rule.endpointIds.length > 0) {
      if (!notification.endpointId || !rule.endpointIds.includes(notification.endpointId)) {
        return false;
      }
    }

    if (rule.statusFilters && rule.statusFilters.length > 0) {
      if (!rule.statusFilters.includes(notification.status)) {
        return false;
      }
    }

    return true;
  }
}
