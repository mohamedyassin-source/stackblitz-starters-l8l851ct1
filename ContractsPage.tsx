'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ContractsPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [expiryStatus, setExpiryStatus] = useState('');

  // حالات نافذة التجديد
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: 'single' | 'bulk';
    emp?: any;
  }>({ isOpen: false, type: 'single' });
  const [renewalMode, setRenewalMode] = useState<'months' | 'custom'>('months');
  const [renewalMonths, setRenewalMonths] = useState<number>(12);
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // 🌟 حالات نافذة إنشاء عقد جديد تماماً (من التاريخ إلى التاريخ)
  const [isNewContractModalOpen, setIsNewContractModalOpen] = useState(false);
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState('');
  const [newContractStartDate, setNewContractStartDate] = useState('');
  const [newContractEndDate, setNewContractEndDate] = useState('');
  const [newContractType, setNewContractType] = useState('محدد المدة');

  // حالة نموذج الـ PDF للطباعة
  const [createdRequestData, setCreatedRequestData] = useState<any>(null);

  useEffect(() => {
    const jumpCode = localStorage.getItem('jumpSearch');
    if (jumpCode) {
      setSearchTerm(jumpCode);
      setTimeout(() => localStorage.removeItem('jumpSearch'), 1000);
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    let allEmps: any[] = [];
    let allRens: any[] = [];
    let from = 0;
    const step = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      allEmps = [...allEmps, ...data];
      if (data.length < step) break;
      from += step;
    }

    from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('renewal_requests')
        .select('employee_code, status, signature_status, request_id')
        .range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      allRens = [...allRens, ...data];
      if (data.length < step) break;
      from += step;
    }

    setEmployees(allEmps);
    setRenewals(allRens);
    setLoading(false);
  };

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const calculateNewEndDate = (
    oldDateStr: string | undefined,
    months: number
  ) => {
    if (!oldDateStr) return '';
    const date = new Date(oldDateStr);
    if (isNaN(date.getTime())) return '';
    date.setMonth(date.getMonth() + months);
    return date.toISOString().split('T')[0];
  };

  const generateSequentialIds = (count: number) => {
    const currentYear = new Date().getFullYear();
    const yearPrefix = `RR-${currentYear}-`;
    const yearRenewals = renewals.filter(
      (r) => r.request_id && String(r.request_id).startsWith(yearPrefix)
    );

    let maxSeq = 0;
    yearRenewals.forEach((r) => {
      const parts = String(r.request_id).split('-');
      if (parts.length === 3) {
        const seq = parseInt(parts[2], 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });

    const newIds = [];
    for (let i = 0; i < count; i++) {
      maxSeq++;
      newIds.push(`${yearPrefix}${String(maxSeq).padStart(4, '0')}`);
    }
    return newIds;
  };

  const getRenewalStatusInfo = (empCode: string) => {
    const empRens = renewals
      .filter((r) => r.employee_code === empCode)
      .sort((a, b) => b.request_id.localeCompare(a.request_id));
    const latest = empRens[0];

    if (!latest)
      return { text: 'متاح للتجديد', color: 'var(--muted)', locked: false };
    if (latest.status === 'Pending')
      return { text: 'قيد المعالجة', color: '#2563eb', locked: true };
    if (
      latest.status === 'Approved' &&
      latest.signature_status !== 'تم التوقيع'
    )
      return { text: 'في انتظار التوقيع', color: '#ea580c', locked: true };
    if (
      latest.status === 'Approved' &&
      latest.signature_status === 'تم التوقيع'
    )
      return { text: 'تم توقيع العقد ✅', color: '#15803d', locked: false };
    if (latest.status === 'Rejected')
      return { text: 'الطلب الأخير مرفوض ❌', color: '#dc2626', locked: false };
    return { text: 'متاح للتجديد', color: 'var(--muted)', locked: false };
  };

  const deptsList = Array.from(
    new Set(employees.map((e) => e.department).filter(Boolean))
  );

  const filteredContracts = employees.filter((emp) => {
    const term = searchTerm.toLowerCase();
    const days = getDaysRemaining(emp.contract_end_date);
    const matchesSearch =
      !term ||
      String(emp.employee_code).toLowerCase().includes(term) ||
      String(emp.employee_name).toLowerCase().includes(term) ||
      String(emp.department).toLowerCase().includes(term);
    const matchesDept = !selectedDept || emp.department === selectedDept;
    const matchesType = !selectedType || emp.contract_type === selectedType;
    let matchesExpiry = true;
    if (expiryStatus === 'expiring_60')
      matchesExpiry = days !== null && days <= 60 && days >= 0;
    if (expiryStatus === 'expired') matchesExpiry = days !== null && days < 0;
    return matchesSearch && matchesDept && matchesType && matchesExpiry;
  });

  const sortedContracts = [...filteredContracts].sort((a, b) => {
    const daysA = getDaysRemaining(a.contract_end_date);
    const daysB = getDaysRemaining(b.contract_end_date);
    if (daysA === null) return 1;
    if (daysB === null) return -1;
    return daysA - daysB;
  });

  const openSingleRenewal = (emp: any) => {
    setRenewalMode('months');
    setCustomEndDate('');
    setModalState({ isOpen: true, type: 'single', emp });
  };

  // 🌟 دالة حفظ طلب العقد الجديد تماماً (من بداية لنهاية)
  const handleCreateBrandNewContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeCode || !newContractStartDate || !newContractEndDate) {
      return alert(
        'يرجى استكمال جميع البيانات (الموظف، بداية العقد، ونهاية العقد).'
      );
    }

    if (new Date(newContractEndDate) <= new Date(newContractStartDate)) {
      return alert('تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية.');
    }

    setActionLoading(true);

    const emp = employees.find((e) => e.employee_code === selectedEmployeeCode);
    const [reqId] = generateSequentialIds(1);

    const payload: any = {
      request_id: reqId,
      employee_code: emp.employee_code,
      employee_name: emp.employee_name,
      department: emp.department,
      job_title: emp.job_title,
      company: emp.company,
      contract_end_date: newContractStartDate, // تاريخ بداية العقد الجديد
      new_contract_end_date: newContractEndDate, // تاريخ نهاية العقد الجديد
      status: 'Pending',
      signature_status: 'قيد التوقيع',
      request_date: new Date().toISOString().split('T')[0],
    };
    if (emp.id) payload.employee_id = emp.id;

    // 1. إضافة طلب التجديد/العقد الجديد
    const { error: reqError } = await supabase
      .from('renewal_requests')
      .insert([payload]);

    if (reqError) {
      setActionLoading(false);
      return alert('حدث خطأ أثناء حفظ العقد: ' + reqError.message);
    }

    // 2. تحديث بيانات الموظف بتاريخ الانتهاء الجديد ونوع العقد
    await supabase
      .from('employees')
      .update({
        contract_type: newContractType,
        contract_end_date: newContractEndDate,
      })
      .eq('employee_code', emp.employee_code);

    setActionLoading(false);
    setIsNewContractModalOpen(false);

    // فتح نموذج الـ PDF للطباعة
    setCreatedRequestData(payload);
    fetchData();
  };

  const confirmRenewalAction = async () => {
    if (renewalMode === 'custom' && !customEndDate) {
      return alert('يرجى إدخال تاريخ الانتهاء المخصص.');
    }

    setActionLoading(true);

    if (modalState.type === 'single' && modalState.emp) {
      const emp = modalState.emp;
      const targetEndDate =
        renewalMode === 'months'
          ? calculateNewEndDate(emp.contract_end_date, renewalMonths)
          : customEndDate;

      const [reqId] = generateSequentialIds(1);
      const payload: any = {
        request_id: reqId,
        employee_code: emp.employee_code,
        employee_name: emp.employee_name,
        department: emp.department,
        job_title: emp.job_title,
        company: emp.company,
        contract_end_date: emp.contract_end_date,
        new_contract_end_date: targetEndDate,
        renewal_months: renewalMode === 'months' ? renewalMonths : null,
        status: 'Pending',
        signature_status: 'قيد التوقيع',
        request_date: new Date().toISOString().split('T')[0],
      };
      if (emp.id) payload.employee_id = emp.id;

      const { error } = await supabase
        .from('renewal_requests')
        .insert([payload]);
      setActionLoading(false);
      setModalState({ isOpen: false, type: 'single' });

      if (error) alert('خطأ: ' + error.message);
      else {
        setCreatedRequestData(payload);
        fetchData();
      }
    }
  };

  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #pdf-print-area, #pdf-print-area * { visibility: visible; }
          #pdf-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
            direction: rtl;
            background: #fff !important;
            color: #000 !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--navy-950)' }}>
            العقود الحالية السارية
          </h3>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '10px',
              color: 'var(--muted)',
            }}
          >
            إدارة العقود وإنشاء طلبات التجديد أو العقود الجديدة كلياً
          </p>
        </div>

        {/* 🌟 زرار فتح نافذة إنشاء عقد جديد تماماً */}
        <button
          onClick={() => {
            setSelectedEmployeeCode('');
            setNewContractStartDate(new Date().toISOString().split('T')[0]);
            setNewContractEndDate('');
            setIsNewContractModalOpen(true);
          }}
          style={{
            background: 'var(--navy-950)',
            color: '#fff',
            border: 0,
            padding: '10px 18px',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '11px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          📄 طلب إنشاء عقد جديد تماماً
        </button>
      </div>

      {/* شريط الفلاتر */}
      <div
        className="no-print"
        style={{
          background: '#fff',
          border: '1px solid var(--line)',
          padding: '10px 12px',
          borderRadius: '8px',
          marginBottom: '12px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          placeholder="بحث بالاسم، الكود، الإدارة..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid var(--line)',
            fontSize: '10px',
            outline: 'none',
            width: '220px',
          }}
        />
        <select
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid var(--line)',
            fontSize: '10px',
            outline: 'none',
          }}
        >
          <option value="">كل الإدارات</option>
          {deptsList.map((d: any, i) => (
            <option key={i} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setSearchTerm('');
            setSelectedDept('');
            setSelectedType('');
            setExpiryStatus('');
          }}
          style={{
            background: '#f1f5f9',
            border: '1px solid var(--line)',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '10px',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          إعادة ضبط
        </button>
      </div>

      {/* الجدول */}
      <div
        className="no-print table-responsive"
        style={{
          background: '#fff',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          overflowX: 'auto',
        }}
      >
        {loading ? (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              fontSize: '11px',
              fontWeight: 'bold',
              color: 'var(--muted)',
            }}
          >
            جاري سحب البيانات...
          </div>
        ) : (
          <table
            className="data-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'right',
              fontSize: '10.5px',
              whiteSpace: 'nowrap',
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    padding: '10px',
                    background: '#f8fafc',
                    borderBottom: '1px solid var(--line)',
                    color: '#475569',
                  }}
                >
                  الكود
                </th>
                <th
                  style={{
                    padding: '10px',
                    background: '#f8fafc',
                    borderBottom: '1px solid var(--line)',
                    color: '#475569',
                  }}
                >
                  الموظف
                </th>
                <th
                  style={{
                    padding: '10px',
                    background: '#f8fafc',
                    borderBottom: '1px solid var(--line)',
                    color: '#475569',
                  }}
                >
                  الإدارة
                </th>
                <th
                  style={{
                    padding: '10px',
                    background: '#f8fafc',
                    borderBottom: '1px solid var(--line)',
                    color: '#475569',
                  }}
                >
                  الوظيفة
                </th>
                <th
                  style={{
                    padding: '10px',
                    background: '#f8fafc',
                    borderBottom: '1px solid var(--line)',
                    color: '#475569',
                  }}
                >
                  نوع العقد
                </th>
                <th
                  style={{
                    padding: '10px',
                    background: '#f8fafc',
                    borderBottom: '1px solid var(--line)',
                    color: '#475569',
                  }}
                >
                  تاريخ الانتهاء
                </th>
                <th
                  style={{
                    padding: '10px',
                    background: '#f8fafc',
                    borderBottom: '1px solid var(--line)',
                    color: '#475569',
                  }}
                >
                  حالة التجديد
                </th>
                <th
                  style={{
                    padding: '10px',
                    background: '#f8fafc',
                    borderBottom: '1px solid var(--line)',
                    color: '#475569',
                    textAlign: 'center',
                  }}
                >
                  إجراء
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedContracts.map((emp) => {
                const statusInfo = getRenewalStatusInfo(emp.employee_code);
                return (
                  <tr
                    key={emp.employee_code}
                    style={{ borderBottom: '1px solid #f1f5f9' }}
                  >
                    <td
                      style={{
                        padding: '8px 10px',
                        fontWeight: 'bold',
                        fontFamily: 'monospace',
                        color: 'var(--brass-600)',
                      }}
                    >
                      {emp.employee_code}
                    </td>
                    <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>
                      {emp.employee_name}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>
                      {emp.department || '—'}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>
                      {emp.job_title || '—'}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        fontWeight: 'bold',
                        color: '#2563eb',
                      }}
                    >
                      {emp.contract_type || 'محدد المدة'}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        fontFamily: 'monospace',
                        fontWeight: 'bold',
                      }}
                    >
                      {emp.contract_end_date || '—'}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        fontWeight: 'bold',
                        fontSize: '9px',
                      }}
                    >
                      <span style={{ color: statusInfo.color }}>
                        {statusInfo.text}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <button
                        onClick={() => openSingleRenewal(emp)}
                        disabled={statusInfo.locked || actionLoading}
                        style={{
                          background: statusInfo.locked
                            ? '#e2e8f0'
                            : 'var(--brass-600)',
                          color: statusInfo.locked ? '#94a3b8' : '#fff',
                          border: 0,
                          padding: '5px 12px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          cursor:
                            statusInfo.locked || actionLoading
                              ? 'not-allowed'
                              : 'pointer',
                        }}
                      >
                        + تمديد/تجديد
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ========================================================= */}
      {/* 🌟 🆕 النافذة المنبثقة لإنشاء عقد جديد تماماً (من تاريخ إلى تاريخ) */}
      {/* ========================================================= */}
      {isNewContractModalOpen && (
        <div
          className="no-print"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            style={{
              width: '520px',
              background: '#fff',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
                marginBottom: '20px',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '16px',
                  color: 'var(--navy-950)',
                  fontWeight: '800',
                }}
              >
                📝 طلب إنشاء عقد جديد كلياً
              </h3>
              <button
                onClick={() => setIsNewContractModalOpen(false)}
                style={{
                  background: '#fef2f2',
                  border: 0,
                  color: '#dc2626',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                إغلاق ✕
              </button>
            </div>

            <form onSubmit={handleCreateBrandNewContract}>
              {/* اختار الموظف */}
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    color: 'var(--muted)',
                    marginBottom: '6px',
                    fontWeight: 'bold',
                  }}
                >
                  اختر الموظف *
                </label>
                <select
                  required
                  value={selectedEmployeeCode}
                  onChange={(e) => setSelectedEmployeeCode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    fontSize: '12px',
                    outline: 'none',
                    fontWeight: 'bold',
                    background: '#f8fafc',
                  }}
                >
                  <option value="">-- اضغط لاختيار الموظف من القائمة --</option>
                  {employees.map((emp) => (
                    <option key={emp.employee_code} value={emp.employee_code}>
                      {emp.employee_name} ({emp.employee_code}) -{' '}
                      {emp.department || 'بدون قسم'}
                    </option>
                  ))}
                </select>
              </div>

              {/* نوع العقد */}
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    color: 'var(--muted)',
                    marginBottom: '6px',
                    fontWeight: 'bold',
                  }}
                >
                  نوع العقد
                </label>
                <select
                  value={newContractType}
                  onChange={(e) => setNewContractType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    fontSize: '12px',
                    outline: 'none',
                    fontWeight: 'bold',
                    background: '#f8fafc',
                  }}
                >
                  <option value="محدد المدة">محدد المدة</option>
                  <option value="محدد المدة - فوق السن">
                    محدد المدة - فوق السن
                  </option>
                  <option value="مهمة/مشروع">عقد مشروع/مهمة محدودة</option>
                </select>
              </div>

              {/* تاريخ البداية والنهاية */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                  marginBottom: '24px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      color: 'var(--muted)',
                      marginBottom: '6px',
                      fontWeight: 'bold',
                    }}
                  >
                    تاريخ بداية العقد *
                  </label>
                  <input
                    type="date"
                    required
                    value={newContractStartDate}
                    onChange={(e) => setNewContractStartDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      fontSize: '12px',
                      outline: 'none',
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      color: 'var(--muted)',
                      marginBottom: '6px',
                      fontWeight: 'bold',
                    }}
                  >
                    تاريخ نهاية العقد *
                  </label>
                  <input
                    type="date"
                    required
                    value={newContractEndDate}
                    onChange={(e) => setNewContractEndDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      fontSize: '12px',
                      outline: 'none',
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              </div>

              {/* زراير الإجراءات */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsNewContractModalOpen(false)}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid var(--line)',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{
                    background: 'var(--navy-950)',
                    color: '#fff',
                    border: 0,
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {actionLoading
                    ? 'جاري الحفظ...'
                    : 'إنشاء العقد وتجهيز PDF 📄'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Form تمديد عقد موجود */}
      {modalState.isOpen && (
        <div
          className="no-print"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div
            style={{
              width: '450px',
              background: '#fff',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px',
                fontSize: '16px',
                color: 'var(--navy-950)',
              }}
            >
              تجديد عقد لـ ({modalState.emp?.employee_name})
            </h3>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  color: 'var(--muted)',
                  marginBottom: '8px',
                  fontWeight: 'bold',
                }}
              >
                اختر مدة التجديد المطلوبة:
              </label>
              <select
                value={renewalMonths}
                onChange={(e) => setRenewalMonths(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  fontSize: '13px',
                  outline: 'none',
                  fontWeight: 'bold',
                }}
              >
                <option value={3}>3 شهور (ربع سنوي)</option>
                <option value={6}>6 شهور (نصف سنوي)</option>
                <option value={12}>12 شهر (سنة كاملة)</option>
              </select>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                onClick={() => setModalState({ isOpen: false, type: 'single' })}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid var(--line)',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                إلغاء
              </button>
              <button
                onClick={confirmRenewalAction}
                disabled={actionLoading}
                style={{
                  background: 'var(--brass-600)',
                  color: '#fff',
                  border: 0,
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {actionLoading ? 'جاري الإنشاء...' : 'حفظ وإنشاء نموذج PDF 📄'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 📜 النافذة المنبثقة للنموذج الـ PDF الجاهز للطباعة */}
      {createdRequestData && (
        <div
          className="no-print"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              width: '750px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16px', color: '#15803d' }}>
                🎉 تم إنشاء العقد بنجاح! معاينة نموذج الـ PDF
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handlePrintPDF}
                  style={{
                    background: '#15803d',
                    color: '#fff',
                    border: 0,
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  🖨️ طباعة / حفظ كـ PDF
                </button>
                <button
                  onClick={() => setCreatedRequestData(null)}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  إغلاق
                </button>
              </div>
            </div>

            {/* النموذج المجهز للطباعة */}
            <div
              id="pdf-print-area"
              style={{
                border: '2px solid #0f172a',
                padding: '30px',
                borderRadius: '8px',
                background: '#fff',
                direction: 'rtl',
                fontFamily: 'serif',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '2px solid #b8934a',
                  paddingBottom: '16px',
                  marginBottom: '20px',
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '20px',
                      color: '#0f172a',
                      fontWeight: '900',
                    }}
                  >
                    مجموعة شركات المراسم الدولية
                  </h2>
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: '12px',
                      color: '#64748b',
                    }}
                  >
                    قطاع الموارد البشرية والشؤون الإدارية
                  </p>
                </div>
                <div
                  style={{
                    textAlign: 'left',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                  }}
                >
                  <div>
                    رقم العقد/الطلب:{' '}
                    <strong>{createdRequestData.request_id}</strong>
                  </div>
                  <div>
                    التاريخ: <strong>{createdRequestData.request_date}</strong>
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'center', margin: '20px 0' }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '18px',
                    textDecoration: 'underline',
                    color: '#0f172a',
                  }}
                >
                  نموذج عقد عمل محدد المدة
                </h3>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                  fontSize: '13px',
                  lineHeight: '2.2',
                  marginBottom: '24px',
                }}
              >
                <div>
                  اسم الموظف:{' '}
                  <strong>{createdRequestData.employee_name}</strong>
                </div>
                <div>
                  كود الموظف:{' '}
                  <strong style={{ fontFamily: 'monospace' }}>
                    {createdRequestData.employee_code}
                  </strong>
                </div>
                <div>
                  الإدارة / القسم:{' '}
                  <strong>{createdRequestData.department || '—'}</strong>
                </div>
                <div>
                  المسمى الوظيفي:{' '}
                  <strong>{createdRequestData.job_title || '—'}</strong>
                </div>
                <div>
                  تاريخ بداية العقد:{' '}
                  <strong style={{ fontFamily: 'monospace' }}>
                    {createdRequestData.contract_end_date}
                  </strong>
                </div>
                <div>
                  تاريخ نهاية العقد:{' '}
                  <strong style={{ fontFamily: 'monospace' }}>
                    {createdRequestData.new_contract_end_date}
                  </strong>
                </div>
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  padding: '12px',
                  borderRight: '4px solid #b8934a',
                  fontSize: '12px',
                  marginBottom: '30px',
                }}
              >
                <strong>القرار والتعهد:</strong> يتعهد الطرفان بالالتزام بكافة
                بنود لائحة العمل الداخلية المعتمدة بالشركة، ويسري هذا العقد
                اعتباراً من تاريخ البداية وحتى تاريخ النهاية الموضحين أعلاه.
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '20px',
                  marginTop: '50px',
                  textAlign: 'center',
                  fontSize: '12px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 'bold', marginBottom: '40px' }}>
                    توقيع الموظف
                  </div>
                  <div>التوقيع: .....................</div>
                </div>
                <div>
                  <div style={{ fontWeight: 'bold', marginBottom: '40px' }}>
                    مراجعة الموارد البشرية
                  </div>
                  <div>التوقيع: .....................</div>
                </div>
                <div>
                  <div style={{ fontWeight: 'bold', marginBottom: '40px' }}>
                    اعتماد إدارة الشركة
                  </div>
                  <div>التوقيع: .....................</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
