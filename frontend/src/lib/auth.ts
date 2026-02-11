import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export interface AdminUser {
  id: string;
  email: string;
}

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Verify admin authentication from request
 * Returns admin user if authenticated, null if not
 */
export async function verifyAdmin(request: NextRequest): Promise<AdminUser | null> {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseClient();
    
    // Verify token with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError?.message);
      return null;
    }
    
    console.log('Authenticated user:', user.id, user.email);

    // Verify user exists in admin_users table
    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('id, email')
      .eq('id', user.id)
      .single();

    if (adminError || !adminUser) {
      return null;
    }

    return {
      id: adminUser.id,
      email: adminUser.email,
    };
  } catch (error: any) {
    console.error('Auth verification error:', error);
    return null;
  }
}

/**
 * Require admin authentication - returns error response if not authenticated
 * Use this in API routes that require admin access
 */
export async function requireAdmin(request: NextRequest): Promise<{ admin: AdminUser } | { error: Response }> {
  const admin = await verifyAdmin(request);
  
  if (!admin) {
    return {
      error: new Response(
        JSON.stringify({ error: 'Unauthorized: Admin access required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    };
  }
  
  return { admin };
}
