'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // حالات الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedType, setSelectedType] = useState('');

  // 🌟 حالات الترتيب (Sorting)
  const [sortColumn, setSortColumn] = useState<string>('employee_code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // التحديد المجمع (Checkboxes)
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  // النوافذ المنبثقة
  const [showAddModal, setShowAddModal] = useState(false);
  const [editData, setEditData] = useState<any>(null);

  // حالة الموظف الجديد
  const [newEmp, setNewEmp] = useState({
    employee_code: '', employee_name: '', english_name: '', national_id: '',
    department: '', company: '', job_title: '', hiring_date: '',
    contract_type: 'محدد المدة', contract_end_date: '', status: 'Active', email: '', phone: ''
  });

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    let allEmps: any[] = [];
    let from = 0;
    const step = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .range(from, from + step - 1);

      if (error) {
        alert("حدث خطأ أثناء سحب بيانات الموظفين: " + error.message);
        break;
      }

      if (!data || data.length === 0) break;
      allEmps = [...allEmps, ...data];
      if (data.length < step) break;
      from += step;
    }

    setEmployees(allEmps);
    setLoading(false);
  };

  const getField = (obj: any, ...keys: string[]) => {
    if (!obj) return '';
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return '';
  };

  // القوائم للفلاتر
  const deptsList = Array.from(new Set(employees.map(e => getField(e, 'department', 'Department')).filter(Boolean)));
  const compsList = Array.from(new Set(employees.map(e => getField(e, 'company', 'Company')).filter(Boolean)));
  const typesList = Array.from(new Set(employees.map(e => getField(e, 'contract_type', 'ContractType')).filter(Boolean)));

  // 🌟 دالة تغيير الترتيب عند الضغط على أغطية الأعمدة
  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  // الفلترة والترتيب التفاعلي
  const sortedAndFilteredEmployees = useMemo(() => {
    // 1. الفلترة
    const filtered = employees.filter(emp => {
      const term = searchTerm.toLowerCase();
      const empCode = String(getField(emp, 'employee_code', 'EmployeeCode')).toLowerCase();
      const empName = String(getField(emp, 'employee_name', 'ArabicName')).toLowerCase();
      const empDept = String(getField(emp, 'department', 'Department')).toLowerCase();
      const empComp = String(getField(emp, 'company', 'Company')).toLowerCase();
      
      const matchesSearch = !term || empCode.includes(term) || empName.includes(term) || empDept.includes(term);
      const matchesDept = !selectedDept || empDept.includes(selectedDept.toLowerCase());
      const matchesComp = !selectedCompany || empComp.includes(selectedCompany.toLowerCase());
      const matchesType = !selectedType || getField(emp, 'contract_type', 'ContractType') === selectedType;

      return matchesSearch && matchesDept && matchesComp && matchesType;
    });

    // 2. الترتيب الديناميكي (Ascending / Descending)
    return filtered.sort((a, b) => {
      let valA = '';
      let valB = '';

      switch (sortColumn) {
        case 'employee_code':
          valA = String(getField(a, 'employee_code', 'EmployeeCode'));
          valB = String(getField(b, 'employee_code', 'EmployeeCode'));
          break;
        case 'employee_name':
          valA = String(getField(a, 'employee_name', 'ArabicName'));
          valB = String(getField(b, 'employee_name', 'ArabicName'));
          break;
        case 'job_title':
          valA = String(getField(a, 'job_title', 'JobTitle'));
          valB = String(getField(b, 'job_title', 'JobTitle'));
          break;
        case 'department':
          valA = String(getField(a, 'department', 'Department'));
          valB = String(getField(b, 'department', 'Department'));
          break;
        case 'hiring_date':
          valA = String(getField(a, 'hiring_date', 'HiringDate'));
          valB = String(getField(b, 'hiring_date', 'HiringDate'));
          break;
        case 'contract_type':
          valA = String(getField(a, 'contract_type', 'ContractType'));
          valB = String(getField(b, 'contract_type', 'ContractType'));
          break;
        case 'contract_end_date':
          valA = String(getField(a, 'contract_end_date', 'ContractEndDate'));
          valB = String(getField(b, 'contract_end_date', 'ContractEndDate'));
          break;
        default:
          valA = String(getField(a, 'employee_code', 'EmployeeCode'));
          valB = String(getField(b, 'employee_code', 'EmployeeCode'));
      }

      const res = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? res : -res;
    });
  }, [employees, searchTerm, selectedDept, selectedCompany, selectedType, sortColumn, sortDirection]);

  const permCount = sortedAndFilteredEmployees.filter(e => getField(e, 'contract_type', 'ContractType') === 'دائم').length;
  const fixedCount = sortedAndFilteredEmployees.filter(e => getField(e, 'contract_type', 'ContractType') === 'محدد المدة').length;
  const aboveAgeCount = sortedAndFilteredEmployees.filter(e => String(getField(e, 'contract_type', 'ContractType')).includes('فوق السن')).length;

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
    
    try {
      const empId = editData.emp.id || editData.emp.employee_id;
      await supabase.from('employees').update({
        employee_code: getField(editData.emp, 'employee_code', 'EmployeeCode'),
        employee_name: getField(editData.emp, 'employee_name', 'ArabicName'),
        english_name: getField(editData.emp, 'english_name', 'EnglishName'),
        national_id: getField(editData.emp, 'national_id', 'NationalID'),
        department: getField(editData.emp, 'department', 'Department'),
        company: getField(editData.emp, 'company', 'Company'),
        job_title: getField(editData.emp, 'job_title', 'JobTitle'),
        hiring_date: getField(editData.emp, 'hiring_date', 'HiringDate'),
        contract_type: getField(editData.emp, 'contract_type', 'ContractType'),
        contract_end_date: getField(editData.emp, 'contract_end_date', 'ContractEndDate'),
        status: getField(editData.emp, 'status', 'Status'),
        email: getField(editData.emp, 'email', 'Email'),
        phone: getField(editData.emp, 'phone', 'Mobile')
      }).eq(editData.emp.id ? 'id' : 'employee_id', empId);

      if (editData.renewal && editData.renewal.id) {
        await supabase.from('renewal_requests').update({
          department: getField(editData.emp, 'department', 'Department'),
          company: getField(editData.emp, 'company', 'Company'),
          contract_end_date: getField(editData.emp, 'contract_end_date', 'ContractEndDate')
        }).eq('id', editData.renewal.id);
      }

      alert('تم حفظ التعديلات بنجاح ✅');
      setEditData(null);
      fetchEmployees();
    } catch (err: any) {
      alert('حدث خطأ أثناء الحفظ: ' + err.message);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('employees').insert([{
      employee_id: `EMP-${newEmp.employee_code}`,
      employee_code: newEmp.employee_code,
      employee_name: newEmp.employee_name,
      english_name: newEmp.english_name,
      national_id: newEmp.national_id,
      department: newEmp.department,
      company: newEmp.company,
      job_title: newEmp.job_title,
      hiring_date: newEmp.hiring_date,
      contract_type: newEmp.contract_type,
      contract_end_date: newEmp.contract_type === 'دائم' ? null : newEmp.contract_end_date,
      status: newEmp.status,
      email: newEmp.email,
      phone: newEmp.phone
    }]);

    if (error) alert('خطأ أثناء الإضافة: ' + error.message);
    else {
      alert('تم إضافة الموظف بنجاح ✅');
      setShowAddModal(false);
      fetchEmployees();
    }
  };

  const renderSortArrow = (colKey: string) => {
    if (sortColumn !== colKey) return <span style={{ opacity: 0.3, marginRight: '4px' }}>↕</span>;
    return sortDirection === 'asc' ? <span style={{ color: 'var(--brass-600)', marginRight: '4px' }}>▲</span> : <span style={{ color: 'var(--brass-600)', marginRight: '4px' }}>▼</span>;
  };

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-in-out' }}>
      
      {/* العنوان وزرار الإضافة */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950, #0f172a)', fontWeight: '800' }}>بيانات الموظفين</h3>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>إدارة السجل الرئيسي للموظفين</p>
        </div>
        <button onClick={() => setShowAddModal(true)} style={{ background: 'var(--brass-600, #b8934a)', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }}>
          + إضافة موظف
        </button>
      </div>

      {/* الكروت الثلاثة المتفاعلة */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <div className="db-card" style={{ background: 'var(--paper-card)', border: '1px solid var(--line, #e2e8f0)', padding: '16px 20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold', marginBottom: '4px' }}>عقود دائمة</div><div style={{ fontSize: '22px', fontWeight: '900', color: '#15803d' }}>{permCount.toLocaleString()}</div></div>
          <div style={{ background: '#dcfce7', color: '#15803d', width: '40px', height: '40px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '18px' }}>🛡️</div>
        </div>
        <div className="db-card" style={{ background: 'var(--paper-card)', border: '1px solid var(--line, #e2e8f0)', padding: '16px 20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold', marginBottom: '4px' }}>عقود محددة المدة</div><div style={{ fontSize: '22px', fontWeight: '900', color: '#2563eb' }}>{fixedCount.toLocaleString()}</div></div>
          <div style={{ background: '#eff6ff', color: '#2563eb', width: '40px', height: '40px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '18px' }}>📂</div>
        </div>
        <div className="db-card" style={{ background: 'var(--paper-card)', border: '1px solid var(--line, #e2e8f0)', padding: '16px 20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold', marginBottom: '4px' }}>عقود فوق السن</div><div style={{ fontSize: '22px', fontWeight: '900', color: '#d97706' }}>{aboveAgeCount.toLocaleString()}</div></div>
          <div style={{ background: '#fef3c7', color: '#d97706', width: '40px', height: '40px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '18px' }}>💼</div>
        </div>
      </div>

      {/* شريط الفلاتر الذكي */}
      <div className="db-card" style={{ background: 'var(--paper-card)', border: '1px solid var(--line, #e2e8f0)', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="بحث بالاسم، الكود، الإدارة..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="db-input" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none', minWidth: '220px', background: 'transparent', color: 'var(--ink, #0f172a)' }} />
        
        <input list="deptList" placeholder="الإدارة (اكتب للبحث)..." value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="db-input" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none', width: '160px', background: 'transparent', color: 'var(--ink, #0f172a)' }} />
        <datalist id="deptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>
        
        <input list="compList" placeholder="الشركة (اكتب للبحث)..." value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} className="db-input" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none', width: '160px', background: 'transparent', color: 'var(--ink, #0f172a)' }} />
        <datalist id="compList">{compsList.map((c: any, i) => <option key={i} value={c} />)}</datalist>

        <select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="db-input" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none', background: 'transparent', color: 'var(--ink, #0f172a)' }}>
          <option value="">كل أنواع العقود</option>
          {typesList.map((t: any, i) => <option key={i} value={t}>{t}</option>)}
        </select>

        <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedCompany(''); setSelectedType(''); }} style={{ background: 'var(--line, #e2e8f0)', color: 'var(--ink, #0f172a)', border: 0, padding: '8px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>
        
        <div style={{ flex: 1, textAlign: 'left', fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>
          النتائج: <span style={{ color: 'var(--navy-950, #0f172a)' }}>{sortedAndFilteredEmployees.length}</span> موظف
          {selectedEmpIds.length > 0 && <span style={{ color: 'var(--brass-600, #b8934a)', marginRight: '8px' }}>| محدد: {selectedEmpIds.length}</span>}
        </div>
      </div>

      {/* الجدول مع الترتيب التفاعلي قابلي للضغط على العناوين */}
      <div className="db-card" style={{ background: 'var(--paper-card)', border: '1px solid var(--line, #e2e8f0)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: 'var(--muted, #64748b)' }}>جاري سحب بيانات الموظفين... ⏳</div>
        ) : (
          <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--paper-card)', zIndex: 10 }}>
                <tr>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--line)', textAlign: 'center', width: '40px' }}>
                    <input type="checkbox" checked={selectedEmpIds.length === sortedAndFilteredEmployees.length && sortedAndFilteredEmployees.length > 0} onChange={e => setSelectedEmpIds(e.target.checked ? sortedAndFilteredEmployees.map(emp => emp.id || emp.employee_id) : [])} style={{ accentColor: 'var(--brass-600)' }} />
                  </th>
                  
                  {/* 🌟 رؤوس الأعمدة مع دعم ترتيب Asc/Desc */}
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
                  <th style={{ padding: '12px', color: 'var(--muted)', borderBottom: '1px solid var(--line)', textAlign: 'center' }}>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredEmployees.map((emp, i) => {
                  const empId = emp.id || emp.employee_id;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line, #f1f5f9)' }}>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <input type="checkbox" checked={selectedEmpIds.includes(empId)} onChange={e => setSelectedEmpIds(e.target.checked ? [...selectedEmpIds, empId] : selectedEmpIds.filter(id => id !== empId))} style={{ accentColor: 'var(--brass-600)' }} />
                      </td>
                      <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--brass-600, #b8934a)' }}>{getField(emp, 'employee_code', 'EmployeeCode')}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--ink, #0f172a)' }}>{getField(emp, 'employee_name', 'ArabicName')}</td>
                      <td style={{ padding: '10px', color: 'var(--muted, #64748b)', fontWeight: '500' }}>{getField(emp, 'job_title', 'JobTitle') || '—'}</td>
                      <td style={{ padding: '10px', color: 'var(--muted, #64748b)', fontWeight: '500' }}>{getField(emp, 'department', 'Department') || '—'}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', color: 'var(--ink, #0f172a)' }}>{getField(emp, 'hiring_date', 'HiringDate') || '—'}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: getField(emp, 'contract_type', 'ContractType') === 'دائم' ? '#15803d' : '#2563eb' }}>{getField(emp, 'contract_type', 'ContractType') || '—'}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--ink, #0f172a)' }}>{getField(emp, 'contract_type', 'ContractType') === 'دائم' ? '—' : (getField(emp, 'contract_end_date', 'ContractEndDate') || '—')}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button onClick={() => handleOpenEdit(emp)} style={{ background: 'transparent', color: 'var(--ink, #0f172a)', border: '1px solid var(--line, #e2e8f0)', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>تعديل ✏️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* نافذة التعديل (Edit Modal) */}
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
                  <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--brass-600, #b8934a)', borderBottom: '1px solid var(--line, #e2e8f0)', paddingBottom: '8px' }}>بيانات السجل الأساسي (Employees)</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    {[
                      { label: 'الكود', key1: 'employee_code', key2: 'EmployeeCode' },
                      { label: 'الاسم العربي', key1: 'employee_name', key2: 'ArabicName' },
                      { label: 'الاسم الإنجليزي', key1: 'english_name', key2: 'EnglishName' },
                      { label: 'الرقم القومي', key1: 'national_id', key2: 'NationalID' },
                      { label: 'الإدارة', key1: 'department', key2: 'Department' },
                      { label: 'الشركة', key1: 'company', key2: 'Company' },
                      { label: 'الوظيفة', key1: 'job_title', key2: 'JobTitle' },
                      { label: 'الموبايل', key1: 'phone', key2: 'Mobile' },
                      { label: 'البريد', key1: 'email', key2: 'Email' },
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
                        <option value="Active">Active</option><option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                  <button type="button" onClick={() => setEditData(null)} style={{ background: 'transparent', color: 'var(--ink, #0f172a)', border: '1px solid var(--line, #e2e8f0)', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                  <button type="submit" style={{ background: 'var(--brass-600, #b8934a)', color: '#fff', border: 0, padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>حفظ كافة التعديلات</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* نافذة الإضافة (Add Modal) */}
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
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ background: 'transparent', color: 'var(--ink, #0f172a)', border: '1px solid var(--line, #e2e8f0)', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" style={{ background: 'var(--brass-600, #b8934a)', color: '#fff', border: 0, padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إضافة الموظف</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
