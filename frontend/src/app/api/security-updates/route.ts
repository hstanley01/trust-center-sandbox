import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// GET /api/security-updates - Get security updates (public or admin)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeUnpublished = searchParams.get('include_unpublished') === 'true';

    const supabase = getSupabaseClient();

    let query = supabase
      .from('security_updates')
      .select('*');

    if (!includeUnpublished) {
      // Public view: only published updates
      query = query
        .not('published_at', 'is', null)
        .lte('published_at', new Date().toISOString());
    }

    // Order by published_at for public, created_at for admin
    const { data, error } = await query.order(
      includeUnpublished ? 'created_at' : 'published_at',
      { ascending: false }
    );

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Security updates fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch security updates' },
      { status: 500 }
    );
  }
}

// Note: POST, PATCH, DELETE will be added in admin routes phase
