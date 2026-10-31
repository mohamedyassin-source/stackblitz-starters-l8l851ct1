import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { getCaller } from '@/lib/supabase-server';
import { WEAK_PASSWORDS } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ ok: false, message: 'غير مسجّل الدخول' }, { status: 401 });

  const { newPassword } = await req.json().catch(() => ({ newPassword: '' }));
  const pw = String(newPassword || '');
  if (pw.length < 8 || WEAK_PASSWORDS.includes(pw)) {
    return NextResponse.json({ ok: false, message: 'كلمة السر ضعيفة: 8 أحرف على الأقل وغير شائعة.' }, { status: 400 });
  }

  const admin = getAdminClient();
  const { error } = await admin.auth.admin.updateUserById(caller.id, { password: pw });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  await admin.from('app_users').update({ must_change_password: false }).eq('auth_id', caller.id);
  return NextResponse.json({ ok: true });
}
