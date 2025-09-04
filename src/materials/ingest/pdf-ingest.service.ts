import { Injectable, Logger } from '@nestjs/common';
import * as pdfParse from 'pdf-parse';
import { ChromaService } from './chroma.service';

@Injectable()
export class PdfIngestService {
  private readonly logger = new Logger(PdfIngestService.name);
  constructor(private readonly chroma: ChromaService) {}

  private chunk(text: string, chunkSize = 1200, overlap = 150): { id: string; text: string }[] {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    
    // Memory-efficient chunking: process in smaller batches
    const maxChunks = Number(process.env.INGEST_MAX_CHUNKS || 300);
    const chunks: { id: string; text: string }[] = [];
    
    let i = 0;
    let chunkCount = 0;
    
    while (i < cleaned.length && chunkCount < maxChunks) {
      const end = Math.min(i + chunkSize, cleaned.length);
      const slice = cleaned.slice(i, end);
      
      // Only add chunk if it has meaningful content
      if (slice.trim().length > 50) { // Minimum 50 characters
        chunks.push({ id: `p_${chunkCount}`, text: slice });
        chunkCount++;
      }
      
      i = end - overlap;
      if (i < 0) i = 0;
      if (i >= cleaned.length) break;
      
      // Memory check: if we're approaching memory limits, stop chunking
      if (chunkCount > 0 && chunkCount % 100 === 0) {
        const usedMemory = process.memoryUsage().heapUsed / 1024 / 1024; // MB
        if (usedMemory > 1500) { // 1.5GB limit
          this.logger.warn(`Memory usage high (${Math.round(usedMemory)}MB), limiting chunks to ${chunkCount}`);
          break;
        }
      }
    }
    
    this.logger.log(`Created ${chunks.length} chunks from ${cleaned.length} characters (${Math.round(cleaned.length / 1024)}KB)`);
    return chunks;
  }

