import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { downloadFile } from '@/lib/storage';
import { logActivity } from '@/lib/utils/activityLogger';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// GET /api/access/[token]/download/[document_id] - Download document via magic link
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string; document_id: string } }
) {
  try {
    const { token, document_id } = params;
    const supabase = getSupabaseClient();

    // Validate token and check document access
    const { data: requestData, error } = await supabase
      .from('document_requests')
      .select('document_ids, status, magic_link_expires_at, requester_email')
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

    if (!['approved', 'auto_approved'].includes(requestData.status)) {
      return NextResponse.json(
        { error: 'Access not approved' },
        { status: 403 }
      );
    }

    if (!requestData.document_ids.includes(document_id)) {
      return NextResponse.json(
        { error: 'Document not included in this request' },
        { status: 403 }
      );
    }

    // Get document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('file_url, file_name, file_type, requires_nda')
      .eq('id', document_id)
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Check if NDA is required - only enforce if NDA URL is configured in settings
    const { data: settings } = await supabase
      .from('trust_center_settings')
      .select('nda_url')
      .limit(1)
      .single();

    const ndaRequired = settings?.nda_url && settings.nda_url.trim() !== '';

    if (ndaRequired) {
      const { data: acceptance } = await supabase
        .from('nda_acceptances')
        .select('id')
        .eq('email', requestData.requester_email)
        .single();

      if (!acceptance) {
        return NextResponse.json(
          {
            error: 'NDA_REQUIRED',
            message: 'You must accept the Non-Disclosure Agreement before accessing this document.'
          },
          { status: 403 }
        );
      }
    }

    try {
      // Download file from Supabase Storage
      const fileBuffer = await downloadFile(document.file_url);

      // Log document download
      await logActivity({
        adminId: 'public',
        adminEmail: requestData.requester_email,
        actionType: 'document_download',
        entityType: 'document',
        entityId: document_id,
        entityName: document.file_name,
        description: `Document downloaded by ${requestData.requester_email}: ${document.file_name}`,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
        userAgent: request.headers.get('user-agent') || '',
      });

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
  } catch (error: any) {
    console.error('Access download error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

