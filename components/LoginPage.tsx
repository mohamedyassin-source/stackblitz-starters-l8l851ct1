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

    // 1. جلب بيانات المستخدم من جدول المستخدمين (app_users)
    const { data: userData, error: userError } = await supabase
      .from('app_users') // ⬅️ تعديل اسم الجدول لو كان مختلف عندك
      .select('*')
      .ilike('employee_code', cleanCode)
      .maybeSingle();

    // 2. جلب بيانات الموظف الأساسية من جدول الموظفين (employees)
    const { data: empData } = await supabase
      .from('employees')
      .select('*')
      .ilike('employee_code', cleanCode)
      .maybeSingle();

    setLoading(false);

    if (userError) {
      setErrorMsg(`خطأ في الاتصال: ${userError.message}`);
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

    // ⬅️ التحديث المباشر في جدول المستخدمين (app_users) وليس الموظفين
    const { error } = await supabase
      .from('app_users')
      .upsert({ 
        employee_code: tempUserData.employee_code, 
        password: newPassword 
      }, { onConflict: 'employee_code' });

    setLoading(false);

    if (error) {
      setErrorMsg('حدث خطأ أثناء تحديث كلمة المرور: ' + error.message);
      return;
    }

    alert('✅ تم حفظ كلمة السر بنجاح في جدول المستخدمين!');
    proceedToLogin({ ...tempUserData, password: newPassword });
  };

  const proceedToLogin = (data: any) => {
    const dept = String(data.department || '').trim();
    const isHr = dept.includes('الموارد البشرية') || dept.includes('الموارد البشريه') || dept.includes('HR');

    const userData = {
      code: data.employee_code,
      name: data.employee_name,
      department: data.department,
      role: data.role || (isHr ? 'admin' : 'Employee'),
      company: data.company
    };

    localStorage.setItem('session_user', JSON.stringify(userData));
    onLoginSuccess(userData);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0f1c 0%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', direction: 'rtl' }}>
      <div style={{ width: '100%', maxWidth: '420px', background: 'var(--paper-card)', borderRadius: '16px', padding: '36px 28px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: '18px', color: 'var(--ink)', fontWeight: '900' }}>
            {requirePasswordChange ? 'تحديث كلمة السر' : 'مجموعة شركات المراسم الدولية'}
          </h2>
        </div>

        {errorMsg && (
          <div style={{ background: 'var(--stamp-red-bg)', color: 'var(--stamp-red)', padding: '10px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', marginBottom: '20px', textAlign: 'center' }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {requirePasswordChange ? (
          <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>كلمة السر الجديدة:</label>
              <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>تأكيد كلمة السر:</label>
              <input type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)' }} />
            </div>
            <button type="submit" disabled={loading} style={{ padding: '12px', borderRadius: '8px', border: 0, background: 'var(--brass-500)', color: '#fff', fontWeight: 'bold' }}>
              {loading ? 'جاري الحفظ...' : 'حفظ كلمة السر والدخول 💾'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>كود الموظف:</label>
              <input type="text" required placeholder="3577" value={employeeCode} onChange={e => setEmployeeCode(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', fontWeight: 'bold' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>كلمة السر:</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)' }} />
            </div>
            <button type="submit" disabled={loading} style={{ padding: '12px', borderRadius: '8px', border: 0, background: 'var(--brass-500)', color: '#fff', fontWeight: 'bold' }}>
              {loading ? 'جاري التحقق...' : 'دخول إلى النظام 🔑'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
