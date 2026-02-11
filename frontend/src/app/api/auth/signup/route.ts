import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// POST /api/auth/signup - Admin signup (for initial setup)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, full_name } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Create user through Supabase Auth using admin API
    const adminSupabase = getSupabaseClient();

    const { data, error } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || 'Admin User' },
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Add to admin_users table
    const { error: adminError } = await adminSupabase
      .from('admin_users')
      .insert({
        id: data.user.id,
        email: data.user.email!,
        full_name: full_name || 'Admin User',
        role: 'admin',
      });

    if (adminError) {
      // If admin_users insert fails, try update (in case user already exists)
      await adminSupabase
        .from('admin_users')
        .upsert({
          id: data.user.id,
          email: data.user.email!,
          full_name: full_name || 'Admin User',
          role: 'admin',
        });
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      message: 'Admin user created successfully',
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
