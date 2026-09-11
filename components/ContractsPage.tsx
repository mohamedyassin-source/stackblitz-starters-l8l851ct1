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

  // 🔍 الفلاتر الأساسية
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [expiryMonth, setExpiryMonth] = useState(''); 
  
  // 🗂️ فلتر الكروت العلوية (المدمجة)
  const [activeFilterCard, setActiveFilterCard] = useState<'all' | 'fixed' | 'overage' | 'expiring' | 'expired' | 'pending' | 'awaiting_sign' | 'signed'>('all');

  // 🔃 حالات الترتيب
  const [sortColumn, setSortColumn] = useState<string>('days_left');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // ☑️ حالة التحديد المجمع
  const [selectedEmpCodes, setSelectedEmpCodes] = useState<string[]>([]);

  // 📝 النوافذ المنبثقة
  const [modalState, setModalState] = useState<{ isOpen: boolean; type: 'single' | 'bulk'; emp?: any; }>({ isOpen: false, type: 'single' });
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
  const [terminateDate, setTerminateDate] = useState(new Date().toISOString().split('T')[0]);
  const [termReason, setTermReason] = useState('إنهاء عقد');

  const [editModal, setEditModal] = useState<{ isOpen: boolean; emp?: any }>({ isOpen: false });
  const [editContractType, setEditContractType] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  // 🚀 حالات نافذة الـ Workflow الجديدة
  const [workflowModal, setWorkflowModal] = useState<{ isOpen: boolean; emp?: any; req?: any }>({ isOpen: false });

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
      const { data, error } = await supabase.from('renewal_requests').select('*').range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      allRens = [...allRens, ...data];
      if (data.length < step) break;
      from += step;
    }

    const mergedEmps = allEmps.map(emp => {
      if (!emp) return {};
      const empCodeClean = String(emp.employee_code || '').trim().replace(/^0+/, '');

      const empContracts = allContracts.filter(c => 
        c && String(c.employee_code || '').trim().replace(/^0+/, '') === empCodeClean
      );

      empContracts.sort((a, b) => {
        const dateA = a?.contract_end_date ? new Date(a.contract_end_date).getTime() : 0;
        const dateB = b?.contract_end_date ? new Date(b.contract_end_date).getTime() : 0;
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

  const getLatestRequest = (empCode: string) => {
    if (!empCode || !renewals || renewals.length === 0) return null;
    const empRens = renewals
      .filter((r) => r && r.employee_code && String(r.employee_code).trim() === String(empCode).trim())
      .sort((a, b) => String(b.request_id || '').localeCompare(String(a.request_id || '')));
    return empRens[0] || null;
  };

  const baseFilteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (!emp) return false;
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term || String(emp.employee_code || '').toLowerCase().includes(term) || String(emp.employee_name || '').toLowerCase().includes(term) || String(emp.department || '').toLowerCase().includes(term);
      const matchesDept = !selectedDept || emp.department === selectedDept;
      const matchesType = !selectedType || emp.contract_type === selectedType || String(emp.contract_type || '').includes(selectedType);
      
      let matchesExpiryMonth = true;
      if (expiryMonth) {
        matchesExpiryMonth = emp.contract_end_date && String(emp.contract_end_date).startsWith(expiryMonth);
      }

      return matchesSearch && matchesDept && matchesType && matchesExpiryMonth;
    });
  }, [employees, searchTerm, selectedDept, selectedType, expiryMonth]);

  const activeEmployees = useMemo(() => {
    return baseFilteredEmployees.filter(e => e && e.status !== 'Inactive' && e.status !== 'Terminated' && e.contract_type !== 'إنهاء تعاقد' && !String(e.department || '').includes('تحويلات'));
  }, [baseFilteredEmployees]);

  // 📊 حسابات كروت إحصائيات العقود والنسب المئوية
  const totalAll = activeEmployees.length;
  const calcPct = (val: number) => totalAll > 0 ? ((val / totalAll) * 100).toFixed(1) : '0';

  const totalFixedContracts = activeEmployees.filter(e => String(e.contract_type || '').includes('محدد')).length;
  const overAgeContracts = activeEmployees.filter(e => String(e.contract_type || '').includes('فوق السن')).length;
  const expiringSoonCount = activeEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d <= 60 && d >= 0; }).length;
  const expiredCount = activeEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d < 0; }).length;

  const pendingCount = activeEmployees.filter(e => getLatestRequest(e.employee_code)?.status === 'Pending').length;
  const awaitingSignCount = activeEmployees.filter(e => {
    const req = getLatestRequest(e.employee_code);
    return req?.status === 'Approved' && req?.signature_status !== 'تم التوقيع';
  }).length;
  const signedCount = activeEmployees.filter(e => {
    const req = getLatestRequest(e.employee_code);
    return req?.status === 'Approved' && req?.signature_status === 'تم التوقيع';
  }).length;

  const filteredContracts = useMemo(() => {
    return activeEmployees.filter((emp) => {
      const days = getDaysRemaining(emp.contract_end_date);
      const req = getLatestRequest(emp.employee_code);
      
      if (activeFilterCard === 'fixed') return String(emp.contract_type || '').includes('محدد');
      if (activeFilterCard === 'overage') return String(emp.contract_type || '').includes('فوق السن');
      if (activeFilterCard === 'expiring') return days !== null && days <= 60 && days >= 0;
      if (activeFilterCard === 'expired') return days !== null && days < 0;
      if (activeFilterCard === 'pending') return req?.status === 'Pending';
      if (activeFilterCard === 'awaiting_sign') return req?.status === 'Approved' && req?.signature_status !== 'تم التوقيع';
      if (activeFilterCard === 'signed') return req?.status === 'Approved' && req?.signature_status === 'تم التوقيع';
      
      return true;
    });
  }, [activeEmployees, activeFilterCard, renewals]);

  const sortedContracts = useMemo(() => {
    return [...filteredContracts].sort((a, b) => {
      let valA: any = a[sortColumn] || '';
      let valB: any = b[sortColumn] || '';

      if (sortColumn === 'days_left') {
        valA = getDaysRemaining(a.contract_end_date) ?? (sortDirection === 'asc' ? 99999 : -99999);
        valB = getDaysRemaining(b.contract_end_date) ?? (sortDirection === 'asc' ? 99999 : -99999);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      
      if (sortColumn === 'req_status') {
        valA = getLatestRequest(a.employee_code)?.status || '';
        valB = getLatestRequest(b.employee_code)?.status || '';
      }

      if (sortColumn === 'sign_status') {
        valA = getLatestRequest(a.employee_code)?.signature_status || '';
        valB = getLatestRequest(b.employee_code)?.signature_status || '';
      }

      const res = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? res : -res;
    });
  }, [filteredContracts, sortColumn, sortDirection, renewals]);

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
    return sortDirection === 'asc' ? <span style={{ color: '#4f46e5', marginRight: '4px' }}>▲</span> : <span style={{ color: '#4f46e5', marginRight: '4px' }}>▼</span>;
  };

  const toggleSelection = (code: string) => setSelectedEmpCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  const toggleAll = () => {
    if (selectedEmpCodes.length === sortedContracts.length && sortedContracts.length > 0) setSelectedEmpCodes([]);
    else setSelectedEmpCodes(sortedContracts.map(e => e.employee_code));
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
    const yearRenewals = renewals.filter((r) => r && r.request_id && String(r.request_id).startsWith(yearPrefix));
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

  const openSingleRenewal = (emp: any) => {
    setRenewalMode('months'); setRenewalMonths(12); setCustomEndDate('');
    setModalState({ isOpen: true, type: 'single', emp });
  };
  const openBulkRenewal = () => {
    if (selectedEmpCodes.length === 0) return alert('يرجى تحديد موظفين أولاً');
    setRenewalMode('months'); setRenewalMonths(12); setCustomEndDate('');
    setModalState({ isOpen: true, type: 'bulk' });
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
        await refreshGlobalData(); fetchData(); 
      }
    } else if (modalState.type === 'bulk') {
      const selectedEmps = employees.filter(e => selectedEmpCodes.includes(e.employee_code));
      const reqIds = generateSequentialIds(selectedEmps.length);
      const payloads = selectedEmps.map((emp, index) => {
        const targetEndDate = renewalMode === 'months' ? calculateNewEndDate(emp.contract_end_date, renewalMonths) : customEndDate;
        return {
          request_id: reqIds[index], employee_code: emp.employee_code, employee_name: emp.employee_name,
          department: emp.department, job_title: emp.job_title, company: emp.company,
          contract_end_date: emp.contract_end_date, new_contract_end_date: targetEndDate,
          renewal_months: renewalMode === 'months' ? renewalMonths : null,
          status: 'Pending', signature_status: 'قيد التوقيع', request_date: new Date().toISOString().split('T')[0],
        };
      });
      const { error } = await supabase.from('renewal_requests').insert(payloads);
      setActionLoading(false); setModalState({ isOpen: false, type: 'single' });
      if (error) alert('خطأ: ' + error.message); else { 
        alert('تم إنشاء النماذج المجمعة بنجاح! وهي الآن بانتظار الاعتماد الإداري.'); 
        setSelectedEmpCodes([]); await refreshGlobalData(); fetchData(); 
      }
    }
  };

  const openEditModal = (emp: any) => {
    setEditContractType(emp.contract_type !== '—' ? emp.contract_type : 'محدد المدة');
    setEditStartDate(emp.contract_start_date || '');
    setEditEndDate(emp.contract_end_date || '');
    setEditModal({ isOpen: true, emp });
  };

  const handleEditContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.emp) return;
    setActionLoading(true);
    if (editModal.emp.contract_id) {
      await supabase.from('contracts').update({ contract_type: editContractType, contract_start_date: editStartDate, contract_end_date: editEndDate }).eq('contract_id', editModal.emp.contract_id);
    } else {
      await supabase.from('contracts').insert([{ employee_code: editModal.emp.employee_code, contract_type: editContractType, contract_start_date: editStartDate, contract_end_date: editEndDate, status: 'Active' }]);
    }
    setActionLoading(false); alert('تم تعديل بيانات العقد بنجاح ✅');
    setEditModal({ isOpen: false }); await refreshGlobalData(); fetchData();
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedEmpCodes.length} موظف؟`)) return;
    setIsDeleting(true);
    await supabase.from('contracts').delete().in('employee_code', selectedEmpCodes);
    await supabase.from('employees').delete().in('employee_code', selectedEmpCodes);
    alert('تم الحذف بنجاح ✅'); setSelectedEmpCodes([]); setIsDeleting(false); await refreshGlobalData(); fetchData();
  };

  const handleTerminateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminateEmployeeCode || !terminateDate) return;
    setActionLoading(true);
    await supabase.from('employees').update({ department: 'تحويلات تحت الاعتماد', status: 'Inactive', termination_date: terminateDate, termination_reason: termReason }).eq('employee_code', terminateEmployeeCode);
    await supabase.from('contracts').update({ status: 'Inactive', contract_end_date: terminateDate }).eq('employee_code', terminateEmployeeCode).eq('status', 'Active');
    setActionLoading(false); alert('تم الإنهاء والتحويل بنجاح ✅');
    setIsTerminateModalOpen(false); setTerminateEmployeeCode(''); setTermSearchTerm(''); await refreshGlobalData(); fetchData();
  };

  const handleCreateBrandNewContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeCode || !newContractStartDate) return;
    setActionLoading(true);
    const emp = employees.find((e) => e.employee_code === selectedEmployeeCode);
    if (emp) {
      await supabase.from('contracts').update({ status: 'Archived' }).eq('employee_code', emp.employee_code).eq('status', 'Active');
      await supabase.from('contracts').insert([{ employee_code: emp.employee_code, contract_type: newContractType, contract_start_date: newContractStartDate, contract_end_date: newContractEndDate, status: 'Active' }]);
    }
    setActionLoading(false); setIsNewContractModalOpen(false); alert(`تم إنشاء العقد الجديد ✅`); await refreshGlobalData(); fetchData();
  };

  // 🚀 دالة الـ Workflow المحدثة (للتوقيع فقط - الاعتماد تم نقله لصفحة أخرى)
  const handleWorkflowAction = async (action: 'sign') => {
    const req = workflowModal.req;
    const empCode = workflowModal.emp?.employee_code;
    if (!req || !empCode) return;
    
    setActionLoading(true);
    
    try {
      if (action === 'sign') {
        await supabase.from('renewal_requests').update({ signature_status: 'تم التوقيع' }).eq('request_id', req.request_id);
        await supabase.from('employees').update({ contract_end_date: req.new_contract_end_date }).eq('employee_code', empCode);
        await supabase.from('contracts').update({ contract_end_date: req.new_contract_end_date }).eq('employee_code', empCode).eq('status', 'Active');
        
        alert('🎉 تم توقيع العقد وتحديث تاريخ انتهاء الموظف بنجاح!');
      }
      
      setWorkflowModal({ isOpen: false });
      await refreshGlobalData();
      fetchData();
    } catch (error: any) {
      alert('حدث خطأ: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const deptsList = Array.from(new Set(employees.map((e) => e.department).filter(Boolean)));

  return (
    <div style={{ paddingBottom: '40px', animation: 'fadeIn 0.4s ease-in-out', direction: 'rtl', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      
      {/* الهيدر */}
      <div className="no-print" style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px 20px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>📄 غرفة عمليات العقود والتجديدات</h3>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>إدارة شاملة لدورة حياة العقد، التجديدات، والاعتمادات</p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => { setTerminateEmployeeCode(''); setTermSearchTerm(''); setIsTerminateModalOpen(true); }}
            style={{ background: '#dc2626', color: '#fff', border: 0, padding: '8px 14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            🚫 تحويل للانتظار (إنهاء)
          </button>
          
          <button
            onClick={() => { setSelectedEmployeeCode(''); setEmpSearchTerm(''); setShowEmpDropdown(false); setIsNewContractModalOpen(true); }}
            style={{ background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            📝 طلب إنشاء عقد جديد
          </button>
        </div>
      </div>

      {/* 📊 القسم الأول: إحصائيات العقود الأساسية */}
      <div className="no-print" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '13px', color: '#475569', fontWeight: '900' }}>📊 إحصائيات العقود</h4>
          <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
          <div onClick={() => setActiveFilterCard('all')} style={{ background: activeFilterCard === 'all' ? '#f8fafc' : '#ffffff', border: activeFilterCard === 'all' ? '2px solid #0f172a' : '1px solid #e2e8f0', padding: '16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><span style={{ fontSize: '18px' }}>🌍</span><span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>إجمالي العقود</span></div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a' }}>{totalAll.toLocaleString()}</div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontWeight: 'bold' }}>القوة الفعالة (100%)</div>
          </div>

          <div onClick={() => setActiveFilterCard('fixed')} style={{ background: activeFilterCard === 'fixed' ? '#eef2ff' : '#ffffff', border: activeFilterCard === 'fixed' ? '2px solid #4f46e5' : '1px solid #e2e8f0', padding: '16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><span style={{ fontSize: '18px' }}>📂</span><span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>عقود محددة</span></div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#4f46e5' }}>{totalFixedContracts.toLocaleString()}</div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontWeight: 'bold' }}>نسبة {calcPct(totalFixedContracts)}%</div>
          </div>

          <div onClick={() => setActiveFilterCard('overage')} style={{ background: activeFilterCard === 'overage' ? '#faf5ff' : '#ffffff', border: activeFilterCard === 'overage' ? '2px solid #9333ea' : '1px solid #e2e8f0', padding: '16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><span style={{ fontSize: '18px' }}>💼</span><span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>فوق السن</span></div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#9333ea' }}>{overAgeContracts.toLocaleString()}</div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontWeight: 'bold' }}>نسبة {calcPct(overAgeContracts)}%</div>
          </div>

          <div onClick={() => setActiveFilterCard('expiring')} style={{ background: activeFilterCard === 'expiring' ? '#fffbeb' : '#ffffff', border: activeFilterCard === 'expiring' ? '2px solid #d97706' : '1px solid #e2e8f0', padding: '16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><span style={{ fontSize: '18px' }}>⏳</span><span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>ينتهي قريباً</span></div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#d97706' }}>{expiringSoonCount.toLocaleString()}</div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontWeight: 'bold' }}>نسبة {calcPct(expiringSoonCount)}%</div>
          </div>

          <div onClick={() => setActiveFilterCard('expired')} style={{ background: activeFilterCard === 'expired' ? '#fef2f2' : '#ffffff', border: activeFilterCard === 'expired' ? '2px solid #dc2626' : '1px solid #e2e8f0', padding: '16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><span style={{ fontSize: '18px' }}>🚨</span><span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>منتهي المدة</span></div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#dc2626' }}>{expiredCount.toLocaleString()}</div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontWeight: 'bold' }}>نسبة {calcPct(expiredCount)}%</div>
          </div>
        </div>
      </div>

      {/* 🔄 القسم الثاني: سير عمل التجديدات */}
      <div className="no-print" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '13px', color: '#475569', fontWeight: '900' }}>🔄 سير عمل التجديدات (Workflow)</h4>
          <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          <div onClick={() => setActiveFilterCard('pending')} style={{ background: activeFilterCard === 'pending' ? '#eff6ff' : '#ffffff', border: activeFilterCard === 'pending' ? '2px solid #3b82f6' : '1px solid #e2e8f0', padding: '20px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 10px rgba(0,0,0,0.02)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: '-10px', bottom: '-20px', fontSize: '100px', opacity: 0.03 }}>📝</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><span style={{ fontSize: '18px' }}>📝</span><span style={{ fontSize: '13px', color: '#64748b', fontWeight: 'bold' }}>نماذج تحت الاعتماد</span></div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#3b82f6' }}>{pendingCount.toLocaleString()}</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontWeight: 'bold' }}>نسبة {calcPct(pendingCount)}%</div>
          </div>

          <div onClick={() => setActiveFilterCard('awaiting_sign')} style={{ background: activeFilterCard === 'awaiting_sign' ? '#fff7ed' : '#ffffff', border: activeFilterCard === 'awaiting_sign' ? '2px solid #ea580c' : '1px solid #e2e8f0', padding: '20px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 10px rgba(0,0,0,0.02)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: '-10px', bottom: '-20px', fontSize: '100px', opacity: 0.03 }}>✍️</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><span style={{ fontSize: '18px' }}>✍️</span><span style={{ fontSize: '13px', color: '#64748b', fontWeight: 'bold' }}>بانتظار توقيع الموظف</span></div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#ea580c' }}>{awaitingSignCount.toLocaleString()}</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontWeight: 'bold' }}>نسبة {calcPct(awaitingSignCount)}%</div>
          </div>

          <div onClick={() => setActiveFilterCard('signed')} style={{ background: activeFilterCard === 'signed' ? '#f0fdf4' : '#ffffff', border: activeFilterCard === 'signed' ? '2px solid #16a34a' : '1px solid #e2e8f0', borderRight: '4px solid #16a34a', padding: '20px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 10px rgba(0,0,0,0.02)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: '-10px', bottom: '-20px', fontSize: '100px', opacity: 0.03 }}>✅</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><span style={{ fontSize: '18px' }}>✅</span><span style={{ fontSize: '13px', color: '#64748b', fontWeight: 'bold' }}>تم التوقيع والإنجاز</span></div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#16a34a' }}>{signedCount.toLocaleString()}</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontWeight: 'bold' }}>نسبة {calcPct(signedCount)}%</div>
          </div>
        </div>
      </div>

      {/* شريط الإجراءات السريعة للمحددين */}
      {selectedEmpCodes.length > 0 && (
        <div style={{ background: '#1e1b4b', color: '#fff', padding: '10px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
            تم تحديد <span style={{ color: '#818cf8' }}>{selectedEmpCodes.length}</span> عقود
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={openBulkRenewal} style={{ background: '#4f46e5', color: '#fff', border: 0, padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
              ⚙️ إنشاء نماذج تجديد مجمعة
            </button>
            <button onClick={handleDeleteSelected} disabled={isDeleting} style={{ background: '#e11d48', color: '#fff', border: 0, padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: isDeleting ? 'not-allowed' : 'pointer', opacity: isDeleting ? 0.7 : 1 }}>
              {isDeleting ? 'جاري الحذف...' : 'حذف نهائي 🗑️'}
            </button>
            <button onClick={() => setSelectedEmpCodes([])} style={{ background: 'transparent', border: '1px solid #6366f1', color: '#c7d2fe', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
              إلغاء التحديد ✕
            </button>
          </div>
        </div>
      )}

      {/* شريط الفلاتر والبحث الأصلي המطور */}
      <div className="no-print" style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '14px 16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.02)' }}>
        <input type="text" placeholder="بحث بالاسم، الكود، الإدارة..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', minWidth: '220px', color: '#0f172a' }} />
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
          <input type="month" value={expiryMonth} onChange={e => setExpiryMonth(e.target.value)} style={{ padding: '8px 4px', border: 0, background: 'transparent', fontSize: '12px', outline: 'none', fontWeight: 'bold', color: '#0f172a' }} />
        </div>
        <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedType(''); setExpiryMonth(''); setActiveFilterCard('all'); }} style={{ background: '#f1f5f9', color: '#334155', border: 0, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
          إعادة ضبط
        </button>
        <div style={{ marginRight: 'auto', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>
          النتائج بالجدول: <span style={{ color: '#4f46e5', fontSize: '14px' }}>{sortedContracts.length}</span> عقد
        </div>
      </div>

      {/* 🚀 الجدول الرئيسي المطور */}
      <div className="no-print" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>جاري سحب بيانات العقود والطلبات... ⏳</div>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', zIndex: 10 }}>
                <tr style={{ color: '#64748b' }}>
                  <th style={{ padding: '12px', textAlign: 'center', width: '40px' }}>
                    <input type="checkbox" checked={selectedEmpCodes.length > 0 && selectedEmpCodes.length === sortedContracts.length} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: '#4f46e5' }} />
                  </th>
                  <th onClick={() => handleSort('employee_code')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>الكود {renderSortArrow('employee_code')}</th>
                  <th onClick={() => handleSort('employee_name')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>الموظف {renderSortArrow('employee_name')}</th>
                  <th onClick={() => handleSort('department')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>الإدارة {renderSortArrow('department')}</th>
                  <th onClick={() => handleSort('contract_type')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>نوع العقد {renderSortArrow('contract_type')}</th>
                  <th onClick={() => handleSort('contract_end_date')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>الانتهاء {renderSortArrow('contract_end_date')}</th>
                  <th onClick={() => handleSort('days_left')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>المدة {renderSortArrow('days_left')}</th>
                  <th onClick={() => handleSort('req_status')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>الاعتماد {renderSortArrow('req_status')}</th>
                  <th onClick={() => handleSort('sign_status')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>التوقيع {renderSortArrow('sign_status')}</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>الإجراء السريع</th>
                </tr>
              </thead>
              <tbody>
                {sortedContracts.length === 0 ? (
                  <tr><td colSpan={10} style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا توجد عقود مطابقة 🔍</td></tr>
                ) : sortedContracts.map((emp) => {
                  const req = getLatestRequest(emp.employee_code);
                  const daysLeft = getDaysRemaining(emp.contract_end_date);
                  
                  let remainingLabel = <span style={{ color: '#64748b' }}>—</span>;
                  if (daysLeft !== null) {
                    if (daysLeft < 0) remainingLabel = <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>منتهي ({Math.abs(daysLeft)} يوم)</span>;
                    else if (daysLeft <= 60) remainingLabel = <span style={{ background: '#fffbe1', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>متبقي {daysLeft} يوم</span>;
                    else remainingLabel = <span style={{ background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>متبقي {daysLeft} يوم</span>;
                  }
                  if (emp.contract_type === 'دائم') remainingLabel = <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>عقد دائم</span>;

                  let reqBadge = <span style={{ color: '#94a3b8', fontSize: '10px' }}>لا يوجد طلب</span>;
                  if (req?.status === 'Pending') reqBadge = <span style={{ background: '#eff6ff', color: '#3b82f6', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>⏳ تحت الاعتماد</span>;
                  if (req?.status === 'Approved') reqBadge = <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>✅ معتمد</span>;
                  if (req?.status === 'Rejected') reqBadge = <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>❌ مرفوض</span>;

                  let signBadge = <span style={{ color: '#94a3b8', fontSize: '10px' }}>—</span>;
                  if (req?.status === 'Approved') {
                    if (req.signature_status === 'تم التوقيع') signBadge = <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>📜 تم التوقيع</span>;
                    else signBadge = <span style={{ background: '#fff7ed', color: '#ea580c', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>✍️ يرجى التوقيع</span>;
                  }

                  return (
                    <tr key={emp.employee_code} style={{ borderBottom: '1px solid #f1f5f9', background: selectedEmpCodes.includes(emp.employee_code) ? '#eef2ff' : 'transparent', transition: 'background 0.2s' }}>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <input type="checkbox" checked={selectedEmpCodes.includes(emp.employee_code)} onChange={() => toggleSelection(emp.employee_code)} style={{ cursor: 'pointer', accentColor: '#4f46e5' }} />
                      </td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#4f46e5', fontFamily: 'monospace' }}>{emp.employee_code}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name}</td>
                      <td style={{ padding: '10px', color: '#64748b', fontWeight: '500' }}>{emp.department || '—'}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#334155' }}>{emp.contract_type}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace' }}>{emp.contract_end_date || '—'}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>{remainingLabel}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>{reqBadge}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>{signBadge}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          
                          {(!req || req.status === 'Rejected' || (req.status === 'Approved' && req.signature_status === 'تم التوقيع')) ? (
                            <button onClick={() => openSingleRenewal(emp)} style={{ background: '#f8fafc', color: '#4f46e5', border: '1px solid #c7d2fe', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                              + إنشاء نموذج
                            </button>
                          ) : (
                            <button onClick={() => setWorkflowModal({ isOpen: true, emp, req })} style={{ background: '#4f46e5', color: '#ffffff', border: 0, padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)' }}>
                              🔄 متابعة النموذج
                            </button>
                          )}

                          <button onClick={() => openEditModal(emp)} style={{ background: '#ffffff', color: '#64748b', border: '1px solid #e2e8f0', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
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

      {/* 🚀 نافذة الـ Workflow (معدلة لتناسب صلاحيات المتابعة والتوقيع فقط) */}
      {workflowModal.isOpen && workflowModal.req && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '450px', background: '#ffffff', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#4f46e5', fontWeight: '900' }}>🔄 متابعة النموذج (Workflow)</h3>
              <button onClick={() => setWorkflowModal({ isOpen: false })} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <div style={{ marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}>الموظف: {workflowModal.emp.employee_name}</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>رقم النموذج: {workflowModal.req.request_id}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #cbd5e1', paddingTop: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>تاريخ الانتهاء المقترح:</span>
                <span style={{ fontSize: '14px', fontWeight: '900', color: '#10b981', fontFamily: 'monospace' }}>{workflowModal.req.new_contract_end_date}</span>
              </div>
            </div>

            {/* حالة: نماذج تحت الاعتماد */}
            {workflowModal.req.status === 'Pending' && (
              <div>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#1e40af', fontWeight: 'bold', textAlign: 'center' }}>
                  ⏳ النموذج تم إنشاؤه بنجاح وحالياً قيد مراجعة واعتماد الإدارة. <br/>
                  <span style={{ fontSize: '11px', color: '#3b82f6', marginTop: '6px', display: 'block' }}>(صلاحية الاعتماد أو الرفض تتم من شاشة "طلبات التجديد")</span>
                </div>
                <button onClick={() => setWorkflowModal({ isOpen: false })} style={{ width: '100%', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                  حسناً، إغلاق نافذة المتابعة
                </button>
              </div>
            )}

            {/* حالة: معتمد ولكن ينتظر التوقيع */}
            {workflowModal.req.status === 'Approved' && workflowModal.req.signature_status !== 'تم التوقيع' && (
              <div>
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: '#c2410c', fontWeight: 'bold', textAlign: 'center' }}>
                  ⚠️ التجديد معتمد إدارياً. يرجى طباعة العقد والحصول على توقيع الموظف.
                </div>
                <button onClick={() => handleWorkflowAction('sign')} disabled={actionLoading} style={{ width: '100%', background: '#4f46e5', color: '#fff', border: 0, padding: '14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '14px', cursor: actionLoading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 10px rgba(79,70,229,0.3)' }}>
                  ✍️ تأكيد استلام توقيع الموظف
                </button>
                <p style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'center', marginTop: '8px' }}>
                  بالضغط هنا، سيتم تحديث تاريخ نهاية عقد الموظف بالبيانات الجديدة أوتوماتيكياً.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* نافذة إنشاء نموذج تجديد (الفردي والمجمع) */}
      {modalState.isOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ width: '500px', background: '#ffffff', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '18px', color: '#0f172a', textAlign: 'center', fontWeight: '900' }}>
              {modalState.type === 'single' ? `إنشاء نموذج تجديد لـ (${modalState.emp?.employee_name})` : `إنشاء نماذج تجديد لـ (${selectedEmpCodes.length}) موظف`}
            </h3>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', color: renewalMode === 'months' ? '#4f46e5' : '#64748b', cursor: 'pointer' }}>
                <input type="radio" name="renewalMode" checked={renewalMode === 'months'} onChange={() => setRenewalMode('months')} style={{ accentColor: '#4f46e5' }} /> تجديد بالشهور (تلقائي)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', color: renewalMode === 'custom' ? '#4f46e5' : '#64748b', cursor: 'pointer' }}>
                <input type="radio" name="renewalMode" checked={renewalMode === 'custom'} onChange={() => setRenewalMode('custom')} style={{ accentColor: '#4f46e5' }} /> تاريخ انتهاء مخصص
              </label>
            </div>
            {renewalMode === 'months' && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>يرجى اختيار مدة التجديد بالشهور:</label>
                <select value={renewalMonths} onChange={(e) => setRenewalMonths(Number(e.target.value))} style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }}>
                  <option value={1}>شهر واحد (1 شهر)</option><option value={2}>شهران (2 شهر)</option><option value={3}>3 شهور (ربع سنوي)</option><option value={6}>6 شهور (نصف سنوي)</option><option value={9}>9 شهور</option><option value={12}>12 شهر (سنة كاملة)</option><option value={24}>24 شهر (سنتين)</option><option value={36}>36 شهر (3 سنوات)</option>
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
              <div style={{ textAlign: 'left', fontSize: '13px', marginBottom: '24px', direction: 'ltr', background: '#eef2ff', padding: '12px', borderRadius: '8px', border: '1px solid #c7d2fe' }}>
                <span style={{ color: '#4f46e5', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '14px' }}>
                  {renewalMode === 'months' ? calculateNewEndDate(modalState.emp?.contract_end_date, renewalMonths) : (customEndDate || '—')}
                </span>
                <span style={{ color: '#64748b', fontWeight: 'bold', marginLeft: '6px' }}>:تاريخ الانتهاء المتوقع</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '10px', direction: 'rtl' }}>
              <button onClick={confirmRenewalAction} disabled={actionLoading} style={{ background: '#4f46e5', color: '#fff', border: 0, padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>
                ✅ {actionLoading ? 'جاري التنفيذ...' : 'إرسال للاعتماد للإدارة'}
              </button>
              <button onClick={() => setModalState({ isOpen: false, type: 'single' })} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة إنشاء عقد جديد تماماً */}
      {isNewContractModalOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '520px', background: '#ffffff', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>📝 طلب إنشاء عقد جديد</h3>
              <button onClick={() => setIsNewContractModalOpen(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleCreateBrandNewContract}>
              <div style={{ marginBottom: '16px', position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>اختر الموظف *</label>
                <input type="text" required placeholder="ابحث بالاسم أو الكود..." value={empSearchTerm} onChange={(e) => { setEmpSearchTerm(e.target.value); setSelectedEmployeeCode(''); setShowEmpDropdown(true); }} onFocus={() => setShowEmpDropdown(true)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }} />
                {showEmpDropdown && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowEmpDropdown(false)} />
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto', zIndex: 10 }}>
                      {activeEmployees.filter(emp => String(emp.employee_name || '').toLowerCase().includes((empSearchTerm || '').toLowerCase()) || String(emp.employee_code || '').toLowerCase().includes((empSearchTerm || '').toLowerCase())).map((emp) => (
                        <div key={emp.employee_code} onClick={() => { setSelectedEmployeeCode(emp.employee_code); setEmpSearchTerm(`${emp.employee_name} (${emp.employee_code})`); setShowEmpDropdown(false); }} style={{ padding: '12px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontWeight: 'bold', color: '#0f172a' }}>
                          {emp.employee_name} ({emp.employee_code})
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>نوع العقد الجديد *</label>
                <select value={newContractType} onChange={(e) => setNewContractType(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }}>
                  {STANDARD_CONTRACT_TYPES.map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div><label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>بداية العقد *</label><input type="date" required value={newContractStartDate} onChange={(e) => setNewContractStartDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }} /></div>
                <div><label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>نهاية العقد *</label><input type="date" required disabled={newContractType === 'دائم'} value={newContractEndDate} onChange={(e) => setNewContractEndDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setIsNewContractModalOpen(false)} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading} style={{ background: '#4f46e5', color: '#fff', border: 0, padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري الحفظ...' : 'إنشاء وتحديث العقد 📄'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editModal.isOpen && editModal.emp && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '480px', background: '#ffffff', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#4f46e5', fontWeight: '900' }}>✏️ تعديل بيانات العقد</h3>
              <button onClick={() => setEditModal({ isOpen: false })} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleEditContract}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>نوع العقد *</label>
                <select value={editContractType} onChange={(e) => setEditContractType(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }}>
                  {STANDARD_CONTRACT_TYPES.map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div><label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>بداية العقد</label><input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }} /></div>
                <div><label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>نهاية العقد</label><input type="date" disabled={editContractType === 'دائم'} value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setEditModal({ isOpen: false })} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading} style={{ background: '#4f46e5', color: '#fff', border: 0, padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isTerminateModalOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '480px', background: '#ffffff', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#dc2626', fontWeight: '900' }}>🚫 تحويل للانتظار / إنهاء تعاقد</h3>
              <button onClick={() => setIsTerminateModalOpen(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleTerminateContract}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>البحث عن الموظف *</label>
                <input type="text" list="term-employees-list" required placeholder="🔍 اكتب كود أو اسم الموظف..." value={termSearchTerm} onChange={(e) => { const val = e.target.value; setTermSearchTerm(val); const code = val.split(' - ')[0]; const emp = activeEmployees.find(e => e.employee_code === code); if (emp) { setTerminateEmployeeCode(code); setTerminateDate(emp.contract_end_date || new Date().toISOString().split('T')[0]); } else { setTerminateEmployeeCode(''); setTerminateDate(new Date().toISOString().split('T')[0]); } }} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }} />
                <datalist id="term-employees-list">{activeEmployees.map((emp) => <option key={emp.employee_code} value={`${emp.employee_code} - ${emp.employee_name}`} />)}</datalist>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>سبب إنهاء الخدمة / التحويل *</label>
                <select value={termReason} onChange={e => setTermReason(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }}>
                  <option value="استقالة">استقالة</option><option value="إنهاء عقد">إنهاء عقد</option><option value="إنهاء خدمات">إنهاء خدمات</option>
                </select>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>تاريخ الإنهاء الفعلي *</label>
                <input type="date" required value={terminateDate} onChange={e => setTerminateDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setIsTerminateModalOpen(false)} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading || !terminateEmployeeCode} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading || !terminateEmployeeCode ? 'not-allowed' : 'pointer' }}>تأكيد الإنهاء والتحويل</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
