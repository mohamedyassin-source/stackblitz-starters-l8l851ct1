'use client';
import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import Stamp from './Stamp';

export default function ContractsPage({ jumpSearch }: { jumpSearch?: string }) {
  const { employees, renewals, loading, refresh } = useAppData();

  // الفلاتر والبحث
  const [activeCardFilter, setActiveCardFilter] = useState<'FIXED' | 'ABOVE_AGE' | 'PERM' | 'TURNING_60' | null>(null);
  const [searchTerm, setSearchTerm] = useState(jumpSearch || '');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedType, setSelectedType] = useState('');

  // النوافذ المنبثقة
  const [showNewContractModal, setShowNewContractModal] = useState(false);
  const [showTermModal, setShowTermModal] = useState(false);
  const [editContractData, setEditData] = useState<any>(null);

  // بيانات إنهاء التعاقد
  const [termSearch, setTermSearch] = useState('');
  const [selectedTermEmp, setSelectedTermEmp] = useState<any>(null);
  const [termReason, setTermReason] = useState('إنهاء عقد');
  const [termDate, setTermDate] = useState(new Date().toISOString().split('T')[0]);
  const [termSaving, setTermSaving] = useState(false);

  // بيانات إنشاء عقد جديد
  const [newContract, setNewContract] = useState({
    employee_code: '',
    contract_type: 'محدد المدة',
    months: 12,
    start_date: new Date().toISOString().split('T')[0],
    end_date: ''
  });
  const [newContractSaving, setNewContractSaving] = useState(false);

  useEffect(() => {
    if (jumpSearch) setSearchTerm(jumpSearch);
  }, [jumpSearch]);

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

  const activeEmployees = useMemo(() => {
    return employees.filter(e => (getField(e, 'status', 'Status') || 'Active') === 'Active');
  }, [employees]);

  const companiesList = useMemo(() => Array.from(new Set(activeEmployees.map(e => getField(e, 'company', 'Company')).filter(Boolean))), [activeEmployees]);
  const deptsList = useMemo(() => Array.from(new Set(activeEmployees.map(e => getField(e, 'department', 'Department')).filter(Boolean))), [activeEmployees]);
  const typesList = useMemo(() => Array.from(new Set(activeEmployees.map(e => getField(e, 'contract_type', 'ContractType')).filter(Boolean))), [activeEmployees]);

  // دمج بيانات العقود المحدثة
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

      return {
        ...emp,
        code,
        name,
        department: getField(emp, 'department', 'Department'),
        company: getField(emp, 'company', 'Company'),
        jobTitle: getField(emp, 'job_title', 'JobTitle'),
        contractType,
        startDate,
        endDate,
        daysLeft,
        daysUntil60,
        isTurning60Soon: daysUntil60 !== null && daysUntil60 >= 0 && daysUntil60 <= 60,
      };
    });
  }, [activeEmployees]);

  // إحصائيات الكروت الأربعة
  const cardStats = useMemo(() => {
    const totalFixed = processedContracts.filter(c => c.contractType === 'محدد المدة').length;
    const totalAboveAge = processedContracts.filter(c => String(c.contractType).includes('فوق السن')).length;
    const totalPerm = processedContracts.filter(c => c.contractType === 'دائم').length;
    const totalTurning60 = processedContracts.filter(c => c.isTurning60Soon && c.contractType !== 'محدد المدة - فوق السن').length;

    return { totalFixed, totalAboveAge, totalPerm, totalTurning60 };
  }, [processedContracts]);

  // تطبيق الفلاتر
  const filteredContracts = useMemo(() => {
    return processedContracts.filter(item => {
      // 1. التصفية التفاعلية بالكروت
      if (activeCardFilter === 'FIXED' && item.contractType !== 'محدد المدة') return false;
      if (activeCardFilter === 'ABOVE_AGE' && !String(item.contractType).includes('فوق السن')) return false;
      if (activeCardFilter === 'PERM' && item.contractType !== 'دائم') return false;
      if (activeCardFilter === 'TURNING_60' && !item.isTurning60Soon) return false;

      // 2. الفلاتر النصية والقوائم
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || item.code.toLowerCase().includes(term) || item.name.toLowerCase().includes(term);
      const matchesComp = !selectedCompany || item.company === selectedCompany;
      const matchesDept = !selectedDept || item.department === selectedDept;
      const matchesType = !selectedType || item.contractType === selectedType;

      return matchesSearch && matchesComp && matchesDept && matchesType;
    });
  }, [processedContracts, activeCardFilter, searchTerm, selectedCompany, selectedDept, selectedType]);

  // نتائج البحث لشاشة إنهاء الخدمة
  const termSearchResults = useMemo(() => {
    if (!termSearch.trim()) return [];
    const term = termSearch.toLowerCase().trim();
    return activeEmployees.filter(e => {
      const code = String(getField(e, 'employee_code', 'EmployeeCode')).toLowerCase();
      const name = String(getField(e, 'employee_name', 'ArabicName')).toLowerCase();
      return code.includes(term) || name.includes(term);
    }).slice(0, 6);
  }, [activeEmployees, termSearch]);

  // فتح تعديل تاريخ نهاية العقد (أيقونة القلم ✏️)
  const handleOpenEditContract = (emp: any) => {
    setEditData({
      emp,
      contract_type: emp.contractType || 'محدد المدة',
      contract_start_date: emp.startDate || '',
      contract_end_date: emp.endDate || '',
      saving: false
    });
  };

  // حفظ تعديل العقد المباشر
  const handleSaveContractEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editContractData) return;
    setEditData({ ...editContractData, saving: true });

    try {
      const empId = editContractData.emp.id || editContractData.emp.employee_id;
      const { error } = await supabase
        .from('employees')
        .update({
          contract_type: editContractData.contract_type,
          contract_start_date: editContractData.contract_start_date || null,
          contract_end_date: editContractData.contract_end_date || null,
        })
        .eq(editContractData.emp.id ? 'id' : 'employee_id', empId);

      if (error) throw error;

      alert('تم تحديث العقد بنجاح ✅');
      setEditData(null);
      await refresh();
    } catch (err: any) {
      alert('خطأ أثناء التعديل: ' + err.message);
      setEditData({ ...editContractData, saving: false });
    }
  };

  // إنشاء عقد جديد
  const handleCreateNewContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContract.employee_code) return alert('يرجى اختيار الموظف أولاً');

    setNewContractSaving(true);
    try {
      const targetEmp = activeEmployees.find(e => String(getField(e, 'employee_code', 'EmployeeCode')) === newContract.employee_code);
      if (!targetEmp) throw new Error('الموظف غير موجود');

      // 1. حساب تاريخ النهاية تلقائياً
      let calcEnd = newContract.end_date;
      if (!calcEnd && newContract.start_date) {
        const d = new Date(newContract.start_date);
        d.setMonth(d.getMonth() + Number(newContract.months));
        d.setDate(d.getDate() - 1);
        calcEnd = d.toISOString().split('T')[0];
      }

      // 2. تحديث عقد الموظف بالجدول الرئيسي
      const empId = targetEmp.id || targetEmp.employee_id;
      const { error: empError } = await supabase
        .from('employees')
        .update({
          contract_type: newContract.contract_type,
          contract_start_date: newContract.start_date,
          contract_end_date: calcEnd,
        })
        .eq(targetEmp.id ? 'id' : 'employee_id', empId);

      if (empError) throw empError;

      alert('✅ تم إنشاء العقد الجديد وتحديث سجل الموظف بنجاح');
      setShowNewContractModal(false);
      setNewContract({ employee_code: '', contract_type: 'محدد المدة', months: 12, start_date: new Date().toISOString().split('T')[0], end_date: '' });
      await refresh();
    } catch (err: any) {
      alert('خطأ أثناء الإنشاء: ' + err.message);
    } finally {
      setNewContractSaving(false);
    }
  };

  // تأكيد إنهاء التعاقد
  const handleConfirmTermination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTermEmp) return alert('يرجى اختيار الموظف');

    setTermSaving(true);
    try {
      const empId = selectedTermEmp.id || selectedTermEmp.employee_id;
      const { error } = await supabase
        .from('employees')
        .update({
          department: 'تحويلات تحت الاعتماد',
          termination_reason: termReason,
          termination_date: termDate,
        })
        .eq(selectedTermEmp.id ? 'id' : 'employee_id', empId);

      if (error) throw error;

      alert(`✅ تم تحويل الموظف (${getField(selectedTermEmp, 'employee_name', 'ArabicName')}) إلى قسم تحويلات تحت الاعتماد بنجاح.`);
      setShowTermModal(false);
      setSelectedTermEmp(null);
      setTermSearch('');
      await refresh();
    } catch (err: any) {
      alert('خطأ أثناء إنهاء التعاقد: ' + err.message);
    } finally {
      setTermSaving(false);
    }
  };

  return (
    <div style={{ direction: 'rtl', animation: 'fadeIn 0.3s ease-in-out' }}>
      
      {/* رأس الصفحة مع الأزرار العلوية */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950, #0f172a)', fontWeight: '800' }}>إدارة العقود الحالية</h3>
          <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>متابعة وتحديث سريان العقود الحالية وتعديل نهايات الخدمة</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setShowTermModal(true)} 
            style={{ background: '#ef4444', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}
          >
            🚫 إنهاء تعاقد
          </button>

          <button 
            onClick={() => setShowNewContractModal(true)} 
            style={{ background: 'var(--brass-600, #0d9488)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}
          >
            + إنشاء عقد جديد ✍️
          </button>
        </div>
      </div>

      {/* 🌟 الكروت الإحصائية الأربعة التفاعلية 🌟 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        
        {/* كارت محدد المدة */}
        <div
          onClick={() => setActiveCardFilter(activeCardFilter === 'FIXED' ? null : 'FIXED')}
          style={{
            background: activeCardFilter === 'FIXED' ? '#eff6ff' : 'var(--paper-card, #fff)',
            border: activeCardFilter === 'FIXED' ? '2px solid #2563eb' : '1px solid var(--line, #e2e8f0)',
            padding: '14px 16px',
            borderRadius: '12px',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold', marginBottom: '2px' }}>عقود محددة المدة</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#2563eb' }}>{cardStats.totalFixed.toLocaleString('en-US')}</div>
            <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: 'bold', marginTop: '2px' }}>اضغط للتصفية 👁️</div>
          </div>
          <div style={{ background: '#eff6ff', color: '#2563eb', width: '38px', height: '38px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '18px' }}>📂</div>
        </div>

        {/* كارت فوق السن */}
        <div
          onClick={() => setActiveCardFilter(activeCardFilter === 'ABOVE_AGE' ? null : 'ABOVE_AGE')}
          style={{
            background: activeCardFilter === 'ABOVE_AGE' ? '#fef3c7' : 'var(--paper-card, #fff)',
            border: activeCardFilter === 'ABOVE_AGE' ? '2px solid #d97706' : '1px solid var(--line, #e2e8f0)',
            padding: '14px 16px',
            borderRadius: '12px',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold', marginBottom: '2px' }}>عقود فوق السن</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#d97706' }}>{cardStats.totalAboveAge.toLocaleString('en-US')}</div>
            <div style={{ fontSize: '10px', color: '#d97706', fontWeight: 'bold', marginTop: '2px' }}>اضغط للتصفية 👁️</div>
          </div>
          <div style={{ background: '#fef3c7', color: '#d97706', width: '38px', height: '38px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '18px' }}>💼</div>
        </div>

        {/* كارت عقود دائمة */}
        <div
          onClick={() => setActiveCardFilter(activeCardFilter === 'PERM' ? null : 'PERM')}
          style={{
            background: activeCardFilter === 'PERM' ? '#f0fdf4' : 'var(--paper-card, #fff)',
            border: activeCardFilter === 'PERM' ? '2px solid #16a34a' : '1px solid var(--line, #e2e8f0)',
            padding: '14px 16px',
            borderRadius: '12px',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold', marginBottom: '2px' }}>عقود دائمة</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#16a34a' }}>{cardStats.totalPerm.toLocaleString('en-US')}</div>
            <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 'bold', marginTop: '2px' }}>اضغط للتصفية 👁️</div>
          </div>
          <div style={{ background: '#dcfce7', color: '#16a34a', width: '38px', height: '38px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '18px' }}>🛡️</div>
        </div>

        {/* كارت سن الـ 60 خلال 60 يوم */}
        <div
          onClick={() => setActiveCardFilter(activeCardFilter === 'TURNING_60' ? null : 'TURNING_60')}
          style={{
            background: activeCardFilter === 'TURNING_60' ? '#fff7ed' : 'var(--paper-card, #fff)',
            border: activeCardFilter === 'TURNING_60' ? '2px solid #ea580c' : '1px solid var(--line, #e2e8f0)',
            padding: '14px 16px',
            borderRadius: '12px',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold', marginBottom: '2px' }}>سن الـ 60 قريباً (60 يوم)</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#ea580c' }}>{cardStats.totalTurning60.toLocaleString('en-US')}</div>
            <div style={{ fontSize: '10px', color: '#ea580c', fontWeight: 'bold', marginTop: '2px' }}>عرض القائمة 👁️</div>
          </div>
          <div style={{ background: '#ffedd5', color: '#ea580c', width: '38px', height: '38px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '18px' }}>🎂</div>
        </div>

      </div>

      {/* الفلاتر والبحث */}
      <div className="db-card" style={{ background: 'var(--paper-card, #fff)', border: '1px solid var(--line, #e2e8f0)', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="بحث بـ كود الموظف، الاسم..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none', width: '200px' }}
        />

        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none' }}>
          <option value="">🏢 كل الشركات</option>
          {companiesList.map((c: any, i) => <option key={i} value={c}>{c}</option>)}
        </select>

        <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none' }}>
          <option value="">💼 كل الإدارات</option>
          {deptsList.map((d: any, i) => <option key={i} value={d}>{d}</option>)}
        </select>

        <select value={selectedType} onChange={e => setSelectedType(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none' }}>
          <option value="">📄 أنواع العقود</option>
          {typesList.map((t: any, i) => <option key={i} value={t}>{t}</option>)}
        </select>

        <button
          onClick={() => {
            setSearchTerm('');
            setSelectedCompany('');
            setSelectedDept('');
            setSelectedType('');
            setActiveCardFilter(null);
          }}
          style={{ background: '#f1f5f9', border: '1px solid var(--line, #e2e8f0)', padding: '8px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          إعادة ضبط
        </button>

        <div style={{ flex: 1, textAlign: 'left', fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>
          النتائج: <span style={{ color: 'var(--navy-950, #0f172a)' }}>{filteredContracts.length.toLocaleString('en-US')}</span> عقد
        </div>
      </div>

      {/* الجدول الرئيسي للعقود مع أيقونة التعديل ✏️ */}
      <div className="db-card" style={{ background: 'var(--paper-card, #fff)', border: '1px solid var(--line, #e2e8f0)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: 'var(--muted, #64748b)' }}>جاري جلب سريان العقود... ⏳</div>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--paper-card, #fff)', zIndex: 10 }}>
                <tr style={{ borderBottom: '1px solid var(--line, #cbd5e1)' }}>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>الكود</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>اسم الموظف</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>الإدارة</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>بداية العقد</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>نهاية العقد</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>الأيام المتبقية</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>نوع العقد</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)', textAlign: 'center' }}>تعديل العقد</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((emp, i) => {
                  const isPerm = emp.contractType === 'دائم';

                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line, #f1f5f9)' }}>
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

                      {/* ✏️ أيقونة شكل القلم لتعديل العقد بسرعة */}
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleOpenEditContract(emp)}
                          style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title="تعديل تاريخ بداية ونهاية العقد مباشرة"
                        >
                          ✏️ تعديل
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ✏️ نافذة تعديل العقد (أيقونة القلم) */}
      {editContractData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '500px', background: 'var(--paper-card, #fff)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>✏️ تعديل تواريخ وسريان العقد</h3>
              <button onClick={() => setEditData(null)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <form onSubmit={handleSaveContractEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                <div><strong>الموظف:</strong> {editContractData.emp.name} (<span style={{ color: '#0d9488' }}>{editContractData.emp.code}</span>)</div>
                <div><strong>الإدارة:</strong> {editContractData.emp.department || '—'}</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>نوع العقد:</label>
                <select
                  value={editContractData.contract_type}
                  onChange={e => setEditData({ ...editContractData, contract_type: e.target.value })}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}
                >
                  <option value="دائم">دائم</option>
                  <option value="محدد المدة">محدد المدة</option>
                  <option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>تاريخ بداية العقد:</label>
                <input
                  type="date"
                  value={editContractData.contract_start_date}
                  onChange={e => setEditData({ ...editContractData, contract_start_date: e.target.value })}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>تاريخ نهاية العقد الحالي:</label>
                <input
                  type="date"
                  value={editContractData.contract_end_date}
                  onChange={e => setEditData({ ...editContractData, contract_end_date: e.target.value })}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setEditData(null)} style={{ background: 'transparent', border: '1px solid #e2e8f0', padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={editContractData.saving} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: editContractData.saving ? 'not-allowed' : 'pointer' }}>
                  {editContractData.saving ? 'جاري الحفظ...' : 'حفظ التغييرات 💾'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✍️ نافذة إنشاء عقد جديد */}
      {showNewContractModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '550px', background: 'var(--paper-card, #fff)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>+ إنشاء عقد جديد لموظف</h3>
              <button onClick={() => setShowNewContractModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <form onSubmit={handleCreateNewContract} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>اختر الموظف (الكود أو الاسم):</label>
                <select
                  required
                  value={newContract.employee_code}
                  onChange={e => setNewContract({ ...newContract, employee_code: e.target.value })}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}
                >
                  <option value="">-- اختر الموظف --</option>
                  {activeEmployees.map((emp, i) => (
                    <option key={i} value={getField(emp, 'employee_code', 'EmployeeCode')}>
                      [{getField(emp, 'employee_code', 'EmployeeCode')}] {getField(emp, 'employee_name', 'ArabicName')} - ({getField(emp, 'department', 'Department') || 'بدون إدارة'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>نوع العقد الجديد:</label>
                <select
                  value={newContract.contract_type}
                  onChange={e => setNewContract({ ...newContract, contract_type: e.target.value })}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}
                >
                  <option value="محدد المدة">محدد المدة</option>
                  <option value="محدد المدة - فوق السن">محدد المدة - فوق السن</option>
                  <option value="دائم">دائم</option>
                </select>
              </div>

              {newContract.contract_type !== 'دائم' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>مدة العقد بالشهور:</label>
                    <select
                      value={newContract.months}
                      onChange={e => setNewContract({ ...newContract, months: Number(e.target.value) })}
                      style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}
                    >
                      <option value={6}>6 أشهر</option>
                      <option value={12}>12 شهر (سنة كاملة)</option>
                      <option value={24}>24 شهر (سنتان)</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>تاريخ بداية العقد:</label>
                      <input
                        type="date"
                        required
                        value={newContract.start_date}
                        onChange={e => setNewContract({ ...newContract, start_date: e.target.value })}
                        style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>تاريخ نهاية العقد (تلقائي):</label>
                      <input
                        type="date"
                        value={newContract.end_date}
                        onChange={e => setNewContract({ ...newContract, end_date: e.target.value })}
                        placeholder="يتم حسابه أوتوماتيكياً"
                        style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowNewContractModal(false)} style={{ background: 'transparent', border: '1px solid #e2e8f0', padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={newContractSaving} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: newContractSaving ? 'not-allowed' : 'pointer' }}>
                  {newContractSaving ? 'جاري الإنشاء...' : 'حفظ العقد الجديد 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🚫 نافذة إنهاء التعاقد */}
      {showTermModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '500px', background: 'var(--paper-card, #fff)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#dc2626', fontWeight: '800' }}>🚫 إنهاء تعاقد موظف</h3>
              <button onClick={() => setShowTermModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <form onSubmit={handleConfirmTermination} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>البحث عن الموظف المراد إنهاء عقده:</label>
                <input
                  type="text"
                  placeholder="اكتب كود الموظف أو اسمه..."
                  value={termSearch}
                  onChange={e => { setTermSearch(e.target.value); setSelectedTermEmp(null); }}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                />

                {termSearchResults.length > 0 && !selectedTermEmp && (
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', marginTop: '4px', maxHeight: '150px', overflowY: 'auto' }}>
                    {termSearchResults.map((emp, i) => (
                      <div
                        key={i}
                        onClick={() => { setSelectedTermEmp(emp); setTermSearch(`${getField(emp, 'employee_code', 'EmployeeCode')} - ${getField(emp, 'employee_name', 'ArabicName')}`); }}
                        style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '11px' }}
                      >
                        <strong style={{ color: '#0d9488' }}>[{getField(emp, 'employee_code', 'EmployeeCode')}]</strong> {getField(emp, 'employee_name', 'ArabicName')}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>سبب إنهاء التعاقد:</label>
                <select value={termReason} onChange={e => setTermReason(e.target.value)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}>
                  <option value="إنهاء عقد">إنهاء عقد</option>
                  <option value="استقالة">استقالة</option>
                  <option value="إنهاء خدمات">إنهاء خدمات</option>
                  <option value="بلوغ سن">بلوغ سن (تقاعد)</option>
                  <option value="انقطاع عن العمل">انقطاع عن العمل</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>تاريخ إنهاء التعاقد:</label>
                <input
                  type="date"
                  required
                  value={termDate}
                  onChange={e => setTermDate(e.target.value)}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowTermModal(false)} style={{ background: 'transparent', border: '1px solid #e2e8f0', padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={termSaving || !selectedTermEmp} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: (termSaving || !selectedTermEmp) ? 'not-allowed' : 'pointer' }}>
                  {termSaving ? 'جاري الحفظ...' : 'تأكيد إنهاء التعاقد 🚫'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
