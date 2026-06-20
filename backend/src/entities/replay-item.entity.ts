import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ReplayTask } from './replay-task.entity';

export type ReplayItemStatus = 'pending' | 'success' | 'failed' | 'rate_limited';

@Entity('replay_items')
@Index(['taskId', 'status'])
@Index(['taskId'])
export class ReplayItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  taskId: string;

  @ManyToOne(() => ReplayTask, task => task.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: ReplayTask;

  @Column()
  originalLogId: string;

  @Column()
  endpointId: string;

  @Column({ length: 200 })
  endpointName: string;

  @Column({ length: 200 })
  eventType: string;

  @Column({ length: 2000 })
  endpointUrl: string;

  @Column({ type: 'simple-json', nullable: true })
  requestHeaders: Record<string, string> | null;

  @Column({ type: 'text', nullable: true })
  requestBody: string | null;

  @Column({ type: 'varchar', length: 30, default: 'pending' })
  status: ReplayItemStatus;

  @Column({ type: 'int', nullable: true })
  responseStatus: number | null;

  @Column({ type: 'int', default: 0 })
  durationMs: number;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  executedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
