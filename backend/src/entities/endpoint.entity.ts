import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { App } from './app.entity';

export type EndpointStatus = 'healthy' | 'unhealthy' | 'paused';

@Entity('endpoints')
@Index(['appId', 'name'], { unique: true })
export class Endpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  appId: string;

  @ManyToOne(() => App, app => app.endpoints, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appId' })
  app: App;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 500, nullable: true })
  description: string | null;

  @Column({ length: 2000 })
  url: string;

  @Column({ type: 'simple-array' })
  subscribedEvents: string[];

  @Column({ type: 'simple-json', nullable: true })
  customHeaders: Record<string, string> | null;

  @Column({ type: 'int', default: 50 })
  rateLimitPerSecond: number;

  @Column({ type: 'varchar', length: 20, default: 'healthy' })
  status: EndpointStatus;

  @Column({ type: 'int', default: 0 })
  consecutiveFailures: number;

  @Column({ type: 'int', default: 0 })
  consecutiveProbeSuccesses: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastProbeAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastDeliveryAt: Date | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  pausedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
