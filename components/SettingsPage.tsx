'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface SettingsProps {
  currentUser?: any;
}

export default function SettingsPage({ currentUser }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'notifications' | 'business' | 'security' | 'system'>('security');
  const [saved, setSaved] = useState(false);

  // إعدادات التنبيهات
  const [recipientEmail, setRecipientEmail] = useState('hr-director@almarasem.com');
  const [criticalDays, setCriticalDays] = useState(30);
  const [warningDays, setWarningDays] = useState(60);
  const [enableDailyEmail, setEnableDailyEmail] = useState(true);

  // إعدادات القواعد
  const [defaultRenewalMonths, setDefaultRenewalMonths] = useState(12);
  const [autoApproveSameDept, setAutoApproveSameDept] = useState(false);
  const [requireEmpSignature, setRequireEmpSignature] = useState(true);

  // إعدادات الشركة
  const [companyName, setCompanyName] = useState('مجموعة شركات المراسم الدولية والشركات الشقيقة');
  const [fiscalYearStart, setFiscalYearStart] = useState('01-01');

  // إدارة الصلاحيات والموظفين
  const [employees, setEmployees] = useState<any[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [search, setSearch] = useState('');

  const isAdmin = currentUser?.role === 'Admin';

  // ⚠️ الهووكس لازم تتنفذ دايماً بنفس الترتيب — الحماية بقت جوه الشرط مش قبل الهووكس
  useEffect(() => {
    if (!isAdmin) return;
    const savedEmail = localStorage.getItem('cfg_recipientEmail');
    if (savedEmail) setRecipientEmail(savedEmail);
    const savedMonths = localStorage.getItem('cfg_defaultRenewalMonths');
    if (savedMonths) setDefaultRenewalMonths(Number(savedMonths));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab === 'security') fetchAllEmployees();
  }, [isAdmin, activeTab]);

  // 🚨 حماية الصفحة
  if (!isAdmin) {
    return (
      <div className="card text-center py-12 px-6" style={{ borderColor: 'var(--stamp-red)', background: 'var(--stamp-red-bg)' }}>
        <h2 className="m-0 mb-2 text-lg font-extrabold" style={{ color: 'var(--stamp-red)' }}>🚨 محاولة وصول غير مصرح بها!</h2>
        <p className="font-bold" style={{ color: 'var(--stamp-red)' }}>تم تسجيل هذه المحاولة. ليس لديك صلاحيات مدير النظام للدخول لهذه الصفحة.</p>
      </div>
    );
  }

  const fetchAllEmployees = async () => {
    setLoadingRoles(true);
    let allEmps: any[] = [];
    let from = 0;
    const step = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('employees')
        .select('employee_code, employee_name, role') // شيلنا الـ id عشان نتجنب الخطأ
        .order('employee_code', { ascending: true })  // الترتيب بكود الموظف المضمون
        .range(from, from + step - 1);

      // 🚨 جهاز الإنذار: لو في مشكلة هتظهر قدامك على الشاشة فوراً
      if (error) {
        alert("حدث خطأ في قاعدة البيانات: " + error.message);
        console.error("Supabase Error:", error);
        break;
      }

      if (!data || data.length === 0) break;
      
      allEmps = [...allEmps, ...data];
      
      if (data.length < step) break;
      from += step;
    }

    setEmployees(allEmps);
    setLoadingRoles(false);
  };

  const handleSaveSettings = () => {
    localStorage.setItem('cfg_recipientEmail', recipientEmail);
    localStorage.setItem('cfg_defaultRenewalMonths', String(defaultRenewalMonths));
    localStorage.setItem('cfg_criticalDays', String(criticalDays));
    localStorage.setItem('cfg_warningDays', String(warningDays));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleRoleChange = async (empCode: string, newRole: string) => {
    const { error } = await supabase.from('employees').update({ role: newRole }).eq('employee_code', empCode);
    if (error) {
      alert('حدث خطأ أثناء تعديل الصلاحية');
    } else {
      alert(`✅ تم تغيير الصلاحية إلى ${newRole} بنجاح.`);
      fetchAllEmployees();
    }
  };

  // 🌟 الفلتر الذكي الشامل لكل الداتا المسحوبة
  const filteredEmployees = employees.filter(emp => {
    if (!search) return true;
    const searchTerm = search.toLowerCase().trim();
    const name = String(emp?.employee_name || '').toLowerCase();
    const code = String(emp?.employee_code || '').toLowerCase();
    return name.includes(searchTerm) || code.includes(searchTerm);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--navy-950)' }}>إعدادات وتفضيلات النظام 👑</h3>
          <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--muted)' }}>التحكم في ثوابت التنبيهات، قواعد العمل، وصلاحيات الوصول</p>
        </div>
        <button onClick={handleSaveSettings} style={{ background: 'var(--brass-600)', color: '#fff', border: 0, padding: '8px 20px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
          💾 حفظ الإعدادات العامة
        </button>
      </div>

      {saved && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', padding: '10px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', marginBottom: '16px' }}>
          ✅ تم حفظ إعدادات النظام بنجاح!
        </div>
      )}

      {/* التبويبات */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--line)', paddingBottom: '8px' }}>
        {[
          { id: 'security', title: '🛡️ الأمان والصلاحيات' },
          { id: 'notifications', title: '🔔 التنبيهات والإيميل' },
          { id: 'business', title: '⚙️ قواعد العمل' },
          { id: 'system', title: '🏢 بيانات المنشأة' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '8px 16px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', border: 0,
              background: activeTab === tab.id ? 'var(--navy-950)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--muted)', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            {tab.title}
          </button>
        ))}
      </div>

      {/* 🌟 1. الأمان والصلاحيات */}
      {activeTab === 'security' && (
        <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--navy-950)' }}>إدارة مستخدمين النظام والصلاحيات</h4>
              <span style={{ fontSize: '10px', color: 'var(--muted)' }}>إجمالي الموظفين المسجلين بالقاعدة: <strong>{employees.length}</strong> موظف</span>
            </div>
            <input 
              type="text" 
              placeholder="ابحث باسم الموظف أو الكود..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', width: '250px' }} 
            />
          </div>

          <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
            <table className="data-table" style={{ width: '100%', textAlign: 'right', fontSize: '11px', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>كود الموظف</th>
                  <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>اسم المستخدم</th>
                  <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>الصلاحية الحالية (Role)</th>
                  <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', width: '200px' }}>تغيير الصلاحية</th>
                </tr>
              </thead>
              <tbody>
                {loadingRoles ? (
                  <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', fontWeight: 'bold' }}>جاري سحب كافة الموظفين من قاعدة البيانات... ⏳</td></tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', fontWeight: 'bold', color: 'var(--muted)' }}>لا يوجد موظف بهذا الاسم أو الكود 🚫</td></tr>
                ) : (
                  filteredEmployees.map(emp => (
                    <tr key={emp.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace' }}>{emp.employee_code}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>{emp.employee_name}</td>
                      <td style={{ padding: '10px' }}>
                        {emp.role === 'Admin' && <span style={{ background: '#fef2f2', color: '#dc2626', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>مدير نظام (Admin) 👑</span>}
                        {emp.role === 'HR' && <span style={{ background: '#eff6ff', color: '#2563eb', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>إدارة HR 💼</span>}
                        {(!emp.role || emp.role === 'Employee') && <span style={{ background: '#f1f5f9', color: '#64748b', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>موظف (Employee) 👤</span>}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <select 
                          value={emp.role || 'Employee'}
                          onChange={(e) => {
                            if (window.confirm(`هل أنت متأكد من تغيير صلاحية ${emp.employee_name} إلى ${e.target.value}؟`)) {
                              handleRoleChange(emp.employee_code, e.target.value);
                            }
                          }}
                          disabled={emp.employee_code === currentUser?.code}
                          style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--line)', outline: 'none', cursor: emp.employee_code === currentUser?.code ? 'not-allowed' : 'pointer', background: emp.employee_code === currentUser?.code ? '#f1f5f9' : '#fff', fontWeight: 'bold' }}
                        >
                          <option value="Admin">مدير نظام (Admin)</option>
                          <option value="HR">إدارة HR</option>
                          <option value="Employee">موظف فقط (Employee)</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 🌟 2. التنبيهات والإيميل */}
      {activeTab === 'notifications' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '10px' }}>
            <h4 style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--navy-950)' }}>📧 مستلم التقارير اليومية</h4>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '10.5px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>البريد الإلكتروني الرئيسي:</label>
              <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', fontFamily: 'monospace', outline: 'none' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
              <input type="checkbox" checked={enableDailyEmail} onChange={e => setEnableDailyEmail(e.target.checked)} style={{ accentColor: 'var(--brass-600)' }} />
              تفعيل إرسال تقرير التنبيهات يومياً
            </label>
          </div>

          <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '10px' }}>
            <h4 style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--navy-950)' }}>⏱️ أيام التنبيهات</h4>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '10.5px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>تنبيه حرج جداً (أحمر):</label>
              <input type="number" value={criticalDays} onChange={e => setCriticalDays(Number(e.target.value))} style={{ width: '100px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '10.5px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>تنبيه متوسط (برتقالي):</label>
              <input type="number" value={warningDays} onChange={e => setWarningDays(Number(e.target.value))} style={{ width: '100px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none' }} />
            </div>
          </div>
        </div>
      )}

      {/* 🌟 3. قواعد التجديد */}
      {activeTab === 'business' && (
        <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '10px', maxWidth: '600px' }}>
          <h4 style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--navy-950)' }}>📋 القواعد الافتراضية للمعالجة</h4>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '10.5px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>مدة التجديد الافتراضية:</label>
            <select value={defaultRenewalMonths} onChange={e => setDefaultRenewalMonths(Number(e.target.value))} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', width: '200px' }}>
              <option value={3}>3 شهور (ربع سنوي)</option>
              <option value={6}>6 شهور (نصف سنوي)</option>
              <option value={12}>12 شهر (سنة كاملة)</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
              <input type="checkbox" checked={requireEmpSignature} onChange={e => setRequireEmpSignature(e.target.checked)} style={{ accentColor: 'var(--brass-600)' }} />
              اشتراط التوقيع الإلكتروني لإغلاق حالة التجديد
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoApproveSameDept} onChange={e => setAutoApproveSameDept(e.target.checked)} style={{ accentColor: 'var(--brass-600)' }} />
              السماح بالاعتماد المباشر للطلبات فوق 60 يوماً
            </label>
          </div>
        </div>
      )}

      {/* 🌟 4. بيانات المنشأة */}
      {activeTab === 'system' && (
        <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '10px', maxWidth: '600px' }}>
          <h4 style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--navy-950)' }}>🏢 الهوية والبيانات المؤسسية</h4>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '10.5px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>اسم الكيان التجاري الرئيسي:</label>
            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10.5px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>بداية السنة المالية:</label>
            <input type="text" value={fiscalYearStart} onChange={e => setFiscalYearStart(e.target.value)} style={{ width: '150px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', fontFamily: 'monospace', outline: 'none' }} />
          </div>
        </div>
      )}

    </div>
  );
}