  async ingestPdfBuffer(collectionId: string, buffer: Buffer, filename: string, metadata: Record<string, any>, mimeType?: string, sizeBytes?: number) {
    try {
      // Only attempt to parse PDFs; skip other types gracefully
      if (!mimeType || !/pdf/i.test(mimeType)) {
        this.logger.warn(`Skipping ingestion for non-PDF file: ${filename}`);
        return { segments: 0, error: 'Not a PDF file' };
      }

      const maxBytes = Number(process.env.INGEST_MAX_BYTES || 12 * 1024 * 1024);
      this.logger.log(`Processing PDF: ${filename}, Size: ${Math.round((sizeBytes || 0) / 1024)}KB, Max allowed: ${Math.round(maxBytes / 1024 / 1024)}MB`);
      
      if (sizeBytes && sizeBytes > maxBytes) {
        this.logger.warn(`Skipping ingestion for large PDF (${Math.round(sizeBytes/1024/1024)}MB > ${Math.round(maxBytes/1024/1024)}MB): ${filename}`);
        return { segments: 0, error: 'File too large' };
      }

      // Memory check before processing
      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      this.logger.log(`Initial memory usage: ${Math.round(initialMemory)}MB`);
      
      if (initialMemory > 1000) { // 1GB
        this.logger.warn(`High initial memory usage (${Math.round(initialMemory)}MB), PDF processing may be limited`);
      }

      // Suppress noisy pdfjs warnings like "TT: undefined function: 21"
      const originalWarn = console.warn;
      console.warn = (...args: any[]) => {
        const msg = (args && args[0]) ? String(args[0]) : '';
        if (msg.includes('undefined function') || msg.includes('bad XRef')) return; // drop common parsing warnings
        originalWarn.apply(console, args as any);
      };

      const maxPages = Number(process.env.INGEST_MAX_PAGES || 80);
      this.logger.log(`Attempting to parse PDF with max ${maxPages} pages`);

      // Try to parse the PDF with error handling
      let data;
      try {
        data = await (pdfParse as any)(buffer, { 
          max: maxPages,
          // Add more robust parsing options
          normalizeWhitespace: true,
          disableCombineTextItems: false
        }).finally(() => { console.warn = originalWarn; });
      } catch (parseError: any) {
        console.warn = originalWarn; // Restore console.warn
        
        // Handle specific PDF parsing errors
        if (parseError.message?.includes('bad XRef') || parseError.message?.includes('Invalid PDF')) {
          this.logger.error(`PDF parsing failed due to corrupted file structure: ${filename}`, parseError.message);
          return { 
            segments: 0, 
            error: 'PDF is corrupted or has invalid structure. Please try uploading a different version of this file.',
            details: parseError.message
          };
        }
        
        if (parseError.message?.includes('password')) {
          this.logger.error(`PDF is password protected: ${filename}`);
          return { 
            segments: 0, 
            error: 'PDF is password protected. Please remove the password and try again.',
            details: 'Password protected PDF'
          };
        }
        
        // Re-throw other parsing errors
        throw parseError;
      }

      // Validate extracted text
      if (!data || !data.text || data.text.trim().length === 0) {
        this.logger.warn(`No text content extracted from PDF: ${filename}`);
        return { 
          segments: 0, 
          error: 'No readable text content found in PDF. The file might be image-based or corrupted.',
          details: 'Empty text content'
        };
      }

      this.logger.log(`Successfully extracted ${data.text.length} characters from PDF: ${filename}`);

      // Memory check after text extraction
      const afterExtractionMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      this.logger.log(`Memory after text extraction: ${Math.round(afterExtractionMemory)}MB`);

      // Cap ingestion to avoid memory pressure for very large PDFs
      const chunks = this.chunk(data.text);
      this.logger.log(`Created ${chunks.length} text chunks from PDF: ${filename}`);
      
      const maxChunks = Number(process.env.INGEST_MAX_CHUNKS || 300);
      const capped = chunks.slice(0, maxChunks);
      
      if (capped.length < chunks.length) {
        this.logger.warn(`Limited chunks from ${chunks.length} to ${capped.length} for PDF: ${filename}`);
      }

      // Clear the original text data to free memory
      data.text = null;
      global.gc && global.gc(); // Force garbage collection if available

      // Upsert in small batches with memory monitoring
      const batchSize = Number(process.env.INGEST_BATCH_SIZE || 25); // Reduced batch size
      let successfulBatches = 0;
      
      for (let start = 0; start < capped.length; start += batchSize) {
        try {
          // Memory check before each batch
          const batchMemory = process.memoryUsage().heapUsed / 1024 / 1024;
          if (batchMemory > 1800) { // 1.8GB limit
            this.logger.warn(`Memory usage too high (${Math.round(batchMemory)}MB), stopping batch processing`);
            break;
          }

          const batch = capped.slice(start, start + batchSize).map((c, idx) => ({ 
            id: `${c.id}_${start + idx}`, 
            text: c.text, 
            metadata: { 
              filename, 
              ...metadata, 
              idx: start + idx,
              totalChunks: capped.length,
              batchNumber: Math.floor(start / batchSize) + 1
            } 
          }));
          
          // Debug logging for batch data
          this.logger.log(`Processing batch ${Math.floor(start / batchSize) + 1}/${Math.ceil(capped.length / batchSize)}`);
          this.logger.log(`Batch size: ${batch.length} documents`);
          this.logger.log(`Sample document ID: ${batch[0]?.id}`);
          this.logger.log(`Sample text length: ${batch[0]?.text?.length || 0} characters`);
          this.logger.log(`Sample metadata:`, batch[0]?.metadata);
          
          await this.chroma.upsertDocuments(collectionId, batch);
          successfulBatches++;
          
          this.logger.log(`Successfully processed batch ${Math.floor(start / batchSize) + 1}/${Math.ceil(capped.length / batchSize)} for PDF: ${filename}`);
          
          // Clear batch data to free memory
          batch.length = 0;
          
          // Small delay to allow garbage collection
          if (start % (batchSize * 2) === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
        } catch (batchError: any) {
          this.logger.error(`Failed to process batch ${Math.floor(start / batchSize) + 1} for PDF: ${filename}`, batchError.message);
          
          // Log detailed error information
          if (batchError.response) {
            this.logger.error(`HTTP Status: ${batchError.response.status}`);
            this.logger.error(`Response Data:`, batchError.response.data);
            this.logger.error(`Yes from Response Data: complete`);
          }
          
          // Continue with other batches instead of failing completely
        }
      }

      // Clear all chunk data to free memory
      capped.length = 0;
      chunks.length = 0;
      global.gc && global.gc(); // Force garbage collection if available

      const totalSegments = successfulBatches * batchSize;
      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      
      this.logger.log(`Successfully ingested ${totalSegments} segments from PDF: ${filename} into collection: ${collectionId}`);
      this.logger.log(`Final memory usage: ${Math.round(finalMemory)}MB (started at ${Math.round(initialMemory)}MB)`);
      
      return { 
        segments: totalSegments, 
        totalChunks: capped.length,
        successfulBatches,
        collectionId,
        memoryUsage: {
          initial: Math.round(initialMemory),
          final: Math.round(finalMemory)
        }
      };
      
    } catch (err: any) {
      this.logger.error(`PDF ingest failed for ${filename}:`, err.message);
      
      // Provide more specific error messages
      let errorMessage = 'PDF processing failed';
      let errorDetails = err.message;
      
      if (err.message?.includes('bad XRef')) {
        errorMessage = 'PDF file is corrupted or has invalid structure';
        errorDetails = 'The PDF cross-reference table is invalid. This usually means the file is corrupted.';
      } else if (err.message?.includes('Invalid PDF')) {
        errorMessage = 'Invalid PDF format';
        errorDetails = 'The file does not appear to be a valid PDF document.';
      } else if (err.message?.includes('ENOMEM') || err.message?.includes('JavaScript heap out of memory')) {
        errorMessage = 'Insufficient memory to process PDF';
        errorDetails = 'The PDF is too large or complex to process with available memory. Try uploading a smaller file or splitting the PDF.';
      }
      
      return {
        segments: 0,
        error: errorMessage,
        details: errorDetails,
        originalError: err.message
      };
    }
  }
}


