import { Injectable, Logger, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { ReplayTask, ReplayTaskStatus } from '../entities/replay-task.entity';
import { ReplayItem, ReplayItemStatus } from '../entities/replay-item.entity';
import { DeliveryLog } from '../entities/delivery-log.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.module';
import { IsArray, IsString, MaxLength, IsOptional, IsDateString } from 'class-validator';

export class CreateReplayTaskDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsArray()
  @IsString({ each: true })
  logIds: string[];

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | Date;
}

export interface ComparisonSummary {
  originalSuccessRate: number;
  replaySuccessRate: number;
  originalAvgDurationMs: number;
  replayAvgDurationMs: number;
  originalStatusDistribution: Record<number, number>;
  replayStatusDistribution: Record<number, number>;
}

export interface ComparisonItem {
  replayItemId: string;
  originalAvailable: boolean;
  original?: {
    responseStatus: number | null;
    durationMs: number;
    responseBody: string | null;
  };
  replay: {
    responseStatus: number | null;
    durationMs: number;
    responseBody: string | null;
  };
  diff: {
    statusChanged: boolean;
    originalStatus: number | null;
    replayStatus: number | null;
    durationChangePercent: number | null;
    durationFaster: boolean | null;
    responseBodyDiff: string[] | null;
  };
}

export interface ComparisonResult {
  summary: ComparisonSummary;
  items: ComparisonItem[];
}

const MAX_REPLAY_ITEMS = 200;

@Injectable()
export class ReplayService implements OnModuleInit {
  private readonly logger = new Logger(ReplayService.name);
  private processingTasks = new Set<string>();

  constructor(
    @InjectRepository(ReplayTask)
    private readonly replayTaskRepository: Repository<ReplayTask>,
    @InjectRepository(ReplayItem)
    private readonly replayItemRepository: Repository<ReplayItem>,
    @InjectRepository(DeliveryLog)
    private readonly deliveryLogRepository: Repository<DeliveryLog>,
    @InjectRepository(Endpoint)
    private readonly endpointRepository: Repository<Endpoint>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    this.logger.log('Replay service initialized');
    this.startReplayProcessor();
    this.startScheduledTaskScanner();
  }

  private startReplayProcessor() {
    const interval = setInterval(() => {
      this.processQueuedTasks().catch(err =>
        this.logger.error(`Replay processor error: ${err.message}`, err.stack),
      );
    }, 1000);
    this.schedulerRegistry.addInterval('replay-processor', interval);
  }

  private startScheduledTaskScanner() {
    const interval = setInterval(() => {
      this.scanScheduledTasks().catch(err =>
        this.logger.error(`Scheduled task scanner error: ${err.message}`, err.stack),
      );
    }, 30000);
    this.schedulerRegistry.addInterval('replay-scheduled-scanner', interval);
  }

  private async scanScheduledTasks(): Promise<void> {
    const now = new Date();
    const waitingTasks = await this.replayTaskRepository.find({
      where: { status: 'waiting' as ReplayTaskStatus },
    });

    for (const task of waitingTasks) {
      if (task.scheduledAt && task.scheduledAt <= now) {
        this.logger.log(`Scheduled replay task ${task.id} reached scheduled time, changing to queued`);
        task.status = 'queued';
        task.scheduledAt = null;
        await this.replayTaskRepository.save(task);
      }
    }
  }

  private rateLimitKey(endpointId: string, second: number): string {
    return `replay:ratelimit:${endpointId}:${second}`;
  }

