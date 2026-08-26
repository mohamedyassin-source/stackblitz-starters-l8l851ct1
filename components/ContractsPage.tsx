'use client';
import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import Stamp from './Stamp';

const getField = (obj: any, ...keys: string[]) => {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return '';
};

const getDaysRemaining = (endDateStr: string) => {
  if (!endDateStr) return null;
  const end = new Date(endDateStr);
  if (isNaN(end.getTime())) return null;
  const today = new Date();
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
};

const getDaysUntil60 = (nationalId: string) => {
  if (!nationalId || String(nationalId).trim().length !== 14) return null;
  const idStr = String(nationalId).trim();
  const centuryDigit = idStr.charAt(0);
  const yearDigits = idStr.substring(1, 3);
  const monthDigits = idStr.substring(3, 5);
  const dayDigits = idStr.substring(5, 7);

  const fullYear = (centuryDigit === '3' ? '20' : '19') + yearDigits;
  const birthDate = new Date(`${fullYear}-${monthDigits}-${dayDigits}`);
  if (isNaN(birthDate.getTime())) return null;

  const age60Date = new Date(birthDate);
  age60Date.setFullYear(age60Date.getFullYear() + 60);
  const today = new Date();
  return Math.ceil((age60Date.getTime() - today.getTime()) / (1000 * 3600 * 24));
};

const getEmployeeAge = (emp: any) => {
  const rawAge = getField(emp, 'age', 'Age');
  if (rawAge !== '' && rawAge !== null && !isNaN(Number(rawAge))) {
    return Number(rawAge);
  }
  return null;
};

