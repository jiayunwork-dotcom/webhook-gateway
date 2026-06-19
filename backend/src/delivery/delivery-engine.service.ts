import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulerRegistry, Cron } from '@nestjs/schedule';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { Tenant } from '../entities/tenant.entity';
import { App } from '../entities/app.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { WebhookEvent, EventStatus } from '../entities/webhook-event.entity';
import { DeliveryLog, DeliveryStatus } from '../entities/delivery-log.entity';
import { DeadLetter } from '../entities/dead-letter.entity';
import { ConfigService } from '../config/config.module';
import { RedisService } from '../redis/redis.service';
import { SignatureService } from '../signature/signature.service';
import { EndpointService } from '../endpoints/endpoint.service';
import { EventService } from '../events/event.service';
import { MetricsService } from '../metrics/metrics.service';

export interface DeliveryTask {
  taskId: string;
  eventId: string;
  endpointId: string;
  appId: string;
  tenantId: string;
  attemptNumber: number;
  sequenceNumber: string;
  createdAt: number;
}

export interface DeliveryResult {
  logId: string;
  success: boolean;
  responseStatus?: number;
  durationMs: number;
  errorMessage?: string;
}

@Injectable()
export class DeliveryEngineService implements OnModuleInit {
  private readonly logger = new Logger(DeliveryEngineService.name);
  private processingEndpoints = new Set<string>();

  constructor(
    @InjectRepository(DeliveryLog)
    private readonly deliveryLogRepository: Repository<DeliveryLog>,
    @InjectRepository(DeadLetter)
    private readonly deadLetterRepository: Repository<DeadLetter>,
    @InjectRepository(WebhookEvent)
    private readonly eventRepository: Repository<WebhookEvent>,
    @InjectRepository(Endpoint)
    private readonly endpointRepository: Repository<Endpoint>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly signatureService: SignatureService,
    private readonly endpointService: EndpointService,
    @Inject(forwardRef(() => EventService))
    private readonly eventService: EventService,
    @Inject(forwardRef(() => MetricsService))
    private readonly metricsService: MetricsService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    this.logger.log('Delivery engine initialized');
    this.startQueueProcessor();
    this.startProbeScheduler();
    this.startOldKeyCleanup();
  }

  private queueKey(endpointId: string): string {
    return `delivery:queue:${endpointId}`;
  }

  private processingKey(endpointId: string): string {
    return `delivery:processing:${endpointId}`;
  }

  private rateLimitKey(endpointId: string, second: number): string {
    return `ratelimit:${endpointId}:${second}`;
  }

  private startQueueProcessor() {
    const interval = setInterval(() => {
      this.processAllQueues().catch(err =>
        this.logger.error(`Queue processor error: ${err.message}`, err.stack),
      );
    }, 500);
    this.schedulerRegistry.addInterval('queue-processor', interval);
  }

  private startProbeScheduler() {
    const interval = setInterval(() => {
      this.runProbes().catch(err =>
        this.logger.error(`Probe scheduler error: ${err.message}`, err.stack),
      );
    }, 60000);
    this.schedulerRegistry.addInterval('probe-scheduler', interval);
  }

  private startOldKeyCleanup() {
    const interval = setInterval(() => {
      this.cleanupOldKeys().catch(err =>
        this.logger.error(`Old key cleanup error: ${err.message}`, err.stack),
      );
    }, 3600000);
    this.schedulerRegistry.addInterval('old-key-cleanup', interval);
  }

  @Cron('0 * * * *')
  async cleanupOldKeys() {
    const { AuthService } = await import('../auth/auth.service');
    const auth = (global as any).__authService as any;
    if (auth && typeof auth.cleanupOldKeys === 'function') {
      await auth.cleanupOldKeys();
    }
  }

