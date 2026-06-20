import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, OneToMany } from 'typeorm';
import { ReplayItem } from './replay-item.entity';

export type ReplayTaskStatus = 'waiting' | 'queued' | 'running' | 'completed' | 'partially_failed' | 'failed';

@Entity('replay_tasks')
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'status'])
export class ReplayTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 30, default: 'queued' })
  status: ReplayTaskStatus;

  @Column({ type: 'int', default: 0 })
  totalCount: number;

  @Column({ type: 'int', default: 0 })
  processedCount: number;

  @Column({ type: 'int', default: 0 })
  successCount: number;

  @Column({ type: 'int', default: 0 })
  failedCount: number;

  @OneToMany(() => ReplayItem, item => item.task, { cascade: true })
  items: ReplayItem[];

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
