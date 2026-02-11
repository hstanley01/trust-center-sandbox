import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/utils/activityLogger';

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

// POST /api/documents - Create new document (admin only, with file upload)
export async function POST(request: NextRequest) {
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

    // Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const category_id = formData.get('category_id') as string;
    const access_level = formData.get('access_level') as string;
    const requires_nda = formData.get('requires_nda') === 'true';

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!title || !access_level) {
      return NextResponse.json(
        { error: 'Title and access_level are required' },
        { status: 400 }
      );
    }

    // Validate file size (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large: Maximum 50MB' },
        { status: 400 }
      );
    }

    // Upload file to Supabase Storage
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.name}`;
    const filePath = `documents/${fileName}`;

    const buffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('documents')
      .upload(filePath, uint8Array, {
        contentType: file.type,
        cacheControl: '3600',
      });

    if (uploadError) {
      throw new Error(`File upload failed: ${uploadError.message}`);
    }

    // Create document record in database
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        title,
        description: description || null,
        category_id: category_id || null,
        access_level,
        status: 'published',
        published_at: new Date().toISOString(),
        uploaded_by: adminUser.id,
        requires_nda,
        file_path: uploadData.path,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        is_current_version: true,
      })
      .select()
      .single();

    if (docError) {
      throw new Error(`Failed to create document record: ${docError.message}`);
    }

    // Log activity
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'create',
      entityType: 'document',
      entityId: document.id,
      entityName: title,
      description: `Uploaded document: ${title} (${access_level})`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error: any) {
    console.error('Document upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload document' },
      { status: 500 }
    );
  }
}
