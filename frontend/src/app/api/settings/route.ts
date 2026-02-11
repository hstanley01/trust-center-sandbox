import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

// GET /api/settings - Get public trust center settings
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('trust_center_settings')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      // Return default settings if none exist
      return NextResponse.json({
        company_name: 'Trust Center',
        hero_title: 'Security & Compliance',
        hero_subtitle: 'Your trusted partner for security and compliance documentation',
        primary_color: '#007bff',
        secondary_color: '#6c757d',
      });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Settings fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}
