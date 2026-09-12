'use client';

import { useState, useEffect, useMemo } from 'react';
import { navigateTo } from '@/lib/navigation';
import { useAppData } from '@/lib/DataContext';
import KpiCard from './KpiCard';
import Stamp from './Stamp';

const getField = (obj: any, ...keys: string[]) => {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return '';
};

export default function DashboardPage() {
  const { employees: allEmployees, renewals: allRenewals, loading } = useAppData();

  const [filterCompany, setFilterCompany] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // 🌟 حالة الفلتر النشط من الكروت العلوية (Active KPI Filter)
  const [activeKpiFilter, setActiveKpiFilter] = useState<'all' | 'fixed' | 'perm' | 'aboveAge' | 'expiring' | 'turning60'>('all');

  // حالات النوافذ المنبثقة
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showShortTermModal, setShowShortTermModal] = useState(false);
  const [showMissingDataModal, setShowMissingDataModal] = useState(false);

  // فلاتر نافذة بلوغ سن الـ 60 (السنة والشهر)
  const currentYearStr = new Date().getFullYear().toString();
  const [ageFilterYear, setAgeFilterYear] = useState<string>(currentYearStr);
  const [ageFilterMonth, setAgeFilterMonth] = useState<string>('');

  const [selectedShortTermDept, setSelectedShortTermDept] = useState<string | null>(null);
  const [selectedChartMonth, setSelectedChartMonth] = useState<{ name: string; emps: any[] } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getDaysRemaining = (endDateStr: string | null) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  // 🎂 حاسبة بلوغ سن الـ 60
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

  const companiesList = Array.from(new Set((allEmployees || []).map((e) => getField(e, 'company', 'Company')).filter(Boolean)));
  const deptsList = Array.from(new Set((allEmployees || []).map((e) => getField(e, 'department', 'Department')).filter(Boolean)));

  // 🌟 معالجة الداتا والحسابات المتفاعلة
  const dashboardData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const targetExpiryYear = currentYear + 1;

    // 1. الموظفون النشطون المستهدفون
    const activeEmployeesOnly = (allEmployees || []).filter(emp => 
      String(getField(emp, 'status', 'Status') || 'Active').toLowerCase() === 'active' && 
      !String(getField(emp, 'department', 'Department') || '').includes('تحويلات')
    );

    // 2. تطبيق فلاتر الشركة والإدارة العلوية
    const baseFilteredEmps = activeEmployeesOnly.filter((emp) => {
      const empComp = String(getField(emp, 'company', 'Company') || '').toLowerCase();
      const empDept = String(getField(emp, 'department', 'Department') || '').toLowerCase();
      
      const matchesComp = !filterCompany || empComp.includes(filterCompany.toLowerCase());
      const matchesDept = !filterDept || empDept.includes(filterDept.toLowerCase());
      return matchesComp && matchesDept;
    });

    // 3. حساب الأرقام الإجمالية للكروت
    let totalFixed = 0, totalPerm = 0, totalAboveAge = 0, totalExpiringSoon = 0;
    const futureTurning60List: any[] = [];
    const turning60SoonList: any[] = [];
    const missingDataList: any[] = [];

    baseFilteredEmps.forEach((emp) => {
      const type = String(getField(emp, 'contract_type', 'ContractType') || 'محدد المدة').trim();
      const nationalId = getField(emp, 'national_id', 'NationalID');
      const birthDateRaw = getField(emp, 'birth_date', 'BirthDate');
      const endDateStr = getField(emp, 'contract_end_date', 'ContractEndDate');
      const mobile = getField(emp, 'mobile', 'Mobile');
      const empCode = getField(emp, 'employee_code', 'EmployeeCode');
      const empName = getField(emp, 'employee_name', 'ArabicName', 'EmployeeName');
      const dept = String(getField(emp, 'department', 'Department') || 'غير محدد').trim();

      if (!nationalId || !mobile) {
        missingDataList.push({ ...emp, employee_code: empCode, employee_name: empName, national_id: nationalId, mobile });
      }

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

    // 4. 🌟 فلترة الموظفين بناءً على الكارت المنقور عليه
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

    // 5. بناء الرسوم البيانية والجداول
    const deptsCount: Record<string, number> = {};
    const alerts: any[] = [];
    const shortTermByDept: Record<string, any[]> = {};
    let shortTermTotal = 0;

    const monthsNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const contractsByMonth = monthsNames.map((name) => ({ name, count: 0, emps: [] as any[] }));

    kpiFilteredEmps.forEach((emp) => {
      const type = String(getField(emp, 'contract_type', 'ContractType') || 'محدد المدة').trim();
      const dept = String(getField(emp, 'department', 'Department') || 'غير محدد').trim();
      const endDateStr = getField(emp, 'contract_end_date', 'ContractEndDate');
      const empCode = getField(emp, 'employee_code', 'EmployeeCode');
      const empName = getField(emp, 'employee_name', 'ArabicName', 'EmployeeName');
      const startDateStr = getField(emp, 'contract_start_date', 'ContractStartDate', 'hiring_date', 'HiringDate');

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

      if (type.includes('محدد') && !type.includes('فوق السن')) {
        let isShort = false;
        let historyDesc = '';
        if (startDateStr && endDateStr) {
          const start = new Date(startDateStr);
          const end = new Date(endDateStr);
          const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 0 && diffDays <= 360) {
            isShort = true;
            const diffMonths = Math.round(diffDays / 30) || 1;
            historyDesc = `تعيين (${diffMonths} ش)`;
          }
        }
        if (isShort) {
          shortTermTotal++;
          if (!shortTermByDept[dept]) shortTermByDept[dept] = [];
          shortTermByDept[dept].push({ ...emp, employee_code: empCode, employee_name: empName, contract_end_date: endDateStr, historyDesc });
        }
      }
    });

    alerts.sort((a, b) => a.days - b.days);

    const topDepts = Object.entries(deptsCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const shortTermList = Object.entries(shortTermByDept)
      .map(([deptName, emps]) => ({ 
        deptName, 
        emps: emps.sort((a, b) => (getDaysRemaining(a.contract_end_date) ?? 999) - (getDaysRemaining(b.contract_end_date) ?? 999)) 
      }))
      .sort((a, b) => b.emps.length - a.emps.length);

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
      missingDataList,
      topDepts,
      urgentAlerts: alerts.slice(0, 20),
      contractsByMonth,
      shortTermTotal,
      shortTermList,
      futureTurning60List,
      turning60SoonList,
      currentYear,
      targetExpiryYear
    };
  }, [allEmployees, allRenewals, filterCompany, filterDept, activeKpiFilter]);

  const filteredAge60ModalList = useMemo(() => {
    return dashboardData.futureTurning60List.filter((emp) => {
      const matchesYear = !ageFilterYear || String(emp.year60) === ageFilterYear;
      const matchesMonth = !ageFilterMonth || String(emp.month60) === ageFilterMonth;
      return matchesYear && matchesMonth;
    });
  }, [dashboardData.futureTurning60List, ageFilterYear, ageFilterMonth]);

  const handleRowClick = (empCode: string) => navigateTo('contracts', { jumpSearch: empCode });

  const dateFormatted = currentTime.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeFormatted = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const maxMonthCount = Math.max(...(dashboardData?.contractsByMonth.map((m) => m.count) || []), 1);

  const totalContracts = dashboardData.kpiFilteredCount;
  const p1 = totalContracts ? (dashboardData.permCount / totalContracts) * 100 : 0;
  const p2 = p1 + (totalContracts ? (dashboardData.fixedCount / totalContracts) * 100 : 0);
  const donutGradient = totalContracts === 0 
    ? 'conic-gradient(#e2e8f0 0% 100%)' 
    : `conic-gradient(#10b981 0% ${p1}%, #3b82f6 ${p1}% ${p2}%, #f59e0b ${p2}% 100%)`;

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
          <input list="dashCompList" className="field" placeholder="🏢 كل الشركات (ابحث...)" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
          <datalist id="dashCompList">{companiesList.map((c: any, i) => <option key={i} value={c} />)}</datalist>

          <input list="dashDeptList" className="field" placeholder="💼 كل الإدارات (ابحث...)" value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
          <datalist id="dashDeptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>

          {(filterCompany || filterDept || activeKpiFilter !== 'all') && (
            <button style={{ background: '#f1f5f9', border: 0, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', color: '#334155' }} onClick={() => { setFilterCompany(''); setFilterDept(''); setActiveKpiFilter('all'); }}>إعادة ضبط الفلاتر 🔄</button>
          )}
        </div>
      </div>

      {/* 🌟 الكروت السريعة */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div style={{ outline: activeKpiFilter === 'all' ? '2px solid #0d9488' : 'none', borderRadius: '12px' }}>
          <KpiCard 
            loading={loading} 
            tone="brass" 
            title="إجمالي الموظفين" 
            value={dashboardData.totalEmps} 
            sub={activeKpiFilter === 'all' ? "المعروض (الكل)" : "اضغط لعرض الكل"} 
            icon="👥" 
            onClick={() => setActiveKpiFilter('all')} 
          />
        </div>

        <div style={{ outline: activeKpiFilter === 'fixed' ? '2px solid #3b82f6' : 'none', borderRadius: '12px' }}>
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

        <div style={{ outline: activeKpiFilter === 'perm' ? '2px solid #10b981' : 'none', borderRadius: '12px' }}>
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

        <div style={{ outline: activeKpiFilter === 'aboveAge' ? '2px solid #8b5cf6' : 'none', borderRadius: '12px' }}>
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

        <div style={{ outline: activeKpiFilter === 'expiring' ? '2px solid #f59e0b' : 'none', borderRadius: '12px' }}>
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

        {/* 🎂 كارت المعاشات المحدث بفتح النافذة المنبثقة مباشرة */}
        <div style={{ outline: activeKpiFilter === 'turning60' ? '2px solid #ef4444' : 'none', borderRadius: '12px' }}>
          <KpiCard 
            loading={loading} 
            tone="red" 
            title="سيبلغون الـ 60 (60 يوم)" 
            value={dashboardData.turning60SoonCount} 
            sub="عرض الجدول والنافذة 🎂" 
            icon="🎂" 
            onClick={() => {
              setActiveKpiFilter('turning60');
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
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }}>
          <h4 className="m-0 mb-5 text-[13.5px] font-extrabold" style={{ color: '#0f172a' }}>📊 أكبر 5 إدارات في هذه المجموعه</h4>
          <div className="flex flex-col gap-4">
            {dashboardData.topDepts.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', padding: '20px' }}>لا توجد بيانات مطابقة لهذا الفلتر</div>
            ) : dashboardData.topDepts.map((dept, idx) => {
              const max = dashboardData.topDepts[0]?.count || 1;
              const percentage = (dept.count / max) * 100;
              return (
                <div key={idx}>
                  <div className="flex justify-between text-[11px] font-bold mb-1.5" style={{ color: '#334155' }}>
                    <span>{dept.name}</span>
                    <span className="font-mono">{dept.count.toLocaleString('en-US')}</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${percentage}%`, background: 'linear-gradient(90deg, #14b8a6, #0d9488)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* الرسم البياني لتوزيع الشهور */}
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }} className="flex flex-col lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h4 className="m-0 text-[13.5px] font-extrabold" style={{ color: '#0f172a' }}>
              📈 توزيع تجديد عقود المجموعه لعام {dashboardData.currentYear}
            </h4>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#2563eb', background: '#eff6ff', padding: '4px 12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
              خطة عقود {dashboardData.targetExpiryYear} 📅
            </span>
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
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }} className="flex flex-col justify-center items-center relative lg:col-span-1">
          <h4 className="m-0 mb-6 text-[13.5px] font-extrabold w-full text-right" style={{ color: '#0f172a' }}>📑 نسبة العقود بالمجموعة</h4>
          
          <div style={{ width: '170px', height: '160px', borderRadius: '50%', background: donutGradient, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
            <div style={{ width: '115px', height: '115px', background: '#ffffff', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>تصفية الفلتر</span>
              <span style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a' }}>{dashboardData.kpiFilteredCount.toLocaleString('en-US')}</span>
            </div>
          </div>

          <div className="w-full flex justify-between mt-8 text-[11px] font-bold px-2">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{ background: '#10b981' }} />دائم ({dashboardData.permCount})</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{ background: '#3b82f6' }} />محدد ({dashboardData.fixedCount})</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />فوق السن ({dashboardData.aboveAgeCount})</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }} className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h4 className="m-0 text-[13.5px] font-extrabold flex items-center gap-2" style={{ color: '#dc2626' }}>
              <span className="text-base">🚨</span> مهام عاجلة للمجموعة الفعالة (تنتهي خلال 60 يوم)
            </h4>
          </div>
          {dashboardData.urgentAlerts.length === 0 ? (
            <div className="text-center py-8 rounded-xl text-[13px] font-bold" style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
              لا توجد مهام عاجلة في الفلتر المختار! 🎉
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[220px]">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                    <th style={{ padding: '8px' }}>الكود</th>
                    <th style={{ padding: '8px' }}>الموظف</th>
                    <th style={{ padding: '8px' }}>الإدارة</th>
                    <th style={{ padding: '8px' }}>الانتهاء</th>
                    <th style={{ padding: '8px' }}>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.urgentAlerts.map((alert) => (
                    <tr key={alert.id || alert.employee_code} onClick={() => handleRowClick(alert.employee_code)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold', fontFamily: 'monospace', color: '#0d9488' }}>{alert.employee_code}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold', color: '#0f172a' }}>{alert.employee_name}</td>
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

      {/* 🎂 نافذة بلوغ سن الـ 60 المنبثقة المحدثة */}
      {showAgeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '850px', maxHeight: '85vh', overflowY: 'auto', background: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#d97706', fontWeight: '900' }}>
                🎂 جدولة الموظفين القادمين لسن الـ 60 (المتقاعدون مستقبلاً)
              </h3>
              <button onClick={() => setShowAgeModal(false)} style={{ background: '#fef3c7', border: 0, color: '#b45309', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>فلترة موعد التقاعد القادم:</span>
              
              <select value={ageFilterYear} onChange={(e) => setAgeFilterYear(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold', outline: 'none' }}>
                <option value="2026">سنة 2026 (الافتراضي)</option>
                <option value="2027">سنة 2027</option>
                <option value="2028">سنة 2028</option>
                <option value="2029">سنة 2029</option>
                <option value="2030">سنة 2030</option>
                <option value="">كل السنوات (حتى 2030)</option>
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
                        <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#0d9488' }}>{emp.employee_code}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name}</td>
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
                          <button onClick={() => { setShowAgeModal(false); handleRowClick(emp.employee_code); }} style={{ background: '#ffffff', color: '#0d9488', border: '1px solid #99f6e4', padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>تعديل العقد ✏️</button>
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

      {/* نافذة تفاصيل الشهر بالرسومات */}
      {selectedChartMonth && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', itemsCenter: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '700px', maxHeight: '85vh', overflowY: 'auto', background: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#2563eb', fontWeight: '900' }}>
                🗓️ عقود تنتهي في {selectedChartMonth.name} {dashboardData.targetExpiryYear}
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
                      <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#0d9488' }}>{emp.employee_code}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name}</td>
                      <td style={{ padding: '10px', color: '#64748b' }}>{emp.department || '—'}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold', color: '#0f172a' }}>{emp.contract_end_date}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button onClick={() => { setSelectedChartMonth(null); handleRowClick(emp.employee_code); }} style={{ background: '#ffffff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '5px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>إدارة العقد ↗️</button>
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
