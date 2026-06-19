import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Endpoint, EndpointStatus } from '../entities/endpoint.entity';
import { App } from '../entities/app.entity';
import { ConfigService } from '../config/config.module';

export const DEFAULT_EVENT_TYPES = [
  'system.ping.test',
  'system.health.check',
  'user.created',
  'user.updated',
  'user.deleted',
  'order.created',
  'order.updated',
  'order.payment.completed',
  'order.payment.failed',
  'order.shipped',
  'order.delivered',
  'order.cancelled',
  'payment.created',
  'payment.completed',
  'payment.failed',
  'payment.refunded',
  'product.created',
  'product.updated',
  'product.deleted',
  'inventory.low',
  'inventory.out_of_stock',
  'invoice.created',
  'invoice.paid',
  'invoice.overdue',
];

@Injectable()
export class EndpointService {
  constructor(
    @InjectRepository(Endpoint)
    private readonly endpointRepository: Repository<Endpoint>,
    @InjectRepository(App)
    private readonly appRepository: Repository<App>,
    private readonly configService: ConfigService,
  ) {}

  private validateSubscribedEvents(events: string[]) {
    for (const event of events) {
      const isWildcard = event.endsWith('.*');
      const pattern = isWildcard ? event.slice(0, -2) : event;
      const parts = pattern.split('.');

      if (isWildcard) {
        if (parts.length < 1 || !parts.every(p => /^[a-z0-9]+$/i.test(p))) {
          throw new BadRequestException(`Invalid wildcard event pattern: ${event}`);
        }
      } else {
        if (parts.length < 3 || !parts.every(p => /^[a-z0-9]+$/i.test(p))) {
          throw new BadRequestException(`Invalid event type: ${event}. Expected at least 3 segments (domain.entity.action)`);
        }
      }
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async create(
    tenantId: string,
    appId: string,
    dto: {
      name: string;
      description?: string;
      url: string;
      subscribedEvents: string[];
      customHeaders?: Record<string, string>;
      rateLimitPerSecond?: number;
    },
  ) {
    const app = await this.appRepository.findOne({ where: { id: appId, tenantId } });
    if (!app) {
      throw new NotFoundException('App not found');
    }

    if (app.endpointCount >= app.maxEndpoints) {
      throw new ConflictException(`Maximum endpoints (${app.maxEndpoints}) reached for this app`);
    }

    const existing = await this.endpointRepository.findOne({
      where: { appId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Endpoint with this name already exists in app');
    }

    if (!this.isValidUrl(dto.url)) {
      throw new BadRequestException('Invalid URL. Must be a valid http/https URL');
    }

    this.validateSubscribedEvents(dto.subscribedEvents);

    if (dto.rateLimitPerSecond !== undefined && (dto.rateLimitPerSecond < 1 || dto.rateLimitPerSecond > 10000)) {
      throw new BadRequestException('Rate limit must be between 1 and 10000 requests per second');
    }

    const endpoint = this.endpointRepository.create({
      appId,
      name: dto.name,
      description: dto.description || null,
      url: dto.url,
      subscribedEvents: dto.subscribedEvents,
      customHeaders: dto.customHeaders || null,
      rateLimitPerSecond: dto.rateLimitPerSecond || this.configService.defaultRateLimit,
    });

    const saved = await this.endpointRepository.save(endpoint);
    app.endpointCount += 1;
    await this.appRepository.save(app);

    return saved;
  }

  async findAll(tenantId: string, appId?: string) {
    const where: any = {};
    if (appId) {
      const app = await this.appRepository.findOne({ where: { id: appId, tenantId } });
      if (!app) throw new NotFoundException('App not found');
      where.appId = appId;
    } else {
      const apps = await this.appRepository.find({ where: { tenantId }, select: ['id'] });
      where.appId = apps.map(a => a.id);
    }

    return this.endpointRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(tenantId: string, endpointId: string) {
    const endpoint = await this.endpointRepository
      .createQueryBuilder('e')
      .innerJoinAndSelect('e.app', 'app')
      .where('e.id = :endpointId', { endpointId })
      .andWhere('app.tenantId = :tenantId', { tenantId })
      .getOne();

    if (!endpoint) {
      throw new NotFoundException('Endpoint not found');
    }
    return endpoint;
  }

  async update(
    tenantId: string,
    endpointId: string,
    dto: {
      name?: string;
      description?: string;
      url?: string;
      subscribedEvents?: string[];
      customHeaders?: Record<string, string>;
      rateLimitPerSecond?: number;
      isActive?: boolean;
    },
  ) {
    const endpoint = await this.findOne(tenantId, endpointId);

    if (dto.name && dto.name !== endpoint.name) {
      const existing = await this.endpointRepository.findOne({
        where: { appId: endpoint.appId, name: dto.name },
      });
      if (existing) {
        throw new ConflictException('Endpoint with this name already exists in app');
      }
      endpoint.name = dto.name;
    }

    if (dto.url !== undefined) {
      if (!this.isValidUrl(dto.url)) {
        throw new BadRequestException('Invalid URL');
      }
      endpoint.url = dto.url;
    }

    if (dto.subscribedEvents !== undefined) {
      this.validateSubscribedEvents(dto.subscribedEvents);
      endpoint.subscribedEvents = dto.subscribedEvents;
    }

    if (dto.description !== undefined) endpoint.description = dto.description || null;
    if (dto.customHeaders !== undefined) endpoint.customHeaders = dto.customHeaders;

    if (dto.rateLimitPerSecond !== undefined) {
      if (dto.rateLimitPerSecond < 1 || dto.rateLimitPerSecond > 10000) {
        throw new BadRequestException('Rate limit must be between 1 and 10000');
      }
      endpoint.rateLimitPerSecond = dto.rateLimitPerSecond;
    }

    if (dto.isActive !== undefined) {
      endpoint.isActive = dto.isActive;
      if (!dto.isActive) {
        endpoint.status = 'paused';
      } else if (endpoint.status === 'paused') {
        endpoint.status = 'healthy';
        endpoint.consecutiveFailures = 0;
      }
    }

    return this.endpointRepository.save(endpoint);
  }

  async remove(tenantId: string, endpointId: string) {
    const endpoint = await this.findOne(tenantId, endpointId);
    const app = await this.appRepository.findOne({ where: { id: endpoint.appId } });

    await this.endpointRepository.remove(endpoint);

    if (app) {
      app.endpointCount = Math.max(0, app.endpointCount - 1);
      await this.appRepository.save(app);
    }

    return { success: true };
  }

  async markStatus(endpointId: string, status: EndpointStatus, additionalUpdates: Partial<Endpoint> = {}) {
    const endpoint = await this.endpointRepository.findOne({ where: { id: endpointId } });
    if (endpoint) {
      endpoint.status = status;
      Object.assign(endpoint, additionalUpdates);
      if (status === 'paused') {
        endpoint.pausedAt = new Date();
      } else if (status === 'healthy') {
        endpoint.pausedAt = null;
      }
      await this.endpointRepository.save(endpoint);
    }
  }

  async incrementFailure(endpointId: string): Promise<{ reachedThreshold: boolean; endpoint: Endpoint | null }> {
    const endpoint = await this.endpointRepository.findOne({ where: { id: endpointId } });
    if (!endpoint) return { reachedThreshold: false, endpoint: null };

    endpoint.consecutiveFailures += 1;
    endpoint.lastDeliveryAt = new Date();

    const threshold = this.configService.unhealthyThreshold;
    const reachedThreshold = endpoint.consecutiveFailures >= threshold && endpoint.status === 'healthy';

    if (reachedThreshold) {
      endpoint.status = 'unhealthy';
      endpoint.pausedAt = new Date();
    }

    await this.endpointRepository.save(endpoint);
    return { reachedThreshold, endpoint };
  }

  async resetFailures(endpointId: string): Promise<Endpoint | null> {
    const endpoint = await this.endpointRepository.findOne({ where: { id: endpointId } });
    if (!endpoint) return null;

    endpoint.consecutiveFailures = 0;
    endpoint.consecutiveProbeSuccesses = 0;
    endpoint.lastDeliveryAt = new Date();

    if (endpoint.status !== 'healthy') {
      endpoint.status = 'healthy';
      endpoint.pausedAt = null;
    }

    await this.endpointRepository.save(endpoint);
    return endpoint;
  }

  async handleProbeResult(endpointId: string, success: boolean): Promise<{ recovered: boolean; endpoint: Endpoint | null }> {
    const endpoint = await this.endpointRepository.findOne({ where: { id: endpointId } });
    if (!endpoint) return { recovered: false, endpoint: null };

    endpoint.lastProbeAt = new Date();

    let recovered = false;
    if (success) {
      endpoint.consecutiveProbeSuccesses += 1;
      if (endpoint.consecutiveProbeSuccesses >= this.configService.probeSuccessThreshold) {
        endpoint.status = 'healthy';
        endpoint.consecutiveFailures = 0;
        endpoint.pausedAt = null;
        recovered = true;
      }
    } else {
      endpoint.consecutiveProbeSuccesses = 0;
    }

    await this.endpointRepository.save(endpoint);
    return { recovered, endpoint };
  }

  getAvailableEventTypes(): string[] {
    return DEFAULT_EVENT_TYPES;
  }

  matchesEvent(subscribed: string, eventType: string): boolean {
    if (subscribed === eventType) return true;
    if (subscribed.endsWith('.*')) {
      const prefix = subscribed.slice(0, -2);
      return eventType.startsWith(prefix + '.');
    }
    return false;
  }

  async findMatchingEndpoints(appId: string, eventType: string): Promise<Endpoint[]> {
    const endpoints = await this.endpointRepository.find({
      where: { appId, isActive: true },
    });

    return endpoints.filter(ep =>
      ep.subscribedEvents.some(sub => this.matchesEvent(sub, eventType)),
    );
  }
}
