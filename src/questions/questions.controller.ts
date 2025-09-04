import { Body, Controller, Get, Param, Post, UseGuards, Req, Res } from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Question } from './entities/question.entity';
// Use require to avoid ts type dependency for pdfkit
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');
import { Response } from 'express';
import { QuestionGenerationService } from './question-generation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('questions')
@UseGuards(JwtAuthGuard)
export class QuestionsController {
  constructor(
    private readonly qg: QuestionGenerationService,
    @InjectRepository(Question) private readonly questionRepo: Repository<Question>,
  ) {}

  @Post('generate/:examId')
  async generate(
    @Param('examId') examId: string,
    @Body() body: { 
      maxMarks: number; 
      weightage: { mcq: number; short: number; long: number }; 
      marksPerQuestion?: { mcq: number; short: number; long: number };
      questionCounts?: { mcqCount: number; shortCount: number; longCount: number };
      context?: string; 
      classId?: string; 
      subjectId?: string; 
      title?: string; 
      duration?: number; 
      collectionId?: string; 
      vectorCollectionID?: string; 
      materialId?: string 
    },
    @Req() req: Request,
  ) {
    const userId = (req as any)?.user?.id as string | undefined;
    
    // Debug logging
    console.log('[QuestionsController] Received request body:', body);
    
    // Prioritize vectorCollectionID over collectionId for consistency with frontend
    const collectionId = (body as any).vectorCollectionID || (body as any).collectionId;
    
    console.log('[QuestionsController] Resolved collectionId:', collectionId);
    
    return this.qg.generateOrCreate(examId, { ...body, collectionId }, userId);
  }

  @Get('by-exam/:examId')
  async byExam(@Param('examId') examId: string) {
    return this.questionRepo.find({ where: { examId }, order: { order: 'ASC' } });
  }

  @Get('pdf/:examId')
  async asPdf(@Param('examId') examId: string, @Res() res: Response) {
    const questions = await this.questionRepo.find({ where: { examId }, order: { order: 'ASC' } });
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="question-paper.pdf"');
    doc.pipe(res);
    doc.fontSize(18).text('Question Paper', { align: 'center' });
    doc.moveDown();
    questions.forEach((q, idx) => {
      doc.fontSize(12).text(`${idx + 1}. (${q.marks} marks) ${q.questionText}`);
      if (q.options?.length) {
        q.options.forEach((o, i) => doc.text(`   ${String.fromCharCode(65 + i)}. ${o}`));
      }
      doc.moveDown(0.5);
    });
    doc.end();
  }

  @Post('update/:id')
  async update(@Param('id') id: string, @Body() body: { questionText?: string; marks?: number; options?: string[]; correctAnswer?: string }) {
    await this.questionRepo.update({ id }, body as any)
    return this.questionRepo.findOne({ where: { id } })
  }

  @Post('regenerate/:id')
  async regenerate(@Param('id') id: string) {
    const q = await this.questionRepo.findOne({ where: { id } })
    if (!q) return null
    return this.qg.regenerateQuestion(q)
  }
}


