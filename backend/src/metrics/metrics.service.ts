import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulerRegistry, Cron } from '@nestjs/schedule';
import { Metric, MetricGranularity } from '../entities/metric.entity';
import { DeliveryLog } from '../entities/delivery-log.entity';
import { DeadLetter } from '../entities/dead-letter.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { DeliveryTask } from '../delivery/delivery-engine.service';
import { WebhookEvent } from '../entities/webhook-event.entity';
import { AlertService } from '../alerts/alert.service';

interface DeliveryResult {
  success: boolean;
  responseStatus?: number;
  durationMs: number;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.class);

  constructor(
    @InjectRepository(Metric)
    private readonly metricRepository: Repository<Metric>,
    @InjectRepository(DeliveryLog)
    private readonly deliveryLogRepository: Repository<DeliveryLog>,
    @InjectRepository(DeadLetter)
    private readonly deadLetterRepository: Repository<DeadLetter>,
    @InjectRepository(Endpoint)
    private readonly endpointRepository: Repository<Endpoint>,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(forwardRef(() => AlertService))
    private readonly alertService: AlertService,
  ) {}

  async recordDelivery(
    task: DeliveryTask,
    endpoint: Endpoint,
    event: WebhookEvent,
    result: DeliveryResult,
  ): Promise<void> {
    try {
      const now = new Date();
      const values = [
        { tenantId: task.tenantId, appId: null, endpointId: null },
        { tenantId: task.tenantId, appId: task.appId, endpointId: null },
        { tenantId: task.tenantId, appId: task.appId, endpointId: task.endpointId },
      ];

      for (const scope of values) {
        await this.upsertMinuteMetric({
          ...scope,
          timestamp: this.floorDate(now, 'minute'),
          granularity: 'minute',
          success: result.success,
          durationMs: result.durationMs,
          isRetry: task.attemptNumber > 0,
        });
      }

      await this.alertService.checkDeliveryAlert(task, endpoint, result);
    } catch (err) {
      this.logger.error(`Failed to record metric: ${err.message}`);
    }
  }

  async recordQueueDepth(endpointId: string, depth: number): Promise<void> {
    try {
      const endpoint = await this.endpointRepository.findOne({ where: { id: endpointId }, relations: ['app'] });
      if (!endpoint) return;

      const app = endpoint.app as any;
      const now = new Date();

      const metric = this.metricRepository.create({
        tenantId: app.tenantId,
        appId: endpoint.appId,
        endpointId,
        timestamp: this.floorDate(now, 'minute'),
        granularity: 'minute',
        queueDepth: depth,
      });

      await this.metricRepository.save(metric).catch(() => {});
    } catch {}
  }

  async recordDeadLetter(endpointId: string): Promise<void> {
    try {
      const endpoint = await this.endpointRepository.findOne({ where: { id: endpointId }, relations: ['app'] });
      if (!endpoint) return;
      const app = endpoint.app as any;

      const now = new Date();
      const values = [
        { tenantId: app.tenantId, appId: null, endpointId: null },
        { tenantId: app.tenantId, appId: endpoint.appId, endpointId: null },
        { tenantId: app.tenantId, appId: endpoint.appId, endpointId },
      ];

      for (const scope of values) {
        const metric = this.metricRepository.create({
          ...scope,
          timestamp: this.floorDate(now, 'minute'),
          granularity: 'minute',
          deadLetterCount: 1,
        });
        await this.metricRepository.save(metric).catch(() => {});
      }
    } catch {}
  }

  async recordEndpointUnhealthy(endpointId: string): Promise<void> {
    try {
      const endpoint = await this.endpointRepository.findOne({ where: { id: endpointId }, relations: ['app'] });
      if (!endpoint) return;
      const app = endpoint.app as any;
      await this.alertService.triggerEndpointUnhealthy(app.tenantId, endpoint.appId, endpointId);
    } catch {}
  }

  async recordEndpointRecovered(endpointId: string): Promise<void> {
    try {
      const endpoint = await this.endpointRepository.findOne({ where: { id: endpointId }, relations: ['app'] });
      if (!endpoint) return;
      const app = endpoint.app as any;
      await this.alertService.resolveEndpointRecovered(app.tenantId, endpoint.appId, endpointId);
    } catch {}
  }

  private floorDate(date: Date, granularity: MetricGranularity): Date {
    const d = new Date(date);
    d.setMilliseconds(0);
    d.setSeconds(0);
    if (granularity === 'hour' || granularity === 'day') {
      d.setMinutes(0);
    }
    if (granularity === 'day') {
      d.setHours(0);
    }
    return d;
  }

  private async upsertMinuteMetric(dto: {
    tenantId: string;
    appId: string | null;
    endpointId: string | null;
    timestamp: Date;
    granularity: MetricGranularity;
    success: boolean;
    durationMs: number;
    isRetry: boolean;
  }): Promise<void> {
    const existing = await this.metricRepository.findOne({
      where: {
        tenantId: dto.tenantId,
        appId: dto.appId,
        endpointId: dto.endpointId,
        timestamp: dto.timestamp,
        granularity: dto.granularity,
      },
    });

    if (existing) {
      existing.totalDeliveries += 1;
      if (dto.success) existing.successfulDeliveries += 1;
      else existing.failedDeliveries += 1;
      if (dto.isRetry) existing.retriedDeliveries += 1;
      existing.totalLatencyMs = (BigInt(existing.totalLatencyMs) + BigInt(dto.durationMs)).toString();
      if (!existing.minLatencyMs || dto.durationMs < parseInt(existing.minLatencyMs)) {
        existing.minLatencyMs = String(dto.durationMs);
      }
      if (!existing.maxLatencyMs || dto.durationMs > parseInt(existing.maxLatencyMs)) {
        existing.maxLatencyMs = String(dto.durationMs);
      }
      await this.metricRepository.save(existing);
    } else {
      const metric = this.metricRepository.create({
        tenantId: dto.tenantId,
        appId: dto.appId,
        endpointId: dto.endpointId,
        timestamp: dto.timestamp,
        granularity: dto.granularity,
        totalDeliveries: 1,
        successfulDeliveries: dto.success ? 1 : 0,
        failedDeliveries: dto.success ? 0 : 1,
        retriedDeliveries: dto.isRetry ? 1 : 0,
        totalLatencyMs: String(dto.durationMs),
        minLatencyMs: String(dto.durationMs),
        maxLatencyMs: String(dto.durationMs),
      });
      await this.metricRepository.save(metric);
    }
  }

  @Cron('5 * * * *')
  async rollupHourlyMetrics() {
    try {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const minuteMetrics = await this.metricRepository
        .createQueryBuilder('m')
        .where('m.granularity = :granularity', { granularity: 'minute' })
        .andWhere('m.timestamp >= :start AND m.timestamp < :end', { start: oneHourAgo, end: now })
        .getMany();

      const grouped = new Map<string, Metric>();
      for (const mm of minuteMetrics) {
        const key = `${mm.tenantId}:${mm.appId || ''}:${mm.endpointId || ''}:hour`;
        const hourTs = this.floorDate(mm.timestamp, 'hour');

        if (!grouped.has(key)) {
          grouped.set(key, this.metricRepository.create({
            tenantId: mm.tenantId,
            appId: mm.appId,
            endpointId: mm.endpointId,
            timestamp: hourTs,
            granularity: 'hour',
            totalDeliveries: 0,
            successfulDeliveries: 0,
            failedDeliveries: 0,
            retriedDeliveries: 0,
            deadLetterCount: 0,
            totalLatencyMs: '0',
            minLatencyMs: '0',
            maxLatencyMs: '0',
          }));
        }

        const agg = grouped.get(key)!;
        agg.totalDeliveries += mm.totalDeliveries;
        agg.successfulDeliveries += mm.successfulDeliveries;
        agg.failedDeliveries += mm.failedDeliveries;
        agg.retriedDeliveries += mm.retriedDeliveries;
        agg.deadLetterCount += mm.deadLetterCount;
        agg.queueDepth = Math.max(agg.queueDepth, mm.queueDepth);
        agg.totalLatencyMs = (BigInt(agg.totalLatencyMs) + BigInt(mm.totalLatencyMs)).toString();
        if (!agg.minLatencyMs || parseInt(mm.minLatencyMs) < parseInt(agg.minLatencyMs)) {
          agg.minLatencyMs = mm.minLatencyMs;
        }
        if (parseInt(mm.maxLatencyMs) > parseInt(agg.maxLatencyMs)) {
          agg.maxLatencyMs = mm.maxLatencyMs;
        }
      }

      for (const agg of grouped.values()) {
        await this.metricRepository.save(agg).catch(() => {});
      }

      this.logger.log(`Rolled up ${grouped.size} hourly metric aggregates`);
    } catch (err) {
      this.logger.error(`Hourly rollup error: ${err.message}`);
    }
  }

  @Cron('10 0 * * *')
  async rollupDailyMetrics() {
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const hourMetrics = await this.metricRepository
        .createQueryBuilder('m')
        .where('m.granularity = :granularity', { granularity: 'hour' })
        .andWhere('m.timestamp >= :start AND m.timestamp < :end', { start: oneDayAgo, end: now })
        .getMany();

      const grouped = new Map<string, Metric>();
      for (const hm of hourMetrics) {
        const key = `${hm.tenantId}:${hm.appId || ''}:${hm.endpointId || ''}:day`;
        const dayTs = this.floorDate(hm.timestamp, 'day');

        if (!grouped.has(key)) {
          grouped.set(key, this.metricRepository.create({
            tenantId: hm.tenantId,
            appId: hm.appId,
            endpointId: hm.endpointId,
            timestamp: dayTs,
            granularity: 'day',
            totalDeliveries: 0,
            successfulDeliveries: 0,
            failedDeliveries: 0,
            retriedDeliveries: 0,
            deadLetterCount: 0,
            totalLatencyMs: '0',
            minLatencyMs: '0',
            maxLatencyMs: '0',
          }));
        }

        const agg = grouped.get(key)!;
        agg.totalDeliveries += hm.totalDeliveries;
        agg.successfulDeliveries += hm.successfulDeliveries;
        agg.failedDeliveries += hm.failedDeliveries;
        agg.retriedDeliveries += hm.retriedDeliveries;
        agg.deadLetterCount += hm.deadLetterCount;
        agg.queueDepth = Math.max(agg.queueDepth, hm.queueDepth);
        agg.totalLatencyMs = (BigInt(agg.totalLatencyMs) + BigInt(hm.totalLatencyMs)).toString();
        if (!agg.minLatencyMs || parseInt(hm.minLatencyMs) < parseInt(agg.minLatencyMs)) {
          agg.minLatencyMs = hm.minLatencyMs;
        }
        if (parseInt(hm.maxLatencyMs) > parseInt(agg.maxLatencyMs)) {
          agg.maxLatencyMs = hm.maxLatencyMs;
        }
      }

      for (const agg of grouped.values()) {
        await this.metricRepository.save(agg).catch(() => {});
      }

      this.logger.log(`Rolled up ${grouped.size} daily metric aggregates`);
    } catch (err) {
      this.logger.error(`Daily rollup error: ${err.message}`);
    }
  }

  async getTenantOverview(
    tenantId: string,
    granularity: MetricGranularity = 'hour',
    startDate?: Date,
    endDate?: Date,
  ) {
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 24 * 60 * 60 * 1000);

    const metrics = await this.metricRepository
      .createQueryBuilder('m')
      .where('m.tenantId = :tenantId', { tenantId })
      .andWhere('m.appId IS NULL AND m.endpointId IS NULL')
      .andWhere('m.granularity = :granularity', { granularity })
      .andWhere('m.timestamp >= :start AND m.timestamp <= :end', { start, end })
      .orderBy('m.timestamp', 'ASC')
      .getMany();

    const totalDeliveries = metrics.reduce((s, m) => s + m.totalDeliveries, 0);
    const successful = metrics.reduce((s, m) => s + m.successfulDeliveries, 0);
    const failed = metrics.reduce((s, m) => s + m.failedDeliveries, 0);
    const retried = metrics.reduce((s, m) => s + m.retriedDeliveries, 0);
    const deadLetters = metrics.reduce((s, m) => s + m.deadLetterCount, 0);
    const totalLatency = metrics.reduce((s, m) => s + parseInt(m.totalLatencyMs || '0'), 0);
    const maxQueueDepth = metrics.reduce((s, m) => Math.max(s, m.queueDepth), 0);

    const avgLatency = totalDeliveries > 0 ? Math.round(totalLatency / totalDeliveries) : 0;
    const successRate = totalDeliveries > 0 ? ((successful / totalDeliveries) * 100).toFixed(2) : '100.00';

    return {
      summary: {
        totalDeliveries,
        successfulDeliveries: successful,
        failedDeliveries: failed,
        retriedDeliveries: retried,
        deadLetterCount: deadLetters,
        successRate: parseFloat(successRate),
        averageLatencyMs: avgLatency,
        maxQueueDepth,
      },
      timeseries: metrics.map(m => ({
        timestamp: m.timestamp,
        total: m.totalDeliveries,
        successful: m.successfulDeliveries,
        failed: m.failedDeliveries,
        averageLatencyMs: m.totalDeliveries > 0
          ? Math.round(parseInt(m.totalLatencyMs) / m.totalDeliveries)
          : 0,
        queueDepth: m.queueDepth,
        deadLetterCount: m.deadLetterCount,
      })),
    };
  }

  async getAppMetrics(
    tenantId: string,
    appId: string,
    granularity: MetricGranularity = 'hour',
    startDate?: Date,
    endDate?: Date,
  ) {
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 24 * 60 * 60 * 1000);

    const metrics = await this.metricRepository
      .createQueryBuilder('m')
      .where('m.tenantId = :tenantId', { tenantId })
      .andWhere('m.appId = :appId', { appId })
      .andWhere('m.endpointId IS NULL')
      .andWhere('m.granularity = :granularity', { granularity })
      .andWhere('m.timestamp >= :start AND m.timestamp <= :end', { start, end })
      .orderBy('m.timestamp', 'ASC')
      .getMany();

    const totalDeliveries = metrics.reduce((s, m) => s + m.totalDeliveries, 0);
    const successful = metrics.reduce((s, m) => s + m.successfulDeliveries, 0);
    const totalLatency = metrics.reduce((s, m) => s + parseInt(m.totalLatencyMs || '0'), 0);

    return {
      summary: {
        totalDeliveries,
        successfulDeliveries: successful,
        successRate: totalDeliveries > 0 ? ((successful / totalDeliveries) * 100).toFixed(2) : '100.00',
        averageLatencyMs: totalDeliveries > 0 ? Math.round(totalLatency / totalDeliveries) : 0,
        maxQueueDepth: metrics.reduce((s, m) => Math.max(s, m.queueDepth), 0),
        deadLetterCount: metrics.reduce((s, m) => s + m.deadLetterCount, 0),
      },
      timeseries: metrics.map(m => ({
        timestamp: m.timestamp,
        total: m.totalDeliveries,
        successful: m.successfulDeliveries,
        failed: m.failedDeliveries,
        averageLatencyMs: m.totalDeliveries > 0
          ? Math.round(parseInt(m.totalLatencyMs) / m.totalDeliveries)
          : 0,
        queueDepth: m.queueDepth,
      })),
    };
  }

  async getEndpointMetrics(
    tenantId: string,
    endpointId: string,
    granularity: MetricGranularity = 'hour',
    startDate?: Date,
    endDate?: Date,
  ) {
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 24 * 60 * 60 * 1000);

    const metrics = await this.metricRepository
      .createQueryBuilder('m')
      .innerJoinAndSelect(Endpoint, 'e', 'e.id = m.endpointId')
      .innerJoinAndSelect('e.app', 'app')
      .where('app.tenantId = :tenantId', { tenantId })
      .andWhere('m.endpointId = :endpointId', { endpointId })
      .andWhere('m.granularity = :granularity', { granularity })
      .andWhere('m.timestamp >= :start AND m.timestamp <= :end', { start, end })
      .orderBy('m.timestamp', 'ASC')
      .getMany();

    const totalDeliveries = metrics.reduce((s, m) => s + m.totalDeliveries, 0);
    const successful = metrics.reduce((s, m) => s + m.successfulDeliveries, 0);
    const totalLatency = metrics.reduce((s, m) => s + parseInt(m.totalLatencyMs || '0'), 0);

    return {
      summary: {
        totalDeliveries,
        successfulDeliveries: successful,
        successRate: totalDeliveries > 0 ? ((successful / totalDeliveries) * 100).toFixed(2) : '100.00',
        averageLatencyMs: totalDeliveries > 0 ? Math.round(totalLatency / totalDeliveries) : 0,
        maxQueueDepth: metrics.reduce((s, m) => Math.max(s, m.queueDepth), 0),
        deadLetterCount: metrics.reduce((s, m) => s + m.deadLetterCount, 0),
      },
      timeseries: metrics.map(m => ({
        timestamp: m.timestamp,
        total: m.totalDeliveries,
        successful: m.successfulDeliveries,
        failed: m.failedDeliveries,
        averageLatencyMs: m.totalDeliveries > 0
          ? Math.round(parseInt(m.totalLatencyMs) / m.totalDeliveries)
          : 0,
        queueDepth: m.queueDepth,
      })),
    };
  }
}
