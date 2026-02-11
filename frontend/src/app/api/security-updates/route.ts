import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/utils/activityLogger';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// POST /api/security-updates - Create security update (admin only)
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
    const { title, description, severity, affected_systems, resolution, published_at } = await request.json();

    if (!title) {
      return NextResponse.json(
        { error: 'Security update title is required' },
        { status: 400 }
      );
    }

    // Create update
    const { data: update, error: createError } = await supabase
      .from('security_updates')
      .insert({
        title,
        description: description || null,
        severity: severity || 'medium',
        affected_systems: affected_systems || null,
        resolution: resolution || null,
        published_at: published_at ? new Date(published_at).toISOString() : null,
        created_by: adminUser.id,
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create security update: ${createError.message}`);
    }

    // Log activity
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'create',
      entityType: 'security_update',
      entityId: update.id,
      entityName: title,
      description: `Created security update: ${title}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json(update, { status: 201 });
  } catch (error: any) {
    console.error('Security update creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create security update' },
      { status: 500 }
    );
  }
}

// PATCH /api/security-updates - Update security update (admin only)
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
    const { id, title, description, severity, affected_systems, resolution, published_at } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Security update ID is required' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: Record<string, any> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (severity !== undefined) updateData.severity = severity;
    if (affected_systems !== undefined) updateData.affected_systems = affected_systems;
    if (resolution !== undefined) updateData.resolution = resolution;
    if (published_at !== undefined) updateData.published_at = published_at ? new Date(published_at).toISOString() : null;

    // Update update
    const { data: updated, error: updateError } = await supabase
      .from('security_updates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update security update: ${updateError.message}`);
    }

    // Log activity
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'update',
      entityType: 'security_update',
      entityId: id,
      entityName: updated.title,
      description: `Updated security update: ${updated.title}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Security update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update security update' },
      { status: 500 }
    );
  }
}

// DELETE /api/security-updates - Delete security update (admin only)
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
        { error: 'Security update ID is required' },
        { status: 400 }
      );
    }

    // Get update title for logging
    const { data: update } = await supabase
      .from('security_updates')
      .select('title')
      .eq('id', id)
      .single();

    // Delete update
    const { error: deleteError } = await supabase
      .from('security_updates')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw new Error(`Failed to delete security update: ${deleteError.message}`);
    }

    // Log activity
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'delete',
      entityType: 'security_update',
      entityId: id,
      entityName: update?.title || 'Unknown',
      description: `Deleted security update: ${update?.title || id}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({ message: 'Security update deleted successfully' });
  } catch (error: any) {
    console.error('Security update delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete security update' },
      { status: 500 }
    );
  }
}
