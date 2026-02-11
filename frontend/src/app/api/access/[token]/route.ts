import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// GET /api/access/[token] - Validate magic link and show access page
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    const supabase = getSupabaseClient();

    // First fetch the document request
    const { data: requestData, error } = await supabase
      .from('document_requests')
      .select('*')
      .eq('magic_link_token', token)
      .single();

    if (error || !requestData) {
      console.error('Magic link lookup failed:', error?.message || 'No request found');
      return NextResponse.json(
        { error: 'Invalid or expired link' },
        { status: 404 }
      );
    }

    // Check expiration
    if (requestData.magic_link_expires_at && new Date(requestData.magic_link_expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This link has expired' },
        { status: 403 }
      );
    }

    // Check status
    if (!['approved', 'auto_approved'].includes(requestData.status)) {
      return NextResponse.json(
        { error: 'Access not approved' },
        { status: 403 }
      );
    }

    // Fetch the documents separately using the document_ids array
    let documents: any[] = [];
    if (requestData.document_ids && requestData.document_ids.length > 0) {
      const { data: docs, error: docsError } = await supabase
        .from('documents')
        .select('id, title, description, file_name, file_type, file_size, access_level')
        .in('id', requestData.document_ids);

      if (!docsError && docs) {
        documents = docs;
      }
    }

    // Track access
    if (!requestData.magic_link_used_at) {
      await supabase
        .from('document_requests')
        .update({ magic_link_used_at: new Date().toISOString() })
        .eq('id', requestData.id);
    }

    return NextResponse.json({
      request: {
        id: requestData.id,
        requester_name: requestData.requester_name,
        documents: documents,
      },
    });
  } catch (error: any) {
    console.error('Access route error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
