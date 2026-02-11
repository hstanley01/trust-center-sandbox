import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// POST /api/access/[token]/accept-nda - Accept NDA via magic link token
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    const userAgent = request.headers.get('user-agent') || '';
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';

    const supabase = getSupabaseClient();

    // Validate token
    const { data: requestData, error } = await supabase
      .from('document_requests')
      .select('requester_email, organization_id, status, magic_link_expires_at')
      .eq('magic_link_token', token)
      .single();

    if (error || !requestData) {
      return NextResponse.json(
        { error: 'Invalid or expired link' },
        { status: 404 }
      );
    }

    if (requestData.magic_link_expires_at && new Date(requestData.magic_link_expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This link has expired' },
        { status: 403 }
      );
    }

    // Insert acceptance
    const { error: insertError } = await supabase
      .from('nda_acceptances')
      .insert({
        email: requestData.requester_email,
        organization_id: requestData.organization_id,
        ip_address: ip,
        user_agent: userAgent
      });

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({ message: 'NDA Accepted successfully' });

  } catch (error: any) {
    console.error('NDA acceptance error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to accept NDA' },
      { status: 500 }
    );
  }
}
