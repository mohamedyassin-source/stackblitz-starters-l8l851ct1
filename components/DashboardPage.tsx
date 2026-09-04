'use client';
import { useState, useEffect, useMemo } from 'react';
import { navigateTo } from '@/lib/navigation';
import { useAppData } from '@/lib/DataContext';
import KpiCard from './KpiCard';
import Stamp from './Stamp';

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

export default function DashboardPage() {
  const { employees: allEmployees, renewals: allRenewals, loading } = useAppData();

  const [filterCompany, setFilterCompany] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // النوافذ المنبثقة (Modals)
  const [showTotalEmpsModal, setShowTotalEmpsModal] = useState(false);
  const [showExpiringSoonModal, setShowExpiringSoonModal] = useState(false);
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showShortTermModal, setShowShortTermModal] = useState(false);
  const [showMissingDataModal, setShowMissingDataModal] = useState(false);

  // فلاتر مخصصة داخل نافذة بلوغ سن الـ 60
  const [ageModalFilterMode, setAgeModalFilterMode] = useState<'60days' | 'byMonth' | 'allYear'>('60days');
  const [ageModalSelectedMonth, setAgeModalSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [ageModalSelectedYear, setAgeModalSelectedYear] = useState<string>(new Date().getFullYear().toString());

  // نوافذ الرسومات البيانية المنبثقة
  const [selectedMonthDetails, setSelectedMonthDetails] = useState<{ name: string; emps: any[] } | null>(null);
  const [selectedDonutDetails, setSelectedDonutDetails] = useState<{ title: string; emps: any[] } | null>(null);
  const [selectedDeptDetails, setSelectedDeptDetails] = useState<{ name: string; emps: any[] } | null>(null);

  const [selectedShortTermDept, setSelectedShortTermDept] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return null;
    const cleanStr = String(endDateStr).split('T')[0].trim();
    const end = new Date(cleanStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const getAge60Info = (nationalId: string) => {
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
    today.setHours(0, 0, 0, 0);
    const daysUntil60 = Math.ceil((age60Date.getTime() - today.getTime()) / (1000 * 3600 * 24));

    return {
      birthDate: birthDate.toISOString().split('T')[0],
      age60Date: age60Date.toISOString().split('T')[0],
      age60Year: String(age60Date.getFullYear()),
      age60Month: String(age60Date.getMonth() + 1),
      daysUntil60
    };
  };

  const companiesList = Array.from(new Set(allEmployees.map((e) => e.company).filter(Boolean)));
  const deptsList = Array.from(new Set(allEmployees.map((e) => e.department).filter(Boolean)));

  const dashboardData = useMemo(() => {
    const activeEmployeesOnly = allEmployees.filter(emp => (emp.status || 'Active') === 'Active' && emp.department !== 'تحويلات تحت الاعتماد');

    const filteredEmps = activeEmployeesOnly.filter((emp) => {
      const matchesComp = !filterCompany || String(emp.company || '').toLowerCase().includes(filterCompany.toLowerCase());
      const matchesDept = !filterDept || String(emp.department || '').toLowerCase().includes(filterDept.toLowerCase());
      return matchesComp && matchesDept;
    });

    const filteredRens = allRenewals.filter((req) => {
      const matchesComp = !filterCompany || String(req.company || '').toLowerCase().includes(filterCompany.toLowerCase());
      const matchesDept = !filterDept || String(req.department || '').toLowerCase().includes(filterDept.toLowerCase());
      return matchesComp && matchesDept;
    });

    let expired = 0, expiring = 0;
    const deptsCount: Record<string, number> = {};
    const alerts: any[] = [];
    const expiringSoonList: any[] = [];
    const allTurning60List: any[] = [];
    const shortTermByDept: Record<string, any[]> = {}; 
    const missingDataList: any[] = [];
    
    const permEmps: any[] = [];
    const fixedEmps: any[] = [];
    const rewardEmps: any[] = [];
    const aboveAgeEmps: any[] = [];
    const shortTermEmpsList: any[] = [];

    const monthsNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const contractsByMonth = monthsNames.map((name) => ({ name, count: 0, emps: [] as any[] }));

    const monthMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };

    filteredEmps.forEach((emp) => {
      const type = emp.contract_type || '';
      const dept = emp.department || 'غير محدد';
      
      const isContractActive = !emp.contract_status || 
                               emp.contract_status === 'Active' || 
                               emp.contract_status === 'ساري' || 
                               emp.contract_status === 'نشط';

      deptsCount[dept] = (deptsCount[dept] || 0) + 1;

      if (!emp.national_id || !emp.mobile) {
        missingDataList.push(emp);
      }

      const hasRenewal = filteredRens.some(r => String(r.employee_code).trim() === String(emp.employee_code).trim());
      const endYear = emp.contract_end_date ? new Date(emp.contract_end_date).getFullYear() : 0;
      const isWorkedContract = hasRenewal || endYear >= 2027;

      if (emp.contract_start_date && isContractActive && isWorkedContract) {
        const dateStr = String(emp.contract_start_date).trim();
        let monthIdx = -1;

        const parts = dateStr.split(/[\/\-\s]/);
        if (parts.length >= 2) {
          const monthPart = parts[1].toLowerCase();
          if (monthMap[monthPart] !== undefined) {
            monthIdx = monthMap[monthPart];
          }
        }

        if (monthIdx === -1) {
          const startDate = new Date(dateStr);
          if (!isNaN(startDate.getTime())) {
            monthIdx = startDate.getMonth();
          }
        }

        if (monthIdx >= 0 && monthIdx < 12) {
          contractsByMonth[monthIdx].count++;
          contractsByMonth[monthIdx].emps.push(emp);
        }
      }

      const isPermanent = type === 'دائم' || type.includes('غير محدد');
      const isReward = type.includes('مكافأة') || type.includes('مكافأه');
      const isAboveAgeType = type.includes('فوق السن');

      const ageInfo = getAge60Info(emp.national_id);

      if (isPermanent) {
        permEmps.push(emp);
        if (ageInfo) {
          allTurning60List.push({
            ...emp,
            birthDate: ageInfo.birthDate,
            age60Date: ageInfo.age60Date,
            age60Month: ageInfo.age60Month,
            age60Year: ageInfo.age60Year,
            daysLeft: ageInfo.daysUntil60
          });
        }
      } else if (isReward) {
        rewardEmps.push(emp);
      } else if (isAboveAgeType) {
        aboveAgeEmps.push(emp);
      } else {
        fixedEmps.push(emp);
      }

      if (isContractActive) {
        const days = getDaysRemaining(emp.contract_end_date);
        
        if (days !== null) {
          if (days < 0 && !isPermanent) {
            expired++;
            alerts.push({ ...emp, days, status: 'expired' });
          } else if (days >= 0 && days <= 60) {
            const isTurning60In60Days = ageInfo && ageInfo.daysUntil60 >= 0 && ageInfo.daysUntil60 <= 60;
            if (!isPermanent || isTurning60In60Days) {
              expiring++;
              alerts.push({ ...emp, days, status: 'expiring' });
              expiringSoonList.push({ ...emp, days, isPermanentTurning60: isPermanent });
            }
          }
        }
      }

      if (type === 'محدد المدة' && isContractActive) {
        const empRens = filteredRens
          .filter(r => String(r.employee_code).trim() === String(emp.employee_code).trim() && (r.status === 'Approved' || r.status === 'معتمد' || r.renewal_status === 'Approved'))
          .sort((a, b) => (new Date(a.request_date).getTime() - new Date(b.request_date).getTime()));

        let isShort = false;
        let historyDesc = '';

        if (empRens.length > 0) {
          const lastRen = empRens[empRens.length - 1];
          if (lastRen.renewal_months && Number(lastRen.renewal_months) < 12) {
            isShort = true;
            const historyArr = empRens.map(r => `${r.renewal_months} ش`);
            historyDesc = `سجل التجديدات: (${historyArr.join(' + ')})`;
          }
        } else {
          if (emp.contract_start_date && emp.contract_end_date) {
            const start = new Date(emp.contract_start_date);
            const end = new Date(emp.contract_end_date);
            const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 0 && diffDays <= 360) {
              isShort = true;
              const diffMonths = Math.round(diffDays / 30) || 1;
              historyDesc = `تعيين جديد (${diffMonths} شهور)`;
            }
          }
        }

        if (isShort) {
          shortTermEmpsList.push(emp);
          if (!shortTermByDept[dept]) shortTermByDept[dept] = [];
          shortTermByDept[dept].push({ ...emp, historyDesc });
        }
      }
    });

    alerts.sort((a, b) => a.days - b.days);
    expiringSoonList.sort((a, b) => a.days - b.days);
    allTurning60List.sort((a, b) => a.daysLeft - b.daysLeft); 

    const shortTermList = Object.entries(shortTermByDept)
      .map(([deptName, emps]) => ({ 
        deptName, 
        emps: emps.sort((a, b) => (getDaysRemaining(a.contract_end_date) ?? 9999) - (getDaysRemaining(b.contract_end_date) ?? 9999)) 
      }))
      .sort((a, b) => b.emps.length - a.emps.length);

    const urgentAlerts = alerts.slice(0, 20);
    const topDepts = Object.entries(deptsCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const pendingRequests = filteredRens.filter(r => r.status === 'Pending' || r.status === 'قيد الانتظار');
    const waitingSign = filteredRens.filter(r => r.status === 'Approved' && r.signature_status !== 'تم التوقيع');

    const turning60In60DaysCount = allTurning60List.filter(e => e.daysLeft >= 0 && e.daysLeft <= 60).length;

    return {
      filteredEmps,
      totalEmps: filteredEmps.length,
      permCount: permEmps.length,
      fixedCount: fixedEmps.length,
      aboveAgeCount: aboveAgeEmps.length,
      rewardCount: rewardEmps.length,
      permEmps,
      fixedEmps,
      rewardEmps,
      aboveAgeEmps,
      shortTermEmpsList,
      expiredCount: expired,
      expiringSoonCount: expiring,
      expiringSoonList,
      pendingCount: pendingRequests.length,
      waitingSignCount: waitingSign.length,
      missingDataList,
      allTurning60List,
      turning60In60DaysCount,
      topDepts,
      urgentAlerts,
      contractsByMonth,
      shortTermTotal: shortTermEmpsList.length,
      shortTermList
    };
  }, [allEmployees, allRenewals, filterCompany, filterDept]);

  const displayTurning60List = useMemo(() => {
    return dashboardData.allTurning60List.filter(emp => {
      if (ageModalFilterMode === '60days') {
        return emp.daysLeft >= 0 && emp.daysLeft <= 60;
      }
      if (ageModalFilterMode === 'byMonth') {
        const matchM = !ageModalSelectedMonth || emp.age60Month === ageModalSelectedMonth;
        const matchY = !ageModalSelectedYear || emp.age60Year === ageModalSelectedYear;
        return matchM && matchY;
      }
      if (ageModalFilterMode === 'allYear') {
        return !ageModalSelectedYear || emp.age60Year === ageModalSelectedYear;
      }
      return true;
    });
  }, [dashboardData.allTurning60List, ageModalFilterMode, ageModalSelectedMonth, ageModalSelectedYear]);

  // 🌟 دالة التنقل المحصنة بدون وسائط إضافية لـ navigateTo لتجنب أي أخطاء
  const handleRowClick = (rawCode: any, targetPage: 'contracts' | 'employees' = 'contracts') => {
    const code = String(rawCode || '').trim();
    if (!code) return;

    setShowTotalEmpsModal(false);
    setShowExpiringSoonModal(false);
    setShowAgeModal(false);
    setShowShortTermModal(false);
    setShowMissingDataModal(false);
    setSelectedMonthDetails(null);
    setSelectedDonutDetails(null);
    setSelectedDeptDetails(null);

    localStorage.setItem('jumpSearch', code);
    localStorage.setItem('employeeSearch', code);
    navigateTo(targetPage);
  };

  const dateFormatted = currentTime.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeFormatted = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  const maxMonthCount = Math.max(...(dashboardData?.contractsByMonth.map((m) => m.count) || []), 1);

  // 🎨 ثيم الألوان المحدث للرسمة الخماسية
  const totalContracts = dashboardData.permCount + dashboardData.fixedCount + dashboardData.rewardCount + dashboardData.aboveAgeCount + dashboardData.shortTermTotal;
  const p1 = totalContracts ? (dashboardData.permCount / totalContracts) * 100 : 0;
  const p2 = p1 + (totalContracts ? (dashboardData.fixedCount / totalContracts) * 100 : 0);
  const p3 = p2 + (totalContracts ? (dashboardData.rewardCount / totalContracts) * 100 : 0);
  const p4 = p3 + (totalContracts ? (dashboardData.aboveAgeCount / totalContracts) * 100 : 0);

  const donutGradient = totalContracts === 0 
    ? 'conic-gradient(#e2e8f0 0% 100%)' 
    : `conic-gradient(
        #10b981 0% ${p1}%, 
        #2563eb ${p1}% ${p2}%, 
        #f59e0b ${p2}% ${p3}%, 
        #8b5cf6 ${p3}% ${p4}%, 
        #06b6d4 ${p4}% 100%
      )`;

  return (
    <div className="flex flex-col gap-5" style={{ direction: 'rtl', paddingBottom: '40px' }}>
      
      {/* رأس الصفحة */}
      <div className="card flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 sm:px-6 py-5" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
        <div>
          <h2 className="m-0 text-lg sm:text-xl font-black tracking-tight" style={{ color: '#0f172a' }}>
            بوابة تجديد العقود لشركة المراسم الدولية والشركات الشقيقة
          </h2>
          <div className="flex items-center gap-3 mt-2 text-[12px] font-bold" style={{ color: '#64748b' }}>
            <span>📅 {dateFormatted}</span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span className="font-mono" style={{ color: '#2563eb' }}>⏰ {timeFormatted}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input list="dashCompList" className="field" placeholder="🏢 كل الشركات (ابحث...)" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} />
          <datalist id="dashCompList">{companiesList.map((c: any, i) => <option key={i} value={c} />)}</datalist>

          <input list="dashDeptList" className="field" placeholder="💼 كل الإدارات (ابحث...)" value={filterDept} onChange={(e) => setFilterDept(e.target.value)} />
          <datalist id="dashDeptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>

          {(filterCompany || filterDept) && (
            <button className="field font-bold" style={{ background: '#f1f5f9', cursor: 'pointer' }} onClick={() => { setFilterCompany(''); setFilterDept(''); }}>إعادة ضبط</button>
          )}
        </div>
      </div>

      {/* الكروت السريعة */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard loading={loading} tone="brass" title="إجمالي القوة" value={dashboardData.totalEmps} sub="عرض الكشف 👁️" icon="👥" onClick={() => setShowTotalEmpsModal(true)} />
        <KpiCard loading={loading} tone="blue" title="طلبات معلقة" value={dashboardData.pendingCount} sub={`+ ${dashboardData.waitingSignCount} توقيع`} icon="⏳" onClick={() => navigateTo('renewals')} />
        <KpiCard loading={loading} tone="blue" title="عقود مؤقتة" value={dashboardData.shortTermTotal} sub="عرض القائمة ⏱️" icon="⏱️" onClick={() => setShowShortTermModal(true)} />
        <KpiCard loading={loading} tone="amber" title="تنتهي قريباً (0-60)" value={dashboardData.expiringSoonCount} sub="عرض القائمة 👁️" icon="📆" onClick={() => setShowExpiringSoonModal(true)} />
        <KpiCard loading={loading} tone="red" title="عقود منتهية" value={dashboardData.expiredCount} sub="إدارة العقود 🚨" icon="🚨" onClick={() => navigateTo('contracts')} />
        <KpiCard loading={loading} tone="amber" title="بلوغ الـ 60 (قريباً)" value={dashboardData.turning60In60DaysCount} sub="عرض الكشف/الفلاتر 🎂" icon="🎂" onClick={() => setShowAgeModal(true)} />
        <KpiCard loading={loading} tone="red" title="نواقص بيانات" value={dashboardData.missingDataList.length} sub="عرض القائمة ⚠️" icon="⚠️" onClick={() => setShowMissingDataModal(true)} />
      </div>

      {/* الرسوم البيانية */}
      <div className="grid lg:grid-cols-3 gap-5">
        
        {/* كارت أكبر 5 إدارات */}
        <div className="card px-5 sm:px-6 py-5" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
          <h4 className="m-0 mb-5 text-[13.5px] font-black" style={{ color: '#0f172a' }}>
            📊 أكبر 5 إدارات (اضغط لعرض الموظفين)
          </h4>
          <div className="flex flex-col gap-4">
            {dashboardData.topDepts.map((dept, idx) => {
              const max = dashboardData.topDepts[0]?.count || 1;
              const percentage = (dept.count / max) * 100;
              const deptEmps = dashboardData.filteredEmps.filter(e => (e.department || 'غير محدد') === dept.name);

              return (
                <div 
                  key={idx} 
                  onClick={() => setSelectedDeptDetails({ name: dept.name, emps: deptEmps })}
                  className="cursor-pointer group p-1.5 rounded-lg hover:bg-slate-50 transition-all"
                >
                  <div className="flex justify-between text-[11px] font-bold mb-1.5" style={{ color: '#1e293b' }}>
                    <span className="group-hover:text-blue-600 transition-colors">🏢 {dept.name}</span>
                    <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[10px]">{dept.count.toLocaleString('en-US')} موظف</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                    <div className="h-full rounded-full transition-all duration-700 group-hover:brightness-110" style={{ width: `${percentage}%`, background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 📈 الرسم البياني الشهري التفاعلي */}
        <div className="card px-5 sm:px-6 py-5 flex flex-col lg:col-span-2" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
          <h4 className="m-0 mb-6 text-[13.5px] font-black" style={{ color: '#0f172a' }}>
            📈 التوزيع الشهري لبدايات العقود النشطة والمجددة (اضغط على الشهر للتفاصيل)
          </h4>
          <div className="flex-1 flex items-end gap-1.5 sm:gap-2 h-[150px] pb-4 border-b" style={{ borderColor: '#e2e8f0' }}>
            {dashboardData.contractsByMonth.map((month, idx) => {
              const height = maxMonthCount > 0 ? (month.count / maxMonthCount) * 100 : 0;
              return (
                <div 
                  key={idx} 
                  onClick={() => month.count > 0 && setSelectedMonthDetails({ name: month.name, emps: month.emps })}
                  className={`flex-1 flex flex-col items-center justify-end h-full ${month.count > 0 ? 'cursor-pointer group' : ''}`}
                >
                  <span className="text-[10px] font-mono font-bold mb-1" style={{ color: month.count > 0 ? '#2563eb' : 'transparent' }}>
                    {month.count.toLocaleString('en-US')}
                  </span>
                  <div 
                    className="w-full max-w-[32px] rounded-t-md transition-all duration-300 group-hover:opacity-80 group-hover:scale-105" 
                    style={{ height: `${height}%`, minHeight: month.count > 0 ? '4px' : '0', background: month.count > 0 ? 'linear-gradient(180deg, #3b82f6, #1d4ed8)' : '#f1f5f9' }} 
                  />
                  <span className="text-[10px] font-bold mt-2" style={{ color: month.count > 0 ? '#0f172a' : '#94a3b8' }}>{month.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        
        {/* رسمة الدونت الخماسية */}
        <div className="card px-5 sm:px-6 py-5 flex flex-col justify-center items-center relative lg:col-span-1" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
          <h4 className="m-0 mb-4 text-[13.5px] font-black w-full text-right" style={{ color: '#0f172a' }}>
            📑 توزيع هيكل العقود (اضغط للعرض)
          </h4>
          
          <div style={{ width: '160px', height: '160px', borderRadius: '50%', background: donutGradient, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.06)' }}>
            <div style={{ width: '105px', height: '110px', background: '#ffffff', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>إجمالي الهيكل</span>
              <span style={{ fontSize: '18px', fontWeight: '900', color: '#0f172a' }}>{totalContracts}</span>
            </div>
          </div>

          <div className="w-full grid grid-cols-2 gap-2 mt-5 text-[10.5px] font-bold px-1">
            <div onClick={() => setSelectedDonutDetails({ title: 'العقود الدائمة', emps: dashboardData.permEmps })} className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors">
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />دائم ({dashboardData.permCount})
            </div>
            
            <div onClick={() => setSelectedDonutDetails({ title: 'العقود المحددة', emps: dashboardData.fixedEmps })} className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors">
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#2563eb' }} />محدد ({dashboardData.fixedCount})
            </div>
            
            <div onClick={() => setSelectedDonutDetails({ title: 'عقود المكافأة الشاملة', emps: dashboardData.rewardEmps })} className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors">
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />مكافأة ({dashboardData.rewardCount})
            </div>

            <div onClick={() => setSelectedDonutDetails({ title: 'عقود فوق السن', emps: dashboardData.aboveAgeEmps })} className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors">
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#8b5cf6' }} />فوق السن ({dashboardData.aboveAgeCount})
            </div>

            <div onClick={() => setSelectedDonutDetails({ title: 'العقود المؤقتة (بالأشهر)', emps: dashboardData.shortTermEmpsList })} className="flex items-center gap-1.5 col-span-2 justify-center cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors">
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#06b6d4' }} />عقود مؤقتة بالأشهر ({dashboardData.shortTermTotal})
            </div>
          </div>
        </div>

        <div className="card px-5 sm:px-6 py-5 lg:col-span-2" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="m-0 text-[13.5px] font-black flex items-center gap-2" style={{ color: '#dc2626' }}>
              <span className="text-base">🚨</span> مهام عاجلة (اضغط للتجديد)
            </h4>
          </div>
          {dashboardData.urgentAlerts.length === 0 ? (
            <div className="stamp-green text-center py-8 rounded-xl text-[13px] font-bold" style={{ background: '#f0fdf4', color: '#16a34a' }}>
              لا توجد مهام عاجلة! جميع العقود سارية. 🎉
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[220px]">
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr><th>الكود</th><th>الموظف</th><th>الإدارة</th><th>الانتهاء</th><th>الحالة</th></tr>
                </thead>
                <tbody>
                  {dashboardData.urgentAlerts.map((alert) => {
                    const code = alert.employee_code || alert.EmployeeCode || alert.code;
                    return (
                      <tr key={alert.id || code} onClick={() => handleRowClick(code, 'contracts')} className="cursor-pointer hover:bg-slate-50 transition-colors">
                        <td className="font-mono font-bold" style={{ color: '#2563eb' }}>{code}</td>
                        <td className="font-bold">{alert.employee_name || alert.ArabicName}</td>
                        <td style={{ color: '#64748b', fontSize: '11px' }}>{alert.department || '—'}</td>
                        <td className="font-mono font-bold">{alert.contract_end_date}</td>
                        <td>
                          {alert.status === 'expired' ? (
                            <Stamp color="red">منتهي ({Math.abs(alert.days)})</Stamp>
                          ) : (
                            <Stamp color="amber">متبقي {alert.days} يوم</Stamp>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ⚠️ نافذة نواقص البيانات المحدثة */}
      {showMissingDataModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '700px', maxHeight: '85vh', overflowY: 'auto', background: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#dc2626', fontWeight: '800' }}>⚠️ سجل نواقص البيانات ({dashboardData.missingDataList.length} موظف)</h3>
              <button onClick={() => setShowMissingDataModal(false)} style={{ background: '#f8fafc', border: 0, color: '#64748b', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            {dashboardData.missingDataList.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#16a34a', fontWeight: 'bold' }}>بيانات جميع الموظفين مكتملة بنجاح! ✅</div>
            ) : (
              <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '10px', color: '#64748b' }}>الكود</th>
                      <th style={{ padding: '10px', color: '#64748b' }}>الموظف</th>
                      <th style={{ padding: '10px', color: '#64748b' }}>النواقص</th>
                      <th style={{ padding: '10px', color: '#64748b', textAlign: 'center' }}>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.missingDataList.map((emp, idx) => {
                      const empCode = emp.employee_code || emp.EmployeeCode || emp.code || '';
                      const empName = emp.employee_name || emp.ArabicName || emp.name || '';
                      return (
                        <tr key={empCode || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{empCode || '—'}</td>
                          <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{empName || '—'}</td>
                          <td style={{ padding: '10px', color: '#dc2626', fontWeight: 'bold' }}>
                            {!emp.national_id && <span>الرقم القومي </span>}
                            {!emp.mobile && <span>- الموبايل </span>}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            {/* ✅ توجيه مباشر ومضمون لصفحة الموظفين مع اختيار كود الموظف */}
                            <button 
                              onClick={() => handleRowClick(empCode, 'employees')} 
                              style={{ background: '#2563eb', color: '#ffffff', border: 0, padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                              تحديث السجل ✏️
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
        </div>
      )}

      {/* باقي النوافذ المنبثقة التفاعلية */}
      {selectedDeptDetails && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '820px', height: '80vh', background: '#ffffff', borderRadius: '16px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>
                  🏢 موظفو إدارة: {selectedDeptDetails.name}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>إجمالي القوة الإدارية: {selectedDeptDetails.emps.length} موظف</p>
              </div>
              <button onClick={() => setSelectedDeptDetails(null)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                إغلاق ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '10px' }}>الكود</th>
                    <th style={{ padding: '10px' }}>الموظف</th>
                    <th style={{ padding: '10px' }}>الوظيفة</th>
                    <th style={{ padding: '10px' }}>نوع العقد</th>
                    <th style={{ padding: '10px' }}>نهاية العقد</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDeptDetails.emps.map((emp) => {
                    const empCode = emp.employee_code || emp.EmployeeCode || emp.code;
                    return (
                      <tr key={empCode} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#2563eb' }}>{empCode}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name || emp.ArabicName}</td>
                        <td style={{ padding: '10px', color: '#64748b' }}>{emp.job_title || '—'}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{emp.contract_type || '—'}</td>
                        <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold' }}>{emp.contract_end_date || '—'}</td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <button onClick={() => handleRowClick(empCode, 'contracts')} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '5px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>عرض العقد ↗️</button>
                        </td>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '820px', height: '85vh', background: '#ffffff', borderRadius: '16px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            
            <div style={{ padding: '18px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#d97706', fontWeight: '800' }}>
                  🎂 سجل بلوغ سن الـ 60 (لصناع العقود الدائمة)
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                  إجمالي الموظفين المطابقين للفلتر: {displayTurning60List.length} موظف
                </p>
              </div>
              <button onClick={() => setShowAgeModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                إغلاق ✕
              </button>
            </div>

            <div style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '4px', background: '#f8fafc', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setAgeModalFilterMode('60days')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 0,
                    background: ageModalFilterMode === '60days' ? '#d97706' : 'transparent',
                    color: ageModalFilterMode === '60days' ? '#fff' : '#0f172a',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  الـ 60 يوماً القادمة
                </button>

                <button
                  type="button"
                  onClick={() => setAgeModalFilterMode('byMonth')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 0,
                    background: ageModalFilterMode === 'byMonth' ? '#d97706' : 'transparent',
                    color: ageModalFilterMode === 'byMonth' ? '#fff' : '#0f172a',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  🗓️ اختيار شهر وسنة
                </button>

                <button
                  type="button"
                  onClick={() => setAgeModalFilterMode('allYear')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 0,
                    background: ageModalFilterMode === 'allYear' ? '#d97706' : 'transparent',
                    color: ageModalFilterMode === 'allYear' ? '#fff' : '#0f172a',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  📅 كامل السنة
                </button>
              </div>

              {(ageModalFilterMode === 'byMonth' || ageModalFilterMode === 'allYear') && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {ageModalFilterMode === 'byMonth' && (
                    <select
                      value={ageModalSelectedMonth}
                      onChange={(e) => setAgeModalSelectedMonth(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold', outline: 'none' }}
                    >
                      <option value="">كل الأشهر</option>
                      {MONTHS_LIST.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  )}

                  <select
                    value={ageModalSelectedYear}
                    onChange={(e) => setAgeModalSelectedYear(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold', outline: 'none' }}
                  >
                    <option value="">كل السنوات</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                    <option value="2028">2028</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {displayTurning60List.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>
                  لا يوجد موظفون بعقود دائمة يبلغون سن الـ 60 وفق الخيارات المحددة. 🎉
                </div>
              ) : (
                <div className="table-responsive">
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px', color: '#64748b' }}>الكود</th>
                        <th style={{ padding: '10px', color: '#64748b' }}>الموظف</th>
                        <th style={{ padding: '10px', color: '#64748b' }}>الإدارة</th>
                        <th style={{ padding: '10px', color: '#64748b' }}>تاريخ الميلاد</th>
                        <th style={{ padding: '10px', color: '#64748b' }}>تاريخ بلوغ الـ 60</th>
                        <th style={{ padding: '10px', color: '#64748b', textAlign: 'center' }}>الحالة</th>
                        <th style={{ padding: '10px', color: '#64748b', textAlign: 'center' }}>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayTurning60List.map((emp) => {
                        const empCode = emp.employee_code || emp.EmployeeCode || emp.code;
                        return (
                          <tr key={empCode} style={{ borderBottom: '1px solid #f1f5f9', background: emp.daysLeft < 0 ? '#fef2f2' : 'transparent' }}>
                            <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb', fontFamily: 'monospace' }}>{empCode}</td>
                            <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name || emp.ArabicName}</td>
                            <td style={{ padding: '10px', color: '#64748b' }}>{emp.department || '—'}</td>
                            <td style={{ padding: '10px', fontFamily: 'monospace' }}>{emp.birthDate || '—'}</td>
                            <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold', color: emp.daysLeft < 0 ? '#dc2626' : '#0f172a' }}>{emp.age60Date}</td>
                            <td style={{ padding: '10px', textAlign: 'center' }}>
                              {emp.daysLeft < 0 ? (
                                <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #f87171' }}>🚨 بلغ بـ {Math.abs(emp.daysLeft)} يوم</span>
                              ) : emp.daysLeft <= 60 ? (
                                <span style={{ background: '#fffbe1', color: '#b45309', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '10px' }}>⏳ متبقي {emp.daysLeft} يوم</span>
                              ) : (
                                <span style={{ background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '10px' }}>🗓️ في {emp.age60Date}</span>
                              )}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'center' }}>
                              <button onClick={() => handleRowClick(empCode, 'contracts')} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '5px 12px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>تعديل/إنشاء عقد جديد ✏️</button>
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

      {selectedMonthDetails && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '800px', height: '80vh', background: '#ffffff', borderRadius: '16px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>
                  📈 عقود بدأ العمل عليها لشهر ({selectedMonthDetails.name})
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>إجمالي الموظفين: {selectedMonthDetails.emps.length} موظف</p>
              </div>
              <button onClick={() => setSelectedMonthDetails(null)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                إغلاق ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '10px' }}>الكود</th>
                    <th style={{ padding: '10px' }}>الموظف</th>
                    <th style={{ padding: '10px' }}>الإدارة</th>
                    <th style={{ padding: '10px' }}>نوع العقد</th>
                    <th style={{ padding: '10px' }}>بداية العقد</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedMonthDetails.emps.map((emp) => {
                    const empCode = emp.employee_code || emp.EmployeeCode || emp.code;
                    return (
                      <tr key={empCode} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#2563eb' }}>{empCode}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name || emp.ArabicName}</td>
                        <td style={{ padding: '10px', color: '#64748b' }}>{emp.department || '—'}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold' }}>{emp.contract_type || '—'}</td>
                        <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold' }}>{emp.contract_start_date || '—'}</td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <button onClick={() => handleRowClick(empCode, 'contracts')} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '5px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>عرض العقد ↗️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {selectedDonutDetails && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '800px', height: '80vh', background: '#ffffff', borderRadius: '16px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>
                  📑 كشف الموظفين: {selectedDonutDetails.title}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>إجمالي الموظفين: {selectedDonutDetails.emps.length} موظف</p>
              </div>
              <button onClick={() => setSelectedDonutDetails(null)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                إغلاق ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {selectedDonutDetails.emps.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا يوجد موظفون في هذه الفئة حالياً.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '10px' }}>الكود</th>
                      <th style={{ padding: '10px' }}>الموظف</th>
                      <th style={{ padding: '10px' }}>الإدارة</th>
                      <th style={{ padding: '10px' }}>الوظيفة</th>
                      <th style={{ padding: '10px' }}>نوع العقد</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDonutDetails.emps.map((emp) => {
                      const empCode = emp.employee_code || emp.EmployeeCode || emp.code;
                      return (
                        <tr key={empCode} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#2563eb' }}>{empCode}</td>
                          <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name || emp.ArabicName}</td>
                          <td style={{ padding: '10px', color: '#64748b' }}>{emp.department || '—'}</td>
                          <td style={{ padding: '10px', color: '#64748b' }}>{emp.job_title || '—'}</td>
                          <td style={{ padding: '10px', fontWeight: 'bold' }}>{emp.contract_type || '—'}</td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <button onClick={() => handleRowClick(empCode, 'contracts')} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '5px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>عرض العقد ↗️</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {showTotalEmpsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '800px', height: '80vh', background: '#ffffff', borderRadius: '16px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>
                  👥 كشف إجمالي القوة البشرية النشطة
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>إجمالي: {dashboardData.totalEmps} موظف</p>
              </div>
              <button onClick={() => setShowTotalEmpsModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                إغلاق ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '10px' }}>الكود</th>
                    <th style={{ padding: '10px' }}>الموظف</th>
                    <th style={{ padding: '10px' }}>الإدارة</th>
                    <th style={{ padding: '10px' }}>الوظيفة</th>
                    <th style={{ padding: '10px' }}>نوع العقد</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.filteredEmps.map((emp) => {
                    const empCode = emp.employee_code || emp.EmployeeCode || emp.code;
                    return (
                      <tr key={empCode} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#2563eb' }}>{empCode}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name || emp.ArabicName}</td>
                        <td style={{ padding: '10px', color: '#64748b' }}>{emp.department || '—'}</td>
                        <td style={{ padding: '10px', color: '#64748b' }}>{emp.job_title || '—'}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold' }}>{emp.contract_type || '—'}</td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <button onClick={() => handleRowClick(empCode, 'contracts')} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '5px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>عرض العقد ↗️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showExpiringSoonModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '800px', height: '80vh', background: '#ffffff', borderRadius: '16px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#d97706', fontWeight: '800' }}>
                  📆 عقود تنتهي خلال الـ 60 يوم القادمة (من 0 حتى 60 يوم)
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>إجمالي المستحقين: {dashboardData.expiringSoonList.length} موظف</p>
              </div>
              <button onClick={() => setShowExpiringSoonModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                إغلاق ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {dashboardData.expiringSoonList.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا توجد عقود تنتهي خلال الـ 60 يوم القادمة. 🎉</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '10px' }}>الكود</th>
                      <th style={{ padding: '10px' }}>الموظف</th>
                      <th style={{ padding: '10px' }}>الإدارة</th>
                      <th style={{ padding: '10px' }}>نوع العقد</th>
                      <th style={{ padding: '10px' }}>تاريخ الانتهاء</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>المتبقي</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.expiringSoonList.map((emp) => {
                      const empCode = emp.employee_code || emp.EmployeeCode || emp.code;
                      return (
                        <tr key={empCode} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#2563eb' }}>{empCode}</td>
                          <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name || emp.ArabicName}</td>
                          <td style={{ padding: '10px', color: '#64748b' }}>{emp.department || '—'}</td>
                          <td style={{ padding: '10px', fontWeight: 'bold' }}>
                            {emp.contract_type} {emp.isPermanentTurning60 && <span style={{ fontSize: '9px', background: '#fffbe1', color: '#b45309', padding: '2px 6px', borderRadius: '4px' }}>بلوغ 60</span>}
                          </td>
                          <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold' }}>{emp.contract_end_date || '—'}</td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <span style={{ color: '#d97706', fontWeight: 'bold' }}>متبقي {emp.days} يوم</span>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <button onClick={() => handleRowClick(empCode, 'contracts')} style={{ background: '#fffbe1', color: '#b45309', border: '1px solid #fde68a', padding: '5px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>تجديد العقد ↗️</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {showShortTermModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '700px', height: '80vh', background: '#ffffff', borderRadius: '16px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#2563eb', fontWeight: '800' }}>
                  ⏱️ العقود المؤقتة وفترات الاختبار (بالأشهر)
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
                      <div key={idx} onClick={() => setSelectedShortTermDept(group.deptName)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s', background: '#ffffff' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f172a' }}>🏢 {group.deptName}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 'bold' }}>{group.emps.length} موظف</span>
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
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px', color: '#64748b' }}>الموظف</th>
                        <th style={{ padding: '10px', color: '#64748b' }}>سجل التعاقد</th>
                        <th style={{ padding: '10px', color: '#64748b' }}>الانتهاء</th>
                        <th style={{ padding: '10px', color: '#64748b', textAlign: 'center' }}>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.shortTermList.find(g => g.deptName === selectedShortTermDept)?.emps.map((emp) => {
                        const empCode = emp.employee_code || emp.EmployeeCode || emp.code;
                        const daysLeft = getDaysRemaining(emp.contract_end_date);
                        return (
                          <tr key={empCode} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name || emp.ArabicName}</div>
                              <div style={{ fontSize: '10px', color: '#2563eb', fontFamily: 'monospace', fontWeight: 'bold' }}>{empCode}</div>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <span style={{ background: '#f8fafc', color: '#0f172a', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px dashed #cbd5e1' }}>{emp.historyDesc}</span>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#0f172a' }}>{emp.contract_end_date}</div>
                              {daysLeft !== null && <div style={{ fontSize: '9px', color: daysLeft < 0 ? '#dc2626' : '#d97706', fontWeight: 'bold' }}>{daysLeft < 0 ? `منتهي` : `متبقي ${daysLeft} يوم`}</div>}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'center' }}>
                              <button onClick={() => handleRowClick(empCode, 'contracts')} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>العقد ↗️</button>
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

    </div>
  );
}
