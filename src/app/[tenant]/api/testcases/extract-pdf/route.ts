import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { extractTextFromPDFBuffer } from '@/lib/utils/pdf-server';

// Force Node.js runtime (not Edge) for PDF processing
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    console.log(`📄 Server-side PDF extraction (TENANT): Starting for ${file.name}`);
    
    // Convert File to Buffer for pdf-parse
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      const { text, pages, info, method } = await extractTextFromPDFBuffer(buffer);

      console.log(`📄 Server-side PDF extraction (TENANT): Extracted ${text.length} characters using ${method}`);
      console.log(`📄 Server-side PDF extraction (TENANT): Preview: ${text.substring(0, 300)}...`);

      if (text.length < 50) {
        return NextResponse.json({
          success: false,
          error: 'Very little text extracted from PDF',
          content: text,
          warning: 'This PDF may be image-based or have complex encoding. Please try converting to text file.',
          method: method
        }, { status: 200 });
      }

      return NextResponse.json({
        success: true,
        content: text,
        text: text, // Alias for compatibility
        pages: pages,
        info: info,
        method: method
      });

    } catch (pdfError: any) {
      console.error('❌ Server-side PDF extraction (TENANT) error:', pdfError);
      return NextResponse.json({
        error: 'Failed to extract text from PDF',
        details: pdfError.message
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('❌ PDF extraction API (TENANT) error:', error);
    return NextResponse.json({
      error: 'Failed to process PDF',
      details: error.message
    }, { status: 500 });
  }
}

