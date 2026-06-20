import { Injectable, Logger } from '@nestjs/common';
import { NotificationGateway, DeliveryNotification } from './notification.gateway';
import { NotificationRuleService } from './notification-rule.service';
import { NotificationHistoryService } from './notification-history.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationGateway: NotificationGateway,
    private readonly ruleService: NotificationRuleService,
    private readonly historyService: NotificationHistoryService,
  ) {}

  async sendDeliveryNotification(
    tenantId: string,
    notification: DeliveryNotification,
    endpointId?: string,
  ): Promise<void> {
    const shouldNotify = await this.ruleService.shouldNotify(tenantId, {
      endpointId,
      status: notification.status,
    });

    if (!shouldNotify) {
      this.logger.debug(`Notification filtered by rule for tenant ${tenantId}: ${notification.status}`);
      return;
    }

    const sent = this.notificationGateway.sendDeliveryNotification(tenantId, notification);
    if (sent) {
      this.logger.debug(`Delivery notification sent to tenant ${tenantId}: ${notification.status}`);
    }

    try {
      await this.historyService.record({
        tenantId,
        eventType: notification.eventType,
        endpointName: notification.endpointName,
        status: notification.status,
        responseStatus: notification.responseStatus ?? null,
        durationMs: notification.durationMs,
        endpointId: endpointId ?? null,
      });
    } catch (err: any) {
      this.logger.error(`Failed to record notification history: ${err.message}`);
    }
  }

  isTenantOnline(tenantId: string): boolean {
    return this.notificationGateway.isTenantOnline(tenantId);
  }
}
