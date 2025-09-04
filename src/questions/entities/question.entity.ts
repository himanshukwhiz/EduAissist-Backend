import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Exam } from '../../exams/entities/exam.entity';
import { StudentAnswer } from '../../evaluations/entities/student-answer.entity';

export enum QuestionType {
  MULTIPLE_CHOICE = 'multiple_choice',
  SHORT_ANSWER = 'short_answer',
  LONG_ANSWER = 'long_answer',
  ESSAY = 'essay',
  FILL_IN_BLANK = 'fill_in_blank',
}

export enum DifficultyLevel {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  questionText: string;

  @Column({
    type: 'enum',
    enum: QuestionType,
    default: QuestionType.SHORT_ANSWER,
  })
  type: QuestionType;

  @Column({
    type: 'enum',
    enum: DifficultyLevel,
    default: DifficultyLevel.MEDIUM,
  })
  difficulty: DifficultyLevel;

  @Column({ type: 'int' })
  marks: number;

  @Column({ type: 'int', default: 0 })
  order: number;

  @Column({ type: 'json', nullable: true })
  options: string[]; // For multiple choice questions

  @Column({ type: 'text', nullable: true })
  correctAnswer: string;

  @Column({ type: 'text', nullable: true })
  explanation: string;

  @Column({ type: 'json', nullable: true })
  keywords: string[]; // For AI evaluation

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Exam, (exam) => exam.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'examId' })
  exam: Exam;

  @Column()
  examId: string;

  @OneToMany(() => StudentAnswer, (answer) => answer.question)
  studentAnswers: StudentAnswer[];
}
