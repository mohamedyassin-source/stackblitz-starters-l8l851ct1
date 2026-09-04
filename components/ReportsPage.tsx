'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';

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

const getField = (obj: any, ...keys: string[]) => {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return '';
};

const getEmployeeAge = (emp: any) => {
  const rawAge = getField(emp, 'age', 'Age');
  if (rawAge !== '' && rawAge !== null && !isNaN(Number(rawAge))) {
    return Number(rawAge);
  }
  return null;
};

export default function ReportsPage() {
  const { employees, loading } = useAppData();

  const [activeReport, setActiveReport] = useState<'monthly' | 'above_60' | 'dept_summary' | 'full_roster'>('monthly');

  // الفلاتر الرئيسية
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedContractType, setSelectedContractType] = useState('');

  // 🌟 فلتر الإدارات المتعدد مع البحث والـ Checkbox
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [deptSearchTerm, setDeptSearchTerm] = useState('');
  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
  const deptDropdownRef = useRef<HTMLDivElement>(null);

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(event.target as Node)) {
        setIsDeptDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // استخراج القوائم المتاحة للفلاتر
  const companiesList = useMemo(() => Array.from(new Set(employees.map(e => getField(e, 'company', 'Company')).filter(Boolean))), [employees]);
  const deptsList = useMemo(() => Array.from(new Set(employees.map(e => getField(e, 'department', 'Department')).filter(Boolean))), [employees]);
  const contractTypesList = useMemo(() => Array.from(new Set(employees.map(e => getField(e, 'contract_type', 'ContractType')).filter(Boolean))), [employees]);

  // الإدارات المفلترة داخل قائمة البحث
  const filteredDeptsList = useMemo(() => {
    if (!deptSearchTerm.trim()) return deptsList;
    return deptsList.filter(d => String(d).toLowerCase().includes(deptSearchTerm.toLowerCase().trim()));
  }, [deptsList, deptSearchTerm]);

  // تجهيز البيانات النشطة فقط
  const activeEmployees = useMemo(() => {
    return employees.filter(e => (getField(e, 'status', 'Status') || 'Active') === 'Active');
  }, [employees]);

  // 🌟 فلترة البيانات الشاملة مع معالجة بداية ونهاية العقود شهرياً
  const reportData = useMemo(() => {
    return activeEmployees.filter(emp => {
      const cType = getField(emp, 'contract_type', 'ContractType');
      const endDateVal = getField(emp, 'contract_end_date', 'ContractEndDate');
      const startDateVal = getField(emp, 'contract_start_date', 'ContractStartDate', 'hiring_date', 'HiringDate');
      const comp = getField(emp, 'company', 'Company');
      const dept = getField(emp, 'department', 'Department');
      const code = String(getField(emp, 'employee_code', 'EmployeeCode')).toLowerCase();
      const name = String(getField(emp, 'employee_name', 'ArabicName')).toLowerCase();
      const age = getEmployeeAge(emp);

      // 1. تصفية التقرير المختار
      if (activeReport === 'monthly') {
        const startDate = startDateVal ? new Date(startDateVal) : null;
        const endDate = endDateVal ? new Date(endDateVal) : null;

        const validStart = startDate && !isNaN(startDate.getTime());
        const validEnd = endDate && !isNaN(endDate.getTime());

        if (!validStart && !validEnd) return false;

        const matchesMonthYear = (d: Date | null, monthFilter: string, yearFilter: string) => {
          if (!d) return false;
          const m = String(d.getMonth() + 1);
          const y = String(d.getFullYear());
          const matchM = !monthFilter || m === monthFilter;
          const matchY = !yearFilter || y === yearFilter;
          return matchM && matchY;
        };

        // أ) تاريخ نهاية العقد يقع في الشهر المختار
        const endMatches = validEnd && matchesMonthYear(endDate, selectedMonth, selectedYear);

        // ب) تاريخ بداية العقد أو التعيين يقع في الشهر المختار (مثل العقود التي تبدأ يوم 01 من الشهر)
        const startMatches = validStart && matchesMonthYear(startDate, selectedMonth, selectedYear);

        // ج) عقود تنتهي في أواخر الشهر السابق (مثل 28-31 من الشهر السابق) وتكون مستحقة للتجديد في هذا الشهر
        let prevMonthEndMatches = false;
        if (validEnd && selectedMonth) {
          const targetM = Number(selectedMonth);
          const targetY = selectedYear ? Number(selectedYear) : endDate.getFullYear();

          const prevMonthDate = new Date(targetY, targetM - 1, 0); // آخر يوم في الشهر السابق
          const prevM = String(prevMonthDate.getMonth() + 1);
          const prevY = String(prevMonthDate.getFullYear());

          const endM = String(endDate.getMonth() + 1);
          const endY = String(endDate.getFullYear());

          if (endM === prevM && (!selectedYear || endY === prevY) && endDate.getDate() >= 25) {
            prevMonthEndMatches = true;
          }
        }

        if (!endMatches && !startMatches && !prevMonthEndMatches) return false;

      } else if (activeReport === 'above_60') {
        const isAbove60 = age !== null && age >= 60;
        const isAboveAgeType = String(cType).includes('فوق السن');
        if (!isAbove60 && !isAboveAgeType) return false;
      }

      // 2. تطبيق الفلاتر الإضافية (الشركة - الإدارات المتعددة - نوع العقد - البحث)
      const matchesSearch = !searchTerm || code.includes(searchTerm.toLowerCase()) || name.includes(searchTerm.toLowerCase());
      const matchesComp = !selectedCompany || comp === selectedCompany;
      const matchesDept = selectedDepts.length === 0 || selectedDepts.includes(dept);
      const matchesType = !selectedContractType || cType === selectedContractType;

      return matchesSearch && matchesComp && matchesDept && matchesType;
    });
  }, [activeEmployees, activeReport, selectedMonth, selectedYear, selectedCompany, selectedDepts, selectedContractType, searchTerm]);

  // 📊 ملخص الإدارات (مخصص لتقرير dept_summary)
  const deptSummaryData = useMemo(() => {
    const summary: Record<string, { total: number; fixed: number; perm: number; above60: number }> = {};

    reportData.forEach(emp => {
      const dept = getField(emp, 'department', 'Department') || 'غير محدد';
      const cType = getField(emp, 'contract_type', 'ContractType');
      const age = getEmployeeAge(emp);

      if (!summary[dept]) {
        summary[dept] = { total: 0, fixed: 0, perm: 0, above60: 0 };
      }

      summary[dept].total += 1;
      if (cType === 'دائم') summary[dept].perm += 1;
      if (String(cType).includes('محدد')) summary[dept].fixed += 1;
      if (String(cType).includes('فوق السن') || (age && age >= 60)) summary[dept].above60 += 1;
    });

    return Object.entries(summary).map(([dept, counts]) => ({ dept, ...counts }));
  }, [reportData]);

  // تبديل اختيار إدارة معينة
  const toggleDeptSelection = (deptName: string) => {
    setSelectedDepts(prev => 
      prev.includes(deptName) ? prev.filter(d => d !== deptName) : [...prev, deptName]
    );
  };

  // تصدير Excel
  const handleExportExcel = () => {
    if (reportData.length === 0) return alert('لا توجد بيانات للتصدير.');

    let exportRows = [];
    if (activeReport === 'dept_summary') {
      exportRows = deptSummaryData.map(d => ({
        'الإدارة': d.dept,
        'إجمالي الموظفين': d.total,
        'عقود محددة': d.fixed,
        'عقود دائمة': d.perm,
        'فوق السن (60+)': d.above60,
      }));
    } else {
      exportRows = reportData.map(e => ({
        'الكود': getField(e, 'employee_code', 'EmployeeCode'),
        'الاسم': getField(e, 'employee_name', 'ArabicName'),
        'الإدارة': getField(e, 'department', 'Department'),
        'الشركة': getField(e, 'company', 'Company'),
        'الوظيفة': getField(e, 'job_title', 'JobTitle'),
        'نوع العقد': getField(e, 'contract_type', 'ContractType'),
        'تاريخ التعيين / بداية العقد': getField(e, 'contract_start_date', 'ContractStartDate', 'hiring_date', 'HiringDate') || '—',
        'تاريخ نهاية العقد': getField(e, 'contract_end_date', 'ContractEndDate') || '—',
        'السن': getEmployeeAge(e) ? `${getEmployeeAge(e)} سنة` : '—',
      }));
    }

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'التقرير');
    XLSX.writeFile(wb, `تقرير_${activeReport}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; direction: rtl; background: #fff !important; }
          .no-print { display: none !important; }
          .data-table th, .data-table td { border: 1px solid #cbd5e1 !important; padding: 6px !important; }
        }
      `}</style>

      {/* الهيدر الأكبر */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950, #0f172a)', fontWeight: '900' }}>📊 مركز تقارير العقود والاستحقاقات</h3>
          <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>تقارير منظمة ومباشرة حسب الشهر، الإدارات المحددة، والشركات</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleExportExcel} style={{ background: 'var(--stamp-green)', color: '#fff', border: 0, padding: '9px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
            📥 تصدير Excel
          </button>
          <button onClick={() => window.print()} style={{ background: 'var(--navy-950, #0f172a)', color: '#fff', border: 0, padding: '9px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
            🖨️ طباعة / PDF
          </button>
        </div>
      </div>

      {/* كروت اختيار نوع التقرير */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { id: 'monthly', icon: '🗓️', title: 'تقرير انتهاء وتجديد العقود الشهري', desc: 'حسب بداية ونهاية العقود للشهر المحدد' },
          { id: 'above_60', icon: '💼', title: 'تقرير العمالة فوق السن (60+)', desc: 'متابعة عقود المتقاعدين' },
          { id: 'dept_summary', icon: '📊', title: 'ملخص توزيع العقود بالإدارات', desc: 'إحصائيات مجمعة لكل إدارة' },
          { id: 'full_roster', icon: '📂', title: 'السجل العام للقوة الحالية', desc: 'كشف شمول لكافة الموظفين' },
        ].map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveReport(tab.id as any)}
            style={{
              background: activeReport === tab.id ? 'var(--stamp-blue-bg)' : 'var(--paper-card)',
              border: activeReport === tab.id ? '2px solid var(--stamp-blue)' : '1px solid var(--line)',
              borderRadius: '12px',
              padding: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '18px' }}>{tab.icon}</span>
              <span style={{ fontSize: '12px', fontWeight: '900', color: activeReport === tab.id ? 'var(--stamp-blue)' : 'var(--navy-950)' }}>{tab.title}</span>
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>{tab.desc}</div>
          </div>
        ))}
      </div>

      {/* 🛠️ شريط الفلاتر */}
      <div className="no-print" style={{ background: 'var(--paper-card, #fff)', border: '1px solid var(--line, #e2e8f0)', padding: '14px', borderRadius: '12px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        
        {/* فلتر الشهر والسنة */}
        {activeReport === 'monthly' && (
          <div style={{ display: 'flex', gap: '6px', background: 'var(--paper)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--line)', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--stamp-blue)' }}>🗓️ استحقاق شهر:</span>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', fontWeight: 'bold', outline: 'none' }}>
              <option value="">كل الأشهر</option>
              {MONTHS_LIST.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', fontWeight: 'bold', outline: 'none' }}>
              <option value="">كل السنوات</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
            </select>
          </div>
        )}

        {/* بحث بالاسم أو الكود */}
        <input
          type="text"
          placeholder="بحث بالاسم أو الكود..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', width: '160px', fontWeight: 'bold' }}
        />

        {/* فلتر الشركة */}
        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', fontWeight: 'bold' }}>
          <option value="">🏢 كل الشركات</option>
          {companiesList.map((c: any, i) => <option key={i} value={c}>{c}</option>)}
        </select>

        {/* 🌟 فلتر الإدارات المطور */}
        <div style={{ position: 'relative' }} ref={deptDropdownRef}>
          <button
            type="button"
            onClick={() => setIsDeptDropdownOpen(!isDeptDropdownOpen)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: selectedDepts.length > 0 ? '2px solid var(--stamp-blue)' : '1px solid var(--line)',
              background: selectedDepts.length > 0 ? 'var(--stamp-blue-bg)' : 'var(--paper-card)',
              color: selectedDepts.length > 0 ? 'var(--stamp-blue)' : 'var(--navy-950)',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minWidth: '160px',
              justify: 'space-between'
            }}
          >
            <span>💼 الإدارات ({selectedDepts.length === 0 ? 'الكل' : selectedDepts.length})</span>
            <span>▼</span>
          </button>

          {isDeptDropdownOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              width: '260px',
              background: 'var(--paper-card, #fff)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '6px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
              zIndex: 100,
            }}>
              <input
                type="text"
                placeholder="🔍 ابحث اسم الإدارة..."
                value={deptSearchTerm}
                onChange={e => setDeptSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  fontSize: '11px',
                  outline: 'none',
                  marginBottom: '10px',
                  boxSizing: 'border-box'
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--line)' }}>
                <button
                  type="button"
                  onClick={() => setSelectedDepts([...deptsList])}
                  style={{ background: 'transparent', border: 0, color: 'var(--stamp-blue)', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  تحديد الكل
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDepts([])}
                  style={{ background: 'transparent', border: 0, color: 'var(--stamp-red)', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  إلغاء التحديد
                </button>
              </div>

              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {filteredDeptsList.length === 0 ? (
                  <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', padding: '8px' }}>لا توجد إدارة بهذا الاسم</div>
                ) : (
                  filteredDeptsList.map((d, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: selectedDepts.includes(d) ? 'bold' : 'normal', color: 'var(--navy-950)' }}>
                      <input
                        type="checkbox"
                        checked={selectedDepts.includes(d)}
                        onChange={() => toggleDeptSelection(d)}
                        style={{ accentColor: 'var(--stamp-blue)', cursor: 'pointer' }}
                      />
                      {d}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* فلتر نوع العقد */}
        <select value={selectedContractType} onChange={e => setSelectedContractType(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', fontWeight: 'bold' }}>
          <option value="">📄 أنواع العقود (الكل)</option>
          {contractTypesList.map((t: any, i) => <option key={i} value={t}>{t}</option>)}
        </select>

        <button
          onClick={() => {
            setSearchTerm('');
            setSelectedCompany('');
            setSelectedDepts([]);
            setDeptSearchTerm('');
            setSelectedContractType('');
            setSelectedMonth(String(new Date().getMonth() + 1));
            setSelectedYear(new Date().getFullYear().toString());
          }}
          style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '8px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          إعادة ضبط
        </button>

        <div style={{ flex: 1, textAlign: 'left', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>
          عدد الموظفين بالقائمة: <strong style={{ color: 'var(--navy-950)' }}>{activeReport === 'dept_summary' ? deptSummaryData.length : reportData.length}</strong>
        </div>
      </div>

      {/* 📄 منطقة عرض وطباعة التقرير */}
      <div className="print-area" style={{ background: 'var(--paper-card, #fff)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px' }}>
        
        {/* ترويسة التقرير */}
        <div style={{ borderBottom: '2px solid var(--navy-950)', paddingBottom: '14px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950)', fontWeight: '900' }}>مجموعة شركات المراسم الدولية</h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)', fontWeight: 'bold' }}>
              {activeReport === 'monthly' && `تقرير العقود المستحقة للإنهاء/التجديد والبادئة لشهر (${selectedMonth || 'الكل'}) لسنة ${selectedYear || 'الكل'}`}
              {activeReport === 'above_60' && 'كشف العمالة فوق السن والبالغين لسن التقاعد (60+)'}
              {activeReport === 'dept_summary' && 'تقرير ملخص إحصائيات العقود موزعة حسب الإدارات'}
              {activeReport === 'full_roster' && 'السجل الموحد العام لجميع الموظفين النشطين'}
              {selectedCompany && ` - شركة: ${selectedCompany}`}
              {selectedDepts.length > 0 && ` - الإدارات: (${selectedDepts.join('، ')})`}
            </p>
          </div>

          <div style={{ textAlign: 'left', fontSize: '11px', color: 'var(--muted)', fontFamily: 'monospace' }}>
            <div>تاريخ الاستخراج: <strong>{new Date().toLocaleDateString('ar-EG')}</strong></div>
            <div>إجمالي السجلات: <strong>{activeReport === 'dept_summary' ? deptSummaryData.length : reportData.length}</strong></div>
          </div>
        </div>

        {/* عرض البيانات */}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: 'var(--muted)' }}>جاري إعداد التقرير... ⏳</div>
        ) : activeReport === 'dept_summary' ? (
          
          /* 📊 جدول إحصائيات الإدارات */
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>
                <th style={{ padding: '10px' }}>#</th>
                <th style={{ padding: '10px' }}>الإدارة</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>إجمالي القوة</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>عقود محددة المدة</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>عقود دائمة</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>عمالة فوق السن (60+)</th>
              </tr>
            </thead>
            <tbody>
              {deptSummaryData.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontWeight: 'bold' }}>لا توجد بيانات مطابقة.</td></tr>
              ) : deptSummaryData.map((d, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '10px', color: 'var(--muted)' }}>{i + 1}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--navy-950)' }}>{d.dept}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', color: 'var(--stamp-blue)' }}>{d.total}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>{d.fixed}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>{d.perm}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: 'var(--stamp-amber)' }}>{d.above60}</td>
                </tr>
              ))}
            </tbody>
          </table>

        ) : (

          /* 📄 جدول تفاصيل الموظفين العادي */
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>
                <th style={{ padding: '10px' }}>#</th>
                <th style={{ padding: '10px' }}>الكود</th>
                <th style={{ padding: '10px' }}>الاسم</th>
                <th style={{ padding: '10px' }}>الإدارة</th>
                <th style={{ padding: '10px' }}>الشركة</th>
                <th style={{ padding: '10px' }}>الوظيفة</th>
                <th style={{ padding: '10px' }}>نوع العقد</th>
                <th style={{ padding: '10px' }}>تاريخ البداية / التعيين</th>
                <th style={{ padding: '10px' }}>تاريخ نهاية العقد</th>
                <th style={{ padding: '10px' }}>السن</th>
              </tr>
            </thead>
            <tbody>
              {reportData.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', fontWeight: 'bold' }}>لا توجد عقود مستحقة أو سارية في هذا الشهر حسب الفلاتر المحددة 🔍</td></tr>
              ) : reportData.map((emp, i) => {
                const code = getField(emp, 'employee_code', 'EmployeeCode');
                const name = getField(emp, 'employee_name', 'ArabicName');
                const dept = getField(emp, 'department', 'Department');
                const comp = getField(emp, 'company', 'Company');
                const job = getField(emp, 'job_title', 'JobTitle');
                const cType = getField(emp, 'contract_type', 'ContractType');
                const startDate = getField(emp, 'contract_start_date', 'ContractStartDate', 'hiring_date', 'HiringDate');
                const endDate = getField(emp, 'contract_end_date', 'ContractEndDate');
                const age = getEmployeeAge(emp);

                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px', color: 'var(--muted)' }}>{i + 1}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--brass-600)' }}>{code}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--navy-950)' }}>{name}</td>
                    <td style={{ padding: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>{dept || '—'}</td>
                    <td style={{ padding: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>{comp || '—'}</td>
                    <td style={{ padding: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>{job || '—'}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold' }}>{cType || '—'}</td>
                    <td style={{ padding: '10px', fontFamily: 'monospace' }}>{startDate || '—'}</td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold', color: endDate ? 'var(--stamp-blue)' : 'var(--muted)' }}>
                      {endDate || '—'}
                    </td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: age && age >= 60 ? 'var(--stamp-amber)' : 'inherit' }}>
                      {age ? `${age} سنة` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

        )}

        {/* توقيعات الاعتماد لتقارير الطباعة */}
        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', padding: '0 20px', fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>
          <div>مُعد التقرير: ........................</div>
          <div>مراجعة الموارد البشرية: ........................</div>
          <div>اعتماد إدارة الشركة: ........................</div>
        </div>

      </div>
    </div>
  );
}
