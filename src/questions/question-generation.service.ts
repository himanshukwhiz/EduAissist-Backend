import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Exam, ExamStatus, ExamType } from '../exams/entities/exam.entity';
import { DifficultyLevel, Question, QuestionType } from './entities/question.entity';
import axios from 'axios';
import { ChromaService } from '../materials/ingest/chroma.service';
import { Material } from '../materials/entities/material.entity';
import { GeminiService, QuestionGenerationRequest } from './services/gemini.service';
import { ChromaQuestionService, ChunkData } from './services/chroma-question.service';

@Injectable()
export class QuestionGenerationService {
  private readonly logger = new Logger(QuestionGenerationService.name);
  private ollamaBase = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  private model = process.env.OLLAMA_MODEL || 'mistral';
  private timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 15000);
  private useGemini = process.env.USE_GEMINI === 'true';

  constructor(
    @InjectRepository(Exam) private readonly examRepo: Repository<Exam>,
    @InjectRepository(Question) private readonly questionRepo: Repository<Question>,
    @InjectRepository(Material) private readonly materialRepo: Repository<Material>,
    private readonly chroma: ChromaService,
    private readonly geminiService: GeminiService,
    private readonly chromaQuestionService: ChromaQuestionService,
  ) {}

  async generateOrCreate(
    examId: string,
    body: { 
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
      materialId?: string 
    },
    createdById?: string,
  ) {
    let exam = await this.examRepo.findOne({ where: { id: examId } });
    if (!exam) {
      if (!body.classId || !body.subjectId) {
        throw new Error('Exam not found and classId/subjectId not provided to create one');
      }
      exam = await this.examRepo.save({
        title: body.title || `Question Paper - ${new Date().toLocaleDateString()}`,
        type: ExamType.UNIT_TEST,
        status: ExamStatus.DRAFT,
        totalMarks: body.maxMarks,
        duration: body.duration || 60,
        createdById: createdById || undefined as any,
        classId: body.classId,
        subjectId: body.subjectId,
      } as any);
    }
    return this.generateForExam(exam.id, body);
  }

  async generateForExam(examId: string, config: {
    maxMarks: number;
    weightage: { mcq: number; short: number; long: number };
    marksPerQuestion?: { mcq: number; short: number; long: number };
    questionCounts?: { mcqCount: number; shortCount: number; longCount: number };
    context?: string;
    collectionId?: string;
    materialId?: string;
  }) {
    const exam = await this.examRepo.findOne({ where: { id: examId } });
    if (!exam) throw new Error('Exam not found');
    
    // Resolve collectionId from material if not provided
    let collectionId = config.collectionId;
    console.log(`[QuestionGen] Initial collectionId from config: ${collectionId}`);
    
    if (!collectionId && config.materialId) {
      console.log(`[QuestionGen] No collectionId provided, resolving from materialId: ${config.materialId}`);
      const mat = await this.materialRepo.findOne({ where: { id: config.materialId } });
      if (mat) {
        console.log(`[QuestionGen] Found material:`, {
          id: mat.id,
          name: mat.originalName,
          vectorDbCollectionId: mat.vectorDbCollectionId
        });
        collectionId = mat.vectorDbCollectionId || undefined;
      } else {
        console.error(`[QuestionGen] Material not found with ID: ${config.materialId}`);
      }
    }
    
    if (!collectionId) {
      throw new Error('No vector collection provided. Please select a study material/book.');
    }

    // Calculate exact question counts if not provided
    const marksPerQuestion = config.marksPerQuestion || { mcq: 1, short: 5, long: 10 };
    const questionCounts = config.questionCounts || {
      mcqCount: Math.round((config.maxMarks * config.weightage.mcq / 100) / marksPerQuestion.mcq),
      shortCount: Math.round((config.maxMarks * config.weightage.short / 100) / marksPerQuestion.short),
      longCount: Math.round((config.maxMarks * config.weightage.long / 100) / marksPerQuestion.long)
    };

    this.logger.log(`[QuestionGen] Using ${this.useGemini ? 'Gemini AI' : 'Ollama'} for question generation`);
    this.logger.log(`[QuestionGen] Question counts: MCQs=${questionCounts.mcqCount}, Short=${questionCounts.shortCount}, Long=${questionCounts.longCount}`);

    // Use Gemini-based generation if enabled, otherwise fall back to Ollama
    if (this.useGemini) {
      return this.generateWithGeminiApproach(exam, collectionId, {
        maxMarks: config.maxMarks,
        weightage: config.weightage,
        marksPerQuestion,
        questionCounts,
        subject: exam.subjectId,
        grade: exam.classId
      });
    } else {
      return this.generateWithOllamaApproach(exam, collectionId, config, marksPerQuestion, questionCounts);
    }
  }

  /**
   * Generate questions using the new Gemini-based approach
   */
  private async generateWithGeminiApproach(
    exam: any,
    collectionId: string,
    config: {
      maxMarks: number;
      weightage: { mcq: number; short: number; long: number };
      marksPerQuestion: { mcq: number; short: number; long: number };
      questionCounts: { mcqCount: number; shortCount: number; longCount: number };
      subject: string;
      grade: string;
    }
  ): Promise<Question[]> {
    this.logger.log(`[QuestionGen] Starting Gemini-based generation for exam ${exam.id}`);

    // Validate collection
    const validation = await this.chromaQuestionService.validateCollectionForQuestions(collectionId);
    if (!validation.valid) {
      this.logger.error(`[QuestionGen] Collection validation failed: ${validation.issues.join(', ')}`);
      throw new Error(`Collection validation failed: ${validation.issues.join(', ')}`);
    }

    const questions: Question[] = [];
    let order = 1;

    // Generate MCQs
    this.logger.log(`[QuestionGen] Generating ${config.questionCounts.mcqCount} MCQs...`);
    for (let i = 0; i < config.questionCounts.mcqCount; i++) {
      try {
        const question = await this.generateMCQ(collectionId, {
          subject: config.subject,
          grade: config.grade,
          marks: config.marksPerQuestion.mcq,
          difficulty: this.getRandomDifficulty()
        });
        questions.push({
          ...question,
          examId: exam.id,
          order: order++,
        } as Question);
        this.logger.debug(`[QuestionGen] Generated MCQ ${i + 1}/${config.questionCounts.mcqCount}`);
      } catch (error) {
        this.logger.error(`[QuestionGen] Failed to generate MCQ ${i + 1}: ${error.message}`);
        // Add fallback question
        questions.push(this.createFallbackQuestion(QuestionType.MULTIPLE_CHOICE, config.marksPerQuestion.mcq, order++, exam.id));
      }
    }

    // Generate Short Questions
    this.logger.log(`[QuestionGen] Generating ${config.questionCounts.shortCount} Short Questions...`);
    for (let i = 0; i < config.questionCounts.shortCount; i++) {
      try {
        const question = await this.generateShortQuestion(collectionId, {
          subject: config.subject,
          grade: config.grade,
          marks: config.marksPerQuestion.short,
          difficulty: this.getRandomDifficulty()
        });
        questions.push({
          ...question,
          examId: exam.id,
          order: order++,
        } as Question);
        this.logger.debug(`[QuestionGen] Generated Short Question ${i + 1}/${config.questionCounts.shortCount}`);
      } catch (error) {
        this.logger.error(`[QuestionGen] Failed to generate Short Question ${i + 1}: ${error.message}`);
        questions.push(this.createFallbackQuestion(QuestionType.SHORT_ANSWER, config.marksPerQuestion.short, order++, exam.id));
      }
    }

    // Generate Long Questions
    this.logger.log(`[QuestionGen] Generating ${config.questionCounts.longCount} Long Questions...`);
    for (let i = 0; i < config.questionCounts.longCount; i++) {
      try {
        const question = await this.generateLongQuestion(collectionId, {
          subject: config.subject,
          grade: config.grade,
          marks: config.marksPerQuestion.long,
          difficulty: this.getRandomDifficulty()
        });
        questions.push({
          ...question,
          examId: exam.id,
          order: order++,
        } as Question);
        this.logger.debug(`[QuestionGen] Generated Long Question ${i + 1}/${config.questionCounts.longCount}`);
      } catch (error) {
        this.logger.error(`[QuestionGen] Failed to generate Long Question ${i + 1}: ${error.message}`);
        questions.push(this.createFallbackQuestion(QuestionType.LONG_ANSWER, config.marksPerQuestion.long, order++, exam.id));
      }
    }

    // Save questions to database
    const savedQuestions = await this.questionRepo.save(questions);
    this.logger.log(`[QuestionGen] Successfully generated and saved ${savedQuestions.length} questions using Gemini`);
    return savedQuestions;
  }

  /**
   * Generate questions using the legacy Ollama approach (fallback)
   */
  private async generateWithOllamaApproach(
    exam: any,
    collectionId: string,
    config: any,
    marksPerQuestion: { mcq: number; short: number; long: number },
    questionCounts: { mcqCount: number; shortCount: number; longCount: number }
  ): Promise<Question[]> {
    this.logger.log(`[QuestionGen] Using legacy Ollama approach for exam ${exam.id}`);

    // Fetch book content from vector database
    let bookContext = '';
    try {
      console.log(`[QuestionGen] Attempting to fetch content from collection: ${collectionId}`);
      
      // First, check if the collection exists and has documents
      const collectionStats = await this.chroma.getCollectionStats(collectionId);
      console.log(`[QuestionGen] Collection stats:`, collectionStats);
      
      if (!collectionStats.exists) {
        throw new Error(`Collection ${collectionId} does not exist`);
      }
      
      if (collectionStats.count === 0) {
        throw new Error(`Collection ${collectionId} has no documents`);
      }
      
      // Use the working fetchTopK method to get relevant content
      try {
        console.log('[QuestionGen] Attempting alternative content retrieval...');
        const collectionInfo = await this.chroma.getCollection(collectionId);
        console.log('[QuestionGen] Collection info:', collectionInfo);
        
        // Try to get a few documents directly
        const docCount = await this.chroma.count(collectionInfo.id);
        
        console.log(`[QuestionGen] Collection has ${docCount} documents`);
        bookContext = '';
        if (docCount > 0) {
          // Try to get first few documents
          const firstDocs = await this.chroma.getDocuments(collectionInfo.id);
          if (firstDocs && firstDocs.length > 0) {
            const joined = firstDocs.join('\n---\n');
            bookContext = joined.length > 12000 ? joined.slice(0, 12000) : joined;
            console.log(`[QuestionGen] Alternative method successful, got ${bookContext.length} characters`);
          }
        }
        if (!bookContext) {
          console.warn('[QuestionGen] Failed to retrieve study material context; proceeding without context');
          bookContext = '';
        }
      } catch (altError: any) {
        console.error('[QuestionGen] Alternative method also failed:', altError.message);
      }
    } catch (e: any) {
      console.error('[QuestionGen] Error retrieving study material context:', e.message);
         
    }

    const prompt = this.buildEnhancedPrompt({
      subject: exam.subjectId,
      grade: exam.classId,
      maxMarks: config.maxMarks,
      weightage: config.weightage,
      marksPerQuestion,
      questionCounts,
      context: bookContext,
      vectorCollectionId: collectionId,
    });

    // Log prompt for observability (trim to reasonable length)
    try {
      const preview = prompt.length > 4000 ? prompt.slice(0, 4000) + '... [truncated]' : prompt;
      // eslint-disable-next-line no-console
      console.info('[QuestionGen] Ollama prompt preview:\n', preview);
    } catch {}

    let blocks: Array<{ type: QuestionType; marks: number; text: string; options?: string[]; answer?: string; difficulty?: DifficultyLevel }> = [];
    try {
      //console.log('*****prompt******', prompt);
      const completion = await this.ollama(prompt);
      blocks = this.parseQuestions(completion);
    } catch {
      blocks = [];
    }
    
    if (!blocks.length) {
      // Non-contextual fallback to avoid hard failure
      blocks = this.generateFallback(config, questionCounts, marksPerQuestion);
    }

    let order = 1;
    const toSave: Partial<Question>[] = [];
    for (const b of blocks) {
      toSave.push({
        examId: exam.id,
        questionText: b.text,
        type: b.type,
        difficulty: b.difficulty ?? DifficultyLevel.MEDIUM,
        marks: b.marks,
        order: order++,
        options: b.options,
        correctAnswer: b.answer,
      });
    }
    const saved = await this.questionRepo.save(toSave as any);
    this.logger.log(`[QuestionGen] Successfully generated and saved ${saved.length} questions using Ollama`);
    return saved;
  }

  private buildEnhancedPrompt(args: { 
    subject: string; 
    grade: string; 
    maxMarks: number; 
    weightage: { mcq: number; short: number; long: number }; 
    marksPerQuestion: { mcq: number; short: number; long: number };
    questionCounts: { mcqCount: number; shortCount: number; longCount: number };
    context: string;
    vectorCollectionId: string;
  }) {
    return `SYSTEM: You are an expert exam question paper generator. Your task is to generate questions STRICTLY from the provided textbook content. Do NOT invent facts beyond the context provided.

TASK: Create a comprehensive question paper for subject ${args.subject}, grade ${args.grade}.

CONSTRAINTS:
- Maximum Marks: ${args.maxMarks}
- MCQs: ${args.questionCounts.mcqCount} questions, ${args.marksPerQuestion.mcq} mark each
- Short Questions: ${args.questionCounts.shortCount} questions, ${args.marksPerQuestion.short} marks each  
- Long Questions: ${args.questionCounts.longCount} questions, ${args.marksPerQuestion.long} marks each

RULES:
1. Use ONLY the provided book content (vector collection: ${args.vectorCollectionId})
2. Do NOT repeat questions
3. Cover the ENTIRE book content, not just specific chapters
4. Clearly mention marks for each question
5. Ensure questions are balanced and cover different topics from the book

OUTPUT FORMAT (JSON only):
{
  "questions": [
    { 
      "type": "multiple_choice|short_answer|long_answer", 
      "marks": number, 
      "text": "Question text with clear mark indication", 
      "options": ["A","B","C","D"], 
      "answer": "Correct answer", 
      "difficulty": "easy|medium|hard" 
    }
  ]
}

BOOK CONTEXT (source text to base all questions on):
${args.context}

Generate exactly ${args.questionCounts.mcqCount} MCQs, ${args.questionCounts.shortCount} short questions, and ${args.questionCounts.longCount} long questions. Each question must be derived from the book content above.`;
  }

  private async ollama(prompt: string): Promise<string> {
    console.log("***** ollama for generate questions *******",`${this.ollamaBase}/api/generate`);
    console.log("***** Passing prompt to ollama ==> ollama *******",prompt);
    const res = await axios.post(
      `${this.ollamaBase}/api/generate`,
      { model: this.model, prompt, stream: false },
      { timeout: this.timeoutMs },
    );
    // Ollama returns { response }
    //console.log("***** Passing prompt to ollama ==> ollama *******",prompt);

    return res.data?.response ?? '';
  }

  private parseQuestions(response: string): Array<{ type: QuestionType; marks: number; text: string; options?: string[]; answer?: string; difficulty?: DifficultyLevel }> {
    try {
      const start = response.indexOf('{');
      const end = response.lastIndexOf('}') + 1;
      const json = JSON.parse(response.slice(start, end));
      const out = Array.isArray(json.questions) ? json.questions : [];
      return out.map((q: any) => ({
        type: (q.type as string) === 'multiple_choice' ? QuestionType.MULTIPLE_CHOICE : (q.type === 'long_answer' ? QuestionType.LONG_ANSWER : QuestionType.SHORT_ANSWER),
        marks: Number(q.marks || 1),
        text: String(q.text || ''),
        options: Array.isArray(q.options) ? q.options : undefined,
        answer: q.answer ? String(q.answer) : undefined,
        difficulty: (q.difficulty as string)?.toLowerCase() === 'hard' ? DifficultyLevel.HARD : ((q.difficulty as string)?.toLowerCase() === 'easy' ? DifficultyLevel.EASY : DifficultyLevel.MEDIUM),
      }));
    } catch {
      return [];
    }
  }

  private generateFallback(config: { maxMarks: number; weightage: { mcq: number; short: number; long: number } }, questionCounts: { mcqCount: number; shortCount: number; longCount: number }, marksPerQuestion: { mcq: number; short: number; long: number }) {
    const questions: Array<{ type: QuestionType; marks: number; text: string; options?: string[]; answer?: string; difficulty?: DifficultyLevel }> = [];

    // Generate MCQs
    for (let i = 0; i < questionCounts.mcqCount; i++) {
      questions.push({
        type: QuestionType.MULTIPLE_CHOICE,
        marks: marksPerQuestion.mcq,
        text: `MCQ ${i + 1} (${marksPerQuestion.mcq} mark): Write a suitable question for the syllabus topic.`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        answer: 'Option A',
        difficulty: DifficultyLevel.MEDIUM,
      });
    }
    
    // Generate Short answers
    for (let i = 0; i < questionCounts.shortCount; i++) {
      questions.push({
        type: QuestionType.SHORT_ANSWER,
        marks: marksPerQuestion.short,
        text: `Short Q${i + 1} (${marksPerQuestion.short} marks): Provide a brief explanation on a key concept from the syllabus.`,
        difficulty: DifficultyLevel.MEDIUM,
      });
    }
    
    // Generate Long answers
    for (let i = 0; i < questionCounts.longCount; i++) {
      questions.push({
        type: QuestionType.LONG_ANSWER,
        marks: marksPerQuestion.long,
        text: `Long Q${i + 1} (${marksPerQuestion.long} marks): Discuss in detail with examples from the syllabus.`,
        difficulty: DifficultyLevel.MEDIUM,
      });
    }
    return questions;
  }

  async regenerateQuestion(question: Question): Promise<Question> {
    // Try model regeneration based on question meta; fallback to deterministic text
    const prompt = `Regenerate a ${question.type} question worth ${question.marks} marks. Return JSON {"text":"...","options":[...],"answer":"..."}`;
    let text = '';
    let options: string[] | undefined;
    let answer: string | undefined;
    try {
      const resp = await this.ollama(prompt);
      const start = resp.indexOf('{');
      const end = resp.lastIndexOf('}') + 1;
      const json = JSON.parse(resp.slice(start, end));
      text = String(json.text || 'Regenerated question');
      if (Array.isArray(json.options)) options = json.options;
      if (json.answer) answer = String(json.answer);
    } catch {
      text = 'Regenerated question: Write a detailed answer.';
    }
    question.questionText = text || question.questionText;
    if (question.type === QuestionType.MULTIPLE_CHOICE && options) question.options = options;
    if (answer) question.correctAnswer = answer;
    return this.questionRepo.save(question);
  }

  /**
   * Generate exam paper using Gemini AI and ChromaDB
   */
  async generateExamPaperWithGemini(
    examId: string,
    config: {
      maxMarks: number;
      weightage: { mcq: number; short: number; long: number };
      marksPerQuestion?: { mcq: number; short: number; long: number };
      questionCounts?: { mcqCount: number; shortCount: number; longCount: number };
      collectionId?: string;
      materialId?: string;
      subject?: string;
      grade?: string;
    }
  ): Promise<Question[]> {
    this.logger.log(`Generating exam paper with Gemini for exam ${examId}`);

    const exam = await this.examRepo.findOne({ where: { id: examId } });
    if (!exam) throw new Error('Exam not found');

    // Resolve collectionId
    let collectionId = config.collectionId;
    if (!collectionId && config.materialId) {
      const material = await this.materialRepo.findOne({ where: { id: config.materialId } });
      if (material) {
        collectionId = material.vectorDbCollectionId || undefined;
      }
    }

    if (!collectionId) {
      throw new Error('No vector collection provided. Please select a study material/book.');
    }

    // Calculate question counts
    const marksPerQuestion = config.marksPerQuestion || { mcq: 1, short: 5, long: 10 };
    const questionCounts = config.questionCounts || {
      mcqCount: Math.round((config.maxMarks * config.weightage.mcq / 100) / marksPerQuestion.mcq),
      shortCount: Math.round((config.maxMarks * config.weightage.short / 100) / marksPerQuestion.short),
      longCount: Math.round((config.maxMarks * config.weightage.long / 100) / marksPerQuestion.long)
    };

    this.logger.log(`Question counts: MCQs=${questionCounts.mcqCount}, Short=${questionCounts.shortCount}, Long=${questionCounts.longCount}`);

    // Validate collection
    const validation = await this.chromaQuestionService.validateCollectionForQuestions(collectionId);
    if (!validation.valid) {
      throw new Error(`Collection validation failed: ${validation.issues.join(', ')}`);
    }

    // Generate questions
    const questions: Question[] = [];
    let order = 1;

    // Generate MCQs
    for (let i = 0; i < questionCounts.mcqCount; i++) {
      try {
        const question = await this.generateMCQ(collectionId, {
          subject: config.subject || exam.subjectId,
          grade: config.grade || exam.classId,
          marks: marksPerQuestion.mcq,
          difficulty: this.getRandomDifficulty()
        });
        questions.push({
          ...question,
          examId: exam.id,
          order: order++,
        } as Question);
      } catch (error) {
        this.logger.error(`Failed to generate MCQ ${i + 1}: ${error.message}`);
        // Add fallback question
        questions.push(this.createFallbackQuestion(QuestionType.MULTIPLE_CHOICE, marksPerQuestion.mcq, order++, exam.id));
      }
    }

    // Generate Short Questions
    for (let i = 0; i < questionCounts.shortCount; i++) {
      try {
        const question = await this.generateShortQuestion(collectionId, {
          subject: config.subject || exam.subjectId,
          grade: config.grade || exam.classId,
          marks: marksPerQuestion.short,
          difficulty: this.getRandomDifficulty()
        });
        questions.push({
          ...question,
          examId: exam.id,
          order: order++,
        } as Question);
      } catch (error) {
        this.logger.error(`Failed to generate Short Question ${i + 1}: ${error.message}`);
        questions.push(this.createFallbackQuestion(QuestionType.SHORT_ANSWER, marksPerQuestion.short, order++, exam.id));
      }
    }

    // Generate Long Questions
    for (let i = 0; i < questionCounts.longCount; i++) {
      try {
        const question = await this.generateLongQuestion(collectionId, {
          subject: config.subject || exam.subjectId,
          grade: config.grade || exam.classId,
          marks: marksPerQuestion.long,
          difficulty: this.getRandomDifficulty()
        });
        questions.push({
          ...question,
          examId: exam.id,
          order: order++,
        } as Question);
      } catch (error) {
        this.logger.error(`Failed to generate Long Question ${i + 1}: ${error.message}`);
        questions.push(this.createFallbackQuestion(QuestionType.LONG_ANSWER, marksPerQuestion.long, order++, exam.id));
      }
    }

    // Save questions to database
    const savedQuestions = await this.questionRepo.save(questions);
    this.logger.log(`Successfully generated and saved ${savedQuestions.length} questions`);

    return savedQuestions;
  }

  /**
   * Generate a single MCQ using Gemini
   */
  private async generateMCQ(
    collectionId: string,
    options: { subject?: string; grade?: string; marks: number; difficulty: string }
  ): Promise<Partial<Question>> {
    const chunk = await this.chromaQuestionService.fetchRandomChunk({ collectionId });
    
    const request: QuestionGenerationRequest = {
      chunk: chunk.text,
      questionType: 'mcq',
      subject: options.subject,
      grade: options.grade,
      marks: options.marks,
      difficulty: options.difficulty as any
    };

    const generatedQuestion = await this.geminiService.generateQuestion(request);

    return {
      questionText: generatedQuestion.text,
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: this.mapDifficulty(generatedQuestion.difficulty),
      marks: generatedQuestion.marks,
      options: generatedQuestion.options,
      correctAnswer: generatedQuestion.answer,
      explanation: generatedQuestion.explanation,
    };
  }

  /**
   * Generate a single Short Question using Gemini
   */
  private async generateShortQuestion(
    collectionId: string,
    options: { subject?: string; grade?: string; marks: number; difficulty: string }
  ): Promise<Partial<Question>> {
    const chunk = await this.chromaQuestionService.fetchRandomChunk({ collectionId });
    
    const request: QuestionGenerationRequest = {
      chunk: chunk.text,
      questionType: 'short',
      subject: options.subject,
      grade: options.grade,
      marks: options.marks,
      difficulty: options.difficulty as any
    };

    const generatedQuestion = await this.geminiService.generateQuestion(request);

    return {
      questionText: generatedQuestion.text,
      type: QuestionType.SHORT_ANSWER,
      difficulty: this.mapDifficulty(generatedQuestion.difficulty),
      marks: generatedQuestion.marks,
      correctAnswer: generatedQuestion.answer,
      explanation: generatedQuestion.explanation,
    };
  }

  /**
   * Generate a single Long Question using Gemini
   */
  private async generateLongQuestion(
    collectionId: string,
    options: { subject?: string; grade?: string; marks: number; difficulty: string }
  ): Promise<Partial<Question>> {
    const chunk = await this.chromaQuestionService.fetchRandomChunk({ collectionId });
    
    const request: QuestionGenerationRequest = {
      chunk: chunk.text,
      questionType: 'long',
      subject: options.subject,
      grade: options.grade,
      marks: options.marks,
      difficulty: options.difficulty as any
    };

    const generatedQuestion = await this.geminiService.generateQuestion(request);

    return {
      questionText: generatedQuestion.text,
      type: QuestionType.LONG_ANSWER,
      difficulty: this.mapDifficulty(generatedQuestion.difficulty),
      marks: generatedQuestion.marks,
      correctAnswer: generatedQuestion.answer,
      explanation: generatedQuestion.explanation,
    };
  }

  /**
   * Map difficulty string to enum
   */
  private mapDifficulty(difficulty: string): DifficultyLevel {
    switch (difficulty.toLowerCase()) {
      case 'easy': return DifficultyLevel.EASY;
      case 'hard': return DifficultyLevel.HARD;
      default: return DifficultyLevel.MEDIUM;
    }
  }

  /**
   * Get random difficulty level
   */
  private getRandomDifficulty(): string {
    const difficulties = ['easy', 'medium', 'hard'];
    return difficulties[Math.floor(Math.random() * difficulties.length)];
  }

  /**
   * Create fallback question when generation fails
   */
  private createFallbackQuestion(type: QuestionType, marks: number, order: number, examId: string): Question {
    const baseText = type === QuestionType.MULTIPLE_CHOICE 
      ? `MCQ ${order} (${marks} mark): Please select the correct answer.`
      : type === QuestionType.SHORT_ANSWER
      ? `Short Question ${order} (${marks} marks): Provide a brief answer.`
      : `Long Question ${order} (${marks} marks): Provide a detailed answer.`;

    const question = new Question();
    question.examId = examId;
    question.questionText = baseText;
    question.type = type;
    question.difficulty = DifficultyLevel.MEDIUM;
    question.marks = marks;
    question.order = order;
    question.isActive = true;

    if (type === QuestionType.MULTIPLE_CHOICE) {
      question.options = ['Option A', 'Option B', 'Option C', 'Option D'];
      question.correctAnswer = 'A';
    } else {
      question.correctAnswer = 'Please provide your answer here.';
    }

    return question;
  }

  /**
   * Test the complete question generation system
   */
  async testQuestionGenerationSystem(collectionId: string): Promise<{
    success: boolean;
    error?: string;
    details?: any;
  }> {
    try {
      this.logger.log(`Testing question generation system with collection: ${collectionId}`);

      // Test 1: ChromaDB service
      const chromaTest = await this.chromaQuestionService.testService(collectionId);
      if (!chromaTest.success) {
        return { success: false, error: `ChromaDB test failed: ${chromaTest.error}` };
      }

      // Test 2: Gemini service
      const geminiTest = await this.geminiService.testConnection();
      if (!geminiTest.success) {
        return { success: false, error: `Gemini test failed: ${geminiTest.error}` };
      }

      // Test 3: Generate a sample question
      const sampleChunk = await this.chromaQuestionService.fetchRandomChunk({ collectionId });
      const sampleRequest: QuestionGenerationRequest = {
        chunk: sampleChunk.text,
        questionType: 'short',
        subject: 'Test',
        grade: 'Test',
        marks: 5,
        difficulty: 'medium'
      };

      const sampleQuestion = await this.geminiService.generateQuestion(sampleRequest);

      return {
        success: true,
        details: {
          chromaTest: chromaTest.details,
          geminiTest: geminiTest.details,
          sampleQuestion: {
            type: sampleQuestion.type,
            textLength: sampleQuestion.text.length,
            marks: sampleQuestion.marks,
            difficulty: sampleQuestion.difficulty
          }
        }
      };

    } catch (error) {
      this.logger.error(`System test failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}


