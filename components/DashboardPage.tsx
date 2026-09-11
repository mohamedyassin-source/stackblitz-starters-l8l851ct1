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

  // 🎂 دالة دقيقة لحساب تاريخ بلوغ الـ 60 باليوم والشهر والسنة
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

  const companiesList = Array.from(new Set(allEmployees.map((e) => getField(e, 'company', 'Company')).filter(Boolean)));
  const deptsList = Array.from(new Set(allEmployees.map((e) => getField(e, 'department', 'Department')).filter(Boolean)));

  const dashboardData = useMemo(() => {
    // 🌟 سنة العمل الحالية (2026)
    const currentYear = new Date().getFullYear();
    // 🌟 سنة انتهاء العقود المستهدفة للتجديد (2027)
    const targetExpiryYear = currentYear + 1;

    const activeEmployeesOnly = allEmployees.filter(emp => 
      String(getField(emp, 'status', 'Status') || 'Active').toLowerCase() === 'active' && 
      !String(getField(emp, 'department', 'Department') || '').includes('تحويلات')
    );

    const filteredEmps = activeEmployeesOnly.filter((emp) => {
      const empComp = String(getField(emp, 'company', 'Company') || '').toLowerCase();
      const empDept = String(getField(emp, 'department', 'Department') || '').toLowerCase();
      
      const matchesComp = !filterCompany || empComp.includes(filterCompany.toLowerCase());
      const matchesDept = !filterDept || empDept.includes(filterDept.toLowerCase());
      return matchesComp && matchesDept;
    });

    const filteredRens = allRenewals.filter((req) => {
      const reqComp = String(getField(req, 'company', 'Company') || '').toLowerCase();
      const reqDept = String(getField(req, 'department', 'Department') || '').toLowerCase();

      const matchesComp = !filterCompany || reqComp.includes(filterCompany.toLowerCase());
      const matchesDept = !filterDept || reqDept.includes(filterDept.toLowerCase());
      return matchesComp && matchesDept;
    });

    let expired = 0, expiring = 0, perm = 0, fixed = 0, aboveAge = 0, shortTermTotal = 0;
    const deptsCount: Record<string, number> = {};
    const alerts: any[] = [];
    const futureTurning60List: any[] = [];
    const turning60SoonList: any[] = [];
    const shortTermByDept: Record<string, any[]> = {}; 
    const missingDataList: any[] = [];
    
    const monthsNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const contractsByMonth = monthsNames.map((name) => ({ name, count: 0, emps: [] as any[] }));

    filteredEmps.forEach((emp) => {
      const type = String(getField(emp, 'contract_type', 'ContractType') || 'محدد المدة').trim();
      const dept = String(getField(emp, 'department', 'Department') || 'غير محدد').trim();
      const nationalId = getField(emp, 'national_id', 'NationalID');
      const birthDateRaw = getField(emp, 'birth_date', 'BirthDate');
      const mobile = getField(emp, 'mobile', 'Mobile');
      const startDateStr = getField(emp, 'contract_start_date', 'ContractStartDate', 'hiring_date', 'HiringDate');
      const endDateStr = getField(emp, 'contract_end_date', 'ContractEndDate');
      const empCode = getField(emp, 'employee_code', 'EmployeeCode');
      const empName = getField(emp, 'employee_name', 'ArabicName', 'EmployeeName');
      
      deptsCount[dept] = (deptsCount[dept] || 0) + 1;

      if (!nationalId || !mobile) {
        missingDataList.push({ ...emp, employee_code: empCode, employee_name: empName, national_id: nationalId, mobile });
      }

      // 🎂 حصر الموظفين الذين سيبلوغون سن الـ 60 مستقبلاً
      const ageInfo = getAge60Info(nationalId, birthDateRaw);
      if (ageInfo && ageInfo.daysUntil60 >= 0) {
        const item = {
          ...emp,
          employee_code: empCode,
          employee_name: empName,
          department: dept,
          contract_type: type,
          birthDate: ageInfo.birthDate,
          age60Date: ageInfo.age60Date,
          daysLeft: ageInfo.daysUntil60,
          year60: ageInfo.year60,
          month60: ageInfo.month60
        };

        futureTurning60List.push(item);
        
        if (ageInfo.daysUntil60 <= 60) {
          turning60SoonList.push(item);
        }
      }

      // 🌟 تجميع العقود التي تنتهي في العام القادم (2027) لجدولة تجديدها في عام الشغل الحالي (2026)
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

      // تصنيف هيكل العقود
      if (type.includes('دائم') || type.includes('غير محدد')) {
        perm++;
      } else if (type.includes('فوق السن')) {
        aboveAge++;
      } else {
        fixed++;
      }

      // تنبيهات العقود المتبقية (خلال 60 يوم)
      if (!type.includes('دائم') && !type.includes('غير محدد')) {
        const days = getDaysRemaining(endDateStr);
        if (days !== null && days >= 0 && days <= 60) {
          expiring++;
          alerts.push({ ...emp, employee_code: empCode, employee_name: empName, contract_end_date: endDateStr, days, status: 'expiring' });
        }
      }

      // العقود المؤقتة
      if (type.includes('محدد') && !type.includes('فوق السن')) {
        const empRens = filteredRens
          .filter(r => String(getField(r, 'employee_code', 'EmployeeCode')).trim() === String(empCode).trim() && (r.status === 'Approved' || r.status === 'معتمد'))
          .sort((a, b) => new Date(a.request_date || 0).getTime() - new Date(b.request_date || 0).getTime());

        let isShort = false;
        let historyDesc = '';

        if (empRens.length > 0) {
          const lastRen = empRens[empRens.length - 1];
          const renewalMonths = getField(lastRen, 'renewal_months', 'RenewalMonths');
          if (renewalMonths && Number(renewalMonths) < 12) {
            isShort = true;
            const historyArr = empRens.map(r => `${getField(r, 'renewal_months', 'RenewalMonths')} ش`);
            historyDesc = `تجديدات: (${historyArr.join(' + ')})`;
          }
        } else if (startDateStr && endDateStr) {
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
    futureTurning60List.sort((a, b) => a.daysLeft - b.daysLeft);
    turning60SoonList.sort((a, b) => a.daysLeft - b.daysLeft); 

    const shortTermList = Object.entries(shortTermByDept)
      .map(([deptName, emps]) => ({ 
        deptName, 
        emps: emps.sort((a, b) => (getDaysRemaining(a.contract_end_date) ?? 999) - (getDaysRemaining(b.contract_end_date) ?? 999)) 
      }))
      .sort((a, b) => b.emps.length - a.emps.length);

    const urgentAlerts = alerts.slice(0, 20);
    const topDepts = Object.entries(deptsCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const pendingRequests = filteredRens.filter(r => r.status === 'Pending' || r.status === 'قيد الانتظار');
    const waitingSign = filteredRens.filter(r => (r.status === 'Approved' || r.status === 'معتمد') && r.signature_status !== 'تم التوقيع');

    const totalEmpsCount = filteredEmps.length || 1;
    const calcPct = (val: number) => ((val / totalEmpsCount) * 100).toFixed(1);

    return {
      totalEmps: filteredEmps.length,
      permCount: perm,
      permPct: calcPct(perm),
      fixedCount: fixed,
      fixedPct: calcPct(fixed),
      aboveAgeCount: aboveAge,
      aboveAgePct: calcPct(aboveAge),
      expiringSoonCount: expiring,
      expiringSoonPct: calcPct(expiring),
      turning60SoonCount: turning60SoonList.length,
      pendingCount: pendingRequests.length,
      waitingSignCount: waitingSign.length,
      missingDataList,
      topDepts,
      urgentAlerts,
      contractsByMonth,
      shortTermTotal,
      shortTermList,
      futureTurning60List,
      turning60SoonList,
      currentYear,
      targetExpiryYear
    };
  }, [allEmployees, allRenewals, filterCompany, filterDept]);

  // تصفية المتقاعدين مستقبلاً بحسب الشهر والسنة المختارين
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

  const totalContracts = dashboardData.permCount + dashboardData.fixedCount + dashboardData.aboveAgeCount;
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

          {(filterCompany || filterDept) && (
            <button style={{ background: '#f1f5f9', border: 0, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', color: '#334155' }} onClick={() => { setFilterCompany(''); setFilterDept(''); }}>إعادة ضبط</button>
          )}
        </div>
      </div>

      {/* الكروت السريعة */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard 
          loading={loading} 
          tone="brass" 
          title="إجمالي الموظفين" 
          value={dashboardData.totalEmps} 
          sub="القوة الفعالة (100%)" 
          icon="👥" 
          onClick={() => navigateTo('employees')} 
        />
        <KpiCard 
          loading={loading} 
          tone="blue" 
          title="عقود محددة المدة" 
          value={dashboardData.fixedCount} 
          sub={`نسبة ${dashboardData.fixedPct}% من القوة`} 
          icon="📂" 
          onClick={() => navigateTo('contracts')} 
        />
        <KpiCard 
          loading={loading} 
          tone="green" 
          title="عقود دائمة" 
          value={dashboardData.permCount} 
          sub={`نسبة ${dashboardData.permPct}% من القوة`} 
          icon="🛡️" 
          onClick={() => navigateTo('contracts')} 
        />
        <KpiCard 
          loading={loading} 
          tone="purple" 
          title="فوق السن (60+)" 
          value={dashboardData.aboveAgeCount} 
          sub={`نسبة ${dashboardData.aboveAgePct}% من القوة`} 
          icon="💼" 
          onClick={() => navigateTo('contracts')} 
        />
        <KpiCard 
          loading={loading} 
          tone="amber" 
          title="تنتهي قريباً (60 يوم)" 
          value={dashboardData.expiringSoonCount} 
          sub={`نسبة ${dashboardData.expiringSoonPct}% من القوة`} 
          icon="⏳" 
          onClick={() => navigateTo('contracts')} 
        />
        <KpiCard 
          loading={loading} 
          tone="red" 
          title="سيبلغون الـ 60 (60 يوم)" 
          value={dashboardData.turning60SoonCount} 
          sub="جدولة التقاعد القادم 🎂" 
          icon="🎂" 
          onClick={() => { setShowAgeModal(true); setAgeFilterYear(currentYearStr); setAgeFilterMonth(''); }} 
        />
      </div>

      {/* الرسوم البيانية */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }}>
          <h4 className="m-0 mb-5 text-[13.5px] font-extrabold" style={{ color: '#0f172a' }}>📊 أكبر 5 إدارات (كثافة)</h4>
          <div className="flex flex-col gap-4">
            {dashboardData.topDepts.map((dept, idx) => {
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

        {/* 🌟 الرسم البياني: العنوان يظهر العام الحالي (2026) والحسابات تطابق عقود الانتهاء لـ (2027) */}
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }} className="flex flex-col lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h4 className="m-0 text-[13.5px] font-extrabold" style={{ color: '#0f172a' }}>
              📈 توزيع تجديد العقود الشهري لعام {dashboardData.currentYear}
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
          <h4 className="m-0 mb-6 text-[13.5px] font-extrabold w-full text-right" style={{ color: '#0f172a' }}>📑 توزيع هيكل العقود</h4>
          
          <div style={{ width: '170px', height: '160px', borderRadius: '50%', background: donutGradient, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
            <div style={{ width: '115px', height: '115px', background: '#ffffff', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>الإجمالي</span>
              <span style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a' }}>{totalContracts.toLocaleString('en-US')}</span>
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
              <span className="text-base">🚨</span> مهام عاجلة (تنتهي خلال 60 يوم)
            </h4>
          </div>
          {dashboardData.urgentAlerts.length === 0 ? (
            <div className="text-center py-8 rounded-xl text-[13px] font-bold" style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
              لا توجد مهام عاجلة! جميع العقود سارية. 🎉
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

      {/* 🎂 نافذة بلوغ سن الـ 60 القادم مستقبلاً */}
      {showAgeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '850px', maxHeight: '85vh', overflowY: 'auto', background: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#d97706', fontWeight: '900' }}>
                🎂 جدولة الموظفين القادمين لسن الـ 60 (المتقاعدون مستقبلاً)
              </h3>
              <button onClick={() => setShowAgeModal(false)} style={{ background: '#fef3c7', border: 0, color: '#b45309', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            {/* فلاتر الشهر والسنة */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>فلترة موعد التقاعد القادم:</span>
              
              <select 
                value={ageFilterYear} 
                onChange={(e) => setAgeFilterYear(e.target.value)} 
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold', outline: 'none' }}
              >
                <option value="2026">سنة 2026 (الافتراضي)</option>
                <option value="2027">سنة 2027</option>
                <option value="2028">سنة 2028</option>
                <option value="2029">سنة 2029</option>
                <option value="2030">سنة 2030</option>
                <option value="">كل السنوات (حتى 2030)</option>
              </select>

              <select 
                value={ageFilterMonth} 
                onChange={(e) => setAgeFilterMonth(e.target.value)} 
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold', outline: 'none' }}
              >
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

      {/* باقي النوافذ المنبثقة */}
      {selectedChartMonth && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
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

      {showShortTermModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '700px', height: '80vh', background: '#ffffff', borderRadius: '20px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#2563eb', fontWeight: '800' }}>
                  ⏱️ العقود المؤقتة وفترات الاختبار
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>إجمالي: {dashboardData.shortTermTotal} موظف</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {selectedShortTermDept && (
                  <button onClick={() => setSelectedShortTermDept(null)} style={{ background: '#e2e8f0', border: 0, color: '#0f172a', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                    🔙 رجوع للإدارات
                  </button>
                )}
                <button onClick={() => { setShowShortTermModal(false); setSelectedShortTermDept(null); }} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                  إغلاق ✕
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {!selectedShortTermDept ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {dashboardData.shortTermList.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#64748b', fontWeight: 'bold', fontSize: '13px', marginTop: '40px' }}>لا توجد عقود مؤقتة حالياً.</div>
                  ) : (
                    dashboardData.shortTermList.map((group, idx) => (
                      <div key={idx} onClick={() => setSelectedShortTermDept(group.deptName)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', background: '#ffffff' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f172a' }}>🏢 {group.deptName}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ background: '#eff6ff', color: '#2563eb', padding: '4px 12px', borderRadius: '100px', fontSize: '11px', fontWeight: 'bold' }}>{group.emps.length} موظف</span>
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>عرض 👁️</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="table-responsive">
                  <h4 style={{ margin: '0 0 16px', color: '#0f172a', fontSize: '14px' }}>إدارة: {selectedShortTermDept}</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                        <th style={{ padding: '10px' }}>الموظف</th>
                        <th style={{ padding: '10px' }}>سجل التعاقد</th>
                        <th style={{ padding: '10px' }}>الانتهاء</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.shortTermList.find(g => g.deptName === selectedShortTermDept)?.emps.map((emp) => {
                        const daysLeft = getDaysRemaining(emp.contract_end_date);
                        return (
                          <tr key={emp.employee_code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name}</div>
                              <div style={{ fontSize: '10px', color: '#0d9488', fontFamily: 'monospace', fontWeight: 'bold' }}>{emp.employee_code}</div>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <span style={{ background: '#f8fafc', color: '#0f172a', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px dashed #cbd5e1' }}>{emp.historyDesc}</span>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#0f172a' }}>{emp.contract_end_date}</div>
                              {daysLeft !== null && <div style={{ fontSize: '9px', color: daysLeft < 0 ? '#dc2626' : '#d97706', fontWeight: 'bold' }}>{daysLeft < 0 ? `منتهي` : `متبقي ${daysLeft} يوم`}</div>}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'center' }}>
                              <button onClick={() => { setShowShortTermModal(false); handleRowClick(emp.employee_code); }} style={{ background: '#ffffff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>العقد ↗️</button>
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
        </div>
      )}

      {showMissingDataModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '700px', maxHeight: '85vh', overflowY: 'auto', background: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#dc2626', fontWeight: '800' }}>⚠️ سجل نواقص البيانات ({dashboardData.missingDataList.length} موظف)</h3>
              <button onClick={() => setShowMissingDataModal(false)} style={{ background: '#f1f5f9', border: 0, color: '#64748b', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            {dashboardData.missingDataList.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#16a34a', fontWeight: 'bold' }}>بيانات جميع الموظفين مكتملة بنجاح! ✅</div>
            ) : (
              <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '10px' }}>الكود</th>
                      <th style={{ padding: '10px' }}>الموظف</th>
                      <th style={{ padding: '10px' }}>النواقص</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.missingDataList.map((emp) => (
                      <tr key={emp.employee_code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_code}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name}</td>
                        <td style={{ padding: '10px', color: '#dc2626', fontWeight: 'bold' }}>
                          {!emp.national_id && <span>الرقم القومي </span>}
                          {!emp.mobile && <span>- الموبايل </span>}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <button onClick={() => { setShowMissingDataModal(false); navigateTo('employees'); }} style={{ background: '#0f172a', color: '#ffffff', border: 0, padding: '5px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>تحديث السجل ✏️</button>
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

    </div>
  );
}
