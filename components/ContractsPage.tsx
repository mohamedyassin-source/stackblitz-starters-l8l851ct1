'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ContractsPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [expiryStatus, setExpiryStatus] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [modalState, setModalState] = useState<{ isOpen: boolean, type: 'single' | 'bulk', emp?: any }>({ isOpen: false, type: 'single' });
  const [renewalMode, setRenewalMode] = useState<'months' | 'custom'>('months');
  const [renewalMonths, setRenewalMonths] = useState<number>(12);
  const [customEndDate, setCustomEndDate] = useState<string>('');

  useEffect(() => {
    const jumpCode = localStorage.getItem('jumpSearch');
    if (jumpCode) {
      setSearchTerm(jumpCode);
      setTimeout(() => localStorage.removeItem('jumpSearch'), 1000);
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    let allEmps: any[] = [];
    let allRens: any[] = [];
    let from = 0;
    const step = 1000;
    
    while (true) {
      const { data, error } = await supabase.from('employees').select('*').range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      allEmps = [...allEmps, ...data];
      if (data.length < step) break;
      from += step;
    }

    from = 0;
    while (true) {
      // 🌟 ضفنا سحب signature_status عشان نقيم بيه الحالة صح
      const { data, error } = await supabase.from('renewal_requests').select('employee_code, status, signature_status, request_id').range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      allRens = [...allRens, ...data];
      if (data.length < step) break;
      from += step;
    }
    
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

  const calculateNewEndDate = (oldDateStr: string | undefined, months: number) => {
    if (!oldDateStr) return '';
    const date = new Date(oldDateStr);
    if (isNaN(date.getTime())) return '';
    date.setMonth(date.getMonth() + months);
    return date.toISOString().split('T')[0];
  };

  const generateSequentialIds = (count: number) => {
    const currentYear = new Date().getFullYear();
    const yearPrefix = `RR-${currentYear}-`;
    const yearRenewals = renewals.filter(r => r.request_id && String(r.request_id).startsWith(yearPrefix));
    
    let maxSeq = 0;
    yearRenewals.forEach(r => {
      const parts = String(r.request_id).split('-');
      if (parts.length === 3) {
        const seq = parseInt(parts[2], 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });

    const newIds = [];
    for (let i = 0; i < count; i++) {
      maxSeq++;
      newIds.push(`${yearPrefix}${String(maxSeq).padStart(4, '0')}`); 
    }
    return newIds;
  };

  const getUniqueId = (emp: any) => emp.id || `${emp.employee_code}-${emp.contract_end_date}`;

  // 🌟 المقيّم الذكي لحالة التجديد (بيجيب آخر طلب للموظف ويفحصه)
  const getRenewalStatusInfo = (empCode: string) => {
    const empRens = renewals.filter(r => r.employee_code === empCode).sort((a, b) => b.request_id.localeCompare(a.request_id));
    const latest = empRens[0];
    
    if (!latest) return { text: 'متاح للتجديد', color: 'var(--muted)', locked: false };
    
    if (latest.status === 'Pending') {
      return { text: 'قيد المعالجة (بطلبات التجديد)', color: '#2563eb', locked: true };
    }
    if (latest.status === 'Approved' && latest.signature_status !== 'تم التوقيع') {
      return { text: 'في انتظار التوقيع', color: '#ea580c', locked: true };
    }
    if (latest.status === 'Approved' && latest.signature_status === 'تم التوقيع') {
      return { text: 'تم توقيع العقد ✅', color: '#15803d', locked: false };
    }
    if (latest.status === 'Rejected') {
      return { text: 'الطلب الأخير مرفوض ❌', color: '#dc2626', locked: false };
    }
    return { text: 'متاح للتجديد', color: 'var(--muted)', locked: false };
  };

  const deptsList = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));
  const typesList = Array.from(new Set(employees.map(e => e.contract_type).filter(Boolean)));

  const filteredContracts = employees.filter(emp => {
    const term = searchTerm.toLowerCase();
    const days = getDaysRemaining(emp.contract_end_date);
    const matchesSearch = !term || String(emp.employee_code).toLowerCase().includes(term) || String(emp.employee_name).toLowerCase().includes(term) || String(emp.department).toLowerCase().includes(term);
    const matchesDept = !selectedDept || emp.department === selectedDept;
    const matchesType = !selectedType || emp.contract_type === selectedType;
    let matchesExpiry = true;
    if (expiryStatus === 'expiring_60') matchesExpiry = days !== null && days <= 60 && days >= 0;
    if (expiryStatus === 'expired') matchesExpiry = days !== null && days < 0;
    return matchesSearch && matchesDept && matchesType && matchesExpiry;
  });

  const sortedContracts = [...filteredContracts].sort((a, b) => {
    const daysA = getDaysRemaining(a.contract_end_date);
    const daysB = getDaysRemaining(b.contract_end_date);
    if (daysA === null) return 1; 
    if (daysB === null) return -1;
    return daysA - daysB; 
  });

  const fixedTermCount = employees.filter(e => e.contract_type === 'محدد المدة').length;
  const aboveAgeCount = employees.filter(e => String(e.contract_type).includes('فوق السن')).length;
  const expiringSoonCount = employees.filter(e => {
    const d = getDaysRemaining(e.contract_end_date);
    return d !== null && d <= 60 && d >= 0;
  }).length;
  const expiredCount = employees.filter(e => {
    const d = getDaysRemaining(e.contract_end_date);
    return d !== null && d < 0;
  }).length;

  const openSingleRenewal = (emp: any) => {
    setRenewalMode('months');
    setCustomEndDate('');
    setModalState({ isOpen: true, type: 'single', emp });
  };

  const openBulkRenewal = () => {
    if (selectedIds.length === 0) return alert('يرجى تحديد عقد واحد على الأقل من الجدول.');
    setRenewalMode('months');
    setCustomEndDate('');
    setModalState({ isOpen: true, type: 'bulk' });
  };

  const confirmRenewalAction = async () => {
    if (renewalMode === 'custom' && !customEndDate) {
      return alert('يرجى إدخال تاريخ الانتهاء المخصص.');
    }

    setActionLoading(true);

    if (modalState.type === 'single' && modalState.emp) {
      const emp = modalState.emp;
      const targetEndDate = renewalMode === 'months' ? calculateNewEndDate(emp.contract_end_date, renewalMonths) : customEndDate;

      const [reqId] = generateSequentialIds(1);
      const payload: any = {
        request_id: reqId,
        employee_code: emp.employee_code,
        employee_name: emp.employee_name,
        department: emp.department,
        job_title: emp.job_title,
        company: emp.company,
        contract_end_date: emp.contract_end_date,
        new_contract_end_date: targetEndDate,
        renewal_months: renewalMode === 'months' ? renewalMonths : null,
        status: 'Pending',
        signature_status: 'قيد التوقيع',
        request_date: new Date().toISOString().split('T')[0]
      };
      if (emp.id) payload.employee_id = emp.id;
      else if (emp.employee_id) payload.employee_id = emp.employee_id;

      const { error } = await supabase.from('renewal_requests').insert([payload]);
      setActionLoading(false);
      setModalState({ isOpen: false, type: 'single' });

      if (error) alert('خطأ: ' + error.message);
      else {
        alert(`تم إنشاء طلب تجديد ينتهي في (${targetEndDate}) بنجاح ✅`);
        setSearchTerm('');
        fetchData(); 
      }
    } 
    
    else if (modalState.type === 'bulk') {
      const empsToRenew = employees.filter(e => selectedIds.includes(getUniqueId(e)));
      const newSeqIds = generateSequentialIds(empsToRenew.length);
      
      const requestsToInsert = empsToRenew.map((emp, index) => {
        const targetEndDate = renewalMode === 'months' ? calculateNewEndDate(emp.contract_end_date, renewalMonths) : customEndDate;

        const payload: any = {
          request_id: newSeqIds[index],
          employee_code: emp.employee_code,
          employee_name: emp.employee_name,
          department: emp.department,
          job_title: emp.job_title,
          company: emp.company,
          contract_end_date: emp.contract_end_date,
          new_contract_end_date: targetEndDate,
          renewal_months: renewalMode === 'months' ? renewalMonths : null,
          status: 'Pending',
          signature_status: 'قيد التوقيع',
          request_date: new Date().toISOString().split('T')[0]
        };
        if (emp.id) payload.employee_id = emp.id;
        else if (emp.employee_id) payload.employee_id = emp.employee_id;
        return payload;
      });

      const { error } = await supabase.from('renewal_requests').insert(requestsToInsert);
      setActionLoading(false);
      setModalState({ isOpen: false, type: 'single' });

      if (error) alert('خطأ أثناء التوليد المجمع: ' + error.message);
      else {
        alert(`تم توليد ${requestsToInsert.length} طلب تجديد بنجاح! ✅`);
        setSelectedIds([]); 
        setSearchTerm('');
        fetchData(); 
      }
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--navy-950)' }}>العقود الحالية السارية</h3>
          <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--muted)' }}>أرشيف وسجل شامل لعقود الموظفين النشطين (الخطوة الأولى لإنشاء طلبات التجديد)</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => alert("سيتم فتح نافذة 'إنشاء عقد عمل جديد'")} style={{ background: 'var(--paper-card)', color: 'var(--navy-950)', border: '1px solid var(--line)', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
            📄 طلب إنشاء عقد جديد تماماً
          </button>
          <button onClick={openBulkRenewal} disabled={actionLoading} style={{ background: 'var(--brass-600)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.7 : 1 }}>
            ⚙️ توليد طلبات للمحددين ({selectedIds.length})
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <div className="kpi-card" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '12px 16px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>العقود المحددة</div><div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--ink)' }}>{fixedTermCount.toLocaleString()}</div><div style={{ fontSize: '8.5px', color: 'var(--muted)' }}>عقود محددة المدة</div></div>
          <div style={{ background: '#eff6ff', color: '#2563eb', width: '32px', height: '32px', borderRadius: '8px', display: 'grid', placeItems: 'center', fontSize: '14px' }}>📂</div>
        </div>
        <div className="kpi-card" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '12px 16px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>عقود فوق السن</div><div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--ink)' }}>{aboveAgeCount.toLocaleString()}</div><div style={{ fontSize: '8.5px', color: 'var(--muted)' }}>تجديد سنوي</div></div>
          <div style={{ background: '#fef3c7', color: '#d97706', width: '32px', height: '32px', borderRadius: '8px', display: 'grid', placeItems: 'center', fontSize: '14px' }}>💼</div>
        </div>
        <div className="kpi-card" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '12px 16px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>تقترب من الانتهاء</div><div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ea580c' }}>{expiringSoonCount.toLocaleString()}</div><div style={{ fontSize: '8.5px', color: 'var(--muted)' }}>متبقي 60 يوم أو أقل</div></div>
          <div style={{ background: '#fff7ed', color: '#ea580c', width: '32px', height: '32px', borderRadius: '8px', display: 'grid', placeItems: 'center', fontSize: '14px' }}>🔔</div>
        </div>
        <div className="kpi-card" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '12px 16px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>عقود منتهية المدة</div><div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626' }}>{expiredCount.toLocaleString()}</div><div style={{ fontSize: '8.5px', color: 'var(--muted)' }}>تحتاج تسوية أو تجديد</div></div>
          <div style={{ background: '#fef2f2', color: '#dc2626', width: '32px', height: '32px', borderRadius: '8px', display: 'grid', placeItems: 'center', fontSize: '14px' }}>⚠️</div>
        </div>
      </div>

      <div className="filter-panel" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="بحث بالاسم، الكود، الإدارة..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none', width: '220px' }} />
        <input list="deptList" placeholder="الإدارة (اكتب للبحث)..." value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none', width: '160px' }} />
        <datalist id="deptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>
        <select value={selectedType} onChange={e => setSelectedType(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none' }}>
          <option value="">كل أنواع العقود</option>
          {typesList.map((t: any, i) => <option key={i} value={t}>{t}</option>)}
        </select>
        <select value={expiryStatus} onChange={e => setExpiryStatus(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none' }}>
          <option value="">حالة الانتهاء (الكل)</option>
          <option value="expiring_60">تقترب من الانتهاء (60 يوم)</option>
          <option value="expired">عقود منتهية</option>
        </select>
        <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedType(''); setExpiryStatus(''); }} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>
        <div style={{ flex: 1, textAlign: 'left', fontSize: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>النتائج: <span style={{ color: 'var(--navy-950)' }}>{sortedContracts.length}</span> عقد</div>
      </div>

      <div className="table-responsive" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', borderRadius: '8px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)' }}>جاري سحب بيانات العقود وترتيبها...</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '10.5px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', textAlign: 'center', width: '30px' }}>
                  <input type="checkbox" onChange={e => setSelectedIds(e.target.checked ? sortedContracts.filter(emp => !getRenewalStatusInfo(emp.employee_code).locked).map(c => getUniqueId(c)) : [])} checked={selectedIds.length > 0 && selectedIds.length === sortedContracts.filter(emp => !getRenewalStatusInfo(emp.employee_code).locked).length} />
                </th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الكود</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الموظف</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الإدارة</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الوظيفة</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>النوع</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الانتهاء</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>المتبقي</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>حالة التجديد</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', textAlign: 'center' }}>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {sortedContracts.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>
                    {searchTerm ? 'لم يتم العثور على الموظف (قد يكون عقده دائم أو ليس له عقد مسجل).' : 'لا توجد عقود حالياً.'}
                  </td>
                </tr>
              ) : sortedContracts.map((emp) => {
                const days = getDaysRemaining(emp.contract_end_date);
                const uId = getUniqueId(emp);
                const statusInfo = getRenewalStatusInfo(emp.employee_code); // 🌟 تقييم الحالة

                return (
                  <tr key={uId} style={{ borderBottom: '1px solid var(--line)', background: selectedIds.includes(uId) ? '#f8fafc' : 'transparent' }}>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}><input type="checkbox" disabled={statusInfo.locked} checked={selectedIds.includes(uId)} onChange={e => setSelectedIds(e.target.checked ? [...selectedIds, uId] : selectedIds.filter(id => id !== uId))} /></td>
                    <td style={{ padding: '8px 10px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--brass-600)' }}>{emp.employee_code}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 'bold', opacity: statusInfo.locked ? 0.6 : 1 }}>{emp.employee_name}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{emp.department || '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{emp.job_title || '—'}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#2563eb' }}>{emp.contract_type}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 'bold' }}>{emp.contract_end_date || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {days !== null ? <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', background: days < 0 ? '#fef2f2' : days <= 60 ? '#fff7ed' : '#dcfce7', color: days < 0 ? '#dc2626' : days <= 60 ? '#c2410c' : '#15803d' }}>{days < 0 ? `منتهي (${Math.abs(days)} يوم)` : `${days} يوم`}</span> : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', fontWeight: 'bold', fontSize: '9px' }}>
                      {/* 🌟 عرض الحالة الصحيحة هنا بناءً على المقيّم الذكي */}
                      <span style={{ color: statusInfo.color }}>{statusInfo.text}</span>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <button onClick={() => openSingleRenewal(emp)} disabled={statusInfo.locked || actionLoading} style={{ background: statusInfo.locked ? '#e2e8f0' : 'var(--brass-600)', color: statusInfo.locked ? '#94a3b8' : '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: statusInfo.locked || actionLoading ? 'not-allowed' : 'pointer' }}>+ إنشاء طلب</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalState.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ width: '450px', background: 'var(--paper-card)', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: 'var(--navy-950)' }}>
              {modalState.type === 'single' ? `إنشاء طلب تجديد لـ (${modalState.emp?.employee_name})` : `تجديد مجمع لعدد (${selectedIds.length}) موظف`}
            </h3>
            
            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', padding: '12px', background: 'var(--paper)', borderRadius: '8px', border: '1px solid var(--line)' }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: renewalMode === 'months' ? 'var(--brass-600)' : 'var(--muted)' }}>
                <input type="radio" checked={renewalMode === 'months'} onChange={() => setRenewalMode('months')} style={{ accentColor: 'var(--brass-600)' }} />
                تجديد بالشهور (تلقائي)
              </label>
              <label style={{ fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: renewalMode === 'custom' ? 'var(--brass-600)' : 'var(--muted)' }}>
                <input type="radio" checked={renewalMode === 'custom'} onChange={() => setRenewalMode('custom')} style={{ accentColor: 'var(--brass-600)' }} />
                تاريخ انتهاء مخصص
              </label>
            </div>

            <div style={{ marginBottom: '24px' }}>
              {renewalMode === 'months' ? (
                <>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>يرجى اختيار مدة التجديد بالشهور:</label>
                  <select value={renewalMonths} onChange={e => setRenewalMonths(Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold' }}>
                    <option value={1}>شهر واحد (1)</option>
                    <option value={2}>شهران (2)</option>
                    <option value={3}>3 شهور (ربع سنوي)</option>
                    <option value={6}>6 شهور (نصف سنوي)</option>
                    <option value={9}>9 شهور</option>
                    <option value={12}>12 شهر (سنة كاملة)</option>
                  </select>
                  {modalState.type === 'single' && (
                    <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--muted)' }}>
                      تاريخ الانتهاء المتوقع: <strong style={{ color: '#15803d', fontFamily: 'monospace', fontSize: '12px' }}>{calculateNewEndDate(modalState.emp?.contract_end_date, renewalMonths)}</strong>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>يرجى إدخال تاريخ انتهاء العقد الجديد:</label>
                  <input 
                    type="date" 
                    value={customEndDate} 
                    onChange={e => setCustomEndDate(e.target.value)} 
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} 
                  />
                  <div style={{ marginTop: '8px', fontSize: '9px', color: '#ea580c' }}>ملاحظة: هذا التاريخ سيصبح النهاية الرسمية للعقد بغض النظر عن التاريخ القديم.</div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setModalState({ isOpen: false, type: 'single' })} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', color: 'var(--ink)' }}>
                إلغاء
              </button>
              <button onClick={confirmRenewalAction} disabled={actionLoading} style={{ background: 'var(--brass-600)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.7 : 1 }}>
                {actionLoading ? 'جاري التنفيذ...' : 'تأكيد وإنشاء الطلب ✅'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}