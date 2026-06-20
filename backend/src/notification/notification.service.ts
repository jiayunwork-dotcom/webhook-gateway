import { Injectable, Logger } from '@nestjs/common';
import { NotificationGateway, DeliveryNotification } from './notification.gateway';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly notificationGateway: NotificationGateway) {}

  sendDeliveryNotification(tenantId: string, notification: DeliveryNotification): void {
    const sent = this.notificationGateway.sendDeliveryNotification(tenantId, notification);
    if (sent) {
      this.logger.debug(`Delivery notification sent to tenant ${tenantId}: ${notification.status}`);
    }
  }

  isTenantOnline(tenantId: string): boolean {
    return this.notificationGateway.isTenantOnline(tenantId);
  }
}
