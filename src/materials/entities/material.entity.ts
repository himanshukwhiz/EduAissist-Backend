import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum MaterialType {
  STUDY = 'study',
  ANSWER = 'answer',
}

@Entity('materials')
export class Material {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: MaterialType })
  type: MaterialType;

  // New schema fields
  @Column()
  teacherId: string;
  @ManyToOne(() => User, (user) => user.id, { nullable: false })
  @JoinColumn({ name: 'teacherId' })
  teacher: User;

  @Column({ length: 32 })
  class: string;

  @Column({ length: 128 })
  subject: string;

  @Column({ length: 2048 })
  pdfCloudUrl: string;

  @Column({ length: 191 })
  vectorDbCollectionId: string;

  @Column()
  originalName: string;

  @Column({ nullable: true })
  mimeType: string;

  @Column({ nullable: true, type: 'bigint' })
  size: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}


