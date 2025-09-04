import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from './entities/question.entity';
import { Exam } from '../exams/entities/exam.entity';
import { Material } from '../materials/entities/material.entity';
import { QuestionsController } from './questions.controller';
import { QuestionGenerationService } from './question-generation.service';
import { ChromaService } from '../materials/ingest/chroma.service';

@Module({
  imports: [TypeOrmModule.forFeature([Question, Exam, Material])],
  controllers: [QuestionsController],
  providers: [QuestionGenerationService, ChromaService],
  exports: [QuestionGenerationService],
})
export class QuestionsModule {}
