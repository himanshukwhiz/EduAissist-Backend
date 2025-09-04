import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Class } from '../../classes/entities/class.entity';
import { Subject } from '../../subjects/entities/subject.entity';

export enum ReportType {
  STUDENT_REPORT_CARD = 'student_report_card',
  CLASS_PERFORMANCE = 'class_performance',
  SUBJECT_ANALYSIS = 'subject_analysis',
  EXAM_SUMMARY = 'exam_summary',
}

@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({
    type: 'enum',
    enum: ReportType,
    default: ReportType.STUDENT_REPORT_CARD,
  })
  type: ReportType;

  @Column({ type: 'json' })
  data: any; // Report data structure

  @Column({ nullable: true })
  filePath: string; // Generated PDF/Excel file path

  @Column({ nullable: true })
  studentId: string; // For individual student reports

  @Column({ nullable: true })
  studentName: string;

  @Column()
  academicYear: string;

  @Column()
  term: string; // Term 1, Term 2, Annual

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'generatedById' })
  generatedBy: User;

  @Column({ nullable: true })
  generatedById: string;

  @ManyToOne(() => Class, { nullable: true })
  @JoinColumn({ name: 'classId' })
  class: Class;

  @Column({ nullable: true })
  classId: string;

  @ManyToOne(() => Subject, { nullable: true })
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;

  @Column({ nullable: true })
  subjectId: string;
}
