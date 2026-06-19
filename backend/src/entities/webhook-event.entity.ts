import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { App } from './app.entity';

export type EventStatus = 'pending' | 'processing' | 'delivered' | 'failed' | 'dead_letter';

@Entity('webhook_events')
@Index(['appId', 'eventType'])
@Index(['appId', 'status'])
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  appId: string;

  @ManyToOne(() => App, app => app.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appId' })
  app: App;

  @Column({ length: 200 })
  eventType: string;

  @Column({ length: 100 })
  eventSource: string;

  @Column({ type: 'simple-json' })
  payload: Record<string, any>;

  @Column({ type: 'int' })
  payloadSize: number;

  @Column({ length: 100, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: EventStatus;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  failedAt: Date | null;

  @Column({ type: 'bigint', default: 0 })
  sequenceNumber: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