  async enqueueDelivery(
    tenant: Tenant,
    app: App,
    endpoint: Endpoint,
    event: WebhookEvent,
  ): Promise<void> {
    const task: DeliveryTask = {
      taskId: `${event.id}:${endpoint.id}`,
      eventId: event.id,
      endpointId: endpoint.id,
      appId: app.id,
      tenantId: tenant.id,
      attemptNumber: 0,
      sequenceNumber: event.sequenceNumber,
      createdAt: Date.now(),
    };

    const taskJson = JSON.stringify(task);
    await this.redisService.rpush(this.queueKey(endpoint.id), taskJson);

    await this.metricsService.recordQueueDepth(endpoint.id, await this.getQueueDepth(endpoint.id));
  }

  async getQueueDepth(endpointId: string): Promise<number> {
    return this.redisService.llen(this.queueKey(endpointId));
  }

  private async processAllQueues(): Promise<void> {
    const endpoints = await this.endpointRepository.find({
      where: [{ status: 'healthy' }, { status: 'unhealthy' }],
    });

    for (const endpoint of endpoints) {
      if (!this.processingEndpoints.has(endpoint.id)) {
        this.processEndpointQueue(endpoint).catch(err =>
          this.logger.error(
            `Error processing queue for endpoint ${endpoint.id}: ${err.message}`,
            err.stack,
          ),
        );
      }
    }
  }

  private async processEndpointQueue(endpoint: Endpoint): Promise<void> {
    this.processingEndpoints.add(endpoint.id);
    try {
      const lockKey = `lock:queue:${endpoint.id}`;
      const locked = await this.redisService.acquireLock(lockKey, 30000);
      if (!locked) return;

      try {
        if (endpoint.status === 'unhealthy') {
          const pausedQueue = await this.redisService.llen(this.queueKey(endpoint.id));
          if (pausedQueue > 0) {
            await this.metricsService.recordQueueDepth(endpoint.id, pausedQueue);
          }
          return;
        }

        while (true) {
          const rateAllowed = await this.checkRateLimit(endpoint);
          if (!rateAllowed) {
            break;
          }

          const queueItem = await this.redisService.lpop(this.queueKey(endpoint.id));
          if (!queueItem) break;

          let task: DeliveryTask;
          try {
            task = JSON.parse(queueItem);
          } catch {
            continue;
          }

          try {
            await this.executeDelivery(task, endpoint);
          } catch (err) {
            this.logger.error(
              `Fatal delivery error for task ${task.taskId}: ${err.message}`,
              err.stack,
            );
          }

          const currentDepth = await this.redisService.llen(this.queueKey(endpoint.id));
          await this.metricsService.recordQueueDepth(endpoint.id, currentDepth);
        }
      } finally {
        await this.redisService.releaseLock(lockKey);
      }
    } finally {
      this.processingEndpoints.delete(endpoint.id);
    }
  }

  private async checkRateLimit(endpoint: Endpoint): Promise<boolean> {
    const now = Date.now();
    const secondBucket = Math.floor(now / 1000);
    const key = this.rateLimitKey(endpoint.id, secondBucket);

    const current = await this.redisService.incr(key);
    if (current === 1) {
      await this.redisService.set(key, '1', 2000);
    }

    return current <= endpoint.rateLimitPerSecond;
  }

