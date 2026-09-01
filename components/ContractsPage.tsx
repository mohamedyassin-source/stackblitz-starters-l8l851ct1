'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';

export default function ContractsPage() {
  const { refresh: refreshGlobalData } = useAppData();

  const [employees, setEmployees] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  
  // فلتر الكروت العلوية
  const [activeFilterCard, setActiveFilterCard] = useState<'all' | 'fixed' | 'overage' | 'expiring' | 'expired'>('all');

  // التحديد المجمع
  const [selectedEmpCodes, setSelectedEmpCodes] = useState<string[]>([]);

  // النوافذ
  const [modalState, setModalState] = useState<{ isOpen: boolean; type: 'single' | 'bulk'; emp?: any }>({ isOpen: false, type: 'single' });
  const [renewalMode, setRenewalMode] = useState<'months' | 'custom'>('months');
  const [renewalMonths, setRenewalMonths] = useState<number>(12);
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const [isNewContractModalOpen, setIsNewContractModalOpen] = useState(false);
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState('');
  const [newContractStartDate, setNewContractStartDate] = useState('');
  const [newContractEndDate, setNewContractEndDate] = useState('');
  const [newContractType, setNewContractType] = useState('محدد المدة');
  const [empSearchTerm, setEmpSearchTerm] = useState(''); 
  const [showEmpDropdown, setShowEmpDropdown] = useState(false); 

  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);
  const [terminateEmployeeCode, setTerminateEmployeeCode] = useState('');
  const [termSearchTerm, setTermSearchTerm] = useState(''); 
  const [terminateDate, setTerminateDate] = useState('');

  const [editModal, setEditModal] = useState<{ isOpen: boolean; emp?: any }>({ isOpen: false });
  const [editContractType, setEditContractType] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

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
    if (!latest) return { text: 'متاح للتجديد', colorClass: 'text-muted', locked: false };
    if (latest.status === 'Pending') return { text: 'قيد المعالجة', colorClass: 'text-blue-500', locked: true };
    if (latest.status === 'Approved' && latest.signature_status !== 'تم التوقيع') return { text: 'في انتظار التوقيع', colorClass: 'text-[var(--warning-text)]', locked: true };
    if (latest.status === 'Approved' && latest.signature_status === 'تم التوقيع') return { text: 'تم توقيع العقد ✅', colorClass: 'text-[var(--success-text)]', locked: false };
    if (latest.status === 'Rejected') return { text: 'الطلب الأخير مرفوض ❌', colorClass: 'text-[var(--danger-text)]', locked: false };
    return { text: 'متاح للتجديد', colorClass: 'text-muted', locked: false };
  };

  const deptsList = Array.from(new Set(employees.map((e) => e.department).filter(Boolean)));
  const typesList = Array.from(new Set(employees.map((e) => e.contract_type).filter(Boolean)));

  const filteredContracts = employees.filter((emp) => {
    const term = searchTerm.toLowerCase();
    const days = getDaysRemaining(emp.contract_end_date);
    
    const matchesSearch = !term || String(emp.employee_code).toLowerCase().includes(term) || String(emp.employee_name).toLowerCase().includes(term) || String(emp.department).toLowerCase().includes(term);
    const matchesDept = !selectedDept || emp.department === selectedDept;
    const matchesType = !selectedType || emp.contract_type === selectedType;
    let matchesExpiryMonth = true;
    if (expiryMonth) matchesExpiryMonth = emp.contract_end_date && emp.contract_end_date.startsWith(expiryMonth);

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

  const activeEmployees = employees.filter(e => e.contract_type !== 'إنهاء تعاقد');
  const totalAll = activeEmployees.length;
  const totalFixedContracts = activeEmployees.filter(e => e.contract_type?.includes('محدد')).length;
  const overAgeContracts = activeEmployees.filter(e => e.contract_type?.includes('فوق السن')).length;
  const expiringSoonCount = activeEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d <= 60 && d >= 0; }).length;
  const expiredCount = activeEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d < 0; }).length;

  const toggleSelection = (code: string) => setSelectedEmpCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  const toggleAll = () => {
    if (selectedEmpCodes.length === sortedContracts.length) setSelectedEmpCodes([]);
    else setSelectedEmpCodes(sortedContracts.map(e => e.employee_code));
  };

  const openSingleRenewal = (emp: any) => { setRenewalMode('months'); setRenewalMonths(12); setCustomEndDate(''); setModalState({ isOpen: true, type: 'single', emp }); };
  const openBulkRenewal = () => { if (selectedEmpCodes.length === 0) return alert('يرجى تحديد موظفين أولاً'); setRenewalMode('months'); setRenewalMonths(12); setCustomEndDate(''); setModalState({ isOpen: true, type: 'bulk' }); };
  const openEditModal = (emp: any) => { setEditContractType(emp.contract_type || 'محدد المدة'); setEditStartDate(emp.contract_start_date || ''); setEditEndDate(emp.contract_end_date || ''); setEditModal({ isOpen: true, emp }); };

  const getEmpId = (emp: any) => emp ? (emp.employee_id || emp.id || emp.emp_id || emp.employee_code || '0') : '0';

  const handleTerminateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminateEmployeeCode || !terminateDate) return alert('يرجى استكمال البيانات.');
    if (!window.confirm('هل أنت متأكد من إنهاء تعاقد هذا الموظف نهائياً؟')) return;
    
    setActionLoading(true);
    const { error } = await supabase.from('employees').update({ contract_type: 'إنهاء تعاقد', status: 'Terminated', contract_end_date: terminateDate, termination_date: terminateDate }).eq('employee_code', terminateEmployeeCode);
    
    setActionLoading(false);
    if (error) alert('خطأ: ' + error.message);
    else { alert('تم الإنهاء ✅'); setIsTerminateModalOpen(false); setTerminateEmployeeCode(''); setTermSearchTerm(''); setTerminateDate(''); await refreshGlobalData(); fetchData(); }
  };

  const handleEditContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.emp) return;
    setActionLoading(true);
    const { error } = await supabase.from('employees').update({ contract_type: editContractType, contract_start_date: editStartDate, contract_end_date: editEndDate }).eq('employee_code', editModal.emp.employee_code);
    setActionLoading(false);
    if (error) alert('خطأ: ' + error.message); else { alert('تم التعديل ✅'); setEditModal({ isOpen: false }); await refreshGlobalData(); fetchData(); }
  };

  const handleCreateBrandNewContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeCode || !newContractStartDate || !newContractEndDate) return alert('يرجى استكمال البيانات.');
    if (new Date(newContractEndDate) <= new Date(newContractStartDate)) return alert('تواريخ غير منطقية.');
    
    setActionLoading(true);
    const emp = employees.find((e) => e.employee_code === selectedEmployeeCode);
    const [reqId] = generateSequentialIds(1);
    const payload: any = { request_id: reqId, employee_id: getEmpId(emp), employee_code: emp.employee_code, employee_name: emp.employee_name, department: emp.department, job_title: emp.job_title, company: emp.company, contract_end_date: newContractStartDate, new_contract_end_date: newContractEndDate, status: 'Pending', signature_status: 'قيد التوقيع', request_date: new Date().toISOString().split('T')[0] };

    const { error: reqError } = await supabase.from('renewal_requests').insert([payload]);
    if (!reqError) await supabase.from('employees').update({ contract_type: newContractType, contract_start_date: newContractStartDate, contract_end_date: newContractEndDate }).eq('employee_code', emp.employee_code);
    
    setActionLoading(false); setIsNewContractModalOpen(false); alert(`تم الإنشاء ✅`); await refreshGlobalData(); fetchData();
  };

  const confirmRenewalAction = async () => {
    if (renewalMode === 'custom' && !customEndDate) return alert('يرجى إدخال تاريخ.');
    setActionLoading(true);

    if (modalState.type === 'single' && modalState.emp) {
      const emp = modalState.emp;
      const targetEndDate = renewalMode === 'months' ? calculateNewEndDate(emp.contract_end_date, renewalMonths) : customEndDate;
      const [reqId] = generateSequentialIds(1);
      const payload: any = { request_id: reqId, employee_id: getEmpId(emp), employee_code: emp.employee_code, employee_name: emp.employee_name, department: emp.department, job_title: emp.job_title, company: emp.company, contract_end_date: emp.contract_end_date, new_contract_end_date: targetEndDate, renewal_months: renewalMode === 'months' ? renewalMonths : null, status: 'Pending', signature_status: 'قيد التوقيع', request_date: new Date().toISOString().split('T')[0] };
      const { error } = await supabase.from('renewal_requests').insert([payload]);
      setActionLoading(false); setModalState({ isOpen: false, type: 'single' });
      if (error) alert('خطأ: ' + error.message); else { await refreshGlobalData(); fetchData(); }
    } else if (modalState.type === 'bulk') {
      const selectedEmps = employees.filter(e => selectedEmpCodes.includes(e.employee_code));
      const reqIds = generateSequentialIds(selectedEmps.length);
      const payloads = selectedEmps.map((emp, index) => {
        const targetEndDate = renewalMode === 'months' ? calculateNewEndDate(emp.contract_end_date, renewalMonths) : customEndDate;
        return { request_id: reqIds[index], employee_id: getEmpId(emp), employee_code: emp.employee_code, employee_name: emp.employee_name, department: emp.department, job_title: emp.job_title, company: emp.company, contract_end_date: emp.contract_end_date, new_contract_end_date: targetEndDate, renewal_months: renewalMode === 'months' ? renewalMonths : null, status: 'Pending', signature_status: 'قيد التوقيع', request_date: new Date().toISOString().split('T')[0] };
      });
      const { error } = await supabase.from('renewal_requests').insert(payloads);
      setActionLoading(false); setModalState({ isOpen: false, type: 'single' });
      if (error) alert('خطأ: ' + error.message); else { alert('تم الإنشاء المجمع ✅'); setSelectedEmpCodes([]); await refreshGlobalData(); fetchData(); }
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-10">
      
      {/* الهيدر والزراير العلوية */}
      <div className="executive-card flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 sm:p-6 no-print">
        <div>
          <h3 className="m-0 text-xl font-extrabold text-primary">العقود الحالية السارية</h3>
          <p className="mt-1 text-xs text-muted font-bold">أرشيف وسجل شامل لعقود الموظفين النشطين (الخطوة الأولى لإنشاء طلبات التجديد)</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => { setTerminateEmployeeCode(''); setTermSearchTerm(''); setTerminateDate(''); setIsTerminateModalOpen(true); }} className="bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)]/20 px-4 py-2.5 rounded-lg font-bold text-xs hover:opacity-80 transition-opacity">
            ❌ إنهاء تعاقد
          </button>
          <button onClick={() => { setSelectedEmployeeCode(''); setEmpSearchTerm(''); setShowEmpDropdown(false); setNewContractStartDate(new Date().toISOString().split('T')[0]); setNewContractEndDate(''); setIsNewContractModalOpen(true); }} className="bg-card text-primary border border-border px-4 py-2.5 rounded-lg font-bold text-xs hover:bg-background transition-colors">
            📄 طلب إنشاء عقد جديد تماماً
          </button>
          <button onClick={openBulkRenewal} disabled={selectedEmpCodes.length === 0} className={`px-4 py-2.5 rounded-lg font-bold text-xs transition-colors ${selectedEmpCodes.length > 0 ? 'bg-gold text-white hover:bg-gold-hover' : 'bg-background text-muted cursor-not-allowed border border-border'}`}>
            ⚙️ توليد طلبات للمحددين ({selectedEmpCodes.length})
          </button>
        </div>
      </div>

      {/* الكروت التفاعلية الجديدة */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 no-print">
        <div onClick={() => setActiveFilterCard('all')} className={`executive-card p-4 cursor-pointer border-2 transition-all ${activeFilterCard === 'all' ? 'border-primary bg-background' : 'border-transparent hover:border-border'}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl">🌍</div>
            <div>
              <p className="m-0 text-xs font-bold text-primary">إجمالي العقود</p>
              <p className="m-0 text-[10px] text-muted">جميع الموظفين</p>
            </div>
          </div>
          <div className="text-xl font-black text-primary">{totalAll.toLocaleString()}</div>
        </div>

        <div onClick={() => setActiveFilterCard('fixed')} className={`executive-card p-4 cursor-pointer border-2 transition-all ${activeFilterCard === 'fixed' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent hover:border-border'}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/50 flex items-center justify-center text-xl">📑</div>
            <div>
              <p className="m-0 text-xs font-bold text-primary">عقود محددة</p>
              <p className="m-0 text-[10px] text-muted">محددة المدة</p>
            </div>
          </div>
          <div className="text-xl font-black text-blue-600">{totalFixedContracts.toLocaleString()}</div>
        </div>

        <div onClick={() => setActiveFilterCard('overage')} className={`executive-card p-4 cursor-pointer border-2 transition-all ${activeFilterCard === 'overage' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-transparent hover:border-border'}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/50 flex items-center justify-center text-xl">🌟</div>
            <div>
              <p className="m-0 text-xs font-bold text-primary">فوق السن</p>
              <p className="m-0 text-[10px] text-muted">تجديد سنوي</p>
            </div>
          </div>
          <div className="text-xl font-black text-purple-600">{overAgeContracts.toLocaleString()}</div>
        </div>

        <div onClick={() => setActiveFilterCard('expiring')} className={`executive-card p-4 cursor-pointer border-2 transition-all ${activeFilterCard === 'expiring' ? 'border-[var(--warning-text)] bg-[var(--warning-bg)]' : 'border-transparent hover:border-border'}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[var(--warning-bg)] text-[var(--warning-text)] border border-[var(--warning-text)]/20 flex items-center justify-center text-xl">⏳</div>
            <div>
              <p className="m-0 text-xs font-bold text-primary">ينتهي قريباً</p>
              <p className="m-0 text-[10px] text-muted">خلال 60 يوم</p>
            </div>
          </div>
          <div className="text-xl font-black text-[var(--warning-text)]">{expiringSoonCount.toLocaleString()}</div>
        </div>

        <div onClick={() => setActiveFilterCard('expired')} className={`executive-card p-4 cursor-pointer border-2 transition-all ${activeFilterCard === 'expired' ? 'border-[var(--danger-text)] bg-[var(--danger-bg)]' : 'border-transparent hover:border-border'}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)]/20 flex items-center justify-center text-xl">🚨</div>
            <div>
              <p className="m-0 text-xs font-bold text-primary">منتهي المدة</p>
              <p className="m-0 text-[10px] text-muted">يحتاج تسوية</p>
            </div>
          </div>
          <div className="text-xl font-black text-[var(--danger-text)]">{expiredCount.toLocaleString()}</div>
        </div>
      </div>

      {/* شريط الفلاتر */}
      <div className="executive-card p-4 flex flex-wrap gap-3 items-center justify-between no-print">
        <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
          <input type="text" placeholder="بحث بالاسم، الكود، الإدارة..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-background border border-border text-primary text-xs font-bold rounded-lg px-4 py-2 outline-none focus:border-gold w-full sm:w-48" />
          <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} className="bg-background border border-border text-primary text-xs font-bold rounded-lg px-4 py-2 outline-none focus:border-gold w-full sm:w-32">
            <option value="">الإدارة (الكل)</option>
            {deptsList.map((d: any, i) => (<option key={i} value={d}>{d}</option>))}
          </select>
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="bg-background border border-border text-primary text-xs font-bold rounded-lg px-4 py-2 outline-none focus:border-gold w-full sm:w-32">
            <option value="">كل أنواع العقود</option>
            {typesList.map((t: any, i) => (<option key={i} value={t}>{t}</option>))}
          </select>
          <div className="flex items-center w-full sm:w-auto">
            <span className="text-xs font-bold text-muted ml-2">شهر الانتهاء:</span>
            <input type="month" value={expiryMonth} onChange={e => setExpiryMonth(e.target.value)} className="bg-background border border-border text-primary text-xs font-bold font-mono rounded-lg px-3 py-2 outline-none focus:border-gold" />
          </div>
          <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedType(''); setExpiryMonth(''); setActiveFilterCard('all'); }} className="bg-card border border-border text-primary px-4 py-2 rounded-lg font-bold text-xs hover:bg-background">إعادة ضبط</button>
        </div>
        <div className="text-xs font-bold text-muted w-full lg:w-auto text-left">
          النتائج: <span className="text-primary">{sortedContracts.length}</span> عقد
        </div>
      </div>

      {/* الجدول */}
      <div className="executive-card overflow-hidden no-print">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-xs font-bold text-muted">جاري سحب البيانات...</div>
          ) : (
            <table className="w-full text-right text-xs whitespace-nowrap executive-table">
              <thead>
                <tr>
                  <th className="text-center w-10"><input type="checkbox" checked={selectedEmpCodes.length > 0 && selectedEmpCodes.length === sortedContracts.length} onChange={toggleAll} className="cursor-pointer" /></th>
                  <th>الكود</th>
                  <th>الموظف</th>
                  <th>الإدارة</th>
                  <th>الوظيفة</th>
                  <th>النوع</th>
                  <th>الانتهاء</th>
                  <th className="text-center">المتبقي</th>
                  <th className="text-center">حالة التجديد</th>
                  <th className="text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {sortedContracts.length === 0 ? (
                  <tr><td colSpan={10} className="p-5 text-center text-muted">لا توجد عقود مطابقة.</td></tr>
                ) : sortedContracts.map((emp) => {
                  const statusInfo = getRenewalStatusInfo(emp.employee_code);
                  const isTerminated = emp.contract_type === 'إنهاء تعاقد';
                  const daysLeft = getDaysRemaining(emp.contract_end_date);
                  let remainingLabel = <span className="text-muted">—</span>;
                  if (daysLeft !== null) {
                    if (daysLeft < 0) remainingLabel = <span className="text-[var(--danger-text)] font-bold">منتهي ({Math.abs(daysLeft)} يوم)</span>;
                    else if (daysLeft <= 60) remainingLabel = <span className="text-[var(--warning-text)] font-bold">متبقي {daysLeft} يوم</span>;
                    else remainingLabel = <span className="text-[var(--success-text)] font-bold">متبقي {daysLeft} يوم</span>;
                  }

                  return (
                    <tr key={emp.employee_code} className={`${isTerminated ? 'bg-[var(--danger-bg)]/20' : selectedEmpCodes.includes(emp.employee_code) ? 'bg-gold/10' : ''}`}>
                      <td className="text-center p-3">
                        <input type="checkbox" checked={selectedEmpCodes.includes(emp.employee_code)} onChange={() => toggleSelection(emp.employee_code)} disabled={statusInfo.locked || isTerminated} className="cursor-pointer" />
                      </td>
                      <td className="font-mono font-bold text-gold">{emp.employee_code}</td>
                      <td className="font-bold text-primary">{emp.employee_name}</td>
                      <td className="text-muted">{emp.department || '—'}</td>
                      <td className="text-muted">{emp.job_title || '—'}</td>
                      <td className={`font-bold ${isTerminated ? 'text-[var(--danger-text)]' : 'text-primary'}`}>{emp.contract_type || '—'}</td>
                      <td className="font-mono font-bold text-primary">{emp.contract_end_date || '—'}</td>
                      <td className="text-center">{remainingLabel}</td>
                      <td className={`font-bold text-[10px] text-center ${statusInfo.colorClass}`}>{statusInfo.text}</td>
                      <td className="text-center p-3">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => openSingleRenewal(emp)} disabled={statusInfo.locked || actionLoading || isTerminated} className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-colors ${statusInfo.locked || isTerminated ? 'bg-background text-muted cursor-not-allowed' : 'bg-gold hover:bg-gold-hover text-white cursor-pointer'}`}>+ إنشاء طلب</button>
                          <button onClick={() => openEditModal(emp)} disabled={actionLoading || isTerminated} className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-colors border ${isTerminated ? 'bg-background text-muted border-transparent cursor-not-allowed' : 'bg-card text-primary border-border hover:bg-background cursor-pointer'}`}>✏️ تعديل</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* النوافذ المنبثقة */}
      
      {/* نافذة إنهاء التعاقد */}
      {isTerminateModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="w-full max-w-md bg-card rounded-2xl p-6 shadow-2xl border border-border">
            <div className="flex justify-between items-center border-b border-border pb-4 mb-5">
              <h3 className="m-0 text-base text-[var(--danger-text)] font-extrabold">❌ إنهاء تعاقد موظف</h3>
              <button onClick={() => setIsTerminateModalOpen(false)} className="bg-background text-muted px-3 py-1.5 rounded-md text-xs font-bold hover:text-primary">إغلاق ✕</button>
            </div>
            <form onSubmit={handleTerminateContract}>
              <div className="mb-4">
                <label className="block text-xs text-muted mb-2 font-bold">البحث عن الموظف (بالكود أو الاسم) *</label>
                <input type="text" list="term-emps" required placeholder="🔍 اكتب كود أو اسم الموظف..." value={termSearchTerm} onChange={(e) => {
                  const val = e.target.value; setTermSearchTerm(val); const code = val.split(' - ')[0]; const emp = employees.find(e => e.employee_code === code && e.contract_type !== 'إنهاء تعاقد');
                  if (emp) { setTerminateEmployeeCode(code); setTerminateDate(emp.contract_end_date || new Date().toISOString().split('T')[0]); } else { setTerminateEmployeeCode(''); setTerminateDate(''); }
                }} className="w-full bg-background border border-border text-primary px-4 py-2.5 rounded-lg text-xs font-bold outline-none focus:border-gold" />
                <datalist id="term-emps">{employees.filter(e => e.contract_type !== 'إنهاء تعاقد').map(e => <option key={e.employee_code} value={`${e.employee_code} - ${e.employee_name}`} />)}</datalist>
                {terminateEmployeeCode && <div className="mt-2 text-[10px] text-[var(--danger-text)] font-bold bg-[var(--danger-bg)] p-2 rounded-md border border-[var(--danger-text)]/20">⚠️ سيتم إنهاء تعاقد الموظف المختار نهائياً.</div>}
              </div>
              <div className="mb-6">
                <label className="block text-xs text-muted mb-2 font-bold">تاريخ الإنهاء الفعلي *</label>
                <input type="date" required value={terminateDate} onChange={e => setTerminateDate(e.target.value)} className="w-full bg-background border border-border text-primary px-4 py-2.5 rounded-lg text-xs font-bold font-mono outline-none focus:border-gold" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setIsTerminateModalOpen(false)} className="bg-background text-primary border border-border px-4 py-2 rounded-lg text-xs font-bold">إلغاء</button>
                <button type="submit" disabled={actionLoading || !terminateEmployeeCode} className="bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)]/20 px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50">{actionLoading ? 'جاري التنفيذ...' : 'تأكيد الإنهاء'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة إنشاء عقد جديد */}
      {isNewContractModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="w-full max-w-lg bg-card rounded-2xl p-6 shadow-2xl border border-border">
            <div className="flex justify-between items-center border-b border-border pb-4 mb-5">
              <h3 className="m-0 text-base text-primary font-extrabold">📝 طلب إنشاء عقد جديد تماماً</h3>
              <button onClick={() => setIsNewContractModalOpen(false)} className="bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)]/20 px-3 py-1.5 rounded-md text-xs font-bold hover:opacity-80">إغلاق ✕</button>
            </div>
            <form onSubmit={handleCreateBrandNewContract}>
              <div className="mb-4 relative">
                <label className="block text-xs text-muted mb-2 font-bold">اختر الموظف (ابحث بالاسم أو الكود) *</label>
                <input type="text" required placeholder="اكتب اسم الموظف أو الكود..." value={empSearchTerm} onChange={(e) => { setEmpSearchTerm(e.target.value); setSelectedEmployeeCode(''); setShowEmpDropdown(true); }} onFocus={() => setShowEmpDropdown(true)} className="w-full bg-background border border-border text-primary px-4 py-2.5 rounded-lg text-xs font-bold outline-none focus:border-gold" />
                {showEmpDropdown && (
                  <>
                    <div className="fixed inset-0 z-[9]" onClick={() => setShowEmpDropdown(false)} />
                    <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-lg mt-1 max-h-48 overflow-y-auto z-[10] shadow-xl">
                      {employees.filter(e => e.contract_type !== 'إنهاء تعاقد' && ((e.employee_name||'').includes(empSearchTerm) || String(e.employee_code||'').includes(empSearchTerm))).map(emp => (
                        <div key={emp.employee_code} onClick={() => { setSelectedEmployeeCode(emp.employee_code); setEmpSearchTerm(`${emp.employee_name} (${emp.employee_code})`); setShowEmpDropdown(false); }} className="p-3 text-xs font-bold text-primary border-b border-border cursor-pointer hover:bg-background">
                          {emp.employee_name} ({emp.employee_code}) - [{emp.contract_type || 'دائم'}]
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="mb-4">
                <label className="block text-xs text-muted mb-2 font-bold">نوع العقد الجديد *</label>
                <select value={newContractType} onChange={(e) => setNewContractType(e.target.value)} className="w-full bg-background border border-border text-primary px-4 py-2.5 rounded-lg text-xs font-bold outline-none focus:border-gold">
                  <option value="محدد المدة">محدد المدة</option>
                  <option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                  <option value="مهمة/مشروع">عقد مشروع/مهمة محدودة</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div><label className="block text-xs text-muted mb-2 font-bold">بداية العقد *</label><input type="date" required value={newContractStartDate} onChange={(e) => setNewContractStartDate(e.target.value)} className="w-full bg-background border border-border text-primary px-3 py-2 rounded-lg text-xs font-bold font-mono outline-none focus:border-gold" /></div>
                <div><label className="block text-xs text-muted mb-2 font-bold">نهاية العقد *</label><input type="date" required value={newContractEndDate} onChange={(e) => setNewContractEndDate(e.target.value)} className="w-full bg-background border border-border text-primary px-3 py-2 rounded-lg text-xs font-bold font-mono outline-none focus:border-gold" /></div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setIsNewContractModalOpen(false)} className="bg-background text-primary border border-border px-4 py-2 rounded-lg text-xs font-bold">إلغاء</button>
                <button type="submit" disabled={actionLoading} className="bg-primary text-card px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50">{actionLoading ? 'جاري الحفظ...' : 'إنشاء وتحديث العقد 📄'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة طلب التجديد (فردي/مجمع) */}
      {modalState.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="w-full max-w-lg bg-card rounded-2xl p-6 shadow-2xl border border-border">
            <h3 className="m-0 mb-5 text-base text-primary text-center font-extrabold">
              {modalState.type === 'single' ? `إنشاء طلب تجديد لـ (${modalState.emp?.employee_name})` : `إنشاء طلبات تجديد لـ (${selectedEmpCodes.length}) موظف`}
            </h3>
            
            <div className="bg-background border border-border rounded-xl p-4 mb-5 flex justify-around items-center">
              <label className={`flex items-center gap-2 text-xs font-bold cursor-pointer ${renewalMode === 'months' ? 'text-gold' : 'text-muted'}`}>
                <input type="radio" checked={renewalMode === 'months'} onChange={() => setRenewalMode('months')} className="accent-gold" /> تجديد بالشهور
              </label>
              <label className={`flex items-center gap-2 text-xs font-bold cursor-pointer ${renewalMode === 'custom' ? 'text-gold' : 'text-muted'}`}>
                <input type="radio" checked={renewalMode === 'custom'} onChange={() => setRenewalMode('custom')} className="accent-gold" /> تاريخ مخصص
              </label>
            </div>

            {renewalMode === 'months' && (
              <div className="mb-5">
                <label className="block text-xs text-muted mb-2 font-bold">مدة التجديد بالشهور:</label>
                <select value={renewalMonths} onChange={(e) => setRenewalMonths(Number(e.target.value))} className="w-full bg-background border border-border text-primary px-4 py-2.5 rounded-lg text-xs font-bold outline-none focus:border-gold">
                  <option value={1}>شهر واحد (1 شهر)</option>
                  <option value={2}>شهران (2 شهر)</option>
                  <option value={3}>3 شهور (ربع سنوي)</option>
                  <option value={6}>6 شهور (نصف سنوي)</option>
                  <option value={9}>9 شهور</option>
                  <option value={12}>12 شهر (سنة كاملة)</option>
                  <option value={24}>24 شهر (سنتين)</option>
                </select>
              </div>
            )}

            {renewalMode === 'custom' && (
              <div className="mb-5">
                <label className="block text-xs text-muted mb-2 font-bold">تاريخ انتهاء العقد الجديد:</label>
                <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="w-full bg-background border border-border text-primary px-4 py-2.5 rounded-lg text-xs font-bold font-mono outline-none focus:border-gold" />
              </div>
            )}

            {modalState.type === 'single' && (
              <div className="mb-6 text-sm font-bold text-left" dir="ltr">
                <span className="text-[var(--success-text)] font-mono ml-2">{renewalMode === 'months' ? calculateNewEndDate(modalState.emp?.contract_end_date, renewalMonths) : (customEndDate || '—')}</span>
                <span className="text-muted">:تاريخ الانتهاء المتوقع</span>
              </div>
            )}

            <div className="flex justify-start gap-2 flex-row-reverse">
              <button onClick={() => setModalState({ isOpen: false, type: 'single' })} className="bg-background text-primary border border-border px-6 py-2.5 rounded-lg text-xs font-bold">إلغاء</button>
              <button onClick={confirmRenewalAction} disabled={actionLoading} className="bg-gold hover:bg-gold-hover text-white px-6 py-2.5 rounded-lg text-xs font-bold disabled:opacity-50">✅ {actionLoading ? 'جاري التنفيذ...' : 'تأكيد وإجراء الطلب'}</button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة التعديل المباشر */}
      {editModal.isOpen && editModal.emp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="w-full max-w-md bg-card rounded-2xl p-6 shadow-2xl border border-border">
            <div className="flex justify-between items-center border-b border-border pb-4 mb-5">
              <h3 className="m-0 text-base text-blue-500 font-extrabold">✏️ تعديل بيانات العقد</h3>
              <button onClick={() => setEditModal({ isOpen: false })} className="bg-background text-muted px-3 py-1.5 rounded-md text-xs font-bold hover:text-primary">إغلاق ✕</button>
            </div>
            
            <div className="mb-4 text-xs text-primary bg-background border border-border p-3 rounded-lg font-bold">
              الموظف: <span className="text-gold font-mono">{editModal.emp.employee_name} ({editModal.emp.employee_code})</span>
            </div>

            <form onSubmit={handleEditContract}>
              <div className="mb-4">
                <label className="block text-xs text-muted mb-2 font-bold">نوع العقد *</label>
                <select value={editContractType} onChange={(e) => setEditContractType(e.target.value)} className="w-full bg-background border border-border text-primary px-4 py-2.5 rounded-lg text-xs font-bold outline-none focus:border-gold">
                  <option value="محدد المدة">محدد المدة</option>
                  <option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                  <option value="مهمة/مشروع">عقد مشروع/مهمة محدودة</option>
                  <option value="دائم">دائم (غير محدد المدة)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs text-muted mb-2 font-bold">تاريخ البداية</label>
                  <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} className="w-full bg-background border border-border text-primary px-3 py-2 rounded-lg text-xs font-bold font-mono outline-none focus:border-gold" />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-2 font-bold">تاريخ النهاية</label>
                  <input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} className="w-full bg-background border border-border text-primary px-3 py-2 rounded-lg text-xs font-bold font-mono outline-none focus:border-gold" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditModal({ isOpen: false })} className="bg-background text-primary border border-border px-4 py-2 rounded-lg text-xs font-bold">إلغاء</button>
                <button type="submit" disabled={actionLoading} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50">{actionLoading ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
