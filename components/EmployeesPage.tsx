'use client';

import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';

export default function EmployeesPage() {
  const { employees, loading, refresh: fetchEmployees } = useAppData();

  // حالات الفلاتر والكروت الإحصائية الـ 6
  const [activeCardFilter, setActiveCardFilter] = useState<'ALL_ACTIVE' | 'NEW_JOINERS' | 'PERM' | 'FIXED' | 'ABOVE_AGE' | 'MISSING_DATA' | null>('ALL_ACTIVE');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedAgeRange, setSelectedAgeRange] = useState('');

  // حالات الترتيب والتحديد
  const [sortColumn, setSortColumn] = useState<string>('employee_code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  // النوافذ المنبثقة
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTermModal, setShowTermModal] = useState(false);
  const [showBulkTransferModal, setShowBulkTransferModal] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [profileEmp, setProfileEmp] = useState<any>(null);

  // 🌟 حالة نافذة إعادة التفعيل
  const [reactivateEmp, setReactivateEmp] = useState<any>(null);
  const [reactivateDept, setReactivateDept] = useState('');
  const [reactivateCompany, setReactivateCompany] = useState('');
  const [reactivateSaving, setReactivateSaving] = useState(false);

  // حالات النقل والحذف وإنهاء الخدمة
  const [bulkDept, setBulkDept] = useState('');
  const [bulkCompany, setBulkCompany] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [termSearch, setTermSearch] = useState('');
  const [selectedTermEmp, setSelectedTermEmp] = useState<any>(null);
  const [termReason, setTermReason] = useState('استقالة');
  const [termDate, setTermDate] = useState(new Date().toISOString().split('T')[0]);
  const [termSaving, setTermSaving] = useState(false);

  // الموظف الجديد
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
    mobile: ''
  });

  const getField = (obj: any, ...keys: string[]) => {
    if (!obj) return '';
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return '';
  };

  // 🎂 دالة حساب العمر
  const getEmployeeAge = (emp: any) => {
    const rawAge = getField(emp, 'age', 'Age');
    if (rawAge !== '' && rawAge !== null && !isNaN(Number(rawAge))) {
      return Number(rawAge);
    }

    const bDateStr = getField(emp, 'birth_date', 'BirthDate');
    const natId = getField(emp, 'national_id', 'NationalID');

    let birthDate: Date | null = null;
    if (bDateStr) {
      const b = new Date(bDateStr);
      if (!isNaN(b.getTime())) birthDate = b;
    }

    if (!birthDate && natId) {
      const idStr = String(natId).replace(/\D/g, '');
      if (idStr.length === 14) {
        const centuryDigit = idStr.charAt(0);
        const yearDigits = idStr.substring(1, 3);
        const monthDigits = idStr.substring(3, 5);
        const dayDigits = idStr.substring(5, 7);
        const fullYear = (centuryDigit === '3' ? '20' : '19') + yearDigits;
        const b = new Date(`${fullYear}-${monthDigits}-${dayDigits}`);
        if (!isNaN(b.getTime())) birthDate = b;
      }
    }

    if (birthDate) {
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    }

    return null;
  };

  // قائمة جميع الإدارات والشركات للفلترة
  const deptsList = useMemo(() => Array.from(new Set(employees.map(e => getField(e, 'department', 'Department')).filter(Boolean))), [employees]);
  const compsList = useMemo(() => Array.from(new Set(employees.map(e => getField(e, 'company', 'Company')).filter(Boolean))), [employees]);
  const typesList = useMemo(() => Array.from(new Set(employees.map(e => getField(e, 'contract_type', 'ContractType')).filter(Boolean))), [employees]);

  // التصفية الأولية بناءً على خيارات البحث والشروط
  const baseFilteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const term = searchTerm.toLowerCase();
      const empCode = String(getField(emp, 'employee_code', 'EmployeeCode')).toLowerCase();
      const empName = String(getField(emp, 'employee_name', 'ArabicName')).toLowerCase();
      const empDept = String(getField(emp, 'department', 'Department')).toLowerCase();
      const empComp = String(getField(emp, 'company', 'Company')).toLowerCase();
      const cType = getField(emp, 'contract_type', 'ContractType');
      const age = getEmployeeAge(emp);

      const matchesSearch = !term || empCode.includes(term) || empName.includes(term) || empDept.includes(term);
      const matchesDept = !selectedDept || empDept.includes(selectedDept.toLowerCase());
      const matchesComp = !selectedCompany || empComp.includes(selectedCompany.toLowerCase());
      const matchesType = !selectedType || cType === selectedType;

      let matchesAge = true;
      if (selectedAgeRange === '60_plus') matchesAge = age !== null && age >= 60;
      else if (selectedAgeRange === '50_59') matchesAge = age !== null && age >= 50 && age < 60;
      else if (selectedAgeRange === '30_49') matchesAge = age !== null && age >= 30 && age < 50;
      else if (selectedAgeRange === 'under_30') matchesAge = age !== null && age < 30;

      return matchesSearch && matchesDept && matchesComp && matchesType && matchesAge;
    });
  }, [employees, searchTerm, selectedDept, selectedCompany, selectedType, selectedAgeRange]);

  // 📊 حسابات كروت الـ KPI الـ 6 (مع استبعاد "تحويلات تحت الاعتماد" وغير النشطين تماماً)
  const kpiStats = useMemo(() => {
    const currentYear = new Date().getFullYear();

    // تصفية صارمة لحسابات الكروت العلوية فقط
    const activeOnlyForKpi = baseFilteredEmployees.filter(e => {
      const dept = String(getField(e, 'department', 'Department') || '');
      const status = String(getField(e, 'status', 'Status') || 'Active');
      return !dept.includes('تحويلات') && status.toLowerCase() === 'active';
    });

    const total = activeOnlyForKpi.length;

    let newJoiners = 0;
    let perm = 0;
    let fixed = 0;
    let aboveAge = 0;
    let missingData = 0;

    activeOnlyForKpi.forEach(e => {
      const cType = String(getField(e, 'contract_type', 'ContractType') || '');
      const age = getEmployeeAge(e);
      const hiringDateStr = getField(e, 'hiring_date', 'HiringDate');
      const natId = getField(e, 'national_id', 'NationalID');
      const mobile = getField(e, 'mobile', 'Mobile');

      if (hiringDateStr) {
        const hDate = new Date(hiringDateStr);
        if (!isNaN(hDate.getTime()) && hDate.getFullYear() === currentYear) {
          newJoiners++;
        }
      }

      if (cType === 'دائم') perm++;
      else if (cType.includes('محدد')) fixed++;

      if (cType.includes('فوق السن') || (age !== null && age >= 60)) {
        aboveAge++;
      }

      if (!natId || !mobile) {
        missingData++;
      }
    });

    const calcPct = (val: number) => (total > 0 ? ((val / total) * 100).toFixed(1) : '0');

    return { 
      total, 
      newJoiners, 
      newJoinersPct: calcPct(newJoiners),
      perm, 
      permPct: calcPct(perm), 
      fixed, 
      fixedPct: calcPct(fixed), 
      aboveAge, 
      aboveAgePct: calcPct(aboveAge),
      missingData,
      missingDataPct: calcPct(missingData),
      currentYear
    };
  }, [baseFilteredEmployees]);

  // 🌟 فلترة الجدول النهائي (إخفاء التحويلات افتراضياً وإظهارها فور البحث الصريح)
  const finalTableEmployees = useMemo(() => {
    const currentYear = new Date().getFullYear();

    const filtered = baseFilteredEmployees.filter(emp => {
      const dept = String(getField(emp, 'department', 'Department') || '');
      const status = String(getField(emp, 'status', 'Status') || 'Active');
      const cType = String(getField(emp, 'contract_type', 'ContractType') || '');
      const age = getEmployeeAge(emp);
      const hiringDateStr = getField(emp, 'hiring_date', 'HiringDate');
      const natId = getField(emp, 'national_id', 'NationalID');
      const mobile = getField(emp, 'mobile', 'Mobile');

      const isTransfer = dept.includes('تحويلات') || status !== 'Active';
      const isExplicitSearch = searchTerm.trim() !== '' || selectedDept.includes('تحويلات');

      // إخفاء موظفي تحويلات تحت الاعتماد من القائمة الافتراضية، وإظهارهم فقط عند البحث عنهم
      if (isTransfer && !isExplicitSearch) {
        return false;
      }

      if (activeCardFilter === 'NEW_JOINERS') {
        if (!hiringDateStr) return false;
        const hDate = new Date(hiringDateStr);
        return !isNaN(hDate.getTime()) && hDate.getFullYear() === currentYear;
      }
      if (activeCardFilter === 'PERM') return cType === 'دائم';
      if (activeCardFilter === 'FIXED') return cType.includes('محدد');
      if (activeCardFilter === 'ABOVE_AGE') return cType.includes('فوق السن') || (age !== null && age >= 60);
      if (activeCardFilter === 'MISSING_DATA') return !natId || !mobile;

      return true;
    });

    return filtered.sort((a, b) => {
      if (sortColumn === 'age') {
        const ageA = getEmployeeAge(a) !== null ? getEmployeeAge(a) : 0;
        const ageB = getEmployeeAge(b) !== null ? getEmployeeAge(b) : 0;
        const res = (ageA as number) - (ageB as number);
        return sortDirection === 'asc' ? res : -res;
      }
      
      let valA = String(getField(a, sortColumn, 'employee_code'));
      let valB = String(getField(b, sortColumn, 'employee_code'));
      const res = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? res : -res;
    });
  }, [baseFilteredEmployees, activeCardFilter, sortColumn, sortDirection, searchTerm, selectedDept]);

  const termSearchResults = useMemo(() => {
    if (!termSearch.trim()) return [];
    const term = termSearch.toLowerCase().trim();
    return employees.filter(e => {
      const code = String(getField(e, 'employee_code', 'EmployeeCode')).toLowerCase();
      const name = String(getField(e, 'employee_name', 'ArabicName')).toLowerCase();
      const dept = String(getField(e, 'department', 'Department')).toLowerCase();
      return code.includes(term) || name.includes(term) || dept.includes(term);
    }).slice(0, 8);
  }, [employees, termSearch]);

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
    return sortDirection === 'asc' ? <span style={{ color: '#0d9488', marginRight: '4px' }}>▲</span> : <span style={{ color: '#0d9488', marginRight: '4px' }}>▼</span>;
  };

  const handleOpenEdit = async (emp: any) => {
    setEditData({ emp: { ...emp }, loading: false });
  };

  // 🌟 إجراء إعادة تفعيل الموظف وترجيعه نشطاً (Active)
  const handleConfirmReactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reactivateEmp) return;
    if (!reactivateDept) return alert('يرجى تحديد الإدارة التي سيعود إليها الموظف.');

    setReactivateSaving(true);
    try {
      const empCode = getField(reactivateEmp, 'employee_code', 'EmployeeCode');

      const { error: empError } = await supabase
        .from('employees')
        .update({
          department: reactivateDept,
          company: reactivateCompany || getField(reactivateEmp, 'company', 'Company'),
          status: 'Active',
          termination_reason: null,
          termination_date: null
        })
        .eq('employee_code', empCode);

      if (empError) throw empError;

      await supabase
        .from('contracts')
        .update({ status: 'Active' })
        .eq('employee_code', empCode);

      alert(`✅ تم إعادة تفعيل الموظف (${getField(reactivateEmp, 'employee_name', 'ArabicName')}) ونقله إلى إدارة (${reactivateDept}) بنجاح.`);
      setReactivateEmp(null);
      setReactivateDept('');
      setReactivateCompany('');
      await fetchEmployees();
    } catch (err: any) {
      alert('خطأ أثناء إعادة التفعيل: ' + err.message);
    } finally {
      setReactivateSaving(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;
    setEditData({ ...editData, saving: true });

    try {
      const rawHiring = getField(editData.emp, 'hiring_date', 'HiringDate');
      const rawEnd = getField(editData.emp, 'contract_end_date', 'ContractEndDate');
      const empCode = getField(editData.emp, 'employee_code', 'EmployeeCode');

      const employeeUpdateData = {
        employee_code: empCode,
        employee_name: getField(editData.emp, 'employee_name', 'ArabicName'),
        national_id: getField(editData.emp, 'national_id', 'NationalID'),
        age: editData.emp.age ? Number(editData.emp.age) : null,
        department: getField(editData.emp, 'department', 'Department'),
        company: getField(editData.emp, 'company', 'Company'),
        job_title: getField(editData.emp, 'job_title', 'JobTitle'),
        hiring_date: rawHiring && rawHiring.trim() !== '' ? rawHiring : null,
        status: getField(editData.emp, 'status', 'Status'),
        email: getField(editData.emp, 'email', 'Email'),
        mobile: getField(editData.emp, 'mobile', 'Mobile', 'MOBILE')
      };

      const { error: empError } = await supabase
        .from('employees')
        .update(employeeUpdateData)
        .eq('employee_code', empCode);

      if (empError) throw empError;

      const contractUpdateData = {
        contract_type: getField(editData.emp, 'contract_type', 'ContractType'),
        contract_end_date: rawEnd && rawEnd.trim() !== '' ? rawEnd : null,
        status: getField(editData.emp, 'status', 'Status')
      };

      const { error: contractError } = await supabase
        .from('contracts')
        .update(contractUpdateData)
        .eq('employee_code', empCode);

      if (contractError) throw contractError;

      alert('تم حفظ التعديلات بنجاح ✅');
      setEditData(null);
      await fetchEmployees(); 
    } catch (err: any) {
      alert('حدث خطأ أثناء الحفظ: ' + err.message);
      setEditData((prev: any) => prev ? { ...prev, saving: false } : null);
    }
  };

  const handleConfirmTermination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTermEmp) return alert('يرجى اختيار موظف أولاً.');

    setTermSaving(true);
    try {
      const empCode = getField(selectedTermEmp, 'employee_code', 'EmployeeCode');

      const { error: empError } = await supabase
        .from('employees')
        .update({
          department: 'تحويلات تحت الاعتماد',
          status: 'Inactive',
          termination_reason: termReason,
          termination_date: termDate
        })
        .eq('employee_code', empCode);

      if (empError) throw empError;

      await supabase
        .from('contracts')
        .update({ status: 'Inactive' })
        .eq('employee_code', empCode);

      alert(`✅ تم تحويل الموظف (${getField(selectedTermEmp, 'employee_name', 'ArabicName')}) إلى قسم (تحويلات تحت الاعتماد) بنجاح.`);
      setShowTermModal(false);
      setSelectedTermEmp(null);
      setTermSearch('');
      await fetchEmployees();
    } catch (err: any) {
      alert('خطأ أثناء العملية: ' + err.message);
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
      const updatePayload: any = {};
      if (bulkDept) updatePayload.department = bulkDept;
      if (bulkCompany) updatePayload.company = bulkCompany;

      const { error } = await supabase
        .from('employees')
        .update(updatePayload)
        .in('employee_code', selectedEmpIds);

      if (error) throw error;

      alert(`✅ تم نقل ${selectedEmpIds.length} موظف بنجاح.`);
      setShowBulkTransferModal(false);
      setSelectedEmpIds([]);
      setBulkDept('');
      setBulkCompany('');
      await fetchEmployees();
    } catch (err: any) {
      alert('خطأ أثناء النقل المجمع: ' + err.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedEmpIds.length} موظف بشكل نهائي من قاعدة البيانات؟\n(هذا الإجراء لا يمكن التراجع عنه وسيحذف العقود المرتبطة بهم أيضاً)`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await supabase.from('contracts').delete().in('employee_code', selectedEmpIds);
      
      const { error: empError } = await supabase.from('employees').delete().in('employee_code', selectedEmpIds);
      if (empError) throw empError;

      alert('تم حذف الموظفين بنجاح 🗑️✅');
      setSelectedEmpIds([]);
      await fetchEmployees();
    } catch (err: any) {
      alert('حدث خطأ أثناء الحذف: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let calculatedAge = null;
      if (newEmp.birth_date) {
        const birth = new Date(newEmp.birth_date);
        const today = new Date();
        calculatedAge = today.getFullYear() - birth.getFullYear();
      }

      const { error: empError } = await supabase.from('employees').insert([{
        employee_code: newEmp.employee_code,
        employee_name: newEmp.employee_name,
        national_id: newEmp.national_id,
        birth_date: newEmp.birth_date ? newEmp.birth_date : null,
        age: calculatedAge,
        department: newEmp.department,
        company: newEmp.company,
        job_title: newEmp.job_title,
        hiring_date: newEmp.hiring_date ? newEmp.hiring_date : null,
        status: newEmp.status,
        email: newEmp.email,
        mobile: newEmp.mobile
      }]);

      if (empError) throw empError;

      const { error: contractError } = await supabase.from('contracts').insert([{
        employee_code: newEmp.employee_code,
        contract_type: newEmp.contract_type,
        contract_end_date: (newEmp.contract_type === 'دائم' || !newEmp.contract_end_date) ? null : newEmp.contract_end_date,
        contract_start_date: newEmp.hiring_date ? newEmp.hiring_date : null,
        status: newEmp.status
      }]);

      if (contractError) throw contractError;

      alert('تم إضافة الموظف وعقده بنجاح ✅');
      setShowAddModal(false);
      setNewEmp({
        employee_code: '', employee_name: '', national_id: '', birth_date: '',
        department: '', company: '', job_title: '', hiring_date: '',
        contract_type: 'محدد المدة', contract_end_date: '', status: 'Active', email: '', mobile: ''
      });
      await fetchEmployees();
    } catch (err: any) {
      alert('خطأ أثناء الإضافة: ' + err.message);
    }
  };

  const handleExportToExcel = (onlySelected = false) => {
    const listToExport = onlySelected 
      ? finalTableEmployees.filter(e => selectedEmpIds.includes(getField(e, 'employee_code', 'EmployeeCode')))
      : finalTableEmployees;

    const exportData = listToExport.map(e => ({
      'employee_code': getField(e, 'employee_code', 'EmployeeCode'),
      'employee_name': getField(e, 'employee_name', 'ArabicName'),
      'job_title': getField(e, 'job_title', 'JobTitle'),
      'department': getField(e, 'department', 'Department'),
      'age': getEmployeeAge(e) ? `${getEmployeeAge(e)} سنة` : '—',
      'national_id': getField(e, 'national_id', 'NationalID'),
      'mobile': getField(e, 'mobile', 'Mobile'),
      'hiring_date': getField(e, 'hiring_date', 'HiringDate'),
      'contract_end_date': getField(e, 'contract_end_date', 'ContractEndDate'),
      'contract_type': getField(e, 'contract_type', 'ContractType'),
      'company': getField(e, 'company', 'Company')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الموظفين_Active');
    XLSX.writeFile(wb, `بيانات_الموظفين_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getContractStatusBadge = (contractType: string, endDateStr: string) => {
    if (endDateStr && endDateStr.trim() !== '') {
      const end = new Date(endDateStr);
      const today = new Date();
      const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));

      if (days < 0) {
        return <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #fecaca' }}>{endDateStr} 🚨</span>;
      }
      if (days <= 60) {
        return <span style={{ background: '#fffbe1', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #fde68a' }}>{endDateStr} ⏳</span>;
      }
      return <span style={{ background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #bfdbfe' }}>{endDateStr}</span>;
    }

    if (contractType === 'دائم') {
      return <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #bbf7d0' }}>عقد دائم 🛡️</span>;
    }

    return <span style={{ color: '#64748b' }}>—</span>;
  };

  const renderAgeBadge = (emp: any) => {
    const age = getEmployeeAge(emp);
    if (age === null) return <span style={{ color: '#64748b' }}>—</span>;

    if (age >= 60) {
      return <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>💼 {age} سنة (60+)</span>;
    }
    return <span style={{ background: '#f8fafc', color: '#0f172a', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #e2e8f0' }}>{age} سنة</span>;
  };

  return (
    <div style={{ direction: 'rtl', paddingBottom: '40px', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      
      {/* رأس الصفحة */}
      <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px 20px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>👥 سجل الموظفين الفعالين (Active)</h3>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>إدارة وتتبع السجل الرئيسي وقوة العمل بالشركة والشركات الشقيقة</p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            onClick={() => handleExportToExcel(false)}
            style={{ background: '#10b981', color: '#fff', border: 0, padding: '8px 14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            📥 تصدير Excel
          </button>

          <button 
            onClick={() => { setShowTermModal(true); setSelectedTermEmp(null); setTermSearch(''); }} 
            style={{ background: '#dc2626', color: '#fff', border: 0, padding: '8px 14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            🚫 Terminated (إنهاء)
          </button>

          <button onClick={() => setShowAddModal(true)} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '8px 14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s' }}>
            + إضافة موظف جديد
          </button>
        </div>
      </div>

      {/* الكروت الإحصائية الـ 6 التفاعلية (بدون تحويلات تحت الاعتماد) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" style={{ marginBottom: '20px' }}>
        <div 
          onClick={() => setActiveCardFilter(activeCardFilter === 'ALL_ACTIVE' ? null : 'ALL_ACTIVE')}
          style={{ 
            background: '#ffffff', 
            border: activeCardFilter === 'ALL_ACTIVE' ? '2px solid #0d9488' : '1px solid #e2e8f0', 
            padding: '12px 14px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>إجمالي الموظفين</div>
            <span style={{ fontSize: '14px' }}>👥</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a', marginTop: '4px' }}>{kpiStats.total.toLocaleString('en-US')}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0d9488', marginTop: '2px' }}>القوة الفعالة (100%)</div>
        </div>

        <div 
          onClick={() => setActiveCardFilter(activeCardFilter === 'NEW_JOINERS' ? null : 'NEW_JOINERS')}
          style={{ 
            background: activeCardFilter === 'NEW_JOINERS' ? '#f0fdf4' : '#ffffff', 
            border: activeCardFilter === 'NEW_JOINERS' ? '2px solid #10b981' : '1px solid #e2e8f0', 
            padding: '12px 14px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>تعيينات {kpiStats.currentYear}</div>
            <span style={{ fontSize: '14px' }}>🌱</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#10b981', marginTop: '4px' }}>{kpiStats.newJoiners.toLocaleString('en-US')}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#10b981', marginTop: '2px' }}>نسبة {kpiStats.newJoinersPct}% من القوة</div>
        </div>

        <div 
          onClick={() => setActiveCardFilter(activeCardFilter === 'FIXED' ? null : 'FIXED')}
          style={{ 
            background: activeCardFilter === 'FIXED' ? '#eff6ff' : '#ffffff', 
            border: activeCardFilter === 'FIXED' ? '2px solid #2563eb' : '1px solid #e2e8f0', 
            padding: '12px 14px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>عقود محددة المدة</div>
            <span style={{ fontSize: '14px' }}>📂</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#2563eb', marginTop: '4px' }}>{kpiStats.fixed.toLocaleString('en-US')}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#2563eb', marginTop: '2px' }}>نسبة {kpiStats.fixedPct}% من القوة</div>
        </div>

        <div 
          onClick={() => setActiveCardFilter(activeCardFilter === 'PERM' ? null : 'PERM')}
          style={{ 
            background: activeCardFilter === 'PERM' ? '#f0fdf4' : '#ffffff', 
            border: activeCardFilter === 'PERM' ? '2px solid #16a34a' : '1px solid #e2e8f0', 
            padding: '12px 14px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>عقود دائمة</div>
            <span style={{ fontSize: '14px' }}>🛡️</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#16a34a', marginTop: '4px' }}>{kpiStats.perm.toLocaleString('en-US')}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#16a34a', marginTop: '2px' }}>نسبة {kpiStats.permPct}% من القوة</div>
        </div>

        <div 
          onClick={() => setActiveCardFilter(activeCardFilter === 'ABOVE_AGE' ? null : 'ABOVE_AGE')}
          style={{ 
            background: activeCardFilter === 'ABOVE_AGE' ? '#fffbe1' : '#ffffff', 
            border: activeCardFilter === 'ABOVE_AGE' ? '2px solid #d97706' : '1px solid #e2e8f0', 
            padding: '12px 14px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>فوق السن (60+)</div>
            <span style={{ fontSize: '14px' }}>💼</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#d97706', marginTop: '4px' }}>{kpiStats.aboveAge.toLocaleString('en-US')}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#d97706', marginTop: '2px' }}>نسبة {kpiStats.aboveAgePct}% من القوة</div>
        </div>

        <div 
          onClick={() => setActiveCardFilter(activeCardFilter === 'MISSING_DATA' ? null : 'MISSING_DATA')}
          style={{ 
            background: activeCardFilter === 'MISSING_DATA' ? '#fef2f2' : '#ffffff', 
            border: activeCardFilter === 'MISSING_DATA' ? '2px solid #dc2626' : '1px solid #e2e8f0', 
            padding: '12px 14px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>نواقص البيانات</div>
            <span style={{ fontSize: '14px' }}>⚠️</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#dc2626', marginTop: '4px' }}>{kpiStats.missingData.toLocaleString('en-US')}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#dc2626', marginTop: '2px' }}>اضغط للاستكمال ✏️</div>
        </div>
      </div>

      {/* إجراءات المحددين المجمعة */}
      {selectedEmpIds.length > 0 && (
        <div style={{ background: '#0f172a', color: '#fff', padding: '10px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
            تم تحديد <span style={{ color: '#60a5fa' }}>{selectedEmpIds.length}</span> موظف
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowBulkTransferModal(true)} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
              نقل مجمع 🔄
            </button>
            <button onClick={() => handleExportToExcel(true)} style={{ background: '#10b981', color: '#fff', border: 0, padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
              تصدير المحدد 📥
            </button>
            <button onClick={handleDeleteSelected} disabled={isDeleting} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: isDeleting ? 'not-allowed' : 'pointer', opacity: isDeleting ? 0.7 : 1 }}>
              {isDeleting ? 'جاري الحذف...' : 'حذف نهائي 🗑️'}
            </button>
            <button onClick={() => setSelectedEmpIds([])} style={{ background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
              إلغاء التحديد ✕
            </button>
          </div>
        </div>
      )}

      {/* الفلاتر والبحث */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '14px 16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.02)' }}>
        <input type="text" placeholder="بحث بالاسم، الكود، الإدارة..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', minWidth: '220px', color: '#0f172a' }} />
        
        <input list="deptList" placeholder="الإدارة..." value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', width: '140px', color: '#0f172a' }} />
        <datalist id="deptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>
        
        <input list="compList" placeholder="الشركة..." value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', width: '140px', color: '#0f172a' }} />
        <datalist id="compList">{compsList.map((c: any, i) => <option key={i} value={c} />)}</datalist>

        <select value={selectedType} onChange={e => setSelectedType(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', color: '#0f172a' }}>
          <option value="">كل أنواع العقود</option>
          {typesList.map((t: any, i) => <option key={i} value={t}>{t}</option>)}
        </select>

        <select value={selectedAgeRange} onChange={e => setSelectedAgeRange(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', color: '#0f172a', fontWeight: 'bold' }}>
          <option value="">فئة السن (الكل)</option>
          <option value="60_plus">💼 فوق السن (60 سنة فأكثر)</option>
          <option value="50_59">🎂 من 50 إلى 59 سنة</option>
          <option value="30_49">👔 من 30 إلى 49 سنة</option>
          <option value="under_30">🌱 أقل من 30 سنة</option>
        </select>

        <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedCompany(''); setSelectedType(''); setSelectedAgeRange(''); setActiveCardFilter('ALL_ACTIVE'); }} style={{ background: '#f1f5f9', color: '#334155', border: 0, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>
        
        <div style={{ marginRight: 'auto', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>
          النتائج بالجدول: <span style={{ color: '#0f172a', fontSize: '13px' }}>{finalTableEmployees.length.toLocaleString('en-US')}</span> موظف
        </div>
      </div>

      {/* الجدول الرئيسي */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>جاري سحب بيانات الموظفين... ⏳</div>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', zIndex: 10 }}>
                <tr style={{ color: '#64748b' }}>
                  <th style={{ padding: '12px', textAlign: 'center', width: '40px' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedEmpIds.length === finalTableEmployees.length && finalTableEmployees.length > 0} 
                      onChange={e => setSelectedEmpIds(e.target.checked ? finalTableEmployees.map(emp => getField(emp, 'employee_code', 'EmployeeCode')) : [])} 
                      style={{ accentColor: '#0d9488' }} 
                    />
                  </th>
                  <th onClick={() => handleSort('employee_code')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>الكود {renderSortArrow('employee_code')}</th>
                  <th onClick={() => handleSort('employee_name')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>الاسم {renderSortArrow('employee_name')}</th>
                  <th onClick={() => handleSort('job_title')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>الوظيفة {renderSortArrow('job_title')}</th>
                  <th onClick={() => handleSort('department')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>الإدارة {renderSortArrow('department')}</th>
                  <th onClick={() => handleSort('age')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>السن {renderSortArrow('age')}</th>
                  <th onClick={() => handleSort('hiring_date')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>تاريخ التعيين {renderSortArrow('hiring_date')}</th>
                  <th onClick={() => handleSort('contract_type')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>نوع العقد {renderSortArrow('contract_type')}</th>
                  <th onClick={() => handleSort('contract_end_date')} style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}>نهاية العقد {renderSortArrow('contract_end_date')}</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {finalTableEmployees.map((emp, i) => {
                  const empCode = getField(emp, 'employee_code', 'EmployeeCode');
                  const dept = String(getField(emp, 'department', 'Department') || '');
                  const status = String(getField(emp, 'status', 'Status') || 'Active');
                  const nationalId = getField(emp, 'national_id', 'NationalID');
                  const mobile = getField(emp, 'mobile', 'Mobile');
                  const isMissingData = !nationalId || !mobile;
                  const cType = getField(emp, 'contract_type', 'ContractType');
                  const endDate = getField(emp, 'contract_end_date', 'ContractEndDate');

                  const isTransferredOrInactive = dept.includes('تحويلات') || status.toLowerCase() !== 'active';

                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: isTransferredOrInactive ? '#fff5f5' : selectedEmpIds.includes(empCode) ? '#f0fdf4' : 'transparent' }}>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedEmpIds.includes(empCode)} 
                          onChange={e => setSelectedEmpIds(e.target.checked ? [...selectedEmpIds, empCode] : selectedEmpIds.filter(id => id !== empCode))} 
                          style={{ accentColor: '#0d9488' }} 
                        />
                      </td>
                      <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: isTransferredOrInactive ? '#dc2626' : '#0d9488' }}>
                        {empCode}
                      </td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>
                        {getField(emp, 'employee_name', 'ArabicName')}
                        {isMissingData && (
                          <span title="بيانات غير مكتملة (ناقص الرقم القومي أو الموبايل)" style={{ marginRight: '6px', fontSize: '11px', cursor: 'help' }}>⚠️</span>
                        )}
                        {isTransferredOrInactive && (
                          <span style={{ marginRight: '6px', background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', border: '1px solid #fecaca' }}>تحويلات</span>
                        )}
                      </td>
                      <td style={{ padding: '10px', color: '#64748b', fontWeight: '500' }}>{getField(emp, 'job_title', 'JobTitle') || '—'}</td>
                      <td style={{ padding: '10px', color: isTransferredOrInactive ? '#dc2626' : '#64748b', fontWeight: isTransferredOrInactive ? 'bold' : '500' }}>{dept || '—'}</td>
                      <td style={{ padding: '10px' }}>{renderAgeBadge(emp)}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', color: '#0f172a' }}>{getField(emp, 'hiring_date', 'HiringDate') || '—'}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>{cType || '—'}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold' }}>
                        {getContractStatusBadge(cType, endDate)}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button onClick={() => setProfileEmp(emp)} style={{ background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>👁️ الملف</button>
                        <button onClick={() => handleOpenEdit(emp)} style={{ background: '#ffffff', color: '#0d9488', border: '1px solid #99f6e4', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>تعديل ✏️</button>
                        
                        {/* 🌟 زر إعادة التفعيل للموظفين المحولين */}
                        {isTransferredOrInactive && (
                          <button 
                            onClick={() => {
                              setReactivateEmp(emp);
                              setReactivateDept('');
                              setReactivateCompany(getField(emp, 'company', 'Company'));
                            }} 
                            style={{ background: '#10b981', color: '#ffffff', border: 0, padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            🔄 إعادة تفعيل
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 🌟 نافذة إعادة التفعيل المنبثقة */}
      {reactivateEmp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '500px', background: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#10b981', fontWeight: '900' }}>🔄 إعادة تفعيل الموظف</h3>
              <button onClick={() => setReactivateEmp(null)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <form onSubmit={handleConfirmReactivate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '10px', fontSize: '12px', color: '#16a34a' }}>
                سيتم إلغاء تحويل الموظف <strong>{getField(reactivateEmp, 'employee_name', 'ArabicName')}</strong> (كود: {getField(reactivateEmp, 'employee_code', 'EmployeeCode')}) وإعادته للقوة الفعالة (Active).
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>حدد الإدارة التي سيعود إليها *</label>
                <input required list="reactDeptList" placeholder="اختر أو اكتب اسم الإدارة..." value={reactivateDept} onChange={e => setReactivateDept(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                <datalist id="reactDeptList">{deptsList.filter(d => !d.includes('تحويلات')).map((d: any, i) => <option key={i} value={d} />)}</datalist>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>الشركة</label>
                <input list="reactCompList" placeholder="الشركة التابع لها..." value={reactivateCompany} onChange={e => setReactivateCompany(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                <datalist id="reactCompList">{compsList.map((c: any, i) => <option key={i} value={c} />)}</datalist>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setReactivateEmp(null)} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', color: '#334155' }}>إلغاء</button>
                <button type="submit" disabled={reactivateSaving} style={{ background: '#10b981', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: reactivateSaving ? 'not-allowed' : 'pointer' }}>
                  {reactivateSaving ? 'جاري التحديث...' : 'تأكيد إعادة التفعيل 🟢'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 👤 نافذة عرض الملف الشامل */}
      {profileEmp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '600px', background: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '900' }}>👤 الملف الوظيفي الشامل</h3>
              <button onClick={() => setProfileEmp(null)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}><strong>الكود:</strong> {getField(profileEmp, 'employee_code', 'EmployeeCode')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}><strong>الاسم:</strong> {getField(profileEmp, 'employee_name', 'ArabicName')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}><strong>الرقم القومي:</strong> {getField(profileEmp, 'national_id', 'NationalID') || 'غير مسجل ⚠️'}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}><strong>تاريخ الميلاد:</strong> {getField(profileEmp, 'birth_date', 'BirthDate') || 'غير مسجل'}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}><strong>السن الحالي:</strong> {getEmployeeAge(profileEmp) ? `${getEmployeeAge(profileEmp)} سنة` : 'غير مسجل'}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}><strong>الموبايل:</strong> {getField(profileEmp, 'mobile', 'Mobile') || 'غير مسجل ⚠️'}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}><strong>الإدارة:</strong> {getField(profileEmp, 'department', 'Department')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}><strong>الشركة:</strong> {getField(profileEmp, 'company', 'Company')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}><strong>الوظيفة:</strong> {getField(profileEmp, 'job_title', 'JobTitle')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}><strong>تاريخ التعيين:</strong> {getField(profileEmp, 'hiring_date', 'HiringDate')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}><strong>نوع العقد:</strong> {getField(profileEmp, 'contract_type', 'ContractType')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}><strong>نهاية العقد:</strong> {getField(profileEmp, 'contract_end_date', 'ContractEndDate') || '—'}</div>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'left' }}>
              <button onClick={() => { handleOpenEdit(profileEmp); setProfileEmp(null); }} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>تعديل البيانات ✏️</button>
            </div>
          </div>
        </div>
      )}

      {/* 🚫 نافذة إنهاء الخدمة */}
      {showTermModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '550px', background: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#dc2626', fontWeight: '900' }}>🚫 إنهاء خدمة / تحويل للانتظار</h3>
              <button onClick={() => { setShowTermModal(false); setSelectedTermEmp(null); }} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <form onSubmit={handleConfirmTermination} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>البحث السريع عن الموظف:</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text"
                    placeholder="اكتب كود الموظف، اسمه، أو إدارته..."
                    value={termSearch}
                    onChange={e => { setTermSearch(e.target.value); setSelectedTermEmp(null); }}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                  />

                  {termSearchResults.length > 0 && !selectedTermEmp && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto', zIndex: 100, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                      {termSearchResults.map((emp, i) => (
                        <div 
                          key={i} 
                          onClick={() => { 
                            setSelectedTermEmp(emp); 
                            setTermSearch(`${getField(emp, 'employee_code', 'EmployeeCode')} - ${getField(emp, 'employee_name', 'ArabicName')}`); 
                          }}
                          style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '11.5px', transition: 'background 0.2s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <strong style={{ color: '#0d9488' }}>[{getField(emp, 'employee_code', 'EmployeeCode')}]</strong> {getField(emp, 'employee_name', 'ArabicName')} 
                          <span style={{ color: '#64748b', fontSize: '10.5px', marginRight: '6px' }}>({getField(emp, 'department', 'Department') || 'بدون إدارة'})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {selectedTermEmp && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: '8px', fontSize: '11.5px', color: '#dc2626', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>الموظف المحدّد:</strong> {getField(selectedTermEmp, 'employee_name', 'ArabicName')} (كود: {getField(selectedTermEmp, 'employee_code', 'EmployeeCode')})
                  </div>
                  <button type="button" onClick={() => { setSelectedTermEmp(null); setTermSearch(''); }} style={{ background: 'transparent', border: 0, color: '#dc2626', cursor: 'pointer', fontWeight: 'bold' }}>تغيير ✕</button>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>سبب إنهاء الخدمة / التحويل:</label>
                <select value={termReason} onChange={e => setTermReason(e.target.value)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}>
                  <option value="استقالة">استقالة</option>
                  <option value="إنهاء عقد">إنهاء عقد</option>
                  <option value="إنهاء خدمات">إنهاء خدمات</option>
                  <option value="بلوغ سن">بلوغ سن (تقاعد)</option>
                  <option value="انقطاع عن العمل">انقطاع عن العمل</option>
                  <option value="نقل شركة شقيقة">نقل شركة شقيقة</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>تاريخ إجراء العمل:</label>
                <input type="date" required value={termDate} onChange={e => setTermDate(e.target.value)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowTermModal(false)} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', color: '#334155' }}>إلغاء</button>
                <button type="submit" disabled={termSaving || !selectedTermEmp} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: (termSaving || !selectedTermEmp) ? 'not-allowed' : 'pointer', opacity: (termSaving || !selectedTermEmp) ? 0.6 : 1 }}>
                  {termSaving ? 'جاري الحفظ...' : 'تحويل الموظف لـ (تحويلات تحت الاعتماد) 🚫'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🔄 نافذة النقل المجمع */}
      {showBulkTransferModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '500px', background: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#2563eb', fontWeight: '900' }}>🔄 النقل المجمع للموظفين المحددين</h3>
              <button onClick={() => setShowBulkTransferModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <form onSubmit={handleConfirmBulkTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                سيتم تطبيق البيانات المحددة على عدد <strong>{selectedEmpIds.length}</strong> موظف.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>الإدارة الجديدة:</label>
                <input list="bulkDeptList" placeholder="اترك فارغاً إذا لم ترد التغيير..." value={bulkDept} onChange={e => setBulkDept(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                <datalist id="bulkDeptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>الشركة الجديدة:</label>
                <input list="bulkCompList" placeholder="اترك فارغاً إذا لم ترد التغيير..." value={bulkCompany} onChange={e => setBulkCompany(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                <datalist id="bulkCompList">{compsList.map((c: any, i) => <option key={i} value={c} />)}</datalist>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowBulkTransferModal(false)} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', color: '#334155' }}>إلغاء</button>
                <button type="submit" disabled={bulkSaving} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: bulkSaving ? 'not-allowed' : 'pointer' }}>
                  {bulkSaving ? 'جاري التحديث...' : 'تأكيد النقل المجمع 🔄'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✏️ نافذة التعديل الفردي */}
      {editData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '800px', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>تعديل بيانات الموظف (شامل)</h3>
              <button onClick={() => setEditData(null)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: '#0d9488', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', fontWeight: 'bold' }}>بيانات السجل الأساسي (Employees)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  {[
                    { label: 'الكود', key1: 'employee_code', key2: 'EmployeeCode' },
                    { label: 'الاسم العربي', key1: 'employee_name', key2: 'ArabicName' },
                    { label: 'الرقم القومي', key1: 'national_id', key2: 'NationalID' },
                    { label: 'السن (Age)', key1: 'age', key2: 'Age' },
                    { label: 'الإدارة', key1: 'department', key2: 'Department' },
                    { label: 'الشركة', key1: 'company', key2: 'Company' },
                    { label: 'الوظيفة', key1: 'job_title', key2: 'JobTitle' },
                    { label: 'الموبايل', key1: 'mobile', key2: 'Mobile' },
                  ].map(field => (
                    <div key={field.label}>
                      <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 'bold' }}>{field.label}</label>
                      <input type="text" value={getField(editData.emp, field.key1, field.key2)} onChange={e => setEditData({ ...editData, emp: { ...editData.emp, [field.key1]: e.target.value, [field.key2]: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', color: '#0f172a' }} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: '#2563eb', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', fontWeight: 'bold' }}>بيانات التعاقد والتجديد (Contracts & Renewals)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 'bold' }}>تاريخ التعيين</label>
                    <input type="date" value={getField(editData.emp, 'hiring_date', 'HiringDate')} onChange={e => setEditData({ ...editData, emp: { ...editData.emp, hiring_date: e.target.value, HiringDate: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', color: '#0f172a' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 'bold' }}>نوع العقد</label>
                    <select value={getField(editData.emp, 'contract_type', 'ContractType')} onChange={e => setEditData({ ...editData, emp: { ...editData.emp, contract_type: e.target.value, ContractType: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', color: '#0f172a' }}>
                      <option value="دائم">دائم</option>
                      <option value="محدد المدة">محدد المدة</option>
                      <option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                      <option value="محدد المدة - مكافأة شاملة">محدد المدة - مكافأة شاملة</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 'bold' }}>تاريخ نهاية العقد</label>
                    <input type="date" value={getField(editData.emp, 'contract_end_date', 'ContractEndDate')} onChange={e => setEditData({ ...editData, emp: { ...editData.emp, contract_end_date: e.target.value, ContractEndDate: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', color: '#0f172a' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 'bold' }}>حالة الموظف (Status)</label>
                    <select value={getField(editData.emp, 'status', 'Status')} onChange={e => setEditData({ ...editData, emp: { ...editData.emp, status: e.target.value, Status: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', color: '#0f172a' }}>
                      <option value="Active">Active (نشط)</option><option value="Inactive">Inactive (منتهي الخدمة)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => setEditData(null)} style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={editData.saving} style={{ background: editData.saving ? '#64748b' : '#0d9488', color: '#fff', border: 0, padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: editData.saving ? 'not-allowed' : 'pointer', opacity: editData.saving ? 0.7 : 1 }}>
                  {editData.saving ? 'جاري الحفظ...' : 'حفظ كافة التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ➕ نافذة الإضافة المباشرة */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '700px', background: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>إضافة موظف جديد</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            
            <form onSubmit={handleAddEmployee}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div><label style={{ display:'block', fontSize:'11px', color:'#64748b', marginBottom:'6px', fontWeight:'bold' }}>كود الموظف *</label><input required value={newEmp.employee_code} onChange={e=>setNewEmp({...newEmp, employee_code: e.target.value})} style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'12px', outline:'none', color:'#0f172a' }} /></div>
                <div><label style={{ display:'block', fontSize:'11px', color:'#64748b', marginBottom:'6px', fontWeight:'bold' }}>الاسم *</label><input required value={newEmp.employee_name} onChange={e=>setNewEmp({...newEmp, employee_name: e.target.value})} style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'12px', outline:'none', color:'#0f172a' }} /></div>
                <div><label style={{ display:'block', fontSize:'11px', color:'#64748b', marginBottom:'6px', fontWeight:'bold' }}>الرقم القومي</label><input value={newEmp.national_id} onChange={e=>setNewEmp({...newEmp, national_id: e.target.value})} style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'12px', outline:'none', color:'#0f172a' }} /></div>
                
                <div><label style={{ display:'block', fontSize:'11px', color:'#64748b', marginBottom:'6px', fontWeight:'bold' }}>تاريخ الميلاد</label><input type="date" value={newEmp.birth_date} onChange={e=>setNewEmp({...newEmp, birth_date: e.target.value})} style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'12px', outline:'none', color:'#0f172a' }} /></div>

                <div><label style={{ display:'block', fontSize:'11px', color:'#64748b', marginBottom:'6px', fontWeight:'bold' }}>الإدارة</label><input value={newEmp.department} onChange={e=>setNewEmp({...newEmp, department: e.target.value})} style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'12px', outline:'none', color:'#0f172a' }} /></div>
                <div><label style={{ display:'block', fontSize:'11px', color:'#64748b', marginBottom:'6px', fontWeight:'bold' }}>الشركة</label><input value={newEmp.company} onChange={e=>setNewEmp({...newEmp, company: e.target.value})} style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'12px', outline:'none', color:'#0f172a' }} /></div>
                <div><label style={{ display:'block', fontSize:'11px', color:'#64748b', marginBottom:'6px', fontWeight:'bold' }}>الوظيفة</label><input value={newEmp.job_title} onChange={e=>setNewEmp({...newEmp, job_title: e.target.value})} style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'12px', outline:'none', color:'#0f172a' }} /></div>
                <div><label style={{ display:'block', fontSize:'11px', color:'#64748b', marginBottom:'6px', fontWeight:'bold' }}>تاريخ التعيين</label><input type="date" value={newEmp.hiring_date} onChange={e=>setNewEmp({...newEmp, hiring_date: e.target.value})} style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'12px', outline:'none', color:'#0f172a' }} /></div>
                
                <div>
                  <label style={{ display:'block', fontSize:'11px', color:'#64748b', marginBottom:'6px', fontWeight:'bold' }}>نوع العقد</label>
                  <select value={newEmp.contract_type} onChange={e=>setNewEmp({...newEmp, contract_type: e.target.value})} style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'12px', outline:'none', color:'#0f172a' }}>
                    <option value="دائم">دائم</option>
                    <option value="محدد المدة">محدد المدة</option>
                    <option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                    <option value="محدد المدة - مكافأة شاملة">محدد المدة - مكافأة شاملة</option>
                  </select>
                </div>

                <div><label style={{ display:'block', fontSize:'11px', color:'#64748b', marginBottom:'6px', fontWeight:'bold' }}>تاريخ نهاية العقد (لالعقود المحددة)</label><input type="date" disabled={newEmp.contract_type === 'دائم'} value={newEmp.contract_end_date} onChange={e=>setNewEmp({...newEmp, contract_end_date: e.target.value})} style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'12px', outline:'none', background: newEmp.contract_type === 'دائم' ? '#f8fafc' : '#ffffff', color:'#0f172a' }} /></div>

                <div><label style={{ display:'block', fontSize:'11px', color:'#64748b', marginBottom:'6px', fontWeight:'bold' }}>الموبايل</label><input type="text" value={newEmp.mobile} onChange={e=>setNewEmp({...newEmp, mobile: e.target.value})} style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'12px', outline:'none', color:'#0f172a' }} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" style={{ background: '#0d9488', color: '#fff', border: 0, padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إضافة الموظف وعقده</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
