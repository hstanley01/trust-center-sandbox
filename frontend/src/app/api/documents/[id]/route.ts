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

// PATCH /api/documents/[id] - Update document metadata (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseClient();
    
    // Verify user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('id, email')
      .eq('id', user.id)
      .single();

    if (!adminUser) {
      return NextResponse.json(
        { error: 'Access denied: Admin account required' },
        { status: 403 }
      );
    }

    // Get existing document
    const { data: oldDoc, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError || !oldDoc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Parse request body
    const updateData = await request.json();

    // Only allow updating certain fields
    const allowedFields = ['title', 'description', 'category_id', 'access_level', 'status', 'requires_nda'];
    const sanitizedUpdate: Record<string, any> = {};
    
    for (const field of allowedFields) {
      if (field in updateData) {
        sanitizedUpdate[field] = updateData[field];
      }
    }

    sanitizedUpdate.updated_at = new Date().toISOString();

    // Update document
    const { data: updatedDoc, error: updateError } = await supabase
      .from('documents')
      .update(sanitizedUpdate)
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update document: ${updateError.message}`);
    }

    // Log activity
    const { logActivity } = await import('@/lib/utils/activityLogger');
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'update',
      entityType: 'document',
      entityId: params.id,
      entityName: updatedDoc.title,
      description: `Updated document: ${updatedDoc.title}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json(updatedDoc);
  } catch (error: any) {
    console.error('Document update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update document' },
      { status: 500 }
    );
  }
}

// DELETE /api/documents/[id] - Archive document (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseClient();
    
    // Verify user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('id, email')
      .eq('id', user.id)
      .single();

    if (!adminUser) {
      return NextResponse.json(
        { error: 'Access denied: Admin account required' },
        { status: 403 }
      );
    }

    // Get document to log its name
    const { data: document } = await supabase
      .from('documents')
      .select('title, file_path')
      .eq('id', params.id)
      .single();

    // Archive document (soft delete)
    const { error: deleteError } = await supabase
      .from('documents')
      .update({
        status: 'archived',
        archived_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    if (deleteError) {
      throw new Error(`Failed to archive document: ${deleteError.message}`);
    }

    // Log activity
    const { logActivity } = await import('@/lib/utils/activityLogger');
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'delete',
      entityType: 'document',
      entityId: params.id,
      entityName: document?.title || 'Unknown',
      description: `Archived document: ${document?.title || params.id}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({ message: 'Document archived successfully' });
  } catch (error: any) {
    console.error('Document delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete document' },
      { status: 500 }
    );
  }
}
