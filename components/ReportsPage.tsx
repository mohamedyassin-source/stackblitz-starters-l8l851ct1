'use client';

import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const MONTHS_LIST = [
  { value: '1', label: 'يناير (01)' },
  { value: '2', label: 'فبراير (02)' },
  { value: '3', label: 'مارس (03)' },
  { value: '4', label: 'أبريل (04)' },
  { value: '5', label: 'مايو (05)' },
  { value: '6', label: 'يونيو (06)' },
  { value: '7', label: 'يوليو (07)' },
  { value: '8', label: 'أغسطس (08)' },
  { value: '9', label: 'سبتمبر (09)' },
  { value: '10', label: 'أكتوبر (10)' },
  { value: '11', label: 'نوفمبر (11)' },
  { value: '12', label: 'ديسمبر (12)' },
];

const getField = (obj: any, ...keys: string[]) => {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return '';
};

const getEmployeeAge = (emp: any) => {
  const birthDateRaw = getField(emp, 'birth_date', 'BirthDate');
  if (!birthDateRaw) return null;
  const birthDate = new Date(birthDateRaw);
  if (isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed = today.getMonth() > birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasBirthdayPassed) age--;
  return age;
};

const getRetirementDate = (birthDateRaw: string | null) => {
  if (!birthDateRaw) return null;
  const birthDate = new Date(birthDateRaw);
  if (isNaN(birthDate.getTime())) return null;
  return new Date(birthDate.getFullYear() + 60, birthDate.getMonth(), birthDate.getDate());
};

