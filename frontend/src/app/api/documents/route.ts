import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// GET /api/documents - Get all documents (public returns only published)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category_id = searchParams.get('category_id');
    const access_level = searchParams.get('access_level');
    const include_all_status = searchParams.get('include_all_status') === 'true';

    const supabase = getSupabaseClient();

    let query = supabase
      .from('documents')
      .select('*, document_categories(*)')
      .eq('is_current_version', true)
      .order('created_at', { ascending: false });

    // For admin panel: include_all_status=true returns all documents
    // For public: only return published documents
    if (!include_all_status) {
      query = query.eq('status', 'published');
    }

    if (category_id) {
      query = query.eq('category_id', category_id);
    }

    if (access_level) {
      query = query.eq('access_level', access_level);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Documents fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

// Note: POST, PATCH, DELETE and file upload will be added in admin routes phase
