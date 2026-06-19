import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { Tenant } from './tenant.entity';
import { Endpoint } from './endpoint.entity';
import { WebhookEvent } from './webhook-event.entity';

@Entity('apps')
@Index(['tenantId', 'name'], { unique: true })
export class App {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @ManyToOne(() => Tenant, tenant => tenant.apps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'int', default: 0 })
  endpointCount: number;

  @Column({ type: 'int', default: 50 })
  maxEndpoints: number;

  @Column({ type: 'simple-array', nullable: true })
  customEventTypes: string[] | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Endpoint, endpoint => endpoint.app)
  endpoints: Endpoint[];

  @OneToMany(() => WebhookEvent, event => event.app)
  events: WebhookEvent[];
}
