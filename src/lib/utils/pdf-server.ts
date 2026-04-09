/**
 * Server-side PDF text extraction utility
 * Uses unpdf library which is designed for Node.js/serverless environments
 */

// This file should only be imported in server-side code (API routes, server actions)
if (typeof window !== 'undefined') {
  throw new Error('pdf-server.ts can only be used on the server');
}

/**
 * Extract text from PDF buffer using unpdf
 * This is specifically designed for Node.js/serverless environments
 */
export async function extractTextFromPDFBuffer(buffer: Buffer): Promise<{
  text: string;
  pages: number;
  info: any;
  method: 'text-extraction' | 'ocr';
}> {
  try {
    console.log('📄 PDF Server: Attempting text extraction with unpdf...');
    
    // Use unpdf for reliable Node.js PDF extraction
    const { extractText, getDocumentProxy, getMeta } = await import('unpdf');
    
    // Convert Buffer to ArrayBuffer
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
    
    // Extract text from PDF
    const { text, totalPages } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
    
    console.log(`📄 PDF Server: unpdf extracted ${text.length} characters from ${totalPages} pages`);
    
    // Validate extracted text
    if (text && text.length > 50 && isReadableText(text)) {
      console.log(`📄 PDF Server: Successfully extracted ${text.length} characters`);
      console.log(`📄 PDF Server: Text preview: ${text.substring(0, 300)}...`);
      return {
        text: text.trim(),
        pages: totalPages,
        info: { method: 'text-extraction', library: 'unpdf' },
        method: 'text-extraction',
      };
    } else if (text && text.length > 0) {
      console.warn(`📄 PDF Server: Extracted text may be incomplete (${text.length} chars)`);
      return {
        text: text.trim(),
        pages: totalPages,
        info: { method: 'text-extraction', library: 'unpdf', warning: 'Text may be incomplete' },
        method: 'text-extraction',
      };
    } else {
      throw new Error('No text extracted from PDF - PDF may be image-based');
    }
  } catch (unpdfError: any) {
    console.warn('📄 PDF Server: unpdf extraction failed, trying pdfjs-dist fallback:', unpdfError.message);
    
    // Fallback to pdfjs-dist with proper import path
    try {
      return await extractWithPdfJsDist(buffer);
    } catch (pdfjsError: any) {
      console.error('📄 PDF Server: All extraction methods failed:', pdfjsError.message);
      throw new Error(`PDF text extraction failed: ${pdfjsError.message}. The PDF may be image-based, corrupted, or password-protected.`);
    }
  }
}

/**
 * Fallback extraction using pdfjs-dist
 */
async function extractWithPdfJsDist(buffer: Buffer): Promise<{
  text: string;
  pages: number;
  info: any;
  method: 'text-extraction' | 'ocr';
}> {
  console.log('📄 PDF Server: Attempting pdfjs-dist extraction...');
  
  // Polyfill DOMMatrix for Node.js if needed
  if (typeof global !== 'undefined' && !global.DOMMatrix) {
    try {
      const { DOMMatrix, DOMMatrixReadOnly } = await import('dommatrix');
      (global as any).DOMMatrix = DOMMatrix;
      (global as any).DOMMatrixReadOnly = DOMMatrixReadOnly;
    } catch (e) {
      // Create minimal polyfill
      (global as any).DOMMatrix = class DOMMatrix {
        constructor(init?: any) {
          if (init) Object.assign(this, init);
        }
        static fromMatrix(other?: any) {
          return new (global as any).DOMMatrix(other);
        }
      };
    }
  }
  
  // Use dynamic import with proper path for pdfjs-dist v5.x
  const pdfjs = await import('pdfjs-dist');
  
  // Disable worker for Node.js
  pdfjs.GlobalWorkerOptions.workerSrc = false as any;
  
  // Load PDF
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  const numPages = pdf.numPages;
  console.log(`📄 PDF Server: pdfjs-dist loaded PDF with ${numPages} pages`);
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ')
        .trim();
      
      if (pageText) {
        fullText += pageText + '\n\n';
      }
    } catch (pageError: any) {
      console.warn(`📄 PDF Server: Error on page ${pageNum}:`, pageError.message);
    }
  }
  
  fullText = fullText.trim();
  
  if (fullText.length > 50 && isReadableText(fullText)) {
    console.log(`📄 PDF Server: pdfjs-dist extracted ${fullText.length} characters`);
    return {
      text: fullText,
      pages: numPages,
      info: { method: 'text-extraction', library: 'pdfjs-dist' },
      method: 'text-extraction',
    };
  } else if (fullText.length > 0) {
    return {
      text: fullText,
      pages: numPages,
      info: { method: 'text-extraction', library: 'pdfjs-dist', warning: 'Text may be garbled' },
      method: 'text-extraction',
    };
  } else {
    throw new Error('No text extracted - PDF may be image-based');
  }
}

/**
 * Check if text is readable (not garbled/binary)
 */
function isReadableText(text: string): boolean {
  if (text.length < 10) return false;
  
  // Check if text has reasonable word ratio
  const words = text.split(/\s+/).filter(w => w.length > 2 && /[a-zA-Z]{3,}/.test(w));
  const totalWords = text.split(/\s+/).length;
  const wordRatio = words.length / Math.max(totalWords, 1);
  
  // If less than 15% readable words, it's likely garbled
  if (wordRatio < 0.15 && text.length > 200) {
    return false;
  }
  
  // Check for excessive non-printable characters
  const nonPrintableCount = (text.match(/[^\x20-\x7E\n\r\t]/g) || []).length;
  const nonPrintableRatio = nonPrintableCount / Math.max(text.length, 1);
  if (nonPrintableRatio > 0.4) {
    return false;
  }
  
  // Check for common readable patterns
  const hasSentences = /[.!?]\s+[A-Z]/.test(text);
  const hasCommonWords = /\b(the|and|or|is|are|was|were|this|that|with|from|for|in|on|at|by)\b/i.test(text);
  
  return hasSentences || hasCommonWords || wordRatio > 0.1;
}
