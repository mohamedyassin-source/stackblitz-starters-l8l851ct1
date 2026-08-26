'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';

export default function ContractsPage() {
  const { employees, renewals, loading, refresh: fetchData } = useAppData();
  const [actionLoading, setActionLoading] = useState(false);

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [expiryStatus, setExpiryStatus] = useState('');

  // حالة التحديد المجمع (Checkboxes)
  const [selectedEmpCodes, setSelectedEmpCodes] = useState<string[]>([]);

  // حالات نافذة التجديد (فردي ومجمع)
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: 'single' | 'bulk';
    emp?: any;
  }>({ isOpen: false, type: 'single' });
  const [renewalMode, setRenewalMode] = useState<'months' | 'custom'>('months');
  const [renewalMonths, setRenewalMonths] = useState<number>(12);
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // 🔍 حالات نافذة إنشاء عقد جديد (مع البحث الحي)
  const [isNewContractModalOpen, setIsNewContractModalOpen] = useState(false);
  const [newContractSearch, setNewContractSearch] = useState('');
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState('');
  const [selectedEmpObject, setSelectedEmpObject] = useState<any>(null);
  const [newContractStartDate, setNewContractStartDate] = useState('');
  const [newContractEndDate, setNewContractEndDate] = useState('');
  const [newContractType, setNewContractType] = useState('محدد المدة');

  // ✏️ حالات نافذة التعديل السريع بالقلم (Quick Edit Modal)
  const [quickEditModal, setQuickEditModal] = useState<{
    isOpen: boolean;
    emp?: any;
    startDate: string;
    endDate: string;
    type: string;
  }>({ isOpen: false, startDate: '', endDate: '', type: 'محدد المدة' });

  // حالة نافذة إنهاء التعاقد
  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);
  const [terminateEmployeeCode, setTerminateEmployeeCode] = useState('');

  // حالة نموذج الـ PDF
  const [createdRequestData, setCreatedRequestData] = useState<any>(null);

  useEffect(() => {
    const jumpCode = localStorage.getItem('jumpSearch');
    if (jumpCode) {
      setSearchTerm(jumpCode);
      setTimeout(() => localStorage.removeItem('jumpSearch'), 1000);
    }
  }, []);

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
    const yearRenewals = renewals.filter((r) => r.request_id && String(r.request_id).startsWith(yearPrefix));
    let maxSeq = 0;
    yearRenewals.forEach((r) => {
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

  const getRenewalStatusInfo = (empCode: string) => {
    const empRens = renewals.filter((r) => r.employee_code === empCode).sort((a, b) => b.request_id.localeCompare(a.request_id));
    const latest = empRens[0];
    if (!latest) return { text: 'متاح للتجديد', color: 'var(--muted)', locked: false };
    if (latest.status === 'Pending') return { text: 'قيد المعالجة', color: '#2563eb', locked: true };
    if (latest.status === 'Approved' && latest.signature_status !== 'تم التوقيع') return { text: 'في انتظار التوقيع', color: '#ea580c', locked: true };
    if (latest.status === 'Approved' && latest.signature_status === 'تم التوقيع') return { text: 'تم توقيع العقد ✅', color: '#15803d', locked: false };
    if (latest.status === 'Rejected') return { text: 'الطلب الأخير مرفوض ❌', color: '#dc2626', locked: false };
    return { text: 'متاح للتجديد', color: 'var(--muted)', locked: false };
  };

  const deptsList = Array.from(new Set(employees.map((e) => e.department).filter(Boolean)));
  const typesList = Array.from(new Set(employees.map((e) => e.contract_type).filter(Boolean)));

  const filteredContracts = employees.filter((emp) => {
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

  // 🔍 نتائج البحث الحي لشاشة إنشاء عقد جديد
  const newContractSearchResults = useMemo(() => {
    if (!newContractSearch.trim()) return [];
    const term = newContractSearch.toLowerCase().trim();
    return employees.filter(e => {
      if (e.contract_type === 'إنهاء تعاقد') return false;
      const code = String(e.employee_code || '').toLowerCase();
      const name = String(e.employee_name || '').toLowerCase();
      const dept = String(e.department || '').toLowerCase();
      return code.includes(term) || name.includes(term) || dept.includes(term);
    }).slice(0, 8);
  }, [employees, newContractSearch]);

  // إحصائيات الكروت العلوية
  const totalFixedContracts = employees.filter(e => e.contract_type?.includes('محدد')).length;
  const overAgeContracts = employees.filter(e => e.contract_type?.includes('فوق السن')).length;
  const expiringSoonCount = employees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d <= 60 && d >= 0; }).length;
  const expiredCount = employees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d < 0; }).length;

  const toggleSelection = (code: string) => {
    setSelectedEmpCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };
  const toggleAll = () => {
    if (selectedEmpCodes.length === sortedContracts.length) setSelectedEmpCodes([]);
    else setSelectedEmpCodes(sortedContracts.map(e => e.employee_code));
  };

  const openSingleRenewal = (emp: any) => {
    setRenewalMode('months');
    setRenewalMonths(12);
    setCustomEndDate('');
    setModalState({ isOpen: true, type: 'single', emp });
  };
  const openBulkRenewal = () => {
    if (selectedEmpCodes.length === 0) return alert('يرجى تحديد موظفين أولاً');
    setRenewalMode('months');
    setRenewalMonths(12);
    setCustomEndDate('');
    setModalState({ isOpen: true, type: 'bulk' });
  };

  // ✏️ فتح نافذة التعديل السريع
  const openQuickEdit = (emp: any) => {
    setQuickEditModal({
      isOpen: true,
      emp,
      startDate: emp.hiring_date || new Date().toISOString().split('T')[0],
      endDate: emp.contract_end_date || '',
      type: emp.contract_type || 'محدد المدة'
    });
  };

  // ✏️ حفظ التعديل السريع المباشر في قاعدة البيانات
  const handleSaveQuickEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEditModal.emp) return;
    setActionLoading(true);

    try {
      const empCode = quickEditModal.emp.employee_code;
      const { error } = await supabase.from('employees').update({
        contract_type: quickEditModal.type,
        contract_end_date: (quickEditModal.type === 'دائم' || !quickEditModal.endDate) ? null : quickEditModal.endDate,
        hiring_date: quickEditModal.startDate ? quickEditModal.startDate : null
      }).eq('employee_code', empCode);

      if (error) throw error;

      alert('تم تحديث تاريخ ونوع العقد بنجاح ✅');
      setQuickEditModal({ isOpen: false, startDate: '', endDate: '', type: 'محدد المدة' });
      fetchData();
    } catch (err: any) {
      alert('خطأ أثناء التعديل: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getEmpId = (emp: any) => {
    if (!emp) return '0';
    return emp.employee_id || emp.id || emp.emp_id || emp.employee_code || '0';
  };

  const handleTerminateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminateEmployeeCode) return alert('يرجى اختيار الموظف.');
    const confirmTerm = window.confirm('هل أنت متأكد من إنهاء تعاقد هذا الموظف نهائياً؟');
    if (!confirmTerm) return;
    setActionLoading(true);
    const { error } = await supabase.from('employees').update({ contract_type: 'إنهاء تعاقد', status: 'Terminated' }).eq('employee_code', terminateEmployeeCode);
    setActionLoading(false);
    if (error) alert('حدث خطأ أثناء إنهاء التعاقد: ' + error.message);
    else { alert('تم إنهاء التعاقد بنجاح ✅'); setIsTerminateModalOpen(false); setTerminateEmployeeCode(''); fetchData(); }
  };

  const handleCreateBrandNewContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeCode || !newContractStartDate || !newContractEndDate) return alert('يرجى استكمال جميع البيانات.');
    if (new Date(newContractEndDate) <= new Date(newContractStartDate)) return alert('تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية.');
    
    setActionLoading(true);
    const emp = selectedEmpObject || employees.find((e) => e.employee_code === selectedEmployeeCode);
    const [reqId] = generateSequentialIds(1);

    const payload: any = {
      request_id: reqId,
      employee_id: getEmpId(emp),
      employee_code: emp.employee_code,
      employee_name: emp.employee_name,
      department: emp.department,
      job_title: emp.job_title,
      company: emp.company,
      contract_start_date: newContractStartDate,
      contract_end_date: newContractStartDate,
      new_contract_end_date: newContractEndDate,
      status: 'Pending',
      signature_status: 'قيد التوقيع',
      request_date: new Date().toISOString().split('T')[0],
    };

    const { error: reqError } = await supabase.from('renewal_requests').insert([payload]);
    if (reqError) { 
      setActionLoading(false); 
      return alert('خطأ أثناء إنشاء الطلب: ' + reqError.message); 
    }

    await supabase.from('employees').update({ 
      contract_type: newContractType, 
      contract_end_date: newContractEndDate 
    }).eq('employee_code', emp.employee_code);

    setActionLoading(false);
    setIsNewContractModalOpen(false);
    setSelectedEmployeeCode('');
    setSelectedEmpObject(null);
    setNewContractSearch('');
    setCreatedRequestData(payload);
    alert(`تم إنشاء العقد الجديد بنجاح وتحويل نوع العقد إلى (${newContractType}) ✅`);
    fetchData();
  };

  const confirmRenewalAction = async () => {
    if (renewalMode === 'custom' && !customEndDate) return alert('يرجى إدخال تاريخ الانتهاء المخصص.');
    setActionLoading(true);

    if (modalState.type === 'single' && modalState.emp) {
      const emp = modalState.emp;
      const targetEndDate = renewalMode === 'months' ? calculateNewEndDate(emp.contract_end_date, renewalMonths) : customEndDate;
      const [reqId] = generateSequentialIds(1);
      const payload: any = {
        request_id: reqId,
        employee_id: getEmpId(emp),
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
        request_date: new Date().toISOString().split('T')[0],
      };
      const { error } = await supabase.from('renewal_requests').insert([payload]);
      setActionLoading(false); setModalState({ isOpen: false, type: 'single' });
      if (error) alert('خطأ: ' + error.message); else { setCreatedRequestData(payload); fetchData(); }
    } else if (modalState.type === 'bulk') {
      const selectedEmps = employees.filter(e => selectedEmpCodes.includes(e.employee_code));
      const reqIds = generateSequentialIds(selectedEmps.length);
      const payloads = selectedEmps.map((emp, index) => {
        const targetEndDate = renewalMode === 'months' ? calculateNewEndDate(emp.contract_end_date, renewalMonths) : customEndDate;
        return {
          request_id: reqIds[index],
          employee_id: getEmpId(emp),
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
          request_date: new Date().toISOString().split('T')[0],
        };
      });
      const { error } = await supabase.from('renewal_requests').insert(payloads);
      setActionLoading(false); setModalState({ isOpen: false, type: 'single' });
      if (error) alert('خطأ: ' + error.message); else { alert('تم إنشاء طلبات التجديد المجمعة بنجاح!'); setSelectedEmpCodes([]); fetchData(); }
    }
  };

  const handlePrintPDF = () => window.print();

  return (
    <div style={{ paddingBottom: '40px' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #pdf-print-area, #pdf-print-area * { visibility: visible; }
          #pdf-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; direction: rtl; background: #fff !important; color: #000 !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* الهيدر والزراير العلوية */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950)' }}>العقود الحالية السارية</h3>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--muted)' }}>أرشيف وسجل شامل لعقود الموظفين النشطين (الخطوة الأولى لإنشاء طلبات التجديد)</p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { setTerminateEmployeeCode(''); setIsTerminateModalOpen(true); }}
            style={{ background: '#dc2626', color: '#fff', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ❌ إنهاء تعاقد
          </button>
          
          <button
            onClick={() => { 
              setSelectedEmployeeCode(''); 
              setSelectedEmpObject(null);
              setNewContractSearch('');
              setNewContractStartDate(new Date().toISOString().split('T')[0]); 
              setNewContractEndDate(''); 
              setIsNewContractModalOpen(true); 
            }}
            style={{ background: '#fff', color: '#000', border: '1px solid var(--line)', padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
          >
            📄 طلب إنشاء عقد جديد تماماً
          </button>

          <button
            onClick={openBulkRenewal}
            disabled={selectedEmpCodes.length === 0}
            style={{ background: selectedEmpCodes.length > 0 ? '#0d9488' : '#e2e8f0', color: selectedEmpCodes.length > 0 ? '#fff' : '#94a3b8', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: selectedEmpCodes.length > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ⚙️ توليد طلبات للمحددين ({selectedEmpCodes.length})
          </button>
        </div>
      </div>

      {/* الكروت الإحصائية */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div><p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>العقود المحددة</p><p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--muted)' }}>عقود محددة المدة</p></div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a' }}>{totalFixedContracts.toLocaleString('en-US')}</div>
        </div>
        <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div><p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>عقود فوق السن</p><p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--muted)' }}>تجديد سنوي</p></div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a' }}>{overAgeContracts.toLocaleString('en-US')}</div>
        </div>
        <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div><p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>تقترب من الانتهاء</p><p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--muted)' }}>متبقي 60 يوم أو أقل</p></div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#ea580c' }}>{expiringSoonCount.toLocaleString('en-US')}</div>
        </div>
        <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div><p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>عقود منتهية المدة</p><p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--muted)' }}>تحتاج تسوية أو تجديد</p></div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#dc2626' }}>{expiredCount.toLocaleString('en-US')}</div>
        </div>
      </div>

      {/* شريط الفلاتر */}
      <div className="no-print" style={{ background: '#fff', border: '1px solid var(--line)', padding: '12px', borderRadius: '10px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', direction: 'rtl' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="بحث بالاسم، الكود، الإدارة..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', width: '250px' }} 
          />
          <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', width: '180px' }}>
            <option value="">الإدارة (الكل)</option>
            {deptsList.map((d: any, i) => (<option key={i} value={d}>{d}</option>))}
          </select>
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none' }}>
            <option value="">كل أنواع العقود</option>
            {typesList.map((t: any, i) => (<option key={i} value={t}>{t}</option>))}
          </select>
          <select value={expiryStatus} onChange={(e) => setExpiryStatus(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none' }}>
            <option value="">حالة الانتهاء (الكل)</option>
            <option value="expiring_60">ينتهي خلال 60 يوم</option>
            <option value="expired">منتهي الصلاحية</option>
          </select>
          <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedType(''); setExpiryStatus(''); }} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '8px 16px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
            إعادة ضبط
          </button>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)' }}>
          النتائج: {sortedContracts.length} عقد
        </div>
      </div>

      {/* الجدول مع زرار القلم المضاف ✏️ */}
      <div className="no-print table-responsive" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)' }}>جاري سحب البيانات...</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 10px', background: '#f8fafc', borderBottom: '1px solid var(--line)', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedEmpCodes.length > 0 && selectedEmpCodes.length === sortedContracts.length} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                </th>
                <th style={{ padding: '12px 10px', background: '#f8fafc', borderBottom: '1px solid var(--line)', color: '#475569' }}>الكود</th>
                <th style={{ padding: '12px 10px', background: '#f8fafc', borderBottom: '1px solid var(--line)', color: '#475569' }}>الموظف</th>
                <th style={{ padding: '12px 10px', background: '#f8fafc', borderBottom: '1px solid var(--line)', color: '#475569' }}>الإدارة</th>
                <th style={{ padding: '12px 10px', background: '#f8fafc', borderBottom: '1px solid var(--line)', color: '#475569' }}>الوظيفة</th>
                <th style={{ padding: '12px 10px', background: '#f8fafc', borderBottom: '1px solid var(--line)', color: '#475569' }}>النوع</th>
                <th style={{ padding: '12px 10px', background: '#f8fafc', borderBottom: '1px solid var(--line)', color: '#475569' }}>الانتهاء</th>
                <th style={{ padding: '12px 10px', background: '#f8fafc', borderBottom: '1px solid var(--line)', color: '#475569', textAlign: 'center' }}>المتبقي</th>
                <th style={{ padding: '12px 10px', background: '#f8fafc', borderBottom: '1px solid var(--line)', color: '#475569' }}>حالة التجديد</th>
                <th style={{ padding: '12px 10px', background: '#f8fafc', borderBottom: '1px solid var(--line)', color: '#475569', textAlign: 'center' }}>إجراء وتعديل</th>
              </tr>
            </thead>
            <tbody>
              {sortedContracts.map((emp) => {
                const statusInfo = getRenewalStatusInfo(emp.employee_code);
                const isTerminated = emp.contract_type === 'إنهاء تعاقد';
                const daysLeft = getDaysRemaining(emp.contract_end_date);
                let remainingLabel = <span style={{ color: 'var(--muted)' }}>—</span>;
                if (daysLeft !== null) {
                  if (daysLeft < 0) remainingLabel = <span style={{ color: '#dc2626', fontWeight: 'bold' }}>منتهي ({Math.abs(daysLeft)} يوم)</span>;
                  else if (daysLeft <= 60) remainingLabel = <span style={{ color: '#ea580c', fontWeight: 'bold' }}>متبقي {daysLeft} يوم</span>;
                  else remainingLabel = <span style={{ color: '#15803d', fontWeight: 'bold' }}>متبقي {daysLeft} يوم</span>;
                }

                return (
                  <tr key={emp.employee_code} style={{ borderBottom: '1px solid #f1f5f9', background: isTerminated ? '#fef2f2' : selectedEmpCodes.includes(emp.employee_code) ? '#fefce8' : 'transparent' }}>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedEmpCodes.includes(emp.employee_code)} onChange={() => toggleSelection(emp.employee_code)} disabled={statusInfo.locked || isTerminated} style={{ cursor: statusInfo.locked || isTerminated ? 'not-allowed' : 'pointer' }} />
                    </td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#dc2626' }}>{emp.employee_code}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name}</td>
                    <td style={{ padding: '10px', color: 'var(--muted)' }}>{emp.department || '—'}</td>
                    <td style={{ padding: '10px', color: 'var(--muted)' }}>{emp.job_title || '—'}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: isTerminated ? '#dc2626' : '#2563eb' }}>{emp.contract_type || '—'}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace' }}>{emp.contract_end_date || '—'}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>{remainingLabel}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', fontSize: '10px' }}><span style={{ color: statusInfo.color }}>{statusInfo.text}</span></td>
                    
                    {/* ✏️ زرار التعديل بالقلم + زرار التجديد */}
                    <td style={{ padding: '10px', textAlign: 'center', display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button
                        onClick={() => openSingleRenewal(emp)}
                        disabled={statusInfo.locked || actionLoading || isTerminated}
                        style={{ background: statusInfo.locked || isTerminated ? '#e2e8f0' : '#0d9488', color: statusInfo.locked || isTerminated ? '#94a3b8' : '#fff', border: 0, padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: statusInfo.locked || actionLoading || isTerminated ? 'not-allowed' : 'pointer' }}
                      >
                        + طلب
                      </button>

                      <button
                        onClick={() => openQuickEdit(emp)}
                        title="تعديل العقد وتاريخ النهاية"
                        style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', padding: '5px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        ✏️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ✏️ نافذة التعديل السريع للعقد بالقلم */}
      {quickEditModal.isOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '480px', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>✏️ تعديل تاريخ ونوع العقد</h3>
              <button onClick={() => setQuickEditModal({ isOpen: false, startDate: '', endDate: '', type: 'محدد المدة' })} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <form onSubmit={handleSaveQuickEdit}>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px' }}>
                <div><strong>الموظف:</strong> {quickEditModal.emp?.employee_name}</div>
                <div style={{ marginTop: '4px' }}><strong>الكود:</strong> <span style={{ color: '#0d9488', fontWeight: 'bold' }}>{quickEditModal.emp?.employee_code}</span></div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>نوع العقد *</label>
                <select value={quickEditModal.type} onChange={(e) => setQuickEditModal({ ...quickEditModal, type: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', background: '#fff' }}>
                  <option value="دائم">دائم</option>
                  <option value="محدد المدة">محدد المدة</option>
                  <option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>تاريخ التعيين/البداية</label>
                  <input type="date" value={quickEditModal.startDate} onChange={(e) => setQuickEditModal({ ...quickEditModal, startDate: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>تاريخ نهاية العقد</label>
                  <input type="date" disabled={quickEditModal.type === 'دائم'} value={quickEditModal.type === 'دائم' ? '' : quickEditModal.endDate} onChange={(e) => setQuickEditModal({ ...quickEditModal, endDate: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace', opacity: quickEditModal.type === 'دائم' ? 0.5 : 1 }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setQuickEditModal({ isOpen: false, startDate: '', endDate: '', type: 'محدد المدة' })} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>
                  {actionLoading ? 'جاري الحفظ...' : 'حفظ التعديلات ✏️'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🌟 🆕 نافذة إنشاء عقد جديد (مع البحث الحي الفوري بالكود أو الاسم) */}
      {isNewContractModalOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '520px', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--navy-950)', fontWeight: '800' }}>📝 طلب إنشاء عقد جديد تماماً</h3>
              <button onClick={() => setIsNewContractModalOpen(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            
            <form onSubmit={handleCreateBrandNewContract}>
              
              {/* 🔍 حقل البحث الحي المطور عن الموظف */}
              <div style={{ marginBottom: '16px', position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>ابحث واختر الموظف (بالكود، الاسم، أو الإدارة) *</label>
                <input 
                  type="text"
                  placeholder="اكتب كود أو اسم الموظف هنا..."
                  value={newContractSearch}
                  onChange={(e) => {
                    setNewContractSearch(e.target.value);
                    setSelectedEmployeeCode('');
                    setSelectedEmpObject(null);
                  }}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                />

                {/* قائمة اقتراحات البحث الحي */}
                {newContractSearchResults.length > 0 && !selectedEmployeeCode && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto', zIndex: 100, boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
                    {newContractSearchResults.map((emp, i) => (
                      <div 
                        key={i}
                        onClick={() => {
                          setSelectedEmployeeCode(emp.employee_code);
                          setSelectedEmpObject(emp);
                          setNewContractSearch(`[${emp.employee_code}] ${emp.employee_name}`);
                        }}
                        style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '11.5px', transition: 'background 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <strong style={{ color: '#0d9488' }}>[{emp.employee_code}]</strong> {emp.employee_name} 
                        <span style={{ color: '#64748b', fontSize: '10.5px', marginRight: '6px' }}>({emp.department || 'بدون إدارة'}) - [{emp.contract_type || 'دائم'}]</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* الموظف المختار */}
                {selectedEmpObject && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 12px', borderRadius: '6px', marginTop: '6px', fontSize: '11.5px', color: '#16a34a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><strong>الموظف المحدّد:</strong> {selectedEmpObject.employee_name} ({selectedEmpObject.employee_code})</div>
                    <button type="button" onClick={() => { setSelectedEmployeeCode(''); setSelectedEmpObject(null); setNewContractSearch(''); }} style={{ background: 'transparent', border: 0, color: '#dc2626', cursor: 'pointer', fontWeight: 'bold' }}>تغيير ✕</button>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>نوع العقد الجديد *</label>
                <select value={newContractType} onChange={(e) => setNewContractType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }}>
                  <option value="محدد المدة">محدد المدة</option>
                  <option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                  <option value="مهمة/مشروع">عقد مشروع/مهمة محدودة</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div><label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>بداية العقد *</label><input type="date" required value={newContractStartDate} onChange={(e) => setNewContractStartDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} /></div>
                <div><label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>نهاية العقد *</label><input type="date" required value={newContractEndDate} onChange={(e) => setNewContractEndDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsNewContractModalOpen(false)} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading || !selectedEmployeeCode} style={{ background: 'var(--navy-950)', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: (actionLoading || !selectedEmployeeCode) ? 'not-allowed' : 'pointer', opacity: (actionLoading || !selectedEmployeeCode) ? 0.6 : 1 }}>{actionLoading ? 'جاري الحفظ...' : 'إنشاء وتحديث العقد 📄'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة طلب التجديد */}
      {modalState.isOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ width: '500px', background: '#fff', borderRadius: '16px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', direction: 'rtl' }}>
            
            <h3 style={{ margin: '0 0 20px', fontSize: '16px', color: '#334155', textAlign: 'center', fontWeight: '800' }}>
              {modalState.type === 'single' ? `إنشاء طلب تجديد لـ (${modalState.emp?.employee_name})` : `إنشاء طلبات تجديد لـ (${selectedEmpCodes.length}) موظف`}
            </h3>

            <div style={{ background: '#fdfbf7', border: '1px solid #f1e9d2', borderRadius: '12px', padding: '12px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold', color: renewalMode === 'months' ? '#856404' : '#64748b', cursor: 'pointer' }}>
                <input type="radio" name="renewalMode" checked={renewalMode === 'months'} onChange={() => setRenewalMode('months')} style={{ accentColor: '#0d9488' }} />
                تجديد بالشهور (تلقائي)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold', color: renewalMode === 'custom' ? '#856404' : '#64748b', cursor: 'pointer' }}>
                <input type="radio" name="renewalMode" checked={renewalMode === 'custom'} onChange={() => setRenewalMode('custom')} style={{ accentColor: '#0d9488' }} />
                تاريخ انتهاء مخصص
              </label>
            </div>

            {renewalMode === 'months' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>يرجى اختيار مدة التجديد بالشهور:</label>
                <select value={renewalMonths} onChange={(e) => setRenewalMonths(Number(e.target.value))} style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', background: '#fff' }}>
                  <option value={1}>شهر واحد (1 شهر)</option>
                  <option value={2}>شهران (2 شهر)</option>
                  <option value={3}>3 شهور (ربع سنوي)</option>
                  <option value={6}>6 شهور (نصف سنوي)</option>
                  <option value={9}>9 شهور</option>
                  <option value={12}>12 شهر (سنة كاملة)</option>
                  <option value={24}>24 شهر (سنتين)</option>
                  <option value={36}>36 شهر (3 سنوات)</option>
                </select>
              </div>
            )}

            {renewalMode === 'custom' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>حدد تاريخ انتهاء العقد الجديد يدوياً:</label>
                <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} />
              </div>
            )}

            {modalState.type === 'single' && (
              <div style={{ textAlign: 'left', fontSize: '12px', marginBottom: '24px', direction: 'ltr' }}>
                <span style={{ color: '#15803d', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '13px' }}>
                  {renewalMode === 'months' ? calculateNewEndDate(modalState.emp?.contract_end_date, renewalMonths) : (customEndDate || '—')}
                </span>
                <span style={{ color: '#64748b', fontWeight: 'bold', marginLeft: '6px' }}>:تاريخ الانتهاء المتوقع</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '10px', direction: 'rtl' }}>
              <button 
                onClick={confirmRenewalAction} 
                disabled={actionLoading} 
                style={{ background: '#0d9488', color: '#fff', border: 0, padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                ✅ {actionLoading ? 'جاري التنفيذ...' : 'تأكيد وإجراء الطلب'}
              </button>
              <button 
                onClick={() => setModalState({ isOpen: false, type: 'single' })} 
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
              >
                إلغاء
              </button>
            </div>

          </div>
        </div>
      )}

      {/* نافذة إنهاء التعاقد */}
      {isTerminateModalOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '450px', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#dc2626', fontWeight: '800' }}>❌ إنهاء تعاقد موظف</h3>
              <button onClick={() => setIsTerminateModalOpen(false)} style={{ background: '#f1f5f9', border: 0, color: '#475569', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleTerminateContract}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>اختر الموظف المراد إنهاء تعاقده *</label>
                <select required value={terminateEmployeeCode} onChange={(e) => setTerminateEmployeeCode(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }}>
                  <option value="">-- اضغط لاختيار الموظف --</option>
                  {employees.filter(emp => emp.contract_type !== 'إنهاء تعاقد').map((emp) => (
                    <option key={emp.employee_code} value={emp.employee_code}>{emp.employee_name} ({emp.employee_code}) - {emp.department}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsTerminateModalOpen(false)} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري التنفيذ...' : 'تأكيد الإنهاء'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة الـ PDF للطباعة */}
      {createdRequestData && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '750px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#15803d' }}>🎉 تم إنشاء العقد بنجاح!</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handlePrintPDF} style={{ background: '#15803d', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>🖨️ طباعة / حفظ كـ PDF</button>
                <button onClick={() => setCreatedRequestData(null)} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إغلاق</button>
              </div>
            </div>
            <div id="pdf-print-area" style={{ border: '2px solid #0f172a', padding: '30px', borderRadius: '8px', background: '#fff', direction: 'rtl', fontFamily: 'serif' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0d9488', paddingBottom: '16px', marginBottom: '20px' }}>
                <div><h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900' }}>مجموعة شركات المراسم الدولية</h2><p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>قطاع الموارد البشرية والشؤون الإدارية</p></div>
                <div style={{ textAlign: 'left', fontSize: '11px', fontFamily: 'monospace' }}><div>رقم العقد/الطلب: <strong>{createdRequestData.request_id}</strong></div><div>التاريخ: <strong>{createdRequestData.request_date}</strong></div></div>
              </div>
              <div style={{ textAlign: 'center', margin: '20px 0' }}><h3 style={{ margin: 0, fontSize: '18px', textDecoration: 'underline', color: '#0f172a' }}>نموذج عقد عمل محدد المدة</h3></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px', lineHeight: '2.2', marginBottom: '24px' }}>
                <div>اسم الموظف: <strong>{createdRequestData.employee_name}</strong></div>
                <div>كود الموظف: <strong style={{ fontFamily: 'monospace' }}>{createdRequestData.employee_code}</strong></div>
                <div>الإدارة / القسم: <strong>{createdRequestData.department || '—'}</strong></div>
                <div>المسمى الوظيفي: <strong>{createdRequestData.job_title || '—'}</strong></div>
                <div>تاريخ بداية العقد: <strong style={{ fontFamily: 'monospace' }}>{createdRequestData.contract_end_date}</strong></div>
                <div>تاريخ نهاية العقد: <strong style={{ fontFamily: 'monospace' }}>{createdRequestData.new_contract_end_date}</strong></div>
              </div>
              <div style={{ background: '#f8fafc', padding: '12px', borderRight: '4px solid #0d9488', fontSize: '12px', marginBottom: '30px' }}><strong>القرار والتعهد:</strong> يتعهد الطرفان بالالتزام بكافة بنود لائحة العمل الداخلية المعتمدة بالشركة، ويسري هذا العقد اعتباراً من تاريخ البداية وحتى تاريخ النهاية الموضحين أعلاه.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginTop: '50px', textAlign: 'center', fontSize: '12px' }}>
                <div><div style={{ fontWeight: 'bold', marginBottom: '40px' }}>توقيع الموظف</div><div>التوقيع: .....................</div></div>
                <div><div style={{ fontWeight: 'bold', marginBottom: '40px' }}>مراجعة الموارد البشرية</div><div>التوقيع: .....................</div></div>
                <div><div style={{ fontWeight: 'bold', marginBottom: '40px' }}>اعتماد إدارة الشركة</div><div>التوقيع: .....................</div></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
