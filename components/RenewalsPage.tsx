'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { useAppData } from '@/lib/DataContext';

const calculateNewStartDate = (oldEndDateStr: string | null | undefined) => {
  if (!oldEndDateStr) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  
  const parts = String(oldEndDateStr).split('-');
  if (parts.length < 3) return oldEndDateStr;
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const d = new Date(year, month, day, 12, 0, 0);
  d.setDate(d.getDate() + 1);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const calculateNewEndDateFromStart = (startDateStr: string | null, monthsToAdd: number) => {
  if (!startDateStr) return null;

  const parts = String(startDateStr).split('-');
  if (parts.length < 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const d = new Date(year, month, day, 12, 0, 0);
  d.setMonth(d.getMonth() + monthsToAdd);
  d.setDate(d.getDate() - 1);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function RenewalsPage() {
  const { refresh: refreshGlobalData } = useAppData();

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [approvalModal, setApprovalModal] = useState<{ isOpen: boolean, type: 'single' | 'bulk', req?: any }>({ isOpen: false, type: 'single' });
  const [confirmedMonths, setConfirmedMonths] = useState<number>(12);
  
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

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

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('renewal_requests').select('*');
    if (error) console.error("Error fetching requests:", error.message);
    if (data) setRequests(data);
    setLoading(false);
  };

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return null;
    const parts = endDateStr.split('-');
    if (parts.length < 3) return null;
    const end = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const deptsList = Array.from(new Set(requests.map(r => r.department).filter(Boolean)));
  const compsList = Array.from(new Set(requests.map(r => r.company).filter(Boolean)));

  const filteredRequests = requests.filter(req => {
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

  const handleConfirmApproval = async () => {
    setActionLoading(true);
    try {
      if (approvalModal.type === 'single' && approvalModal.req) {
        const req = approvalModal.req;
        const newStartDate = customStartDate || calculateNewStartDate(req.contract_end_date);
        const newEndDate = customEndDate || calculateNewEndDateFromStart(newStartDate, confirmedMonths);

        if (!newStartDate || !newEndDate) {
          setActionLoading(false);
          return alert('يرجى التأكد من إدخال تواريخ البداية والنهاية بشكل صحيح.');
        }

        // 1. تحديث جدول طلبات التجديد
        const { error: reqError } = await supabase.from('renewal_requests').update({
          status: 'Approved',
          signature_status: 'في انتظار توقيع الموظف',
          renewal_months: confirmedMonths,
          new_contract_end_date: newEndDate
        }).eq('request_id', req.request_id);

        if (reqError) throw reqError;

        // 🌟 2. تحديث التواريخ في جدول العقود بدلاً من جدول الموظفين
        const { error: contractError } = await supabase.from('contracts').update({ 
          contract_start_date: newStartDate,
          contract_end_date: newEndDate 
        }).eq('employee_code', req.employee_code).eq('status', 'Active');
        
        if (contractError) throw contractError;

        alert(`تم اعتماد الطلب وتحديث العقد بنجاح: \n يبدأ في: ${newStartDate} \n ينتهي في: ${newEndDate} ✅`);
        await refreshGlobalData();
        
      } else if (approvalModal.type === 'bulk') {
        const reqsToApprove = requests.filter(r => selectedIds.includes(r.request_id));
        const updatePromises = reqsToApprove.map(async (req) => {
          const newStartDate = calculateNewStartDate(req.contract_end_date);
          const newEndDate = calculateNewEndDateFromStart(newStartDate, confirmedMonths);
          
          // تحديث الطلب
          const { error: reqError } = await supabase.from('renewal_requests').update({
            status: 'Approved',
            signature_status: 'في انتظار توقيع الموظف',
            renewal_months: confirmedMonths,
            new_contract_end_date: newEndDate
          }).eq('request_id', req.request_id);

          if (reqError) throw reqError;

          // 🌟 تحديث العقد النشط الخاص بالموظف
          if (newEndDate && newStartDate) {
            const { error: contractError } = await supabase.from('contracts').update({ 
              contract_start_date: newStartDate,
              contract_end_date: newEndDate 
            }).eq('employee_code', req.employee_code).eq('status', 'Active');
            
            if (contractError) throw contractError;
          }
        });

        await Promise.all(updatePromises);
        alert(`تم اعتماد ${reqsToApprove.length} طلب وتحديث عقود الموظفين بنجاح ✅`);
        await refreshGlobalData();
      }

      setSelectedIds([]);
      setApprovalModal({ isOpen: false, type: 'single' });
      await fetchRequests(); 

    } catch (err: any) {
      alert('حدث خطأ أثناء الاعتماد أو تحديث بيانات العقد: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    const confirmDelete = window.confirm('هل أنت متأكد من حذف هذا الطلب نهائياً من النظام؟\n\nتنبيه: سيتم إزالة الطلب وكأنه لم يكن.');
    if (!confirmDelete) return;

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('renewal_requests')
        .delete()
        .eq('request_id', requestId);

      if (error) throw error;

      alert('تم حذف طلب التجديد بنجاح 🗑️✅');
      setApprovalModal({ isOpen: false, type: 'single' });
      await refreshGlobalData();
      await fetchRequests();
    } catch (err: any) {
      alert('حدث خطأ أثناء الحذف: ' + err.message);
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
    
    if (error) alert('حدث خطأ أثناء رفض الطلب: ' + error.message);
    else {
      alert('تم رفض الطلب بنجاح ❌');
      await refreshGlobalData();
      fetchRequests();
    }
    setActionLoading(false);
  };

  const handleExportApprovedToExcel = async () => {
    if (selectedIds.length === 0) return alert('يرجى تحديد طلبات أولاً.');
    setActionLoading(true);

    try {
      const selectedReqs = requests.filter(r => selectedIds.includes(r.request_id) && r.status === 'Approved');
      
      if (selectedReqs.length === 0) {
        setActionLoading(false);
        return alert('⚠️ لا يمكن تصدير هذا الكشف. يرجى التأكد من تحديد طلبات معتمدة فقط من الجدول.');
      }

      const empCodes = selectedReqs.map(r => r.employee_code);
      const { data: emps, error } = await supabase.from('employees').select('employee_code, national_id').in('employee_code', empCodes);
      if (error) throw error;

      const exportData = selectedReqs.map(req => {
        const empDetails = emps?.find(e => e.employee_code === req.employee_code);
        const newStart = calculateNewStartDate(req.contract_end_date);
        
        return {
          'رقم الطلب': req.request_id,
          'كود الموظف': req.employee_code,
          'اسم الموظف': req.employee_name,
          'الرقم القومي': empDetails?.national_id || '—',
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

      setActionLoading(false);

    } catch (err: any) {
      alert('حدث خطأ أثناء تجهيز الإكسيل: ' + err.message);
      setActionLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const selectableIds = sortedRequests.filter(r => r.status === activeTab).map(r => r.request_id);
      setSelectedIds(selectableIds);
    } else {
      setSelectedIds([]);
    }
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
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
            
            {activeTab === 'Pending' && (
              <button onClick={() => {
                if (selectedIds.length === 0) return alert('يرجى تحديد طلب واحد على الأقل من الجدول.');
                setApprovalModal({ isOpen: true, type: 'bulk' });
              }} disabled={selectedIds.length === 0 || actionLoading} style={{ background: 'var(--brass-600)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer', opacity: selectedIds.length === 0 ? 0.5 : 1 }}>
                ✅ اعتماد مجمع ({selectedIds.length})
              </button>
            )}

            {activeTab === 'Approved' && (
              <button onClick={handleExportApprovedToExcel} disabled={selectedIds.length === 0 || actionLoading} style={{ background: 'var(--stamp-green)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer', opacity: selectedIds.length === 0 ? 0.5 : 1 }}>
                {actionLoading ? 'جاري التجهيز...' : `📥 تصدير كشف عقود (${selectedIds.length})`}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <button onClick={() => setActiveTab('Pending')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'Pending' ? '2px solid var(--stamp-blue)' : '1px solid var(--line)', background: activeTab === 'Pending' ? 'var(--stamp-blue-bg)' : 'var(--paper-card)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>قيد المعالجة</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--stamp-blue)', marginTop: '4px' }}>{countPending}</div>
          </button>
          <button onClick={() => setActiveTab('Approved')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'Approved' ? '2px solid var(--stamp-green)' : '1px solid var(--line)', background: activeTab === 'Approved' ? 'var(--stamp-green-bg)' : 'var(--paper-card)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>معتمدة (تنتظر التوقيع)</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--stamp-green)', marginTop: '4px' }}>{countApproved}</div>
          </button>
          <button onClick={() => setActiveTab('Rejected')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'Rejected' ? '2px solid var(--stamp-red)' : '1px solid var(--line)', background: activeTab === 'Rejected' ? 'var(--stamp-red-bg)' : 'var(--paper-card)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>مرفوضة</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--stamp-red)', marginTop: '4px' }}>{countRejected}</div>
          </button>
          <button onClick={() => setActiveTab('All')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'All' ? '2px solid var(--navy-950)' : '1px solid var(--line)', background: activeTab === 'All' ? 'var(--paper)' : 'var(--paper-card)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>الجميع</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--navy-950)', marginTop: '4px' }}>{countAll}</div>
          </button>
        </div>

        <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="بحث بالاسم أو الكود..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none', width: '220px' }} />
          
          <input list="deptList" placeholder="الإدارة..." value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none', width: '130px' }} />
          <datalist id="deptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>
          
          <input list="compList" placeholder="الشركة..." value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none', width: '130px' }} />
          <datalist id="compList">{compsList.map((c: any, i) => <option key={i} value={c} />)}</datalist>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--muted)', marginLeft: '6px' }}>شهر البداية:</span>
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={e => setSelectedMonth(e.target.value)} 
              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} 
            />
          </div>

          <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedCompany(''); setSelectedMonth(''); }} style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>
          
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
                      onChange={handleSelectAll} 
                      checked={selectedIds.length > 0 && selectedIds.length === sortedRequests.filter(r => r.status === activeTab).length}
                      disabled={activeTab === 'All' || activeTab === 'Rejected'} 
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
                    <tr key={req.request_id} style={{ borderBottom: '1px solid var(--line)', background: selectedIds.includes(req.request_id) ? 'var(--paper)' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          disabled={req.status === 'Rejected'} 
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
                          <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', background: days < 0 ? 'var(--stamp-red-bg)' : days <= 60 ? 'var(--stamp-amber-bg)' : 'var(--stamp-green-bg)', color: days < 0 ? 'var(--stamp-red)' : days <= 60 ? 'var(--stamp-amber)' : 'var(--stamp-green)' }}>
                            {days < 0 ? `منتهي (${Math.abs(days)})` : `${days} يوم`}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{req.renewal_months || 12} ش</td>
                      <td style={{ padding: '8px 10px' }}>
                        {req.status === 'Approved' && <span style={{ background: 'var(--stamp-green-bg)', color: 'var(--stamp-green)', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>معتمد</span>}
                        {req.status === 'Pending' && <span style={{ background: 'var(--stamp-blue-bg)', color: 'var(--stamp-blue)', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>قيد المعالجة</span>}
                        {req.status === 'Rejected' && <span style={{ background: 'var(--stamp-red-bg)', color: 'var(--stamp-red)', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>مرفوض</span>}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 'bold', fontSize: '9px', color: req.signature_status === 'تم التوقيع' ? 'var(--stamp-green)' : 'var(--muted)' }}>
                        {req.signature_status || '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        {req.status === 'Pending' ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button onClick={() => { setApprovalModal({ isOpen: true, type: 'single', req }); setConfirmedMonths(req.renewal_months || 12); }} style={{ background: 'var(--stamp-green)', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>اعتماد ✅</button>
                            <button onClick={() => handleReject(req.request_id)} style={{ background: 'var(--stamp-red)', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>رفض ❌</button>
                            <button onClick={() => handleDeleteRequest(req.request_id)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>حذف 🗑️</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                            <span style={{ fontSize: '9px', color: 'var(--muted)' }}>— تمت المعالجة —</span>
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
            <div style={{ width: '420px', background: 'var(--paper-card)', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--stamp-green)' }}>
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

              <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '16px', lineHeight: '1.6' }}>
                سيتم اعتماد الطلب وتحديث تاريخ نهاية وبداية العقد للموظف مباشرة. ويمكنك تعديل التواريخ يدوياً قبل الاعتماد.
              </p>
              
              {approvalModal.type === 'single' && approvalModal.req && (
                <div style={{ background: 'var(--paper)', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '11px', color: 'var(--ink)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ marginBottom: '2px' }}><strong>تاريخ النهاية القديم:</strong> {approvalModal.req.contract_end_date || 'غير مسجل'}</div>
                  
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', color: 'var(--stamp-green)', fontWeight: 'bold' }}>تاريخ البداية الجديد (قابل للتعديل):</label>
                    <input 
                      type="date" 
                      value={customStartDate} 
                      onChange={e => setCustomStartDate(e.target.value)} 
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', color: 'var(--stamp-green)', fontWeight: 'bold' }}>تاريخ النهاية المتوقع (قابل للتعديل):</label>
                    <input 
                      type="date" 
                      value={customEndDate} 
                      onChange={e => setCustomEndDate(e.target.value)} 
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 'bold' }}>المدة المعتمدة للتجديد بالشهور (تلقائي):</label>
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
                <button onClick={() => setApprovalModal({ isOpen: false, type: 'single' })} style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', color: 'var(--ink)' }}>إلغاء</button>
                <button onClick={handleConfirmApproval} disabled={actionLoading} style={{ background: 'var(--stamp-green)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.7 : 1 }}>
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
