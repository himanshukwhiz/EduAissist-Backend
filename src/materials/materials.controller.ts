import { Controller, Post, Get, UploadedFile, UseInterceptors, Body, UseGuards, Query, Header, Req, Param } from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { MaterialsService } from './materials.service';
import { FirebaseStorageService } from './storage/firebase-storage.service';
import { ChromaService } from './ingest/chroma.service';
import { PdfIngestService } from './ingest/pdf-ingest.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

function filenameGenerator(_req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  cb(null, uniqueSuffix + extname(file.originalname));
}

@Controller('materials')
//@UseGuards(JwtAuthGuard)
export class MaterialsController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly storage: FirebaseStorageService,
    private readonly chroma: ChromaService,
    private readonly pdfIngest: PdfIngestService,
  ) {}

  @Get('study')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async listStudy(
    @Query('class') className?: string,
    @Query('subject') subjectName?: string,
    @Query('q') q?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.materialsService.listStudy({ class: className, subject: subjectName, q, page: Number(page), limit: Number(limit) })
  }

  @Post('study')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: Number(process.env.MAX_FILE_SIZE || 10 * 1024 * 1024) },
  }))
  async uploadStudy(
    @UploadedFile() file: Express.Multer.File,
    @Body('teacherId') teacherId: string,
    @Body('class') className: string,
    @Body('subject') subjectName: string,
    @Body('vectorDbCollectionId') vectorDbCollectionId: string,
  ) {
    const storagePath = `materials/${teacherId}/${Date.now()}_${file.originalname}`;
    return (async () => {
      const pdfCloudUrl = await this.storage.uploadBuffer(storagePath, file.buffer, file.mimetype);
      const collectionId =  await this.chroma.createCollection(file.originalname);
      
      const saved = await this.materialsService.createStudy({
        teacherId,
        class: className,
        subject: subjectName,
        pdfCloudUrl,
        vectorDbCollectionId: collectionId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      });
      // Fire-and-forget ingestion (no await blocking request)
      if (process.env.INGEST_ENABLED === 'true') {
        const guardMb = Number(process.env.INGEST_HEAP_GUARD_MB || 1024);
        const usedMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        if (usedMb < guardMb) {
          console.log("Condition passed");
          
          // Ensure collection exists before ingestion
          try {
            const collectionExists = await this.chroma.collectionExists(collectionId);
            if (!collectionExists) {
              console.error(`[MaterialsController] Collection ${collectionId} does not exist. Cannot ingest PDF.`);
              return saved;
            }
            
            console.log(`[MaterialsController] Collection ${collectionId} verified to exist. Proceeding with PDF ingestion.`);
            
            this.pdfIngest
              .ingestPdfBuffer(
                collectionId,
                file.buffer,
                file.originalname,
                { class: className, subject: subjectName, teacherId },
                file.mimetype,
                file.size,
              )
              .then((result) => {
                if (result.error) {
                  console.error(`[MaterialsController] PDF ingestion failed for ${file.originalname}:`, result.error);
                  if (result.details) {
                    console.error(`[MaterialsController] Error details:`, result.details);
                  }
                } else {
                  console.log(`[MaterialsController] PDF ingestion successful for ${file.originalname}: ${result.segments} segments processed`);
                }
              })
              .catch((error) => {
                console.error(`[MaterialsController] PDF ingestion error for ${file.originalname}:`, error.message);
              });
              
          } catch (error: any) {
            console.error(`[MaterialsController] Failed to verify collection ${collectionId}:`, error.message);
            return saved;
          }
        } else {
          console.log(`*******Skipping PDF ingestion due to high memory usage: ${usedMb}MB >= ${guardMb}MB`);
          console.warn(`[MaterialsController] Skipping PDF ingestion due to high memory usage: ${usedMb}MB >= ${guardMb}MB`);
        }
      }
      return saved;
    })();
  }

  @Post('answers')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: Number(process.env.MAX_FILE_SIZE || 10 * 1024 * 1024) },
  }))
  async uploadAnswers(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Body('teacherId') teacherId?: string,
    @Body('class') className?: string,
    @Body('subject') subjectName?: string,
    @Body('vectorDbCollectionId') vectorDbCollectionId?: string,
  ) {
    const pdfCloudUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/uploads/${file.filename}`;
    const resolvedTeacherId = teacherId || (req as any)?.user?.id;
    return this.materialsService.createAnswer({
      teacherId: resolvedTeacherId,
      class: className || '-',
      subject: subjectName || '-',
      pdfCloudUrl,
      vectorDbCollectionId: vectorDbCollectionId || `ans_${Date.now()}`,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    });
  }

  @Get('test-chroma')
  async testChromaConnection() {
    try {
      const connectionTest = await this.chroma.testConnection();
      return {
        success: true,
        connection: connectionTest,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Get('test-collection-flow')
  async testCollectionFlow() {
    try {
      const testResult = await this.chroma.testCollectionFlow('test-upload-flow');
      return {
        success: true,
        testResult,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Get('list-collections')
  async listAllCollections() {
    try {
      const result = await this.chroma.listAllCollections();
      return {
        success: true,
        result,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Get('collection/:collectionId/validate')
  async validateCollection(@Param('collectionId') collectionId: string) {
    try {
      const validation = await this.chroma.validateCollection(collectionId);
      return {
        success: true,
        collectionId,
        validation,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        collectionId,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Get('collection/:collectionId/test-upsert')
  async testUpsert(@Param('collectionId') collectionId: string) {
    try {
      const testResult = await this.chroma.testUpsert(collectionId);
      return {
        success: true,
        collectionId,
        testResult,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        collectionId,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Get('collection/:collectionId/debug')
  async debugCollection(@Param('collectionId') collectionId: string) {
    try {
      const debugResult = await this.chroma.debugCollectionAccess(collectionId);
      return {
        success: true,
        collectionId,
        debugResult,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        collectionId,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Get('test-embeddings')
  async testEmbeddings() {
    try {
      // Test creating a collection with embeddings
      const collectionId = await this.chroma.createCollection('test-embeddings');
      
      // Test upserting documents with embeddings
      const testDocs = [
        { id: 'test_1', text: 'This is a test document for embedding testing.', metadata: { test: true, type: 'embedding_test' } },
        { id: 'test_2', text: 'Another test document to verify embeddings work correctly.', metadata: { test: true, type: 'embedding_test' } }
      ];
      
      await this.chroma.upsertDocuments(collectionId, testDocs);
      
      // Test querying with embeddings
      const results = await this.chroma.fetchTopK(collectionId, 'test document', 5);
      
      return {
        success: true,
        collectionId,
        upsertSuccess: true,
        queryResults: results,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Get('ollama-health')
  async checkOllamaHealth() {
    try {
      const healthStatus = await this.chroma.checkOllamaHealth();
      
      return {
        success: true,
        ollamaHealth: healthStatus,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Get('test-embedding')
  async testEmbedding() {
    try {
      const testText = 'This is a test text for embedding generation.';
      const embedding = await this.chroma.generateEmbedding(testText);
      
      return {
        success: true,
        text: testText,
        embedding: {
          dimensions: embedding.length,
          sample: embedding.slice(0, 5) // Show first 5 dimensions
        },
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}


