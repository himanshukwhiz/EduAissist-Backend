import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Class } from './entities/class.entity';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(Class) private readonly classesRepo: Repository<Class>,
  ) {}

  async create(createClassDto: CreateClassDto): Promise<Class> {
    const entity = this.classesRepo.create(createClassDto as any);
    const saved = await this.classesRepo.save(entity as any);
    return saved as Class;
  }

  async findAll(): Promise<Class[]> {
    return this.classesRepo.find({
      where: { isActive: true },
      relations: ['teacher', 'subjects', 'exams'],
    });
  }

  async findOne(id: string): Promise<Class> {
    const classEntity = await this.classesRepo.findOne({
      where: { id, isActive: true },
      relations: ['teacher', 'subjects', 'exams'],
    });
    if (!classEntity) throw new NotFoundException(`Class with ID ${id} not found`);
    return classEntity;
  }

  async findByTeacher(teacherId: string): Promise<Class[]> {
    return this.classesRepo.find({ where: { teacherId, isActive: true }, relations: ['subjects', 'exams'] });
  }

  async update(id: string, updateClassDto: UpdateClassDto): Promise<Class> {
    const classEntity = await this.findOne(id);
    Object.assign(classEntity, updateClassDto);
    const saved = await this.classesRepo.save(classEntity as any);
    return saved as Class;
  }

  async remove(id: string): Promise<void> {
    const classEntity = await this.findOne(id);
    classEntity.isActive = false;
    await this.classesRepo.save(classEntity);
  }

  async count(): Promise<number> {
    return this.classesRepo.count();
  }
}
