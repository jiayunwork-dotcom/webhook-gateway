import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { App } from './app.entity';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 100 })
  name: string;

  @Index({ unique: true })
  @Column({ length: 255 })
  email: string;

  @Column({ length: 255 })
  passwordHash: string;

  @Column({ length: 255, unique: true })
  apiPublicKey: string;

  @Column({ length: 255 })
  apiPrivateKey: string;

  @Column({ length: 255, nullable: true })
  oldApiPrivateKey: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  keyRotationAt: Date | null;

  @Column({ type: 'int', default: 0 })
  appCount: number;

  @Column({ type: 'int', default: 20 })
  maxApps: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => App, app => app.tenant)
  apps: App[];
}
