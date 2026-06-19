import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { WebhookEvent, EventStatus } from '../entities/webhook-event.entity';
import { App } from '../entities/app.entity';
import { Tenant } from '../entities/tenant.entity';
import { ConfigService } from '../config/config.module';
import { EndpointService } from '../endpoints/endpoint.service';
import { DeliveryEngineService } from '../delivery/delivery-engine.service';

export interface PublishEventDto {
  eventType: string;
  eventSource: string;
  payload: Record<string, any>;
  idempotencyKey?: string;
}

@Injectable()
export class EventService {
  constructor(
    @InjectRepository(WebhookEvent)
    private readonly eventRepository: Repository<WebhookEvent>,
    @InjectRepository(App)
    private readonly appRepository: Repository<App>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly endpointService: EndpointService,
    @Inject(forwardRef(() => DeliveryEngineService))
    private readonly deliveryEngine: DeliveryEngineService,
  ) {}

  private validateEventType(eventType: string) {
    const parts = eventType.split('.');
    if (parts.length < 3 || !parts.every(p => /^[a-z0-9]+$/i.test(p))) {
      throw new BadRequestException(
        'Invalid event type. Expected at least 3 segments: domain.entity.action',
      );
    }
  }

  private async getNextSequence(appId: string): Promise<bigint> {
    const key = `seq:app:${appId}`;
    const { RedisService } = await import('../redis/redis.service');
    const redis = (global as any).__redisService as any;
    if (redis) {
      return BigInt(await redis.incr(key));
    }
    const last = await this.eventRepository
      .createQueryBuilder('e')
      .where('e.appId = :appId', { appId })
      .orderBy('CAST(e.sequenceNumber AS BIGINT)', 'DESC')
      .limit(1)
      .getOne();
    return last ? BigInt(last.sequenceNumber) + 1n : 1n;
  }

  async publish(
    tenant: Tenant,
    appId: string,
    dto: PublishEventDto,
  ): Promise<{ eventId: string; matchedEndpoints: number; sequenceNumber: string }> {
    this.validateEventType(dto.eventType);

    const app = await this.appRepository.findOne({
      where: { id: appId, tenantId: tenant.id },
    });
    if (!app) {
      throw new NotFoundException('App not found');
    }
    if (!app.isActive) {
      throw new BadRequestException('App is inactive');
    }

    const payloadStr = JSON.stringify(dto.payload);
    const payloadSize = Buffer.byteLength(payloadStr, 'utf-8');
    if (payloadSize > this.configService.maxEventSizeBytes) {
      throw new BadRequestException(
        `Payload too large. Maximum size: ${this.configService.maxEventSizeBytes} bytes`,
      );
    }

    if (dto.idempotencyKey) {
      const existing = await this.eventRepository.findOne({
        where: { appId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        const endpoints = await this.endpointService.findMatchingEndpoints(appId, dto.eventType);
        return {
          eventId: existing.id,
          matchedEndpoints: endpoints.length,
          sequenceNumber: existing.sequenceNumber,
        };
      }
    }

    const sequence = await this.getNextSequence(appId);

    const event = this.eventRepository.create({
      appId,
      eventType: dto.eventType,
      eventSource: dto.eventSource || 'api',
      payload: dto.payload,
      payloadSize,
      idempotencyKey: dto.idempotencyKey || null,
      status: 'pending' as EventStatus,
      sequenceNumber: sequence.toString(),
    });

    const saved = await this.eventRepository.save(event);

    const endpoints = await this.endpointService.findMatchingEndpoints(appId, dto.eventType);

    if (endpoints.length > 0) {
      saved.status = 'processing';
      saved.processedAt = new Date();
      await this.eventRepository.save(saved);

      for (const endpoint of endpoints) {
        await this.deliveryEngine.enqueueDelivery(tenant, app, endpoint, saved);
      }
    } else {
      saved.status = 'delivered';
      saved.deliveredAt = new Date();
      await this.eventRepository.save(saved);
    }

    return {
      eventId: saved.id,
      matchedEndpoints: endpoints.length,
      sequenceNumber: saved.sequenceNumber,
    };
  }

  async publishTestEvent(
    tenantId: string,
    endpointId: string,
  ): Promise<{ deliveryId: string; endpointUrl: string; sentAt: Date }> {
    const endpoint = await this.endpointService.findOne(tenantId, endpointId);
    if (!endpoint) {
      throw new NotFoundException('Endpoint not found');
    }

    const app = await this.appRepository.findOne({ where: { id: endpoint.appId } });
    if (!app) throw new NotFoundException('App not found');

    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const testPayload = {
      test: true,
      message: 'This is a test event from the Webhook Gateway',
      timestamp: new Date().toISOString(),
      endpointId,
    };

    const sequence = await this.getNextSequence(app.id);
    const event = this.eventRepository.create({
      appId: app.id,
      eventType: 'system.ping.test',
      eventSource: 'admin_panel',
      payload: testPayload,
      payloadSize: Buffer.byteLength(JSON.stringify(testPayload)),
      status: 'processing',
      sequenceNumber: sequence.toString(),
      processedAt: new Date(),
    });
    const saved = await this.eventRepository.save(event);

    const result = await this.deliveryEngine.testDelivery(tenant, app, endpoint, saved);

    return {
      deliveryId: result.logId,
      endpointUrl: endpoint.url,
      sentAt: new Date(),
    };
  }

  async findByApp(tenantId: string, appId: string, limit = 100, offset = 0) {
    const app = await this.appRepository.findOne({ where: { id: appId, tenantId } });
    if (!app) throw new NotFoundException('App not found');

    return this.eventRepository.find({
      where: { appId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async findOne(tenantId: string, eventId: string) {
    const event = await this.eventRepository
      .createQueryBuilder('e')
      .innerJoinAndSelect('e.app', 'app')
      .where('e.id = :eventId', { eventId })
      .andWhere('app.tenantId = :tenantId', { tenantId })
      .getOne();
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async updateStatus(eventId: string, status: EventStatus, extra: Partial<WebhookEvent> = {}) {
    await this.eventRepository
      .createQueryBuilder()
      .update(WebhookEvent)
      .set({ status, ...extra })
      .where('id = :eventId', { eventId })
      .execute();
  }
}
