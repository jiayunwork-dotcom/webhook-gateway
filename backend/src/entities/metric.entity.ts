import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export type MetricGranularity = 'minute' | 'hour' | 'day';

@Entity('metrics')
@Index(['tenantId', 'granularity', 'timestamp'])
@Index(['tenantId', 'appId', 'granularity', 'timestamp'])
@Index(['tenantId', 'appId', 'endpointId', 'granularity', 'timestamp'])
export class Metric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  appId: string | null;

  @Column({ nullable: true })
  endpointId: string | null;

  @Column({ type: 'timestamptz' })
  timestamp: Date;

  @Column({ type: 'varchar', length: 20 })
  granularity: MetricGranularity;

  @Column({ type: 'int', default: 0 })
  totalDeliveries: number;

  @Column({ type: 'int', default: 0 })
  successfulDeliveries: number;

  @Column({ type: 'int', default: 0 })
  failedDeliveries: number;

  @Column({ type: 'int', default: 0 })
  retriedDeliveries: number;

  @Column({ type: 'int', default: 0 })
  deadLetterCount: number;

  @Column({ type: 'int', default: 0 })
  queueDepth: number;

  @Column({ type: 'bigint', default: 0 })
  totalLatencyMs: string;

  @Column({ type: 'bigint', default: 0 })
  minLatencyMs: string;

  @Column({ type: 'bigint', default: 0 })
  maxLatencyMs: string;
}
