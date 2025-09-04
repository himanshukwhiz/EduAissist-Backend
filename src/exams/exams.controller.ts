import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Exam } from './entities/exam.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('exams')
@UseGuards(JwtAuthGuard)
export class ExamsController {
  constructor(@InjectRepository(Exam) private readonly repo: Repository<Exam>) {}

  @Get()
  async list(@Query('q') q?: string, @Query('page') page = '1', @Query('limit') limit = '10') {
    const where: any = {};
    if (q) where.title = Like(`%${q}%`);
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;
    const [rows, total] = await this.repo.findAndCount({ where, order: { createdAt: 'DESC' }, take, skip, relations: ['class', 'subject'] });
    const items = rows.map((e) => ({
      ...e,
      className: (e as any).class?.name ?? undefined,
      subjectName: (e as any).subject?.name ?? undefined,
    }));
    return { items, total, page: Number(page), limit: take, pages: Math.ceil(total / take) };
  }
}


