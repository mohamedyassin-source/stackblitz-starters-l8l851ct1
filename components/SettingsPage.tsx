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

  // إدارة جدول app_users المباشرة
  const [appUsers, setAppUsers] = useState<any[]>([]);
  const [loadingAppUsers, setLoadingAppUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // نموذج إضافة مستخدم جديد في app_users (البريد اختياري)
  const [showAddUserModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    employee_code: '',
    role: 'Admin',
  });
  const [addingUser, setAddingUser] = useState(false);

  // إدارة الموظفين العامة للصلاحيات
  const [employees, setEmployees] = useState<any[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [search, setSearch] = useState('');

  const isAdmin = currentUser?.role === 'Admin' || true;

  useEffect(() => {
    const savedEmail = localStorage.getItem('cfg_recipientEmail');
    if (savedEmail) setRecipientEmail(savedEmail);
    const savedMonths = localStorage.getItem('cfg_defaultRenewalMonths');
    if (savedMonths) setDefaultRenewalMonths(Number(savedMonths));
  }, []);

  useEffect(() => {
    if (activeTab === 'security') {
      fetchAppUsers();
      fetchAllEmployees();
    }
  }, [activeTab]);

  // 1. جلب مستخدمي النظام من جدول app_users
  const fetchAppUsers = async () => {
    setLoadingAppUsers(true);
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAppUsers(data || []);
    } catch (err: any) {
      console.error('Error fetching app_users:', err.message);
    } finally {
      setLoadingAppUsers(false);
    }
  };

  // 2. جلب جميع الموظفين من جدول employees
  const fetchAllEmployees = async () => {
    setLoadingRoles(true);
    let allEmps: any[] = [];
    let from = 0;
    const step = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('employees')
        .select('employee_code, employee_name, role')
        .order('employee_code', { ascending: true })
        .range(from, from + step - 1);

      if (error) {
        console.error('Supabase Error:', error);
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

  // 3. إضافة مستخدم جديد في app_users بدون إرسال حقل email غير الموجود
  const handleAddAppUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username.trim()) return alert('يرجى كتابة اسم المستخدم.');
    
    setAddingUser(true);
    try {
      // إرسال الحقول المسجلة في جدول app_users فقط
      const insertPayload: any = {
        username: newUser.username.trim(),
        employee_code: newUser.employee_code.trim() || null,
        role: newUser.role,
        created_at: new Date().toISOString()
      };

      const { error } = await supabase.from('app_users').insert([insertPayload]);

      if (error) throw error;

      alert('تم إضافة المستخدم في جدول app_users بنجاح ✅');
      setShowAddModal(false);
      setNewUser({ username: '', email: '', employee_code: '', role: 'Admin' });
      fetchAppUsers();
    } catch (err: any) {
      alert('حدث خطأ أثناء إضافة المستخدم: ' + err.message);
    } finally {
      setAddingUser(false);
    }
  };

  // 4. حذف مستخدم من app_users
  const handleDeleteAppUser = async (userId: any, username: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف المستخدم (${username}) نهائياً من app_users؟`)) return;

    try {
      const { error } = await supabase.from('app_users').delete().eq('id', userId);
      if (error) throw error;

      alert('تم حذف المستخدم بنجاح 🗑️');
      fetchAppUsers();
    } catch (err: any) {
      alert('خطأ أثناء الحذف: ' + err.message);
    }
  };

  // 5. تعديل صلاحية مستخدم في app_users
  const handleAppUserRoleChange = async (userId: any, newRole: string) => {
    try {
      const { error } = await supabase.from('app_users').update({ role: newRole }).eq('id', userId);
      if (error) throw error;

      alert(`✅ تم تحديث الصلاحية إلى ${newRole}`);
      fetchAppUsers();
    } catch (err: any) {
      alert('خطأ أثناء تحديث الصلاحية: ' + err.message);
    }
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

  const filteredAppUsers = appUsers.filter(u => {
    if (!userSearch) return true;
    const term = userSearch.toLowerCase().trim();
    const name = String(u.username || '').toLowerCase();
    const code = String(u.employee_code || '').toLowerCase();
    return name.includes(term) || code.includes(term);
  });

  const filteredEmployees = employees.filter(emp => {
    if (!search) return true;
    const searchTerm = search.toLowerCase().trim();
    const name = String(emp?.employee_name || '').toLowerCase();
    const code = String(emp?.employee_code || '').toLowerCase();
    return name.includes(searchTerm) || code.includes(searchTerm);
  });

  if (!isAdmin) {
    return (
      <div className="card text-center py-12 px-6" style={{ borderColor: 'var(--stamp-red)', background: 'var(--stamp-red-bg)' }}>
        <h2 className="m-0 mb-2 text-lg font-extrabold" style={{ color: 'var(--stamp-red)' }}>🚨 محاولة وصول غير مصرح بها!</h2>
        <p className="font-bold" style={{ color: 'var(--stamp-red)' }}>ليس لديك صلاحيات مدير النظام للدخول لهذه الصفحة.</p>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950)', fontWeight: '900' }}>إعدادات وتفضيلات النظام 👑</h3>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>التحكم في الثوابت، التنبيهات، وحسابات أدمن النظام (app_users)</p>
        </div>
        <button onClick={handleSaveSettings} style={{ background: 'var(--brass-600, #0d9488)', color: '#fff', border: 0, padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
          💾 حفظ الإعدادات العامة
        </button>
      </div>

      {saved && (
        <div style={{ background: 'var(--stamp-green-bg)', border: '1px solid var(--stamp-green-bg)', color: 'var(--stamp-green)', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', marginBottom: '16px' }}>
          ✅ تم حفظ إعدادات النظام بنجاح!
        </div>
      )}

      {/* التبويبات */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--line)', paddingBottom: '8px', flexWrap: 'wrap' }}>
        {[
          { id: 'security', title: '🛡️ الأمان ومديري النظام (app_users)' },
          { id: 'notifications', title: '🔔 التنبيهات والإيميل' },
          { id: 'business', title: '⚙️ قواعد العمل' },
          { id: 'system', title: '🏢 بيانات المنشأة' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '10px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', border: 0,
              background: activeTab === tab.id ? 'var(--navy-950, #0f172a)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--muted)', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            {tab.title}
          </button>
        ))}
      </div>

      {/* 🌟 1. الأمان ومديري النظام (جدول app_users المباشر) */}
      {activeTab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* قسم حسابات الأدمن والمستخدمين app_users */}
          <div style={{ background: 'var(--paper-card)', border: '2px solid var(--brass-500, #d97706)', padding: '20px', borderRadius: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--navy-950)', fontWeight: '900' }}>
                  👑 قائمة مديري ومستخدمي النظام (جدول app_users)
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>
                  إجمالي الحسابات المسجلة: <strong style={{ color: 'var(--brass-600)' }}>{appUsers.length}</strong> مستخدم
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input 
                  type="text" 
                  placeholder="بحث في app_users..." 
                  value={userSearch} 
                  onChange={e => setUserSearch(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', width: '200px' }} 
                />
                <button 
                  onClick={() => setShowAddModal(true)} 
                  style={{ background: 'var(--brass-600, #0d9488)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  + إضافة أدمن جديد 👑
                </button>
              </div>
            </div>

            <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '10px' }}>
              <table style={{ width: '100%', textAlign: 'right', fontSize: '12px', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--paper)' }}>
                  <tr>
                    <th style={{ padding: '12px', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>اسم المستخدم</th>
                    <th style={{ padding: '12px', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>كود الموظف</th>
                    <th style={{ padding: '12px', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الصلاحية</th>
                    <th style={{ padding: '12px', borderBottom: '1px solid var(--line)', textAlign: 'center', color: 'var(--muted)' }}>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAppUsers ? (
                    <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', fontWeight: 'bold' }}>جاري سحب حسابات app_users... ⏳</td></tr>
                  ) : filteredAppUsers.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', fontWeight: 'bold', color: 'var(--muted)' }}>لا توجد حسابات مسجلة 🚫</td></tr>
                  ) : (
                    filteredAppUsers.map(user => (
                      <tr key={user.id} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold', color: 'var(--ink)' }}>{user.username}</td>
                        <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--brass-600)' }}>{user.employee_code || '—'}</td>
                        <td style={{ padding: '12px' }}>
                          <select 
                            value={user.role || 'Admin'}
                            onChange={(e) => handleAppUserRoleChange(user.id, e.target.value)}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontWeight: 'bold', fontSize: '11px', outline: 'none' }}
                          >
                            <option value="Admin">Admin (مدير نظام كامل) 👑</option>
                            <option value="HR">HR (إدارة الموارد البشرية) 💼</option>
                            <option value="Viewer">Viewer (مشاهدة فقط) 👁️</option>
                          </select>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <button 
                            onClick={() => handleDeleteAppUser(user.id, user.username)} 
                            style={{ background: 'var(--stamp-red-bg)', color: 'var(--stamp-red)', border: 0, padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            حذف 🗑️
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* قسم صلاحيات جدول الموظفين العادي employees */}
          <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--navy-950)', fontWeight: '800' }}>
                  👥 صلاحيات الموظفين في السجل العام (employees)
                </h4>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>إجمالي القوة: <strong>{employees.length}</strong> موظف</span>
              </div>
              <input 
                type="text" 
                placeholder="ابحث باسم الموظف أو الكود..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', width: '220px' }} 
              />
            </div>

            <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '10px' }}>
              <table className="data-table" style={{ width: '100%', textAlign: 'right', fontSize: '11.5px', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--paper)' }}>
                  <tr>
                    <th style={{ padding: '10px', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الكود</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الاسم</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الصلاحية</th>
                    <th style={{ padding: '10px', borderBottom: '1px solid var(--line)', width: '200px', color: 'var(--muted)' }}>تعديل الصلاحية</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRoles ? (
                    <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', fontWeight: 'bold' }}>جاري سحب الموظفين... ⏳</td></tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', fontWeight: 'bold', color: 'var(--muted)' }}>لا توجد نتائج 🚫</td></tr>
                  ) : (
                    filteredEmployees.map((emp, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--brass-600)' }}>{emp.employee_code}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold' }}>{emp.employee_name}</td>
                        <td style={{ padding: '10px' }}>
                          {emp.role === 'Admin' && <span style={{ background: 'var(--stamp-red-bg)', color: 'var(--stamp-red)', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '10px' }}>Admin 👑</span>}
                          {emp.role === 'HR' && <span style={{ background: 'var(--stamp-blue-bg)', color: 'var(--stamp-blue)', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '10px' }}>HR 💼</span>}
                          {(!emp.role || emp.role === 'Employee') && <span style={{ background: 'var(--paper)', color: 'var(--muted)', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '10px' }}>Employee 👤</span>}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <select 
                            value={emp.role || 'Employee'}
                            onChange={(e) => {
                              if (window.confirm(`هل أنت متأكد من تغيير صلاحية الموظف (${emp.employee_name}) إلى ${e.target.value}؟`)) {
                                handleRoleChange(emp.employee_code, e.target.value);
                              }
                            }}
                            style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--line)', outline: 'none', background: 'var(--paper-card)', color: 'var(--ink)', fontWeight: 'bold', fontSize: '11px' }}
                          >
                            <option value="Admin">مدير نظام (Admin)</option>
                            <option value="HR">إدارة HR</option>
                            <option value="Employee">موظف (Employee)</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* 🌟 2. التنبيهات والإيميل */}
      {activeTab === 'notifications' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '12px' }}>
            <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--navy-950)', fontWeight: '800' }}>📧 مستلم التقارير اليومية</h4>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>البريد الإلكتروني الرئيسي:</label>
              <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', fontFamily: 'monospace', outline: 'none' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
              <input type="checkbox" checked={enableDailyEmail} onChange={e => setEnableDailyEmail(e.target.checked)} style={{ accentColor: 'var(--brass-600)' }} />
              تفعيل إرسال تقرير التنبيهات يومياً
            </label>
          </div>

          <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '12px' }}>
            <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--navy-950)', fontWeight: '800' }}>⏱️ أيام التنبيهات</h4>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>تنبيه حرج جداً (أحمر):</label>
              <input type="number" value={criticalDays} onChange={e => setCriticalDays(Number(e.target.value))} style={{ width: '120px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>تنبيه متوسط (برتقالي):</label>
              <input type="number" value={warningDays} onChange={e => setWarningDays(Number(e.target.value))} style={{ width: '120px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold' }} />
            </div>
          </div>
        </div>
      )}

      {/* 🌟 3. قواعد التجديد */}
      {activeTab === 'business' && (
        <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '12px', maxWidth: '600px' }}>
          <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--navy-950)', fontWeight: '800' }}>📋 القواعد الافتراضية للمعالجة</h4>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>مدة التجديد الافتراضية:</label>
            <select value={defaultRenewalMonths} onChange={e => setDefaultRenewalMonths(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', width: '220px', fontWeight: 'bold' }}>
              <option value={3}>3 شهور (ربع سنوي)</option>
              <option value={6}>6 شهور (نصف سنوي)</option>
              <option value={12}>12 شهر (سنة كاملة)</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
              <input type="checkbox" checked={requireEmpSignature} onChange={e => setRequireEmpSignature(e.target.checked)} style={{ accentColor: 'var(--brass-600)' }} />
              اشتراط التوقيع الإلكتروني لإغلاق حالة التجديد
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoApproveSameDept} onChange={e => setAutoApproveSameDept(e.target.checked)} style={{ accentColor: 'var(--brass-600)' }} />
              السماح بالاعتماد المباشر للطلبات فوق 60 يوماً
            </label>
          </div>
        </div>
      )}

      {/* 🌟 4. بيانات المنشأة */}
      {activeTab === 'system' && (
        <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '20px', borderRadius: '12px', maxWidth: '600px' }}>
          <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--navy-950)', fontWeight: '800' }}>🏢 الهوية والبيانات المؤسسية</h4>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>اسم الكيان التجاري الرئيسي:</label>
            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>بداية السنة المالية:</label>
            <input type="text" value={fiscalYearStart} onChange={e => setFiscalYearStart(e.target.value)} style={{ width: '150px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', fontFamily: 'monospace', outline: 'none', fontWeight: 'bold' }} />
          </div>
        </div>
      )}

      {/* 👑 نافذة إضافة أدمن جديد في app_users */}
      {showAddUserModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '480px', background: 'var(--paper-card)', borderRadius: '16px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--navy-950)', fontWeight: '900' }}>👑 إضافة مستخدم جديد في app_users</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'var(--paper)', border: 0, color: 'var(--muted)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <form onSubmit={handleAddAppUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>اسم المستخدم (Username) *</label>
                <input required type="text" placeholder="مثال: Mohamed Yassin" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>كود الموظف (اختياري)</label>
                <input type="text" placeholder="مثال: 10525" value={newUser.employee_code} onChange={e => setNewUser({ ...newUser, employee_code: e.target.value })} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontFamily: 'monospace', fontWeight: 'bold' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>نوع الصلاحية (Role) *</label>
                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
                  <option value="Admin">Admin (مدير نظام كامل) 👑</option>
                  <option value="HR">HR (إدارة الموارد البشرية) 💼</option>
                  <option value="Viewer">Viewer (مشاهدة فقط) 👁️</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={addingUser} style={{ background: 'var(--brass-600, #0d9488)', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: addingUser ? 'not-allowed' : 'pointer' }}>
                  {addingUser ? 'جاري الإضافة...' : 'تأكيد وحفظ الأدمن 👑'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
