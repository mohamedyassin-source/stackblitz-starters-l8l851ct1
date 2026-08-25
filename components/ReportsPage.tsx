'use client';
import { useState, useMemo } from 'react';
import { useAppData } from '@/lib/DataContext';

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

export default function ReportsPage() {
  const { employees, renewals, loading } = useAppData();

  // أنواع التقارير الجاهزة
  const [reportType, setReportType] = useState<'all' | 'expiring' | 'approved_signed' | 'pending_action' | 'by_month'>('by_month');

  // الفلاتر التفصيلية
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedContractType, setSelectedType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 🌟 فلتر الشهر والسنة المخصص للتصدير والفلترة (افتراضيًا: الشهر الحالي، وليس شهرًا ثابتًا)
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const monthsList = MONTHS_LIST;

  const companiesList = Array.from(new Set(employees.map(e => e.company).filter(Boolean)));
  const deptsList = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));
  const contractTypesList = Array.from(new Set(employees.map(e => e.contract_type).filter(Boolean)));

  // دمج وبيانات التقرير المفلترة
  const reportData = useMemo(() => {
    return employees.map(emp => {
      const days = getDaysRemaining(emp.contract_end_date);
      const empRens = renewals.filter(r => r.employee_code === emp.employee_code).sort((a, b) => (b.request_id || '').localeCompare(a.request_id || ''));
      const latestRenewal = empRens[0];

      return {
        ...emp,
        daysRemaining: days,
        renewalStatus: latestRenewal?.status || 'لا يوجد طلب',
        signatureStatus: latestRenewal?.signature_status || '—',
        requestId: latestRenewal?.request_id || '—',
        renewalMonths: latestRenewal?.renewal_months || '—'
      };
    }).filter(item => {
      // 1. التصفية حسب نوع التقرير المختار
      if (reportType === 'expiring' && (item.daysRemaining === null || item.daysRemaining > 90)) return false;
      if (reportType === 'approved_signed' && item.signatureStatus !== 'تم التوقيع') return false;
      if (reportType === 'pending_action' && item.renewalStatus !== 'Pending' && item.signatureStatus !== 'في انتظار توقيع الموظف') return false;

      // 🌟 تصفية محددة بشهر الانتهاء
      if (reportType === 'by_month' || selectedMonth !== '') {
        if (selectedMonth && item.contract_end_date) {
          const contractDate = new Date(item.contract_end_date);
          if (!isNaN(contractDate.getTime())) {
            const expMonth = (contractDate.getMonth() + 1).toString();
            if (expMonth !== selectedMonth) return false;

            if (selectedYear) {
              const expYear = contractDate.getFullYear().toString();
              if (expYear !== selectedYear) return false;
            }
          } else {
            return false;
          }
        } else if (selectedMonth && !item.contract_end_date) {
          return false;
        }
      }

      // 2. الفلاتر النصية والزمنية الأخرى
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term || String(item.employee_code).toLowerCase().includes(term) || String(item.employee_name).toLowerCase().includes(term);
      const matchesComp = !selectedCompany || item.company === selectedCompany;
      const matchesDept = !selectedDept || item.department === selectedDept;
      const matchesType = !selectedContractType || item.contract_type === selectedContractType;

      let matchesDateRange = true;
      if (startDate && item.contract_end_date) {
        matchesDateRange = matchesDateRange && new Date(item.contract_end_date) >= new Date(startDate);
      }
      if (endDate && item.contract_end_date) {
        matchesDateRange = matchesDateRange && new Date(item.contract_end_date) <= new Date(endDate);
      }

      return matchesSearch && matchesComp && matchesDept && matchesType && matchesDateRange;
    });
  }, [employees, renewals, reportType, selectedMonth, selectedYear, searchTerm, selectedCompany, selectedDept, selectedContractType, startDate, endDate]);

  const stats = useMemo(() => {
    const total = reportData.length;
    const expired = reportData.filter(i => i.daysRemaining !== null && i.daysRemaining < 0).length;
    const signed = reportData.filter(i => i.signatureStatus === 'تم التوقيع').length;
    const pending = reportData.filter(i => i.renewalStatus === 'Pending').length;
    return { total, expired, signed, pending };
  }, [reportData]);

  // 🌟 توزيع نتائج التقرير الحالي على أشهر السنة (لعرض سريع لتمركز انتهاءات العقود)
  const monthlyDistribution = useMemo(() => {
    const counts = new Array(12).fill(0);
    reportData.forEach(item => {
      if (!item.contract_end_date) return;
      const d = new Date(item.contract_end_date);
      if (isNaN(d.getTime())) return;
      counts[d.getMonth()] += 1;
    });
    const max = Math.max(...counts, 1);
    return monthsList.map((m, i) => ({ label: m.label.split(' ')[0], count: counts[i], pct: (counts[i] / max) * 100 }));
  }, [reportData, monthsList]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = async () => {
    if (reportData.length === 0) return alert('لا توجد بيانات للتصدير بحسب الفلاتر المحددة.');

    const fileName = selectedMonth
      ? `تقرير_عقود_شهر_${selectedMonth}_${selectedYear || 'كل_السنوات'}.xlsx`
      : `تقرير_العقود_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const rows = reportData.map(item => ({
      'كود الموظف': item.employee_code || '',
      'اسم الموظف': item.employee_name || '',
      'الشركة': item.company || '',
      'الإدارة': item.department || '',
      'الوظيفة': item.job_title || '',
      'نوع العقد': item.contract_type || '',
      'تاريخ الانتهاء': item.contract_end_date || '',
      'الأيام المتبقية': item.daysRemaining !== null ? item.daysRemaining : '',
      'حالة الطلب': item.renewalStatus,
      'حالة التوقيع': item.signatureStatus,
    }));

    // التحميل الديناميكي لمكتبة xlsx يبقيها خارج الحزمة الأساسية للتطبيق
    // (لا يحتاجها إلا مستخدم صفحة التقارير عند الضغط على زر التصدير)
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'التقرير');
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; direction: rtl; }
          .no-print { display: none !important; }
          .data-table th, .data-table td { border: 1px solid #cbd5e1 !important; padding: 6px !important; }
        }
      `}</style>

      {/* العنوان وأزرار التصدير */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--navy-950)' }}>التقارير والإحصائيات التفصيلية</h3>
          <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--muted)' }}>مركز استخراج بيانات العقود المخصصة وتصديرها للإكسيل</p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleExportExcel} style={{ background: '#15803d', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📥 تصدير Excel (XLSX)
          </button>
          <button onClick={handlePrint} style={{ background: 'var(--navy-950)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🖨️ طباعة التقرير / PDF
          </button>
        </div>
      </div>

      {/* 🌟 مطبعة التقارير المسبقة */}
      <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {[
          { id: 'by_month', title: '📅 تقرير عقود شهر محدد (التنفيذ الشهري)', desc: 'تخصيص شهر وشهر لعرض وتصدير عقوده' },
          { id: 'expiring', title: '🚨 العقود المنتهية والقريبة من الانتهاء (90 يوم)', desc: 'تركيز على العقود الحرجة' },
          { id: 'pending_action', title: '⏳ العقود المعلقة وقيد التجديد', desc: 'طلبات تنتظر الاعتماد أو التوقيع' },
          { id: 'approved_signed', title: '✅ العقود المكتملة والموقع عليها', desc: 'سجل العقود المجددة بنجاح' },
          { id: 'all', title: '📂 السجل الشامل لجميع الموظفين والعقود', desc: 'كشف عام لكافة القوة العمالية' },
        ].map(preset => (
          <button
            key={preset.id}
            onClick={() => {
              setReportType(preset.id as any);
              if (preset.id !== 'by_month') {
                setSelectedMonth('');
              } else {
                setSelectedMonth(String(new Date().getMonth() + 1));
              }
            }}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '8px',
              textAlign: 'right',
              border: reportType === preset.id ? '2px solid var(--brass-600)' : '1px solid var(--line)',
              background: reportType === preset.id ? '#fefce8' : '#fff',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: reportType === preset.id ? 'var(--brass-600)' : 'var(--navy-950)' }}>{preset.title}</div>
            <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '2px' }}>{preset.desc}</div>
          </button>
        ))}
      </div>

      {/* 🌟 شريط الفلاتر المتقدم مع محدد الشهر والسنة */}
      <div className="no-print" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '12px', borderRadius: '8px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        
        {/* 🌟 فلتر اختيار الشهر والسنة المميز */}
        <div style={{ display: 'flex', gap: '6px', background: '#eff6ff', padding: '4px 8px', borderRadius: '6px', border: '1px solid #bfdbfe', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#1e40af' }}>🗓️ شهر الانتهاء:</span>
          <select value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); setReportType('by_month'); }} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #93c5fd', fontSize: '10px', fontWeight: 'bold', outline: 'none', background: 'var(--paper-card)' }}>
            <option value="">كل الأشهر</option>
            {monthsList.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>

          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #93c5fd', fontSize: '10px', fontWeight: 'bold', outline: 'none', background: 'var(--paper-card)' }}>
            <option value="">كل السنوات</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
            <option value="2028">2028</option>
          </select>
        </div>

        <input type="text" placeholder="بحث بالاسم أو الكود..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none', width: '160px' }} />

        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none' }}>
          <option value="">🏢 كل الشركات</option>
          {companiesList.map((c: any, i) => <option key={i} value={c}>{c}</option>)}
        </select>

        <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none' }}>
          <option value="">💼 كل الإدارات</option>
          {deptsList.map((d: any, i) => <option key={i} value={d}>{d}</option>)}
        </select>

        <select value={selectedContractType} onChange={e => setSelectedType(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none' }}>
          <option value="">📄 أنواع العقود</option>
          {contractTypesList.map((t: any, i) => <option key={i} value={t}>{t}</option>)}
        </select>

        <button onClick={() => { setSearchTerm(''); setSelectedCompany(''); setSelectedDept(''); setSelectedType(''); setStartDate(''); setEndDate(''); setSelectedMonth(''); setSelectedYear(''); setReportType('all'); }} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>
      </div>

      {/* ملخص النتائج */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: '8px' }}>
          <div style={{ fontSize: '9.5px', color: 'var(--muted)', fontWeight: 'bold' }}>إجمالي عقود هذا التقرير</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy-950)' }}>{stats.total.toLocaleString('en-US')} سجل</div>
        </div>
        <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: '8px' }}>
          <div style={{ fontSize: '9.5px', color: 'var(--muted)', fontWeight: 'bold' }}>عقود منتهية بالكامل</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#dc2626' }}>{stats.expired.toLocaleString('en-US')} عقد</div>
        </div>
        <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: '8px' }}>
          <div style={{ fontSize: '9.5px', color: 'var(--muted)', fontWeight: 'bold' }}>طلبات تجديد قيد المعالجة</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2563eb' }}>{stats.pending.toLocaleString('en-US')} طلب</div>
        </div>
        <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: '8px' }}>
          <div style={{ fontSize: '9.5px', color: 'var(--muted)', fontWeight: 'bold' }}>عقود متممة وموقعة</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#15803d' }}>{stats.signed.toLocaleString('en-US')} عقد</div>
        </div>
      </div>

      {/* 🌟 توزيع انتهاءات عقود التقرير الحالي على أشهر السنة */}
      {stats.total > 0 && (
        <div className="no-print" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 14px', fontSize: '12.5px', fontWeight: 'bold', color: 'var(--navy-950)' }}>📊 توزيع انتهاءات عقود هذا التقرير على أشهر السنة</h4>
          <div style={{ display: 'flex', alignItems: 'end', gap: '6px', height: '110px' }}>
            {monthlyDistribution.map((m, idx) => (
              <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <span style={{ fontSize: '9px', fontWeight: 'bold', color: m.count > 0 ? 'var(--brass-600)' : 'transparent', marginBottom: '3px' }}>{m.count}</span>
                <div
                  style={{
                    width: '100%',
                    maxWidth: '22px',
                    height: `${Math.max(m.pct, m.count > 0 ? 4 : 0)}%`,
                    borderRadius: '4px 4px 0 0',
                    background: m.count > 0 ? 'linear-gradient(180deg, var(--brass-400), var(--brass-600))' : 'var(--line)',
                    transition: 'height 0.5s',
                  }}
                />
                <span style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '4px', fontWeight: 'bold' }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* منطقة التقرير والمعاينة */}
      <div className="print-area" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px' }}>
        
        {/* الترويسة الرسمية */}
        <div style={{ borderBottom: '2px solid var(--navy-950)', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', color: 'var(--navy-950)' }}>مجموعة شركات المراسم الدولية</h2>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>
              {selectedMonth ? `تقرير الموظفين المنتهي عقودهم خلال شهر: (${monthsList.find(m => m.value === selectedMonth)?.label}) لسنة ${selectedYear || 'جميع السنوات'}` : 'تقرير المتابعة والتحليل الشامل لبيانات العقود'}
            </p>
          </div>
          <div style={{ textAlign: 'left', fontSize: '10px', color: 'var(--muted)' }}>
            <div>تاريخ الاستخراج: <strong>{new Date().toLocaleDateString('ar-EG')}</strong></div>
            <div>إجمالي السجلات: <strong>{reportData.length}</strong></div>
          </div>
        </div>

        {/* الجدول الرئيسي */}
        <div className="table-responsive" style={{ border: 0 }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)' }}>جاري معالجة واستخراج بيانات التقرير...</div>
          ) : (
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '10px', whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>#</th>
                  <th style={{ padding: '8px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>الكود</th>
                  <th style={{ padding: '8px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>الموظف</th>
                  <th style={{ padding: '8px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>الشركة</th>
                  <th style={{ padding: '8px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>الإدارة</th>
                  <th style={{ padding: '8px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>الوظيفة</th>
                  <th style={{ padding: '8px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>نوع العقد</th>
                  <th style={{ padding: '8px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>تاريخ الانتهاء</th>
                  <th style={{ padding: '8px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>المتبقي</th>
                  <th style={{ padding: '8px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>حالة التجديد</th>
                  <th style={{ padding: '8px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>موقف التوقيع</th>
                </tr>
              </thead>
              <tbody>
                {reportData.length === 0 ? (
                  <tr><td colSpan={11} style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>لا توجد عقود ينتهي أجلها في هذا الشهر/السنة المحددة.</td></tr>
                ) : (
                  reportData.map((item, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{index + 1}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--brass-600)' }}>{item.employee_code}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>{item.employee_name}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{item.company || '—'}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{item.department || '—'}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{item.job_title || '—'}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>{item.contract_type}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 'bold' }}>{item.contract_end_date || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        {item.daysRemaining !== null ? (
                          <span style={{ fontWeight: 'bold', color: item.daysRemaining < 0 ? '#dc2626' : item.daysRemaining <= 60 ? '#c2410c' : '#15803d' }}>
                            {item.daysRemaining < 0 ? `منتهي (${Math.abs(item.daysRemaining)})` : `${item.daysRemaining} يوم`}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>{item.renewalStatus}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 'bold', color: item.signatureStatus === 'تم التوقيع' ? '#15803d' : 'var(--muted)' }}>
                        {item.signatureStatus}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* التوقيعات الرسمية */}
        <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between', padding: '0 20px', fontSize: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>
          <div>مُعد التقرير: ........................</div>
          <div>مراجعة الموارد البشرية: ........................</div>
          <div>اعتماد الإدارة العليا: ........................</div>
        </div>

      </div>
    </div>
  );
}
