import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/utils/activityLogger';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// POST /api/auth/login - Admin login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Create a fresh client for auth (to avoid session state issues)
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Log failed login attempt
      await logActivity({
        adminId: 'system',
        adminEmail: email,
        actionType: 'login_failed',
        entityType: 'auth',
        description: `Failed login attempt for email: ${email}`,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
        userAgent: request.headers.get('user-agent') || '',
      });
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    // Use service role client (which bypasses RLS) to check admin status
    const serviceClient = getSupabaseClient();

    const { data: adminUser } = await serviceClient
      .from('admin_users')
      .select('id, email, full_name, role')
      .eq('id', data.user.id)
      .single();

    if (!adminUser) {
      // Log failed admin access attempt (user exists but not admin)
      await logActivity({
        adminId: data.user.id,
        adminEmail: email,
        actionType: 'login_failed',
        entityType: 'auth',
        description: `Login attempt denied - not an admin user: ${email}`,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
        userAgent: request.headers.get('user-agent') || '',
      });
      return NextResponse.json(
        { error: 'Access denied: Admin account required' },
        { status: 403 }
      );
    }

    // Log successful admin login
    await logActivity({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      actionType: 'login',
      entityType: 'auth',
      description: `Admin logged in: ${adminUser.email}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({
      user: adminUser,
      session: data.session,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
