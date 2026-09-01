'use client';
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';

// أسماء أيام الأسبوع بالعربي
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
  const { renewals, employees, loading, refresh: fetchApprovedRequests } = useAppData();
  
  const requests = useMemo(
    () =>
      renewals
        .filter((r) => r.status === 'Approved')
        .sort((a, b) => String(b.request_id).localeCompare(String(a.request_id))),
    [renewals]
  );
  
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'PendingSignature' | 'Signed' | 'All'>('PendingSignature');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const getEmployeeRecord = (req: any) =>
    employees.find((e: any) => (req.employee_id && (e.id === req.employee_id || e.employee_id === req.employee_id)) || e.employee_code === req.employee_code);

  const deptsList = Array.from(new Set(requests.map(r => r.department).filter(Boolean)));

  const filteredRequests = requests.filter(req => {
    if (activeTab === 'PendingSignature' && req.signature_status === 'تم التوقيع') return false;
    if (activeTab === 'Signed' && req.signature_status !== 'تم التوقيع') return false;
    
    const term = searchTerm.toLowerCase();
    const matchesSearch = !term || String(req.employee_code).toLowerCase().includes(term) || String(req.employee_name).toLowerCase().includes(term) || String(req.request_id).toLowerCase().includes(term);
    const matchesDept = !selectedDept || req.department === selectedDept;
    
    return matchesSearch && matchesDept;
  });

  const countPending = requests.filter(r => r.signature_status !== 'تم التوقيع').length;
  const countSigned = requests.filter(r => r.signature_status === 'تم التوقيع').length;
  const countAll = requests.length;

  const handleSign = async (reqId?: string) => {
    const idsToSign = reqId ? [reqId] : selectedIds;
    if (idsToSign.length === 0) return alert('يرجى تحديد عقد واحد على الأقل للتوقيع.');

    const confirmSign = window.confirm(`هل أنت متأكد من إتمام توقيع عدد (${idsToSign.length}) عقد؟`);
    if (!confirmSign) return;

    setActionLoading(true);
    try {
      const updatePromises = idsToSign.map(id => 
        supabase.from('renewal_requests').update({ signature_status: 'تم التوقيع' }).eq('request_id', id)
      );

      await Promise.all(updatePromises);
      alert('تم تسجيل التوقيع بنجاح ✍️✅');
      
      setSelectedIds([]);
      await fetchApprovedRequests();
    } catch (err: any) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 🌟 دالة الحذف الجديدة (للحذف الفردي والمجمع)
  const handleDelete = async (reqId?: string) => {
    const idsToDelete = reqId ? [reqId] : selectedIds;
    if (idsToDelete.length === 0) return alert('يرجى تحديد طلب واحد على الأقل للحذف.');

    const confirmDelete = window.confirm(`هل أنت متأكد من حذف عدد (${idsToDelete.length}) طلب تجديد نهائياً؟\n\nتنبيه: سيتم مسح الطلب وكأنه لم يكن!`);
    if (!confirmDelete) return;

    setActionLoading(true);
    try {
      // تنفيذ أمر الحذف من قاعدة البيانات باستخدام .in() للمسح المجمع
      const { error } = await supabase
        .from('renewal_requests')
        .delete()
        .in('request_id', idsToDelete);

      if (error) throw error;

      alert('تم حذف الطلبات بنجاح 🗑️✅');
      
      setSelectedIds([]);
      await fetchApprovedRequests(); // تحديث القائمة فوراً
    } catch (err: any) {
      alert('حدث خطأ أثناء الحذف: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // دالة توليد الـ PDF بنظام الإحداثيات (Coordinates) فوق الصورة الأصلية
  const handleGeneratePDF = async (req: any) => {
    try {
      setActionLoading(true);
      // @ts-ignore
      const html2pdf = (await import('html2pdf.js')).default;
      
      const emp = getEmployeeRecord(req);
      const today = new Date();
      const dayName = ARABIC_WEEKDAYS[today.getDay()];
      const todayStr = formatArabicDate(today);
      const startDate = addOneDay(req.contract_end_date) || formatDate(emp?.contract_start_date) || '';
      const endDate = formatDate(req.new_contract_end_date) || '';

      // بناء هيكل A4 وهمي مع الصورة والخلايا المطلقة
      const element = document.createElement('div');
      element.innerHTML = `
        <div style="position: relative; width: 210mm; height: 297mm; background: #fff; overflow: hidden; font-family: Arial, sans-serif; font-size: 15px; font-weight: bold; color: #000; direction: rtl;">
            
            <!-- صورة النموذج الأصلي كخلفية -->
            <img src="/contract-bg.jpg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;" />
            
            <!-- طبقة النصوص (الإحداثيات) -->
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2;">
                <span style="position: absolute; top: 11.5%; right: 30%; width: 120px; text-align: center;">${dayName}</span>
                <span style="position: absolute; top: 11.5%; right: 65%; width: 120px; text-align: center;">${todayStr}</span>
                <span style="position: absolute; top: 25.5%; right: 28%; width: 300px; text-align: center;">${req.employee_name || ''}</span>
                <span style="position: absolute; top: 28%; right: 18%; width: 400px; text-align: right;">${emp?.address || ''}</span>
                <span style="position: absolute; top: 30.5%; right: 23%; width: 200px; text-align: center;">${emp?.national_id || ''}</span>
                <span style="position: absolute; top: 30.5%; right: 68%; width: 120px; text-align: center;">${emp?.birth_gov || ''}</span>
                <span style="position: absolute; top: 37.5%; right: 53%; width: 250px; text-align: center;">${req.department || ''}</span>
                <span style="position: absolute; top: 49%; right: 35%; width: 120px; text-align: center;">${startDate}</span>
                <span style="position: absolute; top: 49%; right: 68%; width: 120px; text-align: center;">${endDate}</span>
                <span style="position: absolute; top: 56.5%; right: 33%; width: 180px; text-align: center;">${emp?.job_title || ''}</span>
                <span style="position: absolute; top: 56.5%; right: 68%; width: 120px; text-align: center;">${req.salary || ''}</span>
                <span style="position: absolute; top: 59%; right: 18%; width: 400px; text-align: right;">${req.salary_in_words || ''}</span>
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--navy-950)' }}>توقيعات العقود المعتمدة</h3>
          <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--muted)' }}>إدارة العقود التي تم اعتمادها وتنتظر توقيع الموظفين</p>
        </div>
        
        {/* 🌟 أزرار العمليات المجمعة (حذف وتوقيع) */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => handleDelete()} disabled={selectedIds.length === 0 || actionLoading} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer', opacity: selectedIds.length === 0 ? 0.5 : 1 }}>
            🗑️ حذف مجمع ({selectedIds.length})
          </button>
          <button onClick={() => handleSign()} disabled={selectedIds.length === 0 || actionLoading} style={{ background: 'var(--brass-600)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer', opacity: selectedIds.length === 0 ? 0.5 : 1 }}>
            ✍️ توقيع مجمع ({selectedIds.length})
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <button onClick={() => setActiveTab('PendingSignature')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'PendingSignature' ? '2px solid #ea580c' : '1px solid var(--line)', background: activeTab === 'PendingSignature' ? '#fff7ed' : '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>في انتظار التوقيع</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ea580c', marginTop: '4px' }}>{countPending}</div>
        </button>
        <button onClick={() => setActiveTab('Signed')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'Signed' ? '2px solid #15803d' : '1px solid var(--line)', background: activeTab === 'Signed' ? '#dcfce7' : '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>تم التوقيع</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#15803d', marginTop: '4px' }}>{countSigned}</div>
        </button>
        <button onClick={() => setActiveTab('All')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: activeTab === 'All' ? '2px solid var(--navy-950)' : '1px solid var(--line)', background: activeTab === 'All' ? '#f8fafc' : '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>جميع العقود المعتمدة</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--navy-950)', marginTop: '4px' }}>{countAll}</div>
        </button>
      </div>

      <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="بحث بالاسم أو الكود..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none', width: '220px' }} />
        <input list="deptList" placeholder="الإدارة (اكتب للبحث)..." value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '10px', outline: 'none', width: '160px' }} />
        <datalist id="deptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>
        <button onClick={() => { setSearchTerm(''); setSelectedDept(''); }} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>
      </div>

      <div className="table-responsive" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', borderRadius: '8px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)' }}>جاري تحميل العقود المعتمدة...</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '10.5px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', textAlign: 'center', width: '30px' }}>
                  <input 
                    type="checkbox" 
                    onChange={e => {
                      // 🌟 تمكين التحديد الشامل لجميع الطلبات المعروضة لسهولة الحذف
                      const selectableIds = filteredRequests.map(r => r.request_id);
                      setSelectedIds(e.target.checked ? selectableIds : []);
                    }} 
                    checked={selectedIds.length > 0 && selectedIds.length === filteredRequests.length}
                  />
                </th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>رقم الطلب</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الكود</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الموظف</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الإدارة</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>مدة التجديد</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>تاريخ الانتهاء الجديد</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>حالة التوقيع</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', textAlign: 'center' }}>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>لا توجد عقود مطابقة.</td></tr>
              ) : filteredRequests.map((req) => (
                <tr key={req.request_id} style={{ borderBottom: '1px solid var(--line)', background: selectedIds.includes(req.request_id) ? '#f8fafc' : 'transparent' }}>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(req.request_id)} 
                      onChange={e => setSelectedIds(e.target.checked ? [...selectedIds, req.request_id] : selectedIds.filter(id => id !== req.request_id))} 
                    />
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: 'var(--muted)' }}>{req.request_id}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--brass-600)' }}>{req.employee_code}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{req.employee_name}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{req.department || '—'}</td>
                  
                  <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#15803d' }}>
                    {req.renewal_months ? `${req.renewal_months} شهور` : 'تاريخ مخصص'}
                  </td>

                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 'bold', color: '#0f172a' }}>
                    {req.new_contract_end_date || '—'}
                  </td>
                  
                  <td style={{ padding: '8px 10px' }}>
                    {req.signature_status === 'تم التوقيع' ? 
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>تم التوقيع ✍️</span>
                      : 
                      <span style={{ background: '#fff7ed', color: '#ea580c', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>ينتظر التوقيع ⏳</span>
                    }
                  </td>
                  
                  <td style={{ padding: '8px 10px', textAlign: 'center', display: 'flex', gap: '5px', justifyContent: 'center' }}>
                    
                    {/* 🌟 زر الحذف الفردي */}
                    <button 
                      onClick={() => handleDelete(req.request_id)} 
                      disabled={actionLoading}
                      style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: actionLoading ? 'wait' : 'pointer' }}
                    >
                      حذف 🗑️
                    </button>

                    <button 
                      onClick={() => handleGeneratePDF(req)} 
                      disabled={actionLoading}
                      style={{ background: '#0284c7', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: actionLoading ? 'wait' : 'pointer' }}
                    >
                      📄 تصدير
                    </button>

                    {req.signature_status !== 'تم التوقيع' ? (
                      <button onClick={() => handleSign(req.request_id)} disabled={actionLoading} style={{ background: 'var(--navy-950)', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>
                        توقيع ✍️
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
