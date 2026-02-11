import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispatchWebhook } from '@/lib/services/webhookDispatcher';
import { extractEmailDomain, isPersonalEmailDomain, getOrCreateOrganization, checkOrganizationAccess, canAutoApproveDocument } from '@/lib/utils/organization';
import { generateMagicLinkToken, getMagicLinkExpiration } from '@/lib/utils/magicLink';
import { sendMagicLinkEmail } from '@/lib/utils/email';
import { logActivity } from '@/lib/utils/activityLogger';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// POST /api/document-requests - Submit document request (public, no auth)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, company, document_ids, reason } = body;

    if (!name || !email || !company || !document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return NextResponse.json(
        { error: 'Name, email, company, and at least one document are required' },
        { status: 400 }
      );
    }

    // Extract email domain
    const emailDomain = extractEmailDomain(email);
    if (!emailDomain) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Get or create organization
    let organizationId: string | null = null;
    if (!isPersonalEmailDomain(emailDomain)) {
      const org = await getOrCreateOrganization(emailDomain, company);
      organizationId = org.id;
    }

    // Check organization access status
    let approvedDocs: string[] = [];
    let pendingDocs: string[] = [];

    if (organizationId) {
      const accessCheck = await checkOrganizationAccess(organizationId);

      // Block if organization has no access
      if (!accessCheck.hasAccess) {
        return NextResponse.json(
          {
            error: 'Access denied. Your organization does not have permission to request documents.',
            status: accessCheck.status
          },
          { status: 403 }
        );
      }

      // Whitelisted organizations: auto-approve ALL documents (including future ones)
      if (accessCheck.autoApproveAll) {
        approvedDocs = document_ids;
        pendingDocs = [];
      } else {
        // Conditional organizations: only approve documents in approved_document_ids
        for (const docId of document_ids) {
          const canApprove = await canAutoApproveDocument(organizationId, docId);
          if (canApprove) {
            approvedDocs.push(docId);
          } else {
            pendingDocs.push(docId);
          }
        }
      }
    } else {
      // Personal email domains: all documents pending
      pendingDocs = document_ids;
    }

    // Handle auto-approved documents
    if (approvedDocs.length > 0) {
      const token = generateMagicLinkToken();
      const expiration = getMagicLinkExpiration();

      const { data: approvedRequest, error: approvedError } = await supabase
        .from('document_requests')
        .insert({
          requester_name: name,
          requester_email: email,
          requester_company: company,
          organization_id: organizationId,
          document_ids: approvedDocs,
          request_reason: reason,
          status: 'auto_approved',
          magic_link_token: token,
          magic_link_expires_at: expiration.toISOString(),
          auto_approved: true,
        })
        .select()
        .single();

      if (!approvedError && approvedRequest) {
        // Dispatch webhook for auto-approved request
        dispatchWebhook('request.created', approvedRequest);

        // Log auto-approval
        const docTitles = (await supabase
          .from('documents')
          .select('title')
          .in('id', approvedDocs)
        ).data?.map(d => d.title).join(', ') || 'documents';

        await logActivity({
          adminId: 'system',
          adminEmail: 'system@auto-approve',
          actionType: 'request_auto_approved',
          entityType: 'request',
          entityId: approvedRequest.id,
          entityName: `Request from ${name}`,
          description: `Auto-approved document request for ${email}: ${docTitles}`,
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
          userAgent: request.headers.get('user-agent') || '',
        });

        // Get full document details for email
        const { data: documents } = await supabase
          .from('documents')
          .select('id, title, file_name, file_type')
          .in('id', approvedDocs);

        // Prepare document data for email (Note: buffers will be loaded separately when needed)
        const documentsForEmail = (documents || []).map(doc => ({
          id: doc.id,
          title: doc.title,
          fileName: doc.file_name || undefined,
          fileType: doc.file_type || undefined,
        }));

        // Send magic link email
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}` 
          : 'http://localhost:3000';
        const magicLinkUrl = `${baseUrl}/access/${token}`;
        
        try {
          await sendMagicLinkEmail({
            requesterName: name,
            requesterEmail: email,
            documents: documentsForEmail,
            magicLinkToken: token,
            magicLinkUrl,
            expirationDate: expiration.toLocaleDateString(),
          });
          console.log(`Auto-approval email sent to ${email}`);
        } catch (emailErr: any) {
          console.error(`Failed to send auto-approval email to ${email}:`, emailErr);
          // Continue - don't fail the request if email fails
        }
      }
    }

    // Handle pending documents
    if (pendingDocs.length > 0) {
      const { data: pendingRequest, error: pendingError } = await supabase
        .from('document_requests')
        .insert({
          requester_name: name,
          requester_email: email,
          requester_company: company,
          organization_id: organizationId,
          document_ids: pendingDocs,
          request_reason: reason,
          status: 'pending',
        })
        .select()
        .single();

      if (pendingError) throw pendingError;

      // Dispatch webhook for pending request
      dispatchWebhook('request.created', pendingRequest);
    }

    return NextResponse.json({
      success: true,
      auto_approved: approvedDocs.length > 0,
      message: approvedDocs.length > 0
        ? `Access granted for ${approvedDocs.length} document(s). Check your email for the access link.`
        : 'Your request has been submitted and is under review.',
    });
  } catch (error: any) {
    console.error('Document request error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
