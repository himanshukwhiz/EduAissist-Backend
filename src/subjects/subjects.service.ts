import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject } from './entities/subject.entity';

@Injectable()
export class SubjectsService {
  constructor(
    @InjectRepository(Subject) private readonly subjectsRepo: Repository<Subject>,
  ) {}

  async findAll(): Promise<Subject[]> {
    return this.subjectsRepo.find({ where: { isActive: true } });
  }
}