  private async executeDelivery(task: DeliveryTask, endpoint: Endpoint): Promise<void> {
    const event = await this.eventRepository.findOne({ where: { id: task.eventId } });
    const tenant = await this.tenantRepository.findOne({ where: { id: task.tenantId } });

    if (!event || !tenant) {
      this.logger.warn(`Missing event or tenant for task ${task.taskId}`);
      return;
    }

    const result = await this.performHttpDelivery(tenant, endpoint, event, task.attemptNumber);

    const logEntry = this.deliveryLogRepository.create({
      tenantId: task.tenantId,
      appId: task.appId,
      endpointId: task.endpointId,
      eventId: task.eventId,
      eventType: event.eventType,
      endpointUrl: endpoint.url,
      status: result.success ? 'success' : 'retrying',
      attemptNumber: task.attemptNumber + 1,
      maxAttempts: this.configService.maxRetryCount,
      requestHeaders: result.requestHeaders || null,
      requestBody: JSON.stringify(event.payload),
      responseStatus: result.responseStatus || null,
      responseBody: result.responseBody || null,
      errorMessage: result.errorMessage || null,
      durationMs: result.durationMs,
    });
    await this.deliveryLogRepository.save(logEntry);

    await this.metricsService.recordDelivery(task, endpoint, event, result);

    if (result.success) {
      await this.endpointService.resetFailures(endpoint.id);
      await this.eventService.updateStatus(task.eventId, 'delivered', { deliveredAt: new Date() });
      logEntry.status = 'success';
      await this.deliveryLogRepository.save(logEntry);
    } else {
      const { reachedThreshold } = await this.endpointService.incrementFailure(endpoint.id);
      if (reachedThreshold) {
        this.logger.warn(`Endpoint ${endpoint.id} marked unhealthy after consecutive failures`);
        await this.metricsService.recordEndpointUnhealthy(endpoint.id);
      }

      const nextAttempt = task.attemptNumber + 1;
      if (nextAttempt < this.configService.maxRetryCount) {
        const retryDelay = this.configService.retryIntervals[task.attemptNumber] || this.configService.retryIntervals[this.configService.retryIntervals.length - 1];
        const retryTask: DeliveryTask = {
          ...task,
          attemptNumber: nextAttempt,
        };

        const retryAt = Date.now() + retryDelay;
        await this.scheduleRetry(retryTask, retryAt);

        logEntry.status = 'retrying';
        logEntry.nextRetryAt = new Date(retryAt);
        await this.deliveryLogRepository.save(logEntry);
      } else {
        await this.moveToDeadLetter(task, event, endpoint, result);
        logEntry.status = 'dead_letter';
        await this.deliveryLogRepository.save(logEntry);

        await this.eventService.updateStatus(task.eventId, 'dead_letter', { failedAt: new Date() });
      }
    }
  }

  private async scheduleRetry(task: DeliveryTask, retryAt: number): Promise<void> {
    const retryKey = `retry:scheduled`;
    const member = `${retryAt}:${task.taskId}`;
    await this.redisService.zadd(retryKey, retryAt, JSON.stringify(task));
  }

  @Cron('*/10 * * * * *')
  async processScheduledRetries() {
    const now = Date.now();
    const retryKey = 'retry:scheduled';
    const items = await this.redisService.zrangebyscore(retryKey, 0, now, 100);

    for (const item of items) {
      try {
        const task: DeliveryTask = JSON.parse(item);
        const endpoint = await this.endpointRepository.findOne({ where: { id: task.endpointId } });

        if (endpoint && endpoint.isActive) {
          await this.redisService.rpush(this.queueKey(task.endpointId), item);
        }
        await this.redisService.zrem(retryKey, item);
      } catch (err) {
        this.logger.error(`Error processing retry item: ${err.message}`);
      }
    }
  }

