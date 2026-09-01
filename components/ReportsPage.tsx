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

// 🌟 الدوال المساعدة خارج المكون لمنع مشاكل useMemo وتسريع الأداء
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

export default function ReportsPage() {
  const { employees, renewals, loading } = useAppData();

  const [activeTab, setActiveTab] = useState<'monthly_expiry' | 'above_age' | 'approval_status' | 'full_roster'>('monthly_expiry');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedContractType, setSelectedType] = useState('');

  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

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

  const filteredReportData = useMemo(() => {
    return processedData.filter(item => {
      if (activeTab === 'monthly_expiry') {
        let isContractExpiringInMonth = false;
        let isTurning60InMonth = false;

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

        if (item.contractType === 'دائم' && !String(item.contractType).includes('فوق السن') && item.age60DateObj) {
          const m = String(item.age60DateObj.getMonth() + 1);
          const y = String(item.age60DateObj.getFullYear());
          const matchM = !selectedMonth || m === selectedMonth;
          const matchY = !selectedYear || y === selectedYear;
          if (matchM && matchY) isTurning60InMonth = true;
        }

        if (!isContractExpiringInMonth && !isTurning60InMonth) return false;

        (item as any).actionReason = isTurning60InMonth ? '🎂 بلوغ سن الـ 60 (عقد دائم)' : '📑 انتهاء عقد محدد المدة';
      } else if (activeTab === 'above_age') {
        const isAbove60 = item.age !== null && item.age >= 60;
        const isAboveAgeType = String(item.contractType).includes('فوق السن');
        if (!isAbove60 && !isAboveAgeType) return false;
      } else if (activeTab === 'approval_status') {
        if (item.renewalStatus === 'لا يوجد طلب') return false;
      }

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
    <div className="flex flex-col gap-6 pb-10">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; direction: rtl; background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .executive-table th, .executive-table td { border: 1px solid #cbd5e1 !important; padding: 8px !important; color: black !important; }
        }
      `}</style>

      {/* رأس الصفحة وأزرار الإجراءات */}
      <div className="executive-card p-5 sm:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <h3 className="m-0 text-lg font-extrabold text-primary">مركز التقارير والتحليلات الرقمية</h3>
          <p className="mt-1 text-xs font-bold text-muted">استخراج وحصر الاستحقاقات التعاقدية وحركات بلوغ الـ 60 المجمعة</p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <button onClick={handleExportExcel} className="flex-1 md:flex-none bg-[var(--success-text)] hover:opacity-90 text-white px-4 py-2.5 rounded-lg font-bold text-xs transition-opacity flex items-center justify-center gap-2 shadow-sm">
            📥 تصدير Excel
          </button>
          <button onClick={handlePrint} className="flex-1 md:flex-none bg-primary hover:opacity-90 text-card px-4 py-2.5 rounded-lg font-bold text-xs transition-opacity flex items-center justify-center gap-2 shadow-sm">
            🖨️ طباعة التقرير
          </button>
        </div>
      </div>

      {/* 🌟 تبويبات أنواع التقارير */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 no-print">
        {[
          { id: 'monthly_expiry', icon: '🎯', title: 'تقرير استحقاقات الشهر', desc: 'انتهاء عقود + بلوغ الـ 60' },
          { id: 'above_age', icon: '💼', title: 'تقرير العمالة (60+)', desc: 'متابعة المحالين للتقاعد' },
          { id: 'approval_status', icon: '⏳', title: 'موقف التجديدات', desc: 'الطلبات المعتمدة وقيد التوقيع' },
          { id: 'full_roster', icon: '📂', title: 'السجل العام الشامل', desc: 'كشف موحد لجميع الموظفين' },
        ].map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`executive-card p-4 cursor-pointer border-2 transition-all duration-300 ${
              activeTab === tab.id 
                ? 'border-gold bg-gold/5 shadow-md' 
                : 'border-transparent hover:border-border'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">{tab.icon}</span>
              <span className={`text-xs font-extrabold ${activeTab === tab.id ? 'text-gold' : 'text-primary'}`}>
                {tab.title}
              </span>
            </div>
            <div className="text-[10px] text-muted font-bold">{tab.desc}</div>
          </div>
        ))}
      </div>

      {/* شريط الفلاتر الذكي */}
      <div className="executive-card p-5 flex flex-wrap gap-4 items-center no-print">
        
        {activeTab === 'monthly_expiry' && (
          <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-lg border border-blue-200 dark:border-blue-800 w-full lg:w-auto">
            <span className="text-xs font-bold text-blue-700 dark:text-blue-400">🗓️ شهر الاستحقاق:</span>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-card text-primary border border-blue-200 dark:border-blue-800 rounded-md px-2 py-1 text-xs font-bold outline-none focus:border-blue-500">
              <option value="">الكل</option>
              {MONTHS_LIST.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="bg-card text-primary border border-blue-200 dark:border-blue-800 rounded-md px-2 py-1 text-xs font-bold outline-none focus:border-blue-500">
              <option value="">الكل</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
            </select>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 flex-1">
          <input
            type="text"
            placeholder="بحث بالاسم أو الكود..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-background border border-border text-primary px-4 py-2.5 rounded-lg text-xs font-bold outline-none focus:border-gold w-full sm:w-auto flex-1 min-w-[150px]"
          />
          <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} className="bg-background border border-border text-primary px-4 py-2.5 rounded-lg text-xs font-bold outline-none focus:border-gold flex-1 min-w-[120px]">
            <option value="">🏢 كل الشركات</option>
            {companiesList.map((c: any, i) => <option key={i} value={c}>{c}</option>)}
          </select>
          <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="bg-background border border-border text-primary px-4 py-2.5 rounded-lg text-xs font-bold outline-none focus:border-gold flex-1 min-w-[120px]">
            <option value="">💼 كل الإدارات</option>
            {deptsList.map((d: any, i) => <option key={i} value={d}>{d}</option>)}
          </select>
          <select value={selectedContractType} onChange={e => setSelectedType(e.target.value)} className="bg-background border border-border text-primary px-4 py-2.5 rounded-lg text-xs font-bold outline-none focus:border-gold flex-1 min-w-[120px]">
            <option value="">📄 أنواع العقود</option>
            {contractTypesList.map((t: any, i) => <option key={i} value={t}>{t}</option>)}
          </select>

          <button
            onClick={() => {
              setSearchTerm(''); setSelectedCompany(''); setSelectedDept(''); setSelectedType('');
              setSelectedMonth(String(new Date().getMonth() + 1)); setSelectedYear(new Date().getFullYear().toString());
            }}
            className="bg-background text-primary border border-border hover:bg-border px-5 py-2.5 rounded-lg text-xs font-bold transition-colors w-full sm:w-auto"
          >
            إعادة ضبط
          </button>
        </div>
      </div>

      {/* كروت المؤشرات المحدثة */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        <div className="executive-card p-4 border-l-4 border-l-primary">
          <div className="text-[10px] text-muted font-bold mb-1">إجمالي الاستحقاقات المطلوب إجراءها</div>
          <div className="text-2xl font-black text-primary">{reportStats.total.toLocaleString('en-US')}</div>
        </div>

        <div className="executive-card p-4 border-l-4 border-l-[var(--warning-text)] bg-[var(--warning-bg)]/30">
          <div className="text-[10px] text-[var(--warning-text)] font-bold mb-1">🎂 بلوغ الـ 60 (تحويل لعقد فوق السن)</div>
          <div className="text-2xl font-black text-[var(--warning-text)]">{reportStats.turning60Count.toLocaleString('en-US')} <span className="text-xs">موظف</span></div>
        </div>

        <div className="executive-card p-4 border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10">
          <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mb-1">📑 عقود محددة انتهى أجلها</div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400">{reportStats.contractExpCount.toLocaleString('en-US')} <span className="text-xs">عقد</span></div>
        </div>

        <div className="executive-card p-4 border-l-4 border-l-[var(--success-text)] bg-[var(--success-bg)]/30">
          <div className="text-[10px] text-[var(--success-text)] font-bold mb-1">عقود مكتملة وموقعة</div>
          <div className="text-2xl font-black text-[var(--success-text)]">{reportStats.signedCount.toLocaleString('en-US')}</div>
        </div>
      </div>

      {/* 🖨️ منطقة التقرير والمعاينة القابلة للطباعة */}
      <div className="print-area executive-card p-6 overflow-hidden">
        
        <div className="border-b-2 border-primary pb-4 mb-6 flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
          <div>
            <h2 className="m-0 text-lg text-primary font-black">مجموعة شركات المراسم الدولية</h2>
            <p className="mt-1 text-xs text-muted font-bold">
              {activeTab === 'monthly_expiry' && `كشف استحقاقات العمل لشهر (${MONTHS_LIST.find(m => m.value === selectedMonth)?.label || 'الكل'}) لسنة ${selectedYear || 'الكل'} (عقود تنتهي + بلوغ الـ 60)`}
              {activeTab === 'above_age' && 'كشف حصر الموظفين البالغين لسن التقاعد (60 سنة فأكثر)'}
              {activeTab === 'approval_status' && 'تقرير متابعة موقف اعتمادات وتوقيعات العقود'}
              {activeTab === 'full_roster' && 'السجل الموحد العام لكافة قوة العمل النشطة'}
            </p>
          </div>

          <div className="text-left text-[10px] text-muted font-mono font-bold bg-background p-3 rounded-lg border border-border">
            <div>تاريخ التقرير: <strong className="text-primary">{new Date().toLocaleDateString('ar-EG')}</strong></div>
            <div className="mt-1">عدد السجلات: <strong className="text-primary">{filteredReportData.length}</strong></div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-xs font-bold text-muted">جاري استخراج وبناء التقرير... ⏳</div>
          ) : (
            <table className="w-full text-right text-xs whitespace-nowrap executive-table">
              <thead>
                <tr>
                  <th className="rounded-tr-lg">#</th>
                  <th>الكود</th>
                  <th>اسم الموظف</th>
                  <th>الإدارة</th>
                  <th>الوظيفة</th>
                  <th>السن</th>
                  <th>نوع العقد الحالي</th>
                  <th>السبب / الإجراء المطلوب</th>
                  <th>تاريخ الاستحقاق</th>
                  <th className="rounded-tl-lg text-center">حالة التجديد</th>
                </tr>
              </thead>
              <tbody>
                {filteredReportData.length === 0 ? (
                  <tr><td colSpan={10} className="p-8 text-center text-muted font-bold">لا توجد استحقاقات تعاقدية أو حركات مطابقة للفلاتر. 🎉</td></tr>
                ) : (
                  filteredReportData.map((item, idx) => {
                    const is60Event = (item as any).actionReason?.includes('60');

                    return (
                      <tr key={idx} className={is60Event ? 'bg-[var(--warning-bg)]/20' : ''}>
                        <td className="text-muted font-mono">{idx + 1}</td>
                        <td className="font-mono font-bold text-gold">{item.code}</td>
                        <td className="font-bold text-primary">{item.name}</td>
                        <td className="text-muted">{item.department || '—'}</td>
                        <td className="text-muted">{item.jobTitle || '—'}</td>
                        <td className={`font-bold ${item.age && item.age >= 60 ? 'text-[var(--warning-text)]' : 'text-primary'}`}>
                          {item.age ? `${item.age} سنة` : '—'}
                        </td>
                        <td className="font-bold text-primary">{item.contractType || '—'}</td>
                        <td className={`font-bold ${is60Event ? 'text-[var(--warning-text)]' : 'text-blue-600 dark:text-blue-400'}`}>
                          {(item as any).actionReason || 'انتهاء عقد'}
                        </td>
                        <td className="font-mono font-bold text-primary">
                          {is60Event && item.age60DateObj ? item.age60DateObj.toISOString().split('T')[0] : (item.endDate || '—')}
                        </td>
                        <td className="text-center font-bold text-muted">{item.renewalStatus}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-12 flex flex-col sm:flex-row justify-between items-center gap-6 px-4 text-xs text-muted font-bold">
          <div>مُعد التقرير: ........................</div>
          <div>مراجعة الموارد البشرية: ........................</div>
          <div>اعتماد إدارة الشركة: ........................</div>
        </div>

      </div>
    </div>
  );
}
