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

    return {
      birthDate: birthDate.toISOString().split('T')[0],
      age60Date: age60Date.toISOString().split('T')[0],
      daysUntil60,
    };
  };

  const companiesList = Array.from(new Set(allEmployees.map((e) => e.company).filter(Boolean)));
  const deptsList = Array.from(new Set(allEmployees.map((e) => e.department).filter(Boolean)));

  const dashboardData = useMemo(() => {
    const activeEmployeesOnly = allEmployees.filter(emp => {
      const status = emp.status || 'Active';
      const dept = emp.department || '';
      return status === 'Active' && dept !== 'تحويلات تحت الاعتماد';
    });

    // 🌟 تحديث اللوجيك ليدعم البحث الجزئي بالكلمة (Includes)
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

    let expired = 0, expiring = 0, perm = 0, fixed = 0, aboveAge = 0;
    const deptsCount: Record<string, number> = {};
    const alerts: any[] = [];
    const turning60List: any[] = [];

    filteredEmps.forEach((emp) => {
      const type = emp.contract_type || '';
      if (type === 'دائم') perm++;
      else if (type.includes('فوق السن')) aboveAge++;
      else fixed++;

      const dept = emp.department || 'غير محدد';
      deptsCount[dept] = (deptsCount[dept] || 0) + 1;

      if (type === 'دائم') {
        const ageInfo = getAge60Info(emp.national_id);
        if (ageInfo && ageInfo.daysUntil60 <= 60) {
          turning60List.push({
            ...emp,
            birthDate: ageInfo.birthDate,
            age60Date: ageInfo.age60Date,
            daysLeft: ageInfo.daysUntil60,
          });
        }
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
    });

    alerts.sort((a, b) => a.days - b.days);
    turning60List.sort((a, b) => a.daysLeft - b.daysLeft); 

    const urgentAlerts = alerts.slice(0, 20);
    const topDepts = Object.entries(deptsCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const monthsNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const renewalsByMonth = monthsNames.map((name) => ({ name, count: 0 }));

    filteredRens.forEach((req) => {
      const isApproved = req.status === 'Approved' || req.status === 'معتمد' || req.renewal_status === 'Approved' || req.renewal_status === 'معتمد';

      if (isApproved) {
        const endDateStr = req.new_contract_end_date || req.contract_end_date;

        if (endDateStr) {
          const endDate = new Date(endDateStr);
          if (!isNaN(endDate.getTime())) {
            const startDateAfterEnd = new Date(endDate);
            startDateAfterEnd.setDate(startDateAfterEnd.getDate() + 1);

            const monthIdx = startDateAfterEnd.getMonth();
            if (monthIdx >= 0 && monthIdx < 12) {
              renewalsByMonth[monthIdx].count++;
            }
          }
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
      pendingRenewals: filteredRens.filter(r => r.status === 'Pending' || r.status === 'قيد الانتظار' || r.status === 'قيد التوقيع').length,
      turning60List,
      topDepts,
      urgentAlerts,
      renewalsByMonth,
    };
  }, [allEmployees, allRenewals, filterCompany, filterDept]);

  const handleRowClick = (empCode: string) => navigateTo('contracts', { jumpSearch: empCode });

  const dateFormatted = currentTime.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeFormatted = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const maxMonthCount = Math.max(...(dashboardData?.renewalsByMonth.map((m) => m.count) || []), 1);

  return (
    <div className="flex flex-col gap-5" style={{ direction: 'rtl' }}>
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
          {/* 🌟 تحويل الشركة إلى مربع بحث ذكي */}
          <input 
            list="dashCompList"
            className="field" 
            placeholder="🏢 كل الشركات (ابحث...)"
            value={filterCompany} 
            onChange={(e) => setFilterCompany(e.target.value)} 
          />
          <datalist id="dashCompList">
            {companiesList.map((c: any, i) => <option key={i} value={c} />)}
          </datalist>

          {/* 🌟 تحويل الإدارة إلى مربع بحث ذكي */}
          <input 
            list="dashDeptList"
            className="field" 
            placeholder="💼 كل الإدارات (ابحث...)"
            value={filterDept} 
            onChange={(e) => setFilterDept(e.target.value)} 
          />
          <datalist id="dashDeptList">
            {deptsList.map((d: any, i) => <option key={i} value={d} />)}
          </datalist>

          {(filterCompany || filterDept) && (
            <button className="field font-bold" style={{ background: 'var(--paper)', cursor: 'pointer' }} onClick={() => { setFilterCompany(''); setFilterDept(''); }}>
              إعادة ضبط
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard loading={loading} tone="brass" title="إجمالي قوة العمل" value={dashboardData.totalEmps} sub="عرض السجل 👁️" icon="👥" onClick={() => navigateTo('employees')} />
        <KpiCard loading={loading} tone="blue" title="طلبات تجديد معلقة" value={dashboardData.pendingRenewals} sub="الذهاب للطلبات 👁️" icon="⏳" onClick={() => navigateTo('renewals')} />
        <KpiCard loading={loading} tone="amber" title="عقود تنتهي قريباً (60 يوم)" value={dashboardData.expiringSoonCount} sub="إدارة العقود 👁️" icon="📆" onClick={() => navigateTo('contracts')} />
        <KpiCard loading={loading} tone="red" title="عقود منتهية (تحتاج إجراء)" value={dashboardData.expiredCount} sub="إدارة العقود 🚨" icon="🚨" onClick={() => navigateTo('contracts')} />
        <KpiCard loading={loading} tone="amber" title="سن الـ 60 (يستلزم إجراء)" value={dashboardData.turning60List.length} sub="عرض القائمة 👁️" icon="🎂" onClick={() => setShowAgeModal(true)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
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
                    <span className="font-mono">{dept.count.toLocaleString('en-US')} موظف</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--paper)' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${percentage}%`, background: 'linear-gradient(90deg, var(--brass-400), var(--brass-600))' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card px-5 sm:px-6 py-5 flex flex-col">
          <h4 className="m-0 mb-5 text-[13.5px] font-extrabold" style={{ color: 'var(--navy-950)' }}>
            📈 التجديدات المعتمدة (بناءً على بداية العقد الجديد)
          </h4>
          <div className="flex-1 flex items-end gap-1.5 sm:gap-2 h-[150px] pb-4 border-b" style={{ borderColor: 'var(--line)' }}>
            {dashboardData.renewalsByMonth.map((month, idx) => {
              const height = maxMonthCount > 0 ? (month.count / maxMonthCount) * 100 : 0;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-[10px] font-mono font-bold mb-1" style={{ color: month.count > 0 ? 'var(--stamp-green)' : 'transparent' }}>
                    {month.count.toLocaleString('en-US')}
                  </span>
                  <div className="w-full max-w-[24px] rounded-t-md transition-all duration-700" style={{ height: `${height}%`, minHeight: month.count > 0 ? '4px' : '0', background: month.count > 0 ? 'linear-gradient(180deg, var(--brass-400), var(--brass-600))' : 'var(--paper)' }} />
                  <span className="text-[9px] font-bold mt-2" style={{ color: 'var(--muted)' }}>{month.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="card px-5 sm:px-6 py-5">
          <h4 className="m-0 mb-5 text-[13.5px] font-extrabold" style={{ color: 'var(--navy-950)' }}>📑 توزيع هيكل العقود</h4>
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'var(--stamp-green)', boxShadow: '0 0 10px rgba(31,92,58,0.35)' }} />
              <div className="flex-1 text-[12px] font-bold" style={{ color: 'var(--muted)' }}>عقود دائمة</div>
              <div className="text-base font-mono font-extrabold" style={{ color: 'var(--ink)' }}>{dashboardData.permCount.toLocaleString('en-US')}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'var(--stamp-blue)', boxShadow: '0 0 10px rgba(31,63,102,0.35)' }} />
              <div className="flex-1 text-[12px] font-bold" style={{ color: 'var(--muted)' }}>محدد المدة</div>
              <div className="text-base font-mono font-extrabold" style={{ color: 'var(--ink)' }}>{dashboardData.fixedCount.toLocaleString('en-US')}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'var(--brass-500)', boxShadow: '0 0 10px rgba(184,147,74,0.35)' }} />
              <div className="flex-1 text-[12px] font-bold" style={{ color: 'var(--muted)' }}>تجديد فوق السن</div>
              <div className="text-base font-mono font-extrabold" style={{ color: 'var(--ink)' }}>{dashboardData.aboveAgeCount.toLocaleString('en-US')}</div>
            </div>
          </div>
        </div>

        <div className="card px-5 sm:px-6 py-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h4 className="m-0 text-[13.5px] font-extrabold flex items-center gap-2" style={{ color: 'var(--stamp-red)' }}>
              <span className="text-base">🚨</span> مهام عاجلة (اضغط على الموظف للتجديد)
            </h4>
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--paper)', color: 'var(--muted)' }}>
              أخطر 20 عقد
            </span>
          </div>

          {dashboardData.urgentAlerts.length === 0 ? (
            <div className="stamp-green text-center py-8 rounded-xl text-[13px] font-bold" style={{ background: 'var(--stamp-green-bg)', color: 'var(--stamp-green)' }}>
              لا توجد مهام عاجلة! جميع العقود سارية وفي أمان. 🎉
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[280px]">
              <table className="data-table">
                <thead>
                  <tr><th>الكود</th><th>الموظف</th><th>تاريخ الانتهاء</th><th>الحالة</th></tr>
                </thead>
                <tbody>
                  {dashboardData.urgentAlerts.map((alert) => (
                    <tr key={alert.id} onClick={() => handleRowClick(alert.employee_code)} className="cursor-pointer" title="اضغط للانتقال لصفحة العقود لإنشاء طلب تجديد">
                      <td className="font-mono font-bold" style={{ color: 'var(--brass-600)' }}>{alert.employee_code}</td>
                      <td className="font-bold">{alert.employee_name}</td>
                      <td className="font-mono font-bold">{alert.contract_end_date}</td>
                      <td>
                        {alert.status === 'expired' ? (
                          <Stamp color="red">منتهي ({Math.abs(alert.days).toLocaleString('en-US')})</Stamp>
                        ) : (
                          <Stamp color="amber">متبقي {alert.days.toLocaleString('en-US')} يوم</Stamp>
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

      {showAgeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ width: '700px', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#856404', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🎂 موظفون عقودهم (دائمة) وبلغوا سن الـ 60 (يستلزم تسوية)
              </h3>
              <button onClick={() => setShowAgeModal(false)} style={{ background: '#f1f5f9', border: 0, color: '#475569', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                إغلاق ✕
              </button>
            </div>

            {dashboardData.turning60List.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontWeight: 'bold', fontSize: '13px' }}>
                لا يوجد موظفون (بعقود دائمة) يبلغون سن الـ 60 خلال الـ 60 يوماً القادمة. 🎉
              </div>
            ) : (
              <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                      <th style={{ padding: '10px', color: '#475569' }}>الكود</th>
                      <th style={{ padding: '10px', color: '#475569' }}>الموظف</th>
                      <th style={{ padding: '10px', color: '#475569' }}>الإدارة</th>
                      <th style={{ padding: '10px', color: '#475569' }}>تاريخ بلوغ الـ 60</th>
                      <th style={{ padding: '10px', color: '#475569', textAlign: 'center' }}>الحالة / المتبقي</th>
                      <th style={{ padding: '10px', color: '#475569', textAlign: 'center' }}>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.turning60List.map((emp) => (
                      <tr key={emp.employee_code} style={{ borderBottom: '1px solid #f1f5f9', background: emp.daysLeft < 0 ? '#fff5f5' : 'transparent' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0d9488', fontFamily: 'monospace' }}>{emp.employee_code}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.employee_name}</td>
                        <td style={{ padding: '10px', color: '#64748b' }}>{emp.department || '—'}</td>
                        <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold', color: emp.daysLeft < 0 ? '#dc2626' : 'inherit' }}>{emp.age60Date}</td>
                        
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {emp.daysLeft < 0 ? (
                            <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #fecaca' }}>
                              🚨 تجاوز بـ {Math.abs(emp.daysLeft).toLocaleString('en-US')} يوم
                            </span>
                          ) : (
                            <span style={{ background: '#fef3c7', color: '#d97706', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '10px' }}>
                              ⏳ متبقي {emp.daysLeft.toLocaleString('en-US')} يوم
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <button onClick={() => { setShowAgeModal(false); handleRowClick(emp.employee_code); }} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '5px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                            تعديل العقد ✏️
                          </button>
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
