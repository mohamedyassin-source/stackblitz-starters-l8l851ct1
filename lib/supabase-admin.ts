import { createClient } from '@supabase/supabase-js';

/**
 * عميل بصلاحيات كاملة (service role) — يتجاوز RLS.
 * للاستخدام داخل app/api/** فقط. ممنوع استيراده من أي مكوّن 'use client'
 * وممنوع تسمية المتغير NEXT_PUBLIC_*.
 */
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY غير مضبوط على السيرفر');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
