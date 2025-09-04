import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Exam } from '../../exams/entities/exam.entity';
import { StudentAnswer } from './student-answer.entity';

export enum EvaluationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  AI_COMPLETED = 'ai_completed',
  TEACHER_REVIEW = 'teacher_review',
  COMPLETED = 'completed',
}

@Entity('evaluations')
export class Evaluation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  studentName: string;

  @Column()
  studentId: string; // Student roll number or ID

  @Column({ type: 'float', default: 0 })
  totalMarksObtained: number;

  @Column({ type: 'float', default: 0 })
  percentage: number;

  @Column({
    type: 'enum',
    enum: EvaluationStatus,
    default: EvaluationStatus.PENDING,
  })
  status: EvaluationStatus;

  @Column({ type: 'text', nullable: true })
  overallFeedback: string;

  @Column({ nullable: true })
  grade: string; // A+, A, B+, etc.

  @Column({ type: 'datetime', nullable: true })
  submittedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  evaluatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Exam, (exam) => exam.evaluations)
  @JoinColumn({ name: 'examId' })
  exam: Exam;

  @Column()
  examId: string;

  @ManyToOne(() => User, (user) => user.evaluations, { nullable: true })
  @JoinColumn({ name: 'evaluatedById' })
  evaluatedBy: User;

  @Column({ nullable: true })
  evaluatedById: string;

  @OneToMany(() => StudentAnswer, (answer) => answer.evaluation, { cascade: true })
  answers: StudentAnswer[];
}
