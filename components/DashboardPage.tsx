'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { navigateTo } from '@/lib/navigation';
import { useAppData } from '@/lib/DataContext';
import KpiCard from './KpiCard';
import Stamp from './Stamp';

/* ───────────────────────── Helpers (outside the component) ───────────────────────── */

// Change this if your contracts table has no `id` column. It must be unique and stable,
// otherwise .range() pagination can repeat or skip rows.
const CONTRACTS_ORDER_COLUMN = 'id';

const getField = (obj: any, ...keys: string[]) => {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return String(obj[key]).trim();
  }
  return '';
};

// توحيد كود الموظف (لا يحوّل "0" أو "000" إلى نص فارغ)
const cleanCode = (code: any) =>
  code === null || code === undefined ? '' : String(code).trim().replace(/^0+(?=.)/, '');

// Parse yyyy-mm-dd as LOCAL midnight (new Date('yyyy-mm-dd') is UTC and shifts days)
const parseLocalDate = (v: any): Date | null => {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const startOfToday = () => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
};

const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Birth date from explicit field, else from the Egyptian national ID
const resolveBirthDate = (nationalId: any, birthDateRaw?: any): Date | null => {
  const b = parseLocalDate(birthDateRaw);
  if (b) return b;
  const id = String(nationalId ?? '').replace(/\D/g, '');
  if (id.length !== 14) return null;
  const century = id[0] === '3' ? 2000 : id[0] === '2' ? 1900 : null;
  if (!century) return null;
  const y = century + +id.slice(1, 3);
  const mo = +id.slice(3, 5);
  const d = +id.slice(5, 7);
  const dt = new Date(y, mo - 1, d);
  return dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : null; // rejects invalid dates
};

const getDaysRemaining = (endDateStr: string | null) => {
  const end = parseLocalDate(endDateStr);
  return end ? daysBetween(startOfToday(), end) : null;
};

const getAge60Info = (nationalId: any, birthDateRaw?: any) => {
  const birth = resolveBirthDate(nationalId, birthDateRaw);
  if (!birth) return null;
  const a60 = new Date(birth.getFullYear() + 60, birth.getMonth(), birth.getDate());
  return {
    birthDate: fmtDate(birth),
    age60Date: fmtDate(a60),
    daysUntil60: daysBetween(startOfToday(), a60),
    year60: a60.getFullYear(),
    month60: a60.getMonth() + 1,
    day60: a60.getDate(),
  };
};

const calcAge = (birth: Date) => {
  const t = new Date();
  let age = t.getFullYear() - birth.getFullYear();
  const m = t.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < birth.getDate())) age--;
  return age;
};

// Computed from the birth date first; the stored age field is only a fallback (it goes stale)
const getEmployeeAge = (emp: any) => {
  const birth = resolveBirthDate(getField(emp, 'national_id', 'NationalID'), getField(emp, 'birth_date', 'BirthDate'));
  if (birth) return calcAge(birth);
  const raw = getField(emp, 'age', 'Age');
  return raw !== '' && !isNaN(Number(raw)) ? Number(raw) : null;
};

// Single source of truth for contract classification
const isPermanent = (t: string) => t.includes('دائم') || t.includes('غير محدد');
const isAboveAge = (t: string) => t.includes('فوق السن');
const isFixed = (t: string) => !isPermanent(t) && !isAboveAge(t);

// Exact match when the filter equals a value picked from the list, otherwise substring match
const matchText = (value: string, filter: string, options: string[]) => {
  if (!filter) return true;
  const v = value.toLowerCase();
  const f = filter.toLowerCase();
  return options.some((o) => o.toLowerCase() === f) ? v === f : v.includes(f);
};

const getType = (emp: any) => String(getField(emp, 'contract_type', 'ContractType') || 'محدد المدة').trim();
const getDept = (emp: any) => String(getField(emp, 'department', 'Department') || 'غير محدد').trim();

/* ───────────────────────── Clock (isolated so it doesn't re-render the dashboard) ───────────────────────── */

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-3 mt-2 text-[12px] font-bold" style={{ color: '#64748b' }}>
      <span>📅 {now.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
      <span style={{ color: '#cbd5e1' }}>|</span>
      <span className="font-mono" style={{ color: '#0d9488' }}>
        ⏰ {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </div>
  );
}

/* ───────────────────────── Contracts fetching ───────────────────────── */

const fetchAllContracts = async () => {
  const rows: any[] = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const { data, error } = await supabase
      .from('contracts')
      .select('employee_code, contract_type, contract_start_date, contract_end_date, status')
      .order(CONTRACTS_ORDER_COLUMN, { ascending: true })
      .range(from, from + step - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < step) break;
  }
  return rows;
};

/* ───────────────────────── Component ───────────────────────── */

