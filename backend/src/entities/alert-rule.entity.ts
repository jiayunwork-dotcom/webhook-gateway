import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type AlertRuleType = 'endpoint_failure_rate' | 'endpoint_unhealthy' | 'delivery_delay' | 'queue_backlog';
export type AlertRuleChannel = 'in_app';

@Entity('alert_rules')
@Index(['tenantId', 'isActive'])
export class AlertRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  appId: string | null;

  @Column({ nullable: true })
  endpointId: string | null;

  @Column({ type: 'varchar', length: 50 })
  type: AlertRuleType;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'simple-json' })
  conditions: {
    failureRateThreshold?: number;
    windowMinutes?: number;
    minEvents?: number;
    delayThresholdMs?: number;
    queueDepthThreshold?: number;
    severity?: 'critical' | 'warning' | 'info';
  };

  @Column({ type: 'simple-array', default: 'in_app' })
  channels: AlertRuleChannel[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastTriggeredAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
