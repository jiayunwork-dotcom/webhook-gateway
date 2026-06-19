import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { App } from '../entities/app.entity';
import { Tenant } from '../entities/tenant.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { ConfigService } from '../config/config.module';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(App)
    private readonly appRepository: Repository<App>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(Endpoint)
    private readonly endpointRepository: Repository<Endpoint>,
    private readonly configService: ConfigService,
  ) {}

  async create(tenantId: string, dto: { name: string; description?: string; customEventTypes?: string[] }) {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.appCount >= tenant.maxApps) {
      throw new ConflictException(`Maximum apps (${tenant.maxApps}) reached for this tenant`);
    }

    const existing = await this.appRepository.findOne({
      where: { tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException('App with this name already exists');
    }

    if (dto.customEventTypes) {
      for (const et of dto.customEventTypes) {
        if (!/^[a-z0-9]+\.[a-z0-9]+\.[a-z0-9]+(\.[a-z0-9]+)*$/i.test(et) && !/^[a-z0-9]+\.\*$/i.test(et)) {
          throw new BadRequestException(`Invalid event type format: ${et}. Expected domain.entity.action or domain.*`);
        }
      }
    }

    const app = this.appRepository.create({
      tenantId,
      name: dto.name,
      description: dto.description || null,
      customEventTypes: dto.customEventTypes || null,
      maxEndpoints: this.configService.maxEndpointsPerApp,
    });

    const saved = await this.appRepository.save(app);
    tenant.appCount += 1;
    await this.tenantRepository.save(tenant);

    return saved;
  }

  async findAll(tenantId: string) {
    return this.appRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(tenantId: string, appId: string) {
    const app = await this.appRepository.findOne({
      where: { id: appId, tenantId },
      relations: ['endpoints'],
    });
    if (!app) {
      throw new NotFoundException('App not found');
    }
    return app;
  }

  async update(tenantId: string, appId: string, dto: { name?: string; description?: string; customEventTypes?: string[]; isActive?: boolean }) {
    const app = await this.findOne(tenantId, appId);

    if (dto.name && dto.name !== app.name) {
      const existing = await this.appRepository.findOne({
        where: { tenantId, name: dto.name },
      });
      if (existing) {
        throw new ConflictException('App with this name already exists');
      }
      app.name = dto.name;
    }

    if (dto.description !== undefined) app.description = dto.description || null;
    if (dto.customEventTypes !== undefined) app.customEventTypes = dto.customEventTypes;
    if (dto.isActive !== undefined) app.isActive = dto.isActive;

    return this.appRepository.save(app);
  }

  async remove(tenantId: string, appId: string) {
    const app = await this.findOne(tenantId, appId);
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });

    await this.appRepository.remove(app);

    if (tenant) {
      tenant.appCount = Math.max(0, tenant.appCount - 1);
      await this.tenantRepository.save(tenant);
    }

    return { success: true };
  }

  async getAppStats(tenantId: string, appId: string) {
    const app = await this.findOne(tenantId, appId);
    const endpoints = await this.endpointRepository.find({ where: { appId } });

    return {
      app,
      endpointCount: endpoints.length,
      healthyCount: endpoints.filter(e => e.status === 'healthy').length,
      unhealthyCount: endpoints.filter(e => e.status === 'unhealthy').length,
      pausedCount: endpoints.filter(e => e.status === 'paused').length,
    };
  }
}
