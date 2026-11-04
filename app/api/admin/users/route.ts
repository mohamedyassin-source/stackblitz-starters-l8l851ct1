import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getAdminClient } from '@/lib/supabase-admin';
import { getCaller } from '@/lib/supabase-server';
import { codeToEmail, normalizeCode, ROLES, WEAK_PASSWORDS } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

const fail = (message: string, status = 400) =>
  NextResponse.json({ ok: false, message }, { status });

const tempPassword = () => randomBytes(9).toString('base64url');

export async function POST(req: Request) {
  // 1) لازم يكون أدمن (التحقق من التوكن على السيرفر)
  const caller = await getCaller();
  if (!caller) return fail('غير مسجّل الدخول', 401);
  if (caller.role !== 'Admin') return fail('هذه العملية للأدمن فقط', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail('طلب غير صالح');
  }

  const admin = getAdminClient();
  const action = body?.action;
  const code = normalizeCode(body?.employee_code);

  // 🌟 استخراج اسم الفاعل من الطلب (واللي تم ربطه من الشاشة)
  const performingUser = body?.performing_user || caller?.employee_name || 'مدير النظام';

  const findUser = async () => {
    if (!code) return null;
    const { data } = await admin.from('app_users').select('*').eq('employee_code', code).limit(1);
    return data?.[0] ?? null;
  };

  // 🌟 دالة مساعدة لتسجيل الحركات بصمة المستخدم الحقيقي في الـ audit_logs
  const logAudit = async (actionType: string, details: string) => {
    await admin.from('audit_logs').insert([{
      action_type: actionType,
      details: details,
      user_name: performingUser
    }]);
  };

  try {
    // ---------- إضافة مستخدم ----------
    if (action === 'create') {
      const username = String(body.username || '').trim();
      const role = body.role;
      if (!username) return fail('اسم المستخدم مطلوب');
      if (!code) return fail('كود الموظف مطلوب (بيُستخدم لتسجيل الدخول)');
      if (!ROLES.includes(role)) return fail('صلاحية غير صالحة');
      if (await findUser()) return fail('كود الموظف ده مسجّل بالفعل');

      const given = String(body.password || '').trim();
      const usable = given.length >= 8 && !WEAK_PASSWORDS.includes(given);
      const password = usable ? given : tempPassword();

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: codeToEmail(code),
        password,
        email_confirm: true,
        app_metadata: { role, employee_code: code },
      });
      if (cErr || !created.user) return fail(cErr?.message || 'تعذر إنشاء الحساب');

      const { error: iErr } = await admin.from('app_users').insert([
        { 
          username, 
          employee_code: code, 
          role, 
          auth_id: created.user.id, 
          must_change_password: true,
          password: password // 👈 التعديل هنا: تم إضافة الباسورد لتجنب خطأ الـ Not Null
        },
      ]);
      
      if (iErr) {
        await admin.auth.admin.deleteUser(created.user.id); // تراجع كامل
        return fail(iErr.message);
      }

      // 🌟 تسجيل حركة الإضافة في السجل
      await logAudit('إضافة مستخدم (app_users)', `إضافة مستخدم جديد [${username}] بالكود (${code}) ومنحه صلاحية ${role}`);

      return NextResponse.json({ ok: true, tempPassword: usable ? undefined : password });
    }

    // ---------- تغيير صلاحية ----------
    if (action === 'setRole') {
      const role = body.role;
      if (!ROLES.includes(role)) return fail('صلاحية غير صالحة');
      const user = await findUser();
      if (!user) return fail('المستخدم غير موجود', 404);
      if (user.auth_id === caller.id && role !== 'Admin') return fail('مينفعش تشيل صلاحية الأدمن من حسابك أنت');

      if (user.auth_id) {
        const { error } = await admin.auth.admin.updateUserById(user.auth_id, {
          app_metadata: { role, employee_code: code },
        });
        if (error) return fail(error.message);
      }
      const { error } = await admin.from('app_users').update({ role }).eq('employee_code', code);
      if (error) return fail(error.message);

      // 🌟 تسجيل حركة تغيير الصلاحية
      await logAudit('تعديل على app_users', `تعديل صلاحية الهدف [${user.username || code}] لتصبح ${role}`);

      return NextResponse.json({ ok: true });
    }

    // ---------- حذف ----------
    if (action === 'delete') {
      const user = await findUser();
      if (!user) return fail('المستخدم غير موجود', 404);
      if (user.auth_id === caller.id) return fail('مينفعش تحذف حسابك أنت');
      
      if (user.auth_id) await admin.auth.admin.deleteUser(user.auth_id);
      const { error } = await admin.from('app_users').delete().eq('employee_code', code);
      if (error) return fail(error.message);

      // 🌟 تسجيل حركة الحذف
      await logAudit('حذف على app_users', `تم حذف المستخدم [${user.username || code}] نهائياً من النظام`);

      return NextResponse.json({ ok: true });
    }

    // ---------- إعادة تعيين كلمة السر ----------
    if (action === 'resetPassword') {
      const user = await findUser();
      if (!user?.auth_id) return fail('المستخدم غير موجود أو غير مُرحَّل', 404);
      const password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(user.auth_id, { password });
      if (error) return fail(error.message);
      
      // تحديث كلمة السر في الجدول وحالة الإجبار
      await admin.from('app_users').update({ 
        must_change_password: true,
        password: password // 👈 يفضل نحدثها هنا كمان عشان لو حد عمل Reset
      }).eq('auth_id', user.auth_id);

      // 🌟 تسجيل حركة إعادة التعيين
      await logAudit('تعديل على app_users', `الهدف [${user.username || code}] | تم إعادة تعيين كلمة السر (وإجباره على التغيير عند الدخول)`);

      return NextResponse.json({ ok: true, tempPassword: password });
    }

    return fail('عملية غير معروفة');
  } catch (e: any) {
    return fail(e?.message || 'خطأ غير متوقع', 500);
  }
}