export default function DashboardPage() {
  const { employees: contextEmployees, loading: contextLoading, refresh: refreshContext } = useAppData();

  const [contracts, setContracts] = useState<any[]>([]);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [filterCompany, setFilterCompany] = useState('');
  const [filterDept, setFilterDept] = useState('');

  const [activeKpiFilter, setActiveKpiFilter] = useState<'all' | 'fixed' | 'perm' | 'aboveAge' | 'expiring' | 'turning60'>('all');

  const [showAgeModal, setShowAgeModal] = useState(false);

  const currentYear = new Date().getFullYear();
  const currentYearStr = String(currentYear);
  const [ageFilterYear, setAgeFilterYear] = useState<string>(currentYearStr);
  const [ageFilterMonth, setAgeFilterMonth] = useState<string>('');

  // Year shown in the monthly expiry chart (current year by default, matching the title)
  const [chartYear, setChartYear] = useState<number>(currentYear);

  const [selectedChartMonth, setSelectedChartMonth] = useState<{ name: string; emps: any[] } | null>(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<{ label: string; count: number; color: string; emps: any[] } | null>(null);

  const [ageSortCol, setAgeSortCol] = useState<string>('employee_name');
  const [ageSortDir, setAgeSortDir] = useState<'asc' | 'desc'>('asc');

  // Fetch contracts independently of employees; re-runs only on mount / manual reload
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setContractsLoading(true);
      setLoadError(null);
      try {
        const rows = await fetchAllContracts();
        if (!cancelled) setContracts(rows);
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading contracts:', err);
        setContracts([]);
        setLoadError('تعذر تحميل العقود، البيانات المعروضة قد تكون غير مكتملة');
      } finally {
        if (!cancelled) setContractsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const loading = contextLoading || contractsLoading;

  // Merge latest contract into each employee (derived data, so no double-runs or stale state)
  const allEmployees = useMemo(() => {
    const contractsMap = new Map<string, any[]>();
    contracts.forEach((c) => {
      if (!c) return;
      const code = cleanCode(c.employee_code);
      if (!code) return;
      if (!contractsMap.has(code)) contractsMap.set(code, []);
      contractsMap.get(code)!.push(c);
    });

    return (contextEmployees || []).map((emp: any) => {
      const code = cleanCode(getField(emp, 'employee_code', 'EmployeeCode'));
      const empContracts = [...(contractsMap.get(code) || [])].sort((a, b) => {
        if (a.status === 'Active' && b.status !== 'Active') return -1;
        if (a.status !== 'Active' && b.status === 'Active') return 1;
        const dateA = parseLocalDate(a.contract_end_date)?.getTime() ?? 0;
        const dateB = parseLocalDate(b.contract_end_date)?.getTime() ?? 0;
        return dateB - dateA;
      });
      const latest = empContracts[0];

      return {
        ...emp,
        contract_type: latest?.contract_type || emp.contract_type || '—',
        contract_start_date: latest?.contract_start_date || emp.hiring_date || null,
        contract_end_date: latest?.contract_end_date || emp.contract_end_date || null,
      };
    });
  }, [contextEmployees, contracts]);

  const companiesList = useMemo(
    () => Array.from(new Set(allEmployees.map((e: any) => getField(e, 'company', 'Company')).filter(Boolean))) as string[],
    [allEmployees]
  );
  const deptsList = useMemo(
    () => Array.from(new Set(allEmployees.map((e: any) => getField(e, 'department', 'Department')).filter(Boolean))) as string[],
    [allEmployees]
  );

  const yearOptions = useMemo(() => Array.from({ length: 6 }, (_, i) => String(currentYear + i)), [currentYear]);

  const dashboardData = useMemo(() => {
    const activeEmployeesOnly = allEmployees.filter(
      (emp: any) =>
        String(getField(emp, 'status', 'Status') || 'Active').toLowerCase() === 'active' &&
        !String(getField(emp, 'department', 'Department') || '').includes('تحويلات')
    );

    const matchesKpi = (emp: any) => {
      const type = getType(emp);
      const days = getDaysRemaining(getField(emp, 'contract_end_date', 'ContractEndDate'));
      switch (activeKpiFilter) {
        case 'fixed':
          return isFixed(type);
        case 'perm':
          return isPermanent(type);
        case 'aboveAge':
          return isAboveAge(type);
        case 'expiring':
          return !isPermanent(type) && days !== null && days >= 0 && days <= 60;
        case 'turning60': {
          const a = getAge60Info(getField(emp, 'national_id', 'NationalID'), getField(emp, 'birth_date', 'BirthDate'));
          return !!a && a.daysUntil60 >= 0 && a.daysUntil60 <= 60;
        }
        default:
          return true;
      }
    };

    const companyFiltered = activeEmployeesOnly.filter((e: any) =>
      matchText(getField(e, 'company', 'Company'), filterCompany, companiesList)
    );
    const baseFilteredEmps = companyFiltered.filter((e: any) => matchText(getDept(e), filterDept, deptsList));
    const kpiFilteredEmps = baseFilteredEmps.filter(matchesKpi);

    let totalFixed = 0,
      totalPerm = 0,
      totalAboveAge = 0,
      totalExpiringSoon = 0;
    const futureTurning60List: any[] = [];
    let turning60SoonCount = 0;

    baseFilteredEmps.forEach((emp: any) => {
      const type = getType(emp);
      const empCode = getField(emp, 'employee_code', 'EmployeeCode');
      const empName = getField(emp, 'employee_name', 'ArabicName', 'EmployeeName');

      if (isPermanent(type)) totalPerm++;
      else if (isAboveAge(type)) totalAboveAge++;
      else totalFixed++;

      const days = getDaysRemaining(getField(emp, 'contract_end_date', 'ContractEndDate'));
      if (!isPermanent(type) && days !== null && days >= 0 && days <= 60) totalExpiringSoon++;

      const ageInfo = getAge60Info(getField(emp, 'national_id', 'NationalID'), getField(emp, 'birth_date', 'BirthDate'));
      if (ageInfo && ageInfo.daysUntil60 >= 0) {
        futureTurning60List.push({
          ...emp,
          employee_code: empCode,
          employee_name: empName,
          department: getDept(emp),
          contract_type: type,
          birthDate: ageInfo.birthDate,
          age60Date: ageInfo.age60Date,
          daysLeft: ageInfo.daysUntil60,
          year60: ageInfo.year60,
          month60: ageInfo.month60,
        });
        if (ageInfo.daysUntil60 <= 60) turning60SoonCount++;
      }
    });

    // Department chart ignores the department filter so you can switch between departments
    const deptsCount: Record<string, number> = {};
    companyFiltered.filter(matchesKpi).forEach((emp: any) => {
      const d = getDept(emp);
      deptsCount[d] = (deptsCount[d] || 0) + 1;
    });

    const alerts: any[] = [];
    const monthsNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const contractsByMonth = monthsNames.map((name) => ({ name, count: 0, emps: [] as any[] }));

    kpiFilteredEmps.forEach((emp: any) => {
      const type = getType(emp);
      const dept = getDept(emp);
      const endDateStr = getField(emp, 'contract_end_date', 'ContractEndDate');
      const empCode = getField(emp, 'employee_code', 'EmployeeCode');
      const empName = getField(emp, 'employee_name', 'ArabicName', 'EmployeeName');

      if (!isPermanent(type)) {
        const endDate = parseLocalDate(endDateStr);
        if (endDate && endDate.getFullYear() === chartYear) {
          const m = endDate.getMonth();
          contractsByMonth[m].count++;
          contractsByMonth[m].emps.push({
            employee_code: empCode,
            employee_name: empName,
            department: dept,
            contract_end_date: endDateStr,
          });
        }

        const days = getDaysRemaining(endDateStr);
        if (days !== null && days >= 0 && days <= 60) {
          alerts.push({ ...emp, employee_code: empCode, employee_name: empName, department: dept, contract_end_date: endDateStr, days, status: 'expiring' });
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
      turning60SoonCount,
      allDepts,
      alertsTotal: alerts.length,
      urgentAlerts: alerts.slice(0, 20),
      contractsByMonth,
      futureTurning60List,
      kpiFilteredEmps,
    };
  }, [allEmployees, filterCompany, filterDept, activeKpiFilter, chartYear, companiesList, deptsList]);

  const filteredAge60ModalList = useMemo(() => {
    return dashboardData.futureTurning60List.filter((emp) => {
      const matchesYear = !ageFilterYear || String(emp.year60) === ageFilterYear;
      const matchesMonth = !ageFilterMonth || String(emp.month60) === ageFilterMonth;
      return matchesYear && matchesMonth;
    });
  }, [dashboardData.futureTurning60List, ageFilterYear, ageFilterMonth]);

  // التوزيع العمري
  const ageData = useMemo(() => {
    const groups = {
      u30: { label: 'موظفين أعمارهم (أقل من 30)', count: 0, color: '#10b981', emps: [] as any[] },
      from30: { label: 'موظفين أعمارهم (30 - 39)', count: 0, color: '#3b82f6', emps: [] as any[] },
      from40: { label: 'موظفين أعمارهم (40 - 49)', count: 0, color: '#8b5cf6', emps: [] as any[] },
      from50: { label: 'موظفين أعمارهم (50 - 59)', count: 0, color: '#f59e0b', emps: [] as any[] },
      over60: { label: 'فوق السن (60+)', count: 0, color: '#ef4444', emps: [] as any[] },
      unrecorded: { label: 'غير مسجل', count: 0, color: '#94a3b8', emps: [] as any[] },
    };

    dashboardData.kpiFilteredEmps.forEach((emp: any) => {
      const age = getEmployeeAge(emp);
      if (age === null) { groups.unrecorded.count++; groups.unrecorded.emps.push(emp); }
      else if (age < 30) { groups.u30.count++; groups.u30.emps.push(emp); }
      else if (age < 40) { groups.from30.count++; groups.from30.emps.push(emp); }
      else if (age < 50) { groups.from40.count++; groups.from40.emps.push(emp); }
      else if (age < 60) { groups.from50.count++; groups.from50.emps.push(emp); }
      else { groups.over60.count++; groups.over60.emps.push(emp); }
    });

    const total = dashboardData.kpiFilteredEmps.length || 1;
    const validGroups = Object.values(groups).filter((g) => g.count > 0);

    let currentOffset = 100;
    let currentTextPct = 0;

    return validGroups.map((g) => {
      const pct = (g.count / total) * 100;
      const dashOffset = currentOffset;
      currentOffset -= pct;

      const midPct = currentTextPct + pct / 2;
      currentTextPct += pct;

      return { ...g, pct, dashOffset, midPct };
    });
  }, [dashboardData.kpiFilteredEmps]);

  const sortedAgeGroupEmps = useMemo(() => {
    if (!selectedAgeGroup) return [];
    const emps = [...selectedAgeGroup.emps];
    return emps.sort((a, b) => {
      if (ageSortCol === 'age') {
        const valA = getEmployeeAge(a) ?? 0;
        const valB = getEmployeeAge(b) ?? 0;
        return ageSortDir === 'asc' ? valA - valB : valB - valA;
      }
      const keyMap: Record<string, string[]> = {
        employee_code: ['employee_code', 'EmployeeCode'],
        employee_name: ['employee_name', 'ArabicName', 'EmployeeName'],
        department: ['department', 'Department'],
        job_title: ['job_title', 'JobTitle'],
        contract_type: ['contract_type', 'ContractType'],
        contract_end_date: ['contract_end_date', 'ContractEndDate'],
      };
      const keys = keyMap[ageSortCol] || [ageSortCol];
      const res = getField(a, ...keys).localeCompare(getField(b, ...keys), 'ar', { numeric: true });
      return ageSortDir === 'asc' ? res : -res;
    });
  }, [selectedAgeGroup, ageSortCol, ageSortDir]);

  const handleAgeSort = (col: string) => {
    if (ageSortCol === col) {
      setAgeSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setAgeSortCol(col);
      setAgeSortDir('asc');
    }
  };

  const renderAgeSortArrow = (col: string) => {
    if (ageSortCol !== col) return <span style={{ opacity: 0.3, marginRight: '4px' }}>↕</span>;
    return ageSortDir === 'asc'
      ? <span style={{ color: '#0d9488', marginRight: '4px' }}>▲</span>
      : <span style={{ color: '#0d9488', marginRight: '4px' }}>▼</span>;
  };

  const handleRowClick = (empCode: string) => navigateTo('contracts', { jumpSearch: empCode });

  const handleRefresh = () => {
    refreshContext();
    setReloadKey((k) => k + 1);
  };

  const maxMonthCount = Math.max(...dashboardData.contractsByMonth.map((m) => m.count), 1);

  return (
    <div className="flex flex-col gap-5" style={{ direction: 'rtl', paddingBottom: '40px' }}>

      {/* رأس الصفحة */}
      <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="m-0 text-lg sm:text-xl font-extrabold tracking-tight" style={{ color: '#0f172a' }}>
            بوابة تجديد العقود لشركة المراسم الدولية والشركات الشقيقة
          </h2>
          <Clock />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input list="dashCompList" className="field" placeholder="🏢 كل الشركات (ابحث...)" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
          <datalist id="dashCompList">{companiesList.map((c, i) => <option key={i} value={c} />)}</datalist>

          <input list="dashDeptList" className="field" placeholder="💼 كل الإدارات (ابحث...)" value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
          <datalist id="dashDeptList">{deptsList.map((d, i) => <option key={i} value={d} />)}</datalist>

          <button style={{ background: '#0d9488', color: '#fff', border: 0, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }} onClick={handleRefresh}>تحديث البيانات 🔄</button>

          {(filterCompany || filterDept || activeKpiFilter !== 'all') && (
            <button style={{ background: '#f1f5f9', border: 0, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', color: '#334155' }} onClick={() => { setFilterCompany(''); setFilterDept(''); setActiveKpiFilter('all'); }}>إعادة ضبط الفلاتر</button>
          )}
        </div>
      </div>

      {loadError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 16px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
          ⚠️ {loadError}
        </div>
      )}

      {/* 🌟 الكروت السريعة */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div style={{ outline: activeKpiFilter === 'all' ? '2px solid #0d9488' : 'none', borderRadius: '12px', transition: 'all 0.2s' }}>
          <KpiCard
            loading={loading}
            tone="brass"
            title="إجمالي الموظفين"
            value={dashboardData.totalEmps}
            sub={activeKpiFilter === 'all' ? 'المعروض (الكل)' : 'اضغط لعرض الكل'}
            icon="👥"
            onClick={() => setActiveKpiFilter('all')}
          />
        </div>

        <div style={{ outline: activeKpiFilter === 'fixed' ? '2px solid #3b82f6' : 'none', borderRadius: '12px', transition: 'all 0.2s' }}>
          <KpiCard
            loading={loading}
            tone="blue"
            title="عقود محددة المدة"
            value={dashboardData.fixedCount}
            sub={`نسبة ${dashboardData.fixedPct}% من القوة`}
            icon="📂"
            onClick={() => setActiveKpiFilter(activeKpiFilter === 'fixed' ? 'all' : 'fixed')}
          />
        </div>

        <div style={{ outline: activeKpiFilter === 'perm' ? '2px solid #10b981' : 'none', borderRadius: '12px', transition: 'all 0.2s' }}>
          <KpiCard
            loading={loading}
            tone="green"
            title="عقود دائمة"
            value={dashboardData.permCount}
            sub={`نسبة ${dashboardData.permPct}% من القوة`}
            icon="🛡️"
            onClick={() => setActiveKpiFilter(activeKpiFilter === 'perm' ? 'all' : 'perm')}
          />
        </div>

        <div style={{ outline: activeKpiFilter === 'aboveAge' ? '2px solid #8b5cf6' : 'none', borderRadius: '12px', transition: 'all 0.2s' }}>
          <KpiCard
            loading={loading}
            tone="purple"
            title="فوق السن (60+)"
            value={dashboardData.aboveAgeCount}
            sub={`نسبة ${dashboardData.aboveAgePct}% من القوة`}
            icon="💼"
            onClick={() => setActiveKpiFilter(activeKpiFilter === 'aboveAge' ? 'all' : 'aboveAge')}
          />
        </div>

        <div style={{ outline: activeKpiFilter === 'expiring' ? '2px solid #f59e0b' : 'none', borderRadius: '12px', transition: 'all 0.2s' }}>
          <KpiCard
            loading={loading}
            tone="amber"
            title="تنتهي قريباً (60 يوم)"
            value={dashboardData.expiringSoonCount}
            sub={`نسبة ${dashboardData.expiringSoonPct}% من القوة`}
            icon="⏳"
            onClick={() => setActiveKpiFilter(activeKpiFilter === 'expiring' ? 'all' : 'expiring')}
          />
        </div>

        <div style={{ outline: activeKpiFilter === 'turning60' ? '2px solid #ef4444' : 'none', borderRadius: '12px', transition: 'all 0.2s' }}>
          <KpiCard
            loading={loading}
            tone="red"
            title="سيبلغون الـ 60 (60 يوم)"
            value={dashboardData.turning60SoonCount}
            sub="عرض الجدول والنافذة 🎂"
            icon="🎂"
            onClick={() => {
              setActiveKpiFilter('turning60');
              setAgeFilterYear(''); // so the modal matches the card's 60-day window
              setAgeFilterMonth('');
              setShowAgeModal(true);
            }}
          />
        </div>
      </div>

      {/* شريط الإشعار بالفلتر النشط */}
      {activeKpiFilter !== 'all' && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#166534', fontWeight: 'bold' }}>
          <span>
            🔍 تم تصفية الشاشة والرسوم البيانية لعرض: <strong>
              {activeKpiFilter === 'fixed' && 'العقود محددة المدة'}
              {activeKpiFilter === 'perm' && 'العقود الدائمة'}
              {activeKpiFilter === 'aboveAge' && 'العمالة فوق السن (60+)'}
              {activeKpiFilter === 'expiring' && 'العقود التي تنتهي خلال 60 يوم'}
              {activeKpiFilter === 'turning60' && 'الموظفين البالغين لسن التقاعد قريباً'}
            </strong> ({dashboardData.kpiFilteredCount} موظف)
          </span>
          <button onClick={() => setActiveKpiFilter('all')} style={{ background: '#ffffff', border: '1px solid #86efac', color: '#15803d', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
            عرض الكل ✕
          </button>
        </div>
      )}

      {/* الرسوم البيانية المتفاعلة */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column' }}>
          <div className="flex items-center justify-between mb-5">
            <h4 className="m-0 text-[13.5px] font-extrabold" style={{ color: '#0f172a' }}>📊 توزيع الموظفين على الإدارات</h4>
            <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#64748b', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold' }}>اضغط للفلترة 🖱️</span>
          </div>
          <div className="flex flex-col gap-3 overflow-y-auto pr-1" style={{ maxHeight: '250px' }}>
            {dashboardData.allDepts.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', padding: '20px' }}>لا توجد بيانات مطابقة لهذا الفلتر</div>
            ) : dashboardData.allDepts.map((dept, idx) => {
              const max = dashboardData.allDepts[0]?.count || 1;
              const percentage = (dept.count / max) * 100;
              const isActiveDept = filterDept === dept.name;
              return (
                <div
                  key={idx}
                  onClick={() => setFilterDept(isActiveDept ? '' : dept.name)}
                  style={{
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '8px',
                    background: isActiveDept ? '#f0fdf4' : 'transparent',
                    border: isActiveDept ? '1px solid #86efac' : '1px solid transparent',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => !isActiveDept && (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => !isActiveDept && (e.currentTarget.style.background = 'transparent')}
                >
                  <div className="flex justify-between text-[11px] font-bold mb-1.5" style={{ color: isActiveDept ? '#15803d' : '#334155' }}>
                    <span className="truncate pl-2" title={dept.name}>{dept.name}</span>
                    <span className="font-mono bg-white px-2 py-0.5 rounded border shadow-sm">{dept.count.toLocaleString('en-US')}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${percentage}%`, background: isActiveDept ? '#10b981' : 'linear-gradient(90deg, #14b8a6, #0d9488)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }} className="flex flex-col lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h4 className="m-0 text-[13.5px] font-extrabold" style={{ color: '#0f172a' }}>
              📈 توزيع تجديد عقود المجموعه لعام {chartYear}
            </h4>
            <select
              value={chartYear}
              onChange={(e) => setChartYear(Number(e.target.value))}
              style={{ fontSize: '11px', fontWeight: 'bold', color: '#2563eb', background: '#eff6ff', padding: '4px 12px', borderRadius: '8px', border: '1px solid #bfdbfe', outline: 'none' }}
            >
              <option value={currentYear}>عقود {currentYear} 📅</option>
              <option value={currentYear + 1}>خطة عقود {currentYear + 1} 📅</option>
            </select>
          </div>
          <div className="flex-1 flex items-end gap-1.5 sm:gap-2 h-[150px] pb-4 border-b" style={{ borderColor: '#e2e8f0' }}>
            {dashboardData.contractsByMonth.map((month, idx) => {
              const height = maxMonthCount > 0 ? (month.count / maxMonthCount) * 100 : 0;
              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center justify-end h-full"
                  onClick={() => month.count > 0 && setSelectedChartMonth(month)}
                  style={{ cursor: month.count > 0 ? 'pointer' : 'default', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => month.count > 0 && (e.currentTarget.style.opacity = '0.8')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  <span className="text-[10px] font-mono font-bold mb-1" style={{ color: month.count > 0 ? '#10b981' : 'transparent' }}>
                    {month.count.toLocaleString('en-US')}
                  </span>
                  <div className="w-full max-w-[32px] rounded-t-md transition-all duration-700" style={{ height: `${height}%`, minHeight: month.count > 0 ? '4px' : '0', background: month.count > 0 ? 'linear-gradient(180deg, #2dd4bf, #0d9488)' : '#f1f5f9' }} />
                  <span className="text-[10px] font-bold mt-2" style={{ color: '#64748b' }}>{month.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">

        {/* 🎂 كارت التوزيع العمري */}
        <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }} className="lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <h3 style={{ margin: 0, fontSize: '13.5px', color: '#0f172a', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🎂 التوزيع العمري للقوة العاملة
            </h3>
            <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#64748b', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold' }}>تفاعلي 👆</span>
          </div>

          <div style={{ height: '330px', width: '100%' }}>
            {ageData.length > 0 ? (
              <div className="flex flex-col items-center justify-center w-full h-full gap-6 mt-4">
                <div style={{ position: 'relative', width: '200px', height: '200px' }}>
                  <svg width="100%" height="100%" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
                    <circle cx="21" cy="21" r="15.91549431" fill="transparent" stroke="#f1f5f9" strokeWidth="6" />

                    {ageData.map((slice, idx) => (
                      <circle
                        key={`slice-${idx}`}
                        cx="21"
                        cy="21"
                        r="15.91549431"
                        fill="transparent"
                        stroke={slice.color}
                        strokeWidth="6"
                        strokeDasharray={`${slice.pct} ${100 - slice.pct}`}
                        strokeDashoffset={slice.dashOffset}
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
                    ))}

                    {ageData.map((slice, idx) => {
                      if (slice.pct < 1) return null;
                      const angle = (slice.midPct / 100) * 2 * Math.PI;
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

                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>تصفية الفلتر</span>
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
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = slice.color)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                    >
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: slice.color }} />
                      <span className="text-[#334155] truncate flex-1">{slice.label}</span>
                      <span className="text-[#0f172a] font-mono bg-white px-2 py-0.5 rounded shadow-sm">({slice.count})</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 'bold' }}>
                لا توجد بيانات عمرية متاحة للفئة المحددة
              </div>
            )}
          </div>
        </div>

        {/* 🚨 المهام العاجلة */}
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }} className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h4 className="m-0 text-[13.5px] font-extrabold flex items-center gap-2" style={{ color: '#dc2626' }}>
              <span className="text-base">🚨</span> مهام عاجلة للمجموعة العاملة (تنتهي خلال 60 يوم) ({dashboardData.alertsTotal})
              {dashboardData.alertsTotal > dashboardData.urgentAlerts.length && (
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>— عرض أول {dashboardData.urgentAlerts.length}</span>
              )}
            </h4>
          </div>
          {dashboardData.urgentAlerts.length === 0 ? (
            <div className="text-center py-8 rounded-xl text-[13px] font-bold" style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
              لا توجد مهام عاجلة طبقاً للفلتر! 🎉
            </div>
          ) : (
            <div className="overflow-y-auto pr-1" style={{ maxHeight: '290px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ padding: '8px' }}>الكود</th>
                    <th style={{ padding: '8px' }}>الموظف</th>
                    <th style={{ padding: '8px' }}>الإدارة</th>
                    <th style={{ padding: '8px' }}>الانتهاء</th>
                    <th style={{ padding: '8px' }}>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.urgentAlerts.map((alert) => (
                    <tr key={alert.id || alert.employee_code} onClick={() => handleRowClick(alert.employee_code)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '8px', fontWeight: 'bold', fontFamily: 'monospace', color: '#0d9488' }}>{getField(alert, 'employee_code', 'EmployeeCode')}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold', color: '#0f172a' }}>{getField(alert, 'employee_name', 'ArabicName')}</td>
                      <td style={{ padding: '8px', color: '#64748b', fontSize: '11px' }}>{alert.department || '—'}</td>
                      <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 'bold' }}>{alert.contract_end_date}</td>
                      <td style={{ padding: '8px' }}>
                        <Stamp color="amber">متبقي {alert.days} يوم</Stamp>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedAgeGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: 'min(900px, 100%)', maxHeight: '85vh', overflowY: 'auto', background: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '20px' }}>
              <div className="flex items-center gap-3">
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: selectedAgeGroup.color }} />
                <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>
                  موظفين في شريحة: {selectedAgeGroup.label}
                </h3>
              </div>
              <button onClick={() => setSelectedAgeGroup(null)} style={{ background: '#f1f5f9', border: 0, color: '#64748b', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>
              العدد الإجمالي: <span style={{ color: selectedAgeGroup.color, fontSize: '16px' }}>{selectedAgeGroup.count}</span> موظف
            </div>

            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', userSelect: 'none' }}>
                    <th onClick={() => handleAgeSort('employee_code')} style={{ padding: '10px', cursor: 'pointer' }}>الكود {renderAgeSortArrow('employee_code')}</th>
                    <th onClick={() => handleAgeSort('employee_name')} style={{ padding: '10px', cursor: 'pointer' }}>الموظف {renderAgeSortArrow('employee_name')}</th>
                    <th onClick={() => handleAgeSort('department')} style={{ padding: '10px', cursor: 'pointer' }}>الإدارة {renderAgeSortArrow('department')}</th>
                    <th onClick={() => handleAgeSort('job_title')} style={{ padding: '10px', cursor: 'pointer' }}>الوظيفة {renderAgeSortArrow('job_title')}</th>
                    <th onClick={() => handleAgeSort('age')} style={{ padding: '10px', textAlign: 'center', cursor: 'pointer' }}>السن {renderAgeSortArrow('age')}</th>
                    <th onClick={() => handleAgeSort('contract_type')} style={{ padding: '10px', cursor: 'pointer' }}>نوع العقد {renderAgeSortArrow('contract_type')}</th>
                    <th onClick={() => handleAgeSort('contract_end_date')} style={{ padding: '10px', cursor: 'pointer' }}>نهاية العقد {renderAgeSortArrow('contract_end_date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAgeGroupEmps.map((emp: any, idx: number) => {
                    const age = getEmployeeAge(emp);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#0d9488' }}>{getField(emp, 'employee_code', 'EmployeeCode')}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{getField(emp, 'employee_name', 'ArabicName')}</td>
                        <td style={{ padding: '10px', color: '#64748b' }}>{getField(emp, 'department', 'Department') || '—'}</td>
                        <td style={{ padding: '10px', color: '#64748b' }}>{getField(emp, 'job_title', 'JobTitle') || '—'}</td>
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: selectedAgeGroup.color }}>{age !== null ? `${age} سنة` : '—'}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{getField(emp, 'contract_type', 'ContractType') || '—'}</td>
                        <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold' }}>{getField(emp, 'contract_end_date', 'ContractEndDate') || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showAgeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: 'min(850px, 100%)', maxHeight: '85vh', overflowY: 'auto', background: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#d97706', fontWeight: '900' }}>
                🎂 جدولة الموظفين القادمين لسن الـ 60 (المتقاعدون مستقبلاً)
              </h3>
              <button onClick={() => setShowAgeModal(false)} style={{ background: '#fef3c7', border: 0, color: '#b45309', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>فلترة موعد التقاعد القادم:</span>

              <select value={ageFilterYear} onChange={(e) => setAgeFilterYear(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold', outline: 'none' }}>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>سنة {y}</option>
                ))}
                <option value="">كل السنوات</option>
              </select>

              <select value={ageFilterMonth} onChange={(e) => setAgeFilterMonth(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold', outline: 'none' }}>
                <option value="">كل الشهور</option>
                <option value="1">يناير (01)</option>
                <option value="2">فبراير (02)</option>
                <option value="3">مارس (03)</option>
                <option value="4">أبريل (04)</option>
                <option value="5">مايو (05)</option>
                <option value="6">يونيو (06)</option>
                <option value="7">يوليو (07)</option>
                <option value="8">أغسطس (08)</option>
                <option value="9">سبتمبر (09)</option>
                <option value="10">أكتوبر (10)</option>
                <option value="11">نوفمبر (11)</option>
                <option value="12">ديسمبر (12)</option>
              </select>

              {(ageFilterYear !== currentYearStr || ageFilterMonth !== '') && (
                <button onClick={() => { setAgeFilterYear(currentYearStr); setAgeFilterMonth(''); }} style={{ background: '#e2e8f0', border: 0, padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', color: '#334155' }}>
                  إعادة ضبط الفلتر
                </button>
              )}

              <div style={{ marginRight: 'auto', fontSize: '12px', fontWeight: 'bold', color: '#0d9488' }}>
                عدد الموظفين: {filteredAge60ModalList.length}
              </div>
            </div>

            {filteredAge60ModalList.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا يوجد موظفون سيبلغون الـ 60 في التاريخ المحدد. 🎉</div>
            ) : (
              <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '10px' }}>الكود</th>
                      <th style={{ padding: '10px' }}>الموظف</th>
                      <th style={{ padding: '10px' }}>الإدارة</th>
                      <th style={{ padding: '10px' }}>نوع العقد</th>
                      <th style={{ padding: '10px' }}>تاريخ الميلاد</th>
                      <th style={{ padding: '10px' }}>تاريخ بلوغ الـ 60</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>المتبقي لبلوغ الـ 60</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAge60ModalList.map((emp: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: emp.daysLeft <= 60 ? '#fffbe1' : 'transparent' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#0d9488' }}>{getField(emp, 'employee_code', 'EmployeeCode')}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{getField(emp, 'employee_name', 'ArabicName')}</td>
                        <td style={{ padding: '10px', color: '#64748b' }}>{emp.department || '—'}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{emp.contract_type}</td>
                        <td style={{ padding: '10px', fontFamily: 'monospace' }}>{emp.birthDate}</td>
                        <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold', color: '#b45309' }}>{emp.age60Date}</td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {emp.daysLeft <= 60 ? (
                            <span style={{ background: '#fffbe1', color: '#b45309', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #fde68a' }}>⏳ متبقي {emp.daysLeft} يوم</span>
                          ) : (
                            <span style={{ color: '#0d9488', fontWeight: 'bold' }}>📅 متبقي {emp.daysLeft} يوم</span>
                          )}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <button onClick={() => { setShowAgeModal(false); handleRowClick(getField(emp, 'employee_code', 'EmployeeCode')); }} style={{ background: '#ffffff', color: '#0d9488', border: '1px solid #99f6e4', padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>تعديل العقد ✏️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedChartMonth && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: 'min(700px, 100%)', maxHeight: '85vh', overflowY: 'auto', background: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#2563eb', fontWeight: '900' }}>
                🗓️ عقود تنتهي في {selectedChartMonth.name} {chartYear}
              </h3>
              <button onClick={() => setSelectedChartMonth(null)} style={{ background: '#f1f5f9', border: 0, color: '#64748b', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                    <th style={{ padding: '10px' }}>الكود</th>
                    <th style={{ padding: '10px' }}>الموظف</th>
                    <th style={{ padding: '10px' }}>الإدارة</th>
                    <th style={{ padding: '10px' }}>تاريخ الانتهاء</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedChartMonth.emps.map((emp: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#0d9488' }}>{getField(emp, 'employee_code', 'EmployeeCode')}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{getField(emp, 'employee_name', 'ArabicName')}</td>
                      <td style={{ padding: '10px', color: '#64748b' }}>{emp.department || '—'}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold', color: '#0f172a' }}>{emp.contract_end_date}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button onClick={() => { setSelectedChartMonth(null); handleRowClick(getField(emp, 'employee_code', 'EmployeeCode')); }} style={{ background: '#ffffff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '5px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>إدارة العقد ↗️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
