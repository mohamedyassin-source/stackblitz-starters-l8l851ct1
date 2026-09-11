'use client';

import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// تهيئة الاتصال بـ Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const getField = (obj: any, ...keys: string[]) => {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
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

  // 🌟 الربط المحسن والأنسب مع جدول العقود contracts
  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const [empRes, contRes] = await Promise.all([
        supabase.from('employees').select('*'),
        supabase.from('contracts').select('*')
      ]);

      if (empRes.error) throw empRes.error;

      // إنشاء خريطة (Map) لجدول العقود برقم الموظف لسرعة وتأكيد المطابقة
      const contractsMap = new Map<string, any[]>();
      (contRes.data || []).forEach(c => {
        const code = String(c.employee_code).trim();
        if (!contractsMap.has(code)) contractsMap.set(code, []);
        contractsMap.get(code)?.push(c);
      });

      // دمج بيانات العقد الأحدث لكل موظف
      const mergedEmployees = (empRes.data || []).map(emp => {
        const empCode = String(emp.employee_code).trim();
        const empContracts = contractsMap.get(empCode) || [];

        // ترتيب العقود من الأحدث للأقدم
        empContracts.sort((a, b) => new Date(b.created_at || b.contract_start_date || 0).getTime() - new Date(a.created_at || a.contract_start_date || 0).getTime());
        
        const activeContract = empContracts[0] || {};
        
        return {
          ...emp,
          contract_type: activeContract.contract_type || emp.contract_type || 'محدد المدة',
          contract_start_date: activeContract.contract_start_date || emp.hiring_date,
          contract_end_date: activeContract.contract_end_date || null,
          contract_status: activeContract.status || emp.status || 'Active',
          contract_id: activeContract.contract_id || null,
        };
      });

      setEmployees(mergedEmployees);
    } catch (e) {
      console.error('Failed to fetch employees from Supabase', e);
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

  const handleSort = (column: string) => {
    if (sortColumn === column) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(column); setSortDirection('asc'); }
  };

  const renderSortArrow = (column: string) => {
    if (sortColumn !== column) return <span style={{ opacity: 0.3, marginRight: '4px' }}>↕</span>;
    return <span style={{ marginRight: '4px', color: '#0d9488' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>;
  };

  const handleOpenEdit = (emp: any) => setEditData({ emp: { ...emp }, loading: false, saving: false });

  // 🌟 حفظ التعديلات المباشرة في جدولين الموظفين والعقود
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;
    setEditData({ ...editData, saving: true });

    try {
      const empData = editData.emp;
      const code = parseInt(getEmployeeCode(empData));
      const contractType = getField(empData, 'contract_type', 'ContractType');
      const contractEndDate = getField(empData, 'contract_end_date', 'ContractEndDate') || null;

      // 1. تحديث بيانات الموظف
      const { error: empError } = await supabase.from('employees').update({
        employee_name: getEmployeeName(empData),
        national_id: getNationalId(empData),
        birth_date: getField(empData, 'birth_date', 'BirthDate') || null,
        department: getField(empData, 'department', 'Department'),
        company: getField(empData, 'company', 'Company'),
        job_title: getField(empData, 'job_title', 'JobTitle'),
        hiring_date: getField(empData, 'hiring_date', 'HiringDate') || null,
        email: getField(empData, 'email', 'Email'),
        mobile: getField(empData, 'mobile', 'Mobile'),
        status: getField(empData, 'status', 'Status'),
      }).eq('employee_code', code);

      if (empError) throw empError;

      // 2. تحديث أو إدخال العقد في جدول contracts
      if (empData.contract_id) {
        await supabase.from('contracts').update({
          contract_type: contractType,
          contract_end_date: contractEndDate,
          status: getField(empData, 'status', 'Status'),
        }).eq('contract_id', empData.contract_id);
      } else {
        await supabase.from('contracts').insert([{
          employee_code: code,
          contract_type: contractType,
          contract_end_date: contractEndDate,
          status: 'Active'
        }]);
      }

      alert('تم حفظ التعديلات بنجاح ✅');
      setEditData(null);
      fetchEmployees();
    } catch (error: any) {
      alert('حدث خطأ أثناء الحفظ: ' + error.message);
    } finally {
      setEditData((prev: any) => prev ? { ...prev, saving: false } : null);
    }
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
    if (age === 59) return <span style={{ background: '#ffedd5', color: '#ea580c', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>⏳ {age} سنة</span>;
    return <span style={{ background: '#f8fafc', color: '#0f172a', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>{age} سنة</span>;
  };

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900', letterSpacing: '-0.3px' }}>👥 بيانات القوة البشرية (HR - Supabase)</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>إدارة وتتبع السجل الرئيسي للموظفين عبر قاعدة بيانات Supabase</p>
        </div>
      </div>

      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>جاري تحميل وربط بيانات العقود والموظفين من Supabase... ⏳</div>
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
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{getField(emp, 'contract_type', 'ContractType') || '—'}</td>
                      <td style={{ padding: '10px' }}>{getContractStatusBadge(getField(emp, 'contract_type', 'ContractType'), getField(emp, 'contract_end_date', 'ContractEndDate'))}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button onClick={() => handleOpenEdit(emp)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>تعديل ✏️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
