'use client';

import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';

const getField = (obj: any, ...keys: string[]) => {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return '';
};

const getEmployeeCode = (emp: any) =>
  String(getField(emp, 'employee_code', 'EmployeeCode', 'code') || '').trim();

const getEmployeeName = (emp: any) =>
  getField(emp, 'employee_name', 'EmployeeName', 'ArabicName', 'name');

const getNationalId = (emp: any) =>
  String(getField(emp, 'national_id', 'NationalID') || '').trim();

const normalizeSearch = (value: any) =>
  String(value ?? '').trim().toLowerCase();

const getEmployeeAge = (emp: any) => {
  const rawAge = getField(emp, 'age', 'Age');
  if (rawAge !== '' && rawAge !== null && !isNaN(Number(rawAge))) {
    return Number(rawAge);
  }

  const birthDateRaw = getField(emp, 'birth_date', 'BirthDate');
  if (!birthDateRaw) return null;

  const birthDate = new Date(birthDateRaw);
  if (isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

  if (!hasBirthdayPassed) age--;
  return age;
};

const getRetirementDate = (emp: any) => {
  const birthDateRaw = getField(emp, 'birth_date', 'BirthDate');
  if (!birthDateRaw) return null;

  const birthDate = new Date(birthDateRaw);
  if (isNaN(birthDate.getTime())) return null;

  birthDate.setFullYear(birthDate.getFullYear() + 60);
  return birthDate.toISOString().split('T')[0];
};

const isActiveEmployee = (emp: any) => {
  const status = String(getField(emp, 'status', 'Status') || 'Active').trim().toLowerCase();
  const dept = String(getField(emp, 'department', 'Department')).trim();
  const type = String(getField(emp, 'contract_type', 'ContractType')).trim();

  const isTransfer = dept.includes('تحويلات تحت الاعتماد') || dept.includes('تحويلات/تحت الاعتماد') || dept.includes('تحويل');
  const isTerminatedType = type === 'إنهاء تعاقد' || status === 'terminated' || status === 'inactive';

  return !isTransfer && !isTerminatedType;
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeCardFilter, setActiveCardFilter] = useState<'ALL_ACTIVE' | 'PERM' | 'FIXED' | 'ABOVE_AGE' | null>('ALL_ACTIVE');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedAgeRange, setSelectedAgeRange] = useState('');

  const [sortColumn, setSortColumn] = useState('employee_code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showTermModal, setShowTermModal] = useState(false);
  const [showBulkTransferModal, setShowBulkTransferModal] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [profileEmp, setProfileEmp] = useState<any>(null);

  const [bulkDept, setBulkDept] = useState('');
  const [bulkCompany, setBulkCompany] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [termSearch, setTermSearch] = useState('');
  const [selectedTermEmp, setSelectedTermEmp] = useState<any>(null);
  const [termReason, setTermReason] = useState('استقالة');
  const [termDate, setTermDate] = useState(new Date().toISOString().split('T')[0]);
  const [termSaving, setTermSaving] = useState(false);

  const [newEmp, setNewEmp] = useState({
    employee_code: '', employee_name: '', national_id: '', birth_date: '', department: '', company: '', job_title: '', hiring_date: '', contract_type: 'محدد المدة', contract_end_date: '', status: 'Active', email: '', mobile: '',
  });

  // جلب البيانات من Neon PostgreSQL
  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/employees');
      const json = await res.json();
      if (json.success) {
        setEmployees(json.employees || []);
      }
    } catch (e) {
      console.error('Failed to fetch employees from Neon', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const deptsList = useMemo(() => Array.from(new Set(employees.map((emp: any) => getField(emp, 'department', 'Department')).filter(Boolean))), [employees]);
  const compsList = useMemo(() => Array.from(new Set(employees.map((emp: any) => getField(emp, 'company', 'Company')).filter(Boolean))), [employees]);

  const baseFilteredEmployees = useMemo(() => {
    const search = normalizeSearch(searchTerm);

    return employees.filter((emp: any) => {
      const code = normalizeSearch(getEmployeeCode(emp));
      const name = normalizeSearch(getEmployeeName(emp));
      const nationalId = normalizeSearch(getNationalId(emp));
      const department = normalizeSearch(getField(emp, 'department', 'Department'));
      const company = normalizeSearch(getField(emp, 'company', 'Company'));
      const contractType = normalizeSearch(getField(emp, 'contract_type', 'ContractType'));
      const age = getEmployeeAge(emp);

      const matchesSearch = !search || code.includes(search) || name.includes(search) || nationalId.includes(search) || department.includes(search);
      const matchesDept = !selectedDept || department.includes(normalizeSearch(selectedDept));
      const matchesCompany = !selectedCompany || company.includes(normalizeSearch(selectedCompany));

      let matchesType = true;
      if (selectedType) {
        if (selectedType === 'filter_permanent') matchesType = contractType.includes('دائم') || contractType.includes('غير محدد');
        else if (selectedType === 'filter_fixed') matchesType = contractType.includes('محدد') && !contractType.includes('فوق السن');
        else if (selectedType === 'filter_overage') matchesType = contractType.includes('فوق السن');
        else if (selectedType === 'filter_reward') matchesType = contractType.includes('مكافأة') || contractType.includes('مكافأه') || contractType.includes('reward');
        else matchesType = contractType === selectedType;
      }

      let matchesAge = true;
      if (selectedAgeRange === '60_plus') matchesAge = age !== null && age >= 60;
      if (selectedAgeRange === '50_59') matchesAge = age !== null && age >= 50 && age < 60;
      if (selectedAgeRange === '30_49') matchesAge = age !== null && age >= 30 && age < 50;
      if (selectedAgeRange === 'under_30') matchesAge = age !== null && age < 30;

      return matchesSearch && matchesDept && matchesCompany && matchesType && matchesAge;
    });
  }, [employees, searchTerm, selectedDept, selectedCompany, selectedType, selectedAgeRange]);

  const kpiStats = useMemo(() => {
    const activeBase = baseFilteredEmployees.filter(isActiveEmployee);
    const total = activeBase.length;
    const perm = activeBase.filter((emp: any) => String(getField(emp, 'contract_type', 'ContractType')).includes('دائم') || String(getField(emp, 'contract_type', 'ContractType')).includes('غير محدد')).length;
    const fixed = activeBase.filter((emp: any) => String(getField(emp, 'contract_type', 'ContractType')).includes('محدد') && !String(getField(emp, 'contract_type', 'ContractType')).includes('فوق السن')).length;
    const aboveAge = activeBase.filter((emp: any) => String(getField(emp, 'contract_type', 'ContractType')).includes('فوق السن') || (getEmployeeAge(emp) !== null && getEmployeeAge(emp)! >= 60)).length;
    const pct = (value: number) => total ? Number(((value / total) * 100).toFixed(1)) : 0;

    return { total, perm, permPct: pct(perm), fixed, fixedPct: pct(fixed), aboveAge, aboveAgePct: pct(aboveAge) };
  }, [baseFilteredEmployees]);

  const finalTableEmployees = useMemo(() => {
    const filtered = baseFilteredEmployees.filter((emp: any) => {
      const type = String(getField(emp, 'contract_type', 'ContractType'));
      const age = getEmployeeAge(emp);
      if (activeCardFilter === 'PERM') return type.includes('دائم') || type.includes('غير محدد');
      if (activeCardFilter === 'FIXED') return type.includes('محدد') && !type.includes('فوق السن');
      if (activeCardFilter === 'ABOVE_AGE') return type.includes('فوق السن') || (age !== null && age >= 60);
      return true;
    });

    return [...filtered].sort((a: any, b: any) => {
      if (sortColumn === 'age') {
        const aAge = getEmployeeAge(a) ?? 0;
        const bAge = getEmployeeAge(b) ?? 0;
        return sortDirection === 'asc' ? aAge - bAge : bAge - aAge;
      }
      const aValue = String(getField(a, sortColumn) || '');
      const bValue = String(getField(b, sortColumn) || '');
      return sortDirection === 'asc' ? aValue.localeCompare(bValue, undefined, { numeric: true }) : bValue.localeCompare(aValue, undefined, { numeric: true });
    });
  }, [baseFilteredEmployees, activeCardFilter, sortColumn, sortDirection]);

  const termSearchResults = useMemo(() => {
    const search = normalizeSearch(termSearch);
    if (!search) return [];
    return employees.filter(isActiveEmployee).filter((emp: any) => {
      const code = normalizeSearch(getEmployeeCode(emp));
      const name = normalizeSearch(getEmployeeName(emp));
      const nationalId = normalizeSearch(getNationalId(emp));
      const dept = normalizeSearch(getField(emp, 'department', 'Department'));
      return code.includes(search) || name.includes(search) || nationalId.includes(search) || dept.includes(search);
    }).slice(0, 8);
  }, [employees, termSearch]);

  const handleSort = (column: string) => {
    if (sortColumn === column) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(column); setSortDirection('asc'); }
  };

  const renderSortArrow = (column: string) => {
    if (sortColumn !== column) return <span style={{ opacity: 0.3, marginRight: '4px' }}>↕</span>;
    return <span style={{ marginRight: '4px', color: '#0d9488' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>;
  };

  const handleOpenEdit = (emp: any) => setEditData({ emp: { ...emp }, loading: false, saving: false });

  // حفظ التعديلات المباشرة
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;
    setEditData({ ...editData, saving: true });

    try {
      const emp = editData.emp;
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', ...emp }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setEditData(null);
        fetchEmployees();
      } else {
        alert('خطأ: ' + data.error);
      }
    } catch (error: any) {
      alert('حدث خطأ أثناء الحفظ: ' + error.message);
    } finally {
      setEditData((prev: any) => prev ? { ...prev, saving: false } : null);
    }
  };

  // إنهاء الخدمة
  const handleConfirmTermination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTermEmp) return;
    setTermSaving(true);
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'terminate',
          employee_code: getEmployeeCode(selectedTermEmp),
          termination_reason: termReason,
          termination_date: termDate,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setShowTermModal(false);
        setSelectedTermEmp(null);
        setTermSearch('');
        fetchEmployees();
      } else {
        alert('خطأ: ' + data.error);
      }
    } catch (error: any) {
      alert('خطأ: ' + error.message);
    } finally {
      setTermSaving(false);
    }
  };

  // نقل مجمع
  const handleConfirmBulkTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmpIds.length === 0 || (!bulkDept && !bulkCompany)) return;
    setBulkSaving(true);
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_transfer',
          employee_codes: selectedEmpIds,
          department: bulkDept,
          company: bulkCompany,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setShowBulkTransferModal(false);
        setSelectedEmpIds([]);
        setBulkDept('');
        setBulkCompany('');
        fetchEmployees();
      } else {
        alert('خطأ: ' + data.error);
      }
    } catch (error: any) {
      alert('خطأ: ' + error.message);
    } finally {
      setBulkSaving(false);
    }
  };

  // حذف مجمع
  const handleDeleteSelected = async () => {
    if (selectedEmpIds.length === 0) return;
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedEmpIds.length} موظف نهائيًا؟`)) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_delete',
          employee_codes: selectedEmpIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setSelectedEmpIds([]);
        fetchEmployees();
      } else {
        alert('خطأ: ' + data.error);
      }
    } catch (error: any) {
      alert('خطأ: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // إضافة موظف جديد
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', ...newEmp }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setShowAddModal(false);
        setNewEmp({ employee_code: '', employee_name: '', national_id: '', birth_date: '', department: '', company: '', job_title: '', hiring_date: '', contract_type: 'محدد المدة', contract_end_date: '', status: 'Active', email: '', mobile: '' });
        fetchEmployees();
      } else {
        alert('خطأ: ' + data.error);
      }
    } catch (error: any) {
      alert('خطأ: ' + error.message);
    }
  };

  const handleExportToExcel = (onlySelected = false) => {
    const rows = onlySelected ? finalTableEmployees.filter((emp: any) => selectedEmpIds.includes(getEmployeeCode(emp))) : finalTableEmployees;
    const data = rows.map((emp: any) => ({
      EmployeeCode: getEmployeeCode(emp),
      EmployeeName: getEmployeeName(emp),
      NationalID: getNationalId(emp),
      Department: getField(emp, 'department', 'Department'),
      Company: getField(emp, 'company', 'Company'),
      JobTitle: getField(emp, 'job_title', 'JobTitle'),
      Age: getEmployeeAge(emp),
      RetirementDate: getRetirementDate(emp),
      HiringDate: getField(emp, 'hiring_date', 'HiringDate'),
      ContractType: getField(emp, 'contract_type', 'ContractType'),
      ContractEndDate: getField(emp, 'contract_end_date', 'ContractEndDate'),
      Mobile: getField(emp, 'mobile', 'Mobile'),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, `Employees_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getContractStatusBadge = (type: string, endDate: string) => {
    if (endDate && String(endDate).trim()) {
      const days = Math.ceil((new Date(endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      if (days < 0) return <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>{endDate} 🚨</span>;
      if (days <= 60) return <span style={{ background: '#fffbe1', color: '#b45309', border: '1px solid #fde68a', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>{endDate} ⏳</span>;
      return <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>{endDate}</span>;
    }
    if (type?.includes('دائم') || type?.includes('غير محدد')) return <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>عقد دائم 🛡️</span>;
    return <span style={{ color: '#94a3b8' }}>—</span>;
  };

  const renderAgeBadge = (emp: any) => {
    const age = getEmployeeAge(emp);
    if (age === null) return <span style={{ color: '#94a3b8' }}>—</span>;
    if (age >= 60) return <span style={{ background: '#fffbe1', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>💼 {age} سنة (60+)</span>;
    if (age === 59) return <span style={{ background: '#ffedd5', color: '#ea580c', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>⏳ {age} سنة (قرب المعاش)</span>;
    return <span style={{ background: '#f8fafc', color: '#0f172a', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>{age} سنة</span>;
  };

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900', letterSpacing: '-0.3px' }}>👥 بيانات القوة البشرية (HR - Neon DB)</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>إدارة وتتبع السجل الرئيسي للموظفين عبر Neon PostgreSQL</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => handleExportToExcel(false)} style={{ background: '#10b981', color: '#fff', border: 0, padding: '9px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>📥 تصدير Excel</button>
          <button onClick={() => { setShowTermModal(true); setSelectedTermEmp(null); setTermSearch(''); }} style={{ background: '#ef4444', color: '#fff', border: 0, padding: '9px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>🚫 إنهاء وتجميد</button>
          <button onClick={() => setShowAddModal(true)} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '9px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>+ إضافة موظف</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div onClick={() => setActiveCardFilter('ALL_ACTIVE')} style={{ background: activeCardFilter === 'ALL_ACTIVE' ? 'linear-gradient(135deg, #ffffff, #f0fdf4)' : '#ffffff', border: activeCardFilter === 'ALL_ACTIVE' ? '2px solid #22c55e' : '1px solid #e2e8f0', borderRadius: '16px', padding: '18px 20px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '12px', fontWeight: '800', color: '#475569' }}>إجمالي الموظفين (النشطين)</span><span style={{ background: '#dcfce7', color: '#15803d', fontSize: '10px', fontWeight: '900', padding: '3px 8px', borderRadius: '20px' }}>100%</span></div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#16a34a', marginTop: '10px' }}>{kpiStats.total.toLocaleString()}</div>
        </div>
        <div onClick={() => setActiveCardFilter('PERM')} style={{ background: activeCardFilter === 'PERM' ? 'linear-gradient(135deg, #ffffff, #f0fdf4)' : '#ffffff', border: activeCardFilter === 'PERM' ? '2px solid #16a34a' : '1px solid #e2e8f0', borderRadius: '16px', padding: '18px 20px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '12px', fontWeight: '800', color: '#475569' }}>عقود دائمة</span><span style={{ background: '#dcfce7', color: '#15803d', fontSize: '10px', fontWeight: '900', padding: '3px 8px', borderRadius: '20px' }}>{kpiStats.permPct}%</span></div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#16a34a', marginTop: '10px' }}>{kpiStats.perm.toLocaleString()}</div>
        </div>
        <div onClick={() => setActiveCardFilter('FIXED')} style={{ background: activeCardFilter === 'FIXED' ? 'linear-gradient(135deg, #ffffff, #eff6ff)' : '#ffffff', border: activeCardFilter === 'FIXED' ? '2px solid #2563eb' : '1px solid #e2e8f0', borderRadius: '16px', padding: '18px 20px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '12px', fontWeight: '800', color: '#475569' }}>عقود محددة المدة</span><span style={{ background: '#dbeafe', color: '#1e40af', fontSize: '10px', fontWeight: '900', padding: '3px 8px', borderRadius: '20px' }}>{kpiStats.fixedPct}%</span></div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#2563eb', marginTop: '10px' }}>{kpiStats.fixed.toLocaleString()}</div>
        </div>
        <div onClick={() => setActiveCardFilter('ABOVE_AGE')} style={{ background: activeCardFilter === 'ABOVE_AGE' ? 'linear-gradient(135deg, #ffffff, #fffbe1)' : '#ffffff', border: activeCardFilter === 'ABOVE_AGE' ? '2px solid #d97706' : '1px solid #e2e8f0', borderRadius: '16px', padding: '18px 20px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '12px', fontWeight: '800', color: '#475569' }}>فوق السن (60+)</span><span style={{ background: '#fef3c7', color: '#92400e', fontSize: '10px', fontWeight: '900', padding: '3px 8px', borderRadius: '20px' }}>{kpiStats.aboveAgePct}%</span></div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#d97706', marginTop: '10px' }}>{kpiStats.aboveAge.toLocaleString()}</div>
        </div>
      </div>

      {selectedEmpIds.length > 0 && (
        <div style={{ background: '#0f172a', color: '#fff', padding: '12px 18px', borderRadius: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>تم تحديد <span style={{ color: '#38bdf8', fontSize: '14px' }}>{selectedEmpIds.length}</span> موظف</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowBulkTransferModal(true)} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>نقل مجمع 🔄</button>
            <button onClick={() => handleExportToExcel(true)} style={{ padding: '7px 14px', background: '#10b981', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>تصدير المحدد 📥</button>
            <button onClick={handleDeleteSelected} disabled={isDeleting} style={{ padding: '7px 14px', background: '#ef4444', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>حذف نهائي 🗑️</button>
            <button onClick={() => setSelectedEmpIds([])} style={{ padding: '7px 14px', background: 'transparent', color: '#cbd5e1', border: '1px solid #475569', borderRadius: '8px', cursor: 'pointer', fontSize: '11px' }}>إلغاء ✕</button>
          </div>
        </div>
      )}

      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '14px 18px', borderRadius: '14px', marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="بحث بالاسم، الكود، الرقم القومي، الإدارة..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', minWidth: '260px', outline: 'none' }} />
        <input list="deptList" placeholder="الإدارة..." value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', width: '130px' }} />
        <datalist id="deptList">{deptsList.map((d: any, i: number) => (<option key={i} value={d} />))}</datalist>
        <input list="compList" placeholder="الشركة..." value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', width: '130px' }} />
        <datalist id="compList">{compsList.map((c: any, i: number) => (<option key={i} value={c} />))}</datalist>
        <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
          <option value="">كل أنواع العقود</option>
          <option value="filter_permanent">دائم / غير محدد المدة</option>
          <option value="filter_fixed">محدد المدة</option>
          <option value="filter_overage">فوق السن</option>
          <option value="filter_reward">مكافأة شاملة</option>
        </select>
        <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedCompany(''); setSelectedType(''); setSelectedAgeRange(''); setActiveCardFilter(null); }} style={{ background: '#f1f5f9', border: 0, padding: '9px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', color: '#334155' }}>إعادة ضبط</button>
      </div>

      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>جاري تحميل البيانات من Neon PostgreSQL... ⏳</div>
        ) : (
          <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 10, borderBottom: '2px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '12px' }}><input type="checkbox" checked={finalTableEmployees.length > 0 && selectedEmpIds.length === finalTableEmployees.length} onChange={(e) => { setSelectedEmpIds(e.target.checked ? finalTableEmployees.map((emp: any) => getEmployeeCode(emp)) : []); }} /></th>
                  <th onClick={() => handleSort('employee_code')} style={{ padding: '12px', cursor: 'pointer' }}>الكود {renderSortArrow('employee_code')}</th>
                  <th onClick={() => handleSort('employee_name')} style={{ padding: '12px', cursor: 'pointer' }}>الاسم {renderSortArrow('employee_name')}</th>
                  <th onClick={() => handleSort('department')} style={{ padding: '12px', cursor: 'pointer' }}>الإدارة / الحالة</th>
                  <th onClick={() => handleSort('age')} style={{ padding: '12px', cursor: 'pointer' }}>السن</th>
                  <th style={{ padding: '12px' }}>تاريخ التعيين</th>
                  <th style={{ padding: '12px' }}>نوع العقد</th>
                  <th style={{ padding: '12px' }}>نهاية العقد</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {finalTableEmployees.map((emp: any) => {
                  const code = getEmployeeCode(emp);
                  const isInactive = !isActiveEmployee(emp);

                  return (
                    <tr key={code} style={{ borderBottom: '1px solid #f1f5f9', background: isInactive ? '#fef2f2' : 'transparent', opacity: isInactive ? 0.85 : 1 }}>
                      <td style={{ padding: '10px', textAlign: 'center' }}><input type="checkbox" checked={selectedEmpIds.includes(code)} onChange={(e) => setSelectedEmpIds(e.target.checked ? [...selectedEmpIds, code] : selectedEmpIds.filter((id) => id !== code))} /></td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: isInactive ? '#dc2626' : '#0d9488', fontFamily: 'monospace' }}>{code}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{getEmployeeName(emp)}</td>
                      <td style={{ padding: '10px', color: '#64748b', fontWeight: 'bold' }}>
                        {getField(emp, 'department', 'Department') || '—'}
                        {isInactive && <span style={{display: 'block', fontSize: '10px', color: '#dc2626', marginTop: '4px'}}>⚠️ غير نشط / محول</span>}
                      </td>
                      <td style={{ padding: '10px' }}>{renderAgeBadge(emp)}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace' }}>{getField(emp, 'hiring_date', 'HiringDate') || '—'}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: isInactive ? '#dc2626' : 'inherit' }}>{getField(emp, 'contract_type', 'ContractType') || '—'}</td>
                      <td style={{ padding: '10px' }}>{getContractStatusBadge(getField(emp, 'contract_type', 'ContractType'), getField(emp, 'contract_end_date', 'ContractEndDate'))}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button onClick={() => setProfileEmp(emp)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>👁️ الملف</button>
                          <button onClick={() => handleOpenEdit(emp)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>تعديل ✏️</button>
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

      {/* Profile Modal */}
      {profileEmp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '650px', maxWidth: '100%', background: '#fff', borderRadius: '16px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800' }}>👤 الملف الوظيفي</h3>
              <button onClick={() => setProfileEmp(null)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>إغلاق ✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
              <div><strong>الكود:</strong> {getEmployeeCode(profileEmp) || '—'}</div>
              <div><strong>الاسم:</strong> {getEmployeeName(profileEmp) || '—'}</div>
              <div><strong>السن:</strong> {getEmployeeAge(profileEmp) ?? '—'}</div>
              <div><strong>تاريخ بلوغ المعاش:</strong> <span style={{color: '#ea580c', fontWeight: 'bold'}}>{getRetirementDate(profileEmp) || '—'}</span></div>
              <div><strong>الإدارة:</strong> {getField(profileEmp, 'department', 'Department') || '—'}</div>
              <div><strong>الشركة:</strong> {getField(profileEmp, 'company', 'Company') || '—'}</div>
              <div><strong>تاريخ التعيين:</strong> {getField(profileEmp, 'hiring_date', 'HiringDate') || '—'}</div>
              <div><strong>نوع العقد:</strong> {getField(profileEmp, 'contract_type', 'ContractType') || '—'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '850px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>✏️ تعديل بيانات الموظف (Neon DB)</h3>
                <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>الكود: <strong>{getEmployeeCode(editData.emp)}</strong></div>
              </div>
              <button onClick={() => setEditData(null)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 14px', color: '#0d9488', fontSize: '14px' }}>بيانات الموظف</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'الكود', key: 'employee_code', alt: 'EmployeeCode', disabled: true },
                    { label: 'الاسم', key: 'employee_name', alt: 'EmployeeName' },
                    { label: 'الرقم القومي', key: 'national_id', alt: 'NationalID' },
                    { label: 'تاريخ الميلاد', key: 'birth_date', alt: 'BirthDate' },
                    { label: 'السن', key: 'age', alt: 'Age' },
                    { label: 'الإدارة', key: 'department', alt: 'Department' },
                    { label: 'الشركة', key: 'company', alt: 'Company' },
                    { label: 'الوظيفة', key: 'job_title', alt: 'JobTitle' },
                    { label: 'الموبايل', key: 'mobile', alt: 'Mobile' },
                    { label: 'البريد الإلكتروني', key: 'email', alt: 'Email' },
                  ].map((field) => (
                    <div key={field.label}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>{field.label}</label>
                      <input type={field.key === 'birth_date' ? 'date' : 'text'} disabled={field.disabled} value={getField(editData.emp, field.key, field.alt) ?? ''} onChange={(e) => setEditData({ ...editData, emp: { ...editData.emp, [field.key]: e.target.value, [field.alt]: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', boxSizing: 'border-box', background: field.disabled ? '#f1f5f9' : '#fff' }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>تاريخ التعيين</label>
                    <input type="date" value={getField(editData.emp, 'hiring_date', 'HiringDate') || ''} onChange={(e) => setEditData({ ...editData, emp: { ...editData.emp, hiring_date: e.target.value, HiringDate: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 14px', color: '#2563eb', fontSize: '14px' }}>بيانات العقد</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>نوع العقد</label>
                    <select value={getField(editData.emp, 'contract_type', 'ContractType') || 'محدد المدة'} onChange={(e) => setEditData({ ...editData, emp: { ...editData.emp, contract_type: e.target.value, ContractType: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <option value="دائم">دائم (غير محدد المدة)</option>
                      <option value="محدد المدة">محدد المدة</option>
                      <option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                      <option value="مكافأة شاملة">مكافأة شاملة</option>
                      <option value="إنهاء تعاقد">إنهاء تعاقد</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>نهاية العقد</label>
                    <input type="date" value={getField(editData.emp, 'contract_end_date', 'ContractEndDate') || ''} onChange={(e) => setEditData({ ...editData, emp: { ...editData.emp, contract_end_date: e.target.value, ContractEndDate: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>الحالة</label>
                    <select value={getField(editData.emp, 'status', 'Status') || 'Active'} onChange={(e) => setEditData({ ...editData, emp: { ...editData.emp, status: e.target.value, Status: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Terminated">Terminated</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" onClick={() => setEditData(null)} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>إلغاء</button>
                <button type="submit" disabled={editData.saving} style={{ background: editData.saving ? '#64748b' : '#0d9488', color: '#fff', border: 0, padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: editData.saving ? 'not-allowed' : 'pointer' }}>{editData.saving ? 'جاري الحفظ...' : 'حفظ كافة التعديلات'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Termination Modal */}
      {showTermModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '550px', maxWidth: '100%', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#dc2626', fontWeight: '800' }}>🚫 إنهاء خدمة وتجميد موظف</h3>
              <button onClick={() => { setShowTermModal(false); setSelectedTermEmp(null); setTermSearch(''); }} style={{ background: '#fef2f2', color: '#dc2626', border: 0, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleConfirmTermination} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <input placeholder="🔍 ابحث بكود الموظف، الاسم، أو الرقم القومي..." value={termSearch} onChange={(e) => { setTermSearch(e.target.value); setSelectedTermEmp(null); }} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
              
              {termSearchResults.length > 0 && !selectedTermEmp && (
                <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                  {termSearchResults.map((emp: any, index: number) => (
                    <div key={index} onClick={() => { setSelectedTermEmp(emp); setTermSearch(`${getEmployeeCode(emp)} - ${getEmployeeName(emp)}`); }} style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                      <strong>[{getEmployeeCode(emp)}]</strong> {getEmployeeName(emp)}
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>الإدارة: {getField(emp, 'department', 'Department') || '—'}</div>
                    </div>
                  ))}
                </div>
              )}

              {selectedTermEmp && (
                <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '8px', color: '#dc2626', fontWeight: 'bold', border: '1px solid #fecaca' }}>
                  تم تحديد: {getEmployeeName(selectedTermEmp)} {' — '} ({getEmployeeCode(selectedTermEmp)})
                </div>
              )}

              <select value={termReason} onChange={(e) => setTermReason(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold' }}>
                <option value="استقالة">استقالة</option>
                <option value="إنهاء عقد">إنهاء عقد</option>
                <option value="إنهاء خدمات">إنهاء خدمات</option>
                <option value="بلوغ سن">بلوغ سن</option>
                <option value="انقطاع عن العمل">انقطاع عن العمل</option>
                <option value="نقل شركة شقيقة">نقل شركة شقيقة</option>
              </select>

              <input type="date" value={termDate} onChange={(e) => setTermDate(e.target.value)} required style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowTermModal(false)} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={termSaving || !selectedTermEmp} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: (termSaving || !selectedTermEmp) ? 'not-allowed' : 'pointer' }}>
                  {termSaving ? 'جاري الحفظ...' : 'تأكيد الإنهاء 🚫'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
