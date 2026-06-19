import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Tenant } from '../entities/tenant.entity';
import { ConfigService } from '../config/config.module';

export interface JwtPayload {
  tenantId: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateApiKeys(): { publicKey: string; privateKey: string } {
    return {
      publicKey: 'pk_' + crypto.randomBytes(32).toString('hex'),
      privateKey: 'sk_' + crypto.randomBytes(32).toString('hex'),
    };
  }

  async register(dto: { name: string; email: string; password: string }) {
    const existing = await this.tenantRepository.findOne({
      where: [{ email: dto.email }, { name: dto.name }],
    });
    if (existing) {
      throw new ConflictException('Tenant with this email or name already exists');
    }

    const keys = this.generateApiKeys();
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const tenant = this.tenantRepository.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      apiPublicKey: keys.publicKey,
      apiPrivateKey: keys.privateKey,
      maxApps: this.configService.maxAppsPerTenant,
    });

    const saved = await this.tenantRepository.save(tenant);
    return {
      tenant: this.sanitizeTenant(saved),
      apiKeys: keys,
      accessToken: this.signToken(saved),
    };
  }

  async login(dto: { email: string; password: string }) {
    const tenant = await this.tenantRepository.findOne({ where: { email: dto.email } });
    if (!tenant) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!tenant.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const valid = await bcrypt.compare(dto.password, tenant.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      tenant: this.sanitizeTenant(tenant),
      accessToken: this.signToken(tenant),
    };
  }

  async validateApiKey(publicKey: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { apiPublicKey: publicKey } });
    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException('Invalid API key');
    }
    return tenant;
  }

  async rotateKeys(tenantId: string) {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new UnauthorizedException('Tenant not found');
    }

    const newKeys = this.generateApiKeys();

    tenant.oldApiPrivateKey = tenant.apiPrivateKey;
    tenant.apiPublicKey = newKeys.publicKey;
    tenant.apiPrivateKey = newKeys.privateKey;
    tenant.keyRotationAt = new Date();

    await this.tenantRepository.save(tenant);

    return {
      newPublicKey: newKeys.publicKey,
      newPrivateKey: newKeys.privateKey,
      transitionHours: this.configService.transitionPeriodHours,
    };
  }

  async cleanupOldKeys() {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - this.configService.transitionPeriodHours);

    await this.tenantRepository
      .createQueryBuilder()
      .update(Tenant)
      .set({ oldApiPrivateKey: null, keyRotationAt: null })
      .where('keyRotationAt IS NOT NULL AND keyRotationAt < :cutoff', { cutoff })
      .execute();
  }

  signToken(tenant: Tenant): string {
    const payload: JwtPayload = { tenantId: tenant.id, email: tenant.email };
    return this.jwtService.sign(payload, {
      secret: this.configService.jwtSecret,
      expiresIn: '7d',
    });
  }

  sanitizeTenant(tenant: Tenant) {
    const { passwordHash, apiPrivateKey, oldApiPrivateKey, ...rest } = tenant;
    return rest;
  }
}
