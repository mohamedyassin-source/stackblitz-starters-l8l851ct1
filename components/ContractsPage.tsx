'use client';
import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import Stamp from './Stamp';

export default function ContractsPage({ jumpSearch }: { jumpSearch?: string }) {
  const { employees, renewals, loading, refresh } = useAppData();

  // الفلاتر والبحث
  const [searchTerm, setSearchTerm] = useState(jumpSearch || '');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedExpiryRange, setSelectedExpiryRange] = useState('');

  // نافذة إنشاء/تجديد العقد
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);

  // بيانات نموذج التجديد
  const [renewalType, setRenewalType] = useState('محدد المدة');
  const [renewalMonths, setRenewalMonths] = useState(12);
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (jumpSearch) setSearchTerm(jumpSearch);
  }, [jumpSearch]);

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

  const companiesList = useMemo(() => Array.from(new Set(employees.map(e => getField(e, 'company', 'Company')).filter(Boolean))), [employees]);
  const deptsList = useMemo(() => Array.from(new Set(employees.map(e => getField(e, 'department', 'Department')).filter(Boolean))), [employees]);
  const typesList = useMemo(() => Array.from(new Set(employees.map(e => getField(e, 'contract_type', 'ContractType')).filter(Boolean))), [employees]);

  // تصفية الموظفين النشطين
  const activeEmployees = useMemo(() => {
    return employees.filter(e => (getField(e, 'status', 'Status') || 'Active') === 'Active');
  }, [employees]);

  // دمج بيانات العقود مع آخر طلب تجديد
  const contractsData = useMemo(() => {
    return activeEmployees.map(emp => {
      const code = getField(emp, 'employee_code', 'EmployeeCode');
      const endDate = getField(emp, 'contract_end_date', 'ContractEndDate');
      const daysLeft = getDaysRemaining(endDate);
      const age = getEmployeeAge(emp);

      const empRens = renewals.filter(r => r.employee_code === code).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      const latestRenewal = empRens[0];

      return {
        ...emp,
        code,
        name: getField(emp, 'employee_name', 'ArabicName'),
        jobTitle: getField(emp, 'job_title', 'JobTitle'),
        department: getField(emp, 'department', 'Department'),
        company: getField(emp, 'company', 'Company'),
        contractType: getField(emp, 'contract_type', 'ContractType'),
        startDate: getField(emp, 'contract_start_date', 'ContractStartDate', 'hiring_date', 'HiringDate'),
        endDate,
        daysLeft,
        age,
        hasPendingRenewal: latestRenewal && (latestRenewal.status === 'Pending' || latestRenewal.status === 'قيد الانتظار'),
        latestRenewalStatus: latestRenewal?.status || 'لا يوجد طلب',
      };
    });
  }, [activeEmployees, renewals]);

  // تطبيق الفلاتر
  const filteredContracts = useMemo(() => {
    return contractsData.filter(item => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || item.code.toLowerCase().includes(term) || item.name.toLowerCase().includes(term);
      const matchesComp = !selectedCompany || item.company === selectedCompany;
      const matchesDept = !selectedDept || item.department === selectedDept;
      const matchesType = !selectedType || item.contractType === selectedType;

      let matchesExpiry = true;
      if (selectedExpiryRange === 'expired') matchesExpiry = item.daysLeft !== null && item.daysLeft < 0;
      else if (selectedExpiryRange === 'expiring_60') matchesExpiry = item.daysLeft !== null && item.daysLeft >= 0 && item.daysLeft <= 60;
      else if (selectedExpiryRange === 'above_60') matchesExpiry = (item.age !== null && item.age >= 60) || String(item.contractType).includes('فوق السن');

      return matchesSearch && matchesComp && matchesDept && matchesType && matchesExpiry;
    });
  }, [contractsData, searchTerm, selectedCompany, selectedDept, selectedType, selectedExpiryRange]);

  // فتح نافذة الإنشاء/التجديد
  const handleOpenRenewalModal = (emp: any) => {
    setSelectedEmp(emp);
    const isAbove60 = (emp.age !== null && emp.age >= 60) || emp.contractType === 'دائم';
    const defaultType = isAbove60 && (emp.age >= 60 || emp.contractType === 'دائم') ? 'محدد المدة - فوق السن' : 'محدد المدة';
    setRenewalType(defaultType);
    setRenewalMonths(12);

    // حساب تاريخ البداية الافتراضي (اليوم التالي لنهاية العقد أو تاريخ اليوم)
    let start = new Date();
    if (emp.endDate) {
      const currentEnd = new Date(emp.endDate);
      if (!isNaN(currentEnd.getTime())) {
        start = new Date(currentEnd);
        start.setDate(start.getDate() + 1);
      }
    }

    const startStr = start.toISOString().split('T')[0];
    setNewStartDate(startStr);

    // حساب تاريخ النهاية الافتراضي (البداية + أشهر التجديد - 1 يوم)
    const end = new Date(start);
    end.setMonth(end.getMonth() + 12);
    end.setDate(end.getDate() - 1);
    setNewEndDate(end.toISOString().split('T')[0]);

    setShowRenewalModal(true);
  };

  // إعادة حساب تاريخ النهاية تلقائياً عند تغيير البداية أو عدد الشهور
  const handleMonthsOrDateChange = (months: number, startStr: string) => {
    setRenewalMonths(months);
    setNewStartDate(startStr);

    if (startStr) {
      const start = new Date(startStr);
      if (!isNaN(start.getTime())) {
        const end = new Date(start);
        end.setMonth(end.getMonth() + Number(months));
        end.setDate(end.getDate() - 1);
        setNewEndDate(end.toISOString().split('T')[0]);
      }
    }
  };

  // 🌟 حفظ طلب التجديد بأسماء الأعمدة المطابقة لقاعدة البيانات 100%
  const handleSaveRenewalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;

    setSaving(true);
    try {
      const yearPrefix = `RR-${new Date().getFullYear()}-`;
      const randomId = Math.floor(1000 + Math.random() * 9000);

      const payload = {
        request_id: `${yearPrefix}${randomId}`,
        employee_code: String(selectedEmp.code),
        employee_name: String(selectedEmp.name),
        company: selectedEmp.company || '',
        department: selectedEmp.department || '',
        job_title: selectedEmp.jobTitle || '',
        contract_type: renewalType,
        renewal_months: Number(renewalMonths),

        // 👈 الأسماء المعتمدة بجدول renewal_requests في سوبابيز لمنع خطأ Schema Cache
        new_start_date: newStartDate,
        new_contract_end_date: newEndDate,

        status: 'Pending',
        signature_status: 'في انتظار توقيع الموظف',
        request_date: new Date().toISOString().split('T')[0],
      };

      const { error } = await supabase
        .from('renewal_requests')
        .insert([payload]);

      if (error) throw error;

      alert(`✅ تم إنشاء طلب التجديد للموظف (${selectedEmp.name}) بنجاح.`);
      setShowRenewalModal(false);
      setSelectedEmp(null);
      await refresh();
    } catch (err: any) {
      alert('حدث خطأ أثناء حفظ طلب التجديد: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ direction: 'rtl', animation: 'fadeIn 0.3s ease-in-out' }}>
      
      {/* رأس الصفحة */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950, #0f172a)', fontWeight: '800' }}>إدارة العقود الحالية والتجديدات</h3>
          <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>متابعة سريان العقود وإنشاء طلبات التجديد والتحويل التعاقدي</p>
        </div>
      </div>

      {/* الفلاتر والبحث */}
      <div className="db-card" style={{ background: 'var(--paper-card, #fff)', border: '1px solid var(--line, #e2e8f0)', padding: '14px', borderRadius: '12px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="بحث بالاسم أو الكود..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none', width: '200px' }}
        />

        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none' }}>
          <option value="">🏢 كل الشركات</option>
          {companiesList.map((c: any, i) => <option key={i} value={c}>{c}</option>)}
        </select>

        <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none' }}>
          <option value="">💼 كل الإدارات</option>
          {deptsList.map((d: any, i) => <option key={i} value={d}>{d}</option>)}
        </select>

        <select value={selectedType} onChange={e => setSelectedType(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none' }}>
          <option value="">📄 أنواع العقود</option>
          {typesList.map((t: any, i) => <option key={i} value={t}>{t}</option>)}
        </select>

        <select value={selectedExpiryRange} onChange={e => setSelectedExpiryRange(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line, #e2e8f0)', fontSize: '11px', outline: 'none', fontWeight: 'bold' }}>
          <option value="">حالة انتهـاء العقد (الكل)</option>
          <option value="expiring_60">⏳ ينتهي قريباً (خلال 60 يوم)</option>
          <option value="expired">🚨 منتهي المدة بالفعل</option>
          <option value="above_60">💼 عمالة فوق الـ 60 سنة</option>
        </select>

        <button
          onClick={() => {
            setSearchTerm('');
            setSelectedCompany('');
            setSelectedDept('');
            setSelectedType('');
            setSelectedExpiryRange('');
          }}
          style={{ background: '#f1f5f9', border: '1px solid var(--line, #e2e8f0)', padding: '8px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          إعادة ضبط
        </button>

        <div style={{ flex: 1, textAlign: 'left', fontSize: '11px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>
          إجمالي العقود المعروضة: <span style={{ color: 'var(--navy-950, #0f172a)' }}>{filteredContracts.length.toLocaleString('en-US')}</span> عقد
        </div>
      </div>

      {/* الجدول الرئيسي لعقود الموظفين */}
      <div className="db-card" style={{ background: 'var(--paper-card, #fff)', border: '1px solid var(--line, #e2e8f0)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: 'var(--muted, #64748b)' }}>جاري معالجة بيانات العقود... ⏳</div>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--paper-card, #fff)', zIndex: 10 }}>
                <tr style={{ borderBottom: '1px solid var(--line, #cbd5e1)' }}>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>الكود</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>الاسم</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>الإدارة</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>السن</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>نوع العقد الحالي</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>بداية العقد</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>نهاية العقد</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)' }}>الأيام المتبقية</th>
                  <th style={{ padding: '12px', color: 'var(--muted, #64748b)', textAlign: 'center' }}>إجراء التجديد</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((emp, i) => {
                  const isPerm = emp.contractType === 'دائم';
                  const isAbove60 = emp.age !== null && emp.age >= 60;

                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line, #f1f5f9)' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#0d9488' }}>{emp.code}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{emp.name}</td>
                      <td style={{ padding: '10px', color: '#64748b' }}>{emp.department || '—'}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: isAbove60 ? '#d97706' : '#334155' }}>
                        {emp.age ? `${emp.age} سنة` : '—'}
                      </td>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>{emp.contractType || '—'}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace' }}>{emp.startDate || '—'}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold' }}>{emp.endDate || '—'}</td>
                      <td style={{ padding: '10px' }}>
                        {emp.daysLeft !== null ? (
                          <span style={{ fontWeight: 'bold', color: emp.daysLeft < 0 ? '#dc2626' : emp.daysLeft <= 60 ? '#d97706' : '#15803d' }}>
                            {emp.daysLeft < 0 ? `منتهي (${Math.abs(emp.daysLeft)} يوم)` : `${emp.daysLeft} يوم`}
                          </span>
                        ) : (
                          isPerm ? <Stamp color="green">دائم 🛡️</Stamp> : '—'
                        )}
                      </td>

                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        {emp.hasPendingRenewal ? (
                          <span style={{ background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px' }}>
                            قيد التجديد ⏳
                          </span>
                        ) : (
                          <button
                            onClick={() => handleOpenRenewalModal(emp)}
                            style={{
                              background: isPerm ? '#d97706' : '#0d9488',
                              color: '#fff',
                              border: 0,
                              padding: '6px 12px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: 'pointer'
                            }}
                          >
                            {isPerm ? 'تحويل لعقد فوق السن 🔄' : 'إنشاء طلب تجديد ✍️'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ✍️ نافذة إنشاء طلب التجديد والتحويل التعاقدي */}
      {showRenewalModal && selectedEmp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="db-card" style={{ width: '550px', background: 'var(--paper-card, #fff)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>
                ✍️ إنشاء طلب تجديد / تحويل عقد
              </h3>
              <button onClick={() => setShowRenewalModal(false)} style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
            </div>

            <form onSubmit={handleSaveRenewalRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                <div><strong>الموظف:</strong> {selectedEmp.name} (<span style={{ color: '#0d9488' }}>{selectedEmp.code}</span>)</div>
                <div><strong>الإدارة:</strong> {selectedEmp.department || '—'} | <strong>السن الحالي:</strong> {selectedEmp.age ? `${selectedEmp.age} سنة` : '—'}</div>
                <div><strong>نوع العقد الحالي:</strong> {selectedEmp.contractType || '—'}</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>نوع العقد الجديد:</label>
                <select
                  value={renewalType}
                  onChange={e => setRenewalType(e.target.value)}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}
                >
                  <option value="محدد المدة">محدد المدة (سنوي)</option>
                  <option value="محدد المدة - فوق السن">محدد المدة - فوق السن (تقاعد/60+)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>مدة التجديد بالشهور:</label>
                <select
                  value={renewalMonths}
                  onChange={e => handleMonthsOrDateChange(Number(e.target.value), newStartDate)}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}
                >
                  <option value={6}>6 أشهر</option>
                  <option value={12}>12 شهر (سنة كاملة)</option>
                  <option value={24}>24 شهر (سنتان)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>تاريخ بداية العقد الجديد:</label>
                  <input
                    type="date"
                    required
                    value={newStartDate}
                    onChange={e => handleMonthsOrDateChange(renewalMonths, e.target.value)}
                    style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>تاريخ نهاية العقد الجديد:</label>
                  <input
                    type="date"
                    required
                    value={newEndDate}
                    onChange={e => setNewEndDate(e.target.value)}
                    style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                <button type="button" onClick={() => setShowRenewalModal(false)} style={{ background: 'transparent', border: '1px solid #e2e8f0', padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={saving} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '9px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'جاري إرسال الطلب...' : 'تأكيد وإرسال طلب التجديد 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
