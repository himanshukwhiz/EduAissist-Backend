import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Class } from '../../classes/entities/class.entity';
import { Exam } from '../../exams/entities/exam.entity';

@Entity('subjects')
export class Subject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  code: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Class, (classEntity) => classEntity.subjects)
  @JoinColumn({ name: 'classId' })
  class: Class;

  @Column()
  classId: string;

  @OneToMany(() => Exam, (exam) => exam.subject)
  exams: Exam[];
}
