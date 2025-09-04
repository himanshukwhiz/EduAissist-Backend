import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Subject } from '../../subjects/entities/subject.entity';
import { Exam } from '../../exams/entities/exam.entity';

@Entity('classes')
export class Class {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  grade: string;

  @Column()
  section: string;

  @Column()
  academicYear: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => User, (user) => user.classes)
  @JoinColumn({ name: 'teacherId' })
  teacher: User;

  @Column()
  teacherId: string;

  @OneToMany(() => Subject, (subject) => subject.class)
  subjects: Subject[];

  @OneToMany(() => Exam, (exam) => exam.class)
  exams: Exam[];
}
