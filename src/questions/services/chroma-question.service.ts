import { Injectable, Logger } from '@nestjs/common';
import { ChromaService } from '../../materials/ingest/chroma.service';

export interface ChunkData {
  id: string;
  text: string;
  metadata?: any;
  score?: number;
}

export interface RandomChunkOptions {
  collectionId: string;
  query?: string;
  limit?: number;
  includeMetadata?: boolean;
}

@Injectable()
export class ChromaQuestionService {
  private readonly logger = new Logger(ChromaQuestionService.name);

  constructor(private readonly chromaService: ChromaService) {}

  /**
   * Fetch a random chunk from the specified collection
   */
  async fetchRandomChunk(options: RandomChunkOptions): Promise<ChunkData> {
    const { collectionId, includeMetadata = true } = options;
    
    this.logger.debug(`Fetching random chunk from collection: ${collectionId}`);

    try {
      // First, verify the collection exists and has documents
      const stats = await this.chromaService.getCollectionStats(collectionId);
      if (!stats.exists) {
        throw new Error(`Collection ${collectionId} does not exist`);
      }
      if (stats.count === 0) {
        throw new Error(`Collection ${collectionId} is empty`);
      }

      this.logger.debug(`Collection ${collectionId} has ${stats.count} documents`);

      // Get all documents from the collection
      const allDocuments = await this.chromaService.getDocuments(collectionId);
      
      if (!allDocuments || allDocuments.length === 0) {
        throw new Error(`No documents found in collection ${collectionId}`);
      }

      this.logger.debug(`Retrieved ${allDocuments.length} documents from collection`);

      // Select a random document
      const randomIndex = Math.floor(Math.random() * allDocuments.length);
      const selectedDocument = allDocuments[randomIndex];

      this.logger.debug(`Selected random document ${randomIndex + 1} of ${allDocuments.length} with ${selectedDocument.length} characters`);

      return {
        id: `doc_${randomIndex}_${Date.now()}`,
        text: selectedDocument,
        metadata: includeMetadata ? { 
          source: collectionId, 
          documentIndex: randomIndex,
          totalDocuments: allDocuments.length,
          selectionMethod: 'random'
        } : undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch random chunk from ${collectionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch multiple random chunks from the collection without requiring a query
   */
  async fetchRandomChunks(collectionId: string, limit: number = 5, includeMetadata: boolean = true): Promise<ChunkData[]> {
    this.logger.debug(`Fetching ${limit} random chunks from collection ${collectionId}`);

    try {
      // Get all documents from the collection
      const allDocuments = await this.chromaService.getDocuments(collectionId);
      
      if (!allDocuments || allDocuments.length === 0) {
        this.logger.warn(`No documents found in collection ${collectionId}`);
        return [];
      }

      // Shuffle the documents array to get random selection
      const shuffledDocs = [...allDocuments].sort(() => Math.random() - 0.5);
      
      // Take the requested number of documents
      const selectedDocs = shuffledDocs.slice(0, Math.min(limit, shuffledDocs.length));

      // Convert to ChunkData format
      const chunks: ChunkData[] = selectedDocs.map((doc, index) => ({
        id: `random_chunk_${index}_${Date.now()}`,
        text: doc,
        metadata: includeMetadata ? { 
          source: collectionId, 
          index, 
          totalDocuments: allDocuments.length,
          selectionMethod: 'random'
        } : undefined,
      }));

      this.logger.debug(`Successfully fetched ${chunks.length} random chunks`);
      return chunks;
    } catch (error) {
      this.logger.error(`Failed to fetch random chunks from ${collectionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch multiple chunks from the collection using a query (legacy method)
   */
  async fetchChunks(collectionId: string, query: string, limit: number = 5, includeMetadata: boolean = true): Promise<ChunkData[]> {
    this.logger.debug(`Fetching ${limit} chunks from collection ${collectionId} with query: ${query.substring(0, 50)}...`);

    try {
      // Use the existing fetchTopK method
      const documents = await this.chromaService.fetchTopK(collectionId, query, limit);
      
      if (!documents || documents.length === 0) {
        this.logger.warn(`No documents found for query: ${query}`);
        return [];
      }

      // Convert to ChunkData format
      const chunks: ChunkData[] = documents.map((doc, index) => ({
        id: `chunk_${index}_${Date.now()}`,
        text: doc,
        metadata: includeMetadata ? { source: collectionId, index, query } : undefined,
      }));

      this.logger.debug(`Successfully fetched ${chunks.length} chunks`);
      return chunks;
    } catch (error) {
      this.logger.error(`Failed to fetch chunks from ${collectionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch chunks by document ID (if you want to target specific documents)
   */
  async fetchChunksByDocumentId(collectionId: string, documentId: string): Promise<ChunkData[]> {
    this.logger.debug(`Fetching chunks for document ${documentId} from collection ${collectionId}`);

    try {
      // Get all documents from the collection
      const allDocuments = await this.chromaService.getDocuments(collectionId);
      
      if (!allDocuments || allDocuments.length === 0) {
        throw new Error(`No documents found in collection ${collectionId}`);
      }

      // Filter documents that might be related to the documentId
      // This is a simple implementation - you might want to enhance this based on your metadata structure
      const relevantDocuments = allDocuments.filter(doc => 
        doc.toLowerCase().includes(documentId.toLowerCase()) || 
        doc.includes(documentId)
      );

      if (relevantDocuments.length === 0) {
        this.logger.warn(`No documents found matching document ID: ${documentId}`);
        // Return a random document if no match found
        const randomIndex = Math.floor(Math.random() * allDocuments.length);
        return [{
          id: `fallback_${randomIndex}`,
          text: allDocuments[randomIndex],
          metadata: { source: collectionId, documentId, fallback: true }
        }];
      }

      // Convert to ChunkData format
      const chunks: ChunkData[] = relevantDocuments.map((doc, index) => ({
        id: `${documentId}_chunk_${index}`,
        text: doc,
        metadata: { source: collectionId, documentId, index }
      }));

      this.logger.debug(`Found ${chunks.length} chunks for document ${documentId}`);
      return chunks;
    } catch (error) {
      this.logger.error(`Failed to fetch chunks by document ID ${documentId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get collection information and statistics
   */
  async getCollectionInfo(collectionId: string): Promise<{
    exists: boolean;
    count: number;
    metadata?: any;
    sampleChunks?: ChunkData[];
  }> {
    try {
      const stats = await this.chromaService.getCollectionStats(collectionId);
      
      if (!stats.exists) {
        return { exists: false, count: 0 };
      }

      // Get a few sample chunks to understand the content
      let sampleChunks: ChunkData[] = [];
      try {
        sampleChunks = await this.fetchRandomChunks(collectionId, 3, true);
      } catch (error) {
        this.logger.warn(`Could not fetch sample chunks: ${error.message}`);
      }

      return {
        exists: stats.exists,
        count: stats.count,
        metadata: stats.metadata,
        sampleChunks
      };
    } catch (error) {
      this.logger.error(`Failed to get collection info for ${collectionId}: ${error.message}`);
      return { exists: false, count: 0 };
    }
  }

  /**
   * Generate a random query to get diverse content
   */
  private generateRandomQuery(): string {
    const queries = [
      'introduction overview',
      'main concepts',
      'key principles',
      'important details',
      'fundamental ideas',
      'core concepts',
      'essential information',
      'primary topics',
      'central themes',
      'basic principles',
      'general concepts',
      'fundamental concepts',
      'key ideas',
      'main topics',
      'important concepts'
    ];

    const randomIndex = Math.floor(Math.random() * queries.length);
    return queries[randomIndex];
  }

  /**
   * Validate collection for question generation
   */
  async validateCollectionForQuestions(collectionId: string): Promise<{
    valid: boolean;
    issues: string[];
    recommendations?: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check if collection exists
      const info = await this.getCollectionInfo(collectionId);
      
      if (!info.exists) {
        issues.push(`Collection ${collectionId} does not exist`);
        return { valid: false, issues };
      }

      if (info.count === 0) {
        issues.push(`Collection ${collectionId} is empty`);
        return { valid: false, issues };
      }

      // Check content quality
      if (info.sampleChunks && info.sampleChunks.length > 0) {
        const avgChunkLength = info.sampleChunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / info.sampleChunks.length;
        
        if (avgChunkLength < 100) {
          issues.push('Chunks are too short (average < 100 characters)');
          recommendations.push('Consider increasing chunk size for better question generation');
        }

        if (avgChunkLength > 2000) {
          issues.push('Chunks are too long (average > 2000 characters)');
          recommendations.push('Consider splitting large chunks for more focused questions');
        }

        // Check for diverse content
        const uniqueWords = new Set();
        info.sampleChunks.forEach(chunk => {
          chunk.text.toLowerCase().split(/\s+/).forEach(word => {
            if (word.length > 3) uniqueWords.add(word);
          });
        });

        if (uniqueWords.size < 50) {
          recommendations.push('Content appears limited - consider adding more diverse material');
        }
      }

      // Check document count
      if (info.count < 5) {
        recommendations.push('Collection has few documents - consider adding more content for better question variety');
      }

      return {
        valid: issues.length === 0,
        issues,
        recommendations: recommendations.length > 0 ? recommendations : undefined
      };

    } catch (error) {
      issues.push(`Error validating collection: ${error.message}`);
      return { valid: false, issues };
    }
  }

  /**
   * Test the service with a collection
   */
  async testService(collectionId: string): Promise<{
    success: boolean;
    error?: string;
    details?: any;
  }> {
    try {
      this.logger.debug(`Testing ChromaQuestionService with collection: ${collectionId}`);

      // Test 1: Get collection info
      const info = await this.getCollectionInfo(collectionId);
      if (!info.exists) {
        return { success: false, error: `Collection ${collectionId} does not exist` };
      }

      // Test 2: Fetch a random chunk
      const randomChunk = await this.fetchRandomChunk({ collectionId });
      if (!randomChunk || !randomChunk.text) {
        return { success: false, error: 'Failed to fetch random chunk' };
      }

      // Test 3: Validate collection
      const validation = await this.validateCollectionForQuestions(collectionId);

      return {
        success: true,
        details: {
          collectionInfo: info,
          sampleChunk: {
            id: randomChunk.id,
            textLength: randomChunk.text.length,
            textPreview: randomChunk.text.substring(0, 200) + '...'
          },
          validation
        }
      };

    } catch (error) {
      this.logger.error(`Service test failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
