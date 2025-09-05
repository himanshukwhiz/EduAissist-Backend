import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
  }>;
}

export interface QuestionGenerationRequest {
  chunk: string;
  questionType: 'mcq' | 'short' | 'long';
  subject?: string;
  grade?: string;
  marks?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface GeneratedQuestion {
  type: 'multiple_choice' | 'short_answer' | 'long_answer';
  text: string;
  options?: string[];
  answer?: string;
  marks: number;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation?: string;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
  private readonly timeout = 30000; // 30 seconds
  private readonly maxRetries = 3;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    if (!this.apiKey) {
      this.logger.warn('GEMINI_API_KEY not found in environment variables');
    }
  }

  /**
   * Generate a question using Gemini AI API
   */
  async generateQuestion(request: QuestionGenerationRequest): Promise<GeneratedQuestion> {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const prompt = this.buildPrompt(request);
    this.logger.debug(`Generating ${request.questionType} question with prompt length: ${prompt.length}`);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.callGeminiAPI(prompt);
        const question = this.parseResponse(response, request);
        
        if (this.validateQuestion(question)) {
          this.logger.debug(`Successfully generated ${request.questionType} question on attempt ${attempt}`);
          return question;
        } else {
          this.logger.warn(`Generated question failed validation on attempt ${attempt}`);
          if (attempt === this.maxRetries) {
            throw new Error('Failed to generate valid question after maximum retries');
          }
        }
      } catch (error) {
        this.logger.error(`Attempt ${attempt} failed: ${error.message}`);
        if (attempt === this.maxRetries) {
          throw new Error(`Failed to generate question after ${this.maxRetries} attempts: ${error.message}`);
        }
        // Wait before retry
        await this.delay(1000 * attempt);
      }
    }

    throw new Error('Unexpected error in question generation');
  }

  /**
   * Build the prompt for Gemini API based on question type and content
   */
  private buildPrompt(request: QuestionGenerationRequest): string {
    const { chunk, questionType, subject, grade, marks, difficulty } = request;
    
    const basePrompt = `You are an expert educational content generator. Generate a ${questionType} question based on the provided textbook content.

CONTENT TO BASE QUESTION ON:
${chunk}

REQUIREMENTS:
- Question Type: ${questionType.toUpperCase()}
- Subject: ${subject || 'General'}
- Grade Level: ${grade || 'General'}
- Marks: ${marks || (questionType === 'mcq' ? 1 : questionType === 'short' ? 5 : 10)}
- Difficulty: ${difficulty || 'medium'}
- Base the question STRICTLY on the provided content
- Ensure the question is clear, unambiguous, and educationally appropriate

`;

    switch (questionType) {
      case 'mcq':
        return basePrompt + `Generate a multiple choice question with exactly 4 options (A, B, C, D).
        
OUTPUT FORMAT (JSON only):
{
  "type": "multiple_choice",
  "text": "Question text here",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "answer": "Correct option letter (A, B, C, or D)",
  "marks": ${marks || 1},
  "difficulty": "${difficulty || 'medium'}",
  "explanation": "Brief explanation of why this is the correct answer"
}`;

      case 'short':
        return basePrompt + `Generate a short answer question that requires a brief, focused response.
        
OUTPUT FORMAT (JSON only):
{
  "type": "short_answer",
  "text": "Question text here",
  "answer": "Expected short answer",
  "marks": ${marks || 5},
  "difficulty": "${difficulty || 'medium'}",
  "explanation": "Brief explanation of the expected answer"
}`;

      case 'long':
        return basePrompt + `Generate a long answer question that requires detailed explanation and analysis.
        
OUTPUT FORMAT (JSON only):
{
  "type": "long_answer",
  "text": "Question text here",
  "answer": "Expected detailed answer with key points",
  "marks": ${marks || 10},
  "difficulty": "${difficulty || 'medium'}",
  "explanation": "Detailed explanation of the expected answer and evaluation criteria"
}`;

      default:
        throw new Error(`Unsupported question type: ${questionType}`);
    }
  }

  /**
   * Call Gemini API with the given prompt
   */
  private async callGeminiAPI(prompt: string): Promise<GeminiResponse> {
    const url = `${this.baseUrl}?key=${this.apiKey}`;
    
    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        }
      ]
    };

    this.logger.debug(`Calling Gemini API with ${requestBody.contents[0].parts[0].text.length} characters`);

    const response = await axios.post(url, requestBody, {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status !== 200) {
      throw new Error(`Gemini API returned status ${response.status}: ${response.statusText}`);
    }

    return response.data;
  }

  /**
   * Parse Gemini API response and extract question data
   */
  private parseResponse(response: GeminiResponse, request: QuestionGenerationRequest): GeneratedQuestion {
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error('No candidates in Gemini response');
    }

    const candidate = response.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      throw new Error('No content in Gemini response candidate');
    }

    const text = candidate.content.parts[0].text;
    this.logger.debug(`Raw Gemini response: ${text.substring(0, 200)}...`);

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    try {
      const questionData = JSON.parse(jsonMatch[0]);
      
      // Validate and normalize the response
      const question: GeneratedQuestion = {
        type: this.normalizeQuestionType(questionData.type),
        text: this.cleanText(questionData.text),
        marks: Number(questionData.marks) || (request.questionType === 'mcq' ? 1 : request.questionType === 'short' ? 5 : 10),
        difficulty: this.normalizeDifficulty(questionData.difficulty),
        explanation: questionData.explanation ? this.cleanText(questionData.explanation) : undefined,
      };

      // Add type-specific fields
      if (question.type === 'multiple_choice') {
        if (!Array.isArray(questionData.options) || questionData.options.length !== 4) {
          throw new Error('MCQ must have exactly 4 options');
        }
        question.options = questionData.options.map((opt: string) => this.cleanText(opt));
        question.answer = this.cleanText(questionData.answer);
      } else {
        question.answer = this.cleanText(questionData.answer);
      }

      return question;
    } catch (error) {
      this.logger.error(`Failed to parse Gemini response: ${error.message}`);
      this.logger.error(`Raw response: ${text}`);
      throw new Error(`Failed to parse question from Gemini response: ${error.message}`);
    }
  }

  /**
   * Validate generated question
   */
  private validateQuestion(question: GeneratedQuestion): boolean {
    // Basic validation
    if (!question.text || question.text.trim().length < 10) {
      this.logger.warn('Question text too short');
      return false;
    }

    if (question.marks <= 0) {
      this.logger.warn('Invalid marks');
      return false;
    }

    if (!['easy', 'medium', 'hard'].includes(question.difficulty)) {
      this.logger.warn('Invalid difficulty level');
      return false;
    }

    // Type-specific validation
    if (question.type === 'multiple_choice') {
      if (!question.options || question.options.length !== 4) {
        this.logger.warn('MCQ must have exactly 4 options');
        return false;
      }
      if (!question.answer || !['A', 'B', 'C', 'D'].includes(question.answer)) {
        this.logger.warn('MCQ must have valid answer (A, B, C, or D)');
        return false;
      }
    } else {
      if (!question.answer || question.answer.trim().length < 5) {
        this.logger.warn('Answer too short for non-MCQ question');
        return false;
      }
    }

    return true;
  }

  /**
   * Normalize question type
   */
  private normalizeQuestionType(type: string): 'multiple_choice' | 'short_answer' | 'long_answer' {
    const normalized = type.toLowerCase().replace(/[_\s]/g, '_');
    if (normalized.includes('multiple') || normalized.includes('choice') || normalized === 'mcq') {
      return 'multiple_choice';
    }
    if (normalized.includes('long') || normalized.includes('essay')) {
      return 'long_answer';
    }
    return 'short_answer';
  }

  /**
   * Normalize difficulty level
   */
  private normalizeDifficulty(difficulty: string): 'easy' | 'medium' | 'hard' {
    const normalized = difficulty.toLowerCase();
    if (normalized === 'hard' || normalized === 'difficult') {
      return 'hard';
    }
    if (normalized === 'easy' || normalized === 'simple') {
      return 'easy';
    }
    return 'medium';
  }

  /**
   * Clean and normalize text
   */
  private cleanText(text: string): string {
    if (!text) return '';
    return text.trim().replace(/\s+/g, ' ');
  }

  /**
   * Delay utility for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test Gemini API connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      if (!this.apiKey) {
        return { success: false, error: 'GEMINI_API_KEY not configured' };
      }

      const testRequest: QuestionGenerationRequest = {
        chunk: 'This is a test chunk for API validation.',
        questionType: 'short',
        subject: 'Test',
        grade: 'Test',
        marks: 5,
        difficulty: 'medium'
      };

      const question = await this.generateQuestion(testRequest);
      
      return {
        success: true,
        details: {
          apiKey: this.apiKey.substring(0, 10) + '...',
          model: 'gemini-1.5-flash',
          testQuestion: question
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: { apiKey: this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'Not configured' }
      };
    }
  }
}
