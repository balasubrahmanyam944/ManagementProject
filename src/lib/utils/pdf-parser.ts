/**
 * PDF text extraction utility
 * This module provides functions to extract readable text from PDF files
 */

// Dynamic import for pdfjs-dist (only load in browser)
let pdfjsLib: any = null;

async function loadPdfJs() {
  if (typeof window === 'undefined') {
    return null; // Server-side, skip pdfjs-dist
  }
  
  if (pdfjsLib) {
    return pdfjsLib; // Already loaded
  }
  
  try {
    pdfjsLib = await import('pdfjs-dist');
    
    // Get the actual version from the library
    const version = pdfjsLib.version || '4.0.379'; // Fallback version
    console.log(`📄 PDF Parser: Loaded pdfjs-dist version ${version}`);
    
    // Configure worker for browser - use CDN with correct version
    // For v4.x/v5.x, use .mjs extension
    const workerUrl = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    console.log(`📄 PDF Parser: Worker URL: ${workerUrl}`);
    
    return pdfjsLib;
  } catch (error) {
    console.warn('⚠️ PDF Parser: Failed to load pdfjs-dist, will use fallback methods:', error);
    return null;
  }
}

/**
 * Check if content appears to be garbled/binary data
 */
function isContentGarbled(content: string): boolean {
  // Check if content has very few readable words
  const words = content.split(/\s+/).filter(w => w.length > 2 && /[a-zA-Z]{3,}/.test(w));
  const wordRatio = words.length / Math.max(content.split(/\s+/).length, 1);
  
  // If less than 10% of content is readable words, it's likely garbled
  if (wordRatio < 0.1 && content.length > 100) {
    return true;
  }
  
  // Check for excessive special characters or binary patterns
  const specialCharRatio = (content.match(/[^\w\s.,!?;:()\-'"]/g) || []).length / Math.max(content.length, 1);
  if (specialCharRatio > 0.5) {
    return true;
  }
  
  // Check if content looks like binary data (lots of single characters, symbols)
  const singleCharRatio = (content.match(/\b\w\b/g) || []).length / Math.max(content.split(/\s+/).length, 1);
  if (singleCharRatio > 0.7) {
    return true;
  }
  
  return false;
}

export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    console.log('📄 PDF Parser: Starting text extraction from', file.name);
    
    // First, try server-side extraction (most reliable for complex PDFs)
    if (typeof window !== 'undefined') {
      try {
        console.log('📄 PDF Parser: Attempting server-side extraction...');
        
        // Get base path for tenant support
        // Check if we're in a tenant route (e.g., /gmail/testcases)
        const pathname = window.location.pathname;
        const pathParts = pathname.split('/').filter(Boolean);
        
        // Common tenant names or non-page routes to check
        const commonTenants = ['gmail', 'outlook', 'yahoo', 'custom'];
        const isTenantRoute = pathParts.length > 0 && commonTenants.includes(pathParts[0]);
        const basePath = isTenantRoute ? `/${pathParts[0]}` : '';
        
        console.log(`📄 PDF Parser: Pathname: ${pathname}, Base path: ${basePath || '(none)'}`);
        
        const formData = new FormData();
        formData.append('file', file);
        
        // Try tenant-specific API first, then fallback to root API
        const apiPaths = basePath 
          ? [`${basePath}/api/testcases/extract-pdf`, `/api/testcases/extract-pdf`]
          : [`/api/testcases/extract-pdf`];
        
        for (const apiPath of apiPaths) {
          try {
            console.log(`📄 PDF Parser: Trying API path: ${apiPath}`);
            const response = await fetch(apiPath, {
              method: 'POST',
              body: formData,
            });
            
            if (response.ok) {
              const result = await response.json();
              if (result.success && result.content) {
                const text = result.content.trim();
                if (text.length > 100 && !isContentGarbled(text)) {
                  console.log(`📄 PDF Parser: Successfully extracted ${text.length} characters using server-side extraction`);
                  console.log(`📄 PDF Parser: Text preview: ${text.substring(0, 300)}...`);
                  return text;
                } else if (text.length > 100) {
                  console.warn('⚠️ PDF Parser: Server-side extraction returned garbled content, trying client-side...');
                } else {
                  console.warn(`⚠️ PDF Parser: Server-side extraction returned only ${text.length} characters, trying client-side...`);
                }
              } else if (result.error) {
                console.warn(`⚠️ PDF Parser: Server-side extraction error: ${result.error}, trying client-side...`);
              }
            } else if (response.status === 404 && apiPaths.length > 1) {
              // Try next path
              continue;
            } else {
              console.warn(`⚠️ PDF Parser: Server-side extraction failed with status ${response.status}, trying client-side...`);
            }
          } catch (fetchError) {
            console.warn(`⚠️ PDF Parser: Error calling ${apiPath}:`, fetchError);
            if (apiPaths.indexOf(apiPath) < apiPaths.length - 1) {
              // Try next path
              continue;
            }
          }
        }
      } catch (serverError) {
        console.warn('⚠️ PDF Parser: Server-side extraction error, trying client-side:', serverError);
      }
    }
    
    // Try using pdfjs-dist (client-side fallback)
    try {
      console.log('📄 PDF Parser: Attempting extraction with pdfjs-dist...');
      const pdfjs = await loadPdfJs();
      
      if (!pdfjs) {
        throw new Error('pdfjs-dist not available');
      }
      
      const arrayBuffer = await file.arrayBuffer();
      
      // Use proper options for text extraction
      const loadingTask = pdfjs.getDocument({ 
        data: arrayBuffer,
        useSystemFonts: true,
        verbosity: 0,
      });
      const pdf = await loadingTask.promise;
      
      let fullText = '';
      const numPages = pdf.numPages;
      console.log(`📄 PDF Parser: PDF has ${numPages} pages`);
      
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          
          // Extract text with proper handling
          let pageText = '';
          let lastY: number | null = null;
          
          for (const item of textContent.items) {
            const textItem = item as any;
            if (textItem.str) {
              // Add newline when Y position changes significantly (new line in PDF)
              if (lastY !== null && Math.abs(textItem.transform[5] - lastY) > 5) {
                pageText += '\n';
              }
              pageText += textItem.str;
              lastY = textItem.transform[5];
            }
          }
          
          pageText = pageText.trim();
          
          if (pageText) {
            fullText += pageText + '\n\n';
          }
        } catch (pageError) {
          console.warn(`⚠️ PDF Parser: Error extracting page ${pageNum}:`, pageError);
        }
      }
      
      fullText = fullText.trim();
      
      if (fullText.length > 100 && !isContentGarbled(fullText)) {
        console.log(`📄 PDF Parser: Successfully extracted ${fullText.length} characters using pdfjs-dist`);
        console.log(`📄 PDF Parser: Text preview: ${fullText.substring(0, 300)}...`);
        return fullText;
      } else if (fullText.length > 100) {
        console.warn('⚠️ PDF Parser: Extracted content appears garbled, trying fallback methods...');
      } else {
        console.warn(`⚠️ PDF Parser: pdfjs-dist extracted only ${fullText.length} characters, trying fallback methods...`);
      }
    } catch (pdfjsError) {
      console.warn('⚠️ PDF Parser: pdfjs-dist extraction failed, trying fallback methods:', pdfjsError);
    }
    
    // Fallback: Manual extraction methods
    console.log('📄 PDF Parser: Using fallback extraction methods...');
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to string for analysis
    const pdfString = Array.from(uint8Array)
      .map(byte => String.fromCharCode(byte))
      .join('');
    
    console.log(`📄 PDF Parser: PDF string length: ${pdfString.length}`);
    
    let text = '';
    
    // Method 1: Extract text from PDF text objects (BT/ET markers)
    const textObjects = pdfString.match(/BT[\s\S]*?ET/g);
    if (textObjects) {
      console.log(`📄 PDF Parser: Found ${textObjects.length} text objects`);
      textObjects.forEach(obj => {
        // Extract text from parentheses and brackets
        const textMatches = obj.match(/\(([^)]+)\)|\[([^\]]+)\]/g);
        if (textMatches) {
          textMatches.forEach(match => {
            const cleanText = match
              .replace(/[()[\]]/g, '')
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '\r')
              .replace(/\\t/g, '\t')
              .replace(/\\\\/g, '\\')
              .trim();
            
            if (cleanText.length > 2 && /[a-zA-Z]/.test(cleanText)) {
              text += cleanText + ' ';
            }
          });
        }
      });
    }
    
    // Method 2: Extract text from TJ and Tj operators
    const tjMatches = pdfString.match(/\[([^\]]+)\]TJ|\(([^)]+)\)Tj/g);
    if (tjMatches) {
      console.log(`📄 PDF Parser: Found ${tjMatches.length} TJ/Tj operators`);
      tjMatches.forEach(match => {
        const cleanText = match
          .replace(/\[|\]|TJ|Tj|\(|\)/g, '')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\')
          .trim();
        
        if (cleanText.length > 2 && /[a-zA-Z]/.test(cleanText)) {
          text += cleanText + ' ';
        }
      });
    }
    
    // Final cleanup and validation
    text = text
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?;:()\-'"@#$%&*+=<>\/\\]/g, ' ')
      .trim();
    
    console.log(`📄 PDF Parser: Final extracted text length: ${text.length}`);
    console.log(`📄 PDF Parser: Text preview: ${text.substring(0, 200)}...`);
    
    // Validate content quality
    if (text.length < 100) {
      console.warn('⚠️ PDF Parser: Very little text extracted from PDF');
      return `PDF Content from ${file.name}:\n\nWARNING: Very little readable text was extracted from this PDF file. This could be due to:\n1. The PDF being image-based (scanned document)\n2. The PDF being encrypted or password-protected\n3. The PDF having a complex structure\n4. The PDF containing mostly non-text elements\n\nExtracted content (${text.length} characters):\n${text}\n\nPlease try:\n- Converting the PDF to a text file\n- Using a PDF with selectable text\n- Ensuring the PDF is not password-protected`;
    }
    
    // Check if content is garbled
    if (isContentGarbled(text)) {
      console.warn('⚠️ PDF Parser: Extracted content appears to be garbled/binary data');
      return `PDF Content from ${file.name}:\n\nWARNING: The extracted content appears to be garbled or binary data, not readable text. This PDF may be:\n1. Image-based (scanned document) - requires OCR\n2. Using a complex encoding that couldn't be decoded\n3. Corrupted or malformed\n\nPlease try:\n- Converting the PDF to a text file (.txt)\n- Using a PDF with selectable/copyable text\n- Exporting from Google Docs as .docx or .txt instead of PDF\n\nExtracted content preview (may be garbled):\n${text.substring(0, 500)}...`;
    }
    
    return text;
    
  } catch (error) {
    console.error('❌ PDF Parser: Error extracting text:', error);
    return `PDF file: ${file.name}\n\nError: Could not extract text from this PDF file. This might be due to the PDF being image-based, encrypted, or having a complex structure. Please try converting the PDF to a text file or ensure it contains selectable text.\n\nError details: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Check if a file is a PDF
 */
export function isPDF(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Extract text from various file types
 */
export async function extractTextFromFile(file: File): Promise<string> {
  console.log(`📄 File Parser: Processing ${file.name} (${file.type})`);
  
  if (isPDF(file)) {
    // Try multiple PDF extraction methods
    const pdfText = await extractTextFromPDF(file);
    
    // If PDF extraction failed, try alternative method
    if (pdfText.length < 100 || pdfText.includes('WARNING: Very little readable text')) {
      console.log('📄 File Parser: Primary PDF extraction failed, trying alternative method');
      const alternativeText = await extractTextFromPDFAlternative(file);
      if (alternativeText.length > pdfText.length) {
        return alternativeText;
      }
    }
    
    return pdfText;
  }
  
  // For text files, Word docs, etc.
  try {
    const text = await file.text();
    console.log(`📄 File Parser: Extracted ${text.length} characters from text file`);
    return text;
  } catch (error) {
    console.error('❌ File Parser: Error reading file as text:', error);
    return `File: ${file.name}\n\nError: Could not read this file type. Please ensure the file is a readable text document, PDF, or Word document.`;
  }
}

/**
 * Alternative PDF text extraction method
 */
async function extractTextFromPDFAlternative(file: File): Promise<string> {
  try {
    console.log('📄 PDF Parser Alternative: Starting alternative extraction method');
    
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to string
    const pdfString = Array.from(uint8Array)
      .map(byte => String.fromCharCode(byte))
      .join('');
    
    let text = '';
    
    // Method 1: Look for text in parentheses (common in PDFs)
    const parenMatches = pdfString.match(/\(([^)]+)\)/g);
    if (parenMatches) {
      console.log(`📄 PDF Parser Alternative: Found ${parenMatches.length} parentheses matches`);
      parenMatches.forEach(match => {
        const cleanText = match
          .replace(/[()]/g, '')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\')
          .trim();
        
        if (cleanText.length > 3 && /[a-zA-Z]/.test(cleanText)) {
          text += cleanText + ' ';
        }
      });
    }
    
    // Method 2: Look for text in brackets
    const bracketMatches = pdfString.match(/\[([^\]]+)\]/g);
    if (bracketMatches) {
      console.log(`📄 PDF Parser Alternative: Found ${bracketMatches.length} bracket matches`);
      bracketMatches.forEach(match => {
        const cleanText = match
          .replace(/[\[\]]/g, '')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\')
          .trim();
        
        if (cleanText.length > 3 && /[a-zA-Z]/.test(cleanText)) {
          text += cleanText + ' ';
        }
      });
    }
    
    // Method 3: Extract all readable text sequences
    if (text.length < 100) {
      console.log('📄 PDF Parser Alternative: Trying comprehensive text extraction');
      
      // Find all sequences of readable characters
      const readableSequences = pdfString.match(/[a-zA-Z][a-zA-Z0-9\s.,!?;:()\-'"]{10,}/g);
      if (readableSequences) {
        console.log(`📄 PDF Parser Alternative: Found ${readableSequences.length} readable sequences`);
        readableSequences.forEach(seq => {
          const cleanSeq = seq.trim();
          if (cleanSeq.length > 10 && /[a-zA-Z]/.test(cleanSeq)) {
            text += cleanSeq + ' ';
          }
        });
      }
    }
    
    // Final cleanup
    text = text
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?;:()\-'"@#$%&*+=<>\/\\]/g, ' ')
      .trim();
    
    console.log(`📄 PDF Parser Alternative: Extracted ${text.length} characters`);
    
    if (text.length < 50) {
      return `PDF Content from ${file.name}:\n\nAlternative extraction method also failed to extract meaningful text. This PDF may be:\n1. Image-based (scanned document)\n2. Encrypted or password-protected\n3. Corrupted or malformed\n4. Using a complex encoding\n\nPlease try converting to a text file or using a different PDF.`;
    }
    
    return text;
    
  } catch (error) {
    console.error('❌ PDF Parser Alternative: Error:', error);
    return `PDF file: ${file.name}\n\nAlternative extraction method failed. Please try converting the PDF to a text file.`;
  }
} 