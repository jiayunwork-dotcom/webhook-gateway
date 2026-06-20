import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('notification_rules')
@Index(['tenantId'], { unique: true })
export class NotificationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ type: 'simple-json', nullable: true })
  endpointIds: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  statusFilters: ('success' | 'failed' | 'timeout')[] | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
