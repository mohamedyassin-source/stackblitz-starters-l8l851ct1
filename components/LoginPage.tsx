'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { codeToEmail, buildSessionUser, WEAK_PASSWORDS } from '@/lib/auth-utils';

export interface LoginPageProps {
  onLoginSuccess: (user: any) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tempUserData, setTempUserData] = useState<any>(null);

  // 1. تسجيل الدخول عبر Supabase Auth (التحقق من كلمة السر على سيرفر Supabase، مش في المتصفح)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = employeeCode.trim();

    if (!cleanCode || !password) {
      setErrorMsg('يرجى إدخال كود الموظف وكلمة السر.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: codeToEmail(cleanCode),
        password,
      });

      // رسالة موحّدة: مش بنكشف هل الكود موجود ولا لأ
      if (error || !data.user) {
        setErrorMsg('كود الموظف أو كلمة السر غير صحيحة.');
        return;
      }

      // الدور بييجي من app_metadata (مينفعش المستخدم يعدّله). مفيش دور = الحساب غير مفعّل.
      if (!data.user.app_metadata?.role) {
        await supabase.auth.signOut();
        setErrorMsg('هذا الحساب غير مفعّل. تواصل مع مدير النظام.');
        return;
      }

      const { data: profile } = await supabase
        .from('app_users')
        .select('*')
        .eq('auth_id', data.user.id)
        .maybeSingle();

      const user = buildSessionUser(data.user, profile);

      if (profile?.must_change_password) {
        setTempUserData(user);
        setRequirePasswordChange(true);
        return;
      }
      proceedToLogin(user);
    } catch (err) {
      console.error(err);
      setErrorMsg('تعذّر الاتصال بالخادم، حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  // 2. تغيير كلمة السر الإجباري (أول دخول بعد الترحيل أو بعد إعادة التعيين)
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (newPassword.length < 8) {
      setErrorMsg('كلمة السر الجديدة يجب أن تكون 8 أحرف/أرقام على الأقل.');
      return;
    }
    if (WEAK_PASSWORDS.includes(newPassword)) {
      setErrorMsg('كلمة السر هذه شائعة وضعيفة، اختر غيرها.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('كلمات المرور غير متطابقة.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.message || 'فشل تحديث كلمة السر');

      // تجديد الجلسة بكلمة السر الجديدة لضمان إنها سليمة
      await supabase.auth.signInWithPassword({
        email: codeToEmail(employeeCode.trim()),
        password: newPassword,
      });

      alert('تم تحديث كلمة المرور بنجاح ✅');
      proceedToLogin(tempUserData);
    } catch (err: any) {
      setErrorMsg('حدث خطأ أثناء تحديث كلمة المرور: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. الجلسة الحقيقية في كوكيز Supabase؛ localStorage للعرض فقط (الاسم والدور في الواجهة)
  const proceedToLogin = (userData: any) => {
    localStorage.setItem('session_user', JSON.stringify(userData));
    document.cookie = 'session_user=; path=/; max-age=0'; // تنظيف الكوكي القديمة
    onLoginSuccess(userData);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0f1c 0%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', direction: 'rtl', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: '420px', background: '#ffffff', borderRadius: '16px', padding: '36px 28px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'linear-gradient(135deg, #0d9488, #0f172a)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto 12px' }}>
            {requirePasswordChange ? '🛡️' : '🏢'}
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>
            {requirePasswordChange ? 'تحديث كلمة السر' : 'مجموعة شركات المراسم الدولية'}
          </h2>
          <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>
            {requirePasswordChange ? `أهلاً بك ${tempUserData?.employee_name || tempUserData?.username || ''}، لازم تغيّر كلمة السر قبل المتابعة` : 'بوابة تسجيل الدخول إلى نظام إدارة العقود'}
          </p>
        </div>

        {errorMsg && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', marginBottom: '20px', textAlign: 'center' }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {requirePasswordChange ? (
          <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#0f172a', marginBottom: '6px' }}>كلمة السر الجديدة:</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#0f172a', marginBottom: '6px' }}>تأكيد كلمة السر:</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              <button
                type="submit"
                disabled={loading}
                style={{ padding: '12px', borderRadius: '8px', border: 0, background: '#0d9488', color: '#ffffff', fontSize: '12px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'جاري التحديث...' : 'حفظ كلمة السر الجديدة والدخول 💾'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#0f172a', marginBottom: '6px' }}>كود الموظف:</label>
              <input
                type="text"
                required
                placeholder="مثال: 10001"
                value={employeeCode}
                onChange={e => setEmployeeCode(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#0f172a', marginBottom: '6px' }}>كلمة السر:</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ marginTop: '6px', padding: '12px', borderRadius: '8px', border: 0, background: '#0d9488', color: '#ffffff', fontSize: '12px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'جاري التحقق...' : 'دخول إلى النظام 🔑'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>نسيت كلمة السر؟ تواصل مع مدير النظام.</div>
          </form>
        )}
      </div>
    </div>
  );
}
