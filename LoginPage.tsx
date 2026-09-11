'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface LoginPageProps {
  onLoginSuccess: (user: any) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 🌟 حالات تغيير كلمة المرور
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tempUserData, setTempUserData] = useState<any>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = employeeCode.trim();

    if (!cleanCode || !password) {
      setErrorMsg('يرجى إدخال كود الموظف وكلمة السر.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    // 1. جلب بيانات الحساب من جدول المستخدمين (app_users)
    const { data: userData, error: userError } = await supabase
      .from('app_users')
      .select('*')
      .ilike('employee_code', cleanCode)
      .maybeSingle();

    // 2. جلب بيانات الموظف الأساسية من جدول الموظفين (employees)
    const { data: empData, error: empError } = await supabase
      .from('employees')
      .select('*')
      .ilike('employee_code', cleanCode)
      .maybeSingle();

    setLoading(false);

    if (userError) {
      setErrorMsg(`خطأ في الاتصال بقاعدة البيانات: ${userError.message}`);
      return;
    }

    if (!userData && !empData) {
      setErrorMsg(`كود الموظف (${cleanCode}) غير موجود بالنظام.`);
      return;
    }

    const mergedData = { ...empData, ...userData };
    const storedPassword = userData?.password;

    const isDefaultPassword = password === '123456' || password === String(cleanCode);
    const hasCustomPassword = storedPassword && storedPassword !== '';

    if (hasCustomPassword && storedPassword !== password && !isDefaultPassword) {
      setErrorMsg('كلمة السر غير صحيحة.');
      return;
    }

    if (!hasCustomPassword || isDefaultPassword) {
      setTempUserData(mergedData);
      setRequirePasswordChange(true);
      return;
    }

    proceedToLogin(mergedData);
  };

  const handleOpenPasswordChange = async () => {
    const cleanCode = employeeCode.trim();
    if (!cleanCode) {
      setErrorMsg('يرجى إدخال كود الموظف أولاً لتغيير كلمة السر.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const { data: userData } = await supabase
      .from('app_users')
      .select('*')
      .ilike('employee_code', cleanCode)
      .maybeSingle();

    const { data: empData } = await supabase
      .from('employees')
      .select('*')
      .ilike('employee_code', cleanCode)
      .maybeSingle();

    setLoading(false);

    if (!userData && !empData) {
      setErrorMsg(`كود الموظف (${cleanCode}) غير موجود بالنظام.`);
      return;
    }

    setTempUserData({ ...empData, ...userData });
    setRequirePasswordChange(true);
  };

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

    const cleanCode = String(tempUserData.employee_code).trim();
    const userNameVal = tempUserData.employee_name || tempUserData.username || cleanCode;

    // استخدام upsert مع تحديد onConflict للتعامل السليم مع وجود الصف المسبق
    const { error: saveError } = await supabase
      .from('app_users')
      .upsert(
        {
          employee_code: cleanCode,
          username: userNameVal,
          password: newPassword,
        },
        { onConflict: 'employee_code' }
      );

    setLoading(false);

    if (saveError) {
      setErrorMsg('حدث خطأ أثناء تحديث كلمة المرور: ' + saveError.message);
      return;
    }

    alert('✅ تم حفظ كلمة السر بنجاح!');
    proceedToLogin({ ...tempUserData, password: newPassword });
  };

  const handleSkipPasswordChange = () => {
    if (tempUserData) {
      proceedToLogin(tempUserData);
    } else {
      setRequirePasswordChange(false);
    }
  };

  const proceedToLogin = (data: any) => {
    const dept = String(data.department || '').trim();
    const isHr = dept.includes('الموارد البشرية') || dept.includes('الموارد البشريه') || dept.includes('HR');

    let userRole = data.role;
    if (!userRole) {
      userRole = isHr ? 'admin' : 'Employee';
    }

    const userData = {
      code: data.employee_code,
      name: data.employee_name || data.username,
      department: data.department,
      role: userRole,
      company: data.company
    };

    localStorage.setItem('session_user', JSON.stringify(userData));
    onLoginSuccess(userData);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0f1c 0%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', direction: 'rtl', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: '420px', background: 'var(--paper-card)', borderRadius: '16px', padding: '36px 28px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255, 255, 255, 0.1)' }} className="animate-fade-in-up">
        
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'linear-gradient(135deg, var(--brass-400), var(--brass-600))', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '24px', margin: '0 auto 12px', boxShadow: '0 8px 16px rgba(13, 148, 136, 0.35)' }}>
            {requirePasswordChange ? '🛡️' : '🏢'}
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: '18px', color: 'var(--ink)', fontWeight: '900' }}>
            {requirePasswordChange ? 'تحديث كلمة السر' : 'مجموعة شركات المراسم الدولية'}
          </h2>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>
            {requirePasswordChange ? `أهلاً بك ${tempUserData?.employee_name || ''}، يمكنك التغيير أو التخطي` : 'بوابة تسجيل الدخول إلى نظام إدارة العقود'}
          </p>
        </div>

        {errorMsg && (
          <div style={{ background: 'var(--stamp-red-bg)', border: '1px solid var(--stamp-red-bg)', color: 'var(--stamp-red)', padding: '10px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', marginBottom: '20px', textAlign: 'center' }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {requirePasswordChange ? (
          <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: 'var(--ink)', marginBottom: '6px' }}>كلمة السر الجديدة:</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: 'var(--ink)', marginBottom: '6px' }}>تأكيد كلمة السر:</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              <button
                type="submit"
                disabled={loading}
                style={{ padding: '12px', borderRadius: '8px', border: 0, background: 'linear-gradient(135deg, var(--brass-400), var(--brass-600))', color: '#ffffff', fontSize: '12px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'جاري التحديث...' : 'حفظ كلمة السر الجديدة والدخول 💾'}
              </button>
              
              <button
                type="button"
                onClick={handleSkipPasswordChange}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                التخطي والدخول بكلمة السر الحالية ↩️
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: 'var(--ink)', marginBottom: '6px' }}>كود الموظف:</label>
              <input
                type="text"
                required
                placeholder="مثال: 3577"
                value={employeeCode}
                onChange={e => setEmployeeCode(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: 'var(--ink)', marginBottom: '6px' }}>كلمة السر:</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ marginTop: '6px', padding: '12px', borderRadius: '8px', border: 0, background: 'linear-gradient(135deg, var(--brass-400), var(--brass-600))', color: '#ffffff', fontSize: '12px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'جاري التحقق...' : 'دخول إلى النظام 🔑'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '6px' }}>
              <button
                type="button"
                onClick={handleOpenPasswordChange}
                style={{ background: 'none', border: 'none', color: 'var(--stamp-blue)', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}
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
