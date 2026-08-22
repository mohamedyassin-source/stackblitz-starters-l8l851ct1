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

  // 🌟 حالات تغيير كلمة المرور لأول مرة
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tempUserData, setTempUserData] = useState<any>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeCode || !password) {
      setErrorMsg('يرجى إدخال كود الموظف وكلمة السر.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('employee_code', employeeCode.trim())
        .single();

      setLoading(false);

      if (error || !data) {
        setErrorMsg('كود الموظف غير موجود بالنظام.');
        return;
      }

      // إذا كان للموظف باسورد مسجل سابقاً
      if (data.password && data.password !== password) {
        setErrorMsg('كلمة السر غير صحيحة.');
        return;
      }

      // 🚨 لو بيلوجن بالباسورد الافتراضي أول مرة
      if (password === '123456') {
        setTempUserData(data);
        setRequirePasswordChange(true);
        return;
      }

      proceedToLogin(data);
    } catch (err) {
      setLoading(false);
      setErrorMsg('حدث خطأ في الاتصال بقاعدة البيانات.');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (newPassword.length < 6) {
      setErrorMsg('كلمة السر الجديدة يجب أن تكون 6 أحرف على الأقل.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('كلمات المرور غير متطابقة.');
      return;
    }
    if (newPassword === '123456') {
      setErrorMsg('لا يمكنك استخدام كلمة السر الافتراضية مرة أخرى.');
      return;
    }

    setLoading(true);

    const { error } = await supabase
      .from('employees')
      .update({ password: newPassword })
      .eq('employee_code', tempUserData.employee_code);

    setLoading(false);

    if (error) {
      setErrorMsg('حدث خطأ أثناء تحديث كلمة المرور.');
      return;
    }

    alert('✅ تم تغيير كلمة السر بنجاح!');
    proceedToLogin(tempUserData);
  };

  const proceedToLogin = (data: any) => {
    const userData = {
      code: data.employee_code,
      name: data.employee_name,
      department: data.department,
      role: data.role || 'Employee',
      company: data.company,
    };

    localStorage.setItem('session_user', JSON.stringify(userData));
    onLoginSuccess(userData);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0f1c 0%, #1e293b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        direction: 'rtl',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: '#ffffff',
          borderRadius: '16px',
          padding: '36px 28px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          {/* 🌟 اللوجو صريح ومباشر من مجلد public */}
          <div
            style={{
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <img
              src="/logo.png"
              alt="لوجو الشركة"
              style={{
                maxWidth: '180px',
                maxHeight: '90px',
                width: 'auto',
                height: 'auto',
                display: 'block',
              }}
              onError={(e) => {
                // لو الصورة مش في مكانها مظبوط يظهر التنبيه ده
                e.currentTarget.style.display = 'none';
                const el = document.getElementById('logo-fallback');
                if (el) el.style.display = 'block';
              }}
            />
            <div
              id="logo-fallback"
              style={{
                display: 'none',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                padding: '8px',
                borderRadius: '6px',
                fontSize: '10px',
              }}
            >
              ⚠️ حط صورة logo.png جوه مجلد public
            </div>
          </div>

          <h2
            style={{
              margin: '0 0 6px',
              fontSize: '18px',
              color: '#0f172a',
              fontWeight: '900',
            }}
          >
            {requirePasswordChange
              ? 'تأمين الحساب'
              : 'مجموعة شركات المراسم الدولية'}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: '11px',
              color: '#64748b',
              fontWeight: 'bold',
            }}
          >
            {requirePasswordChange
              ? `أهلاً بك ${tempUserData?.employee_name}، يرجى تعيين كلمة سر جديدة`
              : 'بوابة تسجيل الدخول إلى نظام إدارة العقود'}
          </p>
        </div>

        {errorMsg && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 'bold',
              marginBottom: '20px',
              textAlign: 'center',
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}

        {requirePasswordChange ? (
          <form
            onSubmit={handlePasswordChange}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: '#334155',
                  marginBottom: '6px',
                }}
              >
                كلمة السر الجديدة:
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: '#334155',
                  marginBottom: '6px',
                }}
              >
                تأكيد كلمة السر:
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: '10px',
                padding: '12px',
                borderRadius: '8px',
                border: 0,
                background: '#15803d',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'جاري التحديث...' : 'حفظ والدخول للنظام 💾'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleLogin}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: '#334155',
                  marginBottom: '6px',
                }}
              >
                كود الموظف:
              </label>
              <input
                type="text"
                placeholder="مثال: 10025"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: '#334155',
                  marginBottom: '6px',
                }}
              >
                كلمة السر:
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: '10px',
                padding: '12px',
                borderRadius: '8px',
                border: 0,
                background: '#0f172a',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'جاري التحقق...' : 'دخول إلى النظام 🔑'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
