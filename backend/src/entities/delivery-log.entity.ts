import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export type DeliveryStatus = 'success' | 'failed' | 'retrying' | 'dead_letter';

@Entity('delivery_logs')
@Index(['tenantId', 'appId', 'endpointId'])
@Index(['endpointId', 'createdAt'])
@Index(['tenantId', 'status', 'createdAt'])
export class DeliveryLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  appId: string;

  @Column()
  endpointId: string;

  @Column()
  eventId: string;

  @Column({ length: 200 })
  eventType: string;

  @Column({ length: 2000 })
  endpointUrl: string;

  @Column({ type: 'varchar', length: 20 })
  status: DeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attemptNumber: number;

  @Column({ type: 'int', default: 0 })
  maxAttempts: number;

  @Column({ type: 'simple-json', nullable: true })
  requestHeaders: Record<string, string> | null;

  @Column({ type: 'text', nullable: true })
  requestBody: string | null;

  @Column({ type: 'int', nullable: true })
  responseStatus: number | null;

  @Column({ type: 'simple-json', nullable: true })
  responseHeaders: Record<string, string> | null;

  @Column({ type: 'text', nullable: true })
  responseBody: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', default: 0 })
  durationMs: number;

  @Column({ type: 'timestamptz', nullable: true })
  nextRetryAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
