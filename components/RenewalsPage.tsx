'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { useAppData } from '@/lib/DataContext';

// 🌟 دالة حساب تاريخ البداية الجديد (معالجة أمان الفروق الزمنية Timezone)
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
  
  // ضبط الوقت الساعة 12 ظهراً لتفادي تأثر التاريخ بتوقيت GMT
  const d = new Date(year, month, day, 12, 0, 0);
  d.setDate(d.getDate() + 1); // إضافة يوم كامل لبداية العقد الجديد

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 🌟 دالة حساب تاريخ الانتهاء الجديد (إضافة الشهور وخصم يوم)
const calculateNewEndDateFromStart = (startDateStr: string | null, monthsToAdd: number) => {
  if (!startDateStr) return null;

  const parts = String(startDateStr).split('-');
  if (parts.length < 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const d = new Date(year, month, day, 12, 0, 0);
  d.setMonth(d.getMonth() + monthsToAdd); // إضافة الشهور
  d.setDate(d.getDate() - 1); // خصم يوم واحد لنهاية العقد

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function RenewalsPage() {
  const { refresh: refreshGlobalData } = useAppData();

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // حالات Slicers
  const [activeTab, setActiveTab] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending');

  // حالات الفلاتر والتحديد
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // حالات نافذة الاعتماد
  const [approvalModal, setApprovalModal] = useState<{ isOpen: boolean, type: 'single' | 'bulk', req?: any }>({ isOpen: false, type: 'single' });
  const [confirmedMonths, setConfirmedMonths] = useState<number>(12);

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab]);

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
    const end = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
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
        const newStartDate = calculateNewStartDate(req.contract_end_date);
        const newEndDate = calculateNewEndDateFromStart(newStartDate, confirmedMonths);

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

        alert(`تم اعتماد الطلب وتحديث العقد بنجاح: \n يبدأ في: ${newStartDate} \n ينتهي في: ${newEndDate} ✅`);
        await refreshGlobalData();
        
      } else if (approvalModal.type === 'bulk') {
        const reqsToApprove = requests.filter(r => selectedIds.includes(r.request_id));
        const updatePromises = reqsToApprove.map(async (req) => {
          const newStartDate = calculateNewStartDate(req.contract_end_date);
          const newEndDate = calculateNewEndDateFromStart(newStartDate, confirmedMonths);
          
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
        await refreshGlobalData();
      }

      setSelectedIds([]);
      setApprovalModal({ isOpen: false, type: 'single' });
      await fetchRequests(); 

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
    <div className="flex flex-col gap-6 pb-10">
      <div className="executive-card p-5 sm:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="m-0 text-lg font-extrabold text-primary">طلبات التجديد</h3>
          <p className="mt-1 text-xs text-muted font-bold">دورة الاعتماد وإدارة العقود قيد المعالجة لتوجيهها للتوقيع</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          {activeTab === 'Pending' && (
            <button onClick={() => {
              if (selectedIds.length === 0) return alert('يرجى تحديد طلب واحد على الأقل من الجدول.');
              setApprovalModal({ isOpen: true, type: 'bulk' });
            }} disabled={selectedIds.length === 0 || actionLoading} className="bg-gold hover:bg-gold-hover text-white px-4 py-2.5 rounded-lg font-bold text-xs transition-colors shadow-sm disabled:opacity-50">
              ✅ اعتماد مجمع ({selectedIds.length})
            </button>
          )}

          {activeTab === 'Approved' && (
            <button onClick={handleExportApprovedToExcel} disabled={selectedIds.length === 0 || actionLoading} className="bg-[var(--success-text)] text-white px-4 py-2.5 rounded-lg font-bold text-xs transition-opacity shadow-sm disabled:opacity-50">
              {actionLoading ? 'جاري التجهيز...' : `📥 تصدير كشف عقود (${selectedIds.length})`}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button onClick={() => setActiveTab('Pending')} className={`executive-card p-4 text-center cursor-pointer border-2 transition-all ${activeTab === 'Pending' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent hover:border-border'}`}>
          <div className="text-xs font-bold text-muted">قيد المعالجة</div>
          <div className="text-xl font-black text-blue-600 mt-1">{countPending}</div>
        </button>
        <button onClick={() => setActiveTab('Approved')} className={`executive-card p-4 text-center cursor-pointer border-2 transition-all ${activeTab === 'Approved' ? 'border-[var(--success-text)] bg-[var(--success-bg)]' : 'border-transparent hover:border-border'}`}>
          <div className="text-xs font-bold text-muted">معتمدة (تنتظر التوقيع)</div>
          <div className="text-xl font-black text-[var(--success-text)] mt-1">{countApproved}</div>
        </button>
        <button onClick={() => setActiveTab('Rejected')} className={`executive-card p-4 text-center cursor-pointer border-2 transition-all ${activeTab === 'Rejected' ? 'border-[var(--danger-text)] bg-[var(--danger-bg)]' : 'border-transparent hover:border-border'}`}>
          <div className="text-xs font-bold text-muted">مرفوضة</div>
          <div className="text-xl font-black text-[var(--danger-text)] mt-1">{countRejected}</div>
        </button>
        <button onClick={() => setActiveTab('All')} className={`executive-card p-4 text-center cursor-pointer border-2 transition-all ${activeTab === 'All' ? 'border-primary bg-background' : 'border-transparent hover:border-border'}`}>
          <div className="text-xs font-bold text-muted">الجميع</div>
          <div className="text-xl font-black text-primary mt-1">{countAll}</div>
        </button>
      </div>

      <div className="executive-card p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
          <input type="text" placeholder="بحث بالاسم أو الكود..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-background border border-border text-primary text-xs font-bold rounded-lg px-4 py-2 outline-none focus:border-gold w-full sm:w-48" />
          
          <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="bg-background border border-border text-primary text-xs font-bold rounded-lg px-4 py-2 outline-none focus:border-gold w-full sm:w-32">
            <option value="">الإدارة (الكل)</option>
            {deptsList.map((d: any, i) => <option key={i} value={d}>{d}</option>)}
          </select>
          
          <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} className="bg-background border border-border text-primary text-xs font-bold rounded-lg px-4 py-2 outline-none focus:border-gold w-full sm:w-32">
            <option value="">الشركة (الكل)</option>
            {compsList.map((c: any, i) => <option key={i} value={c}>{c}</option>)}
          </select>

          <div className="flex items-center w-full sm:w-auto">
            <span className="text-xs font-bold text-muted ml-2">شهر البداية:</span>
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-background border border-border text-primary text-xs font-bold font-mono rounded-lg px-3 py-2 outline-none focus:border-gold" />
          </div>

          <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedCompany(''); setSelectedMonth(''); }} className="bg-card border border-border text-primary px-4 py-2 rounded-lg font-bold text-xs hover:bg-background">إعادة ضبط</button>
        </div>
        
        <div className="text-xs font-bold text-muted w-full lg:w-auto text-left">
          معروض: <span className="text-primary">{sortedRequests.length}</span> طلب
        </div>
      </div>

      <div className="executive-card overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-xs font-bold text-muted">جاري تحميل الطلبات وترتيبها...</div>
          ) : (
            <table className="w-full text-right text-xs whitespace-nowrap executive-table">
              <thead>
                <tr>
                  <th className="text-center w-10">
                    <input 
                      type="checkbox" 
                      onChange={handleSelectAll} 
                      checked={selectedIds.length > 0 && selectedIds.length === sortedRequests.filter(r => r.status === activeTab).length}
                      disabled={activeTab === 'All' || activeTab === 'Rejected'} 
                      className="cursor-pointer"
                    />
                  </th>
                  <th>رقم الطلب</th>
                  <th>الكود</th>
                  <th>الموظف</th>
                  <th>الإدارة</th>
                  <th>انتهاء العقد</th>
                  <th>المتبقي</th>
                  <th>التجديد</th>
                  <th>الطلب</th>
                  <th>التوقيع</th>
                  <th className="text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {sortedRequests.length === 0 ? (
                  <tr><td colSpan={11} className="p-5 text-center text-muted font-bold">لا توجد طلبات مطابقة.</td></tr>
                ) : sortedRequests.map((req) => {
                  const days = getDaysRemaining(req.contract_end_date);
                  return (
                    <tr key={req.request_id} className={selectedIds.includes(req.request_id) ? 'bg-gold/10' : ''}>
                      <td className="text-center p-3">
                        <input 
                          type="checkbox" 
                          disabled={req.status === 'Rejected'} 
                          checked={selectedIds.includes(req.request_id)} 
                          onChange={e => setSelectedIds(e.target.checked ? [...selectedIds, req.request_id] : selectedIds.filter(id => id !== req.request_id))} 
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="font-mono text-muted">{req.request_id}</td>
                      <td className="font-mono font-bold text-gold">{req.employee_code}</td>
                      <td className="font-bold text-primary">{req.employee_name}</td>
                      <td className="text-muted">{req.department || '—'}</td>
                      <td className="font-mono font-bold text-primary">{req.contract_end_date || '—'}</td>
                      <td>
                        {days !== null ? (
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${days < 0 ? 'bg-[var(--danger-bg)] text-[var(--danger-text)]' : days <= 60 ? 'bg-[var(--warning-bg)] text-[var(--warning-text)]' : 'bg-[var(--success-bg)] text-[var(--success-text)]'}`}>
                            {days < 0 ? `منتهي (${Math.abs(days)})` : `${days} يوم`}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="font-bold text-primary">{req.renewal_months || 12} ش</td>
                      <td>
                        {req.status === 'Approved' && <span className="bg-[var(--success-bg)] text-[var(--success-text)] px-2.5 py-1 rounded-md text-[10px] font-bold">معتمد</span>}
                        {req.status === 'Pending' && <span className="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-2.5 py-1 rounded-md text-[10px] font-bold">قيد المعالجة</span>}
                        {req.status === 'Rejected' && <span className="bg-[var(--danger-bg)] text-[var(--danger-text)] px-2.5 py-1 rounded-md text-[10px] font-bold">مرفوض</span>}
                      </td>
                      <td className={`font-bold text-[10px] ${req.signature_status === 'تم التوقيع' ? 'text-[var(--success-text)]' : 'text-muted'}`}>
                        {req.signature_status || '—'}
                      </td>
                      <td className="text-center p-3">
                        {req.status === 'Pending' ? (
                          <div className="flex justify-center gap-2">
                            <button onClick={() => { setApprovalModal({ isOpen: true, type: 'single', req }); setConfirmedMonths(req.renewal_months || 12); }} className="bg-[var(--success-text)] text-white px-3 py-1.5 rounded-md text-[10px] font-bold hover:opacity-90 transition-opacity">اعتماد ✅</button>
                            <button onClick={() => handleReject(req.request_id)} className="bg-[var(--danger-text)] text-white px-3 py-1.5 rounded-md text-[10px] font-bold hover:opacity-90 transition-opacity">رفض ❌</button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted font-bold">— تمت المعالجة —</span>
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
            <div className="w-full max-w-md bg-card rounded-2xl p-6 shadow-2xl border border-border">
              <h3 className="m-0 mb-4 text-base font-extrabold text-[var(--success-text)]">
                {approvalModal.type === 'single' ? `اعتماد طلب تجديد: ${approvalModal.req?.employee_name}` : `اعتماد مجمع لعدد (${selectedIds.length}) طلب`}
              </h3>
              <p className="text-xs text-muted mb-4 leading-relaxed font-bold">
                سيتم اعتماد الطلب وتحديث تاريخ نهاية وبداية العقد للموظف مباشرة.
              </p>
              
              {approvalModal.type === 'single' && approvalModal.req && (
                <div className="bg-background border border-border p-3 rounded-lg mb-4 text-xs font-bold text-primary space-y-1.5">
                  <div><strong>تاريخ النهاية القديم:</strong> <span className="font-mono">{approvalModal.req.contract_end_date || 'غير مسجل'}</span></div>
                  <div className="text-[var(--success-text)]"><strong>تاريخ البداية الجديد:</strong> <span className="font-mono">{calculateNewStartDate(approvalModal.req.contract_end_date)}</span></div>
                  <div className="text-[var(--success-text)]"><strong>تاريخ النهاية المتوقع:</strong> <span className="font-mono">{calculateNewEndDateFromStart(calculateNewStartDate(approvalModal.req.contract_end_date), confirmedMonths)}</span></div>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-xs text-muted mb-2 font-bold">المدة المعتمدة للتجديد:</label>
                <select value={confirmedMonths} onChange={e => setConfirmedMonths(Number(e.target.value))} className="w-full bg-background border border-border text-primary p-2.5 rounded-lg text-xs font-bold outline-none focus:border-gold">
                  <option value={1}>شهر واحد (1)</option>
                  <option value={2}>شهران (2)</option>
                  <option value={3}>3 شهور (ربع سنوي)</option>
                  <option value={6}>6 شهور (نصف سنوي)</option>
                  <option value={9}>9 شهور</option>
                  <option value={12}>12 شهر (سنة كاملة)</option>
                </select>
              </div>
              
              <div className="flex justify-end gap-2">
                <button onClick={() => setApprovalModal({ isOpen: false, type: 'single' })} className="bg-background text-primary border border-border px-4 py-2 rounded-lg font-bold text-xs">إلغاء</button>
                <button onClick={handleConfirmApproval} disabled={actionLoading} className="bg-[var(--success-text)] text-white px-4 py-2 rounded-lg font-bold text-xs disabled:opacity-50">
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
