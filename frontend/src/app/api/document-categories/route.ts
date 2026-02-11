import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/utils/activityLogger';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// POST /api/document-categories - Create new category (admin only)
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
    const { name, description, display_order, is_hidden } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    // Create category
    const { data: category, error: createError } = await supabase
      .from('document_categories')
      .insert({
        name,
        description: description || null,
        display_order: display_order ?? 0,
        is_hidden: is_hidden ?? false,
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create category: ${createError.message}`);
    }

    // Log activity
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'create',
      entityType: 'category',
      entityId: category.id,
      entityName: name,
      description: `Created category: ${name}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error: any) {
    console.error('Category creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create category' },
      { status: 500 }
    );
  }
}

// PATCH /api/document-categories/[id] - Update category (admin only)
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
    const { id, name, description, display_order, is_hidden } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_hidden !== undefined) updateData.is_hidden = is_hidden;

    // Update category
    const { data: updated, error: updateError } = await supabase
      .from('document_categories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update category: ${updateError.message}`);
    }

    // Log activity
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'update',
      entityType: 'category',
      entityId: id,
      entityName: updated.name,
      description: `Updated category: ${updated.name}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Category update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update category' },
      { status: 500 }
    );
  }
}

// DELETE /api/document-categories/[id] - Delete category (admin only)
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
        { error: 'Category ID is required' },
        { status: 400 }
      );
    }

    // Get category name for logging
    const { data: category } = await supabase
      .from('document_categories')
      .select('name')
      .eq('id', id)
      .single();

    // Delete category
    const { error: deleteError } = await supabase
      .from('document_categories')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw new Error(`Failed to delete category: ${deleteError.message}`);
    }

    // Log activity
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'delete',
      entityType: 'category',
      entityId: id,
      entityName: category?.name || 'Unknown',
      description: `Deleted category: ${category?.name || id}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({ message: 'Category deleted successfully' });
  } catch (error: any) {
    console.error('Category delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete category' },
      { status: 500 }
    );
  }
}
