import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { Tenant } from '../entities/tenant.entity';
import { ConfigService } from '../config/config.module';

export interface SignatureResult {
  timestamp: number;
  signature: string;
  oldSignature?: string;
}

@Injectable()
export class SignatureService {
  constructor(private readonly configService: ConfigService) {}

  sign(payload: string, secret: string, timestamp?: number): SignatureResult {
    const ts = timestamp || Date.now();
    const message = `${ts}.${payload}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    return { timestamp: ts, signature: `sha256=${signature}` };
  }

  signWithTenant(payload: string, tenant: Tenant, timestamp?: number): SignatureResult {
    const ts = timestamp || Date.now();
    const message = `${ts}.${payload}`;

    const signature = crypto
      .createHmac('sha256', tenant.apiPrivateKey)
      .update(message)
      .digest('hex');

    const result: SignatureResult = {
      timestamp: ts,
      signature: `sha256=${signature}`,
    };

    const transitionMs = this.configService.transitionPeriodHours * 60 * 60 * 1000;
    if (tenant.oldApiPrivateKey && tenant.keyRotationAt) {
      const elapsed = Date.now() - new Date(tenant.keyRotationAt).getTime();
      if (elapsed < transitionMs) {
        const oldSig = crypto
          .createHmac('sha256', tenant.oldApiPrivateKey)
          .update(message)
          .digest('hex');
        result.oldSignature = `sha256=${oldSig}`;
      }
    }

    return result;
  }

  buildSignatureHeaders(
    result: SignatureResult,
    tenantPublicKey: string,
    additional: Record<string, string> = {},
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Webhook-Timestamp': String(result.timestamp),
      'X-Webhook-Signature': result.signature,
      'X-Webhook-API-Key': tenantPublicKey,
      'Content-Type': 'application/json',
      ...additional,
    };

    if (result.oldSignature) {
      headers['X-Webhook-Signature-Transition'] = result.oldSignature;
    }

    return headers;
  }

  verifySignature(
    payload: string,
    timestamp: number,
    signature: string,
    secret: string,
    toleranceMs = 5 * 60 * 1000,
  ): boolean {
    const now = Date.now();
    if (Math.abs(now - timestamp) > toleranceMs) {
      return false;
    }

    const message = `${timestamp}.${payload}`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    const sigValue = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(sigValue, 'hex'),
    );
  }

  generateWebhookId(): string {
    return `evt_${Date.now()}_${crypto.randomBytes(12).toString('hex')}`;
  }
}
