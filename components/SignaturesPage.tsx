'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

// تهيئة الاتصال بـ Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ARABIC_WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function formatArabicDate(d: Date) {
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function addOneDay(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + 1);
  return formatArabicDate(d);
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return formatArabicDate(d);
}

export default function SignaturesPage() {
  const [directRequests, setDirectRequests] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // حالات الفلاتر والتعديل
  const [activeTab, setActiveTab] = useState<'PendingSignature' | 'Signed' | 'All'>('PendingSignature');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // حالات الترتيب حسب العمود
  const [sortColumn, setSortColumn] = useState<string>('request_id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // 🌟 جلب الطلبات المعتمدة المخصصة للتوقيع مباشرة من Supabase
  const fetchApprovedData = async () => {
    setDataLoading(true);
    try {
      const { data, error } = await supabase
        .from('renewals')
        .select('*')
        .eq('status', 'Approved')
        .order('request_date', { ascending: false });

      if (error) throw error;
      setDirectRequests(data || []);
    } catch (err: any) {
      console.error('Error fetching approved requests from Supabase:', err.message);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovedData();
  }, []);

  const deptsList = useMemo(
    () => Array.from(new Set(directRequests.map((r: any) => r.department).filter(Boolean))),
    [directRequests]
  );

  // التصفية والفلترة المركبة
  const filteredRequests = useMemo(() => {
    return directRequests.filter((req: any) => {
      const sigStatus = String(req.signature_status || '').trim();
      
      if (activeTab === 'PendingSignature' && sigStatus === 'تم التوقيع') return false;
      if (activeTab === 'Signed' && sigStatus !== 'تم التوقيع') return false;
      
      const term = searchTerm.toLowerCase().trim();
      const code = String(req.employee_code || '').toLowerCase();
      const name = String(req.employee_name || '').toLowerCase();
      const reqId = String(req.request_id || '').toLowerCase();

      const matchesSearch = !term || code.includes(term) || name.includes(term) || reqId.includes(term);
      const matchesDept = !selectedDept || req.department === selectedDept;
      
      return matchesSearch && matchesDept;
    });
  }, [directRequests, activeTab, searchTerm, selectedDept]);

  // الترتيب الديناميكي للأعمدة
  const sortedRequests = useMemo(() => {
    return [...filteredRequests].sort((a: any, b: any) => {
      let valA = a[sortColumn] ?? '';
      let valB = b[sortColumn] ?? '';

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      const res = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? res : -res;
    });
  }, [filteredRequests, sortColumn, sortDirection]);

  const countPending = directRequests.filter((r: any) => String(r.signature_status || '').trim() !== 'تم التوقيع').length;
  const countSigned = directRequests.filter((r: any) => String(r.signature_status || '').trim() === 'تم التوقيع').length;
  const countAll = directRequests.length;

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const renderSortArrow = (colKey: string) => {
    if (sortColumn !== colKey) return <span style={{ opacity: 0.3, marginRight: '4px' }}>↕</span>;
    return sortDirection === 'asc' ? <span style={{ color: '#0d9488', marginRight: '4px' }}>▲</span> : <span style={{ color: '#0d9488', marginRight: '4px' }}>▼</span>;
  };

  // 🌟 التوقيع المباشر (الفردي والمجمع) على Supabase
  const handleSign = async (reqId?: string) => {
    const idsToSign = reqId ? [reqId] : selectedIds;
    if (idsToSign.length === 0) return alert('يرجى تحديد عقد واحد على الأقل للتوقيع.');

    const confirmSign = window.confirm(`هل أنت متأكد من تسجيل التوقيع لعدد (${idsToSign.length}) عقد؟`);
    if (!confirmSign) return;

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('renewals')
        .update({ signature_status: 'تم التوقيع' })
        .in('request_id', idsToSign);

      if (error) throw error;

      alert('تم تسجيل التوقيع بنجاح ✅');
      setSelectedIds([]);
      fetchApprovedData();
    } catch (err: any) {
      alert('حدث خطأ أثناء التوقيع: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 🌟 الحذف المباشر (الفردي والمجمع) من Supabase
  const handleDelete = async (reqId?: string) => {
    const idsToDelete = reqId ? [reqId] : selectedIds;
    if (idsToDelete.length === 0) return alert('يرجى تحديد طلب واحد على الأقل للحذف.');

    const confirmDelete = window.confirm(`هل أنت متأكد من حذف عدد (${idsToDelete.length}) طلب تجديد نهائياً؟`);
    if (!confirmDelete) return;

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('renewals')
        .delete()
        .in('request_id', idsToDelete);

      if (error) throw error;

      alert('تم حذف الطلبات بنجاح ✅');
      setSelectedIds([]);
      fetchApprovedData();
    } catch (err: any) {
      alert('حدث خطأ أثناء الحذف: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleGeneratePDF = async (req: any) => {
    try {
      setActionLoading(true);
      // @ts-ignore
      const html2pdf = (await import('html2pdf.js')).default;
      
      const today = new Date();
      const dayName = ARABIC_WEEKDAYS[today.getDay()];
      const todayStr = formatArabicDate(today);
      const startDate = addOneDay(req.contract_end_date) || '';
      const endDate = formatDate(req.new_contract_end_date) || '';

      const element = document.createElement('div');
      element.innerHTML = `
        <div style="position: relative; width: 210mm; height: 297mm; background: #fff; overflow: hidden; font-family: Arial, sans-serif; font-size: 15px; font-weight: bold; color: #000; direction: rtl;">
            <img src="/contract-bg.jpg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;" />
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2;">
                <span style="position: absolute; top: 11.5%; right: 30%; width: 120px; text-align: center;">${dayName}</span>
                <span style="position: absolute; top: 11.5%; right: 65%; width: 120px; text-align: center;">${todayStr}</span>
                <span style="position: absolute; top: 25.5%; right: 28%; width: 300px; text-align: center;">${req.employee_name || ''}</span>
                <span style="position: absolute; top: 28%; right: 18%; width: 400px; text-align: right;">${req.employee_address || ''}</span>
                <span style="position: absolute; top: 30.5%; right: 23%; width: 200px; text-align: center;">${req.national_id || ''}</span>
                <span style="position: absolute; top: 37.5%; right: 53%; width: 250px; text-align: center;">${req.department || ''}</span>
                <span style="position: absolute; top: 49%; right: 35%; width: 120px; text-align: center;">${startDate}</span>
                <span style="position: absolute; top: 49%; right: 68%; width: 120px; text-align: center;">${endDate}</span>
                <span style="position: absolute; top: 56.5%; right: 33%; width: 180px; text-align: center;">${req.job_title || ''}</span>
                <span style="position: absolute; top: 93%; right: 23%; width: 100px; text-align: center;">${req.employee_code || ''}</span>
            </div>
        </div>
      `;

      const opt = {
        margin: 0,
        filename: `عقد_عمل_${req.employee_name}_${req.request_id}.pdf`,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().from(element).set(opt).save();
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('حدث خطأ أثناء تصدير العقد كـ PDF.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ paddingBottom: '40px', direction: 'rtl' }}>
      
      {/* الهيدر الرئيسي */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900' }}>✍️ توقيعات العقود المعتمدة (Supabase)</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>سجل متابعة وإغلاق توقيعات العقود التي تم اعتمادها رسمياً</p>
        </div>
        
        {/* أزرار العمليات المجمعة */}
        {selectedIds.length > 0 && (
          <div style={{ background: '#0f172a', color: '#fff', padding: '8px 16px', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold' }}>محدد: <strong style={{ color: '#38bdf8' }}>{selectedIds.length}</strong></span>
            <button onClick={() => handleSign()} disabled={actionLoading} style={{ background: '#0d9488', color: '#fff', border: 0, padding: '6px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
              ✍️ توقيع مجمع
            </button>
            <button onClick={() => handleDelete()} disabled={actionLoading} style={{ background: '#ef4444', color: '#fff', border: 0, padding: '6px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
              🗑️ حذف مجمع
            </button>
          </div>
        )}
      </div>

      {/* الكروت الإحصائية */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
        <div 
          onClick={() => setActiveTab('PendingSignature')}
          style={{ 
            background: activeTab === 'PendingSignature' ? '#fef3c7' : '#fff', 
            border: activeTab === 'PendingSignature' ? '2px solid #d97706' : '1px solid #e2e8f0', 
            padding: '16px 20px', borderRadius: '14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
          }}
        >
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>ينتظر التوقيع</div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#d97706', marginTop: '4px' }}>{countPending.toLocaleString()}</div>
          </div>
          <div style={{ background: '#fef3c7', color: '#d97706', width: '44px', height: '44px', borderRadius: '12px', display: 'grid', placeItems: 'center', fontSize: '20px' }}>⏳</div>
        </div>

        <div 
          onClick={() => setActiveTab('Signed')}
          style={{ 
            background: activeTab === 'Signed' ? '#f0fdf4' : '#fff', 
            border: activeTab === 'Signed' ? '2px solid #16a34a' : '1px solid #e2e8f0', 
            padding: '16px 20px', borderRadius: '14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
          }}
        >
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>تم التوقيع رسمياً</div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#16a34a', marginTop: '4px' }}>{countSigned.toLocaleString()}</div>
          </div>
          <div style={{ background: '#f0fdf4', color: '#16a34a', width: '44px', height: '44px', borderRadius: '12px', display: 'grid', placeItems: 'center', fontSize: '20px' }}>✍️</div>
        </div>

        <div 
          onClick={() => setActiveTab('All')}
          style={{ 
            background: activeTab === 'All' ? '#f8fafc' : '#fff', 
            border: activeTab === 'All' ? '2px solid #0f172a' : '1px solid #e2e8f0', 
            padding: '16px 20px', borderRadius: '14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
          }}
        >
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>إجمالي العقود المعتمدة</div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', marginTop: '4px' }}>{countAll.toLocaleString()}</div>
          </div>
          <div style={{ background: '#f8fafc', color: '#0f172a', width: '44px', height: '44px', borderRadius: '12px', display: 'grid', placeItems: 'center', fontSize: '20px' }}>📄</div>
        </div>
      </div>

      {/* شريط البحث والفلترة */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="بحث بالاسم، الكود، رقم الطلب..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', outline: 'none', width: '220px', fontWeight: 'bold' }} 
          />
          
          <input 
            list="deptList" 
            placeholder="الإدارة (اكتب للبحث)..." 
            value={selectedDept} 
            onChange={(e) => setSelectedDept(e.target.value)} 
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', outline: 'none', width: '180px', fontWeight: 'bold' }} 
          />
          <datalist id="deptList">{deptsList.map((d: any, i: number) => <option key={i} value={d} />)}</datalist>

          <button onClick={() => { setSearchTerm(''); setSelectedDept(''); }} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a', padding: '8px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>
        </div>

        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>
          عدد النتائج: <strong style={{ color: '#0f172a' }}>{sortedRequests.length}</strong>
        </div>
      </div>

      {/* الجدول الرئيسي */}
      <div className="table-responsive" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
        {dataLoading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>جاري تحميل عقود التوقيعات من Supabase... ⏳</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px', textAlign: 'center', width: '40px' }}>
                  <input 
                    type="checkbox" 
                    onChange={(e) => {
                      const selectableIds = sortedRequests.map((r: any) => r.request_id);
                      setSelectedIds(e.target.checked ? selectableIds : []);
                    }} 
                    checked={selectedIds.length > 0 && selectedIds.length === sortedRequests.length}
                    style={{ accentColor: '#0d9488' }}
                  />
                </th>
                <th onClick={() => handleSort('request_id')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>رقم الطلب {renderSortArrow('request_id')}</th>
                <th onClick={() => handleSort('employee_code')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الكود {renderSortArrow('employee_code')}</th>
                <th onClick={() => handleSort('employee_name')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الموظف {renderSortArrow('employee_name')}</th>
                <th onClick={() => handleSort('department')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الإدارة {renderSortArrow('department')}</th>
                <th onClick={() => handleSort('renewal_months')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>مدة التجديد {renderSortArrow('renewal_months')}</th>
                <th onClick={() => handleSort('new_contract_end_date')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>تاريخ الانتهاء الجديد {renderSortArrow('new_contract_end_date')}</th>
                <th onClick={() => handleSort('signature_status')} style={{ padding: '12px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>حالة التوقيع {renderSortArrow('signature_status')}</th>
                <th style={{ padding: '12px', color: '#64748b', textAlign: 'center' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {sortedRequests.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا توجد عقود معتمدة بانتظار التوقيع 🔍</td></tr>
              ) : sortedRequests.map((req: any) => {
                const isSigned = String(req.signature_status || '').trim() === 'تم التوقيع';

                return (
                  <tr key={req.request_id} style={{ borderBottom: '1px solid #f1f5f9', background: selectedIds.includes(req.request_id) ? '#f0fdfa' : 'transparent' }}>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(req.request_id)} 
                        onChange={(e) => setSelectedIds(e.target.checked ? [...selectedIds, req.request_id] : selectedIds.filter((id) => id !== req.request_id))} 
                        style={{ accentColor: '#0d9488' }}
                      />
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', color: '#64748b', fontWeight: 'bold' }}>{req.request_id}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', fontFamily: 'monospace', color: '#0d9488' }}>{req.employee_code}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{req.employee_name}</td>
                    <td style={{ padding: '10px', color: '#64748b', fontWeight: '500' }}>{req.department || '—'}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#16a34a' }}>
                      {req.renewal_months ? `${req.renewal_months} شهور` : 'تاريخ مخصص'}
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold', color: '#0f172a' }}>
                      {req.new_contract_end_date ? formatDate(req.new_contract_end_date) : '—'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {isSigned ? 
                        <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' }}>تم التوقيع ✍️</span>
                        : 
                        <span style={{ background: '#fef3c7', color: '#d97706', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' }}>ينتظر التوقيع ⏳</span>
                      }
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        
                        {!isSigned && (
                          <button 
                            onClick={() => handleSign(req.request_id)} 
                            disabled={actionLoading} 
                            style={{ background: '#0d9488', color: '#fff', border: 0, padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            توقيع ✍️
                          </button>
                        )}

                        <button 
                          onClick={() => handleGeneratePDF(req)} 
                          disabled={actionLoading}
                          style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: actionLoading ? 'wait' : 'pointer' }}
                        >
                          📄 تصدير
                        </button>

                        <button 
                          onClick={() => handleDelete(req.request_id)} 
                          disabled={actionLoading}
                          style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: actionLoading ? 'wait' : 'pointer' }}
                        >
                          حذف 🗑️
                        </button>

                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