export default function ContractsPage({ jumpSearch }: { jumpSearch?: string }) {
  const { employees, renewals, loading, refresh } = useAppData();

  const [activeCardFilter, setActiveCardFilter] = useState<'FIXED' | 'ABOVE_AGE' | 'PERM' | 'TURNING_60' | null>(null);
  const [searchTerm, setSearchTerm] = useState(jumpSearch || '');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedType, setSelectedType] = useState('');

  const [sortColumn, setSortColumn] = useState<string>('daysLeft');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedEmpCodes, setSelectedEmpCodes] = useState<string[]>([]);

  const [showNewContractModal, setShowNewContractModal] = useState(false);
  const [showTermModal, setShowTermModal] = useState(false);
  const [editContractData, setEditData] = useState<any>(null);

  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [renewalType, setRenewalType] = useState('محدد المدة');
  const [renewalMonths, setRenewalMonths] = useState(12);
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  const [showBulkRenewalModal, setShowBulkRenewalModal] = useState(false);
  const [bulkRenewalType, setBulkRenewalType] = useState('smart');
  const [bulkRenewalMonths, setBulkRenewalMonths] = useState(12);
  const [bulkSaving, setBulkSaving] = useState(false);

  const [termSearch, setTermSearch] = useState('');
  const [selectedTermEmp, setSelectedTermEmp] = useState<any>(null);
  const [termReason, setTermReason] = useState('إنهاء عقد');
  const [termDate, setTermDate] = useState(new Date().toISOString().split('T')[0]);
  const [termSaving, setTermSaving] = useState(false);

  const [newContract, setNewContract] = useState({ employee_code: '', contract_type: 'محدد المدة', months: 12, start_date: new Date().toISOString().split('T')[0], end_date: '' });
  const [newContractSaving, setNewContractSaving] = useState(false);

  useEffect(() => {
    if (jumpSearch) setSearchTerm(jumpSearch);
  }, [jumpSearch]);

  const activeEmployees = useMemo(() => {
    return employees.filter(e => (getField(e, 'status', 'Status') || 'Active') === 'Active');
  }, [employees]);

  const companiesList = useMemo(() => Array.from(new Set(activeEmployees.map(e => getField(e, 'company', 'Company')).filter(Boolean))), [activeEmployees]);
  const deptsList = useMemo(() => Array.from(new Set(activeEmployees.map(e => getField(e, 'department', 'Department')).filter(Boolean))), [activeEmployees]);
  const typesList = useMemo(() => Array.from(new Set(activeEmployees.map(e => getField(e, 'contract_type', 'ContractType')).filter(Boolean))), [activeEmployees]);

  const processedContracts = useMemo(() => {
    return activeEmployees.map(emp => {
      const code = String(getField(emp, 'employee_code', 'EmployeeCode'));
      const name = String(getField(emp, 'employee_name', 'ArabicName'));
      const endDate = getField(emp, 'contract_end_date', 'ContractEndDate');
      const startDate = getField(emp, 'contract_start_date', 'ContractStartDate', 'hiring_date', 'HiringDate');
      const natId = getField(emp, 'national_id', 'NationalID');
      const contractType = getField(emp, 'contract_type', 'ContractType');
      const daysLeft = getDaysRemaining(endDate);
      const daysUntil60 = getDaysUntil60(natId);
      const age = getEmployeeAge(emp);

      const empRens = (renewals || []).filter(r => String(r.employee_code) === code).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      const latestRenewal = empRens[0];
      const hasPendingRenewal = latestRenewal && (latestRenewal.status === 'Pending' || latestRenewal.status === 'قيد الانتظار');

      return {
        ...emp, code, name, department: getField(emp, 'department', 'Department'),
        company: getField(emp, 'company', 'Company'), jobTitle: getField(emp, 'job_title', 'JobTitle'),
        contractType, startDate, endDate, daysLeft, age, daysUntil60,
        isTurning60Soon: daysUntil60 !== null && daysUntil60 >= 0 && daysUntil60 <= 60,
        hasPendingRenewal,
      };
    });
  }, [activeEmployees, renewals]);

  const cardStats = useMemo(() => {
    const totalActive = activeEmployees.length;
    const totalFixed = processedContracts.filter(c => c.contractType === 'محدد المدة').length;
    const totalAboveAge = processedContracts.filter(c => String(c.contractType).includes('فوق السن')).length;
    const totalPerm = processedContracts.filter(c => c.contractType === 'دائم').length;
    const totalTurning60 = processedContracts.filter(c => c.isTurning60Soon && c.contractType !== 'محدد المدة - فوق السن').length;
    const calcPct = (val: number) => totalActive > 0 ? ((val / totalActive) * 100).toFixed(1) : '0';
    return { totalActive, totalFixed, pctFixed: calcPct(totalFixed), totalAboveAge, pctAboveAge: calcPct(totalAboveAge), totalPerm, pctPerm: calcPct(totalPerm), totalTurning60, pctTurning60: calcPct(totalTurning60) };
  }, [processedContracts, activeEmployees]);

  const filteredContracts = useMemo(() => {
    return processedContracts.filter(item => {
      if (activeCardFilter === 'FIXED' && item.contractType !== 'محدد المدة') return false;
      if (activeCardFilter === 'ABOVE_AGE' && !String(item.contractType).includes('فوق السن')) return false;
      if (activeCardFilter === 'PERM' && item.contractType !== 'دائم') return false;
      if (activeCardFilter === 'TURNING_60' && !item.isTurning60Soon) return false;

      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || item.code.toLowerCase().includes(term) || item.name.toLowerCase().includes(term);
      const matchesComp = !selectedCompany || item.company === selectedCompany;
      const matchesDept = !selectedDept || item.department === selectedDept;
      const matchesType = !selectedType || item.contractType === selectedType;

      return matchesSearch && matchesComp && matchesDept && matchesType;
    });
  }, [processedContracts, activeCardFilter, searchTerm, selectedCompany, selectedDept, selectedType]);

  const sortedContracts = useMemo(() => {
    const sorted = [...filteredContracts];
    return sorted.sort((a, b) => {
      let valA = a[sortColumn as keyof typeof a];
      let valB = b[sortColumn as keyof typeof b];

      if (sortColumn === 'daysLeft') {
        const numA = valA !== null && valA !== undefined ? Number(valA) : Infinity;
        const numB = valB !== null && valB !== undefined ? Number(valB) : Infinity;
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      }

      valA = String(valA || '');
      valB = String(valB || '');
      const res = valA.localeCompare(valB, 'ar', { numeric: true });
      return sortDirection === 'asc' ? res : -res;
    });
  }, [filteredContracts, sortColumn, sortDirection]);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const renderSortArrow = (colKey: string) => {
    if (sortColumn !== colKey) return <span style={{ opacity: 0.3, marginRight: '4px', fontSize: '10px' }}>↕</span>;
    return sortDirection === 'asc' ? <span style={{ color: '#0d9488', marginRight: '4px', fontSize: '10px' }}>▲</span> : <span style={{ color: '#0d9488', marginRight: '4px', fontSize: '10px' }}>▼</span>;
  };

  const termSearchResults = useMemo(() => {
    if (!termSearch.trim()) return [];
    const term = termSearch.toLowerCase().trim();
    return activeEmployees.filter(e => {
      const code = String(getField(e, 'employee_code', 'EmployeeCode')).toLowerCase();
      const name = String(getField(e, 'employee_name', 'ArabicName')).toLowerCase();
      return code.includes(term) || name.includes(term);
    }).slice(0, 6);
  }, [activeEmployees, termSearch]);

  const handleOpenEditContract = (emp: any) => { setEditData({ emp, contract_type: emp.contractType || 'محدد المدة', contract_start_date: emp.startDate || '', contract_end_date: emp.endDate || '', saving: false }); };

  const handleSaveContractEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editContractData) return;
    setEditData({ ...editContractData, saving: true });
    try {
      const empId = editContractData.emp.id || editContractData.emp.employee_id;
      const { error } = await supabase.from('employees').update({ contract_type: editContractData.contract_type, contract_start_date: editContractData.contract_start_date || null, contract_end_date: editContractData.contract_end_date || null }).eq(editContractData.emp.id ? 'id' : 'employee_id', empId);
      if (error) throw error;
      alert('تم تحديث العقد بنجاح ✅');
      setEditData(null);
      await refresh();
    } catch (err: any) { alert('خطأ أثناء التعديل: ' + err.message); setEditData({ ...editContractData, saving: false }); }
  };

  const handleCreateNewContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContract.employee_code) return alert('يرجى اختيار الموظف أولاً');
    setNewContractSaving(true);
    try {
      const targetEmp = activeEmployees.find(e => String(getField(e, 'employee_code', 'EmployeeCode')) === newContract.employee_code);
      if (!targetEmp) throw new Error('الموظف غير موجود');
      let calcEnd = newContract.end_date;
      if (!calcEnd && newContract.start_date) {
        const d = new Date(newContract.start_date); d.setMonth(d.getMonth() + Number(newContract.months)); d.setDate(d.getDate() - 1); calcEnd = d.toISOString().split('T')[0];
      }
      const empId = targetEmp.id || targetEmp.employee_id;
      const { error: empError } = await supabase.from('employees').update({ contract_type: newContract.contract_type, contract_start_date: newContract.start_date, contract_end_date: calcEnd }).eq(targetEmp.id ? 'id' : 'employee_id', empId);
      if (empError) throw empError;
      alert('✅ تم إنشاء العقد الجديد بنجاح');
      setShowNewContractModal(false);
      setNewContract({ employee_code: '', contract_type: 'محدد المدة', months: 12, start_date: new Date().toISOString().split('T')[0], end_date: '' });
      await refresh();
    } catch (err: any) { alert('خطأ أثناء الإنشاء: ' + err.message); } finally { setNewContractSaving(false); }
  };

  const handleConfirmTermination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTermEmp) return alert('يرجى اختيار الموظف');
    setTermSaving(true);
    try {
      const empId = selectedTermEmp.id || selectedTermEmp.employee_id;
      const { error } = await supabase.from('employees').update({ department: 'تحويلات تحت الاعتماد', termination_reason: termReason, termination_date: termDate }).eq(selectedTermEmp.id ? 'id' : 'employee_id', empId);
      if (error) throw error;
      alert(`✅ تم تحويل الموظف بنجاح.`);
      setShowTermModal(false); setSelectedTermEmp(null); setTermSearch('');
      await refresh();
    } catch (err: any) { alert('خطأ أثناء الإنهاء: ' + err.message); } finally { setTermSaving(false); }
  };

  const handleOpenRenewalModal = (emp: any) => {
    setSelectedEmp(emp);
    const isAbove60 = (emp.age !== null && emp.age >= 60) || emp.contractType === 'دائم';
    setRenewalType(isAbove60 ? 'محدد المدة - فوق السن' : 'محدد المدة');
    setRenewalMonths(12);
    let start = new Date();
    if (emp.endDate) {
      const currentEnd = new Date(emp.endDate);
      if (!isNaN(currentEnd.getTime())) { start = new Date(currentEnd); start.setDate(start.getDate() + 1); }
    }
    const startStr = start.toISOString().split('T')[0];
    setNewStartDate(startStr);
    const end = new Date(start); end.setMonth(end.getMonth() + 12); end.setDate(end.getDate() - 1);
    setNewEndDate(end.toISOString().split('T')[0]);
    setShowRenewalModal(true);
  };

  const handleMonthsOrDateChange = (months: number, startStr: string) => {
    setRenewalMonths(months); setNewStartDate(startStr);
    if (startStr) {
      const start = new Date(startStr);
      if (!isNaN(start.getTime())) {
        const end = new Date(start); end.setMonth(end.getMonth() + Number(months)); end.setDate(end.getDate() - 1);
        setNewEndDate(end.toISOString().split('T')[0]);
      }
    }
  };

  const handleSaveRenewalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;
    setSaving(true);
    try {
      const yearPrefix = `RR-${new Date().getFullYear()}-`;
      const randomId = Math.floor(1000 + Math.random() * 9000);
      const payload = {
        request_id: `${yearPrefix}${randomId}`,
        employee_id: selectedEmp.employee_id || selectedEmp.id || `EMP-${selectedEmp.code}`,
        employee_code: String(selectedEmp.code), employee_name: String(selectedEmp.name),
        company: selectedEmp.company || '', department: selectedEmp.department || '', job_title: selectedEmp.jobTitle || '',
        contract_type: renewalType, renewal_months: Number(renewalMonths), new_contract_end_date: newEndDate,
        status: 'Pending', signature_status: 'في انتظار توقيع الموظف', request_date: new Date().toISOString().split('T')[0],
      };
      const { error } = await supabase.from('renewal_requests').insert([payload]);
      if (error) throw error;
      alert(`✅ تم إنشاء طلب التجديد للموظف (${selectedEmp.name}) بنجاح.`);
      setShowRenewalModal(false); setSelectedEmp(null); await refresh();
    } catch (err: any) { alert('حدث خطأ أثناء حفظ الطلب: ' + err.message); } finally { setSaving(false); }
  };

  // 🌟 دالة الحفظ المجمع للطلبات (تم حل مشكلة TypeScript هنا) 🌟
  const handleSaveBulkRenewalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmpCodes.length === 0) return;
    setBulkSaving(true);
    try {
      const yearPrefix = `RR-${new Date().getFullYear()}-`;
      const payloads: any[] = [];

      selectedEmpCodes.forEach((code, idx) => {
        const emp = processedContracts.find(c => c.code === code);
        if (!emp) return;

        let type = bulkRenewalType;
        if (type === 'smart') {
          const isAbove60 = (emp.age !== null && emp.age >= 60) || emp.contractType === 'دائم';
          type = isAbove60 ? 'محدد المدة - فوق السن' : 'محدد المدة';
        }

        let start = new Date();
        if (emp.endDate) {
          const currentEnd = new Date(emp.endDate);
          if (!isNaN(currentEnd.getTime())) {
            start = new Date(currentEnd);
            start.setDate(start.getDate() + 1);
          }
        }
        
        const end = new Date(start);
        end.setMonth(end.getMonth() + Number(bulkRenewalMonths));
        end.setDate(end.getDate() - 1);
        const endStr = end.toISOString().split('T')[0];

        payloads.push({
          request_id: `${yearPrefix}${Math.floor(10000 + Math.random() * 90000)}-${idx}`,
          employee_id: emp.employee_id || emp.id || `EMP-${emp.code}`,
          employee_code: String(emp.code),
          employee_name: String(emp.name),
          company: emp.company || '',
          department: emp.department || '',
          job_title: emp.jobTitle || '',
          contract_type: type,
          renewal_months: Number(bulkRenewalMonths),
          new_contract_end_date: endStr,
          status: 'Pending',
          signature_status: 'في انتظار توقيع الموظف',
          request_date: new Date().toISOString().split('T')[0],
        });
      });

      const { error } = await supabase.from('renewal_requests').insert(payloads);
      if (error) throw error;

      alert(`✅ تم إنشاء طلبات التجديد لعدد (${payloads.length}) موظف بنجاح دفعة واحدة.`);
      setShowBulkRenewalModal(false);
      setSelectedEmpCodes([]);
      await refresh();
    } catch (err: any) {
      alert('حدث خطأ أثناء حفظ الطلبات المجمعة: ' + err.message);
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div style={{ direction: 'rtl', animation: 'fadeIn 0.3s ease-in-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950, #0f172a)', fontWeight: '800' }}>إدارة العقود الحالية</h3>
          <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>متابعة وتحديث سريان العقود الحالية وتعديل نهايات الخدمة</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowTermModal(true)} style={{ background: '#ef4444', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>🚫 إنهاء تعاقد</button>
          <button onClick={() => setShowNewContractModal(true)} style={{ background: 'var(--brass-600, #0d9488)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>+ إنشاء عقد جديد ✍️</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        <div onClick={() => setActiveCardFilter(activeCardFilter === 'FIXED' ? null : 'FIXED')} style={{ background: activeCardFilter === 'FIXED' ? '#eff6ff' : '#fff', border: activeCardFilter === 'FIXED' ? '2px solid #2563eb' : '1px solid #e2e8f0', padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}><span>عقود محددة المدة</span> <span style={{ opacity: 0.8 }}>📑</span></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}><div style={{ fontSize: '24px', fontWeight: '900', color: '#2563eb' }}>{cardStats.totalFixed.toLocaleString('en-US')}</div><div style={{ fontSize: '10.5px', fontWeight: 'bold', color: '#1d4ed8', background: '#dbeafe', padding: '2px 8px', borderRadius: '6px' }}>{cardStats.pctFixed}%</div></div>
            <div style={{ fontSize: '10px', color: '#3b82f6', fontWeight: 'bold', marginTop: '6px' }}>اضغط للتصفية 👁️</div>
          </div>
          <div style={{ position: 'absolute', left: '-10px', bottom: '-10px', fontSize: '60px', opacity: 0.05, transform: 'rotate(-10deg)', pointerEvents: 'none' }}>📂</div>
        </div>
        <div onClick={() => setActiveCardFilter(activeCardFilter === 'ABOVE_AGE' ? null : 'ABOVE_AGE')} style={{ background: activeCardFilter === 'ABOVE_AGE' ? '#fef3c7' : '#fff', border: activeCardFilter === 'ABOVE_AGE' ? '2px solid #d97706' : '1px solid #e2e8f0', padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}><span>عقود فوق السن</span> <span style={{ opacity: 0.8 }}>🧓</span></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}><div style={{ fontSize: '24px', fontWeight: '900', color: '#d97706' }}>{cardStats.totalAboveAge.toLocaleString('en-US')}</div><div style={{ fontSize: '10.5px', fontWeight: 'bold', color: '#b45309', background: '#fde68a', padding: '2px 8px', borderRadius: '6px' }}>{cardStats.pctAboveAge}%</div></div>
            <div style={{ fontSize: '10px', color: '#d97706', fontWeight: 'bold', marginTop: '6px' }}>اضغط للتصفية 👁️</div>
          </div>
          <div style={{ position: 'absolute', left: '-10px', bottom: '-10px', fontSize: '60px', opacity: 0.05, transform: 'rotate(-10deg)', pointerEvents: 'none' }}>💼</div>
        </div>
        <div onClick={() => setActiveCardFilter(activeCardFilter === 'PERM' ? null : 'PERM')} style={{ background: activeCardFilter === 'PERM' ? '#f0fdf4' : '#fff', border: activeCardFilter === 'PERM' ? '2px solid #16a34a' : '1px solid #e2e8f0', padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}><span>عقود دائمة</span> <span style={{ opacity: 0.8 }}>🏛️</span></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}><div style={{ fontSize: '24px', fontWeight: '900', color: '#16a34a' }}>{cardStats.totalPerm.toLocaleString('en-US')}</div><div style={{ fontSize: '10.5px', fontWeight: 'bold', color: '#15803d', background: '#bbf7d0', padding: '2px 8px', borderRadius: '6px' }}>{cardStats.pctPerm}%</div></div>
            <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 'bold', marginTop: '6px' }}>اضغط للتصفية 👁️</div>
          </div>
          <div style={{ position: 'absolute', left: '-10px', bottom: '-10px', fontSize: '60px', opacity: 0.05, transform: 'rotate(-10deg)', pointerEvents: 'none' }}>🛡️</div>
        </div>
        <div onClick={() => setActiveCardFilter(activeCardFilter === 'TURNING_60' ? null : 'TURNING_60')} style={{ background: activeCardFilter === 'TURNING_60' ? '#fff7ed' : '#fff', border: activeCardFilter === 'TURNING_60' ? '2px solid #ea580c' : '1px solid #e2e8f0', padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}><span>سن الـ 60 قريباً (60 يوم)</span> <span style={{ opacity: 0.8 }}>⏳</span></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}><div style={{ fontSize: '24px', fontWeight: '900', color: '#ea580c' }}>{cardStats.totalTurning60.toLocaleString('en-US')}</div><div style={{ fontSize: '10.5px', fontWeight: 'bold', color: '#c2410c', background: '#fed7aa', padding: '2px 8px', borderRadius: '6px' }}>{cardStats.pctTurning60}%</div></div>
            <div style={{ fontSize: '10px', color: '#ea580c', fontWeight: 'bold', marginTop: '6px' }}>عرض القائمة 👁️</div>
          </div>
          <div style={{ position: 'absolute', left: '-10px', bottom: '-10px', fontSize: '60px', opacity: 0.05, transform: 'rotate(-10deg)', pointerEvents: 'none' }}>🎂</div>
        </div>
      </div>

      {selectedEmpCodes.length > 0 && (
        <div style={{ background: '#0f172a', color: '#fff', padding: '10px 16px', borderRadius: '10px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: 'fadeIn 0.2s' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
            تم تحديد <span style={{ color: '#38bdf8', margin: '0 4px' }}>{selectedEmpCodes.length}</span> موظف
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowBulkRenewalModal(true)} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
              إنشاء طلبات تجديد مجمعة ✍️
            </button>
            <button onClick={() => setSelectedEmpCodes([])} style={{ background: 'transparent', border: '1px solid #475569', color: '#94a3b8', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
              إلغاء التحديد ✕
            </button>
          </div>
        </div>
      )}

      <div className="db-card" style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="بحث بـ كود الموظف، الاسم..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', outline: 'none', width: '200px' }} />
        
        <input list="companyList" placeholder="🏢 بحث/اختيار الشركة..." value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', outline: 'none', width: '160px' }} />
        <datalist id="companyList">{companiesList.map((c: any, i) => <option key={i} value={c} />)}</datalist>

        <input list="deptList" placeholder="💼 بحث/اختيار الإدارة..." value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', outline: 'none', width: '160px' }} />
        <datalist id="deptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>

        <select value={selectedType} onChange={e => setSelectedType(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', outline: 'none' }}><option value="">📄 أنواع العقود</option>{typesList.map((t: any, i) => <option key={i} value={t}>{t}</option>)}</select>
        <button onClick={() => { setSearchTerm(''); setSelectedCompany(''); setSelectedDept(''); setSelectedType(''); setActiveCardFilter(null); }} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>
      </div>

      <div className="db-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>جاري جلب سريان العقود... ⏳</div>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
                <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '12px', textAlign: 'center', width: '40px' }}>
                    <input 
                      type="checkbox" 
                      style={{ accentColor: '#0d9488' }}
                      checked={selectedEmpCodes.length === sortedContracts.length && sortedContracts.length > 0} 
                      onChange={e => setSelectedEmpCodes(e.target.checked ? sortedContracts.map(c => c.code) : [])} 
                    />
                  </th>
                  <th onClick={() => handleSort('code')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الكود {renderSortArrow('code')}</th>
                  <th onClick={() => handleSort('name')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>اسم الموظف {renderSortArrow('name')}</th>
                  <th onClick={() => handleSort('department')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الإدارة {renderSortArrow('department')}</th>
                  <th onClick={() => handleSort('startDate')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>بداية العقد {renderSortArrow('startDate')}</th>
                  <th onClick={() => handleSort('endDate')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>نهاية العقد {renderSortArrow('endDate')}</th>
                  <th onClick={() => handleSort('daysLeft')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الأيام المتبقية {renderSortArrow('daysLeft')}</th>
                  <th onClick={() => handleSort('contractType')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>نوع العقد {renderSortArrow('contractType')}</th>
                  <th style={{ padding: '12px', color: '#64748b', textAlign: 'center' }}>إجراء التجديد</th>
                  <th style={{ padding: '12px', color: '#64748b', textAlign: 'center' }}>تعديل العقد</th>
                </tr>
              </thead>
              <tbody>
                {sortedContracts.length === 0 ? (
                  <tr><td colSpan={10} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>لا توجد عقود تطابق بحثك.</td></tr>
                ) : (
                  sortedContracts.map((emp, i) => {
                    const isPerm = emp.contractType === 'دائم';
                    const isSelected = selectedEmpCodes.includes(emp.code);

                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: isSelected ? '#f0fdf4' : 'transparent' }}>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            style={{ accentColor: '#0d9488' }}
                            checked={isSelected}
                            onChange={e => {
                              if(e.target.checked) setSelectedEmpCodes(prev => [...prev, emp.code]);
                              else setSelectedEmpCodes(prev => prev.filter(c => c !== emp.code));
                            }}
                          />
                        </td>
                        <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#0d9488' }}>{emp.code}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.name}</td>
                        <td style={{ padding: '10px', color: '#64748b' }}>{emp.department || '—'}</td>
                        <td style={{ padding: '10px', fontFamily: 'monospace' }}>{emp.startDate || '—'}</td>
                        <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold' }}>{emp.endDate || '—'}</td>
                        <td style={{ padding: '10px' }}>
                          {emp.daysLeft !== null ? (
                            <span style={{ fontWeight: 'bold', color: emp.daysLeft < 0 ? '#dc2626' : emp.daysLeft <= 60 ? '#d97706' : '#15803d' }}>
                              {emp.daysLeft < 0 ? `منتهي (${Math.abs(emp.daysLeft)} يوم)` : `${emp.daysLeft} يوم`}
                            </span>
                          ) : (
                            isPerm ? <Stamp color="green">دائم 🛡️</Stamp> : '—'
                          )}
                        </td>
                        <td style={{ padding: '10px', fontWeight: 'bold' }}>{emp.contractType || '—'}</td>

                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {emp.hasPendingRenewal ? (
                            <span style={{ background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>قيد التجديد ⏳</span>
                          ) : (
                            <button onClick={() => handleOpenRenewalModal(emp)} style={{ background: isPerm ? '#d97706' : '#0d9488', color: '#fff', border: 0, padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                              {isPerm ? 'تحويل لفوق السن 🔄' : 'إنشاء طلب تجديد ✍️'}
                            </button>
                          )}
                        </td>

                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <button onClick={() => handleOpenEditContract(emp)} style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="تعديل تاريخ بداية ونهاية العقد مباشرة">✏️ تعديل</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showBulkRenewalModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '550px', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>✍️ إنشاء طلبات تجديد مجمعة</h3>
              <button onClick={() => setShowBulkRenewalModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <form onSubmit={handleSaveBulkRenewalRequest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '8px', fontSize: '12px', color: '#166534' }}>
                سيتم إنشاء طلب تجديد لعدد <strong>({selectedEmpCodes.length})</strong> موظف دفعة واحدة.
                <br />
                <span style={{ fontSize: '11px', opacity: 0.8 }}>يتم حساب تاريخ نهاية العقد الجديد أوتوماتيكياً لكل موظف بناءً على تاريخ نهاية عقده الحالي.</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>نوع العقد للمجموعة المحددة:</label>
                <select value={bulkRenewalType} onChange={e => setBulkRenewalType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}>
                  <option value="smart">تحديد ذكي تلقائي (محدد مدة / فوق السن حسب عمر الموظف)</option>
                  <option value="محدد المدة">محدد المدة (للجميع)</option>
                  <option value="محدد المدة - فوق السن">محدد المدة - فوق السن (للجميع)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>مدة التجديد بالشهور (للجميع):</label>
                <select value={bulkRenewalMonths} onChange={e => setBulkRenewalMonths(Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}>
                  <option value={1}>شهر واحد</option>
                  <option value={2}>شهران</option>
                  <option value={3}>3 أشهر</option>
                  <option value={6}>6 أشهر</option>
                  <option value={9}>9 أشهر</option>
                  <option value={12}>12 شهر (سنة)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                <button type="button" onClick={() => setShowBulkRenewalModal(false)} style={{ background: 'transparent', border: '1px solid #e2e8f0', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={bulkSaving} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: bulkSaving ? 'not-allowed' : 'pointer', opacity: bulkSaving ? 0.7 : 1 }}>
                  {bulkSaving ? 'جاري الإرسال للجميع...' : 'تأكيد الإرسال المجمع 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRenewalModal && selectedEmp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '550px', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>✍️ إنشاء طلب تجديد / تحويل عقد</h3>
              <button onClick={() => setShowRenewalModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <form onSubmit={handleSaveRenewalRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                <div><strong>الموظف:</strong> {selectedEmp.name} (<span style={{ color: '#0d9488' }}>{selectedEmp.code}</span>)</div>
                <div><strong>الإدارة:</strong> {selectedEmp.department || '—'} | <strong>السن الحالي:</strong> {selectedEmp.age ? `${selectedEmp.age} سنة` : '—'}</div>
                <div><strong>نوع العقد الحالي:</strong> {selectedEmp.contractType || '—'}</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>نوع العقد الجديد:</label>
                <select value={renewalType} onChange={e => setRenewalType(e.target.value)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}>
                  <option value="محدد المدة">محدد المدة (سنوي)</option>
                  <option value="محدد المدة - فوق السن">محدد المدة - فوق السن (تقاعد/60+)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>مدة التجديد (بالشهور):</label>
                <select value={renewalMonths} onChange={e => handleMonthsOrDateChange(Number(e.target.value), newStartDate)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}>
                  <option value={1}>شهر واحد</option><option value={2}>شهران</option><option value={3}>3 أشهر</option>
                  <option value={6}>6 أشهر</option><option value={9}>9 أشهر</option><option value={12}>12 شهر (سنة)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#fffbeb', padding: '10px', borderRadius: '8px', border: '1px dashed #fde68a' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#d97706', fontWeight: 'bold', marginBottom: '6px' }}>بداية العقد (متاح يدوياً):</label>
                  <input type="date" required value={newStartDate} onChange={e => handleMonthsOrDateChange(renewalMonths, e.target.value)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #fcd34d', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#d97706', fontWeight: 'bold', marginBottom: '6px' }}>نهاية العقد (متاح يدوياً):</label>
                  <input type="date" required value={newEndDate} onChange={e => setNewEndDate(e.target.value)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #fcd34d', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                <button type="button" onClick={() => setShowRenewalModal(false)} style={{ background: 'transparent', border: '1px solid #e2e8f0', padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={saving} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'جاري إرسال الطلب...' : 'تأكيد وإرسال طلب التجديد 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editContractData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '500px', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>✏️ تعديل تواريخ وسريان العقد</h3>
              <button onClick={() => setEditData(null)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleSaveContractEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                <div><strong>الموظف:</strong> {editContractData.emp.name} (<span style={{ color: '#0d9488' }}>{editContractData.emp.code}</span>)</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>نوع العقد:</label>
                <select value={editContractData.contract_type} onChange={e => setEditData({ ...editContractData, contract_type: e.target.value })} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}>
                  <option value="دائم">دائم</option><option value="محدد المدة">محدد المدة</option><option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>تاريخ بداية العقد:</label>
                <input type="date" value={editContractData.contract_start_date} onChange={e => setEditData({ ...editContractData, contract_start_date: e.target.value })} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>تاريخ نهاية العقد الحالي:</label>
                <input type="date" value={editContractData.contract_end_date} onChange={e => setEditData({ ...editContractData, contract_end_date: e.target.value })} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setEditData(null)} style={{ background: 'transparent', border: '1px solid #e2e8f0', padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={editContractData.saving} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: editContractData.saving ? 'not-allowed' : 'pointer' }}>حفظ التغييرات 💾</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNewContractModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '550px', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>+ إنشاء عقد جديد لموظف</h3>
              <button onClick={() => setShowNewContractModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleCreateNewContract} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>اختر الموظف:</label>
                <select required value={newContract.employee_code} onChange={e => setNewContract({ ...newContract, employee_code: e.target.value })} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}>
                  <option value="">-- اختر الموظف --</option>
                  {activeEmployees.map((emp, i) => <option key={i} value={getField(emp, 'employee_code', 'EmployeeCode')}>[{getField(emp, 'employee_code', 'EmployeeCode')}] {getField(emp, 'employee_name', 'ArabicName')}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>نوع العقد الجديد:</label>
                <select value={newContract.contract_type} onChange={e => setNewContract({ ...newContract, contract_type: e.target.value })} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}>
                  <option value="محدد المدة">محدد المدة</option><option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option><option value="دائم">دائم</option>
                </select>
              </div>
              {newContract.contract_type !== 'دائم' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>مدة العقد (شهور):</label>
                    <select value={newContract.months} onChange={e => setNewContract({ ...newContract, months: Number(e.target.value) })} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}>
                      <option value={1}>شهر واحد</option><option value={2}>شهران</option><option value={3}>3 أشهر</option><option value={6}>6 أشهر</option><option value={9}>9 أشهر</option><option value={12}>12 شهر (سنة)</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div><label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>بداية العقد (يدوي):</label><input type="date" required value={newContract.start_date} onChange={e => setNewContract({ ...newContract, start_date: e.target.value })} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} /></div>
                    <div><label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>نهاية العقد (يدوي):</label><input type="date" value={newContract.end_date} onChange={e => setNewContract({ ...newContract, end_date: e.target.value })} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} /></div>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowNewContractModal(false)} style={{ background: 'transparent', border: '1px solid #e2e8f0', padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={newContractSaving} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: newContractSaving ? 'not-allowed' : 'pointer' }}>حفظ العقد الجديد 🚀</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTermModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '500px', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#dc2626', fontWeight: '800' }}>🚫 إنهاء تعاقد موظف</h3>
              <button onClick={() => setShowTermModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleConfirmTermination} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>البحث عن الموظف المراد إنهاء عقده:</label>
                <input type="text" placeholder="اكتب كود الموظف أو اسمه..." value={termSearch} onChange={e => { setTermSearch(e.target.value); setSelectedTermEmp(null); }} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                {termSearchResults.length > 0 && !selectedTermEmp && (
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', marginTop: '4px', maxHeight: '150px', overflowY: 'auto' }}>
                    {termSearchResults.map((emp, i) => (
                      <div key={i} onClick={() => { setSelectedTermEmp(emp); setTermSearch(`${getField(emp, 'employee_code', 'EmployeeCode')} - ${getField(emp, 'employee_name', 'ArabicName')}`); }} style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '11px' }}>
                        <strong style={{ color: '#0d9488' }}>[{getField(emp, 'employee_code', 'EmployeeCode')}]</strong> {getField(emp, 'employee_name', 'ArabicName')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>سبب إنهاء التعاقد:</label>
                <select value={termReason} onChange={e => setTermReason(e.target.value)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}>
                  <option value="إنهاء عقد">إنهاء عقد</option><option value="استقالة">استقالة</option><option value="إنهاء خدمات">إنهاء خدمات</option><option value="بلوغ سن">بلوغ سن (تقاعد)</option><option value="انقطاع عن العمل">انقطاع عن العمل</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>تاريخ إنهاء التعاقد:</label>
                <input type="date" required value={termDate} onChange={e => setTermDate(e.target.value)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowTermModal(false)} style={{ background: 'transparent', border: '1px solid #e2e8f0', padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={termSaving || !selectedTermEmp} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: (termSaving || !selectedTermEmp) ? 'not-allowed' : 'pointer' }}>تأكيد إنهاء التعاقد 🚫</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
