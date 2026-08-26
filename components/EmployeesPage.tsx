'use client';
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';

export default function EmployeesPage() {
  const { employees, loading, refresh: fetchEmployees } = useAppData();

  // حالات الفلاتر والبحث في الجدول الرئيسي
  const [activeCardFilter, setActiveCardFilter] = useState<'ALL_ACTIVE' | 'PERM' | 'FIXED' | 'ABOVE_AGE' | null>('ALL_ACTIVE');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedType, setSelectedType] = useState('');

  // حالات الترتيب
  const [sortColumn, setSortColumn] = useState<string>('employee_code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // التحديد المجمع
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  // النوافذ المنبثقة
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTermModal, setShowTermModal] = useState(false);
  const [showBulkTransferModal, setShowBulkTransferModal] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [profileEmp, setProfileEmp] = useState<any>(null);

  // حالة نموذج النقل المجمع
  const [bulkDept, setBulkDept] = useState('');
  const [bulkCompany, setBulkCompany] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  // حالة نموذج إنهاء الخدمة (Termination) مع البحث المطور
  const [termSearch, setTermSearch] = useState('');
  const [selectedTermEmp, setSelectedTermEmp] = useState<any>(null);
  const [termReason, setTermReason] = useState('استقالة');
  const [termDate, setTermDate] = useState(new Date().toISOString().split('T')[0]);
  const [termSaving, setTermSaving] = useState(false);

  // حالة الموظف الجديد
  const [newEmp, setNewEmp] = useState({
    employee_code: '', employee_name: '', national_id: '',
    department: '', company: '', job_title: '', hiring_date: '',
    contract_type: 'محدد المدة', contract_end_date: '', status: 'Active', email: '', mobile: ''
  });

  const getField = (obj: any, ...keys: string[]) => {
    if (!obj) return '';
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return '';
  };

  // 1. استبعاد الموظفين المنتهية خدمتهم نهائياً (مع إبقاء إدارة تحويلات تحت الاعتماد)
  const activeEmployeesOnly = useMemo(() => {
    return employees.filter(e => (getField(e, 'status', 'Status') || 'Active') === 'Active');
  }, [employees]);

  // القوائم للفلاتر
  const deptsList = useMemo(() => Array.from(new Set(activeEmployeesOnly.map(e => getField(e, 'department', 'Department')).filter(Boolean))), [activeEmployeesOnly]);
  const compsList = useMemo(() => Array.from(new Set(activeEmployeesOnly.map(e => getField(e, 'company', 'Company')).filter(Boolean))), [activeEmployeesOnly]);
  const typesList = useMemo(() => Array.from(new Set(activeEmployeesOnly.map(e => getField(e, 'contract_type', 'ContractType')).filter(Boolean))), [activeEmployeesOnly]);

  // 2. تطبيق فلاتر البحث/الشركة/الإدارة
  const baseFilteredEmployees = useMemo(() => {
    return activeEmployeesOnly.filter(emp => {
      const term = searchTerm.toLowerCase();
      const empCode = String(getField(emp, 'employee_code', 'EmployeeCode')).toLowerCase();
      const empName = String(getField(emp, 'employee_name', 'ArabicName')).toLowerCase();
      const empDept = String(getField(emp, 'department', 'Department')).toLowerCase();
      const empComp = String(getField(emp, 'company', 'Company')).toLowerCase();
      const cType = getField(emp, 'contract_type', 'ContractType');

      const matchesSearch = !term || empCode.includes(term) || empName.includes(term) || empDept.includes(term);
      const matchesDept = !selectedDept || empDept.includes(selectedDept.toLowerCase());
      const matchesComp = !selectedCompany || empComp.includes(selectedCompany.toLowerCase());
      const matchesType = !selectedType || cType === selectedType;

      return matchesSearch && matchesDept && matchesComp && matchesType;
    });
  }, [activeEmployeesOnly, searchTerm, selectedDept, selectedCompany, selectedType]);

  // 3. إحصائيات الكروت الديناميكية
  const kpiStats = useMemo(() => {
    const total = baseFilteredEmployees.length;
    const perm = baseFilteredEmployees.filter(e => getField(e, 'contract_type', 'ContractType') === 'دائم').length;
    const fixed = baseFilteredEmployees.filter(e => getField(e, 'contract_type', 'ContractType') === 'محدد المدة').length;
    const aboveAge = baseFilteredEmployees.filter(e => String(getField(e, 'contract_type', 'ContractType')).includes('فوق السن')).length;

    const calcPct = (val: number) => (total > 0 ? ((val / total) * 100).toFixed(1) : '0');

    return { total, perm, permPct: calcPct(perm), fixed, fixedPct: calcPct(fixed), aboveAge, aboveAgePct: calcPct(aboveAge) };
  }, [baseFilteredEmployees]);

  // 4. القائمة النهائية للجدول مع الترتيب
  const finalTableEmployees = useMemo(() => {
    const filtered = baseFilteredEmployees.filter(emp => {
      const cType = getField(emp, 'contract_type', 'ContractType');
      if (activeCardFilter === 'PERM') return cType === 'دائم';
      if (activeCardFilter === 'FIXED') return cType === 'محدد المدة';
      if (activeCardFilter === 'ABOVE_AGE') return String(cType).includes('فوق السن');
      return true;
    });

    return filtered.sort((a, b) => {
      let valA = String(getField(a, sortColumn, 'employee_code'));
      let valB = String(getField(b, sortColumn, 'employee_code'));
      const res = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? res : -res;
    });
  }, [baseFilteredEmployees, activeCardFilter, sortColumn, sortDirection]);

  // 🔍 نتائج البحث الحي لشاشة إنهاء الخدمة
  const termSearchResults = useMemo(() => {
    if (!termSearch.trim()) return [];
    const term = termSearch.toLowerCase().trim();
    return activeEmployeesOnly.filter(e => {
      const code = String(getField(e, 'employee_code', 'EmployeeCode')).toLowerCase();
      const name = String(getField(e, 'employee_name', 'ArabicName')).toLowerCase();
      const dept = String(getField(e, 'department', 'Department')).toLowerCase();
      return code.includes(term) || name.includes(term) || dept.includes(term);
    }).slice(0, 8);
  }, [activeEmployeesOnly, termSearch]);

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
    return sortDirection === 'asc' ? <span style={{ color: 'var(--brass-600, #0d9488)', marginRight: '4px' }}>▲</span> : <span style={{ color: 'var(--brass-600, #0d9488)', marginRight: '4px' }}>▼</span>;
  };

  const handleOpenEdit = async (emp: any) => {
    const code = getField(emp, 'employee_code', 'EmployeeCode', 'employee_id');
    setEditData({ emp: { ...emp }, contract: {}, renewal: {}, loading: true });

    const [contractsRes, renewalsRes] = await Promise.all([
      supabase.from('contracts').select('*').or(`employee_id.eq.${code},employee_code.eq.${code}`).limit(1),
      supabase.from('renewal_requests').select('*').or(`employee_id.eq.${code},employee_code.eq.${code}`).limit(1)
    ]);

    setEditData({
      emp: { ...emp },
      contract: contractsRes.data?.[0] || {},
      renewal: renewalsRes.data?.[0] || {},
      loading: false
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;
    setEditData({ ...editData, saving: true });

    try {
      const empId = editData.emp.id || editData.emp.employee_id;
      
      const rawHiring = getField(editData.emp, 'hiring_date', 'HiringDate');
      const rawEnd = getField(editData.emp, 'contract_end_date', 'ContractEndDate');

      const updateData = {
        employee_code: getField(editData.emp, 'employee_code', 'EmployeeCode'),
        employee_name: getField(editData.emp, 'employee_name', 'ArabicName'),
        national_id: getField(editData.emp, 'national_id', 'NationalID'),
        department: getField(editData.emp, 'department', 'Department'),
        company: getField(editData.emp, 'company', 'Company'),
        job_title: getField(editData.emp, 'job_title', 'JobTitle'),
        hiring_date: rawHiring && rawHiring.trim() !== '' ? rawHiring : null,
        contract_type: getField(editData.emp, 'contract_type', 'ContractType'),
        contract_end_date: rawEnd && rawEnd.trim() !== '' ? rawEnd : null,
        status: getField(editData.emp, 'status', 'Status'),
        email: getField(editData.emp, 'email', 'Email'),
        mobile: getField(editData.emp, 'mobile', 'Mobile', 'MOBILE')
      };

      const { error } = await supabase
        .from('employees')
        .update(updateData)
        .eq(editData.emp.id ? 'id' : 'employee_id', empId);

      if (error) throw error;

      alert('تم حفظ التعديلات بنجاح ✅');
      setEditData(null);
      await fetchEmployees();
    } catch (err: any) {
      alert('حدث خطأ أثناء الحفظ: ' + err.message);
      setEditData((prev: any) => prev ? { ...prev, saving: false } : null);
    }
  };

  // 🚫 نقل الموظف لإدارة "تحويلات تحت الاعتماد" عند إنهاء الخدمة ليبقى ظاهراً بالجدول
  const handleConfirmTermination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTermEmp) {
      alert('يرجى اختيار موظف أولاً من قائمة البحث.');
      return;
    }

    setTermSaving(true);
    try {
      const empId = selectedTermEmp.id || selectedTermEmp.employee_id;
      const { error } = await supabase
        .from('employees')
        .update({
          department: 'تحويلات تحت الاعتماد', // 👈 نقل الموظف لهذه الإدارة ليبقى ظاهراً
          termination_reason: termReason,
          termination_date: termDate
        })
        .eq(selectedTermEmp.id ? 'id' : 'employee_id', empId);

      if (error) throw error;

      alert(`✅ تم تحويل الموظف (${getField(selectedTermEmp, 'employee_name', 'ArabicName')}) إلى قسم (تحويلات تحت الاعتماد) بنجاح.`);
      setShowTermModal(false);
      setSelectedTermEmp(null);
      setTermSearch('');
      await fetchEmployees();
    } catch (err: any) {
      alert('خطأ أثناء إجراء العملية: ' + err.message);
    } finally {
      setTermSaving(false);
    }
  };

  const handleConfirmBulkTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmpIds.length === 0) return;
    if (!bulkDept && !bulkCompany) {
      alert('يرجى تحديد إما إدارة جديدة أو شركة جديدة لنقل الموظفين إليها.');
      return;
    }

    setBulkSaving(true);
    try {
      const updatePayload: any = {};
      if (bulkDept) updatePayload.department = bulkDept;
      if (bulkCompany) updatePayload.company = bulkCompany;

      const { error } = await supabase
        .from('employees')
        .update(updatePayload)
        .in('id', selectedEmpIds);

      if (error) {
        await supabase.from('employees').update(updatePayload).in('employee_id', selectedEmpIds);
      }

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

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('employees').insert([{
        employee_id: `EMP-${newEmp.employee_code}`,
        employee_code: newEmp.employee_code,
        employee_name: newEmp.employee_name,
        national_id: newEmp.national_id,
        department: newEmp.department,
        company: newEmp.company,
        job_title: newEmp.job_title,
        hiring_date: newEmp.hiring_date ? newEmp.hiring_date : null,
        contract_type: newEmp.contract_type,
        contract_end_date: (newEmp.contract_type === 'دائم' || !newEmp.contract_end_date) ? null : newEmp.contract_end_date,
        status: newEmp.status,
        email: newEmp.email,
        mobile: newEmp.mobile
      }]);

      if (error) throw error;

      alert('تم إضافة الموظف بنجاح ✅');
      setShowAddModal(false);
      setNewEmp({
        employee_code: '', employee_name: '', national_id: '',
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
      ? finalTableEmployees.filter(e => selectedEmpIds.includes(e.id || e.employee_id))
      : finalTableEmployees;

    const exportData = listToExport.map(e => ({
      'employee_code': getField(e, 'employee_code', 'EmployeeCode'),
      'employee_name': getField(e, 'employee_name', 'ArabicName'),
      'job_title': getField(e, 'job_title', 'JobTitle'),
      'department': getField(e, 'department', 'Department'),
      'national_id': getField(e, 'national_id', 'NationalID'),
      'mobile': getField(e, 'mobile', 'Mobile'),
      'hiring_date': getField(e, 'hiring_date', 'HiringDate'),
      'contract_end_date': getField(e, 'contract_end_date', 'ContractEndDate'),
      'contract_type': getField(e, 'contract_type', 'ContractType'),
      'company': getField(e, 'company', 'Company')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الموظفين_النشطين');
    XLSX.writeFile(wb, `بيانات_الموظفين_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // 🌟 تعديل دالة عرض نهاية العقد لإظهار التاريخ الصريح أو الحالة بدقة
  const getContractStatusBadge = (contractType: string, endDateStr: string) => {
    if (endDateStr && endDateStr.trim() !== '') {
      const end = new Date(endDateStr);
      const today = new Date();
      const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));

      if (days < 0) {
        return <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>{endDateStr} 🚨</span>;
      }
      if (days <= 60) {
        return <span style={{ background: '#fef3c7', color: '#d97706', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>{endDateStr} ⏳</span>;
      }
      return <span style={{ background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>{endDateStr}</span>;
    }

    if (contractType === 'دائم') {
      return <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>عقد دائم 🛡️</span>;
    }

    return <span style={{ color: '#64748b' }}>—</span>;
  };

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-in-out' }}>
      
      {/* رأس الصفحة بدون زرار الرفع الأسبق */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950, #0f172a)', fontWeight: '800' }}>بيانات الموظفين النشطين</h3>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>إدارة وتتبع السجل الرئيسي المباشر للعمالة</p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            onClick={() => handleExportToExcel(false)}
            style={{ background: '#059669', color: '#fff', border: 0, padding: '7px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}
          >
            📥 تصدير Excel
          </button>

          <button 
            onClick={() => { setShowTermModal(true); setSelectedTermEmp(null); setTermSearch(''); }} 
            style={{ background: '#ef4444', color: '#fff', border: 0, padding: '7px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            🚫 Terminated
          </button>

          <button onClick={() => setShowAddModal(true)} style={{ background: 'var(--brass-600, #0d9488)', color: '#fff', border: 0, padding: '7px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
            + إضافة موظف
          </button>
        </div>
      </div>

      {/* الكروت الأربعة */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        <div 
          className="db-card" 
          onClick={() => setActiveCardFilter(activeCardFilter === 'ALL_ACTIVE' ? null : 'ALL_ACTIVE')}
          style={{ 
            background: activeCardFilter === 'ALL_ACTIVE' ? '#f0fdf4' : 'var(--paper-card)', 
            border: activeCardFilter === 'ALL_ACTIVE' ? '2px solid #22c55e' : '1px solid var(--line, #e2e8f0)', 
            padding: '12px 16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' 
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold', marginBottom: '2px' }}>إجمالي النشطين (Active)</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#16a34a' }}>{kpiStats.total.toLocaleString('en-US')}</div>
            <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#16a34a', marginTop: '2px' }}>100% من القوة المفلترة</div>
          </div>
          <div style={{ background: '#dcfce7', color: '#16a34a', width: '36px', height: '36px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '16px' }}>🟢</div>
        </div>

        <div 
          className="db-card" 
          onClick={() => setActiveCardFilter(activeCardFilter === 'PERM' ? null : 'PERM')}
          style={{ 
            background: activeCardFilter === 'PERM' ? '#f0fdf4' : 'var(--paper-card)', 
            border: activeCardFilter === 'PERM' ? '2px solid #16a34a' : '1px solid var(--line, #e2e8f0)', 
            padding: '12px 16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' 
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold', marginBottom: '2px' }}>عقود دائمة</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#15803d' }}>{kpiStats.perm.toLocaleString('en-US')}</div>
            <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#15803d', marginTop: '2px' }}>{kpiStats.permPct}% من القوة الحالية</div>
          </div>
          <div style={{ background: '#dcfce7', color: '#15803d', width: '36px', height: '36px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '16px' }}>🛡️</div>
        </div>

        <div 
          className="db-card" 
          onClick={() => setActiveCardFilter(activeCardFilter === 'FIXED' ? null : 'FIXED')}
          style={{ 
            background: activeCardFilter === 'FIXED' ? '#eff6ff' : 'var(--paper-card)', 
            border: activeCardFilter === 'FIXED' ? '2px solid #2563eb' : '1px solid var(--line, #e2e8f0)', 
            padding: '12px 16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' 
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold', marginBottom: '2px' }}>عقود محددة المدة</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#2563eb' }}>{kpiStats.fixed.toLocaleString('en-US')}</div>
            <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#2563eb', marginTop: '2px' }}>{kpiStats.fixedPct}% من القوة الحالية</div>
          </div>
          <div style={{ background: '#eff6ff', color: '#2563eb', width: '36px', height: '36px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '16px' }}>📂</div>
        </div>

        <div 
          className="db-card" 
          onClick={() => setActiveCardFilter(activeCardFilter === 'ABOVE_AGE' ? null : 'ABOVE_AGE')}
          style={{ 
            background: activeCardFilter === 'ABOVE_AGE' ? '#fef3c7' : 'var(--paper-card)', 
            border: activeCardFilter === 'ABOVE_AGE' ? '2px solid #d97706' : '1px solid var(--line, #e2e8f0)', 
            padding: '12px 16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' 
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold', marginBottom: '2px' }}>عقود فوق السن</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#d97706' }}>{kpiStats.aboveAge.toLocaleString('en-US')}</div>
            <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#d97706', marginTop: '2px' }}>{kpiStats.aboveAgePct}% من القوة الحالية</div>
          </div>
          <div style={{ background: '#fef3c7', color: '#d97706', width: '36px', height: '36px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '16px' }}>💼</div>
        </div>
      </div>

      {/* إجراءات النقل والتصدير المجمع */}
      {selectedEmpIds.length > 0 && (
        <div style={{ background: '#0f172a', color: '#fff', padding: '10px 16px', borderRadius: '10px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: 'fadeIn 0.2s' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold' }}>
            تم تحديد <span style={{ color: '#38bdf8' }}>{selectedEmpIds.length}</span> موظف
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowBulkTransferModal(true)} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
              نقل مجمع 🔄
            </button>
            <button onClick={() => handleExportToExcel(true)} style={{ background: '#16a34a', color: '#fff', border: 0, padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
              تصدير المحدد 📥
            </button>
            <button onClick={() => setSelectedEmpIds([])} style={{ background: 'transparent', border: '1px solid #475569', color: '#94a3b8', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
              إلغاء ✕
            </button>
          </div>
        </div>
      )}

      {/* الفلاتر والبحث في الصفحة */}
      <div className="db-card" style={{ background: 'var(--paper-card)', border: '1px solid var(--line, #e2e8f0)', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="بحث بالاسم، الكود، الإدارة..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="db-input" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none', minWidth: '220px', background: 'transparent', color: 'var(--ink, #0f172a)' }} />
        
        <input list="deptList" placeholder="الإدارة..." value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="db-input" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none', width: '140px', background: 'transparent', color: 'var(--ink, #0f172a)' }} />
        <datalist id="deptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>
        
        <input list="compList" placeholder="الشركة..." value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} className="db-input" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none', width: '140px', background: 'transparent', color: 'var(--ink, #0f172a)' }} />
        <datalist id="compList">{compsList.map((c: any, i) => <option key={i} value={c} />)}</datalist>

        <select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="db-input" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none', background: 'transparent', color: 'var(--ink, #0f172a)' }}>
          <option value="">كل أنواع العقود</option>
          {typesList.map((t: any, i) => <option key={i} value={t}>{t}</option>)}
        </select>

        <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedCompany(''); setSelectedType(''); setActiveCardFilter('ALL_ACTIVE'); }} style={{ background: 'var(--line, #e2e8f0)', color: 'var(--ink, #0f172a)', border: 0, padding: '8px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>
        
        <div style={{ flex: 1, textAlign: 'left', fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>
          النتائج بالجدول: <span style={{ color: 'var(--navy-950, #0f172a)' }}>{finalTableEmployees.length.toLocaleString('en-US')}</span> موظف
        </div>
      </div>

      {/* الجدول الرئيسي للموظفين */}
      <div className="db-card" style={{ background: 'var(--paper-card)', border: '1px solid var(--line, #e2e8f0)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: 'var(--muted, #64748b)' }}>جاري سحب بيانات الموظفين... ⏳</div>
        ) : (
          <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--paper-card)', zIndex: 10 }}>
                <tr>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--line)', textAlign: 'center', width: '40px' }}>
                    <input type="checkbox" checked={selectedEmpIds.length === finalTableEmployees.length && finalTableEmployees.length > 0} onChange={e => setSelectedEmpIds(e.target.checked ? finalTableEmployees.map(emp => emp.id || emp.employee_id) : [])} style={{ accentColor: 'var(--brass-600)' }} />
                  </th>
                  <th onClick={() => handleSort('employee_code')} style={{ padding: '12px', color: 'var(--muted)', borderBottom: '1px solid var(--line)', cursor: 'pointer', userSelect: 'none' }}>
                    الكود {renderSortArrow('employee_code')}
                  </th>
                  <th onClick={() => handleSort('employee_name')} style={{ padding: '12px', color: 'var(--muted)', borderBottom: '1px solid var(--line)', cursor: 'pointer', userSelect: 'none' }}>
                    الاسم {renderSortArrow('employee_name')}
                  </th>
                  <th onClick={() => handleSort('job_title')} style={{ padding: '12px', color: 'var(--muted)', borderBottom: '1px solid var(--line)', cursor: 'pointer', userSelect: 'none' }}>
                    الوظيفة {renderSortArrow('job_title')}
                  </th>
                  <th onClick={() => handleSort('department')} style={{ padding: '12px', color: 'var(--muted)', borderBottom: '1px solid var(--line)', cursor: 'pointer', userSelect: 'none' }}>
                    الإدارة {renderSortArrow('department')}
                  </th>
                  <th onClick={() => handleSort('hiring_date')} style={{ padding: '12px', color: 'var(--muted)', borderBottom: '1px solid var(--line)', cursor: 'pointer', userSelect: 'none' }}>
                    تاريخ التعيين {renderSortArrow('hiring_date')}
                  </th>
                  <th onClick={() => handleSort('contract_type')} style={{ padding: '12px', color: 'var(--muted)', borderBottom: '1px solid var(--line)', cursor: 'pointer', userSelect: 'none' }}>
                    نوع العقد {renderSortArrow('contract_type')}
                  </th>
                  <th onClick={() => handleSort('contract_end_date')} style={{ padding: '12px', color: 'var(--muted)', borderBottom: '1px solid var(--line)', cursor: 'pointer', userSelect: 'none' }}>
                    نهاية العقد {renderSortArrow('contract_end_date')}
                  </th>
                  <th style={{ padding: '12px', color: 'var(--muted)', borderBottom: '1px solid var(--line)', textAlign: 'center' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {finalTableEmployees.map((emp, i) => {
                  const empId = emp.id || emp.employee_id;
                  const nationalId = getField(emp, 'national_id', 'NationalID');
                  const mobile = getField(emp, 'mobile', 'Mobile');
                  const isMissingData = !nationalId || !mobile;
                  const cType = getField(emp, 'contract_type', 'ContractType');
                  const endDate = getField(emp, 'contract_end_date', 'ContractEndDate');

                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line, #f1f5f9)' }}>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <input type="checkbox" checked={selectedEmpIds.includes(empId)} onChange={e => setSelectedEmpIds(e.target.checked ? [...selectedEmpIds, empId] : selectedEmpIds.filter(id => id !== empId))} style={{ accentColor: 'var(--brass-600)' }} />
                      </td>
                      <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--brass-600, #0d9488)' }}>
                        {getField(emp, 'employee_code', 'EmployeeCode')}
                      </td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--ink, #0f172a)' }}>
                        {getField(emp, 'employee_name', 'ArabicName')}
                        {isMissingData && (
                          <span title="بيانات غير مكتملة (ناقص الرقم القومي أو الموبايل)" style={{ marginRight: '6px', fontSize: '11px', cursor: 'help' }}>⚠️</span>
                        )}
                      </td>
                      <td style={{ padding: '10px', color: 'var(--muted, #64748b)', fontWeight: '500' }}>{getField(emp, 'job_title', 'JobTitle') || '—'}</td>
                      <td style={{ padding: '10px', color: 'var(--muted, #64748b)', fontWeight: '500' }}>{getField(emp, 'department', 'Department') || '—'}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', color: 'var(--ink, #0f172a)' }}>{getField(emp, 'hiring_date', 'HiringDate') || '—'}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>{cType || '—'}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold' }}>
                        {getContractStatusBadge(cType, endDate)}
                      </td>

                      <td style={{ padding: '10px', textAlign: 'center', display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button onClick={() => setProfileEmp(emp)} style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>👁️ الملف</button>
                        <button onClick={() => handleOpenEdit(emp)} style={{ background: 'transparent', color: 'var(--ink, #0f172a)', border: '1px solid var(--line, #e2e8f0)', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>تعديل ✏️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 👤 نافذة عرض الملف الشامل */}
      {profileEmp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '600px', background: 'var(--paper-card, #fff)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>👤 الملف الوظيفي الشامل</h3>
              <button onClick={() => setProfileEmp(null)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}><strong>الكود:</strong> {getField(profileEmp, 'employee_code', 'EmployeeCode')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}><strong>الاسم:</strong> {getField(profileEmp, 'employee_name', 'ArabicName')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}><strong>الرقم القومي:</strong> {getField(profileEmp, 'national_id', 'NationalID') || 'غير مسجل'}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}><strong>الإدارة:</strong> {getField(profileEmp, 'department', 'Department')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}><strong>الشركة:</strong> {getField(profileEmp, 'company', 'Company')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}><strong>الوظيفة:</strong> {getField(profileEmp, 'job_title', 'JobTitle')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}><strong>تاريخ التعيين:</strong> {getField(profileEmp, 'hiring_date', 'HiringDate')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}><strong>نوع العقد:</strong> {getField(profileEmp, 'contract_type', 'ContractType')}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}><strong>نهاية العقد:</strong> {getField(profileEmp, 'contract_end_date', 'ContractEndDate') || '—'}</div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}><strong>الموبايل:</strong> {getField(profileEmp, 'mobile', 'Mobile') || 'غير مسجل'}</div>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'left' }}>
              <button onClick={() => { handleOpenEdit(profileEmp); setProfileEmp(null); }} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>تعديل البيانات ✏️</button>
            </div>
          </div>
        </div>
      )}

      {/* 🚫 نافذة تحويل الموظف لـ (تحويلات تحت الاعتماد) */}
      {showTermModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '550px', background: 'var(--paper-card, #fff)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#dc2626', fontWeight: '800' }}>🚫 إنهاء خدمة / تحويل للانتظار</h3>
              <button onClick={() => { setShowTermModal(false); setSelectedTermEmp(null); }} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <form onSubmit={handleConfirmTermination} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>البحث السريع عن الموظف (اكتب كود أو اسم الموظف):</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text"
                    placeholder="اكتب كود الموظف، اسمه، أو إدارته..."
                    value={termSearch}
                    onChange={e => { setTermSearch(e.target.value); setSelectedTermEmp(null); }}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                  />

                  {termSearchResults.length > 0 && !selectedTermEmp && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto', zIndex: 100, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
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
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: '8px', fontSize: '11.5px', color: '#991b1b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>الموظف المحدّد:</strong> {getField(selectedTermEmp, 'employee_name', 'ArabicName')} (كود: {getField(selectedTermEmp, 'employee_code', 'EmployeeCode')})
                  </div>
                  <button type="button" onClick={() => { setSelectedTermEmp(null); setTermSearch(''); }} style={{ background: 'transparent', border: 0, color: '#dc2626', cursor: 'pointer', fontWeight: 'bold' }}>تغيير ✕</button>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>سبب إنهاء الخدمة / التحويل:</label>
                <select 
                  value={termReason}
                  onChange={e => setTermReason(e.target.value)}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}
                >
                  <option value="استقالة">استقالة</option>
                  <option value="إنتهاء عقد">إنتهاء عقد</option>
                  <option value="إنهاء خدمات">إنهاء خدمات</option>
                  <option value="بلوغ سن">بلوغ سن (تقاعد)</option>
                  <option value="انقطاع عن العمل">انقطاع عن العمل</option>
                  <option value="انتهاء خدمات">انتهاء خدمات</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>تاريخ إجراء العمل:</label>
                <input 
                  type="date"
                  required
                  value={termDate}
                  onChange={e => setTermDate(e.target.value)}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowTermModal(false)} style={{ background: 'transparent', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '500px', background: 'var(--paper-card, #fff)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#2563eb', fontWeight: '800' }}>🔄 النقل المجمع للموظفين المحددين</h3>
              <button onClick={() => setShowBulkTransferModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
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
                <button type="button" onClick={() => setShowBulkTransferModal(false)} style={{ background: 'transparent', border: '1px solid #e2e8f0', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={bulkSaving} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: bulkSaving ? 'not-allowed' : 'pointer' }}>
                  {bulkSaving ? 'جاري التحديث...' : 'تأكيد النقل المجمع 🔄'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✏️ نافذة التعديل الفردي الشامل مع حماية التواريخ */}
      {editData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '800px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--paper-card)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950, #0f172a)' }}>تعديل بيانات الموظف (شامل)</h3>
              <button onClick={() => setEditData(null)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            {editData.loading ? (
              <div style={{ padding: '40px', textAlign: 'center', fontWeight: 'bold', color: 'var(--muted, #64748b)' }}>جاري سحب البيانات المرتبطة...</div>
            ) : (
              <form onSubmit={handleSaveEdit}>
                <div style={{ background: 'var(--paper, #f8fafc)', padding: '16px', borderRadius: '12px', border: '1px solid var(--line, #e2e8f0)', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--brass-600, #0d9488)', borderBottom: '1px solid var(--line, #e2e8f0)', paddingBottom: '8px' }}>بيانات السجل الأساسي (Employees)</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    {[
                      { label: 'الكود', key1: 'employee_code', key2: 'EmployeeCode' },
                      { label: 'الاسم العربي', key1: 'employee_name', key2: 'ArabicName' },
                      { label: 'الرقم القومي', key1: 'national_id', key2: 'NationalID' },
                      { label: 'الإدارة', key1: 'department', key2: 'Department' },
                      { label: 'الشركة', key1: 'company', key2: 'Company' },
                      { label: 'الوظيفة', key1: 'job_title', key2: 'JobTitle' },
                      { label: 'الموبايل', key1: 'mobile', key2: 'Mobile' },
                    ].map(field => (
                      <div key={field.label}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted, #64748b)', marginBottom: '6px', fontWeight: 'bold' }}>{field.label}</label>
                        <input type="text" className="db-input" value={getField(editData.emp, field.key1, field.key2)} onChange={e => setEditData({ ...editData, emp: { ...editData.emp, [field.key1]: e.target.value, [field.key2]: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--line, #e2e8f0)', fontSize: '12px', outline: 'none', background: 'transparent', color: 'var(--ink, #0f172a)' }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: 'var(--paper, #f8fafc)', padding: '16px', borderRadius: '12px', border: '1px solid var(--line, #e2e8f0)', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: '#2563eb', borderBottom: '1px solid var(--line, #e2e8f0)', paddingBottom: '8px' }}>بيانات التعاقد والتجديد (Contracts & Renewals)</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted, #64748b)', marginBottom: '6px', fontWeight: 'bold' }}>تاريخ التعيين</label>
                      <input type="date" className="db-input" value={getField(editData.emp, 'hiring_date', 'HiringDate')} onChange={e => setEditData({ ...editData, emp: { ...editData.emp, hiring_date: e.target.value, HiringDate: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--line, #e2e8f0)', fontSize: '12px', outline: 'none', background: 'transparent', color: 'var(--ink, #0f172a)' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted, #64748b)', marginBottom: '6px', fontWeight: 'bold' }}>نوع العقد</label>
                      <select className="db-input" value={getField(editData.emp, 'contract_type', 'ContractType')} onChange={e => setEditData({ ...editData, emp: { ...editData.emp, contract_type: e.target.value, ContractType: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--line, #e2e8f0)', fontSize: '12px', outline: 'none', background: 'transparent', color: 'var(--ink, #0f172a)' }}>
                        <option value="دائم">دائم</option><option value="محدد المدة">محدد المدة</option><option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted, #64748b)', marginBottom: '6px', fontWeight: 'bold' }}>تاريخ نهاية العقد</label>
                      <input type="date" className="db-input" value={getField(editData.emp, 'contract_end_date', 'ContractEndDate')} onChange={e => setEditData({ ...editData, emp: { ...editData.emp, contract_end_date: e.target.value, ContractEndDate: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--line, #e2e8f0)', fontSize: '12px', outline: 'none', background: 'transparent', color: 'var(--ink, #0f172a)' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted, #64748b)', marginBottom: '6px', fontWeight: 'bold' }}>حالة الموظف (Status)</label>
                      <select className="db-input" value={getField(editData.emp, 'status', 'Status')} onChange={e => setEditData({ ...editData, emp: { ...editData.emp, status: e.target.value, Status: e.target.value } })} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--line, #e2e8f0)', fontSize: '12px', outline: 'none', background: 'transparent', color: 'var(--ink, #0f172a)' }}>
                        <option value="Active">Active (نشط)</option><option value="Inactive">Inactive (منتهي الخدمة)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                  <button type="button" onClick={() => setEditData(null)} style={{ background: 'transparent', color: 'var(--ink, #0f172a)', border: '1px solid var(--line, #e2e8f0)', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                  <button type="submit" disabled={editData.saving} style={{ background: editData.saving ? 'var(--muted, #64748b)' : 'var(--brass-600, #0d9488)', color: '#fff', border: 0, padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: editData.saving ? 'not-allowed' : 'pointer', opacity: editData.saving ? 0.7 : 1 }}>
                    {editData.saving ? 'جاري الحفظ...' : 'حفظ كافة التعديلات'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ➕ نافذة الإضافة المباشرة */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '650px', background: 'var(--paper-card)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950, #0f172a)' }}>إضافة موظف جديد</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            
            <form onSubmit={handleAddEmployee}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div><label style={{ display:'block', fontSize:'11px', color:'var(--muted, #64748b)', marginBottom:'6px', fontWeight:'bold' }}>كود الموظف *</label><input required value={newEmp.employee_code} onChange={e=>setNewEmp({...newEmp, employee_code: e.target.value})} className="db-input" style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid var(--line, #e2e8f0)', fontSize:'12px', outline:'none', background:'transparent', color:'var(--ink)' }} /></div>
                <div><label style={{ display:'block', fontSize:'11px', color:'var(--muted, #64748b)', marginBottom:'6px', fontWeight:'bold' }}>الاسم *</label><input required value={newEmp.employee_name} onChange={e=>setNewEmp({...newEmp, employee_name: e.target.value})} className="db-input" style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid var(--line, #e2e8f0)', fontSize:'12px', outline:'none', background:'transparent', color:'var(--ink)' }} /></div>
                <div><label style={{ display:'block', fontSize:'11px', color:'var(--muted, #64748b)', marginBottom:'6px', fontWeight:'bold' }}>الرقم القومي</label><input value={newEmp.national_id} onChange={e=>setNewEmp({...newEmp, national_id: e.target.value})} className="db-input" style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid var(--line, #e2e8f0)', fontSize:'12px', outline:'none', background:'transparent', color:'var(--ink)' }} /></div>
                <div><label style={{ display:'block', fontSize:'11px', color:'var(--muted, #64748b)', marginBottom:'6px', fontWeight:'bold' }}>الإدارة</label><input value={newEmp.department} onChange={e=>setNewEmp({...newEmp, department: e.target.value})} className="db-input" style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid var(--line, #e2e8f0)', fontSize:'12px', outline:'none', background:'transparent', color:'var(--ink)' }} /></div>
                <div><label style={{ display:'block', fontSize:'11px', color:'var(--muted, #64748b)', marginBottom:'6px', fontWeight:'bold' }}>الشركة</label><input value={newEmp.company} onChange={e=>setNewEmp({...newEmp, company: e.target.value})} className="db-input" style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid var(--line, #e2e8f0)', fontSize:'12px', outline:'none', background:'transparent', color:'var(--ink)' }} /></div>
                <div><label style={{ display:'block', fontSize:'11px', color:'var(--muted, #64748b)', marginBottom:'6px', fontWeight:'bold' }}>الوظيفة</label><input value={newEmp.job_title} onChange={e=>setNewEmp({...newEmp, job_title: e.target.value})} className="db-input" style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid var(--line, #e2e8f0)', fontSize:'12px', outline:'none', background:'transparent', color:'var(--ink)' }} /></div>
                <div><label style={{ display:'block', fontSize:'11px', color:'var(--muted, #64748b)', marginBottom:'6px', fontWeight:'bold' }}>تاريخ التعيين</label><input type="date" value={newEmp.hiring_date} onChange={e=>setNewEmp({...newEmp, hiring_date: e.target.value})} className="db-input" style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid var(--line, #e2e8f0)', fontSize:'12px', outline:'none', background:'transparent', color:'var(--ink)' }} /></div>
                <div>
                  <label style={{ display:'block', fontSize:'11px', color:'var(--muted, #64748b)', marginBottom:'6px', fontWeight:'bold' }}>نوع العقد</label>
                  <select value={newEmp.contract_type} onChange={e=>setNewEmp({...newEmp, contract_type: e.target.value})} className="db-input" style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid var(--line, #e2e8f0)', fontSize:'12px', outline:'none', background:'transparent', color:'var(--ink)' }}>
                    <option value="دائم">دائم</option><option value="محدد المدة">محدد المدة</option><option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                  </select>
                </div>
                <div><label style={{ display:'block', fontSize:'11px', color:'var(--muted, #64748b)', marginBottom:'6px', fontWeight:'bold' }}>الموبايل</label><input type="text" value={newEmp.mobile} onChange={e=>setNewEmp({...newEmp, mobile: e.target.value})} className="db-input" style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid var(--line, #e2e8f0)', fontSize:'12px', outline:'none', background:'transparent', color:'var(--ink)' }} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ background: 'transparent', color: 'var(--ink, #0f172a)', border: '1px solid var(--line, #e2e8f0)', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" style={{ background: 'var(--brass-600, #0d9488)', color: '#fff', border: 0, padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إضافة الموظف</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
