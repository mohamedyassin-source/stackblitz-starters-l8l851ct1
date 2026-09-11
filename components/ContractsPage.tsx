'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';

const STANDARD_CONTRACT_TYPES = [
  'محدد المدة',
  'محدد المدة - فوق السن',
  'محدد المدة - مكافأة شاملة',
  'دائم'
];

export default function ContractsPage() {
  const { refresh: refreshGlobalData } = useAppData();

  const [employees, setEmployees] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [expiryMonth, setExpiryMonth] = useState(''); 
  
  // فلتر الكروت العلوية (Active Card)
  const [activeFilterCard, setActiveFilterCard] = useState<'all' | 'fixed' | 'overage' | 'expiring' | 'expired'>('all');

  // حالات الترتيب
  const [sortColumn, setSortColumn] = useState<string>('employee_code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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

  // حالات نافذة إنهاء التعاقد המحدثة
  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);
  const [terminateEmployeeCode, setTerminateEmployeeCode] = useState('');
  const [termSearchTerm, setTermSearchTerm] = useState(''); 
  const [terminateDate, setTerminateDate] = useState(new Date().toISOString().split('T')[0]);
  const [termReason, setTermReason] = useState('إنهاء عقد');

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
    let allContracts: any[] = [];
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
      const { data, error } = await supabase.from('contracts').select('*').eq('status', 'Active').range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      allContracts = [...allContracts, ...data];
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

    const mergedEmps = allEmps.map(emp => {
      const empCodeClean = String(emp.employee_code || '').trim().replace(/^0+/, '');

      const empContracts = allContracts.filter(c => 
        String(c.employee_code || '').trim().replace(/^0+/, '') === empCodeClean
      );

      empContracts.sort((a, b) => {
        const dateA = a.contract_end_date ? new Date(a.contract_end_date).getTime() : 0;
        const dateB = b.contract_end_date ? new Date(b.contract_end_date).getTime() : 0;
        return dateB - dateA;
      });

      const latestContract = empContracts[0];

      return {
        ...emp,
        contract_id: latestContract?.contract_id,
        contract_type: latestContract?.contract_type || emp.contract_type || '—',
        contract_start_date: latestContract?.contract_start_date || emp.hiring_date || null,
        contract_end_date: latestContract?.contract_end_date || null,
      };
    });

    setEmployees(mergedEmps);
    setRenewals(allRens);
    setLoading(false);
  };

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
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
    const empRens = renewals.filter((r) => String(r.employee_code).trim() === String(empCode).trim()).sort((a, b) => b.request_id.localeCompare(a.request_id));
    const latest = empRens[0];
    if (!latest) return { text: 'متاح للتجديد', color: '#64748b', locked: false, bg: '#f1f5f9' };
    if (latest.status === 'Pending') return { text: 'قيد المعالجة', color: '#2563eb', locked: true, bg: '#eff6ff' };
    if (latest.status === 'Approved' && latest.signature_status !== 'تم التوقيع') return { text: 'في انتظار التوقيع', color: '#d97706', locked: true, bg: '#fffbeb' };
    if (latest.status === 'Approved' && latest.signature_status === 'تم التوقيع') return { text: 'تم توقيع العقد ✅', color: '#16a34a', locked: false, bg: '#f0fdf4' };
    if (latest.status === 'Rejected') return { text: 'الطلب الأخير مرفوض ❌', color: '#dc2626', locked: false, bg: '#fef2f2' };
    return { text: 'متاح للتجديد', color: '#64748b', locked: false, bg: '#f1f5f9' };
  };

  const deptsList = Array.from(new Set(employees.map((e) => e.department).filter(Boolean)));

  const baseFilteredContracts = useMemo(() => {
    return employees.filter((emp) => {
      const term = searchTerm.toLowerCase();
      
      const matchesSearch = !term || String(emp.employee_code).toLowerCase().includes(term) || String(emp.employee_name).toLowerCase().includes(term) || String(emp.department).toLowerCase().includes(term);
      const matchesDept = !selectedDept || emp.department === selectedDept;
      const matchesType = !selectedType || emp.contract_type === selectedType || emp.contract_type?.includes(selectedType);
      
      let matchesExpiryMonth = true;
      if (expiryMonth) {
        matchesExpiryMonth = emp.contract_end_date && emp.contract_end_date.startsWith(expiryMonth);
      }

      return matchesSearch && matchesDept && matchesType && matchesExpiryMonth;
    });
  }, [employees, searchTerm, selectedDept, selectedType, expiryMonth]);

  const activeEmployees = useMemo(() => {
    return baseFilteredEmployees.filter(e => e.status !== 'Inactive' && e.status !== 'Terminated' && e.contract_type !== 'إنهاء تعاقد' && !String(e.department || '').includes('تحويلات'));
  }, [baseFilteredEmployees]);

  const totalAll = activeEmployees.length;
  const totalFixedContracts = activeEmployees.filter(e => e.contract_type?.includes('محدد')).length;
  const overAgeContracts = activeEmployees.filter(e => e.contract_type?.includes('فوق السن')).length;
  const expiringSoonCount = activeEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d <= 60 && d >= 0; }).length;
  const expiredCount = activeEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d < 0; }).length;

  const filteredContracts = useMemo(() => {
    return baseFilteredEmployees.filter((emp) => {
      const days = getDaysRemaining(emp.contract_end_date);
      let matchesCard = true;
      if (activeFilterCard === 'fixed') matchesCard = emp.contract_type?.includes('محدد');
      if (activeFilterCard === 'overage') matchesCard = emp.contract_type?.includes('فوق السن');
      if (activeFilterCard === 'expiring') matchesCard = days !== null && days <= 60 && days >= 0;
      if (activeFilterCard === 'expired') matchesCard = days !== null && days < 0;
      return matchesCard;
    });
  }, [baseFilteredEmployees, activeFilterCard]);

  const sortedContracts = useMemo(() => {
    return [...filteredContracts].sort((a, b) => {
      let valA = a[sortColumn] || '';
      let valB = b[sortColumn] || '';

      if (sortColumn === 'days_left') {
        valA = getDaysRemaining(a.contract_end_date) ?? (sortDirection === 'asc' ? 99999 : -99999);
        valB = getDaysRemaining(b.contract_end_date) ?? (sortDirection === 'asc' ? 99999 : -99999);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      const res = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? res : -res;
    });
  }, [filteredContracts, sortColumn, sortDirection]);

  const toggleSelection = (code: string) => {
    setSelectedEmpCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const toggleAll = () => {
    const selectable = sortedContracts.filter(e => {
      const statusInfo = getRenewalStatusInfo(e.employee_code);
      const isTerminated = e.status === 'Inactive' || e.status === 'Terminated' || e.contract_type === 'إنهاء تعاقد' || String(e.department || '').includes('تحويلات');
      return !statusInfo.locked && !isTerminated;
    });

    if (selectedEmpCodes.length === selectable.length && selectable.length > 0) {
      setSelectedEmpCodes([]);
    } else {
      setSelectedEmpCodes(selectable.map(e => e.employee_code));
    }
  };

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const renderSortArrow = (colKey: string) => {
    if (sortColumn !== colKey) return <span style={{ opacity: 0.3, marginRight: '4px' }}>↕</span>;
    return sortDirection === 'asc' ? <span style={{ color: '#0f172a', marginRight: '4px' }}>▲</span> : <span style={{ color: '#0f172a', marginRight: '4px' }}>▼</span>;
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
    setEditContractType(emp.contract_type !== '—' ? emp.contract_type : 'محدد المدة');
    setEditStartDate(emp.contract_start_date || '');
    setEditEndDate(emp.contract_end_date || '');
    setEditModal({ isOpen: true, emp });
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedEmpCodes.length} موظف بشكل نهائي من قاعدة البيانات؟\n(هذا الإجراء لا يمكن التراجع عنه وسيحذف العقود المرتبطة بهم أيضاً)`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await supabase.from('contracts').delete().in('employee_code', selectedEmpCodes);
      const { error: empError } = await supabase.from('employees').delete().in('employee_code', selectedEmpCodes);
      
      if (empError) throw empError;

      alert('تم حذف الموظفين وعقودهم بنجاح 🗑️✅');
      setSelectedEmpCodes([]);
      await refreshGlobalData();
      fetchData();
    } catch (err: any) {
      alert('حدث خطأ أثناء الحذف: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTerminateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminateEmployeeCode) return alert('يرجى اختيار الموظف.');
    if (!terminateDate) return alert('يرجى التأكد من تاريخ الإنهاء.');
    const confirmTerm = window.confirm('هل أنت متأكد من إنهاء تعاقد هذا الموظف وتحويله لتحويلات تحت الاعتماد؟');
    if (!confirmTerm) return;
    
    setActionLoading(true);
    
    const { error: empError } = await supabase.from('employees').update({ 
      department: 'تحويلات تحت الاعتماد',
      status: 'Inactive',
      termination_date: terminateDate,
      termination_reason: termReason 
    }).eq('employee_code', terminateEmployeeCode);
    
    const { error: contractError } = await supabase.from('contracts').update({
      status: 'Inactive',
      contract_end_date: terminateDate
    }).eq('employee_code', terminateEmployeeCode).eq('status', 'Active');
    
    setActionLoading(false);
    
    if (empError || contractError) {
      alert('حدث خطأ أثناء إنهاء التعاقد.');
    } else { 
      alert('تم تحويل الموظف وإنهاء تعاقده بنجاح ✅'); 
      setIsTerminateModalOpen(false); 
      setTerminateEmployeeCode(''); 
      setTermSearchTerm('');
      setTerminateDate(new Date().toISOString().split('T')[0]);
      await refreshGlobalData();
      fetchData(); 
    }
  };

  const handleEditContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.emp) return;
    setActionLoading(true);

    if (editModal.emp.contract_id) {
      const { error } = await supabase.from('contracts').update({
        contract_type: editContractType,
        contract_start_date: editStartDate,
        contract_end_date: editEndDate
      }).eq('contract_id', editModal.emp.contract_id);
      
      if (error) alert('خطأ أثناء التعديل: ' + error.message);
    } else {
      const { error } = await supabase.from('contracts').insert([{
        employee_code: editModal.emp.employee_code,
        contract_type: editContractType,
        contract_start_date: editStartDate,
        contract_end_date: editEndDate,
        status: 'Active'
      }]);
      
      if (error) alert('خطأ أثناء الإنشاء: ' + error.message);
    }

    setActionLoading(false);
    alert('تم تعديل بيانات العقد بنجاح ✅');
    setEditModal({ isOpen: false });
    await refreshGlobalData();
    fetchData();
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
      employee_code: emp.employee_code,
      employee_name: emp.employee_name,
      department: emp.department,
      job_title: emp.job_title,
      company: emp.company,
      contract_end_date: emp.contract_end_date || newContractStartDate, 
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

    await supabase.from('contracts').update({ status: 'Archived' }).eq('employee_code', emp.employee_code).eq('status', 'Active');
    
    await supabase.from('contracts').insert([{
      employee_code: emp.employee_code,
      contract_type: newContractType,
      contract_start_date: newContractStartDate,
      contract_end_date: newContractEndDate,
      status: 'Active'
    }]);

    setActionLoading(false);
    setIsNewContractModalOpen(false);
    setCreatedRequestData(payload);
    alert(`تم إنشاء العقد الجديد بنجاح وتحويل نوع العقد إلى (${newContractType}) ✅`);
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
        await refreshGlobalData();
        fetchData(); 
      }
    }
  };

  return (
    <div style={{ paddingBottom: '40px', animation: 'fadeIn 0.4s ease-in-out', direction: 'rtl', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      
      {/* الهيدر والزراير العلوية */}
      <div className="no-print" style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px 20px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>📄 العقود الحالية السارية</h3>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>إدارة ومتابعة وتجديد عقود الموظفين النشطين</p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => { 
              setTerminateEmployeeCode(''); 
              setTermSearchTerm('');
              setTerminateDate(new Date().toISOString().split('T')[0]);
              setTermReason('إنهاء عقد');
              setIsTerminateModalOpen(true); 
            }}
            style={{ background: '#dc2626', color: '#fff', border: 0, padding: '8px 14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
          >
            🚫 تحويل للانتظار (إنهاء)
          </button>
          
          <button
            onClick={() => { 
              setSelectedEmployeeCode(''); 
              setEmpSearchTerm(''); 
              setShowEmpDropdown(false);
              setNewContractStartDate(new Date().toISOString().split('T')[0]); 
              setNewContractEndDate(''); 
              setNewContractType('محدد المدة');
              setIsNewContractModalOpen(true); 
            }}
            style={{ background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
          >
            📝 طلب إنشاء عقد جديد
          </button>
        </div>
      </div>

      {/* الكروت التفاعلية */}
      <div className="no-print grid grid-cols-2 md:grid-cols-5 gap-3" style={{ marginBottom: '20px' }}>
        
        <div 
          onClick={() => setActiveFilterCard('all')}
          style={{ 
            background: activeFilterCard === 'all' ? '#f8fafc' : '#ffffff', 
            border: activeFilterCard === 'all' ? '2px solid #0f172a' : '1px solid #e2e8f0', 
            padding: '16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '16px' }}>🌍</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>إجمالي العقود</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a' }}>{totalAll.toLocaleString()}</div>
        </div>

        <div 
          onClick={() => setActiveFilterCard('fixed')}
          style={{ 
            background: activeFilterCard === 'fixed' ? '#eff6ff' : '#ffffff', 
            border: activeFilterCard === 'fixed' ? '2px solid #2563eb' : '1px solid #e2e8f0', 
            padding: '16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '16px' }}>📂</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>العقود المحددة</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#2563eb' }}>{totalFixedContracts.toLocaleString()}</div>
        </div>

        <div 
          onClick={() => setActiveFilterCard('overage')}
          style={{ 
            background: activeFilterCard === 'overage' ? '#fffbe1' : '#ffffff', 
            border: activeFilterCard === 'overage' ? '2px solid #d97706' : '1px solid #e2e8f0', 
            padding: '16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '16px' }}>💼</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>فوق السن (60+)</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#d97706' }}>{overAgeContracts.toLocaleString()}</div>
        </div>

        <div 
          onClick={() => setActiveFilterCard('expiring')}
          style={{ 
            background: activeFilterCard === 'expiring' ? '#fef3c7' : '#ffffff', 
            border: activeFilterCard === 'expiring' ? '2px solid #b45309' : '1px solid #e2e8f0', 
            padding: '16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '16px' }}>⏳</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>ينتهي قريباً (60)</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#b45309' }}>{expiringSoonCount.toLocaleString()}</div>
        </div>

        <div 
          onClick={() => setActiveFilterCard('expired')}
          style={{ 
            background: activeFilterCard === 'expired' ? '#fef2f2' : '#ffffff', 
            border: activeFilterCard === 'expired' ? '2px solid #dc2626' : '1px solid #e2e8f0', 
            padding: '16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '16px' }}>🚨</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>منتهي المدة</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#dc2626' }}>{expiredCount.toLocaleString()}</div>
        </div>

      </div>

      {/* شريط الإجراءات السريعة للمحددين */}
      {selectedEmpCodes.length > 0 && (
        <div style={{ background: '#0f172a', color: '#fff', padding: '10px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
            تم تحديد <span style={{ color: '#60a5fa' }}>{selectedEmpCodes.length}</span> عقود
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={openBulkRenewal} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
              ⚙️ توليد طلبات تجديد
            </button>
            <button onClick={handleDeleteSelected} disabled={isDeleting} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: isDeleting ? 'not-allowed' : 'pointer', opacity: isDeleting ? 0.7 : 1 }}>
              {isDeleting ? 'جاري الحذف...' : 'حذف نهائي 🗑️'}
            </button>
            <button onClick={() => setSelectedEmpCodes([])} style={{ background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
              إلغاء التحديد ✕
            </button>
          </div>
        </div>
      )}

      {/* شريط الفلاتر */}
      <div className="no-print" style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '14px 16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.02)' }}>
        <input 
          type="text" 
          placeholder="بحث بالاسم، الكود، الإدارة..." 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)} 
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', minWidth: '220px', color: '#0f172a' }} 
        />
        
        <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', color: '#0f172a' }}>
          <option value="">الإدارة (الكل)</option>
          {deptsList.map((d: any, i) => (<option key={i} value={d}>{d}</option>))}
        </select>
        
        <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', color: '#0f172a', fontWeight: 'bold' }}>
          <option value="">كل أنواع العقود</option>
          {STANDARD_CONTRACT_TYPES.map((t, i) => <option key={i} value={t}>{t}</option>)}
        </select>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', marginLeft: '6px' }}>شهر الانتهاء:</span>
          <input 
            type="month" 
            value={expiryMonth} 
            onChange={e => setExpiryMonth(e.target.value)} 
            style={{ padding: '8px 4px', border: 0, background: 'transparent', fontSize: '12px', outline: 'none', fontWeight: 'bold', color: '#0f172a' }} 
          />
        </div>

        <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedType(''); setExpiryMonth(''); setActiveFilterCard('all'); }} style={{ background: '#f1f5f9', color: '#334155', border: 0, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
          إعادة ضبط
        </button>

        <div style={{ marginRight: 'auto', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>
          النتائج بالجدول: <span style={{ color: '#0f172a', fontSize: '13px' }}>{sortedContracts.length}</span> عقد
        </div>
      </div>

      {/* الجدول الرئيسي */}
      <div className="no-print" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>جاري سحب بيانات العقود... ⏳</div>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', zIndex: 10 }}>
                <tr style={{ color: '#64748b' }}>
                  <th style={{ padding: '12px', textAlign: 'center', width: '40px' }}>
                    <input type="checkbox" checked={selectedEmpCodes.length > 0 && selectedEmpCodes.length === sortedContracts.filter(e => { const st = getRenewalStatusInfo(e.employee_code); const isT = e.status === 'Inactive' || e.status === 'Terminated' || e.contract_type === 'إنهاء تعاقد' || String(e.department || '').includes('تحويلات'); return !st.locked && !isT; }).length} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: '#0d9488' }} />
                  </th>
                  <th onClick={() => handleSort('employee_code')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>الكود {renderSortArrow('employee_code')}</th>
                  <th onClick={() => handleSort('employee_name')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>الموظف {renderSortArrow('employee_name')}</th>
                  <th onClick={() => handleSort('department')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>الإدارة {renderSortArrow('department')}</th>
                  <th onClick={() => handleSort('job_title')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>الوظيفة {renderSortArrow('job_title')}</th>
                  <th onClick={() => handleSort('contract_type')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>النوع {renderSortArrow('contract_type')}</th>
                  <th onClick={() => handleSort('contract_end_date')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>الانتهاء {renderSortArrow('contract_end_date')}</th>
                  <th onClick={() => handleSort('days_left')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>المتبقي {renderSortArrow('days_left')}</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>حالة التجديد</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {sortedContracts.length === 0 ? (
                  <tr><td colSpan={10} style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا توجد عقود مطابقة 🔍</td></tr>
                ) : sortedContracts.map((emp) => {
                  const statusInfo = getRenewalStatusInfo(emp.employee_code);
                  const isTerminated = emp.status === 'Inactive' || emp.status === 'Terminated' || emp.contract_type === 'إنهاء تعاقد' || String(emp.department || '').includes('تحويلات');
                  const daysLeft = getDaysRemaining(emp.contract_end_date);
                  let remainingLabel = <span style={{ color: '#64748b' }}>—</span>;
                  
                  if (daysLeft !== null) {
                    if (daysLeft < 0) remainingLabel = <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #fecaca' }}>منتهي ({Math.abs(daysLeft)} يوم)</span>;
                    else if (daysLeft <= 60) remainingLabel = <span style={{ background: '#fffbe1', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #fde68a' }}>متبقي {daysLeft} يوم</span>;
                    else remainingLabel = <span style={{ background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #bfdbfe' }}>متبقي {daysLeft} يوم</span>;
                  }

                  if (emp.contract_type === 'دائم') {
                    remainingLabel = <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #bbf7d0' }}>دائم 🛡️</span>;
                  }

                  return (
                    <tr key={emp.employee_code} style={{ borderBottom: '1px solid #f1f5f9', background: isTerminated ? '#fff5f5' : selectedEmpCodes.includes(emp.employee_code) ? '#f0fdf4' : 'transparent', transition: 'background 0.2s' }}>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <input type="checkbox" checked={selectedEmpCodes.includes(emp.employee_code)} onChange={() => toggleSelection(emp.employee_code)} disabled={statusInfo.locked || isTerminated} style={{ cursor: statusInfo.locked || isTerminated ? 'not-allowed' : 'pointer', accentColor: '#0d9488' }} />
                      </td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: isTerminated ? '#dc2626' : '#0d9488', fontFamily: 'monospace' }}>{emp.employee_code}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>
                        {emp.employee_name}
                        {isTerminated && (
                          <span style={{ marginRight: '6px', background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', border: '1px solid #fecaca' }}>تحويلات</span>
                        )}
                      </td>
                      <td style={{ padding: '10px', color: '#64748b', fontWeight: '500' }}>{emp.department || '—'}</td>
                      <td style={{ padding: '10px', color: '#64748b', fontWeight: '500' }}>{emp.job_title || '—'}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: isTerminated ? '#dc2626' : '#2563eb' }}>{isTerminated ? 'إنهاء تعاقد' : emp.contract_type}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace' }}>{emp.contract_end_date || '—'}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>{remainingLabel}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{ color: statusInfo.color, background: statusInfo.bg, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${statusInfo.color}40`, fontWeight: 'bold', fontSize: '10px' }}>
                          {statusInfo.text}
                        </span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            onClick={() => openSingleRenewal(emp)}
                            disabled={statusInfo.locked || actionLoading || isTerminated}
                            style={{ background: statusInfo.locked || isTerminated ? '#f1f5f9' : '#10b981', color: statusInfo.locked || isTerminated ? '#94a3b8' : '#fff', border: statusInfo.locked || isTerminated ? '1px solid #e2e8f0' : 0, padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: statusInfo.locked || actionLoading || isTerminated ? 'not-allowed' : 'pointer' }}
                          >
                            + تجديد
                          </button>
                          <button
                            onClick={() => openEditModal(emp)}
                            disabled={actionLoading || isTerminated}
                            style={{ background: isTerminated ? '#f1f5f9' : '#ffffff', color: isTerminated ? '#94a3b8' : '#0d9488', border: isTerminated ? '1px solid #e2e8f0' : '1px solid #99f6e4', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: actionLoading || isTerminated ? 'not-allowed' : 'pointer' }}
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
          </div>
        )}
      </div>

      {/* نافذة إنهاء التعاقد */}
      {isTerminateModalOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '480px', background: '#ffffff', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#dc2626', fontWeight: '900' }}>🚫 تحويل للانتظار / إنهاء تعاقد</h3>
              <button onClick={() => setIsTerminateModalOpen(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            
            <form onSubmit={handleTerminateContract}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>
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
                    const emp = baseFilteredEmployees.find(e => e.employee_code === code && e.status !== 'Inactive' && e.status !== 'Terminated' && !String(e.department || '').includes('تحويلات'));
                    if (emp) {
                      setTerminateEmployeeCode(code);
                      setTerminateDate(emp.contract_end_date || new Date().toISOString().split('T')[0]);
                    } else {
                      setTerminateEmployeeCode('');
                      setTerminateDate(new Date().toISOString().split('T')[0]);
                    }
                  }}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }}
                />
                <datalist id="term-employees-list">
                  {baseFilteredEmployees.filter(emp => emp.status !== 'Inactive' && emp.status !== 'Terminated' && !String(emp.department || '').includes('تحويلات')).map((emp) => (
                    <option key={emp.employee_code} value={`${emp.employee_code} - ${emp.employee_name}`} />
                  ))}
                </datalist>
                
                {terminateEmployeeCode && (
                  <div style={{ marginTop: '10px', fontSize: '12px', color: '#dc2626', fontWeight: 'bold', background: '#fef2f2', padding: '10px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                    ⚠️ سيتم إيقاف الموظف المختار وتحويل إدارته إلى (تحويلات تحت الاعتماد).
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>
                  سبب إنهاء الخدمة / التحويل *
                </label>
                <select value={termReason} onChange={e => setTermReason(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }}>
                  <option value="استقالة">استقالة</option>
                  <option value="إنهاء عقد">إنهاء عقد</option>
                  <option value="إنهاء خدمات">إنهاء خدمات</option>
                  <option value="بلوغ سن">بلوغ سن (تقاعد)</option>
                  <option value="انقطاع عن العمل">انقطاع عن العمل</option>
                  <option value="نقل شركة شقيقة">نقل شركة شقيقة</option>
                </select>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>
                  تاريخ الإنهاء الفعلي *
                </label>
                <input 
                  type="date" 
                  required 
                  value={terminateDate} 
                  onChange={e => setTerminateDate(e.target.value)} 
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setIsTerminateModalOpen(false)} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading || !terminateEmployeeCode} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: (actionLoading || !terminateEmployeeCode) ? 'not-allowed' : 'pointer' }}>
                  {actionLoading ? 'جاري التنفيذ...' : 'تأكيد الإنهاء والتحويل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة إنشاء عقد جديد */}
      {isNewContractModalOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '520px', background: '#ffffff', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>📝 طلب إنشاء عقد جديد تماماً</h3>
              <button onClick={() => setIsNewContractModalOpen(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleCreateBrandNewContract}>
              
              <div style={{ marginBottom: '16px', position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>
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
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }}
                />

                {showEmpDropdown && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowEmpDropdown(false)} />
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto', zIndex: 10, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                      {(() => {
                        const filteredEmps = baseFilteredEmployees
                          .filter(emp => emp.status !== 'Inactive' && emp.status !== 'Terminated' && !String(emp.department || '').includes('تحويلات'))
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
                                style={{ padding: '12px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontWeight: 'bold', color: '#0f172a' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                {emp.employee_name} ({emp.employee_code}) - [{emp.contract_type || 'دائم'}]
                              </div>
                            ))}
                            {filteredEmps.length === 0 && (
                              <div style={{ padding: '16px', fontSize: '12px', color: '#64748b', textAlign: 'center', fontWeight: 'bold' }}>
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
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>نوع العقد الجديد *</label>
                <select value={newContractType} onChange={(e) => setNewContractType(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }}>
                  {STANDARD_CONTRACT_TYPES.map((t, idx) => (
                    <option key={idx} value={t}>{t}</option>
                  ))}
                  <option value="مهمة/مشروع">عقد مشروع/مهمة محدودة</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div><label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>بداية العقد *</label><input type="date" required value={newContractStartDate} onChange={(e) => setNewContractStartDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} /></div>
                <div><label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>نهاية العقد *</label><input type="date" required disabled={newContractType === 'دائم'} value={newContractEndDate} onChange={(e) => setNewContractEndDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace', background: newContractType === 'دائم' ? '#f1f5f9' : '#ffffff' }} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setIsNewContractModalOpen(false)} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري الحفظ...' : 'إنشاء وتحديث العقد 📄'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة طلب التجديد */}
      {modalState.isOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ width: '500px', background: '#ffffff', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            
            <h3 style={{ margin: '0 0 20px', fontSize: '18px', color: '#0f172a', textAlign: 'center', fontWeight: '900' }}>
              {modalState.type === 'single' ? `إنشاء طلب تجديد لـ (${modalState.emp?.employee_name})` : `إنشاء طلبات تجديد لـ (${selectedEmpCodes.length}) موظف`}
            </h3>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', color: renewalMode === 'months' ? '#0d9488' : '#64748b', cursor: 'pointer' }}>
                <input type="radio" name="renewalMode" checked={renewalMode === 'months'} onChange={() => setRenewalMode('months')} style={{ accentColor: '#0d9488' }} />
                تجديد بالشهور (تلقائي)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', color: renewalMode === 'custom' ? '#0d9488' : '#64748b', cursor: 'pointer' }}>
                <input type="radio" name="renewalMode" checked={renewalMode === 'custom'} onChange={() => setRenewalMode('custom')} style={{ accentColor: '#0d9488' }} />
                تاريخ انتهاء مخصص
              </label>
            </div>

            {renewalMode === 'months' && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>يرجى اختيار مدة التجديد بالشهور:</label>
                <select value={renewalMonths} onChange={(e) => setRenewalMonths(Number(e.target.value))} style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', background: '#ffffff' }}>
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
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>حدد تاريخ انتهاء العقد الجديد يدوياً:</label>
                <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} />
              </div>
            )}

            {modalState.type === 'single' && (
              <div style={{ textAlign: 'left', fontSize: '13px', marginBottom: '24px', direction: 'ltr', background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <span style={{ color: '#16a34a', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '14px' }}>
                  {renewalMode === 'months' ? calculateNewEndDate(modalState.emp?.contract_end_date, renewalMonths) : (customEndDate || '—')}
                </span>
                <span style={{ color: '#64748b', fontWeight: 'bold', marginLeft: '6px' }}>:تاريخ الانتهاء المتوقع</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '10px', direction: 'rtl' }}>
              <button 
                onClick={confirmRenewalAction} 
                disabled={actionLoading} 
                style={{ background: '#2563eb', color: '#fff', border: 0, padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', cursor: actionLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                ✅ {actionLoading ? 'جاري التنفيذ...' : 'تأكيد وإجراء الطلب'}
              </button>
              <button 
                onClick={() => setModalState({ isOpen: false, type: 'single' })} 
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
              >
                إلغاء
              </button>
            </div>

          </div>
        </div>
      )}

      {/* نافذة التعديل المباشرة */}
      {editModal.isOpen && editModal.emp && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '480px', background: '#ffffff', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#2563eb', fontWeight: '900' }}>✏️ تعديل بيانات العقد</h3>
              <button onClick={() => setEditModal({ isOpen: false })} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            
            <div style={{ marginBottom: '20px', fontSize: '13px', color: '#64748b', background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              تعديل بيانات عقد الموظف: <br/><strong style={{ color: '#0f172a', fontSize: '14px' }}>{editModal.emp.employee_name} ({editModal.emp.employee_code})</strong>
            </div>

            <form onSubmit={handleEditContract}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>نوع العقد *</label>
                <select value={editContractType} onChange={(e) => setEditContractType(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', background: '#ffffff' }}>
                  {STANDARD_CONTRACT_TYPES.map((t, idx) => (
                    <option key={idx} value={t}>{t}</option>
                  ))}
                  <option value="مهمة/مشروع">عقد مشروع/مهمة محدودة</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>تاريخ بداية العقد</label>
                  <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>تاريخ نهاية العقد</label>
                  <input type="date" disabled={editContractType === 'دائم'} value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace', background: editContractType === 'دائم' ? '#f1f5f9' : '#ffffff' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setEditModal({ isOpen: false })} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
