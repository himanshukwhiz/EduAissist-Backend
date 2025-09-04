// src/teachers/teachers.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Teacher } from './entities/teachers.entity';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(Teacher)
    private teacherRepo: Repository<Teacher>,
  ) {}

  async create(dto: CreateTeacherDto): Promise<Teacher> {
    const teacher = this.teacherRepo.create(dto);
    return this.teacherRepo.save(teacher);
  }

  async findAll(skip = 0, take = 10): Promise<{ data: Teacher[]; total: number }> {
    const [data, total] = await this.teacherRepo.findAndCount({
      skip,
      take,
    });
    return { data, total };
  }

  async count(): Promise<number> {
    return this.teacherRepo.count();
  }

  async findOne(id: number): Promise<Teacher> {
    const teacher = await this.teacherRepo.findOne({ where: { id } });
    if (!teacher) throw new NotFoundException(`Teacher with ID ${id} not found`);
    return teacher;
  }

  async update(id: number, dto: UpdateTeacherDto): Promise<Teacher> {
    const teacher = await this.findOne(id);
    Object.assign(teacher, dto);
    return this.teacherRepo.save(teacher);
  }

  async remove(id: number): Promise<void> {
    const teacher = await this.findOne(id);
    await this.teacherRepo.remove(teacher);
  }
}
