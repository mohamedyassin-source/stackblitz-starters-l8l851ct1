'use client';

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// تهيئة الاتصال المباشر بـ Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const STANDARD_CONTRACT_TYPES = [
  'محدد المدة',
  'محدد المدة - فوق السن',
  'محدد المدة - مكافأة شاملة',
  'دائم'
];

export default function ContractsPage() {
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
  const [selectedReqStatus, setSelectedReqStatus] = useState(''); 
  
  // 🗂️ فلتر الكروت العلوية
  const [activeFilterCard, setActiveFilterCard] = useState<'all' | 'fixed' | 'overage' | 'expiring' | 'expired'>('all');

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

  // 🌟 ترتيب تلقائي عند اختيار شهر
  useEffect(() => {
    if (expiryMonth) {
      setSortColumn('days_left');
      setSortDirection('asc'); 
    }
  }, [expiryMonth]);

  useEffect(() => {
    const jumpCode = localStorage.getItem('jumpSearch');
    if (jumpCode) {
      setSearchTerm(jumpCode);
      setTimeout(() => localStorage.removeItem('jumpSearch'), 1000);
    }
    fetchData();
  }, []);

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
      if (data.length < step) break;
      from += step;
    }
    return allRows;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [allEmps, allContracts, allRens] = await Promise.all([
        fetchAllRows('employees'),
        fetchAllRows('contracts', '*', { col: 'status', val: 'Active' }),
        fetchAllRows('renewals')
      ]);

      const contractsMap = new Map<string, any[]>();
      allContracts.forEach(c => {
        if (!c) return;
        const code = String(c.employee_code || '').trim().replace(/^0+/, '');
        if (!contractsMap.has(code)) contractsMap.set(code, []);
        contractsMap.get(code)?.push(c);
      });

      const mergedEmps = allEmps.filter(e => e).map(emp => {
        const empCodeClean = String(emp.employee_code || '').trim().replace(/^0+/, '');
        const empContracts = contractsMap.get(empCodeClean) || [];

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
      setRenewals(allRens.filter(r => r));
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getDaysRemaining = (endDateStr: string | null | undefined) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const getRenewalStatusInfo = (empCode: string) => {
    if (!empCode) return { text: 'لم يُطلب / متاح', color: 'var(--muted)', locked: false };
    const empRens = renewals
      .filter((r) => r && String(r.employee_code || '').trim() === String(empCode).trim())
      .sort((a, b) => String(b.request_id || '').localeCompare(String(a.request_id || '')));
    const latest = empRens[0];
    
    if (!latest || latest.status === 'Rejected') return { text: 'لم يُطلب / متاح', color: 'var(--muted)', locked: false };
    if (latest.status === 'Pending') return { text: 'تحت الاعتماد ⏳', color: 'var(--stamp-blue)', locked: true };
    if (latest.status === 'Approved' && latest.signature_status !== 'تم التوقيع') return { text: 'بانتظار التوقيع ✍️', color: 'var(--stamp-amber)', locked: true };
    if (latest.status === 'Approved' && latest.signature_status === 'تم التوقيع') return { text: 'تم توقيع العقد ✅', color: 'var(--stamp-green)', locked: false };
    
    return { text: 'لم يُطلب / متاح', color: 'var(--muted)', locked: false };
  };

  // 🌟 نظام الفلترة الذكي المحدث والمحصن بالكامل
  const filteredContracts = useMemo(() => {
    return employees.filter((emp) => {
      if (!emp) return false;
      
      const term = String(searchTerm || '').toLowerCase();
      const days = getDaysRemaining(emp.contract_end_date);
      const reqInfo = getRenewalStatusInfo(String(emp.employee_code || ''));
      
      const matchesSearch = !term || 
        String(emp.employee_code || '').toLowerCase().includes(term) || 
        String(emp.employee_name || '').toLowerCase().includes(term) || 
        String(emp.department || '').toLowerCase().includes(term);
        
      const matchesDept = !selectedDept || String(emp.department || '') === selectedDept;
      const matchesType = !selectedType || String(emp.contract_type || '') === selectedType;
      
      let matchesExpiryMonth = true;
      if (expiryMonth) {
        matchesExpiryMonth = emp.contract_end_date && String(emp.contract_end_date).startsWith(expiryMonth);
      }

      let matchesCard = true;
      if (activeFilterCard === 'fixed') matchesCard = String(emp.contract_type || '').includes('محدد');
      if (activeFilterCard === 'overage') matchesCard = String(emp.contract_type || '').includes('فوق السن');
      if (activeFilterCard === 'expiring') matchesCard = days !== null && days <= 60 && days >= 0;
      if (activeFilterCard === 'expired') matchesCard = days !== null && days < 0;

      let matchesReqStatus = true;
      if (selectedReqStatus) {
        if (selectedReqStatus === 'no_request') matchesReqStatus = reqInfo.text.includes('متاح');
        else if (selectedReqStatus === 'pending') matchesReqStatus = reqInfo.text.includes('تحت الاعتماد');
        else if (selectedReqStatus === 'approved_not_signed') matchesReqStatus = reqInfo.text.includes('بانتظار التوقيع');
        else if (selectedReqStatus === 'signed') matchesReqStatus = reqInfo.text.includes('تم توقيع العقد');
      }

      return matchesSearch && matchesDept && matchesType && matchesExpiryMonth && matchesCard && matchesReqStatus;
    });
  }, [employees, searchTerm, selectedDept, selectedType, expiryMonth, activeFilterCard, selectedReqStatus, renewals]);

  const sortedContracts = useMemo(() => {
    return [...filteredContracts].sort((a, b) => {
      if (!a) return 1;
      if (!b) return -1;
      
      let valA: any = a[sortColumn] || '';
      let valB: any = b[sortColumn] || '';

      if (sortColumn === 'days_left') {
        valA = getDaysRemaining(a.contract_end_date) ?? (sortDirection === 'asc' ? 99999 : -99999);
        valB = getDaysRemaining(b.contract_end_date) ?? (sortDirection === 'asc' ? 99999 : -99999);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      const res = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? res : -res;
    });
  }, [filteredContracts, sortColumn, sortDirection]);

  // 🌟 دوال مساعدة آمنة
  const activeEmployees = useMemo(() => {
    return employees.filter(e => e && e.status !== 'Inactive' && e.status !== 'Terminated' && e.contract_type !== 'إنهاء تعاقد');
  }, [employees]);
  
  const totalAll = activeEmployees.length;
  const totalFixedContracts = activeEmployees.filter(e => String(e.contract_type || '').includes('محدد')).length;
  const overAgeContracts = activeEmployees.filter(e => String(e.contract_type || '').includes('فوق السن')).length;
  const expiringSoonCount = activeEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d <= 60 && d >= 0; }).length;
  const expiredCount = activeEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d < 0; }).length;

  const deptsList = Array.from(new Set(employees.filter(e => e && e.department).map((e) => e.department)));
  const typesList = Array.from(new Set(employees.filter(e => e && e.contract_type && e.contract_type !== '—').map((e) => e.contract_type)));

  const handleSort = (col: string) => { setSortDirection(sortColumn === col && sortDirection === 'asc' ? 'desc' : 'asc'); setSortColumn(col); };
  const renderSortArrow = (col: string) => sortColumn !== col ? <span style={{opacity:0.3, marginRight:'4px'}}>↕</span> : sortDirection==='asc' ? <span style={{color:'var(--stamp-blue)', marginRight:'4px'}}>▲</span> : <span style={{color:'var(--stamp-blue)', marginRight:'4px'}}>▼</span>;
  
  const toggleSelection = (code: string) => {
    const safeCode = String(code);
    setSelectedEmpCodes(prev => prev.includes(safeCode) ? prev.filter(c => c !== safeCode) : [...prev, safeCode]);
  };
  
  const toggleAll = () => {
    if (selectedEmpCodes.length === sortedContracts.length && sortedContracts.length > 0) {
      setSelectedEmpCodes([]);
    } else {
      setSelectedEmpCodes(sortedContracts.filter(e => e).map(e => String(e.employee_code)));
    }
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

  const confirmRenewalAction = async () => {
    if (renewalMode === 'custom' && !customEndDate) return alert('يرجى إدخال تاريخ الانتهاء المخصص.');
    setActionLoading(true);

    if (modalState.type === 'single' && modalState.emp) {
      const emp = modalState.emp;
      const targetEndDate = renewalMode === 'months' ? calculateNewEndDate(emp.contract_end_date, renewalMonths) : customEndDate;
      const [reqId] = generateSequentialIds(1);
      const parsedCode = parseInt(emp.employee_code, 10);

      const payload: any = {
        request_id: reqId,
        employee_code: parsedCode,
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
      const { error } = await supabase.from('renewals').insert([payload]);
      setActionLoading(false); setModalState({ isOpen: false, type: 'single' });
      if (error) alert('خطأ: ' + error.message); else fetchData();
    } else if (modalState.type === 'bulk') {
      const selectedEmps = employees.filter(e => e && selectedEmpCodes.includes(String(e.employee_code)));
      const reqIds = generateSequentialIds(selectedEmps.length);
      const payloads = selectedEmps.map((emp, index) => {
        const targetEndDate = renewalMode === 'months' ? calculateNewEndDate(emp.contract_end_date, renewalMonths) : customEndDate;
        return {
          request_id: reqIds[index], employee_code: parseInt(emp.employee_code, 10), employee_name: emp.employee_name,
          department: emp.department, job_title: emp.job_title, company: emp.company,
          contract_end_date: emp.contract_end_date, new_contract_end_date: targetEndDate,
          renewal_months: renewalMode === 'months' ? renewalMonths : null, status: 'Pending',
          signature_status: 'قيد التوقيع', request_date: new Date().toISOString().split('T')[0],
        };
      });
      const { error } = await supabase.from('renewals').insert(payloads);
      setActionLoading(false); setModalState({ isOpen: false, type: 'single' });
      if (error) alert('خطأ: ' + error.message); else { alert('تم إنشاء الطلبات بنجاح!'); setSelectedEmpCodes([]); fetchData(); }
    }
  };

  const handleEditContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.emp) return;
    setActionLoading(true);
    const parsedCode = parseInt(editModal.emp.employee_code, 10);
    if (editModal.emp.contract_id) {
      await supabase.from('contracts').update({ contract_type: editContractType, contract_start_date: editStartDate, contract_end_date: editEndDate }).eq('contract_id', editModal.emp.contract_id);
    } else {
      await supabase.from('contracts').insert([{ employee_code: parsedCode, contract_type: editContractType, contract_start_date: editStartDate, contract_end_date: editEndDate, status: 'Active' }]);
    }
    setActionLoading(false); alert('تم التعديل ✅'); setEditModal({ isOpen: false }); fetchData();
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm('تأكيد الحذف؟')) return;
    setIsDeleting(true);
    const parsedCodes = selectedEmpCodes.map(c => parseInt(c, 10));
    await supabase.from('contracts').delete().in('employee_code', parsedCodes);
    await supabase.from('employees').delete().in('employee_code', parsedCodes);
    alert('تم الحذف ✅'); setSelectedEmpCodes([]); fetchData(); setIsDeleting(false);
  };

  const handleTerminateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminateEmployeeCode) return;
    setActionLoading(true);
    const parsedCode = parseInt(terminateEmployeeCode, 10);
    await supabase.from('employees').update({ department: 'تحويلات تحت الاعتماد', status: 'Inactive', termination_date: terminateDate, termination_reason: termReason }).eq('employee_code', parsedCode);
    await supabase.from('contracts').update({ status: 'Inactive', contract_end_date: terminateDate }).eq('employee_code', parsedCode).eq('status', 'Active');
    setActionLoading(false); alert('تم التحويل ✅'); setIsTerminateModalOpen(false); fetchData();
  };

  const handleCreateBrandNewContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeCode) return;
    setActionLoading(true);
    const emp = employees.find((e) => e && String(e.employee_code) === String(selectedEmployeeCode));
    const [reqId] = generateSequentialIds(1);
    const parsedCode = parseInt(emp.employee_code, 10);
    await supabase.from('renewals').insert([{ request_id: reqId, employee_code: parsedCode, employee_name: emp.employee_name, department: emp.department, job_title: emp.job_title, company: emp.company, contract_end_date: emp.contract_end_date || newContractStartDate, new_contract_end_date: newContractEndDate, status: 'Pending', signature_status: 'قيد التوقيع', request_date: new Date().toISOString().split('T')[0] }]);
    await supabase.from('contracts').update({ status: 'Archived' }).eq('employee_code', parsedCode).eq('status', 'Active');
    await supabase.from('contracts').insert([{ employee_code: parsedCode, contract_type: newContractType, contract_start_date: newContractStartDate, contract_end_date: newContractEndDate, status: 'Active' }]);
    setActionLoading(false); setIsNewContractModalOpen(false); alert('تم إنشاء العقد ✅'); fetchData();
  };

  return (
    <div style={{ paddingBottom: '40px', direction: 'rtl' }}>
      <style>{`
        .stat-card {
          background: var(--paper-card); padding: 20px; border-radius: 16px; border: 1px solid var(--line);
          display: flex; justify-content: space-between; align-items: center; cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); position: relative; overflow: hidden;
        }
        .stat-card:hover { transform: translateY(-5px); box-shadow: 0 12px 20px -8px rgba(0,0,0,0.15); border-color: var(--muted); }
        .stat-card.active-all { border: 2px solid var(--muted); background: var(--paper); }
        .stat-card.active-fixed { border: 2px solid var(--stamp-blue); background: var(--stamp-blue-bg); }
        .stat-card.active-overage { border: 2px solid var(--stamp-purple); background: var(--stamp-purple-bg); }
        .stat-card.active-expiring { border: 2px solid var(--stamp-amber); background: var(--stamp-amber-bg); }
        .stat-card.active-expired { border: 2px solid var(--stamp-red); background: var(--stamp-red-bg); }
        .icon-box { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
        .db-action-bar { background: #0f172a; color: #fff; padding: 12px 20px; border-radius: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; animation: fadeIn 0.3s; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2); }
      `}</style>

      {/* الهيدر والزراير العلوية */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: 'var(--navy-950)', fontWeight: '900' }}>📄 العقود الحالية السارية</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)', fontWeight: 'bold' }}>إدارة ومتابعة وتجديد عقود الموظفين النشطين</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => { setTerminateEmployeeCode(''); setTermSearchTerm(''); setIsTerminateModalOpen(true); }} style={{ background: 'var(--stamp-red)', color: '#fff', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>🚫 تحويل للانتظار (إنهاء)</button>
          <button onClick={() => { setSelectedEmployeeCode(''); setEmpSearchTerm(''); setShowEmpDropdown(false); setIsNewContractModalOpen(true); }} style={{ background: 'var(--paper-card)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>📝 طلب إنشاء عقد جديد</button>
        </div>
      </div>

      {/* الكروت التفاعلية الخمسة */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className={`stat-card ${activeFilterCard === 'all' ? 'active-all' : ''}`} onClick={() => setActiveFilterCard('all')}>
          <div><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div className="icon-box" style={{ background: 'var(--paper)' }}>🌍</div><div><p style={{ margin: 0, fontSize: '13px', fontWeight: '900', color: 'var(--ink)' }}>إجمالي العقود</p></div></div></div>
          <div style={{ textAlign: 'left' }}><div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--ink)' }}>{totalAll.toLocaleString()}</div></div>
        </div>
        <div className={`stat-card ${activeFilterCard === 'fixed' ? 'active-fixed' : ''}`} onClick={() => setActiveFilterCard('fixed')}>
          <div><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div className="icon-box" style={{ background: 'var(--stamp-blue-bg)', color: 'var(--stamp-blue)' }}>📑</div><div><p style={{ margin: 0, fontSize: '13px', fontWeight: '900', color: 'var(--ink)' }}>محددة المدة</p></div></div></div>
          <div style={{ textAlign: 'left' }}><div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--stamp-blue)' }}>{totalFixedContracts.toLocaleString()}</div></div>
        </div>
        <div className={`stat-card ${activeFilterCard === 'overage' ? 'active-overage' : ''}`} onClick={() => setActiveFilterCard('overage')}>
          <div><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div className="icon-box" style={{ background: 'var(--stamp-purple-bg)', color: 'var(--stamp-purple)' }}>🌟</div><div><p style={{ margin: 0, fontSize: '13px', fontWeight: '900', color: 'var(--ink)' }}>فوق السن</p></div></div></div>
          <div style={{ textAlign: 'left' }}><div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--stamp-purple)' }}>{overAgeContracts.toLocaleString()}</div></div>
        </div>
        <div className={`stat-card ${activeFilterCard === 'expiring' ? 'active-expiring' : ''}`} onClick={() => setActiveFilterCard('expiring')}>
          <div><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div className="icon-box" style={{ background: 'var(--stamp-amber-bg)', color: 'var(--stamp-amber)' }}>⏳</div><div><p style={{ margin: 0, fontSize: '13px', fontWeight: '900', color: 'var(--ink)' }}>ينتهي قريباً</p></div></div></div>
          <div style={{ textAlign: 'left' }}><div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--stamp-amber)' }}>{expiringSoonCount.toLocaleString()}</div></div>
        </div>
        <div className={`stat-card ${activeFilterCard === 'expired' ? 'active-expired' : ''}`} onClick={() => setActiveFilterCard('expired')}>
          <div><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div className="icon-box" style={{ background: 'var(--stamp-red-bg)', color: 'var(--stamp-red)' }}>🚨</div><div><p style={{ margin: 0, fontSize: '13px', fontWeight: '900', color: 'var(--ink)' }}>منتهي المدة</p></div></div></div>
          <div style={{ textAlign: 'left' }}><div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--stamp-red)' }}>{expiredCount.toLocaleString()}</div></div>
        </div>
      </div>

      {/* شريط الإجراءات السريعة للمحددين */}
      {selectedEmpCodes.length > 0 && (
        <div className="db-action-bar">
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
            تم تحديد <span style={{ color: '#38bdf8', fontSize: '14px' }}>{selectedEmpCodes.length}</span> عقود
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={openBulkRenewal} style={{ background: '#3b82f6', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
              ⚙️ توليد نماذج تجديد مجمعة
            </button>
            <button onClick={handleDeleteSelected} disabled={isDeleting} style={{ background: '#ef4444', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: isDeleting ? 'not-allowed' : 'pointer', opacity: isDeleting ? 0.7 : 1 }}>
              {isDeleting ? 'جاري الحذف...' : 'حذف نهائي 🗑️'}
            </button>
            <button onClick={() => setSelectedEmpCodes([])} style={{ background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer' }}>
              إلغاء التحديد ✕
            </button>
          </div>
        </div>
      )}

      {/* 🌟 شريط الفلاتر والبحث */}
      <div className="no-print" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '16px', borderRadius: '12px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', direction: 'rtl' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="بحث بالاسم أو الكود..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', minWidth: '180px', fontWeight: 'bold' }} />
          
          <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
            <option value="">الإدارة (الكل)</option>
            {deptsList.map((d: any, i) => (<option key={i} value={d}>{d}</option>))}
          </select>
          
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
            <option value="">أنواع العقود (الكل)</option>
            {typesList.map((t: any, i) => (<option key={i} value={t}>{t}</option>))}
          </select>

          {/* 🌟 فلتر حالة التجديد */}
          <select value={selectedReqStatus} onChange={(e) => setSelectedReqStatus(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--stamp-blue)', color: 'var(--stamp-blue)', background: 'var(--stamp-blue-bg)', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
            <option value="">حالة التجديد (الكل)</option>
            <option value="no_request">متاح للطلب (لم يتم إجراء)</option>
            <option value="pending">⏳ تحت الاعتماد</option>
            <option value="approved_not_signed">✍️ بانتظار التوقيع</option>
            <option value="signed">✅ تم التوقيع والانتهاء</option>
          </select>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'var(--paper)', padding: '4px', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginLeft: '8px', paddingRight: '8px' }}>شهر الانتهاء:</span>
            <input type="month" value={expiryMonth} onChange={e => setExpiryMonth(e.target.value)} style={{ padding: '6px', border: '0', background: 'transparent', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} />
          </div>

          <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedType(''); setExpiryMonth(''); setSelectedReqStatus(''); setActiveFilterCard('all'); }} style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '10px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
            إعادة ضبط
          </button>
        </div>
        <div style={{ fontSize: '12px', fontWeight: '900', color: 'var(--navy-950)' }}>
          النتائج بالجدول: <span style={{ color: 'var(--stamp-blue)' }}>{sortedContracts.length}</span> عقد
        </div>
      </div>

      {/* 🚀 الجدول الرئيسي مع الترتيب */}
      <div className="table-responsive no-print" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', borderRadius: '12px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', color: 'var(--muted)' }}>جاري سحب بيانات العقود من Supabase... ⏳</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ padding: '14px 12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedEmpCodes.length > 0 && selectedEmpCodes.length === sortedContracts.length} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: 'var(--stamp-blue)' }} />
                </th>
                <th onClick={() => handleSort('employee_code')} style={{ padding: '14px 12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>الكود {renderSortArrow('employee_code')}</th>
                <th onClick={() => handleSort('employee_name')} style={{ padding: '14px 12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>الموظف {renderSortArrow('employee_name')}</th>
                <th onClick={() => handleSort('department')} style={{ padding: '14px 12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>الإدارة {renderSortArrow('department')}</th>
                <th onClick={() => handleSort('job_title')} style={{ padding: '14px 12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>الوظيفة {renderSortArrow('job_title')}</th>
                <th onClick={() => handleSort('contract_type')} style={{ padding: '14px 12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>النوع {renderSortArrow('contract_type')}</th>
                <th onClick={() => handleSort('contract_end_date')} style={{ padding: '14px 12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>الانتهاء {renderSortArrow('contract_end_date')}</th>
                <th onClick={() => handleSort('days_left')} style={{ padding: '14px 12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>المتبقي {renderSortArrow('days_left')}</th>
                <th style={{ padding: '14px 12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>حالة التجديد</th>
                <th style={{ padding: '14px 12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', textAlign: 'center' }}>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {sortedContracts.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', fontWeight: 'bold' }}>لا توجد عقود مطابقة 🔍</td></tr>
              ) : sortedContracts.map((emp) => {
                const statusInfo = getRenewalStatusInfo(String(emp.employee_code || ''));
                const isTerminated = emp.status === 'Inactive' || emp.status === 'Terminated' || emp.contract_type === 'إنهاء تعاقد';
                const daysLeft = getDaysRemaining(emp.contract_end_date);
                let remainingLabel = <span style={{ color: 'var(--muted)' }}>—</span>;
                if (daysLeft !== null) {
                  if (daysLeft < 0) remainingLabel = <span style={{ color: 'var(--stamp-red)', fontWeight: 'bold' }}>منتهي ({Math.abs(daysLeft)} يوم)</span>;
                  else if (daysLeft <= 60) remainingLabel = <span style={{ color: 'var(--stamp-amber)', fontWeight: 'bold' }}>متبقي {daysLeft} يوم</span>;
                  else remainingLabel = <span style={{ color: 'var(--stamp-green)', fontWeight: 'bold' }}>متبقي {daysLeft} يوم</span>;
                }

                return (
                  <tr key={emp.employee_code} style={{ borderBottom: '1px solid var(--line)', background: isTerminated ? '#fef2f2' : selectedEmpCodes.includes(String(emp.employee_code)) ? '#f0fdfa' : 'transparent', transition: 'background 0.2s' }}>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedEmpCodes.includes(String(emp.employee_code))} onChange={() => toggleSelection(String(emp.employee_code))} disabled={statusInfo.locked || isTerminated} style={{ cursor: statusInfo.locked || isTerminated ? 'not-allowed' : 'pointer', accentColor: 'var(--stamp-blue)' }} />
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: 'var(--stamp-blue)', fontFamily: 'monospace' }}>{emp.employee_code}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: 'var(--ink)' }}>{emp.employee_name}</td>
                    <td style={{ padding: '12px', color: 'var(--muted)', fontWeight: 'bold' }}>{emp.department || '—'}</td>
                    <td style={{ padding: '12px', color: 'var(--muted)', fontWeight: 'bold' }}>{emp.job_title || '—'}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: isTerminated ? '#dc2626' : '#0f172a' }}>{isTerminated ? 'إنهاء تعاقد' : emp.contract_type}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', fontFamily: 'monospace' }}>{emp.contract_end_date || '—'}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>{remainingLabel}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', fontSize: '10.5px' }}><span style={{ color: statusInfo.color, background: 'var(--paper)', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${statusInfo.color}30` }}>{statusInfo.text}</span></td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          onClick={() => openSingleRenewal(emp)}
                          disabled={statusInfo.locked || actionLoading || isTerminated}
                          style={{ background: statusInfo.locked || isTerminated ? '#e2e8f0' : '#10b981', color: statusInfo.locked || isTerminated ? '#94a3b8' : '#fff', border: 0, padding: '6px 12px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 'bold', cursor: statusInfo.locked || actionLoading || isTerminated ? 'not-allowed' : 'pointer' }}
                        >
                          + نموذج
                        </button>
                        <button
                          onClick={() => openEditModal(emp)}
                          disabled={actionLoading || isTerminated}
                          style={{ background: isTerminated ? '#e2e8f0' : '#3b82f6', color: isTerminated ? '#94a3b8' : '#fff', border: 0, padding: '6px 12px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 'bold', cursor: actionLoading || isTerminated ? 'not-allowed' : 'pointer' }}
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

      {/* النوافذ المنبثقة: إنهاء - إضافة - تعديل */}
      {isTerminateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '480px', background: 'var(--paper-card)', borderRadius: '16px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--stamp-red)', fontWeight: '900' }}>🚫 تحويل للانتظار / إنهاء تعاقد</h3>
              <button onClick={() => setIsTerminateModalOpen(false)} style={{ background: 'var(--paper)', border: 0, color: 'var(--muted)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            
            <form onSubmit={handleTerminateContract}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>البحث عن الموظف (بالكود أو الاسم) *</label>
                <input
                  type="text" list="term-employees-list" required placeholder="🔍 اكتب كود أو اسم الموظف..."
                  value={termSearchTerm}
                  onChange={(e) => {
                    const val = e.target.value; setTermSearchTerm(val); const code = val.split(' - ')[0];
                    const emp = employees.find(e => e && String(e.employee_code) === String(code) && e.status !== 'Inactive' && e.status !== 'Terminated');
                    if (emp) { setTerminateEmployeeCode(code); setTerminateDate(emp.contract_end_date || new Date().toISOString().split('T')[0]); } else { setTerminateEmployeeCode(''); setTerminateDate(new Date().toISOString().split('T')[0]); }
                  }}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', background: 'var(--paper)' }}
                />
                <datalist id="term-employees-list">
                  {employees.filter(emp => emp && emp.status !== 'Inactive' && emp.status !== 'Terminated').map((emp) => (
                    <option key={emp.employee_code} value={`${emp.employee_code} - ${emp.employee_name}`} />
                  ))}
                </datalist>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>سبب إنهاء الخدمة / التحويل *</label>
                <select value={termReason} onChange={e => setTermReason(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold' }}>
                  <option value="استقالة">استقالة</option><option value="إنهاء عقد">إنهاء عقد</option><option value="إنهاء خدمات">إنهاء خدمات</option><option value="بلوغ سن">بلوغ سن (تقاعد)</option><option value="انقطاع عن العمل">انقطاع عن العمل</option><option value="نقل شركة شقيقة">نقل شركة شقيقة</option>
                </select>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>تاريخ الإنهاء الفعلي *</label>
                <input type="date" required value={terminateDate} onChange={e => setTerminateDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setIsTerminateModalOpen(false)} style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading || !terminateEmployeeCode} style={{ background: 'var(--stamp-red)', color: '#fff', border: 0, padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: (actionLoading || !terminateEmployeeCode) ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري التنفيذ...' : 'تأكيد الإنهاء والتحويل'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isNewContractModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '520px', background: 'var(--paper-card)', borderRadius: '16px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950)', fontWeight: '900' }}>📝 طلب إنشاء عقد جديد تماماً</h3>
              <button onClick={() => setIsNewContractModalOpen(false)} style={{ background: 'var(--stamp-red-bg)', border: 0, color: 'var(--stamp-red)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleCreateBrandNewContract}>
              <div style={{ marginBottom: '16px', position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>اختر الموظف (ابحث بالاسم أو الكود) *</label>
                <input
                  type="text" required placeholder="اكتب اسم الموظف أو الكود..." value={empSearchTerm}
                  onChange={(e) => { setEmpSearchTerm(e.target.value); setSelectedEmployeeCode(''); setShowEmpDropdown(true); }}
                  onFocus={() => setShowEmpDropdown(true)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', background: 'var(--paper)' }}
                />
                {showEmpDropdown && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowEmpDropdown(false)} />
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--paper-card)', border: '1px solid var(--line)', borderRadius: '8px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto', zIndex: 10, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                      {(() => {
                        const filteredEmps = employees
                          .filter(emp => emp && emp.status !== 'Inactive' && emp.status !== 'Terminated')
                          .filter(emp => String(emp.employee_name || '').toLowerCase().includes(String(empSearchTerm || '').toLowerCase()) || String(emp.employee_code || '').toLowerCase().includes(String(empSearchTerm || '').toLowerCase()));
                        return (
                          <>
                            {filteredEmps.map((emp) => (
                              <div key={emp.employee_code} onClick={() => { setSelectedEmployeeCode(String(emp.employee_code)); setEmpSearchTerm(`${emp.employee_name} (${emp.employee_code})`); setShowEmpDropdown(false); }} style={{ padding: '12px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid var(--line)', fontWeight: 'bold', color: 'var(--navy-950)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--paper)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                {emp.employee_name} ({emp.employee_code}) - [{emp.contract_type || 'دائم'}]
                              </div>
                            ))}
                            {filteredEmps.length === 0 && (<div style={{ padding: '16px', fontSize: '12px', color: 'var(--muted)', textAlign: 'center', fontWeight: 'bold' }}>لا توجد نتائج مطابقة 🔍</div>)}
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>نوع العقد الجديد *</label>
                <select value={newContractType} onChange={(e) => setNewContractType(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', background: 'var(--paper)' }}>
                  <option value="محدد المدة">محدد المدة</option><option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option><option value="عقد محدد المدة - مكافأة شاملة">عقد محدد المدة - مكافأة شاملة</option><option value="مهمة/مشروع">عقد مشروع/مهمة محدودة</option><option value="دائم">دائم (غير محدد المدة)</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div><label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>بداية العقد *</label><input type="date" required value={newContractStartDate} onChange={(e) => setNewContractStartDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} /></div>
                <div><label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>نهاية العقد *</label><input type="date" required disabled={newContractType === 'دائم'} value={newContractEndDate} onChange={(e) => setNewContractEndDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace', background: newContractType === 'دائم' ? 'var(--paper)' : 'transparent' }} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setIsNewContractModalOpen(false)} style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading} style={{ background: 'var(--brass-600)', color: '#fff', border: 0, padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري الحفظ...' : 'إنشاء وتحديث العقد 📄'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalState.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ width: '500px', background: 'var(--paper-card)', borderRadius: '16px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', direction: 'rtl' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '18px', color: 'var(--ink)', textAlign: 'center', fontWeight: '900' }}>
              {modalState.type === 'single' ? `إنشاء نموذج تجديد لـ (${modalState.emp?.employee_name})` : `إنشاء نماذج تجديد لـ (${selectedEmpCodes.length}) موظف`}
            </h3>
            <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', color: renewalMode === 'months' ? 'var(--brass-600)' : 'var(--muted)', cursor: 'pointer' }}>
                <input type="radio" name="renewalMode" checked={renewalMode === 'months'} onChange={() => setRenewalMode('months')} style={{ accentColor: 'var(--brass-600)' }} /> تجديد بالشهور (تلقائي)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', color: renewalMode === 'custom' ? 'var(--brass-600)' : 'var(--muted)', cursor: 'pointer' }}>
                <input type="radio" name="renewalMode" checked={renewalMode === 'custom'} onChange={() => setRenewalMode('custom')} style={{ accentColor: 'var(--brass-600)' }} /> تاريخ انتهاء مخصص
              </label>
            </div>
            {renewalMode === 'months' && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>يرجى اختيار مدة التجديد بالشهور:</label>
                <select value={renewalMonths} onChange={(e) => setRenewalMonths(Number(e.target.value))} style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', background: 'var(--paper-card)' }}>
                  <option value={1}>شهر واحد (1 شهر)</option><option value={2}>شهران (2 شهر)</option><option value={3}>3 شهور (ربع سنوي)</option><option value={6}>6 شهور (نصف سنوي)</option><option value={9}>9 شهور</option><option value={12}>12 شهر (سنة كاملة)</option><option value={24}>24 شهر (سنتين)</option><option value={36}>36 شهر (3 سنوات)</option>
                </select>
              </div>
            )}
            {renewalMode === 'custom' && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>حدد تاريخ انتهاء العقد الجديد يدوياً:</label>
                <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} />
              </div>
            )}
            {modalState.type === 'single' && (
              <div style={{ textAlign: 'left', fontSize: '13px', marginBottom: '24px', direction: 'ltr', background: 'var(--paper)', padding: '12px', borderRadius: '8px' }}>
                <span style={{ color: 'var(--stamp-green)', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '14px' }}>
                  {renewalMode === 'months' ? calculateNewEndDate(modalState.emp?.contract_end_date, renewalMonths) : (customEndDate || '—')}
                </span>
                <span style={{ color: 'var(--muted)', fontWeight: 'bold', marginLeft: '6px' }}>:تاريخ الانتهاء المتوقع</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '10px', direction: 'rtl' }}>
              <button onClick={confirmRenewalAction} disabled={actionLoading} style={{ background: 'var(--stamp-blue)', color: '#fff', border: 0, padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', cursor: actionLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>✅ {actionLoading ? 'جاري التنفيذ...' : 'إرسال للاعتماد للإدارة'}</button>
              <button onClick={() => setModalState({ isOpen: false, type: 'single' })} style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--muted)', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {editModal.isOpen && editModal.emp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '480px', background: 'var(--paper-card)', borderRadius: '16px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--stamp-blue)', fontWeight: '900' }}>✏️ تعديل بيانات العقد</h3>
              <button onClick={() => setEditModal({ isOpen: false })} style={{ background: 'var(--paper)', border: 0, color: 'var(--muted)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            
            <form onSubmit={handleEditContract}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>نوع العقد *</label>
                <select value={editContractType} onChange={(e) => setEditContractType(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', background: 'var(--paper)' }}>
                  <option value="محدد المدة">محدد المدة</option><option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option><option value="عقد محدد المدة - مكافأة شاملة">عقد محدد المدة - مكافأة شاملة</option><option value="مهمة/مشروع">عقد مشروع/مهمة محدودة</option><option value="دائم">دائم (غير محدد المدة)</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div><label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>تاريخ بداية العقد</label><input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} /></div>
                <div><label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>تاريخ نهاية العقد</label><input type="date" disabled={editContractType === 'دائم'} value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace', background: editContractType === 'دائم' ? 'var(--paper)' : 'transparent' }} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setEditModal({ isOpen: false })} style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading} style={{ background: 'var(--stamp-blue)', color: '#fff', border: 0, padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