export default function ReportsPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeReport, setActiveReport] = useState<'monthly' | 'above_60' | 'dept_summary' | 'full_roster'>('monthly');

  // 🌟 فلتر جديد خاص بالشريط الفرعي للإحصائيات الشهرية
  const [activeMonthlyFilter, setActiveMonthlyFilter] = useState<'all' | 'turning60' | 'processed' | 'pending'>('all');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedContractType, setSelectedContractType] = useState('');

  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [deptSearchTerm, setDeptSearchTerm] = useState('');
  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
  const deptDropdownRef = useRef<HTMLDivElement>(null);

  // إعادة ضبط الفلتر الفرعي عند تغيير الشهر أو التقرير
  useEffect(() => {
    setActiveMonthlyFilter('all');
  }, [activeReport, selectedMonth, selectedYear]);

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

  useEffect(() => {
    async function fetchReportsData() {
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

        const mergedEmployees = allEmps.filter(e => e).map(emp => {
          const empCodeClean = String(emp.employee_code || '').trim().replace(/^0+/, '');
          const empContracts = contractsMap.get(empCodeClean) || [];

          empContracts.sort((a, b) => {
            const dateA = a.contract_end_date ? new Date(a.contract_end_date).getTime() : 0;
            const dateB = b.contract_end_date ? new Date(b.contract_end_date).getTime() : 0;
            return dateB - dateA; 
          });

          const activeContract = empContracts[0] || {};
          
          return {
            ...emp,
            contract_type: activeContract.contract_type || emp.contract_type || '—',
            contract_start_date: activeContract.contract_start_date || emp.contract_start_date || emp.hiring_date || null,
            contract_end_date: activeContract.contract_end_date || emp.contract_end_date || null,
          };
        });

        setEmployees(mergedEmployees);
        setRenewals(allRens.filter(r => r));
      } catch (err) {
        console.error('Error fetching reports data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchReportsData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(event.target as Node)) {
        setIsDeptDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getActionStatus = (empCode: string) => {
    if (!empCode) return { text: 'بدون إجراء ⚠️', code: 'none', color: '#ef4444', bg: '#fef2f2', border: '#fecaca' };
    
    const safeCode = String(empCode).trim().replace(/^0+/, '');
    const empRens = renewals
      .filter((r) => r && String(r.employee_code || '').trim().replace(/^0+/, '') === safeCode)
      .sort((a, b) => String(b.request_id).localeCompare(String(a.request_id)));
    
    const latest = empRens[0];
    
    if (!latest || latest.status === 'Rejected') return { text: 'بدون إجراء ⚠️', code: 'none', color: '#ef4444', bg: '#fef2f2', border: '#fecaca' };
    if (latest.status.includes('Pending')) return { text: 'تحت الاعتماد ⏳', code: 'pending', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' };
    if (latest.status === 'Approved' && latest.signature_status !== 'تم التوقيع') return { text: 'بانتظار التوقيع ✍️', code: 'approved', color: '#f97316', bg: '#fff7ed', border: '#fed7aa' };
    if (latest.status === 'Approved' && latest.signature_status === 'تم التوقيع') return { text: 'تم التوقيع ✅', code: 'signed', color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' };
    
    return { text: 'بدون إجراء ⚠️', code: 'none', color: '#ef4444', bg: '#fef2f2', border: '#fecaca' };
  };

  const activeEmployees = useMemo(() => {
    return employees.filter(e => {
      const dept = String(getField(e, 'department')).trim();
      const status = String(getField(e, 'status') || 'Active').trim().toLowerCase();
      const type = String(getField(e, 'contract_type')).trim();
      const job = String(getField(e, 'job_title')).trim();

      const isTransfer = dept.includes('تحويل') || job.includes('ايقاف راتب');
      const isTerminated = type === 'إنهاء تعاقد' || status === 'inactive' || status === 'terminated';

      return !isTransfer && !isTerminated;
    });
  }, [employees]);

  const companiesList = useMemo(() => Array.from(new Set(activeEmployees.map(e => getField(e, 'company')).filter(Boolean))), [activeEmployees]);
  const deptsList = useMemo(() => Array.from(new Set(activeEmployees.map(e => getField(e, 'department')).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), 'ar')), [activeEmployees]);
  const contractTypesList = useMemo(() => Array.from(new Set(activeEmployees.map(e => getField(e, 'contract_type')).filter(t => t && t !== '—'))), [activeEmployees]);

  const filteredDeptsList = useMemo(() => {
    if (!deptSearchTerm.trim()) return deptsList;
    return deptsList.filter(d => String(d).toLowerCase().includes(deptSearchTerm.toLowerCase().trim()));
  }, [deptsList, deptSearchTerm]);

  // فلترة التقرير
  const reportData = useMemo(() => {
    return activeEmployees.filter(emp => {
      const cType = getField(emp, 'contract_type');
      const endDateVal = getField(emp, 'contract_end_date');
      const comp = getField(emp, 'company');
      const dept = getField(emp, 'department');
      const code = String(getField(emp, 'employee_code')).toLowerCase();
      const name = String(getField(emp, 'employee_name')).toLowerCase();
      const age = getEmployeeAge(emp);

      if (activeReport === 'monthly') {
        const endDate = endDateVal ? new Date(endDateVal) : null;
        const retirementDate = getRetirementDate(getField(emp, 'birth_date'));

        const matchesMonthYear = (d: Date | null) => {
          if (!d || isNaN(d.getTime())) return false;
          const m = String(d.getMonth() + 1);
          const y = String(d.getFullYear());
          return (!selectedMonth || m === selectedMonth) && (!selectedYear || y === selectedYear);
        };

        const isExpiringThisMonth = matchesMonthYear(endDate);
        const isTurning60ThisMonth = matchesMonthYear(retirementDate);

        if (!isExpiringThisMonth && !isTurning60ThisMonth) return false;

        // 🌟 تطبيق الفلتر الفرعي للأشرطة المتفاعلة
        if (activeMonthlyFilter === 'turning60' && !isTurning60ThisMonth) return false;
        
        const actionCode = getActionStatus(code).code;
        if (activeMonthlyFilter === 'processed' && actionCode === 'none') return false;
        if (activeMonthlyFilter === 'pending' && actionCode !== 'none') return false;

      } else if (activeReport === 'above_60') {
        const isAbove60 = age !== null && age >= 60;
        const isAboveAgeType = String(cType).includes('فوق السن');
        if (!isAbove60 && !isAboveAgeType) return false;
      }

      const matchesSearch = !searchTerm || code.includes(searchTerm.toLowerCase()) || name.includes(searchTerm.toLowerCase());
      const matchesComp = !selectedCompany || comp === selectedCompany;
      const matchesDept = selectedDepts.length === 0 || selectedDepts.includes(dept);
      const matchesType = !selectedContractType || cType === selectedContractType;

      return matchesSearch && matchesComp && matchesDept && matchesType;
    });
  }, [activeEmployees, activeReport, selectedMonth, selectedYear, selectedCompany, selectedDepts, selectedContractType, searchTerm, activeMonthlyFilter, renewals]);

  const monthlyStats = useMemo(() => {
    let totalExpirations = 0;
    let turning60 = 0;
    let actionTaken = 0;
    let noAction = 0;

    activeEmployees.forEach(emp => {
      const endDateVal = getField(emp, 'contract_end_date');
      const endDate = endDateVal ? new Date(endDateVal) : null;
      const retirementDate = getRetirementDate(getField(emp, 'birth_date'));
      
      const m = parseInt(selectedMonth);
      const y = parseInt(selectedYear);

      const isExpiringThisMonth = endDate && (endDate.getMonth() + 1 === m) && (endDate.getFullYear() === y);
      const isTurning60ThisMonth = retirementDate && (retirementDate.getMonth() + 1 === m) && (retirementDate.getFullYear() === y);

      if (isExpiringThisMonth || isTurning60ThisMonth) {
        totalExpirations++;
        if (isTurning60ThisMonth) turning60++;

        const status = getActionStatus(getField(emp, 'employee_code')).code;
        if (status === 'none') noAction++;
        else actionTaken++;
      }
    });

    return { totalExpirations, turning60, actionTaken, noAction };
  }, [activeEmployees, selectedMonth, selectedYear, renewals]);

  const deptSummaryData = useMemo(() => {
    const summary: Record<string, { total: number; fixed: number; perm: number; above60: number }> = {};
    reportData.forEach(emp => {
      const dept = getField(emp, 'department') || 'غير محدد';
      const cType = getField(emp, 'contract_type');
      const age = getEmployeeAge(emp);
      if (!summary[dept]) summary[dept] = { total: 0, fixed: 0, perm: 0, above60: 0 };
      summary[dept].total += 1;
      if (String(cType).includes('دائم')) summary[dept].perm += 1;
      if (String(cType).includes('محدد') && !String(cType).includes('فوق السن')) summary[dept].fixed += 1;
      if (String(cType).includes('فوق السن') || (age && age >= 60)) summary[dept].above60 += 1;
    });
    return Object.entries(summary).map(([dept, counts]) => ({ dept, ...counts }));
  }, [reportData]);

  const toggleDeptSelection = (deptName: string) => {
    setSelectedDepts(prev => prev.includes(deptName) ? prev.filter(d => d !== deptName) : [...prev, deptName]);
  };

  const handleExportExcel = () => {
    if (reportData.length === 0) return alert('لا توجد بيانات للتصدير.');

    let exportRows = [];
    if (activeReport === 'dept_summary') {
      exportRows = deptSummaryData.map(d => ({
        'الإدارة': d.dept,
        'إجمالي الموظفين': d.total,
        'عقود محددة': d.fixed,
        'عقود دائمة': d.perm,
        'فوق السن (60+)': d.above60,
      }));
    } else if (activeReport === 'monthly') {
      exportRows = reportData.map(e => {
        const actionStatus = getActionStatus(getField(e, 'employee_code')).text.replace(/[^أ-ي ]/g, '').trim();
        return {
          'الكود': getField(e, 'employee_code'),
          'اسم الموظف': getField(e, 'employee_name'),
          'الإدارة': getField(e, 'department'),
          'الوظيفة': getField(e, 'job_title'),
          'نوع العقد الحالي': getField(e, 'contract_type'),
          'تاريخ انتهاء العقد': getField(e, 'contract_end_date') || '—',
          'حالة الإجراء بالـ HR': actionStatus,
          'توصية مدير الإدارة (يُجدد / لا يُجدد)': '',
          'المدة المقترحة للتجديد (شهور)': '',
          'تقييم الأداء العام': '',
          'ملاحظات الإدارة': ''
        };
      });
    } else {
      exportRows = reportData.map(e => ({
        'الكود': getField(e, 'employee_code'),
        'الاسم': getField(e, 'employee_name'),
        'الإدارة': getField(e, 'department'),
        'الشركة': getField(e, 'company'),
        'الوظيفة': getField(e, 'job_title'),
        'نوع العقد': getField(e, 'contract_type'),
        'تاريخ نهاية العقد': getField(e, 'contract_end_date') || '—',
        'السن': getEmployeeAge(e) ? `${getEmployeeAge(e)} سنة` : '—',
      }));
    }

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const colWidths = [
      { wch: 10 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, 
      { wch: 30 }, { wch: 25 }, { wch: 20 }, { wch: 30 }
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'استحقاقات_وقرارات_المديرين');
    XLSX.writeFile(wb, `تقرير_${activeReport}_${selectedMonth}_${selectedYear}.xlsx`);
  };

  return (
    <div style={{ paddingBottom: '40px', direction: 'rtl' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; direction: rtl; background: #fff !important; }
          .no-print { display: none !important; }
          .data-table th, .data-table td { border: 1px solid #cbd5e1 !important; padding: 6px !important; }
        }
        .enterprise-stat-card {
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
        .enterprise-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08);
          background: #f8fafc;
        }
        .enterprise-stat-card.active {
          background: #f8fafc;
          border-color: var(--theme-color);
          box-shadow: 0 0 0 1px var(--theme-color) inset;
        }

        /* 🌟 تنسيق شريط الإحصائيات التفاعلي الجديد */
        .segmented-control {
          display: flex;
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          margin-bottom: 24px;
        }
        .segmented-item {
          flex: 1;
          padding: 16px 10px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          border-bottom: 4px solid transparent;
        }
        .segmented-item:hover {
          background: #f8fafc;
        }
        .segmented-divider {
          width: 1px;
          background: #e2e8f0;
          margin: 12px 0;
        }
      `}</style>

      {/* الهيدر العلوي */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900' }}>📊 مركز تقارير العقود والاستحقاقات</h3>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>تقارير استباقية وأدوات عمل لمراقبة حركة العقود</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleExportExcel} style={{ background: '#10b981', color: '#fff', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            📥 تصدير تكتيكي Excel
          </button>
          <button onClick={() => window.print()} style={{ background: '#0f172a', color: '#fff', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            🖨️ طباعة
          </button>
        </div>
      </div>

      {/* كروت التبويبات الرئيسية */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className={`enterprise-stat-card ${activeReport === 'monthly' ? 'active' : ''}`} style={{ '--theme-color': '#2563eb' } as React.CSSProperties} onClick={() => setActiveReport('monthly')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>استحقاقات الشهر</span>
            <span style={{ fontSize: '20px' }}>🗓️</span>
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>حسب النهاية وإنذارات المعاش</div>
        </div>

        <div className={`enterprise-stat-card ${activeReport === 'above_60' ? 'active' : ''}`} style={{ '--theme-color': '#ea580c' } as React.CSSProperties} onClick={() => setActiveReport('above_60')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>فوق السن (60+)</span>
            <span style={{ fontSize: '20px' }}>💼</span>
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>متابعة عقود المتقاعدين</div>
        </div>

        <div className={`enterprise-stat-card ${activeReport === 'dept_summary' ? 'active' : ''}`} style={{ '--theme-color': '#8b5cf6' } as React.CSSProperties} onClick={() => setActiveReport('dept_summary')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>ملخص الإدارات</span>
            <span style={{ fontSize: '20px' }}>📊</span>
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>إحصائيات مجمعة لكل إدارة</div>
        </div>

        <div className={`enterprise-stat-card ${activeReport === 'full_roster' ? 'active' : ''}`} style={{ '--theme-color': '#475569' } as React.CSSProperties} onClick={() => setActiveReport('full_roster')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>السجل العام</span>
            <span style={{ fontSize: '20px' }}>📋</span>
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>كشف شامل للنشطين</div>
        </div>
      </div>

      {/* 🌟 شريط المؤشرات التفاعلي الموزع بالتساوي (Segmented Control) */}
      {activeReport === 'monthly' && (
        <div className="segmented-control no-print">
          
          <div className="segmented-item" onClick={() => setActiveMonthlyFilter('all')} style={{ background: activeMonthlyFilter === 'all' ? '#f1f5f9' : 'transparent', borderBottomColor: activeMonthlyFilter === 'all' ? '#0f172a' : 'transparent' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}>إجمالي انتهاء العقود</div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a' }}>{monthlyStats.totalExpirations}</div>
          </div>
          
          <div className="segmented-divider"></div>
          
          <div className="segmented-item" onClick={() => setActiveMonthlyFilter('turning60')} style={{ background: activeMonthlyFilter === 'turning60' ? '#fff7ed' : 'transparent', borderBottomColor: activeMonthlyFilter === 'turning60' ? '#ea580c' : 'transparent' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}>إنذار بلوغ سن (60)</div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#ea580c' }}>{monthlyStats.turning60} <span style={{fontSize:'14px'}}>🚨</span></div>
          </div>
          
          <div className="segmented-divider"></div>
          
          <div className="segmented-item" onClick={() => setActiveMonthlyFilter('processed')} style={{ background: activeMonthlyFilter === 'processed' ? '#f0fdf4' : 'transparent', borderBottomColor: activeMonthlyFilter === 'processed' ? '#10b981' : 'transparent' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}>تمت المعالجة (الـ HR)</div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#10b981' }}>{monthlyStats.actionTaken}</div>
          </div>
          
          <div className="segmented-divider"></div>
          
          <div className="segmented-item" onClick={() => setActiveMonthlyFilter('pending')} style={{ background: activeMonthlyFilter === 'pending' ? '#fef2f2' : 'transparent', borderBottomColor: activeMonthlyFilter === 'pending' ? '#ef4444' : 'transparent' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}>متأخرات (بدون إجراء)</div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#ef4444' }}>{monthlyStats.noAction}</div>
          </div>

        </div>
      )}

      {/* شريط الفلاتر */}
      <div className="no-print" style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '16px', marginBottom: '24px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        
        {activeReport === 'monthly' && (
          <div style={{ display: 'flex', gap: '6px', background: '#eff6ff', padding: '6px 12px', borderRadius: '8px', border: '1px solid #bfdbfe', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e40af' }}>🗓️ استحقاقات:</span>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px', fontWeight: 'bold', outline: 'none', background: '#fff' }}>
              <option value="">كل الأشهر</option>
              {MONTHS_LIST.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px', fontWeight: 'bold', outline: 'none', background: '#fff' }}>
              <option value="">الكل</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option>
            </select>
          </div>
        )}

        <input type="text" placeholder="بحث بالاسم أو الكود..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', width: '180px', fontWeight: 'bold' }} />

        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
          <option value="">🏢 كل الشركات</option>
          {companiesList.map((c: any, i) => <option key={i} value={c}>{c}</option>)}
        </select>

        <div style={{ position: 'relative' }} ref={deptDropdownRef}>
          <button type="button" onClick={() => setIsDeptDropdownOpen(!isDeptDropdownOpen)} style={{ padding: '8px 14px', borderRadius: '8px', border: selectedDepts.length > 0 ? '2px solid #2563eb' : '1px solid #cbd5e1', background: selectedDepts.length > 0 ? '#eff6ff' : '#ffffff', color: selectedDepts.length > 0 ? '#2563eb' : '#0f172a', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', minWidth: '160px', justifyContent: 'space-between' }}>
            <span>💼 الإدارات ({selectedDepts.length === 0 ? 'الكل' : selectedDepts.length})</span><span>▼</span>
          </button>
          {isDeptDropdownOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, width: '260px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px', marginTop: '6px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 100 }}>
              <input type="text" placeholder="🔍 ابحث اسم الإدارة..." value={deptSearchTerm} onChange={e => setDeptSearchTerm(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11px', outline: 'none', marginBottom: '10px', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #e2e8f0' }}>
                <button type="button" onClick={() => setSelectedDepts([...deptsList])} style={{ background: 'transparent', border: 0, color: '#2563eb', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>تحديد الكل</button>
                <button type="button" onClick={() => setSelectedDepts([])} style={{ background: 'transparent', border: 0, color: '#dc2626', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>إلغاء التحديد</button>
              </div>
              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {filteredDeptsList.length === 0 ? (
                  <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', padding: '8px' }}>لا توجد إدارة</div>
                ) : (
                  filteredDeptsList.map((d, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: selectedDepts.includes(d) ? 'bold' : 'normal', color: '#0f172a' }}>
                      <input type="checkbox" checked={selectedDepts.includes(d)} onChange={() => toggleDeptSelection(d)} style={{ accentColor: '#2563eb', cursor: 'pointer' }} /> {d}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <select value={selectedContractType} onChange={e => setSelectedContractType(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
          <option value="">📄 أنواع العقود (الكل)</option>
          {contractTypesList.map((t: any, i) => <option key={i} value={t}>{t}</option>)}
        </select>

        <button onClick={() => { setSearchTerm(''); setSelectedCompany(''); setSelectedDepts([]); setDeptSearchTerm(''); setSelectedContractType(''); setSelectedMonth(String(new Date().getMonth() + 1)); setSelectedYear(new Date().getFullYear().toString()); setActiveMonthlyFilter('all'); }} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', color: '#334155' }}>
          إعادة ضبط
        </button>
      </div>

      {/* 🌟 منطقة عرض وطباعة التقرير */}
      <div className="print-area" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        
        <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900' }}>مجموعة شركات المراسم الدولية</h2>
            <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#475569', fontWeight: 'bold' }}>
              {activeReport === 'monthly' && `تقرير العقود المستحقة وقرارات التجديد لشهر (${selectedMonth || 'الكل'}) لسنة ${selectedYear || 'الكل'}`}
              {activeReport === 'above_60' && 'كشف العمالة فوق السن والبالغين لسن التقاعد (60+)'}
              {activeReport === 'dept_summary' && 'تقرير ملخص إحصائيات العقود موزعة حسب الإدارات'}
              {activeReport === 'full_roster' && 'السجل الموحد العام لجميع الموظفين النشطين'}
            </p>
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>
              {selectedCompany && `شركة: ${selectedCompany} | `}
              {selectedDepts.length > 0 && `إدارات: (${selectedDepts.join('، ')})`}
            </div>
          </div>

          <div style={{ textAlign: 'left', fontSize: '12px', color: '#475569', fontFamily: 'monospace' }}>
            <div>تاريخ الاستخراج: <strong>{new Date().toLocaleDateString('ar-EG')}</strong></div>
            <div style={{ marginTop: '4px' }}>العدد بالجدول: <strong style={{ color: '#2563eb', fontSize: '16px' }}>{activeReport === 'dept_summary' ? deptSummaryData.length : reportData.length}</strong></div>
          </div>
        </div>

        {/* عرض البيانات */}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', color: '#64748b' }}>جاري استخراج التقرير... ⏳</div>
        ) : activeReport === 'dept_summary' ? (
          
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '12px' }}>#</th>
                <th style={{ padding: '12px' }}>الإدارة</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>إجمالي القوة</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>عقود محددة المدة</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>عقود دائمة</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>عمالة فوق السن (60+)</th>
              </tr>
            </thead>
            <tbody>
              {deptSummaryData.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا توجد بيانات مطابقة.</td></tr>
              ) : deptSummaryData.map((d, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', color: '#64748b' }}>{i + 1}</td>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#0f172a' }}>{d.dept}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: '900', fontSize: '14px', color: '#2563eb' }}>{d.total}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>{d.fixed}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>{d.perm}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#ea580c' }}>{d.above60}</td>
                </tr>
              ))}
            </tbody>
          </table>

        ) : (

          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '12px' }}>#</th>
                <th style={{ padding: '12px' }}>الكود</th>
                <th style={{ padding: '12px' }}>الاسم</th>
                <th style={{ padding: '12px' }}>الإدارة</th>
                <th style={{ padding: '12px' }}>الوظيفة</th>
                <th style={{ padding: '12px' }}>نوع العقد</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>نهاية العقد</th>
                {activeReport === 'monthly' && (
                  <>
                    <th style={{ padding: '12px', textAlign: 'center' }}>بلوغ سن (60)</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>حالة الإجراء</th>
                  </>
                )}
                {activeReport !== 'monthly' && <th style={{ padding: '12px', textAlign: 'center' }}>السن</th>}
              </tr>
            </thead>
            <tbody>
              {reportData.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا توجد عقود مستحقة أو بيانات مطابقة للبحث 🔍</td></tr>
              ) : reportData.map((emp, i) => {
                const code = getField(emp, 'employee_code');
                const name = getField(emp, 'employee_name');
                const dept = getField(emp, 'department');
                const job = getField(emp, 'job_title');
                const cType = getField(emp, 'contract_type');
                const endDate = getField(emp, 'contract_end_date');
                const age = getEmployeeAge(emp);
                const retirementDate = getRetirementDate(getField(emp, 'birth_date'));
                
                const actionStatus = getActionStatus(code);
                
                let isTurning60Now = false;
                if (retirementDate && activeReport === 'monthly') {
                  if (retirementDate.getMonth() + 1 === parseInt(selectedMonth) && retirementDate.getFullYear() === parseInt(selectedYear)) {
                    isTurning60Now = true;
                  }
                }

                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: isTurning60Now ? '#fff7ed' : 'transparent' }}>
                    <td style={{ padding: '12px', color: '#64748b' }}>{i + 1}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', fontFamily: 'monospace', color: '#2563eb' }}>{code}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#0f172a' }}>{name}</td>
                    <td style={{ padding: '12px', color: '#475569', fontWeight: 'bold' }}>{dept || '—'}</td>
                    <td style={{ padding: '12px', color: '#475569', fontWeight: '500' }}>{job || '—'}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#334155' }}>{cType || '—'}</td>
                    <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 'bold', textAlign: 'center' }}>{endDate || '—'}</td>
                    
                    {activeReport === 'monthly' && (
                      <>
                        <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 'bold', textAlign: 'center', color: isTurning60Now ? '#ea580c' : '#64748b' }}>
                          {retirementDate ? `${retirementDate.toISOString().split('T')[0]}` : '—'}
                          {isTurning60Now && <span style={{ marginRight: '4px' }}>🚨</span>}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{ background: actionStatus.bg, color: actionStatus.color, border: `1px solid ${actionStatus.border}`, padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' }}>
                            {actionStatus.text}
                          </span>
                        </td>
                      </>
                    )}

                    {activeReport !== 'monthly' && (
                      <td style={{ padding: '12px', fontWeight: 'bold', textAlign: 'center', color: age && age >= 60 ? '#ea580c' : 'inherit' }}>
                        {age ? `${age} سنة` : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '60px', display: 'flex', justifyContent: 'space-between', padding: '0 40px', fontSize: '13px', color: '#475569', fontWeight: 'bold' }}>
          <div style={{ textAlign: 'center' }}>مُعد التقرير<br/><br/>........................</div>
          <div style={{ textAlign: 'center' }}>مراجعة الموارد البشرية<br/><br/>........................</div>
          <div style={{ textAlign: 'center' }}>اعتماد الإدارة<br/><br/>........................</div>
        </div>

      </div>
    </div>
  );
}
