import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'إعدادات Supabase غير مكتملة: تأكد من ضبط NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY'
  );
}

// عميل المتصفح: بيحفظ الجلسة في كوكيز عشان السيرفر (middleware و API routes) يقدر يتحقق منها.
// createBrowserClient بيرجّع نفس النسخة (singleton) داخل المتصفح.
export const supabase = createBrowserClient(supabaseUrl, supabaseKey);
