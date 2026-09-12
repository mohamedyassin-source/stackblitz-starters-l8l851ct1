'use client';

import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';


// دالة حساب تاريخ التقاعد (60 سنة)
const getRetirementDate = (birthDateRaw: string | null | undefined) => {
  if (!birthDateRaw) return null;
  const birthDate = new Date(birthDateRaw);
  if (isNaN(birthDate.getTime())) return null;
  return new Date(birthDate.getFullYear() + 60, birthDate.getMonth(), birthDate.getDate());
};

export default function AlertsPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // مستويات التنبيه المحددة
  const [severityTab, setSeverityTab] = useState<'all' | 'critical' | 'warning' | 'notice' | 'retirement'>('critical');

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDept, setSelectedDept] = useState('');

  // 🌟 دالة السحب التكرارية (لتخطي حد الـ 1000 صف بأمان تام)
  const fetchAllRows = async (tableName: string, selectFields = '*', filterEq?: { col: string; val: any }) => {
    let allRows: any[] = [];
    let from = 0;
    const step = 1000;
    while (true) {
      let query = supabase.from(tableName).select(selectFields).range(from, from + step - 1);
      if (filterEq) query = query.eq(filterEq.col, filterEq.val);
      const { data, error } = await query;
      if (error || !data || data.length === 0) break;
      allRows = [...allRows, ...data];
      if (data.length < step) break; // لو اللي راجع أقل من 1000 يبقى دي آخر صفحة
      from += step;
    }
    return allRows;
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // 🌟 جلب الموظفين، العقود النشطة، والطلبات بالتوازي
      const [empData, contData, renData] = await Promise.all([
        fetchAllRows('employees'),
        fetchAllRows('contracts', '*', { col: 'status', val: 'Active' }), // نجلب العقود النشطة لتحديد تاريخ النهاية الفعلي
        fetchAllRows('renewal_requests')
      ]);

      // تجميع العقود بناءً على كود الموظف
      const contractsMap = new Map<string, any[]>();
      contData.forEach(c => {
        if (!c) return;
        const code = String(c.employee_code || '').trim().replace(/^0+/, '');
        if (!contractsMap.has(code)) contractsMap.set(code, []);
        contractsMap.get(code)?.push(c);
      });

      // دمج بيانات الموظف مع أحدث عقد له (السر في ظهور التواريخ بشكل صحيح)
      const mergedEmployees = empData.filter(e => e && e.status !== 'Inactive' && e.status !== 'Terminated' && e.contract_type !== 'إنهاء تعاقد').map(emp => {
        const empCodeClean = String(emp.employee_code || '').trim().replace(/^0+/, '');
        const empContracts = contractsMap.get(empCodeClean) || [];

        empContracts.sort((a, b) => {
          const dateA = a.contract_end_date ? new Date(a.contract_end_date).getTime() : 0;
          const dateB = b.contract_end_date ? new Date(b.contract_end_date).getTime() : 0;
          return dateB - dateA;
        });

        const activeContract = empContracts[0] || {};
        
        return {
          ...emp,
          contract_type: activeContract.contract_type || emp.contract_type || '—',
          contract_start_date: activeContract.contract_start_date || emp.contract_start_date || emp.hiring_date || null,
          contract_end_date: activeContract.contract_end_date || emp.contract_end_date || null,
        };
      });

      setEmployees(mergedEmployees);
      setRenewals(renData || []);
    } catch (err) {
      console.error('Error fetching data from Supabase:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const getDaysRemaining = (dateStr: string | Date | null) => {
    if (!dateStr) return null;
    const end = new Date(dateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const companiesList = Array.from(new Set(employees.map(e => e.company).filter(Boolean)));
  const deptsList = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));

  // 🌟 معالجة التنبيهات والأيام المتبقية
  const alertItems = useMemo(() => {
    return employees
      .filter((e) => e.contract_type !== 'دائم' && !String(e.job_title).includes('دائم'))
      .map(emp => {
        const days = getDaysRemaining(emp.contract_end_date); // هنا أصبح يقرأ من العقد المدمج
        
        // حساب أيام التقاعد
        const retirementDate = getRetirementDate(emp.birth_date);
        const daysToRetirement = getDaysRemaining(retirementDate);
        const isRetiringSoon = daysToRetirement !== null && daysToRetirement <= 90 && daysToRetirement >= 0;

        const safeCode = String(emp.employee_code).trim().replace(/^0+/, '');
        const empRens = renewals
          .filter(r => String(r.employee_code).trim().replace(/^0+/, '') === safeCode)
          .sort((a, b) => (b.request_id || '').localeCompare(a.request_id || ''));
        
        const latestRenewal = empRens[0];

        let level: 'critical' | 'warning' | 'notice' | 'retirement' | 'safe' = 'safe';
        
        if (isRetiringSoon) {
          level = 'retirement';
        } else if (days !== null) {
          if (days < 0) level = 'critical';
          else if (days <= 30) level = 'warning';
          else if (days <= 90) level = 'notice';
        }

        return {
          ...emp,
          daysRemaining: days,
          daysToRetirement: daysToRetirement,
          retirementDateStr: retirementDate ? retirementDate.toISOString().split('T')[0] : null,
          alertLevel: level,
          hasActiveRequest: !!latestRenewal && !latestRenewal.status.includes('Rejected') && !latestRenewal.signature_status.includes('تم التوقيع'),
          requestStatus: latestRenewal?.status || 'لا يوجد',
        };
      })
      .filter(item => item.alertLevel !== 'safe') // إخفاء الآمنين تماماً 
      .sort((a, b) => {
        if (a.alertLevel === 'critical' && b.alertLevel !== 'critical') return -1;
        if (b.alertLevel === 'critical' && a.alertLevel !== 'critical') return 1;
        return (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999);
      });
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
      retirement: alertItems.filter(i => i.alertLevel === 'retirement').length,
      all: alertItems.length
    };
  }, [alertItems]);

  // دالة إنشاء طلب سريع
  const handleQuickRenewal = async (emp: any) => {
    setActionLoading(true);
    try {
      // جدار حماية سن التقاعد
      if (emp.daysToRetirement !== null && emp.daysToRetirement <= 365) {
        alert(`🚨 تنبيه خطر!\n\nالموظف (${emp.employee_name}) سيبلغ سن التقاعد (60) بتاريخ ${emp.retirementDateStr}.\n\nلا يمكن للسيستم إنشاء تجديد آلي بسنة كاملة. يرجى التوجه لصفحة "العقود" لإنشاء نموذج بمدة مخصصة لا تتجاوز تاريخ تقاعده.`);
        setActionLoading(false);
        return;
      }

      const currentYear = new Date().getFullYear();
      const reqId = `RR-${currentYear}-${Math.floor(1000 + Math.random() * 9000)}`;

      const startDate = new Date(emp.contract_end_date || new Date());
      startDate.setDate(startDate.getDate() + 1);
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
      endDate.setDate(endDate.getDate() - 1);

      const payload = {
        request_id: reqId,
        employee_code: parseInt(emp.employee_code, 10),
        employee_name: emp.employee_name,
        department: emp.department,
        job_title: emp.job_title,
        company: emp.company,
        contract_end_date: emp.contract_end_date,
        new_contract_end_date: endDate.toISOString().split('T')[0],
        renewal_months: 12,
        status: 'Pending_Project_Manager', // للمرحلة الأولى
        signature_status: 'قيد التوقيع',
        request_date: new Date().toISOString().split('T')[0],
      };

      const { error } = await supabase.from('renewal_requests').insert([payload]);

      if (error) throw error;

      alert(`تم تحويل الموظف بنجاح إلى دورة الاعتماد ✅`);
      fetchAllData(); 
    } catch (error: any) {
      console.error(error);
      alert('خطأ أثناء إنشاء الطلب: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ paddingBottom: '40px', direction: 'rtl' }}>
      
      {/* 🌟 تصميم Enterprise Cards */}
      <style>{`
        .modern-stat-card {
          background: #ffffff;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          border-right: 4px solid var(--theme-color);
          border-bottom: 4px solid var(--theme-color);
          padding: 16px;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 90px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .modern-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08);
          background: #f8fafc;
        }
        .modern-stat-card.active {
          background: #f8fafc;
          border-color: var(--theme-color);
          box-shadow: 0 0 0 1px var(--theme-color) inset;
        }
        .card-icon-box {
          width: 32px; height: 32px;
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
          background: var(--icon-bg);
          color: var(--theme-color);
        }
      `}</style>

      {/* العنوان الرئيسي والأزرار */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900' }}>🚨 غرفة العمليات والتنبيهات </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>رصد المخاطر القانونية، التجاوزات الزمنية، وتنبيهات سن التقاعد</p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={async () => {
              setActionLoading(true);
              try {
                  const res = await fetch('/api/cron');
                  const data = await res.json();
                  alert(data.message || 'تم الإرسال');
              } catch (err) {
                  alert('حدث خطأ في إرسال البريد');
              }
              setActionLoading(false);
          }} disabled={actionLoading} style={{ background: '#10b981', color: '#fff', border: 0, padding: '10px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.7 : 1, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              {actionLoading ? 'جاري الإرسال...' : '📧 إرسال تقرير الخطر للإدارة'}
          </button>

          <button onClick={fetchAllData} disabled={actionLoading} style={{ background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: actionLoading ? 'not-allowed' : 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            🔄 فحص السجلات الآن
          </button>
        </div>
      </div>

      {/* 🗂️ كروت درجات الخطورة (Enterprise Design) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        <div className={`modern-stat-card ${severityTab === 'critical' ? 'active' : ''}`} style={{ '--theme-color': '#ef4444', '--icon-bg': '#fef2f2' } as React.CSSProperties} onClick={() => setSeverityTab('critical')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>خطر قانوني (منتهية)</span>
            <div className="card-icon-box">🔴</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{counts.critical}</div>
            <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 'bold' }}>تجاوزت التاريخ</div>
          </div>
        </div>

        <div className={`modern-stat-card ${severityTab === 'warning' ? 'active' : ''}`} style={{ '--theme-color': '#f97316', '--icon-bg': '#fff7ed' } as React.CSSProperties} onClick={() => setSeverityTab('warning')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>حرج جداً</span>
            <div className="card-icon-box">🟠</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{counts.warning}</div>
            <div style={{ fontSize: '11px', color: '#f97316', fontWeight: 'bold' }}>أقل من 30 يوم</div>
          </div>
        </div>

        <div className={`modern-stat-card ${severityTab === 'notice' ? 'active' : ''}`} style={{ '--theme-color': '#f59e0b', '--icon-bg': '#fffbeb' } as React.CSSProperties} onClick={() => setSeverityTab('notice')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>إنذار قياسي</span>
            <div className="card-icon-box">🟡</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{counts.notice}</div>
            <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 'bold' }}>أقل من 90 يوم</div>
          </div>
        </div>

        <div className={`modern-stat-card ${severityTab === 'retirement' ? 'active' : ''}`} style={{ '--theme-color': '#8b5cf6', '--icon-bg': '#f3e8ff' } as React.CSSProperties} onClick={() => setSeverityTab('retirement')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>رادار المعاشات (60)</span>
            <div className="card-icon-box">👴</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{counts.retirement}</div>
            <div style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: 'bold' }}>يبلغون السن قريباً</div>
          </div>
        </div>

        <div className={`modern-stat-card ${severityTab === 'all' ? 'active' : ''}`} style={{ '--theme-color': '#475569', '--icon-bg': '#f1f5f9' } as React.CSSProperties} onClick={() => setSeverityTab('all')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>صندوق التنبيهات</span>
            <div className="card-icon-box">📂</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{counts.all}</div>
            <div style={{ fontSize: '11px', color: '#475569', fontWeight: 'bold' }}>كافة المخاطر</div>
          </div>
        </div>
      </div>

      {/* شريط الفلاتر */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <input type="text" placeholder="بحث باسم الموظف أو الكود..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', width: '220px', fontWeight: 'bold' }} />

        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
          <option value="">🏢 كل الشركات</option>
          {companiesList.map((c: any, i) => <option key={i} value={c}>{c}</option>)}
        </select>

        <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
          <option value="">💼 كل الإدارات</option>
          {deptsList.map((d: any, i) => <option key={i} value={d}>{d}</option>)}
        </select>

        <button onClick={() => { setSearchTerm(''); setSelectedCompany(''); setSelectedDept(''); }} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', color: '#334155' }}>
          إعادة ضبط
        </button>
        
        <div style={{ flex: 1, textAlign: 'left', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>
          تنبيهات بالقائمة: <span style={{ color: '#4f46e5' }}>{filteredAlerts.length}</span>
        </div>
      </div>

      {/* 🚀 جدول التنبيهات الإجرائي */}
      <div className="table-responsive" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', color: '#64748b' }}>جاري فحص السجلات وتحليل البيانات... ⏳</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>الخطر</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>الكود</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>الموظف</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>الإدارة</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>انتهاء العقد</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'center' }}>الإنذار الزمني</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'center' }}>حالة الإجراء</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'center' }}>قرار الـ HR</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>لا توجد مخاطر أو تنبيهات.. وضع السجلات ممتاز! 🎉</td></tr>
              ) : (
                filteredAlerts.map(item => (
                  <tr key={item.employee_code} style={{ borderBottom: '1px solid #f1f5f9', background: item.alertLevel === 'critical' ? '#fef2f2' : 'transparent' }}>
                    
                    <td style={{ padding: '12px' }}>
                      {item.alertLevel === 'critical' && <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' }}>🔴 كارثي</span>}
                      {item.alertLevel === 'warning' && <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' }}>🟠 حرج</span>}
                      {item.alertLevel === 'notice' && <span style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' }}>🟡 تنبيه</span>}
                      {item.alertLevel === 'retirement' && <span style={{ background: '#f3e8ff', color: '#7e22ce', border: '1px solid #e9d5ff', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' }}>👴 سن معاش</span>}
                    </td>

                    <td style={{ padding: '12px', fontWeight: 'bold', fontFamily: 'monospace', color: '#4f46e5' }}>{item.employee_code}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#0f172a' }}>{item.employee_name}</td>
                    <td style={{ padding: '12px', color: '#64748b', fontWeight: '500' }}>{item.department || '—'}</td>
                    <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 'bold' }}>{item.contract_end_date || '—'}</td>
                    
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {item.alertLevel === 'retirement' ? (
                        <span style={{ fontWeight: 'bold', color: '#7e22ce' }}>يبلغ 60 بعد {item.daysToRetirement} يوم</span>
                      ) : (
                        <span style={{ fontWeight: 'bold', color: item.daysRemaining < 0 ? '#dc2626' : item.daysRemaining <= 30 ? '#ea580c' : '#10b981' }}>
                          {item.daysRemaining < 0 ? `منتهي منذ ${Math.abs(item.daysRemaining)} يوم` : `متبقي ${item.daysRemaining} يوم`}
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {item.hasActiveRequest ? (
                        <span style={{ background: '#eff6ff', color: '#2563eb', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #bfdbfe' }}>طلب جاري ⏳</span>
                      ) : (
                        <span style={{ background: '#f1f5f9', color: '#64748b', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #cbd5e1' }}>بدون إجراء ⚠️</span>
                      )}
                    </td>

                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleQuickRenewal(item)}
                        disabled={item.hasActiveRequest || actionLoading}
                        style={{
                          background: item.hasActiveRequest ? '#f1f5f9' : '#4f46e5',
                          color: item.hasActiveRequest ? '#94a3b8' : '#ffffff',
                          border: item.hasActiveRequest ? '1px solid #cbd5e1' : 0, 
                          padding: '6px 12px', borderRadius: '6px',
                          fontSize: '10px', fontWeight: 'bold',
                          cursor: item.hasActiveRequest || actionLoading ? 'not-allowed' : 'pointer',
                          boxShadow: item.hasActiveRequest ? 'none' : '0 2px 4px rgba(79, 70, 229, 0.2)'
                        }}
                      >
                        {item.hasActiveRequest ? 'تم إرسال نموذج' : 'إرسال لاعتماد المشروع ⚡'}
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
