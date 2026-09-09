'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useAppData } from '@/lib/DataContext'; 
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, query, where, getDocs, writeBatch, setDoc } from 'firebase/firestore';

export default function ContractsPage() {
  // 🌟 استدعاء البيانات المكيشة بسرعة فائقة من Firebase
  const { employees: rawEmployees = [], contracts: rawContracts = [], renewals: rawRenewals = [], loading: globalLoading, refresh: refreshGlobalData } = useAppData();

  const [actionLoading, setActionLoading] = useState(false);

  // 🌟 دمج العقود والموظفين في الذاكرة (Memory) فوراً
  const employees = useMemo(() => {
    const contractsMap = new Map<string, any>();
    rawContracts.forEach((c: any) => {
      const code = String(c.employee_code || '').trim();
      if (code) contractsMap.set(code, c);
    });

    return rawEmployees.map((emp: any) => {
      const code = String(emp.employee_code || '').trim();
      const myContract = contractsMap.get(code) || {};
      return {
        ...emp,
        contract_id: myContract.id || null, 
        contract_type: myContract.contract_type || emp.contract_type,
        contract_start_date: myContract.contract_start_date || emp.contract_start_date,
        contract_end_date: myContract.contract_end_date || emp.contract_end_date,
      };
    });
  }, [rawEmployees, rawContracts]);

  const renewals = rawRenewals;

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
  const [deptSearchFilter, setDeptSearchFilter] = useState('');
  const deptDropdownRef = useRef<HTMLDivElement>(null);
  
  const [selectedType, setSelectedType] = useState('');
  const [expiryStatus, setExpiryStatus] = useState('');

  // حالة الترتيب
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // حالة التحديد المجمع
  const [selectedEmpCodes, setSelectedEmpCodes] = useState<string[]>([]);

  // 🌟 ترقيم الصفحات (Pagination) لتسريع الأداء 10x
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50; 

  // حالات النوافذ المنبثقة
  const [modalState, setModalState] = useState<{ isOpen: boolean; type: 'single' | 'bulk'; emp?: any }>({ isOpen: false, type: 'single' });
  const [renewalMode, setRenewalMode] = useState<'months' | 'custom'>('months');
  const [renewalMonths, setRenewalMonths] = useState<number>(12);
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const [isNewContractModalOpen, setIsNewContractModalOpen] = useState(false);
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState('');
  const [empSearchTerm, setEmpSearchTerm] = useState('');
  const [newContractStartDate, setNewContractStartDate] = useState('');
  const [newContractEndDate, setNewContractEndDate] = useState('');
  const [newContractType, setNewContractType] = useState('مكافأة شاملة');

  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);
  const [terminateEmployeeCode, setTerminateEmployeeCode] = useState('');
  const [terminateSearchTerm, setTerminateSearchTerm] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editEmpData, setEditEmpData] = useState<any>(null);

  const [isReactivateModalOpen, setIsReactivateModalOpen] = useState(false);
  const [reactivateEmployeeCode, setReactivateEmployeeCode] = useState('');
  const [reactivateSearchTerm, setReactivateSearchTerm] = useState('');
  const [reactivateDept, setReactivateDept] = useState('');

  const [createdRequestData, setCreatedRequestData] = useState<any>(null);

  // إغلاق قائمة الإدارات عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(event.target as Node)) {
        setIsDeptDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const jumpCode = localStorage.getItem('jumpSearch');
    if (jumpCode) {
      setSearchTerm(jumpCode);
      setTimeout(() => localStorage.removeItem('jumpSearch'), 1000);
    }
  }, []);

  const isValidYear = (dateStr: string) => {
    if (!dateStr) return false;
    const year = parseInt(dateStr.split('-')[0], 10);
    return year >= 2000 && year <= 2099;
  };

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const calculateNewEndDate = (oldDateStr: string | undefined, months: number) => {
    if (!oldDateStr) return null; 
    const date = new Date(oldDateStr);
    if (isNaN(date.getTime())) return null; 
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
    const empRens = renewals.filter((r) => String(r.employee_code) === String(empCode)).sort((a, b) => b.request_id.localeCompare(a.request_id));
    const latest = empRens[0];
    if (!latest) return { text: 'متاح للتجديد', color: 'var(--muted)', locked: false };
    if (latest.status === 'Pending') return { text: 'قيد المعالجة', color: '#2563eb', locked: true };
    if (latest.status === 'Approved' && latest.signature_status !== 'تم التوقيع') return { text: 'في انتظار التوقيع', color: '#ea580c', locked: true };
    if (latest.status === 'Approved' && latest.signature_status === 'تم التوقيع') return { text: 'تم توقيع العقد ✅', color: '#15803d', locked: false };
    if (latest.status === 'Rejected') return { text: 'الطلب الأخير مرفوض ❌', color: '#dc2626', locked: false };
    return { text: 'متاح للتجديد', color: 'var(--muted)', locked: false };
  };

  // 🌟 استبعاد كافة الموظفين التابعين لإدارات التحويلات
  const activeValidEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const dept = String(emp.department || '').trim().toLowerCase();
      const contractType = String(emp.contract_type || '').trim();
      const status = String(emp.status || 'Active').trim().toLowerCase();

      const isTransfer = dept.includes('تحويل') || dept.includes('تحت الاعتماد');
      const isTerminated = contractType === 'إنهاء تعاقد' || status === 'terminated' || status === 'inactive';

      return !isTransfer && !isTerminated;
    });
  }, [employees]);

  const deptsList = useMemo(() => {
    return Array.from(new Set(activeValidEmployees.map((e) => e.department).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b, 'ar'));
  }, [activeValidEmployees]);

  const filteredContracts = useMemo(() => {
    return activeValidEmployees.filter((emp) => {
      const term = searchTerm.toLowerCase();
      const days = getDaysRemaining(emp.contract_end_date);
      
      const matchesSearch = !term || String(emp.employee_code).toLowerCase().includes(term) || String(emp.employee_name).toLowerCase().includes(term) || String(emp.department).toLowerCase().includes(term);
      const matchesDept = selectedDepts.length === 0 || selectedDepts.includes(emp.department);
      
      let matchesType = true;
      if (selectedType) {
        if (selectedType === 'دائم_مجمع') matchesType = emp.contract_type?.includes('دائم') || emp.contract_type?.includes('غير محدد');
        else if (selectedType === 'محدد_مجمع') matchesType = emp.contract_type?.includes('محدد') && !emp.contract_type?.includes('فوق السن');
        else if (selectedType === 'فوق_السن_مجمع') matchesType = emp.contract_type?.includes('فوق السن');
        else if (selectedType === 'مكافأة_مجمع') matchesType = emp.contract_type?.includes('مكافأة') || emp.contract_type?.includes('مكافأه') || emp.contract_type?.includes('reward');
        else if (selectedType === 'filter_project') matchesType = emp.contract_type?.includes('مهمة') || emp.contract_type?.includes('مشروع');
        else matchesType = emp.contract_type === selectedType;
      }

      let matchesExpiry = true;
      if (expiryStatus === 'expiring_60') matchesExpiry = days !== null && days <= 60 && days >= 0;
      if (expiryStatus === 'expired') matchesExpiry = days !== null && days < 0;
      
      return matchesSearch && matchesDept && matchesType && matchesExpiry;
    });
  }, [activeValidEmployees, searchTerm, selectedDepts, selectedType, expiryStatus]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedContracts = useMemo(() => {
    return [...filteredContracts].sort((a, b) => {
      if (sortConfig) {
        const { key, direction } = sortConfig;
        let valA = key === 'days_remaining' ? (getDaysRemaining(a.contract_end_date) ?? 999999) : (a[key] ? String(a[key]).toLowerCase() : '');
        let valB = key === 'days_remaining' ? (getDaysRemaining(b.contract_end_date) ?? 999999) : (b[key] ? String(b[key]).toLowerCase() : '');
        
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
      }
      const daysA = getDaysRemaining(a.contract_end_date);
      const daysB = getDaysRemaining(b.contract_end_date);
      if (daysA === null) return 1;
      if (daysB === null) return -1;
      return daysA - daysB;
    });
  }, [filteredContracts, sortConfig]);

  // 🌟 تطبيق Pagination
  const totalPages = Math.ceil(sortedContracts.length / pageSize);
  const paginatedContracts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedContracts.slice(start, start + pageSize);
  }, [sortedContracts, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDepts, selectedType, expiryStatus]);

  // 📊 حساب الإحصائيات (بدون موظفي التحويلات)
  const activeWorkforce = activeValidEmployees.length || 1;
  const permanentCount = activeValidEmployees.filter(e => e.contract_type?.includes('دائم') || e.contract_type?.includes('غير محدد')).length;
  const permanentPct = ((permanentCount / activeWorkforce) * 100).toFixed(1);
  const fixedCount = activeValidEmployees.filter(e => e.contract_type?.includes('محدد') && !e.contract_type?.includes('فوق السن')).length;
  const fixedPct = ((fixedCount / activeWorkforce) * 100).toFixed(1);
  const overAgeCount = activeValidEmployees.filter(e => e.contract_type?.includes('فوق السن')).length;
  const overAgePct = ((overAgeCount / activeWorkforce) * 100).toFixed(1);
  const rewardCount = activeValidEmployees.filter(e => e.contract_type?.includes('مكافأة') || e.contract_type?.includes('مكافأه')).length;
  const rewardPct = ((rewardCount / activeWorkforce) * 100).toFixed(1);
  const expiringSoonCount = activeValidEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d <= 60 && d >= 0; }).length;
  const expiredCount = activeValidEmployees.filter(e => { const d = getDaysRemaining(e.contract_end_date); return d !== null && d < 0; }).length;

  const toggleSelection = (code: string) => {
    setSelectedEmpCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };
  const toggleAll = () => {
    if (selectedEmpCodes.length === paginatedContracts.length) setSelectedEmpCodes([]);
    else setSelectedEmpCodes(paginatedContracts.map(e => e.employee_code));
  };
  const toggleDeptCheckbox = (deptName: string) => {
    setSelectedDepts(prev => prev.includes(deptName) ? prev.filter(d => d !== deptName) : [...prev, deptName]);
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

  // ================= Firebase Actions =================

  // 1. إنهاء تعاقد
  const handleTerminateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminateEmployeeCode) return alert('يرجى كتابة واختيار الموظف بشكل صحيح من القائمة.');
    const confirmTerm = window.confirm('هل أنت متأكد من إنهاء تعاقد هذا الموظف نهائياً؟');
    if (!confirmTerm) return;
    
    setActionLoading(true);
    const exactCode = terminateEmployeeCode; 
    
    try {
      const empQ = query(collection(db, 'employees'), where('employee_code', '==', exactCode));
      const empSnap = await getDocs(empQ);
      if (!empSnap.empty) {
        await updateDoc(doc(db, 'employees', empSnap.docs[0].id), { department: 'تحويلات/تحت الاعتماد', status: 'Inactive' });
      }

      const contQ = query(collection(db, 'contracts'), where('employee_code', '==', exactCode), where('status', '==', 'Active'));
      const contSnap = await getDocs(contQ);
      if (!contSnap.empty) {
        for (const d of contSnap.docs) {
          await updateDoc(doc(db, 'contracts', d.id), { contract_type: 'إنهاء تعاقد', status: 'Terminated' });
        }
      }

      alert('تم إنهاء التعاقد بنجاح ✅'); 
      setIsTerminateModalOpen(false); setTerminateEmployeeCode(''); setTerminateSearchTerm(''); 
      await refreshGlobalData();
    } catch (err: any) {
      alert('حدث خطأ أثناء إنهاء التعاقد: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 2. تعديل عقد
  const openEditModal = (emp: any) => {
    setEditEmpData({
      employee_code: emp.employee_code,
      employee_name: emp.employee_name,
      contract_type: emp.contract_type || 'محدد المدة',
      contract_start_date: emp.contract_start_date ? String(emp.contract_start_date).split('T')[0] : '',
      contract_end_date: emp.contract_end_date ? String(emp.contract_end_date).split('T')[0] : '',
      contract_id: emp.contract_id 
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEmpData) return;
    if (editEmpData.contract_start_date && !isValidYear(editEmpData.contract_start_date)) return alert('يرجى إدخال سنة بداية صحيحة.');
    if (editEmpData.contract_end_date && !isValidYear(editEmpData.contract_end_date)) return alert('يرجى إدخال سنة نهاية صحيحة.');

    setActionLoading(true);
    const exactCode = editEmpData.employee_code;
    
    try {
      const contractData = {
        contract_type: editEmpData.contract_type,
        contract_start_date: editEmpData.contract_start_date || null,
        contract_end_date: editEmpData.contract_end_date || null,
        status: 'Active'
      };

      if (editEmpData.contract_id) {
        await updateDoc(doc(db, 'contracts', editEmpData.contract_id), contractData);
      } else {
        const contQ = query(collection(db, 'contracts'), where('employee_code', '==', exactCode));
        const contSnap = await getDocs(contQ);
        if (!contSnap.empty) {
          await updateDoc(doc(db, 'contracts', contSnap.docs[0].id), contractData);
        } else {
          await addDoc(collection(db, 'contracts'), { employee_code: exactCode, ...contractData });
        }
      }

      const empQ = query(collection(db, 'employees'), where('employee_code', '==', exactCode));
      const empSnap = await getDocs(empQ);
      if (!empSnap.empty) {
        await updateDoc(doc(db, 'employees', empSnap.docs[0].id), { status: 'Active' });
      }

      alert('تم تعديل بيانات العقد بنجاح ✅');
      setIsEditModalOpen(false);
      await refreshGlobalData();
    } catch (err: any) {
      alert('حدث خطأ أثناء التعديل: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 3. عودة غير النشطين
  const handleReactivateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reactivateEmployeeCode) return alert('يرجى اختيار الموظف المراد إعادة تفعيله.');
    if (!reactivateDept) return alert('يرجى تحديد الإدارة التي سيعود إليها الموظف.');

    setActionLoading(true);
    const exactCode = reactivateEmployeeCode;

    try {
      const empQ = query(collection(db, 'employees'), where('employee_code', '==', exactCode));
      const empSnap = await getDocs(empQ);
      if (empSnap.empty) throw new Error('الموظف غير موجود');
      
      await updateDoc(doc(db, 'employees', empSnap.docs[0].id), {
        status: 'Active',
        department: reactivateDept,
      });

      await addDoc(collection(db, 'contracts'), { employee_code: exactCode, contract_type: 'محدد المدة', status: 'Active' });

      alert('تم إعادة تفعيل الموظف وتحديث إدارته وعقده بنجاح ✅');
      setIsReactivateModalOpen(false); setReactivateEmployeeCode(''); setReactivateSearchTerm(''); setReactivateDept('');
      await refreshGlobalData();
    } catch (err: any) {
      alert('حدث خطأ أثناء التفعيل: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 4. إنشاء عقد جديد تماماً
  const handleCreateBrandNewContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeCode) return alert('يرجى كتابة واختيار الموظف بشكل صحيح من القائمة.');
    if (!newContractStartDate || !newContractEndDate) return alert('يرجى استكمال جميع البيانات.');
    if (!isValidYear(newContractStartDate) || !isValidYear(newContractEndDate)) return alert('يرجى إدخال سنة صحيحة.');
    if (new Date(newContractEndDate) <= new Date(newContractStartDate)) return alert('تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية.');
    
    setActionLoading(true);
    const emp = employees.find((e) => e.employee_code === selectedEmployeeCode);
    const exactCode = emp.employee_code; 
    const [reqId] = generateSequentialIds(1);

    try {
      await addDoc(collection(db, 'contracts'), {
        employee_code: exactCode,
        contract_type: newContractType,
        contract_start_date: newContractStartDate,
        contract_end_date: newContractEndDate,
        status: 'Active'
      });

      const empQ = query(collection(db, 'employees'), where('employee_code', '==', exactCode));
      const empSnap = await getDocs(empQ);
      if (!empSnap.empty) await updateDoc(doc(db, 'employees', empSnap.docs[0].id), { status: 'Active' });

      const requestPayload = {
        request_id: reqId,
        employee_code: exactCode,
        employee_name: emp.employee_name,
        department: emp.department,
        job_title: emp.job_title,
        company: emp.company,
        contract_start_date: newContractStartDate, 
        new_contract_end_date: newContractEndDate, 
        status: 'Approved',
        signature_status: 'قيد التوقيع', 
        request_date: new Date().toISOString().split('T')[0],
      };
      await addDoc(collection(db, 'renewal_requests'), requestPayload);

      setActionLoading(false); setIsNewContractModalOpen(false);
      setCreatedRequestData({ ...requestPayload, contract_type: newContractType });
      alert(`تم إنشاء العقد وتحويله لصفحة التوقيع بنجاح ✅`);
      await refreshGlobalData();
    } catch (err: any) {
      setActionLoading(false); alert('خطأ أثناء إنشاء العقد: ' + err.message);
    }
  };

  // 5. إجراء طلبات التجديد
  const confirmRenewalAction = async () => {
    if (renewalMode === 'custom' && !customEndDate) return alert('يرجى إدخال تاريخ الانتهاء المخصص.');
    if (renewalMode === 'custom' && !isValidYear(customEndDate)) return alert('يرجى إدخال تاريخ انتهاء صحيح.');
    setActionLoading(true);

    try {
      if (modalState.type === 'single' && modalState.emp) {
        const emp = modalState.emp;
        const targetEndDate = renewalMode === 'months' ? calculateNewEndDate(emp.contract_end_date, renewalMonths) : (customEndDate || null);
        const [reqId] = generateSequentialIds(1);
        
        const payload: any = {
          request_id: reqId,
          employee_code: emp.employee_code,
          employee_name: emp.employee_name,
          department: emp.department,
          job_title: emp.job_title,
          company: emp.company,
          contract_end_date: emp.contract_end_date || null, 
          new_contract_end_date: targetEndDate || null, 
          renewal_months: renewalMode === 'months' ? renewalMonths : null,
          status: 'Pending',
          signature_status: 'قيد التوقيع',
          request_date: new Date().toISOString().split('T')[0],
        };
        
        await addDoc(collection(db, 'renewal_requests'), payload);
        
        setActionLoading(false); setModalState({ isOpen: false, type: 'single' });
        setCreatedRequestData({...payload, contract_type: emp.contract_type}); 
        await refreshGlobalData(); 
      
      } else if (modalState.type === 'bulk') {
        const selectedEmps = activeValidEmployees.filter(e => selectedEmpCodes.includes(e.employee_code));
        const reqIds = generateSequentialIds(selectedEmps.length);
        const batch = writeBatch(db);
        
        selectedEmps.forEach((emp, index) => {
          const targetEndDate = renewalMode === 'months' ? calculateNewEndDate(emp.contract_end_date, renewalMonths) : (customEndDate || null);
          const newDocRef = doc(collection(db, 'renewal_requests'));
          batch.set(newDocRef, {
            request_id: reqIds[index],
            employee_code: emp.employee_code,
            employee_name: emp.employee_name,
            department: emp.department,
            job_title: emp.job_title,
            company: emp.company,
            contract_end_date: emp.contract_end_date || null, 
            new_contract_end_date: targetEndDate || null, 
            renewal_months: renewalMode === 'months' ? renewalMonths : null,
            status: 'Pending',
            signature_status: 'قيد التوقيع',
            request_date: new Date().toISOString().split('T')[0],
          });
        });
        
        await batch.commit();
        setActionLoading(false); setModalState({ isOpen: false, type: 'single' });
        alert('تم إنشاء طلبات التجديد المجمعة بنجاح!'); setSelectedEmpCodes([]); 
        await refreshGlobalData(); 
      }
    } catch (error: any) {
      alert('خطأ: ' + error.message); setActionLoading(false);
    }
  };

  const handlePrintPDF = () => window.print();

  const renderSortableHeader = (label: string, sortKey: string, align: 'right' | 'center' = 'right') => {
    const isSorted = sortConfig?.key === sortKey;
    const direction = sortConfig?.direction;
    return (
      <th onClick={() => handleSort(sortKey)} style={{ padding: '12px 10px', background: isSorted ? '#e2e8f0' : '#f8fafc', borderBottom: '1px solid var(--line)', color: isSorted ? '#0f172a' : '#475569', cursor: 'pointer', userSelect: 'none', textAlign: align, transition: 'background 0.2s' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span>{label}</span>
          <span style={{ fontSize: '10px', color: isSorted ? '#2563eb' : '#a1a1aa' }}>
            {isSorted ? (direction === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </div>
      </th>
    );
  };

  return (
    <div style={{ paddingBottom: '40px', direction: 'rtl' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #pdf-print-area, #pdf-print-area * { visibility: visible; }
          #pdf-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; direction: rtl; background: #fff !important; color: #000 !important; }
          .no-print { display: none !important; }
        }
        .erp-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
          transition: all 0.2s ease-in-out;
          cursor: pointer;
        }
        .erp-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.06); border-color: #cbd5e1; }
      `}</style>

      {/* الهيدر والزراير العلوية */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950)' }}>العقود الحالية السارية</h3>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--muted)' }}>أرشيف وسجل شامل لعقود الموظفين النشطين (بدون التحويلات)</p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => { setReactivateSearchTerm(''); setReactivateEmployeeCode(''); setReactivateDept(''); setIsReactivateModalOpen(true); }} style={{ background: '#16a34a', color: '#fff', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🔄 عودة الغير نشطين
          </button>

          <button onClick={() => { setTerminateSearchTerm(''); setTerminateEmployeeCode(''); setIsTerminateModalOpen(true); }} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ❌ إنهاء تعاقد
          </button>
          
          <button onClick={() => { setSelectedEmployeeCode(''); setEmpSearchTerm(''); setNewContractStartDate(new Date().toISOString().split('T')[0]); setNewContractEndDate(''); setIsNewContractModalOpen(true); }} style={{ background: '#fff', color: '#000', border: '1px solid var(--line)', padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            📄 طلب إنشاء عقد جديد تماماً
          </button>

          <button onClick={openBulkRenewal} disabled={selectedEmpCodes.length === 0} style={{ background: selectedEmpCodes.length > 0 ? '#b8934a' : '#e2e8f0', color: selectedEmpCodes.length > 0 ? '#fff' : '#94a3b8', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: selectedEmpCodes.length > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ⚙️ توليد طلبات للمحددين ({selectedEmpCodes.length})
          </button>
        </div>
      </div>

      {/* 📊 الكروت الإحصائية */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        
        <div className="erp-card" onClick={() => { setSelectedType('دائم_مجمع'); setExpiryStatus(''); }} style={{ borderRight: '4px solid #0284c7', background: selectedType === 'دائم_مجمع' ? '#f0f9ff' : '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>العقود الدائمة</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🏢</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a' }}>{permanentCount.toLocaleString()}</span>
            <span style={{ fontSize: '11px', fontWeight: '800', background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', borderRadius: '12px' }}>{permanentPct}%</span>
          </div>
          <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>من القوة الفعلية</span>
        </div>

        <div className="erp-card" onClick={() => { setSelectedType('محدد_مجمع'); setExpiryStatus(''); }} style={{ borderRight: '4px solid #2563eb', background: selectedType === 'محدد_مجمع' ? '#eff6ff' : '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>العقود المحددة</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>⏳</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a' }}>{fixedCount.toLocaleString()}</span>
            <span style={{ fontSize: '11px', fontWeight: '800', background: '#dbeafe', color: '#2563eb', padding: '2px 6px', borderRadius: '12px' }}>{fixedPct}%</span>
          </div>
          <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>من القوة الفعلية</span>
        </div>

        <div className="erp-card" onClick={() => { setSelectedType('فوق_السن_مجمع'); setExpiryStatus(''); }} style={{ borderRight: '4px solid #7c3aed', background: selectedType === 'فوق_السن_مجمع' ? '#f5f3ff' : '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>عقود فوق السن</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🎖️</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a' }}>{overAgeCount.toLocaleString()}</span>
            <span style={{ fontSize: '11px', fontWeight: '800', background: '#ede9fe', color: '#7c3aed', padding: '2px 6px', borderRadius: '12px' }}>{overAgePct}%</span>
          </div>
          <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>من القوة الفعلية</span>
        </div>

        <div className="erp-card" onClick={() => { setSelectedType('مكافأة_مجمع'); setExpiryStatus(''); }} style={{ borderRight: '4px solid #059669', background: selectedType === 'مكافأة_مجمع' ? '#ecfdf5' : '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>المكافأة الشاملة</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>💼</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a' }}>{rewardCount.toLocaleString()}</span>
            <span style={{ fontSize: '11px', fontWeight: '800', background: '#d1fae5', color: '#059669', padding: '2px 6px', borderRadius: '12px' }}>{rewardPct}%</span>
          </div>
          <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>من القوة الفعلية</span>
        </div>

        <div className="erp-card" onClick={() => { setExpiryStatus('expiring_60'); setSelectedType(''); }} style={{ borderRight: '4px solid #ea580c', background: expiryStatus === 'expiring_60' ? '#fff7ed' : '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>تنتهي قريباً</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>⚠️</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '22px', fontWeight: '900', color: '#ea580c' }}>{expiringSoonCount.toLocaleString()}</span>
          </div>
          <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>متبقي 60 يوم أو أقل</span>
        </div>

        <div className="erp-card" onClick={() => { setExpiryStatus('expired'); setSelectedType(''); }} style={{ borderRight: '4px solid #dc2626', background: expiryStatus === 'expired' ? '#fef2f2' : '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>منتهية المدة</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🚨</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '22px', fontWeight: '900', color: '#dc2626' }}>{expiredCount.toLocaleString()}</span>
          </div>
          <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>تحتاج تسوية أو تجديد</span>
        </div>
      </div>

      {/* 🛠️ شريط الفلاتر والإدارات المتعددة */}
      <div className="no-print" style={{ background: '#fff', border: '1px solid var(--line)', padding: '12px', borderRadius: '10px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', direction: 'rtl' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="بحث بالاسم، الكود، الإدارة..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', width: '220px' }} />
          
          <div style={{ position: 'relative' }} ref={deptDropdownRef}>
            <button 
              onClick={() => setIsDeptDropdownOpen(!isDeptDropdownOpen)} 
              style={{ padding: '8px 14px', borderRadius: '8px', border: selectedDepts.length > 0 ? '2px solid #2563eb' : '1px solid #cbd5e1', background: selectedDepts.length > 0 ? '#eff6ff' : '#ffffff', color: selectedDepts.length > 0 ? '#2563eb' : '#0f172a', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', minWidth: '160px', justifyContent: 'space-between' }}
            >
              <span>{selectedDepts.length === 0 ? '🏢 كل الإدارات' : `🏢 الإدارات المختارة (${selectedDepts.length})`}</span>
              <span style={{ fontSize: '10px' }}>▼</span>
            </button>

            {isDeptDropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', width: '260px', maxHeight: '280px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 50, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="ابحث عن إدارة..." 
                  value={deptSearchFilter} 
                  onChange={(e) => setDeptSearchFilter(e.target.value)} 
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '11px', outline: 'none' }}
                />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                  <button onClick={() => setSelectedDepts([...deptsList])} style={{ background: 'none', border: 0, color: '#2563eb', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>تحديد الكل</button>
                  <button onClick={() => setSelectedDepts([])} style={{ background: 'none', border: 0, color: '#dc2626', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>إلغاء الكل</button>
                </div>

                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {deptsList
                    .filter((d: any) => String(d).toLowerCase().includes(deptSearchFilter.toLowerCase()))
                    .map((deptName: any, idx: number) => (
                      <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', cursor: 'pointer', padding: '3px 4px', borderRadius: '4px' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedDepts.includes(deptName)} 
                          onChange={() => toggleDeptCheckbox(deptName)} 
                          style={{ accentColor: '#2563eb', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: selectedDepts.includes(deptName) ? 'bold' : 'normal', color: '#0f172a' }}>{deptName}</span>
                      </label>
                  ))}
                </div>

                <button onClick={() => setIsDeptDropdownOpen(false)} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '6px', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', textAlign: 'center', marginTop: '4px' }}>
                  تم الاختيار ({selectedDepts.length})
                </button>
              </div>
            )}
          </div>

          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none' }}>
            <option value="">كل أنواع العقود (الكل)</option>
            <option value="دائم_مجمع">العقود الدائمة</option>
            <option value="محدد_مجمع">العقود المحددة</option>
            <option value="فوق_السن_مجمع">عقود فوق السن</option>
            <option value="مكافأة_مجمع">المكافأة الشاملة</option>
          </select>

          <select value={expiryStatus} onChange={(e) => setExpiryStatus(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none' }}>
            <option value="">حالة الانتهاء (الكل)</option>
            <option value="expiring_60">ينتهي خلال 60 يوم</option>
            <option value="expired">منتهي الصلاحية</option>
          </select>

          <button onClick={() => { setSearchTerm(''); setSelectedDepts([]); setSelectedType(''); setExpiryStatus(''); setSortConfig(null); setCurrentPage(1); }} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '8px 16px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
            إعادة ضبط
          </button>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)' }}>
          النتائج: <strong style={{ color: '#0f172a', fontSize: '13px' }}>{sortedContracts.length}</strong> عقد
        </div>
      </div>

      {/* 🚀 الجدول مع ترقيم الصفحات (Pagination) */}
      <div className="no-print table-responsive" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', overflowX: 'auto', marginBottom: '16px' }}>
        {globalLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)' }}>جاري جلب البيانات من الكاش... ⏳</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 10px', background: '#f8fafc', borderBottom: '1px solid var(--line)', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedEmpCodes.length > 0 && selectedEmpCodes.length === paginatedContracts.length} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                </th>
                {renderSortableHeader('الكود', 'employee_code')}
                {renderSortableHeader('الموظف', 'employee_name')}
                {renderSortableHeader('الإدارة', 'department')}
                {renderSortableHeader('الوظيفة', 'job_title')}
                {renderSortableHeader('النوع', 'contract_type')}
                {renderSortableHeader('الانتهاء', 'contract_end_date')}
                {renderSortableHeader('المتبقي', 'days_remaining', 'center')}
                <th style={{ padding: '12px 10px', background: '#f8fafc', borderBottom: '1px solid var(--line)', color: '#475569' }}>حالة التجديد</th>
                <th style={{ padding: '12px 10px', background: '#f8fafc', borderBottom: '1px solid var(--line)', color: '#475569', textAlign: 'center' }}>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {paginatedContracts.length === 0 ? (
                 <tr><td colSpan={10} style={{ padding: '30px', textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>لا توجد سجلات مطابقة للبحث.</td></tr>
              ) : paginatedContracts.map((emp) => {
                const statusInfo = getRenewalStatusInfo(emp.employee_code);
                const daysLeft = getDaysRemaining(emp.contract_end_date);
                let remainingLabel = <span style={{ color: 'var(--muted)' }}>—</span>;
                if (daysLeft !== null) {
                  if (daysLeft < 0) remainingLabel = <span style={{ color: '#dc2626', fontWeight: 'bold' }}>منتهي ({Math.abs(daysLeft)} يوم)</span>;
                  else if (daysLeft <= 60) remainingLabel = <span style={{ color: '#ea580c', fontWeight: 'bold' }}>متبقي {daysLeft} يوم</span>;
                  else remainingLabel = <span style={{ color: '#15803d', fontWeight: 'bold' }}>متبقي {daysLeft} يوم</span>;
                }

                return (
                  <tr key={emp.employee_code} style={{ borderBottom: '1px solid #f1f5f9', background: selectedEmpCodes.includes(emp.employee_code) ? '#fefce8' : 'transparent' }}>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedEmpCodes.includes(emp.employee_code)} onChange={() => toggleSelection(emp.employee_code)} disabled={statusInfo.locked} style={{ cursor: statusInfo.locked ? 'not-allowed' : 'pointer' }} />
                    </td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#dc2626' }}>{emp.employee_code}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name}</td>
                    <td style={{ padding: '10px', color: 'var(--muted)' }}>{emp.department || '—'}</td>
                    <td style={{ padding: '10px', color: 'var(--muted)' }}>{emp.job_title || '—'}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{emp.contract_type || '—'}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold' }}>{emp.contract_end_date || '—'}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>{remainingLabel}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', fontSize: '10px' }}><span style={{ color: statusInfo.color }}>{statusInfo.text}</span></td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                        <button onClick={() => openSingleRenewal(emp)} disabled={statusInfo.locked || actionLoading} style={{ background: statusInfo.locked ? '#e2e8f0' : '#b8934a', color: statusInfo.locked ? '#94a3b8' : '#fff', border: 0, padding: '6px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: statusInfo.locked || actionLoading ? 'not-allowed' : 'pointer' }}>
                          + إنشاء طلب
                        </button>
                        <button onClick={() => openEditModal(emp)} disabled={actionLoading} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: actionLoading ? 'not-allowed' : 'pointer' }} title="تعديل بيانات العقد">
                          ✏️
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

      {/* 🚀 أزرار ترقيم الصفحات */}
      {totalPages > 1 && (
        <div className="no-print" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', background: '#fff', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <button 
            disabled={currentPage === 1} 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage === 1 ? '#f8fafc' : '#fff', color: currentPage === 1 ? '#94a3b8' : '#0f172a', fontWeight: 'bold', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '12px' }}
          >
            السابق
          </button>
          
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
            صفحة <span style={{ color: '#2563eb' }}>{currentPage}</span> من {totalPages}
          </span>
          
          <button 
            disabled={currentPage === totalPages} 
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage === totalPages ? '#f8fafc' : '#fff', color: currentPage === totalPages ? '#94a3b8' : '#0f172a', fontWeight: 'bold', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontSize: '12px' }}
          >
            التالي
          </button>
        </div>
      )}

      {/* ================= النوافذ المنبثقة ================= */}

      {/* 🔄 نافذة عودة الموظف */}
      {isReactivateModalOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '480px', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#16a34a', fontWeight: '800' }}>🔄 عودة وإعادة تفعيل موظف</h3>
              <button onClick={() => setIsReactivateModalOpen(false)} style={{ background: '#f1f5f9', border: 0, color: '#475569', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleReactivateEmployee}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>
                  ابحث عن الموظف (غير النشط / تحت الاعتماد) *
                </label>
                <input type="text" list="inactive-employees" required placeholder="🔍 اكتب كود أو اسم الموظف غير النشط..." value={reactivateSearchTerm} onChange={(e) => { const val = e.target.value; setReactivateSearchTerm(val); const code = val.split(' - ')[0]; const emp = rawEmployees.find((e:any) => String(e.employee_code) === String(code)); if (emp) { setReactivateEmployeeCode(code); if (emp.department && !emp.department.includes('تحويلات')) { setReactivateDept(emp.department); } } else { setReactivateEmployeeCode(''); } }} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }} />
                <datalist id="inactive-employees">
                  {rawEmployees.filter((emp:any) => emp.status === 'Inactive' || emp.status === 'Terminated' || emp.contract_type === 'إنهاء تعاقد' || String(emp.department).includes('تحويلات')).map((emp:any) => (<option key={emp.employee_code} value={`${emp.employee_code} - ${emp.employee_name}`} />))}
                </datalist>
                {reactivateEmployeeCode && (<div style={{ marginTop: '6px', fontSize: '11px', color: '#16a34a', fontWeight: 'bold' }}>✅ تم اختيار الموظف كود: {reactivateEmployeeCode}</div>)}
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>تحديد الإدارة التي سيعود إليها الموظف *</label>
                <input type="text" list="depts-list-reactivate" required placeholder="اختر أو اكتب اسم الإدارة..." value={reactivateDept} onChange={(e) => setReactivateDept(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold' }} />
                <datalist id="depts-list-reactivate">
                  {deptsList.map((d: any, i) => (<option key={i} value={d} />))}
                </datalist>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsReactivateModalOpen(false)} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading || !reactivateEmployeeCode || !reactivateDept} style={{ background: '#16a34a', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: (actionLoading || !reactivateEmployeeCode || !reactivateDept) ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري التنفيذ...' : 'تأكيد العودة والتفعيل 🔄'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✏️ نافذة التعديل السريع */}
      {isEditModalOpen && editEmpData && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '450px', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>✏️ تعديل بيانات العقد</h3>
              <button onClick={() => setIsEditModalOpen(false)} style={{ background: '#f1f5f9', border: 0, color: '#475569', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div style={{ marginBottom: '16px', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold' }}>الموظف: <span style={{ color: '#2563eb' }}>{editEmpData.employee_name} ({editEmpData.employee_code})</span></p>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>نوع العقد</label>
                <select value={editEmpData.contract_type} onChange={(e) => setEditEmpData({...editEmpData, contract_type: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
                  <option value="دائم">دائم (غير محدد المدة)</option>
                  <option value="محدد المدة">محدد المدة</option>
                  <option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                  <option value="محدد المدة - مكافأة شاملة">محدد المدة - مكافأة شاملة</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div><label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>تاريخ البداية</label><input type="date" value={editEmpData.contract_start_date} onChange={(e) => setEditEmpData({...editEmpData, contract_start_date: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} /></div>
                <div><label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>تاريخ النهاية</label><input type="date" value={editEmpData.contract_end_date} onChange={(e) => setEditEmpData({...editEmpData, contract_end_date: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} /></div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsEditModalOpen(false)} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🔴 نافذة إنهاء التعاقد */}
      {isTerminateModalOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '450px', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#dc2626', fontWeight: '800' }}>❌ إنهاء تعاقد موظف</h3>
              <button onClick={() => setIsTerminateModalOpen(false)} style={{ background: '#f1f5f9', border: 0, color: '#475569', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleTerminateContract}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>
                  ابحث عن الموظف (بالاسم أو الكود) *
                </label>
                <input type="text" list="terminate-employees" required placeholder="🔍 اكتب كود أو اسم الموظف..." value={terminateSearchTerm} onChange={(e) => { const val = e.target.value; setTerminateSearchTerm(val); const code = val.split(' - ')[0]; const isValidEmp = employees.some(emp => emp.employee_code === code && emp.contract_type !== 'إنهاء تعاقد'); if (isValidEmp) setTerminateEmployeeCode(code); else setTerminateEmployeeCode(''); }} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }} />
                <datalist id="terminate-employees">
                  {employees.filter(emp => emp.contract_type !== 'إنهاء تعاقد').map((emp) => (<option key={emp.employee_code} value={`${emp.employee_code} - ${emp.employee_name}`} />))}
                </datalist>
                {terminateEmployeeCode && (<div style={{ marginTop: '6px', fontSize: '11px', color: '#dc2626', fontWeight: 'bold' }}>⚠️ سيتم إنهاء تعاقد: {terminateEmployeeCode}</div>)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsTerminateModalOpen(false)} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading || !terminateEmployeeCode} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: (actionLoading || !terminateEmployeeCode) ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري التنفيذ...' : 'تأكيد الإنهاء'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🌟 🆕 نافذة إنشاء عقد جديد تماماً */}
      {isNewContractModalOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '520px', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--navy-950)', fontWeight: '800' }}>📝 طلب إنشاء عقد جديد تماماً</h3>
              <button onClick={() => setIsNewContractModalOpen(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleCreateBrandNewContract}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>ابحث عن الموظف (بالاسم أو الكود) *</label>
                <input type="text" list="new-contract-employees" required placeholder="🔍 اكتب كود أو اسم الموظف هنا..." value={empSearchTerm} onChange={(e) => { const val = e.target.value; setEmpSearchTerm(val); const code = val.split(' - ')[0]; const isValidEmp = employees.some(emp => String(emp.employee_code).trim() === code); if (isValidEmp) setSelectedEmployeeCode(code); else setSelectedEmployeeCode(''); }} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }} />
                <datalist id="new-contract-employees">
                  {employees.map((emp) => (<option key={emp.employee_code} value={`${emp.employee_code} - ${emp.employee_name}`} />))}
                </datalist>
                {selectedEmployeeCode && (<div style={{ marginTop: '6px', fontSize: '11px', color: '#15803d', fontWeight: 'bold' }}>✅ تم اختيار الموظف كود: {selectedEmployeeCode}</div>)}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>نوع العقد الجديد *</label>
                <select value={newContractType} onChange={(e) => setNewContractType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }}>
                  <option value="محدد المدة">محدد المدة</option>
                  <option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                  <option value="مكافأة شاملة">مكافأة شاملة</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div><label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>بداية العقد *</label><input type="date" required value={newContractStartDate} onChange={(e) => setNewContractStartDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} /></div>
                <div><label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>نهاية العقد *</label><input type="date" required value={newContractEndDate} onChange={(e) => setNewContractEndDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsNewContractModalOpen(false)} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={actionLoading || !selectedEmployeeCode} style={{ background: 'var(--navy-950)', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: (actionLoading || !selectedEmployeeCode) ? 'not-allowed' : 'pointer' }}>{actionLoading ? 'جاري الحفظ...' : 'إنشاء العقد 📄'}</button>
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
                <input type="radio" name="renewalMode" checked={renewalMode === 'months'} onChange={() => setRenewalMode('months')} style={{ accentColor: '#b8934a' }} /> تجديد بالشهور (تلقائي)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold', color: renewalMode === 'custom' ? '#856404' : '#64748b', cursor: 'pointer' }}>
                <input type="radio" name="renewalMode" checked={renewalMode === 'custom'} onChange={() => setRenewalMode('custom')} style={{ accentColor: '#b8934a' }} /> تاريخ انتهاء مخصص
              </label>
            </div>
            {renewalMode === 'months' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>يرجى اختيار مدة التجديد بالشهور:</label>
                <select value={renewalMonths} onChange={(e) => setRenewalMonths(Number(e.target.value))} style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold', background: '#fff' }}>
                  <option value={1}>شهر واحد (1 شهر)</option><option value={2}>شهران (2 شهر)</option><option value={3}>3 شهور (ربع سنوي)</option><option value={6}>6 شهور (نصف سنوي)</option><option value={9}>9 شهور</option><option value={12}>12 شهر (سنة كاملة)</option><option value={24}>24 شهر (سنتين)</option><option value={36}>36 شهر (3 سنوات)</option>
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
              <button onClick={confirmRenewalAction} disabled={actionLoading} style={{ background: '#b8934a', color: '#fff', border: 0, padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ✅ {actionLoading ? 'جاري التنفيذ...' : 'تأكيد وإجراء الطلب'}
              </button>
              <button onClick={() => setModalState({ isOpen: false, type: 'single' })} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
            </div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #b8934a', paddingBottom: '16px', marginBottom: '20px' }}>
                <div><h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900' }}>مجموعة شركات المراسم الدولية</h2><p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>قطاع الموارد البشرية والشؤون الإدارية</p></div>
                <div style={{ textAlign: 'left', fontSize: '11px', fontFamily: 'monospace' }}><div>رقم العقد/الطلب: <strong>{createdRequestData.request_id}</strong></div><div>التاريخ: <strong>{createdRequestData.request_date}</strong></div></div>
              </div>
              <div style={{ textAlign: 'center', margin: '20px 0' }}><h3 style={{ margin: 0, fontSize: '18px', textDecoration: 'underline', color: '#0f172a' }}>نموذج عقد عمل محدد المدة</h3></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px', lineHeight: '2.2', marginBottom: '24px' }}>
                <div>اسم الموظف: <strong>{createdRequestData.employee_name}</strong></div>
                <div>كود الموظف: <strong style={{ fontFamily: 'monospace' }}>{createdRequestData.employee_code}</strong></div>
                <div>الإدارة / القسم: <strong>{createdRequestData.department || '—'}</strong></div>
                <div>المسمى الوظيفي: <strong>{createdRequestData.job_title || '—'}</strong></div>
                <div>تاريخ بداية العقد: <strong style={{ fontFamily: 'monospace' }}>{createdRequestData.contract_start_date}</strong></div>
                <div>تاريخ نهاية العقد: <strong style={{ fontFamily: 'monospace' }}>{createdRequestData.new_contract_end_date}</strong></div>
              </div>
              <div style={{ background: '#f8fafc', padding: '12px', borderRight: '4px solid #b8934a', fontSize: '12px', marginBottom: '30px' }}><strong>القرار والتعهد:</strong> يتعهد الطرفان بالالتزام بكافة بنود لائحة العمل الداخلية المعتمدة بالشركة، ويسري هذا العقد اعتباراً من تاريخ البداية وحتى تاريخ النهاية الموضحين أعلاه.</div>
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
