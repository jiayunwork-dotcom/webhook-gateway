import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '../config/config.module';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private subscriber: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const options: Redis.RedisOptions = {
      host: this.configService.redisHost,
      port: this.configService.redisPort,
      password: this.configService.redisPassword || undefined,
      retryStrategy: times => Math.min(times * 50, 2000),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };

    this.client = new Redis(options);
    this.subscriber = new Redis(options);

    this.client.on('error', err => this.logger.error(`Redis client error: ${err.message}`));
    this.client.on('connect', () => this.logger.log('Redis client connected'));
    this.subscriber.on('error', err => this.logger.error(`Redis subscriber error: ${err.message}`));

    (global as any).__redisService = this;
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit();
    if (this.subscriber) await this.subscriber.quit();
  }

  getClient(): Redis {
    if (!this.client) throw new Error('Redis client not initialized');
    return this.client;
  }

  getSubscriber(): Redis {
    if (!this.subscriber) throw new Error('Redis subscriber not initialized');
    return this.subscriber;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs) {
      await this.getClient().set(key, value, 'PX', ttlMs);
    } else {
      await this.getClient().set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.getClient().get(key);
  }

  async del(key: string): Promise<number> {
    return this.getClient().del(key);
  }

  async incr(key: string): Promise<number> {
    return this.getClient().incr(key);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return this.getClient().hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.getClient().hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.getClient().hgetall(key);
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.getClient().zadd(key, score, member);
  }

  async zrangebyscore(key: string, min: number, max: number, limit?: number): Promise<string[]> {
    const args: any[] = [key, min, max];
    if (limit !== undefined) {
      args.push('LIMIT', 0, limit);
    }
    return this.getClient().zrangebyscore(...args);
  }

  async zrem(key: string, member: string): Promise<number> {
    return this.getClient().zrem(key, member);
  }

  async zcard(key: string): Promise<number> {
    return this.getClient().zcard(key);
  }

  async lpush(key: string, value: string): Promise<number> {
    return this.getClient().lpush(key, value);
  }

  async rpush(key: string, value: string): Promise<number> {
    return this.getClient().rpush(key, value);
  }

  async lpop(key: string): Promise<string | null> {
    return this.getClient().lpop(key);
  }

  async rpop(key: string): Promise<string | null> {
    return this.getClient().rpop(key);
  }

  async llen(key: string): Promise<number> {
    return this.getClient().llen(key);
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.getClient().publish(channel, message);
  }

  async subscribe(channel: string, listener: (message: string) => void): Promise<void> {
    const sub = this.getSubscriber();
    await sub.subscribe(channel);
    sub.on('message', (ch, msg) => {
      if (ch === channel) listener(msg);
    });
  }

  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const result = await this.getClient().set(key, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.del(key);
  }
}