  async createTask(tenantId: string, dto: CreateReplayTaskDto): Promise<ReplayTask> {
    if (dto.logIds.length === 0) {
      throw new HttpException('请至少选择一条日志记录', HttpStatus.BAD_REQUEST);
    }
    if (dto.logIds.length > MAX_REPLAY_ITEMS) {
      throw new HttpException(`单次回放任务最多包含 ${MAX_REPLAY_ITEMS} 条事件`, HttpStatus.BAD_REQUEST);
    }

    let scheduledAt: Date | null = null;
    if (dto.scheduledAt) {
      if (dto.scheduledAt instanceof Date) {
        scheduledAt = dto.scheduledAt;
      } else {
        scheduledAt = new Date(dto.scheduledAt);
      }
      if (isNaN(scheduledAt.getTime())) {
        throw new HttpException('计划执行时间格式无效', HttpStatus.BAD_REQUEST);
      }
      if (scheduledAt <= new Date()) {
        throw new HttpException('计划执行时间必须是未来时间', HttpStatus.BAD_REQUEST);
      }
    }

    const logs = await this.deliveryLogRepository.find({
      where: { id: In(dto.logIds) },
    });

    if (logs.length !== dto.logIds.length) {
      throw new HttpException('部分日志记录不存在', HttpStatus.BAD_REQUEST);
    }

    const tenantIds = new Set(logs.map(l => l.tenantId));
    if (tenantIds.size > 1) {
      throw new HttpException('选中的日志条目必须都属于同一个租户', HttpStatus.BAD_REQUEST);
    }
    if (logs[0].tenantId !== tenantId) {
      throw new HttpException('无权限操作这些日志记录', HttpStatus.FORBIDDEN);
    }

    const endpointIds = [...new Set(logs.map(l => l.endpointId))];
    const endpoints = await this.endpointRepository.find({
      where: { id: In(endpointIds) },
    });
    const endpointMap = new Map(endpoints.map(e => [e.id, e]));

    const initialStatus = scheduledAt ? 'waiting' as ReplayTaskStatus : 'queued' as ReplayTaskStatus;

    const task = this.replayTaskRepository.create({
      tenantId,
      name: dto.name,
      status: initialStatus,
      totalCount: logs.length,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      scheduledAt,
      items: logs.map(log => {
        const ep = endpointMap.get(log.endpointId);
        return this.replayItemRepository.create({
          originalLogId: log.id,
          endpointId: log.endpointId,
          endpointName: ep?.name || log.endpointId.slice(0, 8),
          eventType: log.eventType,
          endpointUrl: log.endpointUrl,
          requestHeaders: log.requestHeaders,
          requestBody: log.requestBody,
          status: 'pending',
        });
      }),
    });

    return this.replayTaskRepository.save(task);
  }

  async listTasks(tenantId: string, status?: ReplayTaskStatus, limit = 100, offset = 0): Promise<{ items: ReplayTask[]; total: number }> {
    const where: any = { tenantId };
    if (status) where.status = status;

    const [items, total] = await this.replayTaskRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { items, total };
  }

  async getTaskDetail(tenantId: string, taskId: string): Promise<(ReplayTask & { items: ReplayItem[] }) | null> {
    const task = await this.replayTaskRepository.findOne({
      where: { id: taskId, tenantId },
    });
    if (!task) return null;

    const items = await this.replayItemRepository.find({
      where: { taskId },
      order: { createdAt: 'ASC' },
    });

    return { ...task, items };
  }

  async retryFailedItems(tenantId: string, taskId: string): Promise<{ success: boolean; retryCount: number }> {
    const task = await this.replayTaskRepository.findOne({
      where: { id: taskId, tenantId },
    });
    if (!task) return { success: false, retryCount: 0 };

    if (task.status === 'running' || task.status === 'queued') {
      throw new HttpException('任务正在执行中，无法重试', HttpStatus.BAD_REQUEST);
    }

    const failedItems = await this.replayItemRepository.find({
      where: { taskId, status: In(['failed', 'rate_limited']) },
    });

    if (failedItems.length === 0) {
      return { success: true, retryCount: 0 };
    }

    const retryCount = failedItems.length;

    for (const item of failedItems) {
      item.status = 'pending';
      item.responseStatus = null;
      item.durationMs = 0;
      item.errorMessage = null;
      item.executedAt = null;
    }
    await this.replayItemRepository.save(failedItems);

    task.status = 'queued';
    task.processedCount = task.totalCount - retryCount;
    task.failedCount = 0;
    task.finishedAt = null;
    await this.replayTaskRepository.save(task);

    return { success: true, retryCount };
  }

  private async processQueuedTasks(): Promise<void> {
    const queuedTasks = await this.replayTaskRepository.find({
      where: [{ status: 'queued' }, { status: 'running' }],
      order: { createdAt: 'ASC' },
      take: 10,
    });

    for (const task of queuedTasks) {
      if (!this.processingTasks.has(task.id)) {
        this.processTask(task).catch(err =>
          this.logger.error(`Error processing replay task ${task.id}: ${err.message}`, err.stack),
        );
      }
    }
  }

  private async processTask(task: ReplayTask): Promise<void> {
    this.processingTasks.add(task.id);
    const lockKey = `lock:replay:${task.id}`;
    const locked = await this.redisService.acquireLock(lockKey, 300000);
    if (!locked) {
      this.processingTasks.delete(task.id);
      return;
    }

    try {
      if (task.status === 'queued') {
        task.status = 'running';
        task.startedAt = new Date();
        await this.replayTaskRepository.save(task);
      }

      let hasMore = true;
      while (hasMore) {
        const pendingItems = await this.replayItemRepository.find({
          where: { taskId: task.id, status: 'pending' },
          take: 10,
          order: { createdAt: 'ASC' },
        });

        if (pendingItems.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of pendingItems) {
          await this.executeReplayItem(task, item);
        }
      }

      await this.updateTaskFinalStatus(task.id);
    } catch (err) {
      this.logger.error(`Fatal error in replay task ${task.id}: ${err.message}`);
      await this.replayTaskRepository.update(task.id, { status: 'failed' });
    } finally {
      await this.redisService.releaseLock(lockKey);
      this.processingTasks.delete(task.id);
    }
  }

