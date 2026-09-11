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

  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showShortTermModal, setShowShortTermModal] = useState(false);
  const [showMissingDataModal, setShowMissingDataModal] = useState(false);

  const [selectedShortTermDept, setSelectedShortTermDept] = useState<string | null>(null);
  
  // حالة تفاعلية لعرض تفاصيل الشهر المختار من الرسم البياني
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

    return { birthDate: birthDate.toISOString().split('T')[0], age60Date: age60Date.toISOString().split('T')[0], daysUntil60 };
  };

  const companiesList = Array.from(new Set(allEmployees.map((e) => getField(e, 'company', 'Company')).filter(Boolean)));
  const deptsList = Array.from(new Set(allEmployees.map((e) => getField(e, 'department', 'Department')).filter(Boolean)));

  const dashboardData = useMemo(() => {
    const targetYear = 2027; // تثبيت العرض لسنة 2027

    // الموظفون النشطون (استبعاد التحويلات للإحصائيات العامة)
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

    // 🌟 1. حصر العقود المنتهية (تحويلات تحت الاعتماد + إيقاف راتب / إنهاء تعاقد)
    const expiredEmployeesList = allEmployees.filter((emp) => {
      const dept = String(getField(emp, 'department', 'Department') || '').trim();
      const job = String(getField(emp, 'job_title', 'JobTitle') || '').trim();
      const cType = String(getField(emp, 'contract_type', 'ContractType') || '').trim();
      const status = String(getField(emp, 'status', 'Status') || '').toLowerCase();

      const matchesComp = !filterCompany || String(getField(emp, 'company', 'Company') || '').toLowerCase().includes(filterCompany.toLowerCase());

      const isTransferDept = dept.includes('تحويلات تحت الاعتماد') || dept.includes('تحويلات');
      const isTerminatedJobOrType = job.includes('ايقاف راتب - انتهاء عقد') || 
                                    job.includes('إيقاف راتب') || 
                                    cType.includes('انهاء تعاقد') || 
                                    cType.includes('إنهاء تعاقد') || 
                                    status === 'inactive' || 
                                    status === 'terminated';

      return matchesComp && isTransferDept && isTerminatedJobOrType;
    });

    const expired = expiredEmployeesList.length;

    let expiring = 0, perm = 0, fixed = 0, aboveAge = 0, shortTermTotal = 0;
    const deptsCount: Record<string, number> = {};
    const alerts: any[] = [];
    const turning60List: any[] = [];
    const shortTermByDept: Record<string, any[]> = {}; 
    const missingDataList: any[] = [];
    
    const monthsNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const contractsByMonth = monthsNames.map((name) => ({ name, count: 0, emps: [] as any[] }));

    filteredEmps.forEach((emp) => {
      const type = String(getField(emp, 'contract_type', 'ContractType') || 'محدد المدة').trim();
      const dept = String(getField(emp, 'department', 'Department') || 'غير محدد').trim();
      const nationalId = getField(emp, 'national_id', 'NationalID');
      const mobile = getField(emp, 'mobile', 'Mobile');
      const startDateStr = getField(emp, 'contract_start_date', 'ContractStartDate', 'hiring_date', 'HiringDate');
      const endDateStr = getField(emp, 'contract_end_date', 'ContractEndDate');
      const empCode = getField(emp, 'employee_code', 'EmployeeCode');
      const empName = getField(emp, 'employee_name', 'ArabicName', 'EmployeeName');
      
      deptsCount[dept] = (deptsCount[dept] || 0) + 1;

      if (!nationalId || !mobile) {
        missingDataList.push({ ...emp, employee_code: empCode, employee_name: empName, national_id: nationalId, mobile });
      }

      // 🌟 2. التوزيع الشهري حصرياً للعقود التي تنتهي في عام 2027
      if (endDateStr && !type.includes('دائم')) {
        const endDate = new Date(endDateStr);
        if (!isNaN(endDate.getTime()) && endDate.getFullYear() === targetYear) {
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
        const ageInfo = getAge60Info(nationalId);
        if (ageInfo && ageInfo.daysUntil60 <= 60) {
          turning60List.push({ ...emp, employee_code: empCode, employee_name: empName, birthDate: ageInfo.birthDate, age60Date: ageInfo.age60Date, daysLeft: ageInfo.daysUntil60 });
        }
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
    turning60List.sort((a, b) => a.daysLeft - b.daysLeft); 

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
      expiredCount: expired,
      expiredEmployeesList,
      expiringSoonCount: expiring,
      expiringSoonPct: calcPct(expiring),
      pendingCount: pendingRequests.length,
      waitingSignCount: waitingSign.length,
      missingDataList,
      topDepts,
      urgentAlerts,
      contractsByMonth,
      shortTermTotal,
      shortTermList,
      turning60List
    };
  }, [allEmployees, allRenewals, filterCompany, filterDept]);

  const handleRowClick = (empCode: string) => navigateTo('contracts', { jumpSearch: empCode });

  const dateFormatted = currentTime.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeFormatted = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  const maxMonthCount = Math.max(...(dashboardData?.contractsByMonth.map((m) => m.count) || []), 1);

  const totalContracts = dashboardData.permCount + dashboardData.fixedCount + dashboardData.aboveAgeCount;
  const p1 = totalContracts ? (dashboardData.permCount / totalContracts) * 100 : 0;
  const p2 = p1 + (totalContracts ? (dashboardData.fixedCount / totalContracts) * 100 : 0);
  const donutGradient = totalContracts === 0 
    ? 'conic-gradient(var(--line) 0% 100%)' 
    : `conic-gradient(var(--stamp-green) 0% ${p1}%, var(--stamp-blue) ${p1}% ${p2}%, var(--stamp-amber) ${p2}% 100%)`;

  return (
    <div className="flex flex-col gap-5" style={{ direction: 'rtl', paddingBottom: '40px' }}>
      
      {/* رأس الصفحة */}
      <div className="card flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 sm:px-6 py-5">
        <div>
          <h2 className="m-0 text-lg sm:text-xl font-extrabold tracking-tight" style={{ color: 'var(--navy-950)' }}>
            بوابة تجديد العقود لشركة المراسم الدولية والشركات الشقيقة
          </h2>
          <div className="flex items-center gap-3 mt-2 text-[12px] font-bold" style={{ color: 'var(--muted)' }}>
            <span>📅 {dateFormatted}</span>
            <span style={{ color: 'var(--line)' }}>|</span>
            <span className="font-mono" style={{ color: 'var(--brass-600)' }}>⏰ {timeFormatted}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input list="dashCompList" className="field" placeholder="🏢 كل الشركات (ابحث...)" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} />
          <datalist id="dashCompList">{companiesList.map((c: any, i) => <option key={i} value={c} />)}</datalist>

          <input list="dashDeptList" className="field" placeholder="💼 كل الإدارات (ابحث...)" value={filterDept} onChange={(e) => setFilterDept(e.target.value)} />
          <datalist id="dashDeptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>

          {(filterCompany || filterDept) && (
            <button className="field font-bold" style={{ background: 'var(--paper)', cursor: 'pointer' }} onClick={() => { setFilterCompany(''); setFilterDept(''); }}>إعادة ضبط</button>
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
        {/* 🌟 كارت العقود المنتهية المعدل */}
        <KpiCard 
          loading={loading} 
          tone="red" 
          title="تحويلات / إنهاء تعاقد" 
          value={dashboardData.expiredCount} 
          sub="إيقاف راتب / انتهاء عقد" 
          icon="🚨" 
          onClick={() => navigateTo('contracts', { jumpSearch: 'تحويلات تحت الاعتماد' })} 
        />
      </div>

      {/* الرسوم البيانية */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="card px-5 sm:px-6 py-5">
          <h4 className="m-0 mb-5 text-[13.5px] font-extrabold" style={{ color: 'var(--navy-950)' }}>📊 أكبر 5 إدارات (كثافة)</h4>
          <div className="flex flex-col gap-4">
            {dashboardData.topDepts.map((dept, idx) => {
              const max = dashboardData.topDepts[0]?.count || 1;
              const percentage = (dept.count / max) * 100;
              return (
                <div key={idx}>
                  <div className="flex justify-between text-[11px] font-bold mb-1.5" style={{ color: 'var(--ink)' }}>
                    <span>{dept.name}</span>
                    <span className="font-mono">{dept.count.toLocaleString('en-US')}</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--paper)' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${percentage}%`, background: 'linear-gradient(90deg, var(--brass-400), var(--brass-600))' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 🌟 الرسم البياني المظبوط حصرياً لعام 2027 بدون فلتر */}
        <div className="card px-5 sm:px-6 py-5 flex flex-col lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h4 className="m-0 text-[13.5px] font-extrabold" style={{ color: 'var(--navy-950)' }}>
              📈 التوزيع الشهري للعقود التي تنتهي في عام 2027
            </h4>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--stamp-blue)', background: 'var(--stamp-blue-bg)', padding: '4px 10px', borderRadius: '6px' }}>
              عام 2027 📅
            </span>
          </div>
          <div className="flex-1 flex items-end gap-1.5 sm:gap-2 h-[150px] pb-4 border-b" style={{ borderColor: 'var(--line)' }}>
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
                  <span className="text-[10px] font-mono font-bold mb-1" style={{ color: month.count > 0 ? 'var(--stamp-green)' : 'transparent' }}>
                    {month.count.toLocaleString('en-US')}
                  </span>
                  <div className="w-full max-w-[32px] rounded-t-md transition-all duration-700" style={{ height: `${height}%`, minHeight: month.count > 0 ? '4px' : '0', background: month.count > 0 ? 'linear-gradient(180deg, var(--brass-400), var(--brass-600))' : 'var(--paper)' }} />
                  <span className="text-[10px] font-bold mt-2" style={{ color: 'var(--muted)' }}>{month.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="card px-5 sm:px-6 py-5 flex flex-col justify-center items-center relative lg:col-span-1">
          <h4 className="m-0 mb-6 text-[13.5px] font-extrabold w-full text-right" style={{ color: 'var(--navy-950)' }}>📑 توزيع هيكل العقود</h4>
          
          <div style={{ width: '160px', height: '160px', borderRadius: '50%', background: donutGradient, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ width: '110px', height: '110px', background: 'var(--paper-card)', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>الإجمالي</span>
              <span style={{ fontSize: '18px', fontWeight: '900', color: 'var(--navy-950)' }}>{totalContracts.toLocaleString('en-US')}</span>
            </div>
          </div>

          <div className="w-full flex justify-between mt-8 text-[11px] font-bold px-2">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[var(--stamp-green)]" />دائم ({dashboardData.permCount})</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[var(--stamp-blue)]" />محدد ({dashboardData.fixedCount})</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[var(--stamp-amber)]" />فوق السن ({dashboardData.aboveAgeCount})</div>
          </div>
        </div>

        <div className="card px-5 sm:px-6 py-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h4 className="m-0 text-[13.5px] font-extrabold flex items-center gap-2" style={{ color: 'var(--stamp-red)' }}>
              <span className="text-base">🚨</span> مهام عاجلة (اضغط للتجديد)
            </h4>
          </div>
          {dashboardData.urgentAlerts.length === 0 ? (
            <div className="stamp-green text-center py-8 rounded-xl text-[13px] font-bold" style={{ background: 'var(--stamp-green-bg)', color: 'var(--stamp-green)' }}>
              لا توجد مهام عاجلة! جميع العقود سارية. 🎉
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[220px]">
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr><th>الكود</th><th>الموظف</th><th>الإدارة</th><th>الانتهاء</th><th>الحالة</th></tr>
                </thead>
                <tbody>
                  {dashboardData.urgentAlerts.map((alert) => (
                    <tr key={alert.id || alert.employee_code} onClick={() => handleRowClick(alert.employee_code)} className="cursor-pointer hover:bg-slate-50 transition-colors">
                      <td className="font-mono font-bold" style={{ color: 'var(--brass-600)' }}>{alert.employee_code}</td>
                      <td className="font-bold">{alert.employee_name}</td>
                      <td style={{ color: 'var(--muted)', fontSize: '11px' }}>{alert.department || '—'}</td>
                      <td className="font-mono font-bold">{alert.contract_end_date}</td>
                      <td>
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

      {/* نافذة عرض العقود التفاعلية من الرسم البياني */}
      {selectedChartMonth && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '700px', maxHeight: '85vh', overflowY: 'auto', background: 'var(--paper-card)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--stamp-blue)', fontWeight: '800' }}>
                🗓️ عقود تنتهي في {selectedChartMonth.name} 2027
              </h3>
              <button onClick={() => setSelectedChartMonth(null)} style={{ background: 'var(--paper)', border: 0, color: 'var(--muted)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>
                    <th style={{ padding: '10px', color: 'var(--muted)' }}>الكود</th>
                    <th style={{ padding: '10px', color: 'var(--muted)' }}>الموظف</th>
                    <th style={{ padding: '10px', color: 'var(--muted)' }}>الإدارة</th>
                    <th style={{ padding: '10px', color: 'var(--muted)' }}>تاريخ الانتهاء</th>
                    <th style={{ padding: '10px', color: 'var(--muted)', textAlign: 'center' }}>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedChartMonth.emps.map((emp: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--paper)' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--brass-500)' }}>{emp.employee_code}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--ink)' }}>{emp.employee_name}</td>
                      <td style={{ padding: '10px', color: 'var(--muted)' }}>{emp.department || '—'}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--ink)' }}>{emp.contract_end_date}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button onClick={() => { setSelectedChartMonth(null); handleRowClick(emp.employee_code); }} style={{ background: 'var(--paper-card)', color: 'var(--stamp-blue)', border: '1px solid var(--stamp-blue-bg)', padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>إدارة العقد ↗️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modals باقي النوافذ */}
      {showShortTermModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '700px', height: '80vh', background: 'var(--paper-card)', borderRadius: '16px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--stamp-blue)', fontWeight: '800' }}>
                  ⏱️ العقود المؤقتة وفترات الاختبار
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--muted)' }}>إجمالي: {dashboardData.shortTermTotal} موظف</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {selectedShortTermDept && (
                  <button onClick={() => setSelectedShortTermDept(null)} style={{ background: 'var(--line)', border: 0, color: 'var(--ink)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                    🔙 رجوع للإدارات
                  </button>
                )}
                <button onClick={() => { setShowShortTermModal(false); setSelectedShortTermDept(null); }} style={{ background: 'var(--stamp-red-bg)', border: 0, color: 'var(--stamp-red)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                  إغلاق ✕
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {!selectedShortTermDept ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {dashboardData.shortTermList.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: 'bold', fontSize: '13px', marginTop: '40px' }}>لا توجد عقود مؤقتة حالياً.</div>
                  ) : (
                    dashboardData.shortTermList.map((group, idx) => (
                      <div key={idx} onClick={() => setSelectedShortTermDept(group.deptName)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--line)', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s', background: 'var(--paper-card)' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--ink)' }}>🏢 {group.deptName}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ background: 'var(--stamp-blue-bg)', color: 'var(--stamp-blue)', padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 'bold' }}>{group.emps.length} موظف</span>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>عرض 👁️</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="table-responsive">
                  <h4 style={{ margin: '0 0 16px', color: 'var(--ink)', fontSize: '14px' }}>إدارة: {selectedShortTermDept}</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>
                        <th style={{ padding: '10px', color: 'var(--muted)' }}>الموظف</th>
                        <th style={{ padding: '10px', color: 'var(--muted)' }}>سجل التعاقد</th>
                        <th style={{ padding: '10px', color: 'var(--muted)' }}>الانتهاء</th>
                        <th style={{ padding: '10px', color: 'var(--muted)', textAlign: 'center' }}>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.shortTermList.find(g => g.deptName === selectedShortTermDept)?.emps.map((emp) => {
                        const daysLeft = getDaysRemaining(emp.contract_end_date);
                        return (
                          <tr key={emp.employee_code} style={{ borderBottom: '1px solid var(--paper)' }}>
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontWeight: 'bold', color: 'var(--ink)' }}>{emp.employee_name}</div>
                              <div style={{ fontSize: '10px', color: 'var(--brass-500)', fontFamily: 'monospace', fontWeight: 'bold' }}>{emp.employee_code}</div>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <span style={{ background: 'var(--paper)', color: 'var(--ink)', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px dashed var(--line)' }}>{emp.historyDesc}</span>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--ink)' }}>{emp.contract_end_date}</div>
                              {daysLeft !== null && <div style={{ fontSize: '9px', color: daysLeft < 0 ? 'var(--stamp-red)' : 'var(--stamp-amber)', fontWeight: 'bold' }}>{daysLeft < 0 ? `منتهي` : `متبقي ${daysLeft} يوم`}</div>}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'center' }}>
                              <button onClick={() => { setShowShortTermModal(false); handleRowClick(emp.employee_code); }} style={{ background: 'var(--paper-card)', color: 'var(--stamp-blue)', border: '1px solid var(--stamp-blue-bg)', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>العقد ↗️</button>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '700px', maxHeight: '85vh', overflowY: 'auto', background: 'var(--paper-card)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--stamp-red)', fontWeight: '800' }}>⚠️ سجل نواقص البيانات ({dashboardData.missingDataList.length} موظف)</h3>
              <button onClick={() => setShowMissingDataModal(false)} style={{ background: 'var(--paper)', border: 0, color: 'var(--muted)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>
            {dashboardData.missingDataList.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--stamp-green)', fontWeight: 'bold' }}>بيانات جميع الموظفين مكتملة بنجاح! ✅</div>
            ) : (
              <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>
                      <th style={{ padding: '10px', color: 'var(--muted)' }}>الكود</th>
                      <th style={{ padding: '10px', color: 'var(--muted)' }}>الموظف</th>
                      <th style={{ padding: '10px', color: 'var(--muted)' }}>النواقص</th>
                      <th style={{ padding: '10px', color: 'var(--muted)', textAlign: 'center' }}>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.missingDataList.map((emp) => (
                      <tr key={emp.employee_code} style={{ borderBottom: '1px solid var(--paper)' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--ink)' }}>{emp.employee_code}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--ink)' }}>{emp.employee_name}</td>
                        <td style={{ padding: '10px', color: 'var(--stamp-red)', fontWeight: 'bold' }}>
                          {!emp.national_id && <span>الرقم القومي </span>}
                          {!emp.mobile && <span>- الموبايل </span>}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <button onClick={() => { setShowMissingDataModal(false); navigateTo('employees'); }} style={{ background: 'var(--ink)', color: 'var(--paper-card)', border: 0, padding: '5px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>تحديث السجل ✏️</button>
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
