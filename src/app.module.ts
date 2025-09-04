import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ClassesModule } from './classes/classes.module';
import { SubjectsModule } from './subjects/subjects.module';
import { ExamsModule } from './exams/exams.module';
import { QuestionsModule } from './questions/questions.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { ReportsModule } from './reports/reports.module';
import { SeedService } from './seeds/seed.service';
import { User } from './users/entities/user.entity';
import { Class } from './classes/entities/class.entity';
import { Subject } from './subjects/entities/subject.entity';
import { Exam } from './exams/entities/exam.entity';
import { Question } from './questions/entities/question.entity';
import { StudentAnswer } from './evaluations/entities/student-answer.entity';
import { Evaluation } from './evaluations/entities/evaluation.entity';
import { Report } from './reports/entities/report.entity';
import { Material } from './materials/entities/material.entity';
import { MaterialsModule } from './materials/materials.module';
import { TeachersModule } from './teachers/teachers.module';
import { Teacher } from './teachers/entities/teachers.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      username: process.env.DB_USERNAME || 'root',
      // Use nullish coalescing so empty string is allowed for XAMPP root with no password
      password: (process.env.DB_PASSWORD ?? 'password'),
      database: process.env.DB_DATABASE || 'eduaissist',
      entities: [
        User,
        Class,
        Subject,
        Exam,
        Question,
        StudentAnswer,
        Evaluation,
        Report,
        Material,
        Teacher
      ],
      // Disable auto schema sync by default to avoid destructive DDL on existing DBs
      // Enable explicitly by setting DB_SYNC=true in .env when you want TypeORM to manage schema
      synchronize: (process.env.DB_SYNC === 'true'),
      logging: false,
    }),
    TypeOrmModule.forFeature([User]),
    AuthModule,
    UsersModule,
    ClassesModule,
    SubjectsModule,
    ExamsModule,
    QuestionsModule,
    EvaluationsModule,
    ReportsModule,
    MaterialsModule,
    TeachersModule
  ],
  providers: [SeedService],
})
export class AppModule {}