  private async checkRateLimit(endpointId: string): Promise<boolean> {
    const endpoint = await this.endpointRepository.findOne({ where: { id: endpointId } });
    if (!endpoint) return true;

    const limit = endpoint.rateLimitPerSecond;
    if (!limit || limit <= 0) {
      return true;
    }

    const now = Date.now();
    const secondBucket = Math.floor(now / 1000);
    const key = this.rateLimitKey(endpointId, secondBucket);

    const client = this.redisService.getClient();
    const [incrResult] = await client
      .multi()
      .incr(key)
      .expire(key, 3)
      .exec();

    const current = incrResult && typeof incrResult[1] === 'number' ? incrResult[1] : 0;

    if (current > limit) {
      this.logger.debug(
        `Replay rate limit exceeded for endpoint ${endpointId}: ${current}/${limit}`,
      );
      return false;
    }

    return true;
  }

  private async executeReplayItem(task: ReplayTask, item: ReplayItem): Promise<void> {
    const rateAllowed = await this.checkRateLimit(item.endpointId);
    if (!rateAllowed) {
      item.status = 'rate_limited';
      item.errorMessage = '触发端点速率限制';
      item.executedAt = new Date();
      await this.replayItemRepository.save(item);
      await this.incrementTaskCounters(task.id, false);
      return;
    }

    const startTime = Date.now();
    const timeout = this.configService.deliveryTimeoutMs;

    const headers: Record<string, string> = {
      ...(item.requestHeaders || {}),
      'X-Webhook-Replay': 'true',
    };
    delete headers['host'];
    delete headers['content-length'];

    try {
      const url = new URL(item.endpointUrl);
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

      const result = await new Promise<{ success: boolean; responseStatus?: number; durationMs: number; errorMessage?: string; responseBody?: string }>(resolve => {
        let responseBody = '';
        const req = lib.request(options, res => {
          res.on('data', chunk => {
            responseBody += chunk.toString();
            if (responseBody.length > 100000) res.destroy();
          });
          res.on('end', () => {
            const duration = Date.now() - startTime;
            const status = res.statusCode || 0;
            const success = status >= 200 && status < 300;
            resolve({
              success,
              responseStatus: status,
              durationMs: duration,
              responseBody: responseBody.slice(0, 10000),
              errorMessage: success ? undefined : `HTTP ${status}`,
            });
          });
        });

        req.on('timeout', () => req.destroy(new Error('Request timed out')));
        req.on('error', err => {
          resolve({
            success: false,
            durationMs: Date.now() - startTime,
            errorMessage: err.message || 'Unknown error',
          });
        });

        if (item.requestBody) req.write(item.requestBody);
        req.end();
      });

      item.status = result.success ? 'success' : 'failed';
      item.responseStatus = result.responseStatus || null;
      item.durationMs = result.durationMs;
      item.errorMessage = result.errorMessage || null;
      item.responseBody = result.responseBody || null;
      item.executedAt = new Date();
    } catch (err: any) {
      item.status = 'failed';
      item.durationMs = Date.now() - startTime;
      item.errorMessage = err?.message || 'Failed to initiate request';
      item.executedAt = new Date();
    }

    await this.replayItemRepository.save(item);
    await this.incrementTaskCounters(task.id, item.status === 'success');
  }

  private async incrementTaskCounters(taskId: string, success: boolean): Promise<void> {
    const task = await this.replayTaskRepository.findOne({ where: { id: taskId } });
    if (!task) return;

    task.processedCount += 1;
    if (success) task.successCount += 1;
    else task.failedCount += 1;

    await this.replayTaskRepository.save(task);
  }

  private async updateTaskFinalStatus(taskId: string): Promise<void> {
    const task = await this.replayTaskRepository.findOne({ where: { id: taskId } });
    if (!task) return;

    const pendingCount = await this.replayItemRepository.count({
      where: { taskId, status: 'pending' },
    });

    if (pendingCount > 0) return;

    if (task.failedCount === 0) {
      task.status = 'completed';
    } else if (task.successCount === 0) {
      task.status = 'failed';
    } else {
      task.status = 'partially_failed';
    }
    task.finishedAt = new Date();
    await this.replayTaskRepository.save(task);
  }

