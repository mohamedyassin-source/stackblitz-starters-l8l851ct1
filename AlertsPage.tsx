'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

export default function AlertsPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // مستويات التنبيه المحددة
  const [severityTab, setSeverityTab] = useState<'all' | 'critical' | 'warning' | 'notice' | 'info'>('critical');

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDept, setSelectedDept] = useState('');

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    let allEmps: any[] = [];
    let allRens: any[] = [];
    let from = 0;
    const step = 1000;
    
    // سحب كافة الموظفين
    while (true) {
      const { data, error } = await supabase.from('employees').select('*').range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      allEmps = [...allEmps, ...data];
      if (data.length < step) break;
      from += step;
    }

    from = 0;
    // سحب كافة طلبات التجديد
    while (true) {
      const { data, error } = await supabase.from('renewal_requests').select('*').range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      allRens = [...allRens, ...data];
      if (data.length < step) break;
      from += step;
    }

    // تصفية العقود غير الدائمة فقط
    const activeContracts = allEmps.filter(e => e.contract_type !== 'دائم' && !String(e.job_title).includes('دائم'));
    setEmployees(activeContracts);
    setRenewals(allRens);
    setLoading(false);
  };

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const companiesList = Array.from(new Set(employees.map(e => e.company).filter(Boolean)));
  const deptsList = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));

  // معالجة قائمة التنبيهات وتصنيف درجات الخطورة
  const alertItems = useMemo(() => {
    return employees.map(emp => {
      const days = getDaysRemaining(emp.contract_end_date);
      const empRens = renewals.filter(r => r.employee_code === emp.employee_code).sort((a, b) => (b.request_id || '').localeCompare(a.request_id || ''));
      const latestRenewal = empRens[0];

      let level: 'critical' | 'warning' | 'notice' | 'info' | 'safe' = 'info';
      if (days !== null) {
        if (days < 0) level = 'critical';
        else if (days <= 30) level = 'warning';
        else if (days <= 60) level = 'notice';
        else if (days <= 90) level = 'info';
        else level = 'safe';
      }

      return {
        ...emp,
        daysRemaining: days,
        alertLevel: level,
        hasActiveRequest: !!latestRenewal && (latestRenewal.status === 'Pending' || latestRenewal.status === 'Approved'),
        requestStatus: latestRenewal?.status || 'لا يوجد',
        signatureStatus: latestRenewal?.signature_status || '—'
      };
    }).filter(item => item.daysRemaining !== null && item.daysRemaining <= 90) 
      .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999));
  }, [employees, renewals]);

  // تطبيق الفلاتر والتبويبات
  const filteredAlerts = useMemo(() => {
    return alertItems.filter(item => {
      if (severityTab !== 'all' && item.alertLevel !== severityTab) return false;

      const term = searchTerm.toLowerCase();
      const matchesSearch = !term || String(item.employee_code).toLowerCase().includes(term) || String(item.employee_name).toLowerCase().includes(term);
      const matchesComp = !selectedCompany || item.company === selectedCompany;
      const matchesDept = !selectedDept || item.department === selectedDept;

      return matchesSearch && matchesComp && matchesDept;
    });
  }, [alertItems, severityTab, searchTerm, selectedCompany, selectedDept]);

  const counts = useMemo(() => {
    return {
      critical: alertItems.filter(i => i.alertLevel === 'critical').length,
      warning: alertItems.filter(i => i.alertLevel === 'warning').length,
      notice: alertItems.filter(i => i.alertLevel === 'notice').length,
      info: alertItems.filter(i => i.alertLevel === 'info').length,
      all: alertItems.length
    };
  }, [alertItems]);

  const handleQuickRenewal = async (emp: any) => {
    setActionLoading(true);
    const currentYear = new Date().getFullYear();
    const reqId = `RR-${currentYear}-${Math.floor(1000 + Math.random() * 9000)}`;

    const payload: any = {
      request_id: reqId,
      employee_code: emp.employee_code,
      employee_name: emp.employee_name,
      department: emp.department,
      job_title: emp.job_title,
      company: emp.company,
      contract_end_date: emp.contract_end_date,
      renewal_months: 12,
      status: 'Pending',
      signature_status: 'قيد التوقيع',
      request_date: new Date().toISOString().split('T')[0]
    };
    if (emp.id) payload.employee_id = emp.id;
    else if (emp.employee_id) payload.employee_id = emp.employee_id;

    const { error } = await supabase.from('renewal_requests').insert([payload]);
    setActionLoading(false);

    if (error) alert('خطأ: ' + error.message);
    else {
      alert(`تم إنشاء طلب تجديد عاجل برقم ${reqId} بنجاح ✅`);
      fetchAllData();
    }
  };

  return (
    <div>
      {/* العنوان الرئيسي والأزرار */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--navy-950)' }}>مركزي تنبيهات وإشعارات العقود</h3>
          <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--muted)' }}>رصد وتتبع العقود المستحقة للإنهاء أو التجديد لتجنب المخاطر القانونية</p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          {/* 🌟 الزرار الجديد لإرسال التقرير للإيميل */}
          <button onClick={async () => {
              setActionLoading(true);
              try {
                  const res = await fetch('/api/cron');
                  const data = await res.json();
                  alert(data.message || 'تم الإرسال');
              } catch (err) {
                  alert('حدث خطأ في الإرسال، تأكد من إعدادات ملف .env.local وإنشاء ملف الـ API');
              }
              setActionLoading(false);
          }} disabled={actionLoading} style={{ background: '#15803d', color: '#fff', border: 0, padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.7 : 1 }}>
              {actionLoading ? 'جاري الإرسال...' : '📧 إرسال التقرير للإيميل الآن'}
          </button>

          <button onClick={fetchAllData} disabled={actionLoading} style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>
            🔄 تحديث التنبيهات
          </button>
        </div>
      </div>

      {/* 🌟 تبويبات درجات الخطورة (Slicers) */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <button
          onClick={() => setSeverityTab('critical')}
          style={{
            flex: 1, padding: '12px', borderRadius: '8px',
            border: severityTab === 'critical' ? '2px solid #dc2626' : '1px solid var(--line)',
            background: severityTab === 'critical' ? '#fef2f2' : '#fff',
            cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s'
          }}
        >
          <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: 'bold' }}>🔴 منتهية بالفعل (إجراء فوري)</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#dc2626', marginTop: '4px' }}>{counts.critical}</div>
        </button>

        <button
          onClick={() => setSeverityTab('warning')}
          style={{
            flex: 1, padding: '12px', borderRadius: '8px',
            border: severityTab === 'warning' ? '2px solid #ea580c' : '1px solid var(--line)',
            background: severityTab === 'warning' ? '#fff7ed' : '#fff',
            cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s'
          }}
        >
          <div style={{ fontSize: '11px', color: '#ea580c', fontWeight: 'bold' }}>🟠 حرج (أقل من 30 يوماً)</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#ea580c', marginTop: '4px' }}>{counts.warning}</div>
        </button>

        <button
          onClick={() => setSeverityTab('notice')}
          style={{
            flex: 1, padding: '12px', borderRadius: '8px',
            border: severityTab === 'notice' ? '2px solid #d97706' : '1px solid var(--line)',
            background: severityTab === 'notice' ? '#fefce8' : '#fff',
            cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s'
          }}
        >
          <div style={{ fontSize: '11px', color: '#d97706', fontWeight: 'bold' }}>🟡 تنبيه (31 - 60 يوماً)</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#d97706', marginTop: '4px' }}>{counts.notice}</div>
        </button>

        <button
          onClick={() => setSeverityTab('info')}
          style={{
            flex: 1, padding: '12px', borderRadius: '8px',
            border: severityTab === 'info' ? '2px solid #2563eb' : '1px solid var(--line)',
            background: severityTab === 'info' ? '#eff6ff' : '#fff',
            cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s'
          }}
        >
          <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: 'bold' }}>🔵 إشعار مبكر (61 - 90 يوماً)</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#2563eb', marginTop: '4px' }}>{counts.info}</div>
        </button>

        <button
          onClick={() => setSeverityTab('all')}
          style={{
            flex: 1, padding: '12px', borderRadius: '8px',
            border: severityTab === 'all' ? '2px solid var(--navy-950)' : '1px solid var(--line)',
            background: severityTab === 'all' ? '#f8fafc' : '#fff',
            cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s'
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--navy-950)', fontWeight: 'bold' }}>📂 كافة التنبيهات (90 يوم)</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--navy-950)', marginTop: '4px' }}>{counts.all}</div>
        </button>
      </div>

      {/* شريط الفلاتر */}
      <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="بحث باسم الموظف أو الكود..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none', width: '220px' }} />

        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none' }}>
          <option value="">🏢 كل الشركات</option>
          {companiesList.map((c: any, i) => <option key={i} value={c}>{c}</option>)}
        </select>

        <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none' }}>
          <option value="">💼 كل الإدارات</option>
          {deptsList.map((d: any, i) => <option key={i} value={d}>{d}</option>)}
        </select>

        <button onClick={() => { setSearchTerm(''); setSelectedCompany(''); setSelectedDept(''); }} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>
        
        <div style={{ flex: 1, textAlign: 'left', fontSize: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>
          عدد التنبيهات المعروضة: <span style={{ color: 'var(--navy-950)' }}>{filteredAlerts.length}</span> تنبيه
        </div>
      </div>

      {/* جدول التنبيهات الإجرائي */}
      <div className="table-responsive" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', borderRadius: '8px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)' }}>جاري معالجة وتصنيف التنبيهات...</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '10.5px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>مستوى الخطورة</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الكود</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الموظف</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الشركة</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الإدارة</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>تاريخ الانتهاء</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>المتبقي</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>حالة الإجراء الحالية</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', textAlign: 'center' }}>إجراء عاجل</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', fontWeight: 'bold' }}>لا توجد تنبيهات في هذا التصنيف حالياً. 🎉</td></tr>
              ) : (
                filteredAlerts.map(item => (
                  <tr key={item.employee_code} style={{ borderBottom: '1px solid var(--line)' }}>
                    
                    <td style={{ padding: '8px 10px' }}>
                      {item.alertLevel === 'critical' && <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>🔴 منتهي</span>}
                      {item.alertLevel === 'warning' && <span style={{ background: '#fff7ed', color: '#ea580c', padding: '3px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>🟠 حرج (30 يوم)</span>}
                      {item.alertLevel === 'notice' && <span style={{ background: '#fefce8', color: '#d97706', padding: '3px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>🟡 تنبيه (60 يوم)</span>}
                      {item.alertLevel === 'info' && <span style={{ background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>🔵 مبكر (90 يوم)</span>}
                    </td>

                    <td style={{ padding: '8px 10px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--brass-600)' }}>{item.employee_code}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{item.employee_name}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{item.company || '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{item.department || '—'}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 'bold' }}>{item.contract_end_date || '—'}</td>
                    
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontWeight: 'bold', color: item.daysRemaining < 0 ? '#dc2626' : item.daysRemaining <= 30 ? '#ea580c' : '#15803d' }}>
                        {item.daysRemaining < 0 ? `منتهي منذ ${Math.abs(item.daysRemaining)} يوم` : `${item.daysRemaining} يوم`}
                      </span>
                    </td>

                    <td style={{ padding: '8px 10px', fontWeight: 'bold', fontSize: '9px' }}>
                      {item.hasActiveRequest ? (
                        <span style={{ color: '#2563eb' }}>طلب جاري ({item.requestStatus})</span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>يتطلب اتخاذ إجراء</span>
                      )}
                    </td>

                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleQuickRenewal(item)}
                        disabled={item.hasActiveRequest || actionLoading}
                        style={{
                          background: item.hasActiveRequest ? '#e2e8f0' : 'var(--brass-600)',
                          color: item.hasActiveRequest ? '#94a3b8' : '#fff',
                          border: 0, padding: '4px 10px', borderRadius: '4px',
                          fontSize: '9px', fontWeight: 'bold',
                          cursor: item.hasActiveRequest || actionLoading ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {item.hasActiveRequest ? 'الطلب متسجل بالفعل' : '+ إنتاج طلب تجديد'}
                      </button>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}