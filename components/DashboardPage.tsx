'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { navigateTo } from '@/lib/navigation';
import { useAppData } from '@/lib/DataContext';
import KpiCard from './KpiCard';
import Stamp from './Stamp';

const getField = (obj: any, ...keys: string[]) => {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return String(obj[key]).trim();
  }
  return '';
};

// 🌟 دالة توحيد وتنظيف كود الموظف لضمان تطابق المقارنة 100%
const cleanCode = (code: any) => {
  if (!code && code !== 0) return '';
  return String(code).trim().replace(/^0+/, '');
};

export default function DashboardPage() {
  const { employees: contextEmployees, renewals: allRenewals, loading: contextLoading, refresh: refreshContext } = useAppData();

  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterCompany, setFilterCompany] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  const [activeKpiFilter, setActiveKpiFilter] = useState<'all' | 'fixed' | 'perm' | 'aboveAge' | 'expiring' | 'turning60'>('all');

  const [showAgeModal, setShowAgeModal] = useState(false);
  
  const currentYearStr = new Date().getFullYear().toString();
  const [ageFilterYear, setAgeFilterYear] = useState<string>(currentYearStr);
  const [ageFilterMonth, setAgeFilterMonth] = useState<string>('');

  const [selectedChartMonth, setSelectedChartMonth] = useState<{ name: string; emps: any[] } | null>(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<{ label: string; count: number; color: string; emps: any[] } | null>(null);
  
  const [ageSortCol, setAgeSortCol] = useState<string>('employee_name');
  const [ageSortDir, setAgeSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 🚀 دالة جلب العقود النشطة المحدثة ومطابقتها بأمان تام
  const fetchContractsAndMerge = async () => {
    setLoading(true);
    try {
      let allContracts: any[] = [];
      let from = 0;
      const step = 1000;
      
      // جلب كافة العقود المتاحة من جدول contracts
      while (true) {
        const { data, error } = await supabase
          .from('contracts')
          .select('employee_code, contract_type, contract_start_date, contract_end_date, status')
          .range(from, from + step - 1);

        if (error || !data || data.length === 0) break;
        allContracts = [...allContracts, ...data];
        if (data.length < step) break;
        from += step;
      }

      // تجميع العقود حسب كود الموظف
      const contractsMap = new Map<string, any[]>();
      allContracts.forEach(c => {
        if (!c) return;
        const cCode = cleanCode(c.employee_code);
        if (!cCode) return;
        if (!contractsMap.has(cCode)) contractsMap.set(cCode, []);
        contractsMap.get(cCode)?.push(c);
      });

      // الدمج المباشر مع بيانات الموظفين
      const merged = (contextEmployees || []).map(emp => {
        const empCodeRaw = getField(emp, 'employee_code', 'EmployeeCode');
        const eCodeClean = cleanCode(empCodeRaw);
        
        const empContracts = contractsMap.get(eCodeClean) || [];

        // إعطاء الأولوية للعقود النشطة أولاً، ثم ترتيبها بالأحدث تاريخ نهاية
        empContracts.sort((a, b) => {
          if (a.status === 'Active' && b.status !== 'Active') return -1;
          if (a.status !== 'Active' && b.status === 'Active') return 1;
          const dateA = a.contract_end_date ? new Date(a.contract_end_date).getTime() : 0;
          const dateB = b.contract_end_date ? new Date(b.contract_end_date).getTime() : 0;
          return dateB - dateA;
        });

        const latestContract = empContracts[0];

        return {
          ...emp,
          contract_type: latestContract?.contract_type || emp.contract_type || '—',
          contract_start_date: latestContract?.contract_start_date || emp.hiring_date || null,
          // 🚀 قراءة القيمة الحقيقية للانتهاء من جدول العقود فوراً
          contract_end_date: latestContract?.contract_end_date || emp.contract_end_date || null,
        };
      });

      setAllEmployees(merged);
    } catch (err) {
      console.error('Error merging contracts:', err);
      setAllEmployees(contextEmployees || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContractsAndMerge();
  }, [contextEmployees, contextLoading]);

  const getDaysRemaining = (endDateStr: string | null) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const getAge60Info = (nationalId: any, birthDateRaw?: any) => {
    let birthDate: Date | null = null;

    if (birthDateRaw) {
      const b = new Date(birthDateRaw);
      if (!isNaN(b.getTime())) birthDate = b;
    }

    if (!birthDate && nationalId) {
      const idStr = String(nationalId).replace(/\D/g, '');
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

    if (!birthDate) return null;

    const age60Date = new Date(birthDate);
    age60Date.setFullYear(age60Date.getFullYear() + 60);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const daysUntil60 = Math.ceil((age60Date.getTime() - today.getTime()) / (1000 * 3600 * 24));

    return { 
      birthDate: birthDate.toISOString().split('T')[0], 
      age60Date: age60Date.toISOString().split('T')[0], 
      daysUntil60,
      year60: age60Date.getFullYear(),
      month60: age60Date.getMonth() + 1,
      day60: age60Date.getDate()
    };
  };

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

  const companiesList = Array.from(new Set((allEmployees || []).map((e) => getField(e, 'company', 'Company')).filter(Boolean)));
  const deptsList = Array.from(new Set((allEmployees || []).map((e) => getField(e, 'department', 'Department')).filter(Boolean)));

  const dashboardData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const targetExpiryYear = currentYear + 1;

    const activeEmployeesOnly = (allEmployees || []).filter(emp => 
      String(getField(emp, 'status', 'Status') || 'Active').toLowerCase() === 'active' && 
      !String(getField(emp, 'department', 'Department') || '').includes('تحويلات')
    );

    const baseFilteredEmps = activeEmployeesOnly.filter((emp) => {
      const empComp = String(getField(emp, 'company', 'Company') || '').toLowerCase();
      const empDept = String(getField(emp, 'department', 'Department') || '').toLowerCase();
      
      const matchesComp = !filterCompany || empComp.includes(filterCompany.toLowerCase());
      const matchesDept = !filterDept || empDept.includes(filterDept.toLowerCase());
      return matchesComp && matchesDept;
    });

    let totalFixed = 0, totalPerm = 0, totalAboveAge = 0, totalExpiringSoon = 0;
    const futureTurning60List: any[] = [];
    const turning60SoonList: any[] = [];

    baseFilteredEmps.forEach((emp) => {
      const type = String(getField(emp, 'contract_type', 'ContractType') || 'محدد المدة').trim();
      const nationalId = getField(emp, 'national_id', 'NationalID');
      const birthDateRaw = getField(emp, 'birth_date', 'BirthDate');
      const endDateStr = getField(emp, 'contract_end_date', 'ContractEndDate');
      const empCode = getField(emp, 'employee_code', 'EmployeeCode');
      const empName = getField(emp, 'employee_name', 'ArabicName', 'EmployeeName');
      const dept = String(getField(emp, 'department', 'Department') || 'غير محدد').trim();

      if (type.includes('دائم') || type.includes('غير محدد')) totalPerm++;
      else if (type.includes('فوق السن')) totalAboveAge++;
      else totalFixed++;

      const days = getDaysRemaining(endDateStr);
      if (!type.includes('دائم') && !type.includes('غير محدد') && days !== null && days >= 0 && days <= 60) {
        totalExpiringSoon++;
      }

      const ageInfo = getAge60Info(nationalId, birthDateRaw);
      if (ageInfo && ageInfo.daysUntil60 >= 0) {
        const item = {
          ...emp, employee_code: empCode, employee_name: empName, department: dept,
          contract_type: type, birthDate: ageInfo.birthDate, age60Date: ageInfo.age60Date,
          daysLeft: ageInfo.daysUntil60, year60: ageInfo.year60, month60: ageInfo.month60
        };
        futureTurning60List.push(item);
        if (ageInfo.daysUntil60 <= 60) turning60SoonList.push(item);
      }
    });

    const kpiFilteredEmps = baseFilteredEmps.filter((emp) => {
      const type = String(getField(emp, 'contract_type', 'ContractType') || 'محدد المدة').trim();
      const endDateStr = getField(emp, 'contract_end_date', 'ContractEndDate');
      const days = getDaysRemaining(endDateStr);
      const nationalId = getField(emp, 'national_id', 'NationalID');
      const birthDateRaw = getField(emp, 'birth_date', 'BirthDate');
      const ageInfo = getAge60Info(nationalId, birthDateRaw);

      if (activeKpiFilter === 'fixed') return !type.includes('دائم') && !type.includes('فوق السن');
      if (activeKpiFilter === 'perm') return type.includes('دائم') || type.includes('غير محدد');
      if (activeKpiFilter === 'aboveAge') return type.includes('فوق السن');
      if (activeKpiFilter === 'expiring') return !type.includes('دائم') && days !== null && days >= 0 && days <= 60;
      if (activeKpiFilter === 'turning60') return ageInfo !== null && ageInfo.daysUntil60 >= 0 && ageInfo.daysUntil60 <= 60;

      return true;
    });

    const deptsCount: Record<string, number> = {};
    const alerts: any[] = [];

    const monthsNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const contractsByMonth = monthsNames.map((name) => ({ name, count: 0, emps: [] as any[] }));

    kpiFilteredEmps.forEach((emp) => {
      const type = String(getField(emp, 'contract_type', 'ContractType') || 'محدد المدة').trim();
      const dept = String(getField(emp, 'department', 'Department') || 'غير محدد').trim();
      const endDateStr = getField(emp, 'contract_end_date', 'ContractEndDate');
      const empCode = getField(emp, 'employee_code', 'EmployeeCode');
      const empName = getField(emp, 'employee_name', 'ArabicName', 'EmployeeName');

      deptsCount[dept] = (deptsCount[dept] || 0) + 1;

      if (endDateStr && !type.includes('دائم')) {
        const endDate = new Date(endDateStr);
        if (!isNaN(endDate.getTime()) && endDate.getFullYear() === targetExpiryYear) {
          const monthIdx = endDate.getMonth();
          if (monthIdx >= 0 && monthIdx < 12) {
            contractsByMonth[monthIdx].count++;
            contractsByMonth[monthIdx].emps.push({
              employee_code: empCode,
              employee_name: empName,
              department: dept,
              contract_end_date: endDateStr
            });
          }
        }
      }

      if (!type.includes('دائم')) {
        const days = getDaysRemaining(endDateStr);
        if (days !== null && days >= 0 && days <= 60) {
          alerts.push({ ...emp, employee_code: empCode, employee_name: empName, contract_end_date: endDateStr, days, status: 'expiring' });
        }
      }
    });

    alerts.sort((a, b) => a.days - b.days);

    const allDepts = Object.entries(deptsCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    const totalEmpsCount = baseFilteredEmps.length || 1;
    const calcPct = (val: number) => ((val / totalEmpsCount) * 100).toFixed(1);

    return {
      totalEmps: baseFilteredEmps.length,
      kpiFilteredCount: kpiFilteredEmps.length,
      permCount: totalPerm,
      permPct: calcPct(totalPerm),
      fixedCount: totalFixed,
      fixedPct: calcPct(totalFixed),
      aboveAgeCount: totalAboveAge,
      aboveAgePct: calcPct(totalAboveAge),
      expiringSoonCount: totalExpiringSoon,
      expiringSoonPct: calcPct(totalExpiringSoon),
      turning60SoonCount: turning60SoonList.length,
      allDepts, 
      urgentAlerts: alerts.slice(0, 20),
      contractsByMonth,
      futureTurning60List,
      currentYear,
      targetExpiryYear,
      kpiFilteredEmps
    };
  }, [allEmployees, filterCompany, filterDept, activeKpiFilter]);

  const filteredAge60ModalList = useMemo(() => {
    return dashboardData.futureTurning60List.filter((emp) => {
      const matchesYear = !ageFilterYear || String(emp.year60) === ageFilterYear;
      const matchesMonth = !ageFilterMonth || String(emp.month60) === ageFilterMonth;
      return matchesYear && matchesMonth;
    });
  }, [dashboardData.futureTurning60List, ageFilterYear, ageFilterMonth]);

  const ageData = useMemo(() => {
    const groups = {
      u30: { label: 'موظفين أعمارهم (أقل من 30)', count: 0, color: '#10b981', emps: [] as any[] },
      from30: { label: 'موظفين أعمارهم (30 - 39)', count: 0, color: '#3b82f6', emps: [] as any[] },
      from40: { label: 'موظفين أعمارهم (40 - 49)', count: 0, color: '#8b5cf6', emps: [] as any[] },
      from50: { label: 'موظفين أعمارهم (50 - 59)', count: 0, color: '#f59e0b', emps: [] as any[] },
      over60: { label: 'فوق السن (60+)', count: 0, color: '#ef4444', emps: [] as any[] },
      unrecorded: { label: 'غير مسجل', count: 0, color: '#94a3b8', emps: [] as any[] }
    };
    
    dashboardData.kpiFilteredEmps.forEach(emp => {
      const age = getEmployeeAge(emp);
      if (age === null) { groups.unrecorded.count++; groups.unrecorded.emps.push(emp); }
      else if (age < 30) { groups.u30.count++; groups.u30.emps.push(emp); }
      else if (age < 40) { groups.from30.count++; groups.from30.emps.push(emp); }
      else if (age < 50) { groups.from40.count++; groups.from40.emps.push(emp); }
      else if (age < 60) { groups.from50.count++; groups.from50.emps.push(emp); }
      else { groups.over60.count++; groups.over60.emps.push(emp); }
    });

    const total = dashboardData.kpiFilteredEmps.length || 1;
    return Object.values(groups)
      .filter(g => g.count > 0)
      .map(g => ({ ...g, pct: (g.count / total) * 100 }));
  }, [dashboardData.kpiFilteredEmps]);

  const sortedAgeGroupEmps = useMemo(() => {
    if (!selectedAgeGroup) return [];
    const emps = [...selectedAgeGroup.emps];
    return emps.sort((a, b) => {
      let valA, valB;
      if (ageSortCol === 'age') {
        valA = getEmployeeAge(a) || 0;
        valB = getEmployeeAge(b) || 0;
        return ageSortDir === 'asc' ? valA - valB : valB - valA;
      } else {
        const keyMap: Record<string, string[]> = {
          'employee_code': ['employee_code', 'EmployeeCode'],
          'employee_name': ['employee_name', 'ArabicName'],
          'department': ['department', 'Department'],
          'job_title': ['job_title', 'JobTitle'],
          'contract_type': ['contract_type', 'ContractType'],
          'contract_end_date': ['contract_end_date', 'ContractEndDate']
        };
        const keys = keyMap[ageSortCol] || [ageSortCol];
        valA = getField(a, ...keys);
        valB = getField(b, ...keys);
        const res = String(valA).localeCompare(String(valB), 'ar', { numeric: true });
        return ageSortDir === 'asc' ? res : -res;
      }
    });
  }, [selectedAgeGroup, ageSortCol, ageSortDir]);

  const handleAgeSort = (col: string) => {
    if (ageSortCol === col) {
      setAgeSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setAgeSortCol(col);
      setAgeSortDir('asc');
    }
  };

  const renderAgeSortArrow = (col: string) => {
    if (ageSortCol !== col) return <span style={{ opacity: 0.3, marginRight: '4px' }}>↕</span>;
    return ageSortDir === 'asc' ? <span style={{ color: '#0d9488', marginRight: '4px' }}>▲</span> : <span style={{ color: '#0d9488', marginRight: '4px' }}>▼</span>;
  };

  const handleRowClick = (empCode: string) => navigateTo('contracts', { jumpSearch: empCode });

  const dateFormatted = currentTime.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeFormatted = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const maxMonthCount = Math.max(...(dashboardData?.contractsByMonth.map((m) => m.count) || []), 1);

  const renderInteractiveDonutChart = () => {
    let cumulativePercentForSlices = 0;
    let cumulativePercentForText = 0;
    
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-6 mt-4">
        <div style={{ position: 'relative', width: '200px', height: '200px' }}>
          <svg width="100%" height="100%" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
            <circle cx="21" cy="21" r="15.91549431" fill="transparent" stroke="#f1f5f9" strokeWidth="6" />
            
            {ageData.map((slice, idx) => {
              const dashArray = `${slice.pct} ${100 - slice.pct}`;
              const dashOffset = 100 - cumulativePercentForSlices;
              cumulativePercentForSlices += slice.pct;
              
              return (
                <circle
                  key={`slice-${idx}`}
                  cx="21"
                  cy="21"
                  r="15.91549431"
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth="6"
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  onClick={() => setSelectedAgeGroup(slice)}
                  style={{ cursor: 'pointer', transition: 'stroke-width 0.2s ease-in-out, filter 0.2s' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.strokeWidth = '8';
                    e.currentTarget.style.filter = 'drop-shadow(0px 0px 4px rgba(0,0,0,0.2))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.strokeWidth = '6';
                    e.currentTarget.style.filter = 'none';
                  }}
                />
              );
            })}

            {ageData.map((slice, idx) => {
              const midPct = cumulativePercentForText + slice.pct / 2;
              cumulativePercentForText += slice.pct;

              if (slice.pct < 1) return null;

              const angle = (midPct / 100) * 2 * Math.PI;
              const r = 15.91549431; 
              const x = 21 + r * Math.cos(angle);
              const y = 21 + r * Math.sin(angle);

              return (
                <text
                  key={`text-${idx}`}
                  x={x}
                  y={y}
                  fill="#ffffff"
                  fontSize="2.5"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(90 ${x} ${y})`}
                  style={{ pointerEvents: 'none', textShadow: '0px 1px 2px rgba(0,0,0,0.6)' }}
                >
                  {Math.round(slice.pct)}%
                </text>
              );
            })}
          </svg>
          
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyItems: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginTop: '70px' }}>تصفية الفلتر</span>
            <span style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a' }}>{dashboardData.kpiFilteredCount.toLocaleString('en-US')}</span>
          </div>
        </div>

        <div className="w-full grid grid-cols-2 gap-y-3 gap-x-2 text-[11px] font-bold px-2">
          {ageData.map((slice, idx) => (
            <div 
              key={idx} 
              className="flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors" 
              title="اضغط لعرض الموظفين"
              onClick={() => setSelectedAgeGroup(slice)}
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = slice.color}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
            >
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: slice.color }} />
              <span className="text-[#334155] truncate flex-1">{slice.label}</span>
              <span className="text-[#0f172a] font-mono bg-white px-2 py-0.5 rounded shadow-sm">({slice.count})</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5" style={{ direction: 'rtl', paddingBottom: '40px', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      
      {/* رأس الصفحة */}
      <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="m-0 text-lg sm:text-xl font-extrabold tracking-tight" style={{ color: '#0f172a' }}>
            بوابة تجديد العقود لشركة المراسم الدولية والشركات الشقيقة
          </h2>
          <div className="flex items-center gap-3 mt-2 text-[12px] font-bold" style={{ color: '#64748b' }}>
            <span>📅 {dateFormatted}</span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span className="font-mono" style={{ color: '#0d9488' }}>⏰ {timeFormatted}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input list="dashCompList" className="field" placeholder="🏢 كل الشركات (ابحث...)" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
