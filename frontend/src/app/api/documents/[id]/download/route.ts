import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { downloadFile } from '@/lib/storage';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// GET /api/documents/[id]/download - Download public document
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseClient();

    const { data: document, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .eq('status', 'published')
      .single();

    if (error || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Public documents can be downloaded directly
    if (document.access_level === 'public') {
      try {
        // Download file from Supabase Storage
        const fileBuffer = await downloadFile(document.file_url);

        // Return file as response
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Disposition': `attachment; filename="${document.file_name}"`,
            'Content-Type': document.file_type || 'application/octet-stream',
            'Content-Length': fileBuffer.length.toString(),
          },
        });
      } catch (storageError: any) {
        console.error('Storage download error:', storageError);
        return NextResponse.json(
          { error: 'File not found in storage' },
          { status: 404 }
        );
      }
    }

    // Restricted documents require magic link validation (handled in access route)
    return NextResponse.json(
      { error: 'Access denied. Please use your magic link.' },
      { status: 403 }
    );
  } catch (error: any) {
    console.error('Document download error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
