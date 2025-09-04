import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Question } from '../../questions/entities/question.entity';
import { Evaluation } from './evaluation.entity';

@Entity('student_answers')
export class StudentAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  answerText: string;

  @Column({ nullable: true })
  answerImagePath: string; // For handwritten answers

  @Column({ type: 'float', nullable: true })
  marksObtained: number;

  @Column({ type: 'text', nullable: true })
  aiEvaluation: string; // AI's assessment

  @Column({ type: 'float', nullable: true })
  aiScore: number; // AI's suggested score

  @Column({ type: 'text', nullable: true })
  teacherFeedback: string;

  @Column({ default: false })
  isEvaluated: boolean;

  @Column({ default: false })
  isVerifiedByTeacher: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Question, (question) => question.studentAnswers)
  @JoinColumn({ name: 'questionId' })
  question: Question;

  @Column()
  questionId: string;

  @ManyToOne(() => Evaluation, (evaluation) => evaluation.answers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'evaluationId' })
  evaluation: Evaluation;

  @Column()
  evaluationId: string;
}
