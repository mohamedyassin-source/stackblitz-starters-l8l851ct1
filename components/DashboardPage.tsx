'use client';
import { useState, useEffect, useMemo } from 'react';
import { navigateTo } from '@/lib/navigation';
import { useAppData } from '@/lib/DataContext';
import KpiCard from './KpiCard';
import Stamp from './Stamp';

export default function DashboardPage() {
  const { employees: allEmployees, renewals: allRenewals, loading } = useAppData();

  const [filterCompany, setFilterCompany] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showShortTermModal, setShowShortTermModal] = useState(false);
  const [showMissingDataModal, setShowMissingDataModal] = useState(false);

  const [selectedShortTermDept, setSelectedShortTermDept] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
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
    const daysUntil60 = Math.ceil((age60Date.getTime() - today.getTime()) / (1000 * 3600 * 24));

    return { birthDate: birthDate.toISOString().split('T')[0], age60Date: age60Date.toISOString().split('T')[0], daysUntil60 };
  };

  const companiesList = Array.from(new Set(allEmployees.map((e) => e.company).filter(Boolean)));
  const deptsList = Array.from(new Set(allEmployees.map((e) => e.department).filter(Boolean)));

  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    let expired = 0, expiring = 0, perm = 0, fixed = 0, aboveAge = 0, shortTermTotal = 0;
    const deptsCount: Record<string, number> = {};
    const alerts: any[] = [];
    const turning60List: any[] = [];
    const shortTermByDept: Record<string, any[]> = {}; 
    const missingDataList: any[] = [];
    
    const monthsNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const contractsByMonth = monthsNames.map((name) => ({ name, count: 0 }));

    filteredEmps.forEach((emp) => {
      const type = emp.contract_type || '';
      const dept = emp.department || 'غير محدد';
      deptsCount[dept] = (deptsCount[dept] || 0) + 1;

      if (!emp.national_id || !emp.mobile) {
        missingDataList.push(emp);
      }

      if (emp.contract_start_date) {
        const startDate = new Date(emp.contract_start_date);
        if (!isNaN(startDate.getTime())) {
          const monthIdx = startDate.getMonth();
          if (monthIdx >= 0 && monthIdx < 12) {
            contractsByMonth[monthIdx].count++;
          }
        }
      }

      if (type === 'دائم') {
        perm++;
        const ageInfo = getAge60Info(emp.national_id);
        if (ageInfo && ageInfo.daysUntil60 <= 60) {
          turning60List.push({ ...emp, birthDate: ageInfo.birthDate, age60Date: ageInfo.age60Date, daysLeft: ageInfo.daysUntil60 });
        }
      } else if (type.includes('فوق السن')) {
        aboveAge++;
      } else {
        fixed++;
      }

      if (type !== 'دائم') {
        const days = getDaysRemaining(emp.contract_end_date);
        if (days !== null) {
          if (days < 0) {
            expired++;
            alerts.push({ ...emp, days, status: 'expired' });
          } else if (days <= 60) {
            expiring++;
            alerts.push({ ...emp, days, status: 'expiring' });
          }
        }
      }

      if (type === 'محدد المدة') {
        const empRens = filteredRens
          .filter(r => r.employee_code === emp.employee_code && (r.status === 'Approved' || r.status === 'معتمد' || r.renewal_status === 'Approved'))
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
          shortTermTotal++;
          if (!shortTermByDept[dept]) shortTermByDept[dept] = [];
          shortTermByDept[dept].push({ ...emp, historyDesc });
        }
      }
    });

    alerts.sort((a, b) => a.days - b.days);
    turning60List.sort((a, b) => a.daysLeft - b.daysLeft); 

    const shortTermList = Object.entries(shortTermByDept)
      .map(([deptName, emps]) => ({ 
        deptName, 
        emps: emps.sort((a, b) => getDaysRemaining(a.contract_end_date)! - getDaysRemaining(b.contract_end_date)!) 
      }))
      .sort((a, b) => b.emps.length - a.emps.length);

    const urgentAlerts = alerts.slice(0, 20);
    const topDepts = Object.entries(deptsCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const pendingRequests = filteredRens.filter(r => r.status === 'Pending' || r.status === 'قيد الانتظار');
    const waitingSign = filteredRens.filter(r => r.status === 'Approved' && r.signature_status !== 'تم التوقيع');

    return {
      totalEmps: filteredEmps.length,
      permCount: perm,
      fixedCount: fixed,
      aboveAgeCount: aboveAge,
      expiredCount: expired,
      expiringSoonCount: expiring,
      pendingCount: pendingRequests.length,
      waitingSignCount: waitingSign.length,
      missingDataList,
      turning60List,
      topDepts,
      urgentAlerts,
      contractsByMonth,
      shortTermTotal,
      shortTermList
    };
  }, [allEmployees, allRenewals, filterCompany, filterDept]);

  const handleRowClick = (empCode: string) => navigateTo('contracts', { jumpSearch: empCode });

  const dateFormatted = currentTime.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeFormatted = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  const maxMonthCount = Math.max(...(dashboardData?.contractsByMonth.map((m) => m.count) || []), 1);

  const totalContracts = dashboardData.permCount + dashboardData.fixedCount + dashboardData.aboveAgeCount;
  const p1 = totalContracts ? (dashboardData.permCount / totalContracts) * 100 : 0;
  const p2 = p1 + (totalContracts ? (dashboardData.fixedCount / totalContracts) * 100 : 0);
  
  // تدرج ألوان الدونات شارت (يدعم الوضعين)
  const donutGradient = totalContracts === 0 
    ? 'conic-gradient(var(--border-color) 0% 100%)' 
    : `conic-gradient(var(--success-text) 0% ${p1}%, #2563eb ${p1}% ${p2}%, var(--warning-text) ${p2}% 100%)`;

  return (
    <div className="flex flex-col gap-6 pb-10">
      
      {/* 🌟 رأس الصفحة الاحترافي */}
      <div className="executive-card flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <h2 className="m-0 text-xl sm:text-2xl font-extrabold tracking-tight text-primary">
            بوابة تجديد العقود لشركة المراسم الدولية
          </h2>
          <div className="flex items-center gap-3 mt-3 text-xs font-bold text-muted">
            <span>📅 {dateFormatted}</span>
            <span className="text-border">|</span>
            <span className="font-mono text-gold flex items-center gap-1">⏰ {timeFormatted}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <input list="dashCompList" className="bg-background border border-border text-primary text-xs font-bold rounded-lg px-4 py-2.5 outline-none focus:border-gold transition-colors w-full sm:w-auto" placeholder="🏢 كل الشركات (ابحث...)" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} />
            <datalist id="dashCompList">{companiesList.map((c: any, i) => <option key={i} value={c} />)}</datalist>
          </div>

          <div className="relative">
            <input list="dashDeptList" className="bg-background border border-border text-primary text-xs font-bold rounded-lg px-4 py-2.5 outline-none focus:border-gold transition-colors w-full sm:w-auto" placeholder="💼 كل الإدارات (ابحث...)" value={filterDept} onChange={(e) => setFilterDept(e.target.value)} />
            <datalist id="dashDeptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>
          </div>

          {(filterCompany || filterDept) && (
            <button className="bg-background border border-border text-primary hover:text-danger-text px-4 py-2.5 rounded-lg text-xs font-bold transition-colors" onClick={() => { setFilterCompany(''); setFilterDept(''); }}>إعادة ضبط ✕</button>
          )}
        </div>
      </div>

      {/* 🌟 الكروت السريعة (تعتمد على KpiCard المحدث) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard loading={loading} title="إجمالي القوة" value={dashboardData.totalEmps} sub="عرض السجل" icon="👥" onClick={() => navigateTo('employees')} />
        <KpiCard loading={loading} title="طلبات معلقة" value={dashboardData.pendingCount} sub={`+ ${dashboardData.waitingSignCount} توقيع`} icon="⏳" onClick={() => navigateTo('renewals')} />
        <KpiCard loading={loading} title="عقود مؤقتة" value={dashboardData.shortTermTotal} sub="عرض القائمة" icon="⏱️" onClick={() => setShowShortTermModal(true)} />
        <KpiCard loading={loading} title="تنتهي قريباً" value={dashboardData.expiringSoonCount} sub="إدارة العقود" icon="📆" onClick={() => navigateTo('contracts')} />
        <KpiCard loading={loading} title="عقود منتهية" value={dashboardData.expiredCount} sub="تسوية فورية" icon="🚨" onClick={() => navigateTo('contracts')} />
        <KpiCard loading={loading} title="نواقص بيانات" value={dashboardData.missingDataList.length} sub="مراجعة السجل" icon="⚠️" onClick={() => setShowMissingDataModal(true)} />
      </div>

      {/* 🌟 الصف الأول من الرسوم البيانية */}
      <div className="grid lg:grid-cols-3 gap-6">
        
        {/* 1. الإدارات (ثلث المساحة) */}
        <div className="executive-card p-5 sm:p-6">
          <h4 className="m-0 mb-6 text-sm font-extrabold text-primary flex items-center gap-2">📊 أكبر 5 إدارات (كثافة)</h4>
          <div className="flex flex-col gap-5">
            {dashboardData.topDepts.map((dept, idx) => {
              const max = dashboardData.topDepts[0]?.count || 1;
              const percentage = (dept.count / max) * 100;
              return (
                <div key={idx}>
                  <div className="flex justify-between text-xs font-bold mb-2 text-primary">
                    <span>{dept.name}</span>
                    <span className="font-mono text-gold">{dept.count.toLocaleString('en-US')}</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full overflow-hidden bg-background border border-border">
                    <div className="h-full rounded-full transition-all duration-700 bg-gold" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. الرسم البياني للشهور (ثلثي المساحة) */}
        <div className="executive-card p-5 sm:p-6 flex flex-col lg:col-span-2">
          <h4 className="m-0 mb-6 text-sm font-extrabold text-primary flex items-center gap-2">
            📈 التوزيع الشهري لبدايات العقود (كثافة التجديدات)
          </h4>
          <div className="flex-1 flex items-end gap-2 h-[180px] pb-4 border-b border-border">
            {dashboardData.contractsByMonth.map((month, idx) => {
              const height = maxMonthCount > 0 ? (month.count / maxMonthCount) * 100 : 0;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group">
                  <span className={`text-[10px] font-mono font-bold mb-2 transition-opacity duration-300 ${month.count > 0 ? 'text-primary opacity-100' : 'opacity-0'}`}>
                    {month.count.toLocaleString('en-US')}
                  </span>
                  <div className={`w-full max-w-[40px] rounded-t-lg transition-all duration-700 ${month.count > 0 ? 'bg-gold group-hover:bg-gold-hover' : 'bg-background'}`} style={{ height: `${height}%`, minHeight: month.count > 0 ? '6px' : '0' }} />
                  <span className="text-[11px] font-bold mt-3 text-muted">{month.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 🌟 الصف الثاني من الرسوم البيانية */}
      <div className="grid lg:grid-cols-3 gap-6">
        
        {/* 3. الدونات شارت (ثلث المساحة) */}
        <div className="executive-card p-5 sm:p-6 flex flex-col items-center justify-center relative lg:col-span-1 min-h-[300px]">
          <h4 className="m-0 mb-6 text-sm font-extrabold w-full text-right text-primary">📑 توزيع هيكل العقود</h4>
          
          <div className="w-44 h-44 rounded-full relative flex items-center justify-center shadow-lg transition-all" style={{ background: donutGradient }}>
            <div className="w-32 h-32 bg-card rounded-full flex flex-col items-center justify-center shadow-inner z-10 transition-colors">
              <span className="text-xs text-muted font-bold mb-1">الإجمالي</span>
              <span className="text-2xl font-black text-primary">{totalContracts.toLocaleString('en-US')}</span>
            </div>
          </div>

          <div className="w-full flex justify-between mt-8 text-xs font-bold px-2 text-primary">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[var(--success-text)] shadow-sm" />دائم ({dashboardData.permCount})</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-600 shadow-sm" />محدد ({dashboardData.fixedCount})</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[var(--warning-text)] shadow-sm" />فوق السن ({dashboardData.aboveAgeCount})</div>
          </div>
        </div>

        {/* 4. المهام العاجلة (ثلثي المساحة) */}
        <div className="executive-card p-5 sm:p-6 lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h4 className="m-0 text-sm font-extrabold flex items-center gap-2 text-[var(--danger-text)]">
              <span className="text-lg">🚨</span> مهام عاجلة تحتاج لتدخل (اضغط للذهاب)
            </h4>
          </div>
          {dashboardData.urgentAlerts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center bg-[var(--success-bg)] text-[var(--success-text)] rounded-xl text-sm font-bold border border-[var(--success-text)]/20 p-8">
              لا توجد مهام عاجلة! جميع العقود سارية وفي أمان. 🎉
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto max-h-[260px] pr-2">
              <table className="w-full text-right text-xs whitespace-nowrap executive-table">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="rounded-tr-lg">الكود</th>
                    <th>الموظف</th>
                    <th>الإدارة</th>
                    <th>الانتهاء</th>
                    <th className="rounded-tl-lg text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.urgentAlerts.map((alert) => (
                    <tr key={alert.id} onClick={() => handleRowClick(alert.employee_code)} className="cursor-pointer group">
                      <td className="font-mono font-bold text-gold group-hover:text-gold-hover">{alert.employee_code}</td>
                      <td className="font-bold text-primary">{alert.employee_name}</td>
                      <td className="text-muted">{alert.department || '—'}</td>
                      <td className="font-mono font-bold text-primary">{alert.contract_end_date}</td>
                      <td className="text-center">
                        {alert.status === 'expired' ? (
                          <span className="bg-[var(--danger-bg)] text-[var(--danger-text)] px-3 py-1.5 rounded-md font-bold text-[10px] border border-[var(--danger-text)]/20 inline-block">
                            منتهي ({Math.abs(alert.days)})
                          </span>
                        ) : (
                          <span className="bg-[var(--warning-bg)] text-[var(--warning-text)] px-3 py-1.5 rounded-md font-bold text-[10px] border border-[var(--warning-text)]/20 inline-block">
                            متبقي {alert.days}
                          </span>
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

      {/* 🌟 النوافذ المنبثقة (Modals) متوافقة مع الـ Dark Mode */}
      
      {/* 1. نافذة العقود المؤقتة */}
      {showShortTermModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 sm:p-6 transition-opacity">
          <div className="w-full max-w-3xl h-[85vh] bg-card rounded-2xl flex flex-col shadow-2xl overflow-hidden border border-border">
            <div className="p-5 sm:p-6 bg-background border-b border-border flex justify-between items-center shrink-0">
              <div>
                <h3 className="m-0 text-base font-extrabold text-blue-600 flex items-center gap-2">⏱️ العقود المؤقتة وفترات الاختبار</h3>
                <p className="mt-1 text-xs text-muted font-bold">إجمالي الحالات: {dashboardData.shortTermTotal} موظف تحت التقييم</p>
              </div>
              <div className="flex gap-2">
                {selectedShortTermDept && (
                  <button onClick={() => setSelectedShortTermDept(null)} className="bg-card border border-border text-primary px-4 py-2 rounded-lg cursor-pointer font-bold text-xs hover:bg-background transition-colors shadow-sm">
                    🔙 رجوع للإدارات
                  </button>
                )}
                <button onClick={() => { setShowShortTermModal(false); setSelectedShortTermDept(null); }} className="bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)]/20 px-4 py-2 rounded-lg cursor-pointer font-bold text-xs hover:opacity-80 transition-colors shadow-sm">
                  إغلاق ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              {!selectedShortTermDept ? (
                <div className="flex flex-col gap-3">
                  {dashboardData.shortTermList.length === 0 ? (
                    <div className="text-center text-muted font-bold text-sm mt-10">لا توجد عقود مؤقتة مسجلة حالياً.</div>
                  ) : (
                    dashboardData.shortTermList.map((group, idx) => (
                      <div key={idx} onClick={() => setSelectedShortTermDept(group.deptName)} className="flex justify-between items-center p-4 border border-border rounded-xl cursor-pointer transition-all hover:border-blue-500 bg-card hover:shadow-md group">
                        <div className="font-extrabold text-sm text-primary transition-colors group-hover:text-blue-600">🏢 {group.deptName}</div>
                        <div className="flex items-center gap-4">
                          <span className="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-4 py-1.5 rounded-full text-xs font-black shadow-sm">{group.emps.length} موظف</span>
                          <span className="text-xs text-muted font-bold group-hover:text-primary transition-colors">تصفح القائمة 👁️</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <h4 className="m-0 mb-5 text-primary text-sm font-extrabold border-r-4 border-blue-500 pr-3">قائمة موظفي إدارة: {selectedShortTermDept}</h4>
                  <table className="w-full text-right text-xs whitespace-nowrap executive-table">
                    <thead>
                      <tr>
                        <th className="rounded-tr-lg">الموظف</th>
                        <th>تحليل سجل التعاقد</th>
                        <th>الانتهاء</th>
                        <th className="rounded-tl-lg text-center">إجراء سريع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.shortTermList.find(g => g.deptName === selectedShortTermDept)?.emps.map((emp) => {
                        const daysLeft = getDaysRemaining(emp.contract_end_date);
                        return (
                          <tr key={emp.employee_code}>
                            <td>
                              <div className="font-bold text-primary text-sm mb-1">{emp.employee_name}</div>
                              <div className="text-[10px] text-gold font-mono font-bold">{emp.employee_code}</div>
                            </td>
                            <td>
                              <span className="bg-background text-primary px-3 py-1.5 rounded-md font-bold text-[10px] border border-border/50 border-dashed inline-block shadow-sm">{emp.historyDesc}</span>
                            </td>
                            <td>
                              <div className="font-mono font-bold text-primary mb-1">{emp.contract_end_date}</div>
                              {daysLeft !== null && <div className={`text-[10px] font-extrabold ${daysLeft < 0 ? 'text-[var(--danger-text)]' : 'text-[var(--warning-text)]'}`}>{daysLeft < 0 ? `منتهي منذ ${Math.abs(daysLeft)} يوم` : `متبقي ${daysLeft} يوم`}</div>}
                            </td>
                            <td className="text-center">
                              <button onClick={() => { setShowShortTermModal(false); handleRowClick(emp.employee_code); }} className="bg-card text-blue-600 border border-blue-200 dark:border-blue-800 px-4 py-2 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors shadow-sm">إدارة العقد ↗️</button>
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

      {/* 2. نافذة نواقص البيانات */}
      {showMissingDataModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 transition-opacity">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-card rounded-2xl shadow-2xl overflow-hidden border border-border">
            <div className="p-5 sm:p-6 bg-background border-b border-border flex justify-between items-center shrink-0">
              <h3 className="m-0 text-base font-extrabold text-[var(--danger-text)] flex items-center gap-2">⚠️ سجل نواقص البيانات ({dashboardData.missingDataList.length} موظف)</h3>
              <button onClick={() => setShowMissingDataModal(false)} className="bg-card border border-border text-primary px-4 py-2 rounded-lg cursor-pointer font-bold text-xs hover:bg-background transition-colors shadow-sm">إغلاق ✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              {dashboardData.missingDataList.length === 0 ? (
                <div className="bg-[var(--success-bg)] text-[var(--success-text)] p-8 text-center rounded-xl font-bold text-sm border border-[var(--success-text)]/20 shadow-sm">بيانات جميع الموظفين مكتملة بنجاح! السجل نظيف تماماً. ✅</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs whitespace-nowrap executive-table">
                    <thead>
                      <tr>
                        <th className="rounded-tr-lg">الكود</th>
                        <th>اسم الموظف</th>
                        <th>البيان المفقود</th>
                        <th className="rounded-tl-lg text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.missingDataList.map((emp) => (
                        <tr key={emp.employee_code}>
                          <td className="font-mono font-bold text-gold">{emp.employee_code}</td>
                          <td className="font-bold text-primary">{emp.employee_name}</td>
                          <td className="text-[var(--danger-text)] font-extrabold text-[11px]">
                            <div className="flex flex-col gap-1">
                              {!emp.national_id && <span>• الرقم القومي (14 رقم)</span>}
                              {!emp.mobile && <span>• رقم الهاتف (الموبايل)</span>}
                            </div>
                          </td>
                          <td className="text-center">
                            <button onClick={() => { setShowMissingDataModal(false); navigateTo('employees'); }} className="bg-primary text-card border border-border px-4 py-2 rounded-lg text-[10px] font-bold cursor-pointer hover:opacity-80 transition-opacity shadow-sm">تحديث السجل ✏️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. نافذة سن الـ 60 */}
      {showAgeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 transition-opacity">
          <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-card rounded-2xl shadow-2xl overflow-hidden border border-border">
            <div className="p-5 sm:p-6 bg-background border-b border-border flex justify-between items-center shrink-0">
              <h3 className="m-0 text-base font-extrabold text-gold flex items-center gap-2">🎂 موظفون عقودهم (دائمة) وبلغوا سن الـ 60</h3>
              <button onClick={() => setShowAgeModal(false)} className="bg-card border border-border text-primary px-4 py-2 rounded-lg cursor-pointer font-bold text-xs hover:bg-background transition-colors shadow-sm">إغلاق ✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              {dashboardData.turning60List.length === 0 ? (
                <div className="bg-background text-muted p-8 text-center rounded-xl font-bold text-sm border border-border border-dashed">لا يوجد موظفون (بعقود دائمة) يبلغون الـ 60 قريباً. 🎉</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs whitespace-nowrap executive-table">
                    <thead>
                      <tr>
                        <th className="rounded-tr-lg">الكود</th>
                        <th>الموظف</th>
                        <th>تاريخ البلوغ</th>
                        <th className="text-center">موقف الحالة</th>
                        <th className="rounded-tl-lg text-center">إجراء تسوية</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.turning60List.map((emp) => (
                        <tr key={emp.employee_code} className={emp.daysLeft < 0 ? 'bg-[var(--danger-bg)]/30' : ''}>
                          <td className="font-mono font-bold text-gold">{emp.employee_code}</td>
                          <td className="font-bold text-primary">{emp.employee_name}</td>
                          <td className={`font-mono font-extrabold ${emp.daysLeft < 0 ? 'text-[var(--danger-text)]' : 'text-primary'}`}>{emp.age60Date}</td>
                          <td className="text-center">
                            {emp.daysLeft < 0 ? (
                              <span className="bg-[var(--danger-bg)] text-[var(--danger-text)] px-3 py-1.5 rounded-md font-bold text-[10px] border border-[var(--danger-text)]/20 inline-block shadow-sm">🚨 تجاوز بـ {Math.abs(emp.daysLeft)} يوم</span>
                            ) : (
                              <span className="bg-[var(--warning-bg)] text-[var(--warning-text)] px-3 py-1.5 rounded-md font-bold text-[10px] border border-[var(--warning-text)]/20 inline-block shadow-sm">⏳ متبقي {emp.daysLeft} يوم</span>
                            )}
                          </td>
                          <td className="text-center">
                            <button onClick={() => { setShowAgeModal(false); handleRowClick(emp.employee_code); }} className="bg-gold text-white border border-transparent px-4 py-2 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-gold-hover transition-colors shadow-sm">تحويل لعقد محدد ✏️</button>
                          </td>
                        </tr>
                      ))}
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
