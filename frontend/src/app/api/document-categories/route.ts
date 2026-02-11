import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// GET /api/document-categories - Get all categories (public or admin)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeHidden = searchParams.get('include_hidden') === 'true';

    const supabase = getSupabaseClient();

    let query = supabase
      .from('document_categories')
      .select('*, documents(count)')
      .order('display_order', { ascending: true });

    // Filter out hidden categories for public requests
    if (!includeHidden) {
      query = query.eq('is_hidden', false);
    }

    let { data, error } = await query;

    // If is_hidden column doesn't exist yet, retry without the filter
    if (error && error.message.includes('is_hidden')) {
      const fallbackQuery = supabase
        .from('document_categories')
        .select('*, documents(count)')
        .order('display_order', { ascending: true });

      const fallbackResult = await fallbackQuery;
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      throw error;
    }

    // Transform to include document_count as a simple number
    const categoriesWithCount = data?.map((category: any) => ({
      ...category,
      document_count: category.documents?.[0]?.count || 0,
      documents: undefined, // Remove the raw documents array
    }));

    return NextResponse.json(categoriesWithCount);
  } catch (error: any) {
    console.error('Categories fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

// Note: POST, PATCH, DELETE will be added in admin routes phase
