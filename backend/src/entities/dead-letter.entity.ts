import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('dead_letters')
@Index(['tenantId', 'appId', 'endpointId'])
@Index(['tenantId', 'createdAt'])
export class DeadLetter {
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

  @Column({ type: 'simple-json' })
  payload: Record<string, any>;

  @Column({ type: 'simple-json', nullable: true })
  requestHeaders: Record<string, string> | null;

  @Column({ type: 'text', nullable: true })
  lastErrorMessage: string | null;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ default: false })
  isResent: boolean;

  @Column({ default: false })
  isDiscarded: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  resentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  discardedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
