import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// GET /api/documents/[id] - Get document by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const include_all_status = searchParams.get('include_all_status') === 'true';

    const supabase = getSupabaseClient();

    let query = supabase
      .from('documents')
      .select('*, document_categories(*)')
      .eq('id', params.id);

    // For admin panel: include_all_status=true returns any document
    // For public: only return published documents
    if (!include_all_status) {
      query = query.eq('status', 'published');
    }

    const { data, error } = await query.single();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Document fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch document' },
      { status: 500 }
    );
  }
}

// Note: PATCH, DELETE will be added in admin routes phase
