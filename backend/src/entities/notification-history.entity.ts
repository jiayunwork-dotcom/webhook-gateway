import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('notification_histories')
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'status', 'createdAt'])
export class NotificationHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ length: 200 })
  eventType: string;

  @Column({ length: 200 })
  endpointName: string;

  @Column({ type: 'varchar', length: 20 })
  status: 'success' | 'failed' | 'timeout';

  @Column({ type: 'int', nullable: true })
  responseStatus: number | null;

  @Column({ type: 'int', default: 0 })
  durationMs: number;

  @Column({ length: 500, nullable: true })
  endpointId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
