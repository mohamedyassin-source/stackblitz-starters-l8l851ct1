'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function RenewalsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // حالات Slicers
  const [activeTab, setActiveTab] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending');

  // حالات الفلاتر والتحديد
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // حالات نافذة الاعتماد
  const [approvalModal, setApprovalModal] = useState<{ isOpen: boolean, type: 'single' | 'bulk', req?: any }>({ isOpen: false, type: 'single' });
  const [confirmedMonths, setConfirmedMonths] = useState<number>(12);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('renewal_requests').select('*');
    if (error) console.error("Error fetching requests:", error.message);
    if (data) setRequests(data);
    setLoading(false);
  };

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const deptsList = Array.from(new Set(requests.map(r => r.department).filter(Boolean)));
  const compsList = Array.from(new Set(requests.map(r => r.company).filter(Boolean)));

  // الفلترة
  const filteredRequests = requests.filter(req => {
    if (activeTab !== 'All' && req.status !== activeTab) return false;
    const term = searchTerm.toLowerCase();
    const matchesSearch = !term || String(req.employee_code).toLowerCase().includes(term) || String(req.employee_name).toLowerCase().includes(term) || String(req.request_id).toLowerCase().includes(term);
    const matchesDept = !selectedDept || req.department === selectedDept;
    const matchesComp = !selectedCompany || req.company === selectedCompany;
    return matchesSearch && matchesDept && matchesComp;
  });

  // الترتيب الذكي (Sorting) بناءً على الأيام المتبقية
  const sortedRequests = [...filteredRequests].sort((a, b) => {
    const daysA = getDaysRemaining(a.contract_end_date);
    const daysB = getDaysRemaining(b.contract_end_date);
    if (daysA === null) return 1; 
    if (daysB === null) return -1;
    return daysA - daysB; 
  });

  const countPending = requests.filter(r => r.status === 'Pending').length;
  const countApproved = requests.filter(r => r.status === 'Approved').length;
  const countRejected = requests.filter(r => r.status === 'Rejected').length;
  const countAll = requests.length;

  // حساب تاريخ النهاية الجديد
  const calculateNewEndDate = (oldDateStr: string, monthsToAdd: number) => {
    if (!oldDateStr) return null;
    const date = new Date(oldDateStr);
    if (isNaN(date.getTime())) return null;
    date.setMonth(date.getMonth() + monthsToAdd);
    return date.toISOString().split('T')[0]; 
  };

  // حساب تاريخ البداية الجديد (اليوم التالي لانتهاء العقد القديم)
  const calculateNewStartDate = (oldDateStr: string) => {
    if (!oldDateStr) return null;
    const date = new Date(oldDateStr);
    if (isNaN(date.getTime())) return null;
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0]; 
  };

  // تنفيذ الاعتماد
  const handleConfirmApproval = async () => {
    setActionLoading(true);
    
    try {
      if (approvalModal.type === 'single' && approvalModal.req) {
        const req = approvalModal.req;
        const newEndDate = calculateNewEndDate(req.contract_end_date, confirmedMonths);
        const newStartDate = calculateNewStartDate(req.contract_end_date);

        // 1. تحديث حالة الطلب
        const { error: reqError } = await supabase.from('renewal_requests').update({
          status: 'Approved',
          signature_status: 'في انتظار توقيع الموظف',
          renewal_months: confirmedMonths,
          new_contract_end_date: newEndDate
        }).eq('request_id', req.request_id);

        if (reqError) throw reqError; // إجبار الكود على التوقف وإظهار الخطأ

        // 2. تحديث بيانات الموظف (البداية والنهاية)
        if (newEndDate && newStartDate) {
          const { error: empError } = await supabase.from('employees').update({ 
            contract_start_date: newStartDate,
            contract_end_date: newEndDate 
          }).eq('employee_code', req.employee_code);

          if (empError) throw empError;
        }

        alert(`تم اعتماد الطلب وتحديث العقد بنجاح: \n يبدأ في: ${newStartDate} \n ينتهي في: ${newEndDate} ✅`);
        
      } else if (approvalModal.type === 'bulk') {
        const reqsToApprove = requests.filter(r => selectedIds.includes(r.request_id));
        
        const updatePromises = reqsToApprove.map(async (req) => {
          const newEndDate = calculateNewEndDate(req.contract_end_date, confirmedMonths);
          const newStartDate = calculateNewStartDate(req.contract_end_date);
          
          const { error: reqError } = await supabase.from('renewal_requests').update({
            status: 'Approved',
            signature_status: 'في انتظار توقيع الموظف',
            renewal_months: confirmedMonths,
            new_contract_end_date: newEndDate
          }).eq('request_id', req.request_id);

          if (reqError) throw reqError;

          if (newEndDate && newStartDate) {
            const { error: empError } = await supabase.from('employees').update({ 
              contract_start_date: newStartDate,
              contract_end_date: newEndDate 
            }).eq('employee_code', req.employee_code);

            if (empError) throw empError;
          }
        });

        await Promise.all(updatePromises);
        alert(`تم اعتماد ${reqsToApprove.length} طلب تجديد وتحديث بيانات الموظفين بنجاح ✅`);
      }

      setSelectedIds([]);
      setApprovalModal({ isOpen: false, type: 'single' });
      await fetchRequests(); // جلب البيانات الجديدة

    } catch (err: any) {
      alert('حدث خطأ أثناء الاعتماد أو تحديث بيانات الموظف: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (requestId: string) => {
    const confirmReject = window.confirm('هل أنت متأكد من رفض هذا الطلب نهائياً؟');
    if (!confirmReject) return;
    
    setActionLoading(true);
    const { error } = await supabase.from('renewal_requests').update({
      status: 'Rejected',
      signature_status: 'مرفوض'
    }).eq('request_id', requestId);
    
    if (error) {
      alert('حدث خطأ أثناء رفض الطلب: ' + error.message);
    } else {
      alert('تم رفض الطلب بنجاح ❌');
      fetchRequests();
    }
    setActionLoading(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--navy-950)' }}>طلبات التجديد</h3>
          <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--muted)' }}>دورة الاعتماد وإدارة العقود قيد المعالجة لتوجيهها للتوقيع</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => alert("سيتم توجيهك لصفحة العقود لإنشاء طلب تجديد جديد.")} style={{ background: 'var(--paper-card)', color: 'var(--navy-950)', border: '1px solid var(--line)', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
            + إنشاء طلب جديد
          </button>
          <button onClick={() => {
            if (selectedIds.length === 0) return alert('يرجى تحديد طلب واحد على الأقل من الجدول.');
            setApprovalModal({ isOpen: true, type: 'bulk' });
          }} disabled={selectedIds.length === 0 || actionLoading} style={{ background: 'var(--brass-600)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer', opacity: selectedIds.length === 0 ? 0.5 : 1 }}>
            ✅ اعتماد مجمع ({selectedIds.length})
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <button onClick={() => setActiveTab('Pending')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'Pending' ? '2px solid #2563eb' : '1px solid var(--line)', background: activeTab === 'Pending' ? '#eff6ff' : '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>قيد المعالجة</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2563eb', marginTop: '4px' }}>{countPending}</div>
        </button>
        <button onClick={() => setActiveTab('Approved')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'Approved' ? '2px solid #15803d' : '1px solid var(--line)', background: activeTab === 'Approved' ? '#dcfce7' : '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>معتمدة (تنتظر التوقيع)</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#15803d', marginTop: '4px' }}>{countApproved}</div>
        </button>
        <button onClick={() => setActiveTab('Rejected')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'Rejected' ? '2px solid #dc2626' : '1px solid var(--line)', background: activeTab === 'Rejected' ? '#fef2f2' : '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>مرفوضة</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626', marginTop: '4px' }}>{countRejected}</div>
        </button>
        <button onClick={() => setActiveTab('All')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'All' ? '2px solid var(--navy-950)' : '1px solid var(--line)', background: activeTab === 'All' ? '#f8fafc' : '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>الجميع</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--navy-950)', marginTop: '4px' }}>{countAll}</div>
        </button>
      </div>

      <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="بحث بالاسم أو الكود..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none', width: '220px' }} />
        <input list="deptList" placeholder="الإدارة (اكتب للبحث)..." value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none', width: '160px' }} />
        <datalist id="deptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>
        <input list="compList" placeholder="الشركة (اكتب للبحث)..." value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none', width: '160px' }} />
        <datalist id="compList">{compsList.map((c: any, i) => <option key={i} value={c} />)}</datalist>
        <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedCompany(''); }} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>
        <div style={{ flex: 1, textAlign: 'left', fontSize: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>معروض: <span style={{ color: 'var(--navy-950)' }}>{sortedRequests.length}</span> طلب</div>
      </div>

      <div className="table-responsive" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', borderRadius: '8px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)' }}>جاري تحميل الطلبات وترتيبها...</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '10.5px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', textAlign: 'center', width: '30px' }}>
                  <input 
                    type="checkbox" 
                    onChange={e => {
                      const selectableIds = sortedRequests.filter(r => r.status === 'Pending').map(r => r.request_id);
                      setSelectedIds(e.target.checked ? selectableIds : []);
                    }} 
                    checked={selectedIds.length > 0 && selectedIds.length === sortedRequests.filter(r => r.status === 'Pending').length}
                    disabled={activeTab !== 'All' && activeTab !== 'Pending'} 
                  />
                </th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>رقم الطلب</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الكود</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الموظف</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الإدارة</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>انتهاء العقد</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>المتبقي</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>التجديد</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الطلب</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>التوقيع</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', textAlign: 'center' }}>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {sortedRequests.length === 0 ? (
                <tr><td colSpan={11} style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>لا توجد طلبات مطابقة.</td></tr>
              ) : sortedRequests.map((req) => {
                const days = getDaysRemaining(req.contract_end_date);
                return (
                  <tr key={req.request_id} style={{ borderBottom: '1px solid var(--line)', background: selectedIds.includes(req.request_id) ? '#f8fafc' : 'transparent' }}>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        disabled={req.status !== 'Pending'} 
                        checked={selectedIds.includes(req.request_id)} 
                        onChange={e => setSelectedIds(e.target.checked ? [...selectedIds, req.request_id] : selectedIds.filter(id => id !== req.request_id))} 
                      />
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: 'var(--muted)' }}>{req.request_id}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--brass-600)' }}>{req.employee_code}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{req.employee_name}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{req.department || '—'}</td>
                    
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 'bold' }}>{req.contract_end_date || '—'}</td>
                    
                    <td style={{ padding: '8px 10px' }}>
                      {days !== null ? (
                        <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', background: days < 0 ? '#fef2f2' : days <= 60 ? '#fff7ed' : '#dcfce7', color: days < 0 ? '#dc2626' : days <= 60 ? '#c2410c' : '#15803d' }}>
                          {days < 0 ? `منتهي (${Math.abs(days)})` : `${days} يوم`}
                        </span>
                      ) : '—'}
                    </td>

                    <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{req.renewal_months || 12} ش</td>
                    
                    <td style={{ padding: '8px 10px' }}>
                      {req.status === 'Approved' && <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>معتمد</span>}
                      {req.status === 'Pending' && <span style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>قيد المعالجة</span>}
                      {req.status === 'Rejected' && <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>مرفوض</span>}
                    </td>
                    
                    <td style={{ padding: '8px 10px', fontWeight: 'bold', fontSize: '9px', color: req.signature_status === 'تم التوقيع' ? '#15803d' : 'var(--muted)' }}>
                      {req.signature_status || '—'}
                    </td>
                    
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {req.status === 'Pending' ? (
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button onClick={() => { setApprovalModal({ isOpen: true, type: 'single', req }); setConfirmedMonths(req.renewal_months || 12); }} style={{ background: '#15803d', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>اعتماد ✅</button>
                          <button onClick={() => handleReject(req.request_id)} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>رفض ❌</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '9px', color: 'var(--muted)' }}>— تمت المعالجة —</span>
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
          <div style={{ width: '400px', background: 'var(--paper-card)', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: '#15803d' }}>
              {approvalModal.type === 'single' ? `اعتماد طلب تجديد: ${approvalModal.req?.employee_name}` : `اعتماد مجمع لعدد (${selectedIds.length}) طلب`}
            </h3>
            
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '16px', lineHeight: '1.6' }}>
              سيتم اعتماد الطلب وتحديث تاريخ نهاية وبداية العقد للموظف مباشرة. وسيتحول الطلب تلقائياً إلى السجلات "المعتمدة" لانتظار توقيع الموظف.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>المدة المعتمدة للتجديد:</label>
              <select value={confirmedMonths} onChange={e => setConfirmedMonths(Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', fontWeight: 'bold' }}>
                <option value={1}>شهر واحد (1)</option>
                <option value={2}>شهران (2)</option>
                <option value={3}>3 شهور (ربع سنوي)</option>
                <option value={6}>6 شهور (نصف سنوي)</option>
                <option value={9}>9 شهور</option>
                <option value={12}>12 شهر (سنة كاملة)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setApprovalModal({ isOpen: false, type: 'single' })} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', color: 'var(--ink)' }}>
                إلغاء
              </button>
              <button onClick={handleConfirmApproval} disabled={actionLoading} style={{ background: '#15803d', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.7 : 1 }}>
                {actionLoading ? 'جاري الاعتماد...' : 'تأكيد الاعتماد ✅'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
