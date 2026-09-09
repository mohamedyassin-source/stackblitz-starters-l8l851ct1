'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

// ============================================================
// HELPERS
// ============================================================

const getField = (obj: any, ...keys: string[]) => {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return '';
};

const getEmployeeId = (emp: any) =>
  String(getField(emp, 'employee_id', 'EmployeeID', 'employeeId', 'id') || '').trim();

const getEmployeeCode = (emp: any) =>
  String(getField(emp, 'employee_code', 'EmployeeCode', 'employeeCode', 'code', 'Code') || '').trim();

const getEmployeeName = (emp: any) =>
  getField(emp, 'employee_name', 'EmployeeName', 'ArabicName', 'employeeName', 'name', 'Name');

const getNationalId = (emp: any) =>
  String(getField(emp, 'national_id', 'NationalID', 'nationalId', 'NationalId') || '').trim();

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

// 🌟 دالة مساعدة لتحديد إذا كان الموظف نشط (Active) أو لا
const isActiveEmployee = (emp: any) => {
  const status = String(getField(emp, 'status', 'Status') || 'Active').trim().toLowerCase();
  const dept = String(getField(emp, 'department', 'Department')).trim();
  const type = String(getField(emp, 'contract_type', 'ContractType')).trim();

  const isTransfer = dept.includes('تحويلات تحت الاعتماد') || dept.includes('تحويلات/تحت الاعتماد') || dept.includes('تحويل');
  const isTerminatedType = type === 'إنهاء تعاقد' || status === 'terminated' || status === 'inactive';

  return !isTransfer && !isTerminatedType;
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function EmployeesPage() {
  const { employees: rawEmployees, contracts: rawContracts, loading, refresh: fetchEmployees } = useAppData();

  // 🌟 دمج بيانات الموظفين والعقود القادمة من Firebase
  const employees = useMemo(() => {
    const contractsMap = new Map<string, any>();
    rawContracts.forEach((c: any) => {
      const code = getEmployeeCode(c);
      if (code) contractsMap.set(code, c);
    });

    return rawEmployees.map((emp: any) => {
      const code = getEmployeeCode(emp);
      const contract = contractsMap.get(code) || {};
      return {
        ...emp,
        contract_id: contract.id || null,
        contract_start_date: getField(emp, 'contract_start_date', 'HiringDate') || contract.contract_start_date || '',
        contract_end_date: getField(emp, 'contract_end_date', 'ContractEndDate') || contract.contract_end_date || '',
        contract_type: contract.contract_type || getField(emp, 'contract_type', 'ContractType') || 'محدد المدة',
      };
    });
  }, [rawEmployees, rawContracts]);

  // FILTER STATES
  const [activeCardFilter, setActiveCardFilter] = useState<'ALL_ACTIVE' | 'PERM' | 'FIXED' | 'ABOVE_AGE' | null>('ALL_ACTIVE');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedAgeRange, setSelectedAgeRange] = useState('');

  // SORT / SELECTION
  const [sortColumn, setSortColumn] = useState('employee_code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  // MODALS
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTermModal, setShowTermModal] = useState(false);
  const [showBulkTransferModal, setShowBulkTransferModal] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [profileEmp, setProfileEmp] = useState<any>(null);

  // BULK & TERMINATION
  const [bulkDept, setBulkDept] = useState('');
  const [bulkCompany, setBulkCompany] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [termSearch, setTermSearch] = useState('');
  const [selectedTermEmp, setSelectedTermEmp] = useState<any>(null);
  const [termReason, setTermReason] = useState('استقالة');
  const [termDate, setTermDate] = useState(new Date().toISOString().split('T')[0]);
  const [termSaving, setTermSaving] = useState(false);

  // NEW EMPLOYEE
  const [newEmp, setNewEmp] = useState({
    employee_code: '',
    employee_name: '',
    national_id: '',
    birth_date: '',
    department: '',
    company: '',
    job_title: '',
    hiring_date: '',
    contract_type: 'محدد المدة',
    contract_end_date: '',
    status: 'Active',
    email: '',
    mobile: '',
  });

  // 🌟 سحب قوائم الإدارات والشركات من كل الموظفين (عشان تظهر في الفلاتر)
  const deptsList = useMemo(() => {
    return Array.from(new Set(employees.map((emp: any) => getField(emp, 'department', 'Department')).filter(Boolean)));
  }, [employees]);

  const compsList = useMemo(() => {
    return Array.from(new Set(employees.map((emp: any) => getField(emp, 'company', 'Company')).filter(Boolean)));
  }, [employees]);

  // 🌟 فلتر الجدول (يحتوي على كافة الموظفين نشطين أو غير نشطين لسهولة البحث)
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
        if (selectedType === 'filter_permanent') {
          matchesType = contractType.includes('دائم') || contractType.includes('غير محدد');
        } else if (selectedType === 'filter_fixed') {
          matchesType = contractType.includes('محدد') && !contractType.includes('فوق السن');
        } else if (selectedType === 'filter_overage') {
          matchesType = contractType.includes('فوق السن');
        } else if (selectedType === 'filter_reward') {
          matchesType = contractType.includes('مكافأة') || contractType.includes('مكافأه') || contractType.includes('reward');
        } else if (selectedType === 'filter_project') {
          matchesType = contractType.includes('مهمة') || contractType.includes('مشروع');
        } else {
          matchesType = contractType === selectedType;
        }
      }

      let matchesAge = true;
      if (selectedAgeRange === '60_plus') matchesAge = age !== null && age >= 60;
      if (selectedAgeRange === '50_59') matchesAge = age !== null && age >= 50 && age < 60;
      if (selectedAgeRange === '30_49') matchesAge = age !== null && age >= 30 && age < 50;
      if (selectedAgeRange === 'under_30') matchesAge = age !== null && age < 30;

      return matchesSearch && matchesDept && matchesCompany && matchesType && matchesAge;
    });
  }, [employees, searchTerm, selectedDept, selectedCompany, selectedType, selectedAgeRange]);

  // 🌟 إحصائيات الكروت (تحسب فقط الموظفين النشطين Active)
  const kpiStats = useMemo(() => {
    const activeBase = baseFilteredEmployees.filter(isActiveEmployee);

    const total = activeBase.length;
    const perm = activeBase.filter((emp: any) => {
      const type = String(getField(emp, 'contract_type', 'ContractType'));
      return type.includes('دائم') || type.includes('غير محدد');
    }).length;

    const fixed = activeBase.filter((emp: any) => {
      const type = String(getField(emp, 'contract_type', 'ContractType'));
      return type.includes('محدد') && !type.includes('فوق السن');
    }).length;

    const aboveAge = activeBase.filter((emp: any) => {
      const type = String(getField(emp, 'contract_type', 'ContractType'));
      const age = getEmployeeAge(emp);
      return type.includes('فوق السن') || (age !== null && age >= 60);
    }).length;

    const pct = (value: number) => total ? Number(((value / total) * 100).toFixed(1)) : 0;

    return { 
      total, 
      perm, 
      permPct: pct(perm), 
      fixed, 
      fixedPct: pct(fixed), 
      aboveAge, 
      aboveAgePct: pct(aboveAge) 
    };
  }, [baseFilteredEmployees]);

  const finalTableEmployees = useMemo(() => {
    const filtered = baseFilteredEmployees.filter((emp: any) => {
      const type = String(getField(emp, 'contract_type', 'ContractType'));
      const age = getEmployeeAge(emp);

      if (activeCardFilter === 'PERM') return type.includes('دائم') || type.includes('غير محدد');
      if (activeCardFilter === 'FIXED') return type.includes('محدد') && !type.includes('فوق السن');
      if (activeCardFilter === 'ABOVE_AGE') return type.includes('فوق السن') || (age !== null && age >= 60);
      return true; // في حالة ALL_ACTIVE تظهر الجميع (بما فيهم الغير نشط) عشان يظهروا في الجدول
    });

    return [...filtered].sort((a: any, b: any) => {
      if (sortColumn === 'age') {
        const aAge = getEmployeeAge(a) ?? 0;
        const bAge = getEmployeeAge(b) ?? 0;
        const result = aAge - bAge;
        return sortDirection === 'asc' ? result : -result;
      }
      const aValue = String(getField(a, sortColumn) || '');
      const bValue = String(getField(b, sortColumn) || '');
      const result = aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? result : -result;
    });
  }, [baseFilteredEmployees, activeCardFilter, sortColumn, sortDirection]);

  // للبحث عن الموظف عند إنهاء خدمته (يجب أن يكون نشط عشان تنهي خدمته)
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
    if (sortColumn === column) {
      setSortDirection((prev) => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const renderSortArrow = (column: string) => {
    if (sortColumn !== column) return <span style={{ opacity: 0.3, marginRight: '4px' }}>↕</span>;
    return <span style={{ marginRight: '4px', color: '#0d9488' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>;
  };

  const handleOpenEdit = (emp: any) => {
    setEditData({
      emp: { ...emp },
      loading: false,
      saving: false,
    });
  };

  useEffect(() => {
    if (loading || !employees || employees.length === 0) return;

    const savedEmployeeId = localStorage.getItem('selectedEmployeeId') || sessionStorage.getItem('selectedEmployeeId') || '';
    const savedEmployeeCode = localStorage.getItem('selectedEmployeeCode') || localStorage.getItem('employeeSearch') || localStorage.getItem('jumpSearch') || sessionStorage.getItem('employeeSearch') || sessionStorage.getItem('jumpSearch') || '';

    const cleanId = String(savedEmployeeId).trim();
    const cleanCode = String(savedEmployeeCode).trim();

    if (!cleanId && !cleanCode) return;

    const targetEmployee = employees.find((emp: any) => {
      const employeeId = getEmployeeId(emp);
      const employeeCode = getEmployeeCode(emp);
      return (cleanId && employeeId === cleanId) || (cleanCode && employeeCode.toLowerCase() === cleanCode.toLowerCase());
    });

    if (!targetEmployee) return;

    setSearchTerm(''); setSelectedDept(''); setSelectedCompany(''); setSelectedType(''); setSelectedAgeRange(''); setActiveCardFilter(null);
    handleOpenEdit(targetEmployee);

    localStorage.removeItem('selectedEmployeeId'); localStorage.removeItem('selectedEmployeeCode'); localStorage.removeItem('employeeId'); localStorage.removeItem('employeeSearch'); localStorage.removeItem('jumpSearch');
    sessionStorage.removeItem('selectedEmployeeId'); sessionStorage.removeItem('employeeSearch'); sessionStorage.removeItem('jumpSearch');
  }, [employees, loading]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;
    setEditData({ ...editData, saving: true });

    try {
      const emp = editData.emp;
      const employeeCode = getEmployeeCode(emp);
      if (!employeeCode) throw new Error('كود الموظف غير موجود.');

      const rawHiring = getField(emp, 'hiring_date', 'HiringDate');
      const rawBirth = getField(emp, 'birth_date', 'BirthDate');
      const rawEnd = getField(emp, 'contract_end_date', 'ContractEndDate');
      const empStatus = getField(emp, 'status', 'Status') || 'Active';
      const contractType = getField(emp, 'contract_type', 'ContractType');

      const employeeUpdate = {
        employee_code: employeeCode,
        employee_name: getField(emp, 'employee_name', 'EmployeeName', 'ArabicName'),
        national_id: getField(emp, 'national_id', 'NationalID'),
        birth_date: rawBirth || null,
        age: emp.age !== undefined && emp.age !== '' ? Number(emp.age) : null,
        department: getField(emp, 'department', 'Department'),
        company: getField(emp, 'company', 'Company'),
        job_title: getField(emp, 'job_title', 'JobTitle'),
        hiring_date: rawHiring || null,
        contract_type: contractType,
        status: empStatus,
        email: getField(emp, 'email', 'Email'),
        mobile: getField(emp, 'mobile', 'Mobile', 'MOBILE'),
      };

      const empRef = doc(db, 'employees', employeeCode);
      await setDoc(empRef, employeeUpdate, { merge: true });

      const contractUpdate = {
        employee_code: employeeCode,
        contract_type: contractType,
        contract_start_date: rawHiring || null,
        contract_end_date: rawEnd || null,
        status: empStatus,
      };

      const contQ = query(collection(db, 'contracts'), where('employee_code', '==', employeeCode));
      const contSnap = await getDocs(contQ);
      if (!contSnap.empty) {
        await updateDoc(doc(db, 'contracts', contSnap.docs[0].id), contractUpdate);
      } else {
        const newContRef = doc(collection(db, 'contracts'));
        await setDoc(newContRef, contractUpdate, { merge: true });
      }

      alert('تم حفظ التعديلات وتحديث العقد بنجاح ✅');
      setEditData(null);
      await fetchEmployees();
    } catch (error: any) {
      alert('حدث خطأ أثناء الحفظ: ' + error.message);
      setEditData((prev: any) => prev ? { ...prev, saving: false } : null);
    }
  };

  const handleConfirmTermination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTermEmp) return alert('يرجى اختيار موظف أولاً.');
    setTermSaving(true);

    try {
      const empCode = getEmployeeCode(selectedTermEmp);
      const empRef = doc(db, 'employees', empCode);

      await setDoc(empRef, {
        department: 'تحويلات/تحت الاعتماد',
        status: 'Inactive',
        termination_reason: termReason,
        termination_date: termDate,
      }, { merge: true });

      const contQ = query(collection(db, 'contracts'), where('employee_code', '==', empCode));
      const contSnap = await getDocs(contQ);
      const batch = writeBatch(db);
      contSnap.forEach((d) => {
        batch.update(doc(db, 'contracts', d.id), { status: 'Inactive', contract_type: 'إنهاء تعاقد' });
      });
      await batch.commit();

      alert(`✅ تم تحويل الموظف (${getEmployeeName(selectedTermEmp)}) إلى قسم تحويلات/تحت الاعتماد وانهاء تعاقده.`);
      setShowTermModal(false); setSelectedTermEmp(null); setTermSearch('');
      await fetchEmployees();
    } catch (error: any) {
      alert('خطأ أثناء العملية: ' + error.message);
    } finally {
      setTermSaving(false);
    }
  };

  const handleConfirmBulkTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmpIds.length === 0) return;
    if (!bulkDept && !bulkCompany) return alert('يرجى تحديد إدارة جديدة أو شركة جديدة.');
    setBulkSaving(true);

    try {
      const payload: any = {};
      if (bulkDept) payload.department = bulkDept;
      if (bulkCompany) payload.company = bulkCompany;

      const batch = writeBatch(db);
      for (const code of selectedEmpIds) {
        const empRef = doc(db, 'employees', code);
        batch.set(empRef, payload, { merge: true });
      }
      await batch.commit();

      alert(`✅ تم نقل ${selectedEmpIds.length} موظف بنجاح.`);
      setShowBulkTransferModal(false); setSelectedEmpIds([]); setBulkDept(''); setBulkCompany('');
      await fetchEmployees();
    } catch (error: any) {
      alert('خطأ أثناء النقل المجمع: ' + error.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedEmpIds.length === 0) return;
    const confirmed = window.confirm(`هل أنت متأكد من حذف ${selectedEmpIds.length} موظف نهائيًا؟`);
    if (!confirmed) return;
    setIsDeleting(true);

    try {
      const batch = writeBatch(db);
      for (const code of selectedEmpIds) {
        batch.delete(doc(db, 'employees', code));

        const contQ = query(collection(db, 'contracts'), where('employee_code', '==', code));
        const contSnap = await getDocs(contQ);
        contSnap.forEach((d) => batch.delete(doc(db, 'contracts', d.id)));
      }
      await batch.commit();

      alert('تم حذف الموظفين بنجاح 🗑️✅');
      setSelectedEmpIds([]);
      await fetchEmployees();
    } catch (error: any) {
      alert('حدث خطأ أثناء الحذف: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let age = null;
      if (newEmp.birth_date) {
        const birth = new Date(newEmp.birth_date);
        const today = new Date();
        age = today.getFullYear() - birth.getFullYear();
        const notYetBirthday = today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
        if (notYetBirthday) age--;
      }

      const empCode = newEmp.employee_code.trim();
      const empRef = doc(db, 'employees', empCode);

      await setDoc(empRef, {
        employee_code: empCode,
        employee_name: newEmp.employee_name,
        national_id: newEmp.national_id,
        birth_date: newEmp.birth_date || null,
        age,
        department: newEmp.department,
        company: newEmp.company,
        job_title: newEmp.job_title,
        hiring_date: newEmp.hiring_date || null,
        contract_type: newEmp.contract_type,
        status: newEmp.status,
        email: newEmp.email,
        mobile: newEmp.mobile,
      }, { merge: true });

      const contRef = doc(collection(db, 'contracts'));
      await setDoc(contRef, {
        employee_code: empCode,
        contract_type: newEmp.contract_type,
        contract_start_date: newEmp.hiring_date || null,
        contract_end_date: newEmp.contract_type.includes('دائم') || !newEmp.contract_end_date ? null : newEmp.contract_end_date,
        status: newEmp.status,
      }, { merge: true });

      alert('تم إضافة الموظف وعقده بنجاح ✅');
      setShowAddModal(false);
      setNewEmp({ employee_code: '', employee_name: '', national_id: '', birth_date: '', department: '', company: '', job_title: '', hiring_date: '', contract_type: 'محدد المدة', contract_end_date: '', status: 'Active', email: '', mobile: '' });
      await fetchEmployees();
    } catch (error: any) {
      alert('خطأ أثناء الإضافة: ' + error.message);
    }
  };

  const handleExportToExcel = (onlySelected = false) => {
    const rows = onlySelected ? finalTableEmployees.filter((emp: any) => selectedEmpIds.includes(getEmployeeCode(emp))) : finalTableEmployees;
    const data = rows.map((emp: any) => ({
      EmployeeID: getEmployeeId(emp),
      EmployeeCode: getEmployeeCode(emp),
      EmployeeName: getEmployeeName(emp),
      NationalID: getNationalId(emp),
      Department: getField(emp, 'department', 'Department'),
      Company: getField(emp, 'company', 'Company'),
      JobTitle: getField(emp, 'job_title', 'JobTitle'),
      Age: getEmployeeAge(emp),
      HiringDate: getField(emp, 'hiring_date', 'HiringDate'),
      ContractType: getField(emp, 'contract_type', 'ContractType'),
      ContractEndDate: getField(emp, 'contract_end_date', 'ContractEndDate'),
      Mobile: getField(emp, 'mobile', 'Mobile'),
      Email: getField(emp, 'email', 'Email'),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, `Employees_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getContractStatusBadge = (type: string, endDate: string) => {
    if (endDate && String(endDate).trim()) {
      const end = new Date(endDate);
      const today = new Date();
      end.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

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
    return <span style={{ background: '#f8fafc', color: '#0f172a', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>{age} سنة</span>;
  };

  return (
    <div style={{ direction: 'rtl', animation: 'fadeIn 0.4s ease-in-out' }}>
      
      {/* رأس الصفحة */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900', letterSpacing: '-0.3px' }}>👥 بيانات القوة البشرية (HR)</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>إدارة وتتبع السجل الرئيسي للموظفين (شامل النشط وغير النشط)</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => handleExportToExcel(false)} style={{ background: '#10b981', color: '#fff', border: 0, padding: '9px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', boxShadow: '0 2px 6px rgba(16,185,129,0.2)' }}>📥 تصدير Excel</button>
          <button onClick={() => { setShowTermModal(true); setSelectedTermEmp(null); setTermSearch(''); }} style={{ background: '#ef4444', color: '#fff', border: 0, padding: '9px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', boxShadow: '0 2px 6px rgba(239,68,68,0.2)' }}>🚫 إنهاء وتجميد</button>
          <button onClick={() => setShowAddModal(true)} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '9px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', boxShadow: '0 2px 6px rgba(13,148,136,0.2)' }}>+ إضافة موظف</button>
        </div>
      </div>

      {/* 🌟 الكروت التفاعلية المطابقة 100% لصفحة العقود (تعد النشطين فقط) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        {/* كارت 1: إجمالي الموظفين */}
        <div 
          onClick={() => setActiveCardFilter(activeCardFilter === 'ALL_ACTIVE' ? null : 'ALL_ACTIVE')} 
          style={{ 
            background: activeCardFilter === 'ALL_ACTIVE' ? 'linear-gradient(135deg, #ffffff, #f0fdf4)' : '#ffffff', 
            border: activeCardFilter === 'ALL_ACTIVE' ? '2px solid #22c55e' : '1px solid #e2e8f0', 
            borderRadius: '16px', 
            padding: '18px 20px', 
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            boxShadow: activeCardFilter === 'ALL_ACTIVE' ? '0 10px 20px rgba(34,197,94,0.12)' : '0 2px 6px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: '800', color: '#475569' }}>إجمالي الموظفين (النشطين)</span>
            <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '10px', fontWeight: '900', padding: '3px 8px', borderRadius: '20px' }}>100%</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#16a34a', marginTop: '10px', fontFamily: 'sans-serif' }}>
            {kpiStats.total.toLocaleString('en-US')}
          </div>
          <div style={{ width: '100%', background: '#e2e8f0', height: '6px', borderRadius: '10px', marginTop: '14px', overflow: 'hidden' }}>
            <div style={{ width: '100%', background: '#22c55e', height: '100%', borderRadius: '10px' }} />
          </div>
        </div>

        {/* كارت 2: عقود دائمة */}
        <div 
          onClick={() => setActiveCardFilter(activeCardFilter === 'PERM' ? null : 'PERM')} 
          style={{ 
            background: activeCardFilter === 'PERM' ? 'linear-gradient(135deg, #ffffff, #f0fdf4)' : '#ffffff', 
            border: activeCardFilter === 'PERM' ? '2px solid #16a34a' : '1px solid #e2e8f0', 
            borderRadius: '16px', 
            padding: '18px 20px', 
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            boxShadow: activeCardFilter === 'PERM' ? '0 10px 20px rgba(22,163,74,0.12)' : '0 2px 6px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: '800', color: '#475569' }}>عقود دائمة</span>
            <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '10px', fontWeight: '900', padding: '3px 8px', borderRadius: '20px' }}>{kpiStats.permPct}%</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#16a34a', marginTop: '10px', fontFamily: 'sans-serif' }}>
            {kpiStats.perm.toLocaleString('en-US')}
          </div>
          <div style={{ width: '100%', background: '#e2e8f0', height: '6px', borderRadius: '10px', marginTop: '14px', overflow: 'hidden' }}>
            <div style={{ width: `${kpiStats.permPct}%`, background: '#16a34a', height: '100%', borderRadius: '10px', transition: 'width 0.6s ease' }} />
          </div>
        </div>

        {/* كارت 3: عقود محددة المدة */}
        <div 
          onClick={() => setActiveCardFilter(activeCardFilter === 'FIXED' ? null : 'FIXED')} 
          style={{ 
            background: activeCardFilter === 'FIXED' ? 'linear-gradient(135deg, #ffffff, #eff6ff)' : '#ffffff', 
            border: activeCardFilter === 'FIXED' ? '2px solid #2563eb' : '1px solid #e2e8f0', 
            borderRadius: '16px', 
            padding: '18px 20px', 
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            boxShadow: activeCardFilter === 'FIXED' ? '0 10px 20px rgba(37,99,235,0.12)' : '0 2px 6px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: '800', color: '#475569' }}>عقود محددة المدة</span>
            <span style={{ background: '#dbeafe', color: '#1e40af', fontSize: '10px', fontWeight: '900', padding: '3px 8px', borderRadius: '20px' }}>{kpiStats.fixedPct}%</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#2563eb', marginTop: '10px', fontFamily: 'sans-serif' }}>
            {kpiStats.fixed.toLocaleString('en-US')}
          </div>
          <div style={{ width: '100%', background: '#e2e8f0', height: '6px', borderRadius: '10px', marginTop: '14px', overflow: 'hidden' }}>
            <div style={{ width: `${kpiStats.fixedPct}%`, background: '#2563eb', height: '100%', borderRadius: '10px', transition: 'width 0.6s ease' }} />
          </div>
        </div>

        {/* كارت 4: موظفين فوق السن (60+) */}
        <div 
          onClick={() => setActiveCardFilter(activeCardFilter === 'ABOVE_AGE' ? null : 'ABOVE_AGE')} 
          style={{ 
            background: activeCardFilter === 'ABOVE_AGE' ? 'linear-gradient(135deg, #ffffff, #fffbe1)' : '#ffffff', 
            border: activeCardFilter === 'ABOVE_AGE' ? '2px solid #d97706' : '1px solid #e2e8f0', 
            borderRadius: '16px', 
            padding: '18px 20px', 
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            boxShadow: activeCardFilter === 'ABOVE_AGE' ? '0 10px 20px rgba(217,119,6,0.12)' : '0 2px 6px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: '800', color: '#475569' }}>فوق السن (60+)</span>
            <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '10px', fontWeight: '900', padding: '3px 8px', borderRadius: '20px' }}>{kpiStats.aboveAgePct}%</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#d97706', marginTop: '10px', fontFamily: 'sans-serif' }}>
            {kpiStats.aboveAge.toLocaleString('en-US')}
          </div>
          <div style={{ width: '100%', background: '#e2e8f0', height: '6px', borderRadius: '10px', marginTop: '14px', overflow: 'hidden' }}>
            <div style={{ width: `${kpiStats.aboveAgePct}%`, background: '#d97706', height: '100%', borderRadius: '10px', transition: 'width 0.6s ease' }} />
          </div>
        </div>

      </div>

      {/* الشريط الجماعي عند تحديد عناصر */}
      {selectedEmpIds.length > 0 && (
        <div style={{ background: '#0f172a', color: '#fff', padding: '12px 18px', borderRadius: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 8px 20px rgba(15,23,42,0.2)' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>تم تحديد <span style={{ color: '#38bdf8', fontSize: '14px' }}>{selectedEmpIds.length}</span> موظف</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowBulkTransferModal(true)} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>نقل مجمع 🔄</button>
            <button onClick={() => handleExportToExcel(true)} style={{ padding: '7px 14px', background: '#10b981', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>تصدير المحدد 📥</button>
            <button onClick={handleDeleteSelected} disabled={isDeleting} style={{ padding: '7px 14px', background: '#ef4444', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>{isDeleting ? 'جاري الحذف...' : 'حذف نهائي 🗑️'}</button>
            <button onClick={() => setSelectedEmpIds([])} style={{ padding: '7px 14px', background: 'transparent', color: '#cbd5e1', border: '1px solid #475569', borderRadius: '8px', cursor: 'pointer', fontSize: '11px' }}>إلغاء ✕</button>
          </div>
        </div>
      )}

      {/* شريط البحث والفلاتر */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '14px 18px', borderRadius: '14px', marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
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
          <option value="filter_project">مهمة / مشروع</option>
        </select>

        <select value={selectedAgeRange} onChange={(e) => setSelectedAgeRange(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
          <option value="">فئة السن (الكل)</option>
          <option value="60_plus">فوق السن (60+)</option>
          <option value="50_59">من 50 إلى 59</option>
          <option value="30_49">من 30 إلى 49</option>
          <option value="under_30">أقل من 30</option>
        </select>
        <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedCompany(''); setSelectedType(''); setSelectedAgeRange(''); setActiveCardFilter(null); }} style={{ background: '#f1f5f9', border: 0, padding: '9px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', color: '#334155' }}>إعادة ضبط</button>
        <div style={{ marginRight: 'auto', fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>النتائج بالجدول: <strong style={{ color: '#0f172a' }}>{finalTableEmployees.length.toLocaleString('en-US')}</strong></div>
      </div>

      {/* الجدول الرئيسي للموظفين */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>جاري تحميل بيانات الموظفين والعقود... ⏳</div>
        ) : (
          <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 10, borderBottom: '2px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '12px' }}><input type="checkbox" checked={finalTableEmployees.length > 0 && selectedEmpIds.length === finalTableEmployees.length} onChange={(e) => { setSelectedEmpIds(e.target.checked ? finalTableEmployees.map((emp: any) => getEmployeeCode(emp)) : []); }} /></th>
                  <th onClick={() => handleSort('employee_code')} style={{ padding: '12px', cursor: 'pointer' }}>الكود {renderSortArrow('employee_code')}</th>
                  <th onClick={() => handleSort('employee_name')} style={{ padding: '12px', cursor: 'pointer' }}>الاسم {renderSortArrow('employee_name')}</th>
                  <th onClick={() => handleSort('job_title')} style={{ padding: '12px', cursor: 'pointer' }}>الوظيفة</th>
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
                  const employeeId = getEmployeeId(emp);
                  const nationalId = getNationalId(emp);
                  const mobile = getField(emp, 'mobile', 'Mobile');
                  const contractType = getField(emp, 'contract_type', 'ContractType');
                  const contractEnd = getField(emp, 'contract_end_date', 'ContractEndDate');
                  const missing = !nationalId || !mobile;
                  
                  // 🌟 إظهار الموظفين غير النشطين أو المحولين بوضوح في الجدول
                  const isInactive = !isActiveEmployee(emp);

                  return (
                    <tr key={employeeId || code} style={{ borderBottom: '1px solid #f1f5f9', background: isInactive ? '#fef2f2' : 'transparent', opacity: isInactive ? 0.85 : 1 }}>
                      <td style={{ padding: '10px', textAlign: 'center' }}><input type="checkbox" checked={selectedEmpIds.includes(code)} onChange={(e) => setSelectedEmpIds(e.target.checked ? [...selectedEmpIds, code] : selectedEmpIds.filter((id) => id !== code))} /></td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: isInactive ? '#dc2626' : '#0d9488', fontFamily: 'monospace' }}>{code}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{getEmployeeName(emp)} {missing && !isInactive && (<span title="ناقص الرقم القومي أو الموبايل" style={{ marginRight: '6px' }}>⚠️</span>)}</td>
                      <td style={{ padding: '10px', color: '#64748b' }}>{getField(emp, 'job_title', 'JobTitle') || '—'}</td>
                      <td style={{ padding: '10px', color: '#64748b', fontWeight: 'bold' }}>
                        {getField(emp, 'department', 'Department') || '—'}
                        {isInactive && <span style={{display: 'block', fontSize: '10px', color: '#dc2626', marginTop: '4px'}}>⚠️ غير نشط / محول</span>}
                      </td>
                      <td style={{ padding: '10px' }}>{renderAgeBadge(emp)}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace' }}>{getField(emp, 'hiring_date', 'HiringDate') || '—'}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: isInactive ? '#dc2626' : 'inherit' }}>{contractType || '—'}</td>
                      <td style={{ padding: '10px' }}>{getContractStatusBadge(contractType, contractEnd)}</td>
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

      {/* =========================================
          N O W  T H E  M O D A L S  B E G I N
      ============================================= */}

      {/* Profile Modal */}
      {profileEmp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '650px', maxWidth: '100%', background: '#fff', borderRadius: '16px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800' }}>👤 الملف الوظيفي</h3>
              <button onClick={() => setProfileEmp(null)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>إغلاق ✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
              <div><strong>EmployeeID:</strong> {getEmployeeId(profileEmp) || '—'}</div>
              <div><strong>الكود:</strong> {getEmployeeCode(profileEmp) || '—'}</div>
              <div><strong>الاسم:</strong> {getEmployeeName(profileEmp) || '—'}</div>
              <div><strong>الرقم القومي:</strong> {getNationalId(profileEmp) || 'غير مسجل'}</div>
              <div><strong>تاريخ الميلاد:</strong> {getField(profileEmp, 'birth_date', 'BirthDate') || 'غير مسجل'}</div>
              <div><strong>السن:</strong> {getEmployeeAge(profileEmp) ?? '—'}</div>
              <div><strong>الإدارة:</strong> {getField(profileEmp, 'department', 'Department') || '—'}</div>
              <div><strong>الشركة:</strong> {getField(profileEmp, 'company', 'Company') || '—'}</div>
              <div><strong>الوظيفة:</strong> {getField(profileEmp, 'job_title', 'JobTitle') || '—'}</div>
              <div><strong>الموبايل:</strong> {getField(profileEmp, 'mobile', 'Mobile') || 'غير مسجل'}</div>
              <div><strong>تاريخ التعيين:</strong> {getField(profileEmp, 'hiring_date', 'HiringDate') || '—'}</div>
              <div><strong>نوع العقد:</strong> {getField(profileEmp, 'contract_type', 'ContractType') || '—'}</div>
              <div><strong>نهاية العقد:</strong> {getField(profileEmp, 'contract_end_date', 'ContractEndDate') || '—'}</div>
              <div><strong>الحالة:</strong> {getField(profileEmp, 'status', 'Status') || '—'}</div>
            </div>
            <div style={{ marginTop: '20px', textAlign: 'left' }}>
              <button onClick={() => { handleOpenEdit(profileEmp); setProfileEmp(null); }} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>تعديل البيانات ✏️</button>
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
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>✏️ تعديل بيانات الموظف</h3>
                <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>الكود: <strong>{getEmployeeCode(editData.emp)}</strong>{'  |  '}EmployeeID: <strong>{getEmployeeId(editData.emp) || '—'}</strong></div>
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

      {/* 🔴 Termination Modal - نافذة إنهاء التعاقد السليمة */}
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
                    <div key={getEmployeeId(emp) || index} onClick={() => { setSelectedTermEmp(emp); setTermSearch(`${getEmployeeCode(emp)} - ${getEmployeeName(emp)}`); }} style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: '#fff' }} className="hover:bg-slate-50">
                      <strong>[{getEmployeeCode(emp)}]</strong> {getEmployeeName(emp)}
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>الإدارة: {getField(emp, 'department', 'Department') || '—'} | الرقم القومي: {getNationalId(emp) || '—'}</div>
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

              <input type="date" value={termDate} onChange={(e) => setTermDate(e.target.value)} required style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontFamily: 'monospace' }} />

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

      {/* 🔄 Bulk Transfer Modal - نافذة النقل المجمع للشركات/الإدارات */}
      {showBulkTransferModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '500px', maxWidth: '100%', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#2563eb', fontWeight: '800' }}>🔄 النقل والتعديل المجمع</h3>
              <button onClick={() => setShowBulkTransferModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleConfirmBulkTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>سيتم نقل وتحديث عدد <strong style={{ color: '#0f172a' }}>{selectedEmpIds.length}</strong> موظف للجهة التالية:</p>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>الإدارة الجديدة:</label>
                <input list="bulkDeptList" placeholder="اختر الإدارة (اختياري)" value={bulkDept} onChange={(e) => setBulkDept(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
                <datalist id="bulkDeptList">{deptsList.map((d: any, i: number) => (<option key={i} value={d} />))}</datalist>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>الشركة الجديدة:</label>
                <input list="bulkCompList" placeholder="اختر الشركة (اختياري)" value={bulkCompany} onChange={(e) => setBulkCompany(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
                <datalist id="bulkCompList">{compsList.map((c: any, i: number) => (<option key={i} value={c} />))}</datalist>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowBulkTransferModal(false)} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={bulkSaving} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: bulkSaving ? 'not-allowed' : 'pointer' }}>
                  {bulkSaving ? 'جاري التحديث...' : 'تأكيد النقل 🔄'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '700px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#0d9488', fontWeight: '800' }}>➕ إضافة موظف جديد</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            <form onSubmit={handleAddEmployee}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <input required placeholder="كود الموظف *" value={newEmp.employee_code} onChange={(e) => setNewEmp({ ...newEmp, employee_code: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} />
                <input required placeholder="اسم الموظف *" value={newEmp.employee_name} onChange={(e) => setNewEmp({ ...newEmp, employee_name: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} />
                <input placeholder="الرقم القومي" value={newEmp.national_id} onChange={(e) => setNewEmp({ ...newEmp, national_id: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} />
                <input type="date" value={newEmp.birth_date} onChange={(e) => setNewEmp({ ...newEmp, birth_date: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} />
                <input placeholder="الإدارة" value={newEmp.department} onChange={(e) => setNewEmp({ ...newEmp, department: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} />
                <input placeholder="الشركة" value={newEmp.company} onChange={(e) => setNewEmp({ ...newEmp, company: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} />
                <input placeholder="الوظيفة" value={newEmp.job_title} onChange={(e) => setNewEmp({ ...newEmp, job_title: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} />
                <input type="date" value={newEmp.hiring_date} onChange={(e) => setNewEmp({ ...newEmp, hiring_date: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} />

                <select value={newEmp.contract_type} onChange={(e) => setNewEmp({ ...newEmp, contract_type: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontWeight: 'bold' }}>
                  <option value="دائم">دائم (غير محدد المدة)</option>
                  <option value="محدد المدة">محدد المدة</option>
                  <option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                  <option value="مكافأة شاملة">مكافأة شاملة</option>
                </select>

                <input type="date" disabled={newEmp.contract_type.includes('دائم')} value={newEmp.contract_end_date} onChange={(e) => setNewEmp({ ...newEmp, contract_end_date: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', background: newEmp.contract_type.includes('دائم') ? '#f8fafc' : '#fff' }} />
                <input placeholder="الموبايل" value={newEmp.mobile} onChange={(e) => setNewEmp({ ...newEmp, mobile: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} />
                <input placeholder="البريد الإلكتروني" value={newEmp.email} onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>إلغاء</button>
                <button type="submit" style={{ background: '#0d9488', color: '#fff', border: 0, padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>إضافة الموظف وعقده</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
