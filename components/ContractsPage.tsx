'use client';

import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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
  const [termReason, setTermReason] = useState('انتهاء عقد');

  const [editModal, setEditModal] = useState<{ isOpen: boolean; emp?: any }>({ isOpen: false });
  const [editContractType, setEditContractType] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  // 🌟 نافذة المتابعة
  const [workflowModal, setWorkflowModal] = useState<{ isOpen: boolean; emp?: any; req?: any }>({ isOpen: false });

  // 🎂 دالة حساب العمر بالسنوات من تاريخ الميلاد
  const calculateAge = (birthDateRaw: string | null | undefined) => {
    if (!birthDateRaw) return null;
    const birthDate = new Date(birthDateRaw);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

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
        fetchAllRows('renewal_requests')
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
    if (!empCode) return { text: 'متاح للطلب', color: 'var(--muted)', locked: false };
    const empRens = renewals
      .filter((r) => r && String(r.employee_code || '').trim() === String(empCode).trim())
      .sort((a, b) => String(b.request_id || '').localeCompare(String(a.request_id || '')));
    const latest = empRens[0];
    
    if (!latest || latest.status === 'Rejected') return { text: 'متاح للطلب', color: 'var(--muted)', locked: false };
    
    if (latest.status === 'Pending_Project_Manager' || latest.status === 'Pending') return { text: 'اعتماد المشروع ⏳', color: 'var(--stamp-blue)', locked: true };
    if (latest.status === 'Pending_General_Manager') return { text: 'اعتماد الإدارة ⏳', color: 'var(--stamp-blue)', locked: true };
    
    if (latest.status === 'Approved' && latest.signature_status !== 'تم التوقيع') return { text: 'بانتظار التوقيع ✍️', color: 'var(--stamp-amber)', locked: true };
    if (latest.status === 'Approved' && latest.signature_status === 'تم التوقيع') return { text: 'تم توقيع العقد ✅', color: 'var(--stamp-green)', locked: false };
    
    return { text: 'متاح للطلب', color: 'var(--muted)', locked: false };
  };

  const filteredContracts = useMemo(() => {
    const term = String(searchTerm || '').trim().toLowerCase();
    const isSearching = term.length > 0;

    return employees.filter((emp) => {
      if (!emp) return false;
      
      const empDept = String(emp.department || '');
      const empJob = String(emp.job_title || '');
      const empType = String(emp.contract_type || '');
      const empStatus = String(emp.status || '');

      const isHiddenDept = empDept.includes('تحويلات');
      const isHiddenJob = empJob.startsWith('ايقاف راتب');
      const isTerminated = empStatus === 'Inactive' || empStatus === 'Terminated' || empType === 'إنهاء تعاقد';

      if (!isSearching && (isHiddenDept || isHiddenJob || isTerminated)) {
        return false;
      }

      const matchesSearch = !isSearching || 
        String(emp.employee_code || '').toLowerCase().includes(term) || 
        String(emp.employee_name || '').toLowerCase().includes(term) || 
        empDept.toLowerCase().includes(term) ||
        empJob.toLowerCase().includes(term);

      if (!matchesSearch) return false;

      const days = getDaysRemaining(emp.contract_end_date);
      const reqInfo = getRenewalStatusInfo(String(emp.employee_code || ''));
      
      const matchesDept = !selectedDept || empDept === selectedDept;
      const matchesType = !selectedType || empType === selectedType;
      
      let matchesExpiryMonth = true;
      if (expiryMonth) {
        matchesExpiryMonth = emp.contract_end_date && String(emp.contract_end_date).startsWith(expiryMonth);
      }

      let matchesCard = true;
      if (activeFilterCard === 'fixed') matchesCard = empType.includes('محدد');
      if (activeFilterCard === 'overage') matchesCard = empType.includes('فوق السن') || (calculateAge(emp.birth_date) ?? 0) >= 60;
      if (activeFilterCard === 'expiring') matchesCard = days !== null && days <= 60 && days >= 0;
      if (activeFilterCard === 'expired') matchesCard = days !== null && days < 0;

      let matchesReqStatus = true;
      if (selectedReqStatus) {
        if (selectedReqStatus === 'no_request') matchesReqStatus = reqInfo.text.includes('متاح');
        else if (selectedReqStatus === 'pending') matchesReqStatus = reqInfo.text.includes('اعتماد');
        else if (selectedReqStatus === 'approved_not_signed') matchesReqStatus = reqInfo.text.includes('بانتظار التوقيع');
        else if (selectedReqStatus === 'signed') matchesReqStatus = reqInfo.text.includes('تم توقيع');
      }

      return matchesDept && matchesType && matchesExpiryMonth && matchesCard && matchesReqStatus;
    });
  }, [employees, searchTerm, selectedDept, selectedType, expiryMonth, activeFilterCard, selectedReqStatus, renewals]);

  const sortedContracts = useMemo(() => {
    return [...filteredContracts].sort((a, b) => {
      if (!a) return 1;
      if (!b) return -1;
      
      let valA: any = a[sortColumn] || '';
      let valB: any = b[sortColumn] || '';

      if (sortColumn === 'age') {
        valA = calculateAge(a.birth_date) ?? -1;
        valB = calculateAge(b.birth_date) ?? -1;
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      if (sortColumn === 'days_left') {
        valA = getDaysRemaining(a.contract_end_date) ?? (sortDirection === 'asc' ? 99999 : -99999);
        valB = getDaysRemaining(b.contract_end_date) ?? (sortDirection === 'asc' ? 99999 : -99999);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      
      if (sortColumn === 'req_status') {
        valA = getRenewalStatusInfo(String(a.employee_code)).text;
        valB = getRenewalStatusInfo(String(b.employee_code)).text;
      }

      const res = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? res : -res;
    });
  }, [filteredContracts, sortColumn, sortDirection, renewals]);

  const activeEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (!emp) return false;
      const empDept = String(emp.department || '');
      const empJob = String(emp.job_title || '');
      const empType = String(emp.contract_type || '');
      const empStatus = String(emp.status || '');
      
      const isHiddenDept = empDept.includes('تحويلات');
      const isHiddenJob = empJob.startsWith('ايقاف راتب');
      const isTerminated = empStatus === 'Inactive' || empStatus === 'Terminated' || empType === 'إنهاء تعاقد';

      return !isHiddenDept && !isHiddenJob && !isTerminated;
    });
  }, [employees]);
  
  const totalAll = activeEmployees.length;
  const totalFixedContracts = activeEmployees.filter(e => String(e.contract_type || '').includes('محدد')).length;
  const overAgeContracts = activeEmployees.filter(e => String(e.contract_type || '').includes('فوق السن') || (calculateAge(e.birth_date) ?? 0) >= 60).length;
  const expiringSoonCount = activeEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d <= 60 && d >= 0; }).length;
  const expiredCount = activeEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d < 0; }).length;

  const deptsList = Array.from(new Set(employees.filter(e => e && e.department).map((e) => e.department)));
  const typesList = Array.from(new Set(employees.filter(e => e && e.contract_type && e.contract_type !== '—').map((e) => e.contract_type)));
  
  const calcPct = (val: number) => totalAll > 0 ? ((val / totalAll) * 100).toFixed(1) : '0';

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

  const calculateRetirementDate = (birthDate: string | null | undefined) => {
    if (!birthDate) return null;
    const date = new Date(birthDate);
    if (isNaN(date.getTime())) return null;
    date.setFullYear(date.getFullYear() + 60);
    return date.toISOString().split('T')[0];
  };
  
  const openBulkRenewal = () => {
    if (selectedEmpCodes.length === 0) return alert('يرجى تحديد موظفين أولاً');
    setRenewalMode('months'); setRenewalMonths(12); setCustomEndDate(''); setModalState({ isOpen: true, type: 'bulk' });
  };

  const openSingleRenewal = (emp: any) => {
    setRenewalMode('months'); setRenewalMonths(12); setCustomEndDate(''); setModalState({ isOpen: true, type: 'single', emp });
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
      
      const retirementDateStr = calculateRetirementDate(emp.birth_date);
      if (retirementDateStr && new Date(targetEndDate) > new Date(retirementDateStr)) {
        alert(`🚨 توقف - تجاوز سن التقاعد!\n\nالموظف: ${emp.employee_name}\nتاريخ بلوغ السن (60): ${retirementDateStr}\nتاريخ انتهاء العقد المقترح: ${targetEndDate}\n\nيُمنع النظام استكمال الطلب. يرجى اختيار "تاريخ انتهاء مخصص" بحيث لا يتجاوز تاريخ بلوغ السن أعلاه.`);
        setActionLoading(false);
        return;
      }

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
        status: 'Pending_Project_Manager',
        signature_status: 'قيد التوقيع',
        request_date: new Date().toISOString().split('T')[0],
      };
      const { error } = await supabase.from('renewal_requests').insert([payload]);
      setActionLoading(false); setModalState({ isOpen: false, type: 'single' });
      if (error) alert('خطأ: ' + error.message); else fetchData();
      
    } else if (modalState.type === 'bulk') {
      const selectedEmps = employees.filter(e => e && selectedEmpCodes.includes(String(e.employee_code)));
      
      const problematicEmps: string[] = [];
      selectedEmps.forEach(emp => {
        const targetEndDate = renewalMode === 'months' ? calculateNewEndDate(emp.contract_end_date, renewalMonths) : customEndDate;
        const retDate = calculateRetirementDate(emp.birth_date);
        if (retDate && new Date(targetEndDate) > new Date(retDate)) {
          problematicEmps.push(`- ${emp.employee_name} (يبلغ السن في ${retDate})`);
        }
      });

      if (problematicEmps.length > 0) {
        alert(`🚨 توقف - يوجد موظفين سيتجاوزون سن التقاعد (60):\n\n${problematicEmps.join('\n')}\n\nيرجى إلغاء تحديدهم من القائمة، وتجديد عقودهم بشكل فردي بتاريخ لا يتجاوز سن تقاعدهم.`);
        setActionLoading(false);
        return;
      }

      const reqIds = generateSequentialIds(selectedEmps.length);
      const payloads = selectedEmps.map((emp, index) => {
        const targetEndDate = renewalMode === 'months' ? calculateNewEndDate(emp.contract_end_date, renewalMonths) : customEndDate;
        return {
          request_id: reqIds[index], employee_code: parseInt(emp.employee_code, 10), employee_name: emp.employee_name,
          department: emp.department, job_title: emp.job_title, company: emp.company,
          contract_end_date: emp.contract_end_date, new_contract_end_date: targetEndDate,
          renewal_months: renewalMode === 'months' ? renewalMonths : null, 
          status: 'Pending_Project_Manager',
          signature_status: 'قيد التوقيع', request_date: new Date().toISOString().split('T')[0],
        };
      });
      const { error } = await supabase.from('renewal_requests').insert(payloads);
      setActionLoading(false); setModalState({ isOpen: false, type: 'single' });
      if (error) alert('خطأ: ' + error.message); else { alert('تم إرسال النماذج لاعتماد المشروع بنجاح!'); setSelectedEmpCodes([]); fetchData(); }
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
    const parsedCode = parseInt(editModal.emp.employee_code, 10);
    if (editModal.emp.contract_id) {
      await supabase.from('contracts').update({ contract_type: editContractType, contract_start_date: editStartDate, contract_end_date: editEndDate }).eq('contract_id', editModal.emp.contract_id);
    } else {
      await supabase.from('contracts').insert([{ employee_code: parsedCode, contract_type: editContractType, contract_start_date: editStartDate, contract_end_date: editEndDate, status: 'Active' }]);
    }
    setActionLoading(false); alert('تم التعديل ✅'); setEditModal({ isOpen: false }); fetchData();
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm('تأكيد الحذف؟ هذا الإجراء سيقوم بحذف الموظفين وعقودهم نهائياً.')) return;
    setIsDeleting(true);
    const parsedCodes = selectedEmpCodes.map(c => parseInt(c, 10));
    await supabase.from('contracts').delete().in('employee_code', parsedCodes);
    await supabase.from('employees').delete().in('employee_code', parsedCodes);
    alert('تم الحذف بنجاح ✅'); setSelectedEmpCodes([]); fetchData(); setIsDeleting(false);
  };

  const handleDeleteSingleContract = async (emp: any) => {
    if (!window.confirm(`هل أنت متأكد من حذف الموظف (${emp.employee_name}) وعقده نهائياً من قاعدة البيانات؟\nهذا الإجراء لا يمكن التراجع عنه.`)) return;
    
    setActionLoading(true);
    try {
      const parsedCode = parseInt(emp.employee_code, 10);
      await supabase.from('contracts').delete().eq('employee_code', parsedCode);
      await supabase.from('employees').delete().eq('employee_code', parsedCode);
      alert('تم حذف الموظف والعقد بنجاح ✅');
      fetchData();
    } catch (err: any) {
      alert('حدث خطأ أثناء الحذف: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTerminateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminateEmployeeCode) return;
    setActionLoading(true);
    const parsedCode = parseInt(terminateEmployeeCode, 10);
    await supabase.from('employees').update({ department: 'تحويلات تحت الاعتماد', status: 'Inactive', termination_date: terminateDate, termination_reason: termReason }).eq('employee_code', parsedCode);
    await supabase.from('contracts').update({ status: 'Inactive', contract_end_date: terminateDate }).eq('employee_code', parsedCode).eq('status', 'Active');
    setActionLoading(false); alert('تم التحويل للانتظار بنجاح ✅'); setIsTerminateModalOpen(false); fetchData();
  };

  const handleCreateBrandNewContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeCode) return;
    setActionLoading(true);
    const emp = employees.find((e) => e && String(e.employee_code) === String(selectedEmployeeCode));
    
    const retirementDateStr = calculateRetirementDate(emp?.birth_date);
    if (retirementDateStr && new Date(newContractEndDate) > new Date(retirementDateStr)) {
      alert(`🚨 توقف - تجاوز سن التقاعد!\n\nالموظف: ${emp.employee_name}\nتاريخ بلوغ السن (60): ${retirementDateStr}\n\nيُرجى تعديل "نهاية العقد" ليكون بحد أقصى تاريخ بلوغ السن.`);
      setActionLoading(false);
      return;
    }

    const [reqId] = generateSequentialIds(1);
    const parsedCode = parseInt(emp.employee_code, 10);
    await supabase.from('renewal_requests').insert([{ request_id: reqId, employee_code: parsedCode, employee_name: emp.employee_name, department: emp.department, job_title: emp.job_title, company: emp.company, contract_end_date: emp.contract_end_date || newContractStartDate, new_contract_end_date: newContractEndDate, status: 'Pending_Project_Manager', signature_status: 'قيد التوقيع', request_date: new Date().toISOString().split('T')[0] }]);
    await supabase.from('contracts').update({ status: 'Archived' }).eq('employee_code', parsedCode).eq('status', 'Active');
    await supabase.from('contracts').insert([{ employee_code: parsedCode, contract_type: newContractType, contract_start_date: newContractStartDate, contract_end_date: newContractEndDate, status: 'Active' }]);
    setActionLoading(false); setIsNewContractModalOpen(false); alert('تم إنشاء العقد وإرساله لاعتماد المشروع ✅'); fetchData();
  };

  return (
    <div style={{ paddingBottom: '40px', direction: 'rtl' }}>
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
        .db-action-bar { background: #0f172a; color: #fff; padding: 12px 20px; border-radius: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; animation: fadeIn 0.3s; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2); }
      `}</style>

      {/* الهيدر */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900' }}>📄 العقود الحالية والسارية</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>إدارة شاملة لدورة حياة العقود ومتابعة أعمار الموظفين وسن التقاعد</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => { setTerminateEmployeeCode(''); setTermSearchTerm(''); setIsTerminateModalOpen(true); }} style={{ background: '#ffffff', color: '#dc2626', border: '1px solid #fecaca', padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>🚫 تحويل للانتظار</button>
          <button onClick={() => { setSelectedEmployeeCode(''); setEmpSearchTerm(''); setShowEmpDropdown(false); setIsNewContractModalOpen(true); }} style={{ background: '#0f172a', color: '#ffffff', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>📝 إنشاء عقد لموظف جديد</button>
        </div>
      </div>

      {/* 📊 الكروت العلوية */}
      <div className="no-print" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px' }}>
          
          <div className={`modern-stat-card ${activeFilterCard === 'all' ? 'active' : ''}`} style={{ '--theme-color': '#3b82f6', '--icon-bg': '#eff6ff' } as React.CSSProperties} onClick={() => setActiveFilterCard('all')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>إجمالي العقود</span>
              <div className="card-icon-box">🌍</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{totalAll.toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>100% (القوة)</div>
            </div>
          </div>

          <div className={`modern-stat-card ${activeFilterCard === 'fixed' ? 'active' : ''}`} style={{ '--theme-color': '#10b981', '--icon-bg': '#ecfdf5' } as React.CSSProperties} onClick={() => setActiveFilterCard('fixed')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>عقود محددة</span>
              <div className="card-icon-box">📂</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{totalFixedContracts.toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>{calcPct(totalFixedContracts)}% نسبة</div>
            </div>
          </div>

          <div className={`modern-stat-card ${activeFilterCard === 'overage' ? 'active' : ''}`} style={{ '--theme-color': '#f97316', '--icon-bg': '#fff7ed' } as React.CSSProperties} onClick={() => setActiveFilterCard('overage')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>فوق السن (60+)</span>
              <div className="card-icon-box">👴</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{overAgeContracts.toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>{calcPct(overAgeContracts)}% نسبة</div>
            </div>
          </div>

          <div className={`modern-stat-card ${activeFilterCard === 'expiring' ? 'active' : ''}`} style={{ '--theme-color': '#8b5cf6', '--icon-bg': '#f3e8ff' } as React.CSSProperties} onClick={() => setActiveFilterCard('expiring')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>ينتهي قريباً</span>
              <div className="card-icon-box">⏳</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{expiringSoonCount.toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>{calcPct(expiringSoonCount)}% نسبة</div>
            </div>
          </div>

          <div className={`modern-stat-card ${activeFilterCard === 'expired' ? 'active' : ''}`} style={{ '--theme-color': '#ef4444', '--icon-bg': '#fef2f2' } as React.CSSProperties} onClick={() => setActiveFilterCard('expired')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>منتهي المدة</span>
              <div className="card-icon-box">🚨</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{expiredCount.toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>{calcPct(expiredCount)}% نسبة</div>
            </div>
          </div>

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
              ⚙️ إنشاء نماذج تجديد مجمعة
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
      <div className="no-print" style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', direction: 'rtl', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="بحث بالاسم أو الكود..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', minWidth: '180px', fontWeight: 'bold' }} />
          
          <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
            <option value="">الإدارة (الكل)</option>
            {deptsList.map((d: any, i) => (<option key={i} value={d}>{d}</option>))}
          </select>
          
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
            <option value="">أنواع العقود (الكل)</option>
            {typesList.map((t: any, i) => (<option key={i} value={t}>{t}</option>))}
          </select>

          <select value={selectedReqStatus} onChange={(e) => setSelectedReqStatus(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', color: '#334155', background: '#f8fafc', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
            <option value="">حالة التجديد (الكل)</option>
            <option value="no_request">متاح للطلب (لم يتم إجراء)</option>
            <option value="pending">⏳ تحت الاعتماد (مشروع/إدارة)</option>
            <option value="approved_not_signed">✍️ بانتظار التوقيع</option>
            <option value="signed">✅ تم التوقيع والانتهاء</option>
          </select>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: '#f8fafc', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginLeft: '8px', paddingRight: '8px' }}>شهر الانتهاء:</span>
            <input type="month" value={expiryMonth} onChange={e => setExpiryMonth(e.target.value)} style={{ padding: '6px', border: '0', background: 'transparent', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} />
          </div>

          <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedType(''); setExpiryMonth(''); setSelectedReqStatus(''); setActiveFilterCard('all'); }} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '10px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer' }}>
            إعادة ضبط
          </button>
        </div>
        <div style={{ fontSize: '12px', fontWeight: '900', color: '#0f172a' }}>
          النتائج: <span style={{ color: '#4f46e5' }}>{sortedContracts.length}</span> عقد
        </div>
      </div>

      {/* 🚀 الجدول الرئيسي */}
      <div className="table-responsive no-print" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', color: '#64748b' }}>جاري سحب بيانات العقود والطلبات... ⏳</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedEmpCodes.length > 0 && selectedEmpCodes.length === sortedContracts.length} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: '#4f46e5' }} />
                </th>
                <th onClick={() => handleSort('employee_code')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الكود {renderSortArrow('employee_code')}</th>
                <th onClick={() => handleSort('employee_name')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الموظف {renderSortArrow('employee_name')}</th>
                
                {/* 🎂 رأس عمود السن */}
                <th onClick={() => handleSort('age')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>السن {renderSortArrow('age')}</th>
                
                <th onClick={() => handleSort('department')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الإدارة {renderSortArrow('department')}</th>
                <th onClick={() => handleSort('job_title')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الوظيفة {renderSortArrow('job_title')}</th>
                <th onClick={() => handleSort('contract_type')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>النوع {renderSortArrow('contract_type')}</th>
                <th onClick={() => handleSort('contract_end_date')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الانتهاء {renderSortArrow('contract_end_date')}</th>
                <th onClick={() => handleSort('days_left')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>المتبقي {renderSortArrow('days_left')}</th>
                <th onClick={() => handleSort('req_status')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>حالة النموذج {renderSortArrow('req_status')}</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'center' }}>الإجراء السريع</th>
              </tr>
            </thead>
            <tbody>
              {sortedContracts.length === 0 ? (
                <tr><td colSpan={11} style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا توجد عقود مطابقة للبحث 🔍</td></tr>
              ) : sortedContracts.map((emp) => {
                const reqInfo = getRenewalStatusInfo(String(emp.employee_code || ''));
                
                const empDept = String(emp.department || '');
                const empJob = String(emp.job_title || '');
                const empType = String(emp.contract_type || '');
                const empStatus = String(emp.status || '');
                
                const isHiddenDept = empDept.includes('تحويلات');
                const isHiddenJob = empJob.startsWith('ايقاف راتب');
                const isTerminated = empStatus === 'Inactive' || empStatus === 'Terminated' || empType === 'إنهاء تعاقد';
                const isInactiveVisual = isHiddenDept || isHiddenJob || isTerminated;

                const daysLeft = getDaysRemaining(emp.contract_end_date);
                const age = calculateAge(emp.birth_date);
                const isOverAgeContract = empType.includes('فوق السن');
                const isAgeSixtyOrAbove = age !== null && age >= 60;
                const isNearSixty = age !== null && age >= 59 && age < 60;

                let remainingLabel = <span style={{ color: '#64748b' }}>—</span>;
                if (daysLeft !== null) {
                  if (daysLeft < 0) remainingLabel = <span style={{ background: '#fef2f2', color: '#dc2626', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>منتهي ({Math.abs(daysLeft)} يوم)</span>;
                  else if (daysLeft <= 60) remainingLabel = <span style={{ background: '#fffbeb', color: '#d97706', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>متبقي {daysLeft} يوم</span>;
                  else remainingLabel = <span style={{ background: '#eff6ff', color: '#3b82f6', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>متبقي {daysLeft} يوم</span>;
                }
                if (empType === 'دائم') remainingLabel = <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>عقد دائم</span>;

                let reqBadge = <span style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'bold' }}>متاح للطلب</span>;
                if (reqInfo.text.includes('اعتماد')) reqBadge = <span style={{ background: '#eff6ff', color: '#3b82f6', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #bfdbfe' }}>⏳ تحت الاعتماد</span>;
                if (reqInfo.text.includes('بانتظار التوقيع')) reqBadge = <span style={{ background: '#fff7ed', color: '#ea580c', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #fed7aa' }}>✍️ بانتظار التوقيع</span>;
                if (reqInfo.text.includes('تم توقيع')) reqBadge = <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #bbf7d0' }}>📜 تم التوقيع</span>;

                return (
                  <tr key={emp.employee_code} style={{ borderBottom: '1px solid #f1f5f9', background: isInactiveVisual ? '#fef2f2' : selectedEmpCodes.includes(String(emp.employee_code)) ? '#eef2ff' : 'transparent', transition: 'background 0.2s' }}>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedEmpCodes.includes(String(emp.employee_code))} onChange={() => toggleSelection(String(emp.employee_code))} disabled={reqInfo.locked || isInactiveVisual} style={{ cursor: reqInfo.locked || isInactiveVisual ? 'not-allowed' : 'pointer', accentColor: '#4f46e5' }} />
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: isInactiveVisual ? '#ef4444' : '#4f46e5', fontFamily: 'monospace' }}>{emp.employee_code}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#0f172a' }}>
                      {emp.employee_name}
                      {isInactiveVisual && <span style={{ fontSize: '10px', color: '#ef4444', background: '#fee2e2', padding: '2px 6px', borderRadius: '4px', marginRight: '6px', border: '1px solid #fca5a5' }}>مستبعد / موقوف</span>}
                    </td>

                    {/* 🎂 خلايا عمود السن مع الـ Badges الذكية */}
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>
                      {age !== null ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                          <span style={{ fontSize: '12px', color: '#0f172a', fontFamily: 'monospace' }}>{age} سنة</span>
                          {(isOverAgeContract || isAgeSixtyOrAbove) && (
                            <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #ffedd5', padding: '2px 6px', borderRadius: '6px', fontSize: '9.5px', fontWeight: 'bold' }}>
                              👴 فوق السن
                            </span>
                          )}
                          {!isOverAgeContract && !isAgeSixtyOrAbove && isNearSixty && (
                            <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #dbeafe', padding: '2px 6px', borderRadius: '6px', fontSize: '9.5px', fontWeight: 'bold' }}>
                              ⏳ قريب من الـ 60
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '12px', color: '#64748b', fontWeight: '500' }}>{empDept || '—'}</td>
                    <td style={{ padding: '12px', color: '#64748b', fontWeight: '500' }}>{empJob || '—'}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: isTerminated ? '#ef4444' : '#334155' }}>
                      {isTerminated ? 'إنهاء تعاقد' : empType}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'bold', fontFamily: 'monospace' }}>{emp.contract_end_date || '—'}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>{remainingLabel}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>{reqBadge}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        
                        {(!reqInfo.locked && !reqInfo.text.includes('تم توقيع')) ? (
                          <button onClick={() => openSingleRenewal(emp)} disabled={isInactiveVisual} title="إنشاء نموذج تجديد" style={{ background: '#f8fafc', color: '#4f46e5', border: '1px solid #c7d2fe', padding: '6px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: isInactiveVisual ? 'not-allowed' : 'pointer' }}>
                            + نموذج
                          </button>
                        ) : (
                          <button onClick={() => setWorkflowModal({ isOpen: true, emp })} title="متابعة النموذج" style={{ background: '#4f46e5', color: '#ffffff', border: 0, padding: '6px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)' }}>
                            🔄 متابعة
                          </button>
                        )}
                        <button onClick={() => openEditModal(emp)} disabled={actionLoading || isInactiveVisual} title="تعديل العقد" style={{ background: '#ffffff', color: '#64748b', border: '1px solid #e2e8f0', padding: '6px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: actionLoading || isInactiveVisual ? 'not-allowed' : 'pointer' }}>
                          ✏️
                        </button>
                        <button onClick={() => handleDeleteSingleContract(emp)} disabled={actionLoading || isInactiveVisual} title="حذف العقد نهائياً" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '6px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: actionLoading || isInactiveVisual ? 'not-allowed' : 'pointer' }}>
                          🗑️
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

      {/* 🚀 نافذة المتابعة */}
      {workflowModal.isOpen && workflowModal.emp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '450px', background: '#ffffff', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#4f46e5', fontWeight: '900' }}>🔄 متابعة النموذج (Workflow)</h3>
              <button onClick={() => setWorkflowModal({ isOpen: false })} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <div style={{ marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}>الموظف: {workflowModal.emp.employee_name}</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>الكود: {workflowModal.emp.employee_code}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #cbd5e1', paddingTop: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>الحالة الحالية للنموذج:</span>
                <span style={{ fontSize: '13px', fontWeight: '900', color: '#10b981' }}>{getRenewalStatusInfo(String(workflowModal.emp.employee_code)).text}</span>
              </div>
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '16px', borderRadius: '12px', fontSize: '13px', color: '#1e40af', fontWeight: 'bold', textAlign: 'center' }}>
              ℹ️ هذا النموذج معروض للمتابعة فقط. <br/>
              <span style={{ fontSize: '11px', color: '#3b82f6', marginTop: '8px', display: 'block' }}>
                (صلاحيات الاعتماد متاحة في شاشة "طلبات التجديد"، وصلاحيات استلام التوقيع متاحة في شاشة "التوقيعات")
              </span>
            </div>
          </div>
        </div>
      )}

      {/* باقي النوافذ المنبثقة */}
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
                ✅ {actionLoading ? 'جاري التنفيذ...' : 'إرسال لاعتماد المشروع / الإدارة'}
              </button>
              <button onClick={() => setModalState({ isOpen: false, type: 'single' })} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

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
                        <div key={emp.employee_code} onClick={() => { setSelectedEmployeeCode(String(emp.employee_code)); setEmpSearchTerm(`${emp.employee_name} (${emp.employee_code})`); setShowEmpDropdown(false); }} style={{ padding: '12px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontWeight: 'bold', color: '#0f172a' }}>
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
                <input type="text" list="term-employees-list" required placeholder="🔍 اكتب كود أو اسم الموظف..." value={termSearchTerm} onChange={(e) => { const val = e.target.value; setTermSearchTerm(val); const code = val.split(' - ')[0]; const emp = activeEmployees.find(e => String(e.employee_code) === String(code)); if (emp) { setTerminateEmployeeCode(code); setTerminateDate(emp.contract_end_date || new Date().toISOString().split('T')[0]); } else { setTerminateEmployeeCode(''); setTerminateDate(new Date().toISOString().split('T')[0]); } }} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }} />
                <datalist id="term-employees-list">{activeEmployees.map((emp) => <option key={emp.employee_code} value={`${emp.employee_code} - ${emp.employee_name}`} />)}</datalist>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>سبب إنهاء الخدمة / التحويل *</label>
                <select value={termReason} onChange={e => setTermReason(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }}>
                  <option value="انتهاء عقد">انتهاء عقد</option>
                  <option value="إنهاء تعاقد">إنهاء تعاقد</option>
                  <option value="استقالة">استقالة</option>
                  <option value="إنهاء خدمات">إنهاء خدمات</option>
                  <option value="بلوغ سن">بلوغ سن (تقاعد)</option>
                  <option value="انقطاع عن العمل">انقطاع عن العمل</option>
                  <option value="نقل شركة شقيقة">نقل شركة شقيقة</option>
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
