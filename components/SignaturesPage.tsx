''use client';

import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';


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
  
  // 🌟 سحب الطلبات المعتمدة فقط (التي وصلت لهذه المرحلة)
  const requests = useMemo(() => {
    return renewals
      .filter((r) => r.status === 'Approved')
      .sort((a, b) => String(b.request_id).localeCompare(String(a.request_id)));
  }, [renewals]);
  
  const [actionLoading, setActionLoading] = useState(false);
  
  // 🗂️ فلتر الكروت العلوية (بدلاً من الأزرار القديمة)
  const [activeFilterCard, setActiveFilterCard] = useState<'all' | 'pending_signature' | 'signed'>('pending_signature');

  // 🔃 حالات الترتيب
  const [sortColumn, setSortColumn] = useState<string>('request_id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const getEmployeeRecord = (req: any) =>
    employees.find((e: any) => (req.employee_id && (e.id === req.employee_id || e.employee_id === req.employee_id)) || String(e.employee_code) === String(req.employee_code));

  const deptsList = Array.from(new Set(requests.map(r => r.department).filter(Boolean)));

  // 🌟 نظام الفلترة الذكي
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      // فلتر الكروت
      if (activeFilterCard === 'pending_signature' && req.signature_status === 'تم التوقيع') return false;
      if (activeFilterCard === 'signed' && req.signature_status !== 'تم التوقيع') return false;
      
      // فلتر البحث
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term || String(req.employee_code).toLowerCase().includes(term) || String(req.employee_name).toLowerCase().includes(term) || String(req.request_id).toLowerCase().includes(term);
      const matchesDept = !selectedDept || req.department === selectedDept;
      
      return matchesSearch && matchesDept;
    });
  }, [requests, activeFilterCard, searchTerm, selectedDept]);

  // 🔃 الترتيب
  const sortedRequests = useMemo(() => {
    return [...filteredRequests].sort((a, b) => {
      let valA: any = a[sortColumn] || '';
      let valB: any = b[sortColumn] || '';

      const res = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? res : -res;
    });
  }, [filteredRequests, sortColumn, sortDirection]);

  // 📊 حسابات الكروت
  const totalAll = requests.length;
  const countPending = requests.filter(r => r.signature_status !== 'تم التوقيع').length;
  const countSigned = requests.filter(r => r.signature_status === 'تم التوقيع').length;
  const calcPct = (val: number) => totalAll > 0 ? ((val / totalAll) * 100).toFixed(1) : '0';

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const renderSortArrow = (colKey: string) => {
    if (sortColumn !== colKey) return <span style={{ opacity: 0.3, marginRight: '4px' }}>↕</span>;
    return sortDirection === 'asc' ? <span style={{ color: '#4f46e5', marginRight: '4px' }}>▲</span> : <span style={{ color: '#4f46e5', marginRight: '4px' }}>▼</span>;
  };

  // ✍️ دالة التوقيع (فردي ومجمع)
  const handleSign = async (reqId?: string) => {
    const idsToSign = reqId ? [reqId] : selectedIds;
    if (idsToSign.length === 0) return alert('يرجى تحديد عقد واحد على الأقل للتوقيع.');

    const confirmSign = window.confirm(`هل أنت متأكد من إتمام توقيع عدد (${idsToSign.length}) عقد؟\nسيتم تحديث سجل الموظفين فوراً.`);
    if (!confirmSign) return;

    setActionLoading(true);
    try {
      const updatePromises = idsToSign.map(async (id) => {
        // تحديث حالة التوقيع
        await supabase.from('renewal_requests').update({ signature_status: 'تم التوقيع' }).eq('request_id', id);
        
        // جلب بيانات الطلب لتحديث سجل الموظف والعقد
        const req = requests.find(r => r.request_id === id);
        if (req && req.new_contract_end_date) {
          await supabase.from('employees').update({ contract_end_date: req.new_contract_end_date }).eq('employee_code', req.employee_code);
          await supabase.from('contracts').update({ contract_end_date: req.new_contract_end_date }).eq('employee_code', req.employee_code).eq('status', 'Active');
        }
      });

      await Promise.all(updatePromises);
      alert('تم تسجيل التوقيع وتحديث تواريخ الموظفين بنجاح ✍️✅');
      
      setSelectedIds([]);
      await fetchApprovedRequests();
    } catch (err: any) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 🗑️ دالة الحذف (فردي ومجمع)
  const handleDelete = async (reqId?: string) => {
    const idsToDelete = reqId ? [reqId] : selectedIds;
    if (idsToDelete.length === 0) return alert('يرجى تحديد طلب واحد على الأقل للحذف.');

    const confirmDelete = window.confirm(`هل أنت متأكد من حذف عدد (${idsToDelete.length}) طلب تجديد نهائياً؟\n\nتنبيه: سيتم مسح الطلب من صفحة التوقيعات نهائياً.`);
    if (!confirmDelete) return;

    setActionLoading(true);
    try {
      const { error } = await supabase.from('renewal_requests').delete().in('request_id', idsToDelete);
      if (error) throw error;

      alert('تم حذف الطلبات بنجاح 🗑️✅');
      setSelectedIds([]);
      await fetchApprovedRequests(); 
    } catch (err: any) {
      alert('حدث خطأ أثناء الحذف: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 📄 دالة توليد الـ PDF 
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

      const element = document.createElement('div');
      element.innerHTML = `
        <div style="position: relative; width: 210mm; height: 297mm; background: #fff; overflow: hidden; font-family: Arial, sans-serif; font-size: 15px; font-weight: bold; color: #000; direction: rtl;">
            <img src="/contract-bg.jpg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;" />
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

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const selectableIds = sortedRequests.map(r => r.request_id);
      setSelectedIds(selectableIds);
    } else {
      setSelectedIds([]);
    }
  };

  return (
    <div style={{ paddingBottom: '40px', direction: 'rtl' }}>
      
      {/* 🌟 تصميم Enterprise Cards */}
      <style>{`
        .modern-stat-card {
          background: #ffffff;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          border-right: 4px solid var(--theme-color);
          border-bottom: 4px solid var(--theme-color);
          padding: 16px;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 90px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .modern-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08);
          background: #f8fafc;
        }
        .modern-stat-card.active {
          background: #f8fafc;
          border-color: var(--theme-color);
          box-shadow: 0 0 0 1px var(--theme-color) inset;
        }
        .card-icon-box {
          width: 32px; height: 32px;
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
          background: var(--icon-bg);
          color: var(--theme-color);
        }
        .db-action-bar { background: #0f172a; color: #fff; padding: 12px 20px; border-radius: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; animation: fadeIn 0.3s; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2); }
      `}</style>

      {/* الهيدر */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900' }}>📄 توقيعات العقود وأرشفتها</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>إدارة النماذج المعتمدة لطباعتها وتوثيق استلام توقيع الموظف عليها</p>
        </div>
      </div>

      {/* 📊 الكروت العلوية بالتصميم المستطيل (Enterprise) */}
      <div className="no-print" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          
          {/* كارت 1 (أزرق) */}
          <div className={`modern-stat-card ${activeFilterCard === 'all' ? 'active' : ''}`} style={{ '--theme-color': '#3b82f6', '--icon-bg': '#eff6ff' } as React.CSSProperties} onClick={() => setActiveFilterCard('all')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>جميع النماذج المعتمدة</span>
              <div className="card-icon-box">📋</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{totalAll}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>100% (إجمالي)</div>
            </div>
          </div>

          {/* كارت 2 (برتقالي) */}
          <div className={`modern-stat-card ${activeFilterCard === 'pending_signature' ? 'active' : ''}`} style={{ '--theme-color': '#f97316', '--icon-bg': '#fff7ed' } as React.CSSProperties} onClick={() => setActiveFilterCard('pending_signature')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>بانتظار التوقيع والطباعة</span>
              <div className="card-icon-box">⏳</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{countPending}</div>
              <div style={{ fontSize: '11px', color: '#f97316', fontWeight: 'bold' }}>{calcPct(countPending)}% جاهزة</div>
            </div>
          </div>

          {/* كارت 3 (أخضر) */}
          <div className={`modern-stat-card ${activeFilterCard === 'signed' ? 'active' : ''}`} style={{ '--theme-color': '#10b981', '--icon-bg': '#ecfdf5' } as React.CSSProperties} onClick={() => setActiveFilterCard('signed')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>تم التوقيع والتحديث</span>
              <div className="card-icon-box">✅</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{countSigned}</div>
              <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}>{calcPct(countSigned)}% منجزة</div>
            </div>
          </div>

        </div>
      </div>

      {/* شريط الإجراءات السريعة للمحددين */}
      {selectedIds.length > 0 && (
        <div className="db-action-bar">
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
            تم تحديد <span style={{ color: '#38bdf8', fontSize: '14px' }}>{selectedIds.length}</span> نماذج معتمدة
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => handleSign()} disabled={actionLoading} style={{ background: '#10b981', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
              ✍️ إثبات التوقيع المجمع
            </button>
            <button onClick={() => handleDelete()} disabled={actionLoading} style={{ background: '#ef4444', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: actionLoading ? 'not-allowed' : 'pointer' }}>
              🗑️ حذف النماذج المحددة
            </button>
            <button onClick={() => setSelectedIds([])} style={{ background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer' }}>
              إلغاء التحديد ✕
            </button>
          </div>
        </div>
      )}

      {/* 🌟 شريط الفلاتر والبحث */}
      <div className="no-print" style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', direction: 'rtl', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="بحث بالاسم أو الكود أو رقم الطلب..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', minWidth: '220px', fontWeight: 'bold' }} />
          
          <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
            <option value="">الإدارة (الكل)</option>
            {deptsList.map((d: any, i) => (<option key={i} value={d}>{d}</option>))}
          </select>

          <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setActiveFilterCard('pending_signature'); }} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '10px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', color: '#334155', cursor: 'pointer' }}>
            إعادة ضبط
          </button>
        </div>
        <div style={{ fontSize: '12px', fontWeight: '900', color: '#0f172a' }}>
          المعروض بالجدول: <span style={{ color: '#4f46e5' }}>{sortedRequests.length}</span> نماذج
        </div>
      </div>

      {/* 🚀 الجدول الرئيسي مع الترتيب */}
      <div className="table-responsive no-print" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', color: '#64748b' }}>جاري سحب النماذج المعتمدة... ⏳</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'center', width: '40px' }}>
                  <input type="checkbox" checked={selectedIds.length > 0 && selectedIds.length === sortedRequests.length} onChange={handleSelectAll} style={{ cursor: 'pointer', accentColor: '#4f46e5' }} />
                </th>
                <th onClick={() => handleSort('request_id')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>رقم الطلب {renderSortArrow('request_id')}</th>
                <th onClick={() => handleSort('employee_code')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الكود {renderSortArrow('employee_code')}</th>
                <th onClick={() => handleSort('employee_name')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الموظف {renderSortArrow('employee_name')}</th>
                <th onClick={() => handleSort('department')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>الإدارة {renderSortArrow('department')}</th>
                <th onClick={() => handleSort('renewal_months')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>المدة المعتمدة {renderSortArrow('renewal_months')}</th>
                <th onClick={() => handleSort('new_contract_end_date')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>الانتهاء الجديد {renderSortArrow('new_contract_end_date')}</th>
                <th onClick={() => handleSort('signature_status')} style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>حالة التوقيع {renderSortArrow('signature_status')}</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {sortedRequests.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا توجد نماذج متوفرة لهذه الحالة 🔍</td></tr>
              ) : sortedRequests.map((req) => {
                const isSigned = req.signature_status === 'تم التوقيع';

                return (
                  <tr key={req.request_id} style={{ borderBottom: '1px solid #f1f5f9', background: selectedIds.includes(req.request_id) ? '#eef2ff' : 'transparent', transition: 'background 0.2s' }}>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedIds.includes(req.request_id)} onChange={e => setSelectedIds(e.target.checked ? [...selectedIds, req.request_id] : selectedIds.filter(id => id !== req.request_id))} style={{ cursor: 'pointer', accentColor: '#4f46e5' }} />
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#64748b', fontFamily: 'monospace' }}>{req.request_id}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#4f46e5', fontFamily: 'monospace' }}>{req.employee_code}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#0f172a' }}>{req.employee_name}</td>
                    <td style={{ padding: '12px', color: '#64748b', fontWeight: '500' }}>{req.department || '—'}</td>
                    
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ color: '#0f172a', fontWeight: 'bold', background: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', fontSize: '10px' }}>
                        {req.renewal_months ? `${req.renewal_months} شهور` : 'مخصص'}
                      </span>
                    </td>
                    
                    <td style={{ padding: '12px', fontWeight: 'bold', fontFamily: 'monospace', textAlign: 'center' }}>
                      {req.new_contract_end_date || '—'}
                    </td>
                    
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {isSigned ? 
                        <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #bbf7d0' }}>تم التوقيع ✅</span>
                        :
                        <span style={{ background: '#fff7ed', color: '#ea580c', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #fed7aa' }}>بانتظار التوقيع ⏳</span>
                      }
                    </td>
                    
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        
                        {/* 🌟 زر التوقيع الفردي */}
                        {!isSigned && (
                          <button onClick={() => handleSign(req.request_id)} disabled={actionLoading} title="إثبات التوقيع وتحديث السجل" style={{ background: '#10b981', color: '#ffffff', border: 0, padding: '6px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: actionLoading ? 'wait' : 'pointer', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' }}>
                            ✍️ توقيع
                          </button>
                        )}

                        {/* 🌟 زر الطباعة والتصدير (محفوظ بدون تغيير لضمان عمل الإحداثيات) */}
                        <button onClick={() => handleGeneratePDF(req)} disabled={actionLoading} title="طباعة عقد جديد PDF" style={{ background: '#f8fafc', color: '#4f46e5', border: '1px solid #c7d2fe', padding: '6px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: actionLoading ? 'wait' : 'pointer' }}>
                          🖨️ طباعة
                        </button>
                        
                        {/* 🌟 زر الحذف الفردي */}
                        <button onClick={() => handleDelete(req.request_id)} disabled={actionLoading} title="حذف الطلب نهائياً" style={{ background: '#ffffff', color: '#dc2626', border: '1px solid #fecaca', padding: '6px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: actionLoading ? 'wait' : 'pointer' }}>
                          🗑️
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
