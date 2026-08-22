'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import KpiCard from './KpiCard';
import Stamp from './Stamp';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);

  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [allRenewals, setAllRenewals] = useState<any[]>([]);

  const [filterCompany, setFilterCompany] = useState('');
  const [filterDept, setFilterDept] = useState('');

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    fetchAllData();
    return () => clearInterval(timer);
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    let emps: any[] = [];
    let rens: any[] = [];
    let from = 0;
    const step = 1000;

    while (true) {
      const { data, error } = await supabase.from('employees').select('*').range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      emps = [...emps, ...data];
      if (data.length < step) break;
      from += step;
    }

    from = 0;
    while (true) {
      const { data, error } = await supabase.from('renewal_requests').select('*').range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      rens = [...rens, ...data];
      if (data.length < step) break;
      from += step;
    }

    setAllEmployees(emps);
    setAllRenewals(rens);
    setLoading(false);
  };

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const companiesList = Array.from(new Set(allEmployees.map(e => e.company).filter(Boolean)));
  const deptsList = Array.from(new Set(allEmployees.map(e => e.department).filter(Boolean)));

  const dashboardData = useMemo(() => {
    const filteredEmps = allEmployees.filter(emp => {
      const matchesComp = !filterCompany || emp.company === filterCompany;
      const matchesDept = !filterDept || emp.department === filterDept;
      return matchesComp && matchesDept;
    });

    const filteredRens = allRenewals.filter(req => {
      const matchesComp = !filterCompany || req.company === filterCompany;
      const matchesDept = !filterDept || req.department === filterDept;
      return matchesComp && matchesDept;
    });

    let expired = 0, expiring = 0, perm = 0, fixed = 0, aboveAge = 0;
    const deptsCount: Record<string, number> = {};
    const alerts: any[] = [];

    filteredEmps.forEach(emp => {
      const type = emp.contract_type || '';
      if (type === 'دائم') perm++;
      else if (type.includes('فوق السن')) aboveAge++;
      else fixed++;

      const dept = emp.department || 'غير محدد';
      deptsCount[dept] = (deptsCount[dept] || 0) + 1;

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
    });

    alerts.sort((a, b) => a.days - b.days);
    const urgentAlerts = alerts.slice(0, 20);

    const topDepts = Object.entries(deptsCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const monthsNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const renewalsByMonth = monthsNames.map(name => ({ name, count: 0 }));

    filteredRens.forEach(req => {
      if (req.status === 'Approved' && req.request_date) {
        const date = new Date(req.request_date);
        if (!isNaN(date.getTime())) {
          renewalsByMonth[date.getMonth()].count++;
        }
      }
    });

    return {
      totalEmps: filteredEmps.length,
      permCount: perm,
      fixedCount: fixed,
      aboveAgeCount: aboveAge,
      expiredCount: expired,
      expiringSoonCount: expiring,
      pendingRenewals: filteredRens.filter(r => r.status === 'Pending').length,
      topDepts,
      urgentAlerts,
      renewalsByMonth
    };
  }, [allEmployees, allRenewals, filterCompany, filterDept]);

  const handleRowClick = (empCode: string) => {
    localStorage.setItem('jumpSearch', empCode);
    const navButtons = document.querySelectorAll('.nav-item');
    navButtons.forEach(btn => {
      if (btn.textContent?.includes('العقود الحالية')) {
        (btn as HTMLButtonElement).click();
      }
    });
  };

  const dateFormatted = currentTime.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeFormatted = currentTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const maxMonthCount = Math.max(...(dashboardData?.renewalsByMonth.map(m => m.count) || []), 1);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24" style={{ color: 'var(--muted)' }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--line)', borderTopColor: 'var(--brass-500)' }} />
        <span className="text-sm font-bold">جاري تجميع البيانات الشاملة...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* رأس اللوحة: العنوان، التاريخ، الفلاتر */}
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
          <select className="field" value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
            <option value="">🏢 كل الشركات</option>
            {companiesList.map((c: any, i) => <option key={i} value={c}>{c}</option>)}
          </select>
          <select className="field" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
            <option value="">💼 كل الإدارات</option>
            {deptsList.map((d: any, i) => <option key={i} value={d}>{d}</option>)}
          </select>
          {(filterCompany || filterDept) && (
            <button
              className="field font-bold"
              style={{ background: 'var(--paper)', cursor: 'pointer' }}
              onClick={() => { setFilterCompany(''); setFilterDept(''); }}
            >
              إعادة ضبط
            </button>
          )}
        </div>
      </div>

      {/* بطاقات المؤشرات الرئيسية */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard tone="brass" title="إجمالي قوة العمل" value={dashboardData.totalEmps} sub="موظف" icon="👥" />
        <KpiCard tone="blue" title="طلبات تجديد معلقة" value={dashboardData.pendingRenewals} sub="طلب" icon="⏳" />
        <KpiCard tone="amber" title="عقود تنتهي قريباً (60 يوم)" value={dashboardData.expiringSoonCount} sub="عقد" icon="📆" />
        <KpiCard tone="red" title="عقود منتهية (تحتاج إجراء)" value={dashboardData.expiredCount} sub="عقد" icon="🚨" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">

        {/* الكثافة العمالية بأكبر 5 إدارات */}
        <div className="card px-5 sm:px-6 py-5">
          <h4 className="m-0 mb-5 text-[13.5px] font-extrabold" style={{ color: 'var(--navy-950)' }}>📊 الكثافة العمالية بأكبر 5 إدارات</h4>
          <div className="flex flex-col gap-4">
            {dashboardData.topDepts.map((dept, idx) => {
              const max = dashboardData.topDepts[0]?.count || 1;
              const percentage = (dept.count / max) * 100;
              return (
                <div key={idx}>
                  <div className="flex justify-between text-[11px] font-bold mb-1.5" style={{ color: 'var(--ink)' }}>
                    <span>{dept.name}</span>
                    <span>{dept.count} موظف</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--paper)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${percentage}%`, background: 'linear-gradient(90deg, var(--brass-400), var(--brass-600))' }}
                    />
                  </div>
                </div>
              );
            })}
            {dashboardData.topDepts.length === 0 && (
              <div className="text-[12px] text-center py-6" style={{ color: 'var(--muted)' }}>لا توجد بيانات كافية بعد</div>
            )}
          </div>
        </div>

        {/* معدل التجديدات المعتمدة هذا العام */}
        <div className="card px-5 sm:px-6 py-5 flex flex-col">
          <h4 className="m-0 mb-5 text-[13.5px] font-extrabold" style={{ color: 'var(--navy-950)' }}>📈 معدل التجديدات المعتمدة هذا العام</h4>
          <div className="flex-1 flex items-end gap-1.5 sm:gap-2 h-[150px] pb-4 border-b" style={{ borderColor: 'var(--line)' }}>
            {dashboardData.renewalsByMonth.map((month, idx) => {
              const height = maxMonthCount > 0 ? (month.count / maxMonthCount) * 100 : 0;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-[10px] font-bold mb-1" style={{ color: month.count > 0 ? 'var(--stamp-green)' : 'transparent' }}>{month.count}</span>
                  <div
                    className="w-full max-w-[24px] rounded-t-md transition-all duration-700"
                    style={{ height: `${height}%`, minHeight: month.count > 0 ? '4px' : '0', background: month.count > 0 ? 'linear-gradient(180deg, var(--brass-400), var(--brass-600))' : 'var(--paper)' }}
                  />
                  <span className="text-[9px] font-bold mt-2" style={{ color: 'var(--muted)' }}>{month.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">

        {/* توزيع هيكل العقود */}
        <div className="card px-5 sm:px-6 py-5">
          <h4 className="m-0 mb-5 text-[13.5px] font-extrabold" style={{ color: 'var(--navy-950)' }}>📑 توزيع هيكل العقود</h4>
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'var(--stamp-green)', boxShadow: '0 0 10px rgba(31,92,58,0.35)' }} />
              <div className="flex-1 text-[12px] font-bold" style={{ color: 'var(--muted)' }}>عقود دائمة</div>
              <div className="text-base font-mono font-extrabold" style={{ color: 'var(--ink)' }}>{dashboardData.permCount.toLocaleString()}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'var(--stamp-blue)', boxShadow: '0 0 10px rgba(31,63,102,0.35)' }} />
              <div className="flex-1 text-[12px] font-bold" style={{ color: 'var(--muted)' }}>محددة المدة</div>
              <div className="text-base font-mono font-extrabold" style={{ color: 'var(--ink)' }}>{dashboardData.fixedCount.toLocaleString()}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'var(--brass-500)', boxShadow: '0 0 10px rgba(184,147,74,0.35)' }} />
              <div className="flex-1 text-[12px] font-bold" style={{ color: 'var(--muted)' }}>تجديد فوق السن</div>
              <div className="text-base font-mono font-extrabold" style={{ color: 'var(--ink)' }}>{dashboardData.aboveAgeCount.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* جدول التنبيهات العاجلة */}
        <div className="card px-5 sm:px-6 py-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h4 className="m-0 text-[13.5px] font-extrabold flex items-center gap-2" style={{ color: 'var(--stamp-red)' }}>
              <span className="text-base">🚨</span> مهام عاجلة (اضغط على الموظف للتجديد)
            </h4>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--paper)', color: 'var(--muted)' }}>أخطر 20 عقد</span>
          </div>

          {dashboardData.urgentAlerts.length === 0 ? (
            <div className="stamp-green text-center py-8 rounded-xl text-[13px] font-bold" style={{ background: 'var(--stamp-green-bg)', color: 'var(--stamp-green)' }}>
              لا توجد مهام عاجلة! جميع العقود سارية وفي أمان. 🎉
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[280px]">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>الكود</th>
                    <th>الموظف</th>
                    <th>تاريخ الانتهاء</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.urgentAlerts.map(alert => (
                    <tr
                      key={alert.id}
                      onClick={() => handleRowClick(alert.employee_code)}
                      className="cursor-pointer"
                      title="اضغط للانتقال لصفحة العقود لإنشاء طلب تجديد"
                    >
                      <td className="font-mono font-bold" style={{ color: 'var(--brass-600)' }}>{alert.employee_code}</td>
                      <td className="font-bold">{alert.employee_name}</td>
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
    </div>
  );
}
