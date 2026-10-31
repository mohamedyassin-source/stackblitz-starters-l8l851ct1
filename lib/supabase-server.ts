import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** عميل السيرفر: بيقرأ جلسة المستخدم من الكوكيز (للتحقق من هوية اللي بينادي الـ API). */
export function getServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(list: { name: string; value: string; options: CookieOptions }[]) {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            /* بيحصل في Server Components — الـ middleware بيجدد الجلسة */
          }
        },
      },
    }
  );
}

export type Caller = { id: string; role: string | null; code: string | null };

/** getUser() بيتحقق من التوكن مع Supabase (مش بس بيفك الكوكي) — ده اللي يُعتمد عليه. */
export async function getCaller(): Promise<Caller | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const meta = (data.user.app_metadata || {}) as Record<string, any>;
  return { id: data.user.id, role: meta.role ?? null, code: meta.employee_code ?? null };
}
