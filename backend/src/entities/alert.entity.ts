import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type AlertType = 'endpoint_failure_rate' | 'endpoint_unhealthy' | 'delivery_delay' | 'queue_backlog';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

@Entity('alerts')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'severity'])
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  appId: string | null;

  @Column({ nullable: true })
  endpointId: string | null;

  @Column({ type: 'varchar', length: 50 })
  type: AlertType;

  @Column({ type: 'varchar', length: 20, default: 'info' })
  severity: AlertSeverity;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: AlertStatus;

  @Column({ length: 500 })
  message: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  @Column({ nullable: true })
  acknowledgedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
