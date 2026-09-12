import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  // فشل واضح ومبكر بدل الاتصال بمشروع خاطئ بصمت
  throw new Error(
    'إعدادات Supabase غير مكتملة: تأكد من ضبط NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY في ملف .env.local'
  );
}

// 🌟 استخدام نمط Singleton لمنع تكرار إنشاء الـ Instance في المتصفح عند التنقل بين الصفحات
declare global {
  var supabaseInstance: SupabaseClient | undefined;
}

export const supabase =
  globalThis.supabaseInstance ||
  createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.supabaseInstance = supabase;
}
