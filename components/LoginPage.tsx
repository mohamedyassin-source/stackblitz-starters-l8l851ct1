'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

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

  // 1. تسجيل الدخول المباشر من Supabase
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
      const codeNumber = parseInt(cleanCode, 10);

      // البحث عن المستخدم في جدول app_users أو users
      let { data: users, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('employee_code', isNaN(codeNumber) ? cleanCode : codeNumber);

      // تجربة البحث في جدول users لو لم يجد في app_users
      if ((!users || users.length === 0) && !error) {
        const res = await supabase
          .from('users')
          .select('*')
          .eq('employee_code', isNaN(codeNumber) ? cleanCode : codeNumber);
        users = res.data;
        error = res.error;
      }

      if (error) throw error;

      if (!users || users.length === 0) {
        setErrorMsg('كود الموظف غير موجود في حسابات النظام.');
        setLoading(false);
        return;
      }

      const user = users[0];

      // التحقق من كلمة السر
      if (String(user.password).trim() !== String(password).trim()) {
        setErrorMsg('كلمة السر غير صحيحة.');
        setLoading(false);
        return;
      }

      // الإجبار على تغيير كلمة السر لو كانت "123" أو "123456"
      if (password === '123' || password === '123456') {
        setTempUserData(user);
        setRequirePasswordChange(true);
      } else {
        proceedToLogin(user);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`خطأ في الاتصال بقاعدة البيانات: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 2. طلب تغيير كلمة السر المباشر
  const handleOpenPasswordChange = async () => {
    const cleanCode = employeeCode.trim();
    if (!cleanCode) {
      setErrorMsg('يرجى إدخال كود الموظف أولاً لتغيير كلمة السر.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const codeNumber = parseInt(cleanCode, 10);

      let { data: users, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('employee_code', isNaN(codeNumber) ? cleanCode : codeNumber);

      if (!users || users.length === 0) {
        const res = await supabase
          .from('users')
          .select('*')
          .eq('employee_code', isNaN(codeNumber) ? cleanCode : codeNumber);
        users = res.data;
        error = res.error;
      }

      if (error) throw error;

      if (users && users.length > 0) {
        setTempUserData(users[0]);
        setRequirePasswordChange(true);
      } else {
        setErrorMsg('كود الموظف غير موجود.');
      }
    } catch (err: any) {
      setErrorMsg(`خطأ: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 3. حفظ كلمة السر الجديدة في Supabase
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (newPassword.length < 6) {
      setErrorMsg('كلمة السر الجديدة يجب أن تكون 6 أحرف/أرقام على الأقل.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('كلمات المرور غير متطابقة.');
      return;
    }

    setLoading(true);

    try {
      const idKey = tempUserData.user_id ? 'user_id' : 'id';
      const table = tempUserData.user_id ? 'app_users' : 'users';

      const { error } = await supabase
        .from(table)
        .update({ password: newPassword })
        .eq(idKey, tempUserData[idKey]);

      if (error) throw error;

      alert('تم تحديث كلمة المرور بنجاح ✅');
      proceedToLogin({ ...tempUserData, password: newPassword });
    } catch (err: any) {
      setErrorMsg('حدث خطأ أثناء تحديث كلمة المرور: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSkipPasswordChange = () => {
    if (tempUserData) {
      proceedToLogin(tempUserData);
    } else {
      setRequirePasswordChange(false);
    }
  };

  const proceedToLogin = (data: any) => {
    const userData = {
      code: data.employee_code,
      name: data.employee_name || data.username || data.name,
      department: data.department || 'الموارد البشرية',
      role: data.role || 'Admin',
      company: data.company || 'المراسم الدولية',
    };

    localStorage.setItem('session_user', JSON.stringify(userData));
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
            {requirePasswordChange ? `أهلاً بك ${tempUserData?.employee_name || tempUserData?.username || ''}، يمكنك التغيير أو التخطي` : 'بوابة تسجيل الدخول إلى نظام إدارة العقود (Supabase Direct)'}
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
              
              <button
                type="button"
                onClick={handleSkipPasswordChange}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'transparent', color: '#64748b', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                التخطي والدخول بكلمة السر الحالية ↩️
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

            <div style={{ textAlign: 'center', marginTop: '6px' }}>
              <button
                type="button"
                onClick={handleOpenPasswordChange}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}
              >
                هل ترغب في تغيير كلمة السر الآن؟ 🔑
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
