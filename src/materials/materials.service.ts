import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Material, MaterialType } from './entities/material.entity';
import { Like } from 'typeorm';
import { Class } from '../classes/entities/class.entity';
import { Subject } from '../subjects/entities/subject.entity';

@Injectable()
export class MaterialsService {
  constructor(
    @InjectRepository(Material) private readonly materialsRepo: Repository<Material>,
    @InjectRepository(Class) private readonly classesRepo: Repository<Class>,
    @InjectRepository(Subject) private readonly subjectsRepo: Repository<Subject>,
  ) {}

  async createStudy(params: {
    teacherId: string;
    class: string;
    subject: string;
    pdfCloudUrl: string;
    vectorDbCollectionId: string;
    originalName: string;
    mimeType?: string;
    size?: number;
  }) {
    if (!params.teacherId || !params.class || !params.subject || !params.pdfCloudUrl) {
      throw new BadRequestException('teacherId, class, subject and pdfCloudUrl are required');
    }
    const material = this.materialsRepo.create({
      type: MaterialType.STUDY,
      teacherId: params.teacherId,
      class: params.class,
      subject: params.subject,
      pdfCloudUrl: params.pdfCloudUrl,
      vectorDbCollectionId: params.vectorDbCollectionId,
      originalName: params.originalName,
      mimeType: params.mimeType,
      size: params.size?.toString(),
    });
    return this.materialsRepo.save(material);
  }

  async createAnswer(params: {
    teacherId: string;
    class: string;
    subject: string;
    pdfCloudUrl: string;
    vectorDbCollectionId?: string;
    originalName: string;
    mimeType?: string;
    size?: number;
  }) {
    const material = this.materialsRepo.create({
      type: MaterialType.ANSWER,
      teacherId: params.teacherId,
      class: params.class,
      subject: params.subject,
      pdfCloudUrl: params.pdfCloudUrl,
      vectorDbCollectionId: params.vectorDbCollectionId,
      originalName: params.originalName,
      mimeType: params.mimeType,
      size: params.size?.toString(),
    });
    return this.materialsRepo.save(material);
  }

  async listStudy(params: { class?: string; subject?: string; q?: string; page: number; limit: number }) {
    const where: any = { type: MaterialType.STUDY };
    if (params.class) where.class = params.class;
    if (params.subject) where.subject = params.subject;
    if (params.q) where.originalName = Like(`%${params.q}%`);

    const [itemsRaw, total] = await this.materialsRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      select: {
        id: true,
        type: true,
        pdfCloudUrl: true,
        originalName: true,
        class: true,
        subject: true,
        vectorDbCollectionId: true,
        createdAt: true,
      } as any,
    });

    // Map legacy id values to their names if needed
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const classIds = Array.from(new Set(itemsRaw.map((i: any) => i.class).filter((v: any) => typeof v === 'string' && uuidRegex.test(v))));
    const subjectIds = Array.from(new Set(itemsRaw.map((i: any) => i.subject).filter((v: any) => typeof v === 'string' && uuidRegex.test(v))));

    let classMap: Record<string, string> = {};
    let subjectMap: Record<string, string> = {};
    if (classIds.length > 0) {
      const cls = await this.classesRepo.find({ where: { id: In(classIds) } });
      classMap = Object.fromEntries(cls.map((c) => [c.id, c.name]));
    }
    if (subjectIds.length > 0) {
      const subs = await this.subjectsRepo.find({ where: { id: In(subjectIds) } });
      subjectMap = Object.fromEntries(subs.map((s) => [s.id, s.name]));
    }

    const items = itemsRaw.map((i: any) => ({
      ...i,
      class: classMap[i.class] ?? i.class,
      subject: subjectMap[i.subject] ?? i.subject,
    }));
    return {
      items,
      total,
      page: params.page,
      limit: params.limit,
      pages: Math.ceil(total / params.limit),
    };
  }
}


