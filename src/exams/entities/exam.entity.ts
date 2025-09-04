import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Class } from '../../classes/entities/class.entity';
import { Subject } from '../../subjects/entities/subject.entity';
import { Question } from '../../questions/entities/question.entity';
import { Evaluation } from '../../evaluations/entities/evaluation.entity';

export enum ExamType {
  UNIT_TEST = 'unit_test',
  MIDTERM = 'midterm',
  FINAL = 'final',
  ASSIGNMENT = 'assignment',
}

export enum ExamStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

@Entity('exams')
export class Exam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: ExamType,
    default: ExamType.UNIT_TEST,
  })
  type: ExamType;

  @Column({
    type: 'enum',
    enum: ExamStatus,
    default: ExamStatus.DRAFT,
  })
  status: ExamStatus;

  @Column({ type: 'int' })
  totalMarks: number;

  @Column({ type: 'int' })
  duration: number; // in minutes

  @Column({ type: 'datetime', nullable: true })
  scheduledAt: Date;

  @Column({ type: 'datetime', nullable: true })
  startTime: Date;

  @Column({ type: 'datetime', nullable: true })
  endTime: Date;

  @Column({ nullable: true })
  instructions: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => User, (user) => user.createdExams)
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column()
  createdById: string;

  @ManyToOne(() => Class, (classEntity) => classEntity.exams)
  @JoinColumn({ name: 'classId' })
  class: Class;

  @Column()
  classId: string;

  @ManyToOne(() => Subject, (subject) => subject.exams)
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;

  @Column()
  subjectId: string;

  @OneToMany(() => Question, (question) => question.exam)
  questions: Question[];

  @OneToMany(() => Evaluation, (evaluation) => evaluation.exam)
  evaluations: Evaluation[];
}