  private async performHttpDelivery(
    tenant: Tenant,
    endpoint: Endpoint,
    event: WebhookEvent,
    attemptNumber: number,
  ): Promise<{
    success: boolean;
    responseStatus?: number;
    durationMs: number;
    errorMessage?: string;
    requestHeaders?: Record<string, string>;
    responseBody?: string;
  }> {
    const payloadStr = JSON.stringify(event.payload);
    const sigResult = this.signatureService.signWithTenant(payloadStr, tenant);

    const eventIdHeader = this.signatureService.generateWebhookId();
    const customHeaders = endpoint.customHeaders || {};

    const headers = this.signatureService.buildSignatureHeaders(sigResult, tenant.apiPublicKey, {
      'X-Webhook-Event-Id': eventIdHeader,
      'X-Webhook-Event-Type': event.eventType,
      'X-Webhook-Attempt': String(attemptNumber + 1),
      'X-Webhook-Delivery-Id': `${event.id}-${endpoint.id}-${attemptNumber + 1}`,
      ...customHeaders,
    });

    const startTime = Date.now();
    const timeout = this.configService.deliveryTimeoutMs;

    try {
      const url = new URL(endpoint.url);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options: http.RequestOptions | https.RequestOptions = {
        method: 'POST',
        hostname: url.hostname,
        port: url.port ? parseInt(url.port, 10) : (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers,
        timeout,
        rejectUnauthorized: false,
      };

      return new Promise(resolve => {
        let responseBody = '';
        const req = lib.request(options, res => {
          res.on('data', chunk => {
            responseBody += chunk.toString();
            if (responseBody.length > 100000) {
              res.destroy();
            }
          });
          res.on('end', () => {
            const duration = Date.now() - startTime;
            const status = res.statusCode || 0;
            const success = status >= 200 && status < 300;

            resolve({
              success,
              responseStatus: status,
              durationMs: duration,
              requestHeaders: headers,
              responseBody: responseBody.slice(0, 10000),
              errorMessage: success ? undefined : `HTTP ${status}`,
            });
          });
        });

        req.on('timeout', () => {
          req.destroy(new Error('Request timed out'));
        });

        req.on('error', err => {
          const duration = Date.now() - startTime;
          resolve({
            success: false,
            durationMs: duration,
            requestHeaders: headers,
            errorMessage: err.message || 'Unknown error',
          });
        });

        req.write(payloadStr);
        req.end();
      });
    } catch (err: any) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        errorMessage: err?.message || 'Failed to initiate request',
        requestHeaders: headers,
      };
    }
  }

  private async moveToDeadLetter(
    task: DeliveryTask,
    event: WebhookEvent,
    endpoint: Endpoint,
    result: { errorMessage?: string; requestHeaders?: Record<string, string> | null },
  ): Promise<void> {
    const dl = this.deadLetterRepository.create({
      tenantId: task.tenantId,
      appId: task.appId,
      endpointId: task.endpointId,
      eventId: task.eventId,
      eventType: event.eventType,
      endpointUrl: endpoint.url,
      payload: event.payload,
      requestHeaders: result.requestHeaders || null,
      lastErrorMessage: result.errorMessage || null,
      retryCount: task.attemptNumber,
    });
    await this.deadLetterRepository.save(dl);
    await this.metricsService.recordDeadLetter(task.endpointId);
    this.logger.warn(`Event ${task.eventId} moved to dead letter for endpoint ${endpoint.id}`);
  }

  async testDelivery(
    tenant: Tenant,
    app: App,
    endpoint: Endpoint,
    event: WebhookEvent,
  ): Promise<{ logId: string; success: boolean; responseStatus?: number; durationMs: number; errorMessage?: string }> {
    const result = await this.performHttpDelivery(tenant, endpoint, event, 0);

    const logEntry = this.deliveryLogRepository.create({
      tenantId: tenant.id,
      appId: app.id,
      endpointId: endpoint.id,
      eventId: event.id,
      eventType: event.eventType,
      endpointUrl: endpoint.url,
      status: result.success ? 'success' : 'failed',
      attemptNumber: 1,
      maxAttempts: 1,
      requestHeaders: result.requestHeaders || null,
      requestBody: JSON.stringify(event.payload),
      responseStatus: result.responseStatus || null,
      responseBody: result.responseBody || null,
      errorMessage: result.errorMessage || null,
      durationMs: result.durationMs,
    });
    const saved = await this.deliveryLogRepository.save(logEntry);

    return {
      logId: saved.id,
      success: result.success,
      responseStatus: result.responseStatus,
      durationMs: result.durationMs,
      errorMessage: result.errorMessage,
    };
  }

  async runProbes() {
    const now = Date.now();
    const probeInterval = this.configService.probeIntervalMs;

    const unhealthyEndpoints = await this.endpointRepository.find({
      where: { status: 'unhealthy' },
    });

    for (const endpoint of unhealthyEndpoints) {
      const shouldProbe = !endpoint.lastProbeAt ||
        now - new Date(endpoint.lastProbeAt).getTime() >= probeInterval;

      if (shouldProbe) {
        this.runProbe(endpoint).catch(err =>
          this.logger.error(`Probe error for ${endpoint.id}: ${err.message}`),
        );
      }
    }
  }

  private async runProbe(endpoint: Endpoint): Promise<void> {
    const tenant = await this.tenantRepository
      .createQueryBuilder('t')
      .innerJoin('app', 'a', 'a."tenantId" = t.id')
      .where('a.id = :appId', { appId: endpoint.appId })
      .getOne();

    if (!tenant) return;

    this.logger.log(`Running probe for endpoint ${endpoint.id}`);

    const probePayload = JSON.stringify({ probe: true, timestamp: new Date().toISOString() });
    const sigResult = this.signatureService.signWithTenant(probePayload, tenant);
    const headers = this.signatureService.buildSignatureHeaders(sigResult, tenant.apiPublicKey, {
      'X-Webhook-Probe': 'true',
      ...(endpoint.customHeaders || {}),
    });

    let success = false;
    const timeout = this.configService.deliveryTimeoutMs;

    try {
      const url = new URL(endpoint.url);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options: any = {
        method: 'POST',
        hostname: url.hostname,
        port: url.port ? parseInt(url.port, 10) : (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers,
        timeout,
        rejectUnauthorized: false,
      };

      success = await new Promise<boolean>(resolve => {
        let body = '';
        const req = lib.request(options, res => {
          res.on('data', c => (body += c));
          res.on('end', () => {
            resolve(res.statusCode ? res.statusCode >= 200 && res.statusCode < 300 : false);
          });
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.write(probePayload);
        req.end();
      });
    } catch {
      success = false;
    }

    const { recovered } = await this.endpointService.handleProbeResult(endpoint.id, success);
    if (recovered) {
      this.logger.log(`Endpoint ${endpoint.id} recovered after successful probes`);
      await this.metricsService.recordEndpointRecovered(endpoint.id);
    }
  }

  async resentDeadLetter(tenantId: string, deadLetterId: string): Promise<{ success: boolean }> {
    const dl = await this.deadLetterRepository
      .createQueryBuilder('dl')
      .where('dl.id = :id AND dl.tenantId = :tenantId', { id: deadLetterId, tenantId })
      .getOne();

    if (!dl) {
      return { success: false };
    }

    const endpoint = await this.endpointRepository.findOne({ where: { id: dl.endpointId } });
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    const app = { id: dl.appId } as App;

    if (!endpoint || !tenant) {
      return { success: false };
    }

    const sequence = await this.eventRepository.count({ where: { appId: dl.appId } }) + 1;
    const newEvent = this.eventRepository.create({
      appId: dl.appId,
      eventType: dl.eventType,
      eventSource: 'dead_letter_resend',
      payload: dl.payload,
      payloadSize: Buffer.byteLength(JSON.stringify(dl.payload)),
      status: 'processing',
      sequenceNumber: String(sequence),
      processedAt: new Date(),
    });
    const savedEvent = await this.eventRepository.save(newEvent);

    await this.enqueueDelivery(tenant, app, endpoint, savedEvent);

    dl.isResent = true;
    dl.resentAt = new Date();
    await this.deadLetterRepository.save(dl);

    return { success: true };
  }

  async bulkResendDeadLetters(tenantId: string, ids: string[]): Promise<{ count: number }> {
    let count = 0;
    for (const id of ids) {
      const result = await this.resentDeadLetter(tenantId, id);
      if (result.success) count++;
    }
    return { count };
  }

  async discardDeadLetter(tenantId: string, deadLetterId: string): Promise<{ success: boolean }> {
    const dl = await this.deadLetterRepository
      .createQueryBuilder('dl')
      .where('dl.id = :id AND dl.tenantId = :tenantId', { id: deadLetterId, tenantId })
      .getOne();

    if (!dl) return { success: false };

    dl.isDiscarded = true;
    dl.discardedAt = new Date();
    await this.deadLetterRepository.save(dl);
    return { success: true };
  }

  async bulkDiscardDeadLetters(tenantId: string, ids: string[]): Promise<{ count: number }> {
    let count = 0;
    for (const id of ids) {
      const result = await this.discardDeadLetter(tenantId, id);
      if (result.success) count++;
    }
    return { count };
  }
}
