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
  const { employees = [], renewals = [], loading } = useAppData();

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

  const companiesList = useMemo(() => {
    return Array.from(new Set(employees.map(e => getField(e, 'company', 'Company')).filter(Boolean)));
  }, [employees]);

  const deptsList = useMemo(() => {
    return Array.from(new Set(employees.map(e => getField(e, 'department', 'Department')).filter(Boolean)));
  }, [employees]);

  const contractTypesList = useMemo(() => {
    return Array.from(new Set(employees.map(e => getField(e, 'contract_type', 'ContractType')).filter(Boolean)));
  }, [employees]);

  // تجهيز البيانات بأمان بدون أخطاء
  const processedData = useMemo(() => {
    if (!employees || !Array.isArray(employees)) return [];

    const activeEmps = employees.filter(e => (getField(e, 'status', 'Status') || 'Active') === 'Active');

    return activeEmps.map(emp => {
      const code = String(getField(emp, 'employee_code', 'EmployeeCode'));
      const name = String(getField(emp, 'employee_name', 'ArabicName'));
      const endDateStr = getField(emp, 'contract_end_date', 'ContractEndDate');
      const natId = String(getField(emp, 'national_id', 'NationalID')).trim();
      const rawAge = getField(emp, 'age', 'Age');
      const ageNum = rawAge !== '' && !isNaN(Number(rawAge)) ? Number(rawAge) : null;

      // حساب أيام المتبقي
      let daysLeft: number | null = null;
      if (endDateStr) {
        const end = new Date(endDateStr);
        if (!isNaN(end.getTime())) {
          const today = new Date();
          daysLeft = Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
        }
      }

      // حساب تاريخ سن الـ 60 من الرقم القومي
      let age60Month: string | null = null;
      let age60Year: string | null = null;
      let age60DateStr: string | null = null;

      if (natId.length === 14) {
        const century = natId.charAt(0) === '3' ? '20' : '19';
        const yy = natId.substring(1, 3);
        const mm = natId.substring(3, 5);
        const dd = natId.substring(5, 7);
        const bDate = new Date(`${century}${yy}-${mm}-${dd}`);

        if (!isNaN(bDate.getTime())) {
          const age60Date = new Date(bDate);
          age60Date.setFullYear(age60Date.getFullYear() + 60);
          age60Month = String(age60Date.getMonth() + 1);
          age60Year = String(age60Date.getFullYear());
          age60DateStr = age60Date.toISOString().split('T')[0];
        }
      }

      const empRens = (renewals || []).filter(r => String(r.employee_code) === code);
      const latestRenewal = empRens[empRens.length - 1];

      return {
        code,
        name,
        jobTitle: getField(emp, 'job_title', 'JobTitle'),
        department: getField(emp, 'department', 'Department'),
        company: getField(emp, 'company', 'Company'),
        contractType: getField(emp, 'contract_type', 'ContractType'),
        endDate: endDateStr,
        daysLeft,
        age: ageNum,
        age60Month,
        age60Year,
        age60DateStr,
        renewalStatus: latestRenewal?.status || 'لا يوجد طلب',
        signatureStatus: latestRenewal?.signature_status || '—',
      };
    });
  }, [employees, renewals]);

  // التصفية المركبة النظيفة
  const filteredReportData = useMemo(() => {
    return processedData.filter(item => {
      let actionReason = 'استحقاق دوري';
      
      if (activeTab === 'monthly_expiry') {
        let isContractExpiring = false;
        let isTurning60 = false;

        // 1. الموظفون محدد العقود الذين ينتهي عقدهم في الشهر والسنوات المحددة
        if (item.contractType !== 'دائم' && item.endDate) {
          const d = new Date(item.endDate);
          if (!isNaN(d.getTime())) {
            const m = String(d.getMonth() + 1);
            const y = String(d.getFullYear());
            if ((!selectedMonth || m === selectedMonth) && (!selectedYear || y === selectedYear)) {
              isContractExpiring = true;
              actionReason = '📑 انتهاء عقد محدد المدة';
            }
          }
        }

        // 2. الموظفون أصحاب العقود الدائمة الذين يبلغون سن 60 في هذا الشهر
        if (item.contractType === 'دائم' && item.age60Month && item.age60Year) {
          if ((!selectedMonth || item.age60Month === selectedMonth) && (!selectedYear || item.age60Year === selectedYear)) {
            isTurning60 = true;
            actionReason = '🎂 بلوغ سن الـ 60 (عقد دائم)';
          }
        }

        if (!isContractExpiring && !isTurning60) return false;
        (item as any).reasonText = actionReason;
      } else if (activeTab === 'above_age') {
        const is60 = item.age !== null && item.age >= 60;
        const isAboveType = String(item.contractType).includes('فوق السن');
        if (!is60 && !isAboveType) return false;
      } else if (activeTab === 'approval_status') {
        if (item.renewalStatus === 'لا يوجد طلب') return false;
      }

      // البحث والشركات والإدارات
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || item.code.toLowerCase().includes(term) || item.name.toLowerCase().includes(term);
      const matchesComp = !selectedCompany || item.company === selectedCompany;
      const matchesDept = !selectedDept || item.department === selectedDept;
      const matchesType = !selectedContractType || item.contractType === selectedContractType;

      return matchesSearch && matchesComp && matchesDept && matchesType;
    });
  }, [processedData, activeTab, selectedMonth, selectedYear, searchTerm, selectedCompany, selectedDept, selectedContractType]);

  const handlePrint = () => window.print();

  const handleExportExcel = async () => {
    if (filteredReportData.length === 0) return alert('لا توجد بيانات للتصدير.');

    const rows = filteredReportData.map(item => ({
      'كود الموظف': item.code,
      'اسم الموظف': item.name,
      'الإدارة': item.department || '—',
      'الوظيفة': item.jobTitle || '—',
      'السن': item.age ? `${item.age} سنة` : '—',
      'نوع العقد': item.contractType || '—',
      'سبب التقرير': (item as any).reasonText || '—',
      'تاريخ الانتهاء/الـ60': (item as any).reasonText?.includes('60') ? (item.age60DateStr || '—') : (item.endDate || '—'),
      'حالة التجديد': item.renewalStatus,
    }));

    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
    XLSX.writeFile(wb, `تقرير_${activeTab}.xlsx`);
  };

  return (
    <div style={{ direction: 'rtl', paddingBottom: '40px' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; direction: rtl; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* الرأس */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>مركز التقارير الرقمية</h3>
          <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>استخراج وتحليل وتصدير بيانات الاستحقاقات التعاقدية</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleExportExcel} style={{ background: '#059669', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
            📥 تصدير Excel
          </button>
          <button onClick={handlePrint} style={{ background: '#0f172a', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
            🖨️ طباعة
          </button>
        </div>
      </div>

      {/* التبويبات */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {[
          { id: 'monthly_expiry', title: '🎯 استحقاقات الشهر المركب', desc: 'انتهاء عقود + بلوغ الـ 60' },
          { id: 'above_age', title: '💼 فوق السن (60+)', desc: 'المحالين للتقاعد وعقود فوق السن' },
          { id: 'approval_status', title: '⏳ موقف الاعتماد والتوقيع', desc: 'طلبات التجديد الجارية والمكتملة' },
          { id: 'full_roster', title: '📂 السجل الشامل', desc: 'جميع الموظفين النشطين' },
        ].map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              background: activeTab === tab.id ? '#f0fdf4' : '#fff',
              border: activeTab === tab.id ? '2px solid #0d9488' : '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '12px',
              cursor: 'pointer'
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: activeTab === tab.id ? '#0d9488' : '#0f172a' }}>{tab.title}</div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{tab.desc}</div>
          </div>
        ))}
      </div>

      {/* الفلاتر */}
      <div className="no-print" style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '10px', marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        {activeTab === 'monthly_expiry' && (
          <div style={{ display: 'flex', gap: '6px', background: '#eff6ff', padding: '4px 8px', borderRadius: '6px', border: '1px solid #bfdbfe', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#1e40af' }}>🗓️ الشهر/السنة:</span>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #93c5fd', fontSize: '11px', fontWeight: 'bold' }}>
              <option value="">كل الأشهر</option>
              {MONTHS_LIST.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #93c5fd', fontSize: '11px', fontWeight: 'bold' }}>
              <option value="">كل السنوات</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
            </select>
          </div>
        )}

        <input type="text" placeholder="بحث باسم أو كود الموظف..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px', width: '180px' }} />

        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
          <option value="">🏢 كل الشركات</option>
          {companiesList.map((c: any, i) => <option key={i} value={c}>{c}</option>)}
        </select>

        <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
          <option value="">💼 كل الإدارات</option>
          {deptsList.map((d: any, i) => <option key={i} value={d}>{d}</option>)}
        </select>

        <button onClick={() => { setSearchTerm(''); setSelectedCompany(''); setSelectedDept(''); setSelectedType(''); setSelectedMonth(String(new Date().getMonth() + 1)); }} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>

        <div style={{ flex: 1, textAlign: 'left', fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>
          عدد السجلات: <strong style={{ color: '#0f172a' }}>{filteredReportData.length}</strong>
        </div>
      </div>

      {/* المعاينة والجدول */}
      <div className="print-area" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
        <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>مجموعة شركات المراسم الدولية</h2>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>
              {activeTab === 'monthly_expiry' && `كشف استحقاقات العمل لشهر (${MONTHS_LIST.find(m => m.value === selectedMonth)?.label || 'الكل'}) لسنة ${selectedYear || 'الكل'}`}
              {activeTab === 'above_age' && 'تقرير حصر عمالة فوق السن والتقاعد (60+)'}
              {activeTab === 'approval_status' && 'تقرير حالة اعتمادات وتوقيعات التجديد'}
              {activeTab === 'full_roster' && 'السجل العام الموحد لكافة الموظفين'}
            </p>
          </div>
          <div style={{ fontSize: '10px', color: '#64748b' }}>تاريخ التقرير: <strong>{new Date().toLocaleDateString('ar-EG')}</strong></div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>جاري تحميل التقرير...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '8px' }}>#</th>
                  <th style={{ padding: '8px' }}>الكود</th>
                  <th style={{ padding: '8px' }}>الموظف</th>
                  <th style={{ padding: '8px' }}>الإدارة</th>
                  <th style={{ padding: '8px' }}>الوظيفة</th>
                  <th style={{ padding: '8px' }}>السن</th>
                  <th style={{ padding: '8px' }}>نوع العقد الحالي</th>
                  <th style={{ padding: '8px' }}>سبب الإدراجبالتقرير</th>
                  <th style={{ padding: '8px' }}>تاريخ الاستحقاق</th>
                  <th style={{ padding: '8px' }}>حالة التجديد</th>
                </tr>
              </thead>
              <tbody>
                {filteredReportData.length === 0 ? (
                  <tr><td colSpan={10} style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا توجد بيانات مطابقة للتقرير. 🎉</td></tr>
                ) : (
                  filteredReportData.map((item, idx) => {
                    const is60Reason = (item as any).reasonText?.includes('60');

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: is60Reason ? '#fffbeb' : 'transparent' }}>
                        <td style={{ padding: '8px', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '8px', fontWeight: 'bold', fontFamily: 'monospace', color: '#0d9488' }}>{item.code}</td>
                        <td style={{ padding: '8px', fontWeight: 'bold', color: '#0f172a' }}>{item.name}</td>
                        <td style={{ padding: '8px', color: '#64748b' }}>{item.department || '—'}</td>
                        <td style={{ padding: '8px', color: '#64748b' }}>{item.jobTitle || '—'}</td>
                        <td style={{ padding: '8px', fontWeight: 'bold', color: item.age && item.age >= 60 ? '#d97706' : '#334155' }}>
                          {item.age ? `${item.age} سنة` : '—'}
                        </td>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{item.contractType || '—'}</td>
                        <td style={{ padding: '8px', fontWeight: 'bold', color: is60Reason ? '#d97706' : '#2563eb' }}>
                          {(item as any).reasonText || 'استحقاق'}
                        </td>
                        <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 'bold' }}>
                          {is60Reason ? (item.age60DateStr || '—') : (item.endDate || '—')}
                        </td>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{item.renewalStatus}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
