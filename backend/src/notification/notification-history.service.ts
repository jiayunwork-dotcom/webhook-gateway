import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationHistory } from '../entities/notification-history.entity';

export interface HistoryQueryParams {
  startDate?: string;
  endDate?: string;
  status?: 'success' | 'failed' | 'timeout';
  page: number;
  pageSize: number;
}

export interface HistoryResult {
  items: NotificationHistory[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable()
export class NotificationHistoryService {
  private readonly logger = new Logger(NotificationHistoryService.name);

  constructor(
    @InjectRepository(NotificationHistory)
    private readonly historyRepository: Repository<NotificationHistory>,
  ) {}

  async record(notification: {
    tenantId: string;
    eventType: string;
    endpointName: string;
    status: 'success' | 'failed' | 'timeout';
    responseStatus?: number | null;
    durationMs: number;
    endpointId?: string | null;
  }): Promise<NotificationHistory> {
    const entry = this.historyRepository.create({
      tenantId: notification.tenantId,
      eventType: notification.eventType,
      endpointName: notification.endpointName,
      status: notification.status,
      responseStatus: notification.responseStatus ?? null,
      durationMs: notification.durationMs,
      endpointId: notification.endpointId ?? null,
    });
    return this.historyRepository.save(entry);
  }

  async query(tenantId: string, params: HistoryQueryParams): Promise<HistoryResult> {
    const qb = this.historyRepository
      .createQueryBuilder('h')
      .where('h.tenantId = :tenantId', { tenantId });

    if (params.startDate) {
      qb.andWhere('h.createdAt >= :startDate', { startDate: params.startDate });
    }
    if (params.endDate) {
      qb.andWhere('h.createdAt <= :endDate', { endDate: params.endDate });
    }
    if (params.status) {
      qb.andWhere('h.status = :status', { status: params.status });
    }

    qb.orderBy('h.createdAt', 'DESC');

    const page = Math.max(1, params.page);
    const pageSize = Math.min(100, Math.max(1, params.pageSize));

    const total = await qb.getCount();
    const items = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
