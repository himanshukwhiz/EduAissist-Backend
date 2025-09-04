import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Material } from './entities/material.entity';
import { MaterialsService } from './materials.service';
import { MaterialsController } from './materials.controller';
import { FirebaseStorageService } from './storage/firebase-storage.service';
import { ChromaService } from './ingest/chroma.service';
import { PdfIngestService } from './ingest/pdf-ingest.service';
import { Class } from '../classes/entities/class.entity';
import { Subject } from '../subjects/entities/subject.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Material, Class, Subject])],
  controllers: [MaterialsController],
  providers: [MaterialsService, FirebaseStorageService, ChromaService, PdfIngestService],
  exports: [MaterialsService],
})
export class MaterialsModule {}


