import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  // فشل واضح ومبكر بدل الاتصال بمشروع خاطئ بصمت
  throw new Error(
    'إعدادات Supabase غير مكتملة: تأكد من ضبط NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY في ملف .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
