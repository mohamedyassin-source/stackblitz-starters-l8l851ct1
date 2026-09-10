'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

const parseDateParts = (dateStr: string | null | undefined) => {
  if (!dateStr) return null;
  const clean = String(dateStr).split('T')[0].split(' ')[0].trim();
  const parts = clean.split('-');
  if (parts.length < 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month, day, clean };
};

const isValidYear = (dateStr: string | null | undefined) => {
  const parsed = parseDateParts(dateStr);
  return parsed ? parsed.year >= 2000 && parsed.year <= 2099 : false;
};

const calculateNewStartDate = (oldEndDateStr: string | null | undefined) => {
  const parsed = parseDateParts(oldEndDateStr);
  if (!parsed) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const d = new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0);
  d.setDate(d.getDate() + 1);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const calculateNewEndDateFromStart = (startDateStr: string | null | undefined, monthsToAdd: number) => {
  const parsed = parseDateParts(startDateStr);
  if (!parsed) return null;

  const d = new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0);
  d.setMonth(d.getMonth() + monthsToAdd);
  d.setDate(d.getDate() - 1);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function RenewalsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [approvalModal, setApprovalModal] = useState<{ isOpen: boolean; type: 'single' | 'bulk'; req?: any }>({ isOpen: false, type: 'single' });
  const [confirmedMonths, setConfirmedMonths] = useState<number>(12);

  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // جلب الطلبات من Neon PostgreSQL
  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/renewals');
      const json = await res.json();
      if (json.success) {
        setRequests(json.requests || []);
      }
    } catch (error: any) {
      console.error('Error fetching requests from Neon:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab]);

  useEffect(() => {
    if (approvalModal.isOpen && approvalModal.type === 'single' && approvalModal.req) {
      const start = calculateNewStartDate(approvalModal.req.contract_end_date) || '';
      const end = calculateNewEndDateFromStart(start, confirmedMonths) || '';
      setCustomStartDate(start);
      setCustomEndDate(end);
    }
  }, [approvalModal, confirmedMonths]);

  const getDaysRemaining = (endDateStr: string) => {
    const parsed = parseDateParts(endDateStr);
    if (!parsed) return null;
    const end = new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const deptsList = Array.from(new Set(requests.map((r: any) => r.department).filter(Boolean)));
  const compsList = Array.from(new Set(requests.map((r: any) => r.company).filter(Boolean)));

  const filteredRequests = requests.filter((req: any) => {
    if (activeTab !== 'All' && req.status !== activeTab) return false;
    const term = searchTerm.toLowerCase();
    const matchesSearch = !term || String(req.employee_code).toLowerCase().includes(term) || String(req.employee_name).toLowerCase().includes(term) || String(req.request_id).toLowerCase().includes(term);
    const matchesDept = !selectedDept || req.department === selectedDept;
    const matchesComp = !selectedCompany || req.company === selectedCompany;

    let matchesMonth = true;
    if (selectedMonth) {
      const newStart = calculateNewStartDate(req.contract_end_date);
      matchesMonth = newStart ? newStart.startsWith(selectedMonth) : false;
    }

    return matchesSearch && matchesDept && matchesComp && matchesMonth;
  });

  const sortedRequests = [...filteredRequests].sort((a: any, b: any) => {
    const daysA = getDaysRemaining(a.contract_end_date);
    const daysB = getDaysRemaining(b.contract_end_date);
    if (daysA === null) return 1;
    if (daysB === null) return -1;
    return daysA - daysB;
  });

  const countPending = requests.filter((r: any) => r.status === 'Pending').length;
  const countApproved = requests.filter((r: any) => r.status === 'Approved').length;
  const countRejected = requests.filter((r: any) => r.status === 'Rejected').length;
  const countAll = requests.length;

  // اعتماد الطلبات عبر Neon API
  const handleConfirmApproval = async () => {
    setActionLoading(true);
    try {
      const reqsToApprove = approvalModal.type === 'single' && approvalModal.req 
        ? [approvalModal.req.request_id] 
        : selectedIds;

      const res = await fetch('/api/renewals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          request_ids: reqsToApprove,
          confirmed_months: confirmedMonths,
          custom_start_date: customStartDate,
          custom_end_date: customEndDate,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setSelectedIds([]);
        setApprovalModal({ isOpen: false, type: 'single' });
        fetchRequests();
      } else {
        alert('خطأ: ' + data.error);
      }
    } catch (err: any) {
      alert('حدث خطأ أثناء الاعتماد: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // حذف الطلب
  const handleDeleteRequest = async (requestId: string) => {
    const confirmDelete = window.confirm('هل أنت متأكد من حذف هذا الطلب نهائياً من النظام؟');
    if (!confirmDelete) return;

    setActionLoading(true);
    try {
      const res = await fetch('/api/renewals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', request_id: requestId }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setApprovalModal({ isOpen: false, type: 'single' });
        fetchRequests();
      } else {
        alert('خطأ: ' + data.error);
      }
    } catch (err: any) {
      alert('حدث خطأ أثناء الحذف: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // رفض الطلب
  const handleReject = async (requestId: string) => {
    const confirmReject = window.confirm('هل أنت متأكد من رفض هذا الطلب نهائياً؟');
    if (!confirmReject) return;

    setActionLoading(true);
    try {
      const res = await fetch('/api/renewals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', request_id: requestId }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchRequests();
      } else {
        alert('خطأ: ' + data.error);
      }
    } catch (err: any) {
      alert('حدث خطأ أثناء رفض الطلب: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // تصدير للإكسيل
  const handleExportApprovedToExcel = async () => {
    if (selectedIds.length === 0) return alert('يرجى تحديد طلبات أولاً.');

    const selectedReqs = requests.filter((r: any) => selectedIds.includes(r.request_id) && r.status === 'Approved');

    if (selectedReqs.length === 0) {
      return alert('⚠️ يرجى التأكد من تحديد طلبات معتمدة فقط من الجدول.');
    }

    const exportData = selectedReqs.map((req: any) => {
      const newStart = calculateNewStartDate(req.contract_end_date);

      return {
        'رقم الطلب': req.request_id,
        'كود الموظف': req.employee_code,
        'اسم الموظف': req.employee_name,
        'الإدارة': req.department || '—',
        'الوظيفة': req.job_title || '—',
        'الشركة': req.company || '—',
        'تاريخ نهاية العقد القديم': req.contract_end_date || '—',
        'تاريخ بداية العقد الجديد': newStart,
        'مدة التجديد (شهور)': req.renewal_months || 12,
        'تاريخ نهاية العقد الجديد': req.new_contract_end_date || calculateNewEndDateFromStart(newStart, req.renewal_months || 12),
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'عقود التجديد المعتمدة');
    XLSX.writeFile(wb, `كشف_عقود_التجديد_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const selectableIds = sortedRequests.filter((r: any) => r.status === activeTab).map((r: any) => r.request_id);
      setSelectedIds(selectableIds);
    } else {
      setSelectedIds([]);
    }
  };

  return (
    <div style={{ paddingBottom: '40px', direction: 'rtl' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--navy-950, #0f172a)' }}>طلبات التجديد (Neon DB)</h3>
            <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--muted, #64748b)' }}>دورة الاعتماد وإدارة العقود قيد المعالجة عبر Neon PostgreSQL</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {activeTab === 'Pending' && (
              <button onClick={() => {
                if (selectedIds.length === 0) return alert('يرجى تحديد طلب واحد على الأقل من الجدول.');
                setApprovalModal({ isOpen: true, type: 'bulk' });
              }} disabled={selectedIds.length === 0 || actionLoading} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer', opacity: selectedIds.length === 0 ? 0.5 : 1 }}>
                ✅ اعتماد مجمع ({selectedIds.length})
              </button>
            )}

            {activeTab === 'Approved' && (
              <button onClick={handleExportApprovedToExcel} disabled={selectedIds.length === 0 || actionLoading} style={{ background: '#16a34a', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer', opacity: selectedIds.length === 0 ? 0.5 : 1 }}>
                {actionLoading ? 'جاري التجهيز...' : `📥 تصدير كشف عقود (${selectedIds.length})`}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <button onClick={() => setActiveTab('Pending')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'Pending' ? '2px solid #2563eb' : '1px solid #e2e8f0', background: activeTab === 'Pending' ? '#eff6ff' : '#fff', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>قيد المعالجة</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2563eb', marginTop: '4px' }}>{countPending}</div>
          </button>
          <button onClick={() => setActiveTab('Approved')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'Approved' ? '2px solid #16a34a' : '1px solid #e2e8f0', background: activeTab === 'Approved' ? '#f0fdf4' : '#fff', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>معتمدة (تنتظر التوقيع)</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#16a34a', marginTop: '4px' }}>{countApproved}</div>
          </button>
          <button onClick={() => setActiveTab('Rejected')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'Rejected' ? '2px solid #dc2626' : '1px solid #e2e8f0', background: activeTab === 'Rejected' ? '#fef2f2' : '#fff', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>مرفوضة</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626', marginTop: '4px' }}>{countRejected}</div>
          </button>
          <button onClick={() => setActiveTab('All')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'All' ? '2px solid #0f172a' : '1px solid #e2e8f0', background: activeTab === 'All' ? '#f8fafc' : '#fff', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>الجميع</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a', marginTop: '4px' }}>{countAll}</div>
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="بحث بالاسم أو الكود..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '10px', outline: 'none', width: '220px' }} />

          <input list="deptList" placeholder="الإدارة..." value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '10px', outline: 'none', width: '130px' }} />
          <datalist id="deptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>

          <input list="compList" placeholder="الشركة..." value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '10px', outline: 'none', width: '130px' }} />
          <datalist id="compList">{compsList.map((c: any, i) => <option key={i} value={c} />)}</datalist>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', marginLeft: '6px' }}>شهر البداية:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '10px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }}
            />
          </div>

          <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedCompany(''); setSelectedMonth(''); }} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>

          <div style={{ flex: 1, textAlign: 'left', fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>معروض: <span style={{ color: '#0f172a' }}>{sortedRequests.length}</span> طلب</div>
        </div>

        <div className="table-responsive" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>جاري تحميل الطلبات وترتيبها من Neon PostgreSQL...</div>
          ) : (
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '10.5px', whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'center', width: '30px' }}>
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={selectedIds.length > 0 && selectedIds.length === sortedRequests.filter((r: any) => r.status === activeTab).length}
                      disabled={activeTab === 'All' || activeTab === 'Rejected'}
                    />
                  </th>
                  <th style={{ padding: '10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>رقم الطلب</th>
                  <th style={{ padding: '10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>الكود</th>
                  <th style={{ padding: '10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>الموظف</th>
                  <th style={{ padding: '10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>الإدارة</th>
                  <th style={{ padding: '10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>انتهاء العقد</th>
                  <th style={{ padding: '10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>المتبقي</th>
                  <th style={{ padding: '10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>التجديد</th>
                  <th style={{ padding: '10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>الطلب</th>
                  <th style={{ padding: '10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>التوقيع</th>
                  <th style={{ padding: '10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'center' }}>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {sortedRequests.length === 0 ? (
                  <tr><td colSpan={11} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>لا توجد طلبات مطابقة.</td></tr>
                ) : sortedRequests.map((req: any) => {
                  const days = getDaysRemaining(req.contract_end_date);
                  return (
                    <tr key={req.request_id} style={{ borderBottom: '1px solid #e2e8f0', background: selectedIds.includes(req.request_id) ? '#f8fafc' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          disabled={req.status === 'Rejected'}
                          checked={selectedIds.includes(req.request_id)}
                          onChange={e => setSelectedIds(e.target.checked ? [...selectedIds, req.request_id] : selectedIds.filter(id => id !== req.request_id))}
                        />
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#64748b' }}>{req.request_id}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#0d9488' }}>{req.employee_code}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{req.employee_name}</td>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>{req.department || '—'}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 'bold' }}>{req.contract_end_date || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {days !== null ? (
                          <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', background: days < 0 ? '#fef2f2' : days <= 60 ? '#fffbe1' : '#f0fdf4', color: days < 0 ? '#dc2626' : days <= 60 ? '#b45309' : '#16a34a' }}>
                            {days < 0 ? `منتهي (${Math.abs(days)})` : `${days} يوم`}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{req.renewal_months || 12} ش</td>
                      <td style={{ padding: '8px 10px' }}>
                        {req.status === 'Approved' && <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>معتمد</span>}
                        {req.status === 'Pending' && <span style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>قيد المعالجة</span>}
                        {req.status === 'Rejected' && <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>مرفوض</span>}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 'bold', fontSize: '9px', color: req.signature_status === 'تم التوقيع' ? '#16a34a' : '#64748b' }}>
                        {req.signature_status || '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        {req.status === 'Pending' ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button onClick={() => { setApprovalModal({ isOpen: true, type: 'single', req }); setConfirmedMonths(req.renewal_months || 12); }} style={{ background: '#16a34a', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>اعتماد ✅</button>
                            <button onClick={() => handleReject(req.request_id)} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>رفض ❌</button>
                            <button onClick={() => handleDeleteRequest(req.request_id)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>حذف 🗑️</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                            <span style={{ fontSize: '9px', color: '#64748b' }}>— تمت المعالجة —</span>
                            <button onClick={() => handleDeleteRequest(req.request_id)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '2px 6px', borderRadius: '4px', fontSize: '8.5px', fontWeight: 'bold', cursor: 'pointer' }}>حذف 🗑️</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {approvalModal.isOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
            <div style={{ width: '420px', background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', color: '#16a34a' }}>
                  {approvalModal.type === 'single' ? `اعتماد طلب تجديد: ${approvalModal.req?.employee_name}` : `اعتماد مجمع لعدد (${selectedIds.length}) طلب`}
                </h3>
                {approvalModal.type === 'single' && approvalModal.req && (
                  <button
                    onClick={() => handleDeleteRequest(approvalModal.req.request_id)}
                    style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    حذف الطلب 🗑️
                  </button>
                )}
              </div>

              <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '16px', lineHeight: '1.6' }}>
                سيتم اعتماد الطلب وتحديث تاريخ نهاية وبداية العقد للموظف مباشرة. ويمكنك تعديل التواريخ يدوياً قبل الاعتماد.
              </p>

              {approvalModal.type === 'single' && approvalModal.req && (
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '11px', color: '#0f172a', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ marginBottom: '2px' }}><strong>تاريخ النهاية القديم:</strong> {approvalModal.req.contract_end_date || 'غير مسجل'}</div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', color: '#16a34a', fontWeight: 'bold' }}>تاريخ البداية الجديد (قابل للتعديل):</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={e => setCustomStartDate(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', color: '#16a34a', fontWeight: 'bold' }}>تاريخ النهاية المتوقع (قابل للتعديل):</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={e => setCustomEndDate(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>المدة المعتمدة للتجديد بالشهور (تلقائي):</label>
                <select value={confirmedMonths} onChange={e => setConfirmedMonths(Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', fontWeight: 'bold' }}>
                  <option value={1}>شهر واحد (1)</option>
                  <option value={2}>شهران (2)</option>
                  <option value={3}>3 شهور (ربع سنوي)</option>
                  <option value={6}>6 شهور (نصف سنوي)</option>
                  <option value={9}>9 شهور</option>
                  <option value={12}>12 شهر (سنة كاملة)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={() => setApprovalModal({ isOpen: false, type: 'single' })} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', color: '#0f172a' }}>إلغاء</button>
                <button onClick={handleConfirmApproval} disabled={actionLoading} style={{ background: '#16a34a', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.7 : 1 }}>
                  {actionLoading ? 'جاري الاعتماد...' : 'تأكيد الاعتماد ✅'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
