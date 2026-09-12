import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // إجراء استعلام خفيف جداً للحفاظ على نشاط Supabase
    const { count, error } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Supabase pinged successfully! Project is active.',
      timestamp: new Date().toISOString(),
      employeeCount: count
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
