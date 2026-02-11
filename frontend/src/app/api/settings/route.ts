import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/utils/activityLogger';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// POST /api/settings - Update trust center settings (admin only)
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
    const updateData = await request.json();

    // Update settings (upsert)
    const { data: settings, error: updateError } = await supabase
      .from('trust_center_settings')
      .upsert({
        id: 'default',
        ...updateData,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update settings: ${updateError.message}`);
    }

    // Log activity
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'update',
      entityType: 'settings',
      entityId: 'default',
      entityName: 'Trust Center Settings',
      description: 'Updated trust center settings',
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error('Settings update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
