import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/utils/activityLogger';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// POST /api/certifications - Create certification (admin only)
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

    // Parse request body
    const { name, logo_url, description, display_order, status } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Certification name is required' },
        { status: 400 }
      );
    }

    // Create certification
    const { data: certification, error: createError } = await supabase
      .from('certifications')
      .insert({
        name,
        logo_url: logo_url || null,
        description: description || null,
        display_order: display_order ?? 0,
        status: status || 'active',
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create certification: ${createError.message}`);
    }

    // Log activity
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'create',
      entityType: 'certification',
      entityId: certification.id,
      entityName: name,
      description: `Created certification: ${name}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json(certification, { status: 201 });
  } catch (error: any) {
    console.error('Certification creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create certification' },
      { status: 500 }
    );
  }
}

// PATCH /api/certifications - Update certification (admin only)
export async function PATCH(request: NextRequest) {
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

    // Parse request body
    const { id, name, logo_url, description, display_order, status } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Certification ID is required' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (logo_url !== undefined) updateData.logo_url = logo_url;
    if (description !== undefined) updateData.description = description;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (status !== undefined) updateData.status = status;

    // Update certification
    const { data: updated, error: updateError } = await supabase
      .from('certifications')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update certification: ${updateError.message}`);
    }

    // Log activity
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'update',
      entityType: 'certification',
      entityId: id,
      entityName: updated.name,
      description: `Updated certification: ${updated.name}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Certification update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update certification' },
      { status: 500 }
    );
  }
}

// DELETE /api/certifications - Delete certification (admin only)
export async function DELETE(request: NextRequest) {
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

    // Parse request body for ID
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Certification ID is required' },
        { status: 400 }
      );
    }

    // Get certification name for logging
    const { data: certification } = await supabase
      .from('certifications')
      .select('name')
      .eq('id', id)
      .single();

    // Delete certification
    const { error: deleteError } = await supabase
      .from('certifications')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw new Error(`Failed to delete certification: ${deleteError.message}`);
    }

    // Log activity
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'delete',
      entityType: 'certification',
      entityId: id,
      entityName: certification?.name || 'Unknown',
      description: `Deleted certification: ${certification?.name || id}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({ message: 'Certification deleted successfully' });
  } catch (error: any) {
    console.error('Certification delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete certification' },
      { status: 500 }
    );
  }
}