  async getComparison(tenantId: string, taskId: string): Promise<ComparisonResult | null> {
    const task = await this.replayTaskRepository.findOne({
      where: { id: taskId, tenantId },
    });
    if (!task) return null;

    const items = await this.replayItemRepository.find({
      where: { taskId },
      order: { createdAt: 'ASC' },
    });

    const originalLogIds = items.map(i => i.originalLogId);
    const originalLogs = await this.deliveryLogRepository.find({
      where: { id: In(originalLogIds) },
    });
    const logMap = new Map(originalLogs.map(l => [l.id, l]));

    const comparisonItems: ComparisonItem[] = [];
    let originalTotalDuration = 0;
    let originalSuccessCount = 0;
    let originalCount = 0;
    let replayTotalDuration = 0;
    let replaySuccessCount = 0;
    let replayCount = 0;
    const originalStatusDist: Record<number, number> = {};
    const replayStatusDist: Record<number, number> = {};

    for (const item of items) {
      const originalLog = logMap.get(item.originalLogId);
      const originalAvailable = !!originalLog;

      let durationChangePercent: number | null = null;
      let durationFaster: boolean | null = null;
      let responseBodyDiff: string[] | null = null;

      if (originalAvailable) {
        const origDur = originalLog.durationMs || 0;
        if (origDur > 0) {
          durationChangePercent = Math.round(((item.durationMs - origDur) / origDur) * 100);
          durationFaster = item.durationMs < origDur;
        }
        responseBodyDiff = this.computeResponseBodyDiff(originalLog.responseBody, item.responseBody);

        originalTotalDuration += origDur;
        originalCount++;
        if (originalLog.status === 'success') originalSuccessCount++;
        if (originalLog.responseStatus) {
          originalStatusDist[originalLog.responseStatus] = (originalStatusDist[originalLog.responseStatus] || 0) + 1;
        }
      }

      replayTotalDuration += item.durationMs;
      replayCount++;
      if (item.status === 'success') replaySuccessCount++;
      if (item.responseStatus) {
        replayStatusDist[item.responseStatus] = (replayStatusDist[item.responseStatus] || 0) + 1;
      }

      comparisonItems.push({
        replayItemId: item.id,
        originalAvailable,
        original: originalAvailable ? {
          responseStatus: originalLog.responseStatus,
          durationMs: originalLog.durationMs,
          responseBody: originalLog.responseBody,
        } : undefined,
        replay: {
          responseStatus: item.responseStatus,
          durationMs: item.durationMs,
          responseBody: item.responseBody,
        },
        diff: {
          statusChanged: originalAvailable ? originalLog.responseStatus !== item.responseStatus : false,
          originalStatus: originalAvailable ? originalLog.responseStatus : null,
          replayStatus: item.responseStatus,
          durationChangePercent,
          durationFaster,
          responseBodyDiff,
        },
      });
    }

    const summary: ComparisonSummary = {
      originalSuccessRate: originalCount > 0 ? Math.round((originalSuccessCount / originalCount) * 100) : 0,
      replaySuccessRate: replayCount > 0 ? Math.round((replaySuccessCount / replayCount) * 100) : 0,
      originalAvgDurationMs: originalCount > 0 ? Math.round(originalTotalDuration / originalCount) : 0,
      replayAvgDurationMs: replayCount > 0 ? Math.round(replayTotalDuration / replayCount) : 0,
      originalStatusDistribution: originalStatusDist,
      replayStatusDistribution: replayStatusDist,
    };

    return { summary, items: comparisonItems };
  }

  private computeResponseBodyDiff(original: string | null, replay: string | null): string[] | null {
    if (!original && !replay) return null;
    if (!original || !replay) {
      if (!original) return ['+ 原始响应体为空，回放有响应体'];
      return ['- 回放响应体为空，原始有响应体'];
    }

    const origLines = original.split('\n');
    const replayLines = replay.split('\n');
    const maxLines = Math.max(origLines.length, replayLines.length);
    const diffLines: string[] = [];

    for (let i = 0; i < maxLines; i++) {
      const origLine = origLines[i];
      const replayLine = replayLines[i];
      if (origLine !== replayLine) {
        if (origLine !== undefined) diffLines.push(`- ${i + 1}: ${origLine.slice(0, 200)}`);
        if (replayLine !== undefined) diffLines.push(`+ ${i + 1}: ${replayLine.slice(0, 200)}`);
        if (diffLines.length >= 50) {
          diffLines.push(`... (省略更多差异行)`);
          break;
        }
      }
    }

    return diffLines.length > 0 ? diffLines : null;
  }
}
