import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Class } from '../../classes/entities/class.entity';
import { Exam } from '../../exams/entities/exam.entity';
import { Evaluation } from '../../evaluations/entities/evaluation.entity';

export enum UserRole {
  ADMIN = 'admin',
  TEACHER = 'teacher',
  STUDENT = 'student',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  avatar: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.TEACHER,
  })
  role: UserRole;

  @Column({ nullable: true })
  googleId: string;

  @Column({ nullable: true })
  microsoftId: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @OneToMany(() => Class, (classEntity) => classEntity.teacher)
  classes: Class[];

  @OneToMany(() => Exam, (exam) => exam.createdBy)
  createdExams: Exam[];

  @OneToMany(() => Evaluation, (evaluation) => evaluation.evaluatedBy)
  evaluations: Evaluation[];
}
