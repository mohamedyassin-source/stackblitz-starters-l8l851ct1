'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
// 🌟 1. استدعاء الـ DataContext
import { useAppData } from '@/lib/DataContext';

export default function ContractsPage() {
  // 🌟 2. استخراج دالة التحديث المركزية
  const { refresh: refreshGlobalData } = useAppData();

  const [employees, setEmployees] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [expiryMonth, setExpiryMonth] = useState(''); // فلتر شهر وسنة الانتهاء
  
  // فلتر الكروت العلوية (Active Card)
  const [activeFilterCard, setActiveFilterCard] = useState<'all' | 'fixed' | 'overage' | 'expiring' | 'expired'>('all');

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

  // حالات نافذة إنشاء عقد جديد
  const [isNewContractModalOpen, setIsNewContractModalOpen] = useState(false);
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState('');
  const [newContractStartDate, setNewContractStartDate] = useState('');
  const [newContractEndDate, setNewContractEndDate] = useState('');
  const [newContractType, setNewContractType] = useState('محدد المدة');
  const [empSearchTerm, setEmpSearchTerm] = useState(''); 
  const [showEmpDropdown, setShowEmpDropdown] = useState(false); 

  // حالات نافذة إنهاء التعاقد المحدثة
  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);
  const [terminateEmployeeCode, setTerminateEmployeeCode] = useState('');
  const [termSearchTerm, setTermSearchTerm] = useState(''); 
  const [terminateDate, setTerminateDate] = useState('');

  // حالات نافذة التعديل المباشر للعقد
  const [editModal, setEditModal] = useState<{ isOpen: boolean; emp?: any }>({ isOpen: false });
  const [editContractType, setEditContractType] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  // حالة نموذج الـ PDF
  const [createdRequestData, setCreatedRequestData] = useState<any>(null);

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
      const { data, error } = await supabase.from('renewal_requests').select('employee_code, status, signature_status, request_id').range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      allRens = [...allRens, ...data];
      if (data.length < step) break;
      from += step;
    }

    setEmployees(allEmps);
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
    if (latest.status === 'Pending') return { text: 'قيد المعالجة', color: 'var(--stamp-blue)', locked: true };
    if (latest.status === 'Approved' && latest.signature_status !== 'تم التوقيع') return { text: 'في انتظار التوقيع', color: 'var(--stamp-amber)', locked: true };
    if (latest.status === 'Approved' && latest.signature_status === 'تم التوقيع') return { text: 'تم توقيع العقد ✅', color: 'var(--stamp-green)', locked: false };
    if (latest.status === 'Rejected') return { text: 'الطلب الأخير مرفوض ❌', color: 'var(--stamp-red)', locked: false };
    return { text: 'متاح للتجديد', color: 'var(--muted)', locked: false };
  };

  const deptsList = Array.from(new Set(employees.map((e) => e.department).filter(Boolean)));
  const typesList = Array.from(new Set(employees.map((e) => e.contract_type).filter(Boolean)));

  const filteredContracts = employees.filter((emp) => {
    const term = searchTerm.toLowerCase();
    const days = getDaysRemaining(emp.contract_end_date);
    
    // الفلاتر العادية
    const matchesSearch = !term || String(emp.employee_code).toLowerCase().includes(term) || String(emp.employee_name).toLowerCase().includes(term) || String(emp.department).toLowerCase().includes(term);
    const matchesDept = !selectedDept || emp.department === selectedDept;
    const matchesType = !selectedType || emp.contract_type === selectedType;
    
    // فلتر شهر الانتهاء الدقيق (مثل: أكتوبر 2026)
    let matchesExpiryMonth = true;
    if (expiryMonth) {
      matchesExpiryMonth = emp.contract_end_date && emp.contract_end_date.startsWith(expiryMonth);
    }

    // فلاتر الكروت التفاعلية
    let matchesCard = true;
    if (activeFilterCard === 'fixed') matchesCard = emp.contract_type?.includes('محدد');
    if (activeFilterCard === 'overage') matchesCard = emp.contract_type?.includes('فوق السن');
    if (activeFilterCard === 'expiring') matchesCard = days !== null && days <= 60 && days >= 0;
    if (activeFilterCard === 'expired') matchesCard = days !== null && days < 0;

    return matchesSearch && matchesDept && matchesType && matchesExpiryMonth && matchesCard;
  });

  const sortedContracts = [...filteredContracts].sort((a, b) => {
    const daysA = getDaysRemaining(a.contract_end_date);
    const daysB = getDaysRemaining(b.contract_end_date);
    if (daysA === null) return 1;
    if (daysB === null) return -1;
    return daysA - daysB;
  });

  // إحصائيات الكروت العلوية (استبعاد المنهي تعاقدهم للأرقام الدقيقة)
  const activeEmployees = employees.filter(e => e.contract_type !== 'إنهاء تعاقد');
  const totalAll = activeEmployees.length;
  const totalFixedContracts = activeEmployees.filter(e => e.contract_type?.includes('محدد')).length;
  const overAgeContracts = activeEmployees.filter(e => e.contract_type?.includes('فوق السن')).length;
  const expiringSoonCount = activeEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d <= 60 && d >= 0; }).length;
  const expiredCount = activeEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d < 0; }).length;

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

  const openEditModal = (emp: any) => {
    setEditContractType(emp.contract_type || 'محدد المدة');
    setEditStartDate(emp.contract_start_date || '');
    setEditEndDate(emp.contract_end_date || '');
    setEditModal({ isOpen: true, emp });
  };

  const getEmpId = (emp: any) => {
    if (!emp) return '0';
    return emp.employee_id || emp.id || emp.emp_id || emp.employee_code || '0';
  };

  const handleTerminateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminateEmployeeCode) return alert('يرجى اختيار الموظف.');
    if (!terminateDate) return alert('يرجى التأكد من تاريخ الإنهاء.');
    const confirmTerm = window.confirm('هل أنت متأكد من إنهاء تعاقد هذا الموظف نهائياً؟');
    if (!confirmTerm) return;
    
    setActionLoading(true);
    const { error } = await supabase.from('employees').update({ 
      contract_type: 'إنهاء تعاقد', 
      status: 'Terminated',
      contract_end_date: terminateDate, 
      termination_date: terminateDate 
    }).eq('employee_code', terminateEmployeeCode);
    
    setActionLoading(false);
    if (error) alert('حدث خطأ أثناء إنهاء التعاقد: ' + error.message);
    else { 
      alert('تم إنهاء التعاقد بنجاح ✅'); 
      setIsTerminateModalOpen(false); 
      setTerminateEmployeeCode(''); 
      setTermSearchTerm('');
      setTerminateDate('');
      // 🌟 3. تحديث البيانات المركزية للداشبورد
      await refreshGlobalData();
      fetchData(); 
    }
  };

  const handleEditContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.emp) return;
    setActionLoading(true);

    const { error } = await supabase.from('employees').update({
      contract_type: editContractType,
      contract_start_date: editStartDate,
      contract_end_date: editEndDate
    }).eq('employee_code', editModal.emp.employee_code);

    setActionLoading(false);

    if (error) {
      alert('خطأ أثناء التعديل: ' + error.message);
    } else {
      alert('تم تعديل بيانات العقد بنجاح ✅');
      setEditModal({ isOpen: false });
      // 🌟 4. تحديث البيانات المركزية للداشبورد
      await refreshGlobalData();
      fetchData();
    }
  };

  const handleCreateBrandNewContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeCode) return alert('يرجى اختيار الموظف من القائمة.');
    if (!newContractStartDate || !newContractEndDate) return alert('يرجى استكمال تواريخ العقد.');
    if (new Date(newContractEndDate) <= new Date(newContractStartDate)) return alert('تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية.');
    
    setActionLoading(true);
    const emp = employees.find((e) => e.employee_code === selectedEmployeeCode);
    const [reqId] = generateSequentialIds(1);

    const payload: any = {
      request_id: reqId,
      employee_id: getEmpId(emp),
      employee_code: emp.employee_code,
      employee_name: emp.employee_name,
      department: emp.department,
      job_title: emp.job_title,
      company: emp.company,
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
      contract_start_date: newContractStartDate,
      contract_end_date: newContractEndDate 
    }).eq('employee_code', emp.employee_code);

    setActionLoading(false);
    setIsNewContractModalOpen(false);
    setCreatedRequestData(payload);
    alert(`تم إنشاء العقد الجديد بنجاح وتحويل نوع العقد إلى (${newContractType}) ✅`);
    // 🌟 5. تحديث البيانات المركزية للداشبورد
    await refreshGlobalData();
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
      if (error) alert('خطأ: ' + error.message); else { 
        setCreatedRequestData(payload); 
        // 🌟 6. تحديث البيانات المركزية للداشبورد
        await refreshGlobalData();
        fetchData(); 
      }
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
      if (error) alert('خطأ: ' + error.message); else { 
        alert('تم إنشاء طلبات التجديد المجمعة بنجاح!'); 
        setSelectedEmpCodes([]); 
        // 🌟 7. تحديث البيانات المركزية للداشبورد
        await refreshGlobalData();
        fetchData(); 
      }
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

        /* تنسيقات الكروت الجديدة */
        .stat-card {
          background: var(--paper-card);
          padding: 18px 20px;
          border-radius: 16px;
          border: 1px solid var(--line);
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: var(--shadow-card);
          position: relative;
          overflow: hidden;
        }
        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 20px -8px rgba(0,0,0,0.12);
          border-color: var(--muted);
        }
        
        /* تأثيرات الحالة النشطة (Active) */
        .stat-card.active-all { border: 2px solid var(--muted); background: var(--paper); }
        .stat-card.active-fixed { border: 2px solid var(--stamp-blue); background: var(--stamp-blue-bg); }
        .stat-card.active-overage { border: 2px solid var(--stamp-purple); background: var(--stamp-purple-bg); }
        .stat-card.active-expiring { border: 2px solid var(--stamp-amber); background: var(--stamp-amber-bg); }
        .stat-card.active-expired { border: 2px solid var(--stamp-red); background: var(--stamp-red-bg); }

        .icon-box {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
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
            onClick={() => { 
              setTerminateEmployeeCode(''); 
              setTermSearchTerm('');
              setTerminateDate('');
              setIsTerminateModalOpen(true); 
            }}
            style={{ background: 'var(--stamp-red)', color: '#fff', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ❌ إنهاء تعاقد
          </button>
          
          <button
            onClick={() => { 
              setSelectedEmployeeCode(''); 
              setEmpSearchTerm(''); 
              setShowEmpDropdown(false);
              setNewContractStartDate(new Date().toISOString().split('T')[0]); 
              setNewContractEndDate(''); 
              setIsNewContractModalOpen(true); 
            }}
            style={{ background: 'var(--paper-card)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
          >
            📄 طلب إنشاء عقد جديد تماماً
          </button>

          <button
            onClick={openBulkRenewal}
            disabled={selectedEmpCodes.length === 0}
            style={{ background: selectedEmpCodes.length > 0 ? '#b8934a' : '#e2e8f0', color: selectedEmpCodes.length > 0 ? '#fff' : '#94a3b8', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: selectedEmpCodes.length > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ⚙️ توليد طلبات للمحددين ({selectedEmpCodes.length})
          </button>
        </div>
      </div>

      {/* الكروت التفاعلية الجديدة المفلترة */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px', direction: 'rtl' }}>
        
        <div className={`stat-card ${activeFilterCard === 'all' ? 'active-all' : ''}`} onClick={() => setActiveFilterCard('all')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="icon-box" style={{ background: 'var(--paper)' }}>🌍</div>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: '800', color: 'var(--ink)' }}>إجمالي العقود</p>
              <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--muted)' }}>جميع الموظفين</p>
            </div>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--ink)' }}>{totalAll.toLocaleString()}</div>
        </div>

        <div className={`stat-card ${activeFilterCard === 'fixed' ? 'active-fixed' : ''}`} onClick={() => setActiveFilterCard('fixed')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="icon-box" style={{ background: 'var(--stamp-blue-bg)', color: 'var(--stamp-blue)' }}>📑</div>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: '800', color: 'var(--ink)' }}>العقود المحددة</p>
              <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--muted)' }}>محددة المدة</p>
            </div>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--stamp-blue)' }}>{totalFixedContracts.toLocaleString()}</div>
        </div>

        <div className={`stat-card ${activeFilterCard === 'overage' ? 'active-overage' : ''}`} onClick={() => setActiveFilterCard('overage')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="icon-box" style={{ background: 'var(--stamp-purple-bg)', color: 'var(--stamp-purple)' }}>🌟</div>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: '800', color: 'var(--ink)' }}>فوق السن</p>
              <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--muted)' }}>تجديد سنوي</p>
            </div>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--stamp-purple)' }}>{overAgeContracts.toLocaleString()}</div>
        </div>

        <div className={`stat-card ${activeFilterCard === 'expiring' ? 'active-expiring' : ''}`} onClick={() => setActiveFilterCard('expiring')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="icon-box" style={{ background: 'var(--stamp-amber-bg)', color: 'var(--stamp-amber)' }}>⏳</div>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: '800', color: 'var(--ink)' }}>ينتهي قريباً</p>
              <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--muted)' }}>خلال 60 يوم</p>
            </div>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--stamp-amber)' }}>{expiringSoonCount.toLocaleString()}</div>
        </div>

        <div className={`stat-card ${activeFilterCard === 'expired' ? 'active-expired' : ''}`} onClick={() => setActiveFilterCard('expired')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="icon-box" style={{ background: 'var(--stamp-red-bg)', color: 'var(--stamp-red)' }}>🚨</div>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: '800', color: 'var(--ink)' }}>منتهي المدة</p>
              <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--muted)' }}>يحتاج تسوية</p>
            </div>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--stamp-red)' }}>{expiredCount.toLocaleString()}</div>
        </div>

      </div>

      {/* شريط الفلاتر (RTL) */}
      <div className="no-print" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '12px', borderRadius: '10px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', direction: 'rtl' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="بحث بالاسم، الكود، الإدارة..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', width: '200px' }} 
          />
          <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', width: '130px' }}>
            <option value="">الإدارة (الكل)</option>
            {deptsList.map((d: any, i) => (<option key={i} value={d}>{d}</option>))}
          </select>
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none' }}>
            <option value="">كل أنواع العقود</option>
            {typesList.map((t: any, i) => (<option key={i} value={t}>{t}</option>))}
          </select>

          {/* 🌟 فلتر شهر الانتهاء الجديد المطور */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)', marginLeft: '6px' }}>شهر الانتهاء:</span>
            <input 
              type="month" 
              value={expiryMonth} 
              onChange={e => setExpiryMonth(e.target.value)} 
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} 
            />
          </div>

          <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedType(''); setExpiryMonth(''); setActiveFilterCard('all'); }} style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '8px 16px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
            إعادة ضبط
          </button>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)' }}>
          النتائج: {sortedContracts.length} عقد
        </div>
      </div>

      {/* الجدول */}
      <div className="no-print table-responsive" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', borderRadius: '10px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)' }}>جاري سحب البيانات...</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedEmpCodes.length > 0 && selectedEmpCodes.length === sortedContracts.length} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                </th>
                <th style={{ padding: '12px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الكود</th>
                <th style={{ padding: '12px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الموظف</th>
                <th style={{ padding: '12px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الإدارة</th>
                <th style={{ padding: '12px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الوظيفة</th>
                <th style={{ padding: '12px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>النوع</th>
                <th style={{ padding: '12px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الانتهاء</th>
                <th style={{ padding: '12px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', textAlign: 'center' }}>المتبقي</th>
                <th style={{ padding: '12px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>حالة التجديد</th>
                <th style={{ padding: '12px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', textAlign: 'center' }}>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {sortedContracts.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>لا توجد عقود مطابقة.</td></tr>
              ) : sortedContracts.map((emp) => {
                const statusInfo = getRenewalStatusInfo(emp.employee_code);
                const isTerminated = emp.contract_type === 'إنهاء تعاقد';
                const daysLeft = getDaysRemaining(emp.contract_end_date);
                let remainingLabel = <span style={{ color: 'var(--muted)' }}>—</span>;
                if (daysLeft !== null) {
                  if (daysLeft < 0) remainingLabel = <span style={{ color: 'var(--stamp-red)', fontWeight: 'bold' }}>منتهي ({Math.abs(daysLeft)} يوم)</span>;
                  else if (daysLeft <= 60) remainingLabel = <span style={{ color: 'var(--stamp-amber)', fontWeight: 'bold' }}>متبقي {daysLeft} يوم</span>;
                  else remainingLabel = <span style={{ color: 'var(--stamp-green)', fontWeight: 'bold' }}>متبقي {daysLeft} يوم</span>;
                }

                return (
                  <tr key={emp.employee_code} style={{ borderBottom: '1px solid #f1f5f9', background: isTerminated ? '#fef2f2' : selectedEmpCodes.includes(emp.employee_code) ? '#fefce8' : 'transparent' }}>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedEmpCodes.includes(emp.employee_code)} onChange={() => toggleSelection(emp.employee_code)} disabled={statusInfo.locked || isTerminated} style={{ cursor: statusInfo.locked || isTerminated ? 'not-allowed' : 'pointer' }} />
                    </td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--stamp-red)' }}>{emp.employee_code}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--ink)' }}>{emp.employee_name}</td>
                    <td style={{ padding: '10px', color: 'var(--muted)' }}>{emp.department || '—'}</td>
                    <td style={{ padding: '10px', color: 'var(--muted)' }}>{emp.job_title || '—'}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: isTerminated ? '#dc2626' : '#2563eb' }}>{emp.contract_type || '—'}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace' }}>{emp.contract_end_date || '—'}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>{remainingLabel}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', fontSize: '10px' }}><span style={{ color: statusInfo.color }}>{statusInfo.text}</span></td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button
                          onClick={() => openSingleRenewal(emp)}
                          disabled={statusInfo.locked || actionLoading || isTerminated}
                          style={{ background: statusInfo.locked || isTerminated ? '#e2e8f0' : '#b8934a', color: statusInfo.locked || isTerminated ? '#94a3b8' : '#fff', border: 0, padding: '6px 12px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: statusInfo.locked || actionLoading || isTerminated ? 'not-allowed' : 'pointer' }}
                        >
                          + إنشاء طلب
                        </button>
                        <button
                          onClick={() => openEditModal(emp)}
                          disabled={actionLoading || isTerminated}
                          style={{ background: isTerminated ? '#e2e8f0' : '#3b82f6', color: isTerminated ? '#94a3b8' : '#fff', border: 0, padding: '6px 12px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: actionLoading || isTerminated ? 'not-allowed' : 'pointer' }}
                        >
                          ✏️ تعديل
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 🌟 نافذة إنهاء التعاقد המحدثة بالبحث التلقائي وسحب التاريخ */}
      {isTerminateModalOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '450px', background: 'var(--paper-card)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--stamp-red)', fontWeight: '800' }}>❌ إنهاء تعاقد موظف</h3>
              <button onClick={() => setIsTerminateModalOpen(false)} style={{ background: 'var(--paper)', border: 0, color: 'var(--muted)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            
            <form onSubmit={handleTerminateContract}>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>
                  البحث عن الموظف (بالكود أو الاسم) *
                </label>
                <input
                  type="text"
                  list="term-employees-list"
                  required
                  placeholder="🔍 اكتب كود أو اسم الموظف..."
                  value={termSearchTerm}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTermSearchTerm(val);
                    const code = val.split(' - ')[0];
                    const emp = employees.find(e => e.employee_code === code && e.contract_type !== 'إنهاء تعاقد');
                    if (emp) {
                      setTerminateEmployeeCode(code);
                      setTerminateDate(emp.contract_end_date || new Date().toISOString().split('T')[0]);
                    } else {
                      setTerminateEmployeeCode('');
                      setTerminateDate('');
                    }
                  }}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', background: 'var(--paper)' }}
                />
                <datalist id="term-employees-list">
                  {employees.filter(emp => emp.contract_type !== 'إنهاء تعاقد').map((emp) => (
                    <option key={emp.employee_code} value={`${emp.employee_code} - ${emp.employee_name}`} />
                  ))}
                </datalist>
                
                {terminateEmployeeCode && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--stamp-red)', fontWeight: 'bold', background: 'var(--stamp-red-bg)', padding: '8px', borderRadius: '6px', border: '1px solid var(--stamp-red-bg)' }}>
                    ⚠️ سيتم إنهاء تعاقد الموظف المختار نهائياً.
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>
                  تاريخ الإنهاء الفعلي (تلقائي من العقد) *
                </label>
                <input 
                  type="date" 
                  required 
                  value={terminateDate} 
                  onChange={e => setTerminateDate(e.target.value)} 
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsTerminateModalOpen(false)} style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading || !terminateEmployeeCode} style={{ background: 'var(--stamp-red)', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: (actionLoading || !terminateEmployeeCode) ? 'not-allowed' : 'pointer' }}>
                  {actionLoading ? 'جاري التنفيذ...' : 'تأكيد الإنهاء'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة إنشاء عقد جديد مع خاصية البحث */}
      {isNewContractModalOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '520px', background: 'var(--paper-card)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--navy-950)', fontWeight: '800' }}>📝 طلب إنشاء عقد جديد تماماً</h3>
              <button onClick={() => setIsNewContractModalOpen(false)} style={{ background: 'var(--stamp-red-bg)', border: 0, color: 'var(--stamp-red)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleCreateBrandNewContract}>
              
              <div style={{ marginBottom: '16px', position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>
                  اختر الموظف (ابحث بالاسم أو الكود) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="اكتب اسم الموظف أو الكود..."
                  value={empSearchTerm}
                  onChange={(e) => {
                    setEmpSearchTerm(e.target.value);
                    setSelectedEmployeeCode('');
                    setShowEmpDropdown(true);
                  }}
                  onFocus={() => setShowEmpDropdown(true)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', background: 'var(--paper)' }}
                />

                {showEmpDropdown && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowEmpDropdown(false)} />
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--paper-card)', border: '1px solid var(--line)', borderRadius: '8px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto', zIndex: 10, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                      {(() => {
                        const filteredEmps = employees
                          .filter(emp => emp.contract_type !== 'إنهاء تعاقد')
                          .filter(emp => 
                            (emp.employee_name || '').toLowerCase().includes((empSearchTerm || '').toLowerCase()) || 
                            String(emp.employee_code || '').toLowerCase().includes((empSearchTerm || '').toLowerCase())
                          );

                        return (
                          <>
                            {filteredEmps.map((emp) => (
                              <div
                                key={emp.employee_code}
                                onClick={() => {
                                  setSelectedEmployeeCode(emp.employee_code);
                                  setEmpSearchTerm(`${emp.employee_name} (${emp.employee_code})`);
                                  setShowEmpDropdown(false);
                                }}
                                style={{ padding: '10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontWeight: 'bold', color: 'var(--navy-950)' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                              >
                                {emp.employee_name} ({emp.employee_code}) - [{emp.contract_type || 'دائم'}]
                              </div>
                            ))}
                            {filteredEmps.length === 0 && (
                              <div style={{ padding: '12px', fontSize: '12px', color: 'var(--muted)', textAlign: 'center' }}>
                                لا توجد نتائج مطابقة 🔍
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>نوع العقد الجديد *</label>
                <select value={newContractType} onChange={(e) => setNewContractType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', background: 'var(--paper)' }}>
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
                <button type="button" onClick={() => setIsNewContractModalOpen(false)} style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading} style={{ background: 'var(--brass-600)', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري الحفظ...' : 'إنشاء وتحديث العقد 📄'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة طلب التجديد */}
      {modalState.isOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ width: '500px', background: 'var(--paper-card)', borderRadius: '16px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', direction: 'rtl' }}>
            
            <h3 style={{ margin: '0 0 20px', fontSize: '16px', color: 'var(--ink)', textAlign: 'center', fontWeight: '800' }}>
              {modalState.type === 'single' ? `إنشاء طلب تجديد لـ (${modalState.emp?.employee_name})` : `إنشاء طلبات تجديد لـ (${selectedEmpCodes.length}) موظف`}
            </h3>

            <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '12px', padding: '12px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold', color: renewalMode === 'months' ? '#856404' : '#64748b', cursor: 'pointer' }}>
                <input type="radio" name="renewalMode" checked={renewalMode === 'months'} onChange={() => setRenewalMode('months')} style={{ accentColor: '#b8934a' }} />
                تجديد بالشهور (تلقائي)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold', color: renewalMode === 'custom' ? '#856404' : '#64748b', cursor: 'pointer' }}>
                <input type="radio" name="renewalMode" checked={renewalMode === 'custom'} onChange={() => setRenewalMode('custom')} style={{ accentColor: '#b8934a' }} />
                تاريخ انتهاء مخصص
              </label>
            </div>

            {renewalMode === 'months' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>يرجى اختيار مدة التجديد بالشهور:</label>
                <select value={renewalMonths} onChange={(e) => setRenewalMonths(Number(e.target.value))} style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', background: 'var(--paper-card)' }}>
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
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>حدد تاريخ انتهاء العقد الجديد يدوياً:</label>
                <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} />
              </div>
            )}

            {modalState.type === 'single' && (
              <div style={{ textAlign: 'left', fontSize: '12px', marginBottom: '24px', direction: 'ltr' }}>
                <span style={{ color: 'var(--stamp-green)', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '13px' }}>
                  {renewalMode === 'months' ? calculateNewEndDate(modalState.emp?.contract_end_date, renewalMonths) : (customEndDate || '—')}
                </span>
                <span style={{ color: 'var(--muted)', fontWeight: 'bold', marginLeft: '6px' }}>:تاريخ الانتهاء المتوقع</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '10px', direction: 'rtl' }}>
              <button 
                onClick={confirmRenewalAction} 
                disabled={actionLoading} 
                style={{ background: 'var(--brass-600)', color: '#fff', border: 0, padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                ✅ {actionLoading ? 'جاري التنفيذ...' : 'تأكيد وإجراء الطلب'}
              </button>
              <button 
                onClick={() => setModalState({ isOpen: false, type: 'single' })} 
                style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--muted)', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
              >
                إلغاء
              </button>
            </div>

          </div>
        </div>
      )}

      {/* نافذة التعديل المباشرة */}
      {editModal.isOpen && editModal.emp && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '450px', background: 'var(--paper-card)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--stamp-blue)', fontWeight: '800' }}>✏️ تعديل بيانات العقد</h3>
              <button onClick={() => setEditModal({ isOpen: false })} style={{ background: 'var(--paper)', border: 0, color: 'var(--muted)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            
            <div style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--muted)', background: 'var(--paper)', padding: '10px', borderRadius: '8px' }}>
              تعديل بيانات الموظف: <strong style={{ color: 'var(--ink)' }}>{editModal.emp.employee_name} ({editModal.emp.employee_code})</strong>
            </div>

            <form onSubmit={handleEditContract}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>نوع العقد *</label>
                <select value={editContractType} onChange={(e) => setEditContractType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', background: 'var(--paper-card)' }}>
                  <option value="محدد المدة">محدد المدة</option>
                  <option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                  <option value="مهمة/مشروع">عقد مشروع/مهمة محدودة</option>
                  <option value="دائم">دائم (غير محدد المدة)</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>تاريخ بداية العقد</label>
                  <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>تاريخ نهاية العقد</label>
                  <input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setEditModal({ isOpen: false })} style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading} style={{ background: 'var(--stamp-blue)', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
