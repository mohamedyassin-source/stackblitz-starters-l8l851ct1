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

  const [activeTab, setActiveTab] = useState<'monthly_expiry' | 'above_age' | 'approval_status' | 'full_roster'>('monthly_expiry');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedContractType, setSelectedType] = useState('');

  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

  const getField = (obj: any, ...keys: string[]) => {
    if (!obj) return '';
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return '';
  };

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const getEmployeeAge = (emp: any) => {
    const rawAge = getField(emp, 'age', 'Age');
    if (rawAge !== '' && rawAge !== null && !isNaN(Number(rawAge))) {
      return Number(rawAge);
    }
    return null;
  };

  // 🎯 استخراج تاريخ ودقة بلوغ سن الـ 60 من الرقم القومي
  const getAge60Date = (nationalId: string) => {
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
    return age60Date;
  };

  const companiesList = useMemo(() => Array.from(new Set(employees.map(e => getField(e, 'company', 'Company')).filter(Boolean))), [employees]);
  const deptsList = useMemo(() => Array.from(new Set(employees.map(e => getField(e, 'department', 'Department')).filter(Boolean))), [employees]);
  const contractTypesList = useMemo(() => Array.from(new Set(employees.map(e => getField(e, 'contract_type', 'ContractType')).filter(Boolean))), [employees]);

  const processedData = useMemo(() => {
    const activeEmps = employees.filter(e => (getField(e, 'status', 'Status') || 'Active') === 'Active');

    return activeEmps.map(emp => {
      const code = getField(emp, 'employee_code', 'EmployeeCode');
      const endDate = getField(emp, 'contract_end_date', 'ContractEndDate');
      const natId = getField(emp, 'national_id', 'NationalID');
      const daysLeft = getDaysRemaining(endDate);
      const age = getEmployeeAge(emp);
      const age60DateObj = getAge60Date(natId);

      const empRens = renewals.filter(r => r.employee_code === code).sort((a, b) => (b.request_id || '').localeCompare(a.request_id || ''));
      const latestRenewal = empRens[0];

      return {
        ...emp,
        code,
        name: getField(emp, 'employee_name', 'ArabicName'),
        jobTitle: getField(emp, 'job_title', 'JobTitle'),
        department: getField(emp, 'department', 'Department'),
        company: getField(emp, 'company', 'Company'),
        contractType: getField(emp, 'contract_type', 'ContractType'),
        endDate,
        daysLeft,
        age,
        natId,
        age60DateObj,
        renewalStatus: latestRenewal?.status || 'لا يوجد طلب',
        signatureStatus: latestRenewal?.signature_status || '—',
        requestId: latestRenewal?.request_id || '—',
        newEndDate: latestRenewal?.new_contract_end_date || '—',
      };
    });
  }, [employees, renewals]);

  // 🌟 الفلترة المركبة الذكية
  const filteredReportData = useMemo(() => {
    return processedData.filter(item => {
      // 1. تصفية التبويب "تقرير الاستحقاق الشهري" المركب
      if (activeTab === 'monthly_expiry') {
        let isContractExpiringInMonth = false;
        let isTurning60InMonth = false;

        // أ) مراجعة تاريخ انتهاء العقد (للعقود محددة المدة)
        if (item.contractType !== 'دائم' && item.endDate) {
          const d = new Date(item.endDate);
          if (!isNaN(d.getTime())) {
            const m = String(d.getMonth() + 1);
            const y = String(d.getFullYear());
            const matchM = !selectedMonth || m === selectedMonth;
            const matchY = !selectedYear || y === selectedYear;
            if (matchM && matchY) isContractExpiringInMonth = true;
          }
        }

        // ب) مراجعة بلوغ سن الـ 60 (لأصحاب العقود الدائمة فقط ومش محولين فوق السن)
        if (item.contractType === 'دائم' && !String(item.contractType).includes('فوق السن') && item.age60DateObj) {
          const m = String(item.age60DateObj.getMonth() + 1);
          const y = String(item.age60DateObj.getFullYear());
          const matchM = !selectedMonth || m === selectedMonth;
          const matchY = !selectedYear || y === selectedYear;
          if (matchM && matchY) isTurning60InMonth = true;
        }

        // لو مش انتهاء عقد ولا بلوغ 60 في الشهر المختار، يستبعد
        if (!isContractExpiringInMonth && !isTurning60InMonth) return false;

        // حفظ نوع الإجراء المطلوب لتوضيحه في التقرير
        (item as any).actionReason = isTurning60InMonth ? '🎂 بلوغ سن الـ 60 (عقد دائم)' : '📑 انتهاء عقد محدد المدة';
      } else if (activeTab === 'above_age') {
        const isAbove60 = item.age !== null && item.age >= 60;
        const isAboveAgeType = String(item.contractType).includes('فوق السن');
        if (!isAbove60 && !isAboveAgeType) return false;
      } else if (activeTab === 'approval_status') {
        if (item.renewalStatus === 'لا يوجد طلب') return false;
      }

      // 2. الفلاتر النصية والقوائم
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || item.code.toLowerCase().includes(term) || item.name.toLowerCase().includes(term);
      const matchesComp = !selectedCompany || item.company === selectedCompany;
      const matchesDept = !selectedDept || item.department === selectedDept;
      const matchesType = !selectedContractType || item.contractType === selectedContractType;

      return matchesSearch && matchesComp && matchesDept && matchesType;
    });
  }, [processedData, activeTab, selectedMonth, selectedYear, searchTerm, selectedCompany, selectedDept, selectedContractType]);

  const reportStats = useMemo(() => {
    const total = filteredReportData.length;
    const turning60Count = filteredReportData.filter(i => (i as any).actionReason?.includes('60')).length;
    const contractExpCount = total - turning60Count;
    const signedCount = filteredReportData.filter(i => i.signatureStatus === 'تم التوقيع').length;

    return { total, turning60Count, contractExpCount, signedCount };
  }, [filteredReportData]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = async () => {
    if (filteredReportData.length === 0) {
      return alert('لا توجد بيانات للتصدير حسب الفلاتر المحددة.');
    }

    const fileName = `تقرير_استحقاقات_${activeTab}_شهر_${selectedMonth || 'الكل'}.xlsx`;

    const rows = filteredReportData.map(item => ({
      'كود الموظف': item.code,
      'اسم الموظف': item.name,
      'الإدارة': item.department || '—',
      'الوظيفة': item.jobTitle || '—',
      'السن': item.age ? `${item.age} سنة` : '—',
      'نوع العقد الحالي': item.contractType || '—',
      'سبب الإدراج بالتقرير': (item as any).actionReason || 'استحقاق دوري',
      'تاريخ نهاية العقد': item.endDate || '—',
      'تاريخ بلوغ 60': item.age60DateObj ? item.age60DateObj.toISOString().split('T')[0] : '—',
      'حالة التجديد': item.renewalStatus,
    }));

    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 22 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'استحقاقات_الشهر');
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div style={{ direction: 'rtl', paddingBottom: '40px' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; direction: rtl; }
          .no-print { display: none !important; }
          .data-table th, .data-table td { border: 1px solid #cbd5e1 !important; padding: 6px !important; }
        }
      `}</style>

      {/* رأس الصفحة وأزرار الإجراءات */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950, #0f172a)', fontWeight: '800' }}>مركز التقارير والتحليلات الرقمية</h3>
          <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>استخراج وحصر الاستحقاقات التعاقدية وحركات بلوغ الـ 60 المجمعة</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleExportExcel} style={{ background: '#059669', color: '#fff', border: 0, padding: '9px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📥 تصدير Excel (XLSX)
          </button>
          <button onClick={handlePrint} style={{ background: 'var(--navy-950, #0f172a)', color: '#fff', border: 0, padding: '9px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🖨️ طباعة التقرير / PDF
          </button>
        </div>
      </div>

      {/* 🌟 تبويبات أنواع التقارير */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {[
          { id: 'monthly_expiry', icon: '🎯', title: 'تقرير استحقاقات الشهر المركب', desc: 'انتهاء عقود + بلوغ الـ 60 (للعقود الدائمة)' },
          { id: 'above_age', icon: '💼', title: 'تقرير العمالة فوق السن (60+)', desc: 'متابعة المحالين للتقاعد وتجديدات فوق السن' },
          { id: 'approval_status', icon: '⏳', title: 'موقف التجديدات والتوقيع', desc: 'متابعة الطلبات المعتمدة وقيد الاعتماد والتوقيع' },
          { id: 'full_roster', icon: '📂', title: 'السجل العام الشامل', desc: 'كشف موحد لجميع الموظفين النشطين' },
        ].map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              background: activeTab === tab.id ? '#f0fdf4' : 'var(--paper-card, #fff)',
              border: activeTab === tab.id ? '2px solid #0d9488' : '1px solid var(--line, #e2e8f0)',
              borderRadius: '12px',
              padding: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '16px' }}>{tab.icon}</span>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: activeTab === tab.id ? '#0d9488' : 'var(--navy-950, #0f172a)' }}>{tab.title}</span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--muted, #64748b)', fontWeight: '500' }}>{tab.desc}</div>
          </div>
        ))}
      </div>

      {/* شريط الفلاتر الذكي */}
      <div className="no-print" style={{ background: 'var(--paper-card, #fff)', border: '1px solid var(--line, #e2e8f0)', padding: '14px', borderRadius: '12px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        
        {activeTab === 'monthly_expiry' && (
          <div style={{ display: 'flex', gap: '6px', background: '#eff6ff', padding: '5px 10px', borderRadius: '8px', border: '1px solid #bfdbfe', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#1e40af' }}>🗓️ شهر الاستحقاق المطلوب:</span>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '11px', fontWeight: 'bold', outline: 'none' }}>
              <option value="">كل الأشهر</option>
              {MONTHS_LIST.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '11px', fontWeight: 'bold', outline: 'none' }}>
              <option value="">كل السنوات</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
            </select>
          </div>
        )}

        <input
          type="text"
          placeholder="بحث بالاسم أو الكود..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none', width: '180px' }}
        />

        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none' }}>
          <option value="">🏢 كل الشركات</option>
          {companiesList.map((c: any, i) => <option key={i} value={c}>{c}</option>)}
        </select>

        <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none' }}>
          <option value="">💼 كل الإدارات</option>
          {deptsList.map((d: any, i) => <option key={i} value={d}>{d}</option>)}
        </select>

        <select value={selectedContractType} onChange={e => setSelectedType(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none' }}>
          <option value="">📄 أنواع العقود</option>
          {contractTypesList.map((t: any, i) => <option key={i} value={t}>{t}</option>)}
        </select>

        <button
          onClick={() => {
            setSearchTerm('');
            setSelectedCompany('');
            setSelectedDept('');
            setSelectedType('');
            setSelectedMonth(String(new Date().getMonth() + 1));
            setSelectedYear(new Date().getFullYear().toString());
          }}
          style={{ background: '#f1f5f9', border: '1px solid var(--line, #e2e8f0)', padding: '8px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          إعادة ضبط
        </button>
      </div>

      {/* كروت المؤشرات المحدثة */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--paper-card, #fff)', border: '1px solid var(--line, #e2e8f0)', padding: '12px 16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '10.5px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>إجمالي الاستحقاقات المطلوب إجراءها</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--navy-950, #0f172a)', marginTop: '2px' }}>{reportStats.total.toLocaleString('en-US')}</div>
        </div>

        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '12px 16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '10.5px', color: '#92400e', fontWeight: 'bold' }}>🎂 بلوغ الـ 60 (تحويل لعقد فوق السن)</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#d97706', marginTop: '2px' }}>{reportStats.turning60Count.toLocaleString('en-US')} موظف</div>
        </div>

        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px 16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '10.5px', color: '#1e40af', fontWeight: 'bold' }}>📑 عقود محددة انتهى أجلها</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#2563eb', marginTop: '2px' }}>{reportStats.contractExpCount.toLocaleString('en-US')} عقد</div>
        </div>

        <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '10.5px', color: '#166534', fontWeight: 'bold' }}>عقود مكتملة وموقعة</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#15803d', marginTop: '2px' }}>{reportStats.signedCount.toLocaleString('en-US')}</div>
        </div>
      </div>

      {/* 🖨️ منطقة التقرير والمعاينة القابلة للطباعة */}
      <div className="print-area" style={{ background: 'var(--paper-card, #fff)', border: '1px solid var(--line, #e2e8f0)', borderRadius: '12px', padding: '24px' }}>
        
        <div style={{ borderBottom: '2px solid var(--navy-950, #0f172a)', paddingBottom: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950, #0f172a)', fontWeight: '900' }}>مجموعة شركات المراسم الدولية</h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>
              {activeTab === 'monthly_expiry' && `كشف استحقاقات العمل لشهر (${MONTHS_LIST.find(m => m.value === selectedMonth)?.label || 'الكل'}) لسنة ${selectedYear || 'الكل'} (عقود تنتهي + بلوغ الـ 60)`}
              {activeTab === 'above_age' && 'كشف حصر الموظفين البالغين لسن التقاعد (60 سنة فأكثر)'}
              {activeTab === 'approval_status' && 'تقرير متابعة موقف اعتمادات وتوقيعات العقود'}
              {activeTab === 'full_roster' && 'السجل الموحد العام لكافة قوة العمل النشطة'}
            </p>
          </div>

          <div style={{ textAlign: 'left', fontSize: '11px', color: 'var(--muted, #64748b)', fontFamily: 'monospace' }}>
            <div>تاريخ التقرير: <strong>{new Date().toLocaleDateString('ar-EG')}</strong></div>
            <div>عدد السجلات: <strong>{filteredReportData.length}</strong></div>
          </div>
        </div>

        <div className="table-responsive" style={{ border: 0 }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: 'var(--muted, #64748b)' }}>جاري استخراج وبناء التقرير... ⏳</div>
          ) : (
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '10px' }}>#</th>
                  <th style={{ padding: '10px' }}>الكود</th>
                  <th style={{ padding: '10px' }}>اسم الموظف</th>
                  <th style={{ padding: '10px' }}>الإدارة</th>
                  <th style={{ padding: '10px' }}>الوظيفة</th>
                  <th style={{ padding: '10px' }}>السن</th>
                  <th style={{ padding: '10px' }}>نوع العقد الحالي</th>
                  <th style={{ padding: '10px' }}>السبب / الإجراء المطلوب</th>
                  <th style={{ padding: '10px' }}>تاريخ الاستحقاق</th>
                  <th style={{ padding: '10px' }}>حالة التجديد</th>
                </tr>
              </thead>
              <tbody>
                {filteredReportData.length === 0 ? (
                  <tr><td colSpan={10} style={{ padding: '30px', textAlign: 'center', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>لا توجد استحقاقات تعاقدية أو حركات بلوغ 60 في هذا الشهر. 🎉</td></tr>
                ) : (
                  filteredReportData.map((item, idx) => {
                    const is60Event = (item as any).actionReason?.includes('60');

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: is60Event ? '#fffbeb' : 'transparent' }}>
                        <td style={{ padding: '8px 10px', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#0d9488' }}>{item.code}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#0f172a' }}>{item.name}</td>
                        <td style={{ padding: '8px 10px', color: '#64748b' }}>{item.department || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#64748b' }}>{item.jobTitle || '—'}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold', color: item.age && item.age >= 60 ? '#d97706' : '#334155' }}>
                          {item.age ? `${item.age} سنة` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{item.contractType || '—'}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold', color: is60Event ? '#d97706' : '#2563eb' }}>
                          {(item as any).actionReason || 'انتهاء عقد'}
                        </td>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 'bold' }}>
                          {is60Event && item.age60DateObj ? item.age60DateObj.toISOString().split('T')[0] : (item.endDate || '—')}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{item.renewalStatus}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', padding: '0 20px', fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>
          <div>مُعد التقرير: ........................</div>
          <div>مراجعة الموارد البشرية: ........................</div>
          <div>اعتماد إدارة الشركة: ........................</div>
        </div>

      </div>
    </div>
  );
}
