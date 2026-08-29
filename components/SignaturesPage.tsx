'use client';
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';

export default function SignaturesPage() {
  const { renewals, loading, refresh: fetchApprovedRequests } = useAppData();
  
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

  // 🌟 دالة إنشاء وتحميل العقد بصيغة PDF
  const handleGeneratePDF = async (req: any) => {
    try {
      // استيراد المكتبة ديناميكياً لتجنب مشاكل الريندر في Next.js
      // @ts-ignore
      const html2pdf = (await import('html2pdf.js')).default;
      
      // تصميم العقد (يمكنك تعديل النصوص والألوان كما تشاء هنا)
      const element = document.createElement('div');
      element.innerHTML = `
        <div style="padding: 40px; direction: rtl; font-family: Arial, sans-serif; color: #000; text-align: right;">
            <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
                <h1 style="margin: 0; font-size: 24px;">عـقـد عـمـل</h1>
            </div>
            
            <p style="font-size: 16px; line-height: 2;">
                إنه في يوم الموافق <strong>${new Date().toLocaleDateString('ar-EG')}</strong>، تم الاتفاق والتعاقد بين كل من:
            </p>
            
            <p style="font-size: 16px; line-height: 2;">
                <strong>الطرف الأول:</strong> شركة (اكتب اسم شركتك هنا) <br/>
                <strong>الطرف الثاني:</strong> السيد/ة <strong>${req.employee_name}</strong> - الكود الوظيفي: <strong>${req.employee_code}</strong>
            </p>
            
            <p style="font-size: 16px; line-height: 2;">
                بموجب هذا العقد، تم الاتفاق على تجديد عقد العمل الخاص بالطرف الثاني للعمل بقسم (<strong>${req.department || '—'}</strong>).<br/>
                وقد تم الاتفاق على أن تكون مدة التجديد: <strong>${req.renewal_months ? `${req.renewal_months} شهور` : 'حسب المتفق عليه'}</strong>.<br/>
                تاريخ بداية العقد: <span style="font-weight: bold; color: #15803d;">${req.start_date || 'غير محدد'}</span> <br/>
                تاريخ نهاية العقد: <span style="font-weight: bold; color: #dc2626;">${req.new_contract_end_date || 'غير محدد'}</span>
            </p>

            <br/><br/><br/><br/>
            
            <table style="width: 100%; text-align: center; font-size: 16px; margin-top: 50px;">
                <tr>
                    <td style="width: 50%;"><strong>توقيع الطرف الأول (الشركة)</strong></td>
                    <td style="width: 50%;"><strong>توقيع الطرف الثاني (الموظف)</strong></td>
                </tr>
                <tr>
                    <td style="padding-top: 50px;">.......................................</td>
                    <td style="padding-top: 50px;">.......................................</td>
                </tr>
            </table>
        </div>
      `;

      // إعدادات ملف الـ PDF
      const opt = {
        margin: 10,
        filename: `عقد_عمل_${req.employee_name}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      // تحويل التصميم إلى PDF وتنزيله
      html2pdf().from(element).set(opt).save();

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('حدث خطأ أثناء تصدير العقد كـ PDF.');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--navy-950)' }}>توقيعات العقود المعتمدة</h3>
          <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--muted)' }}>إدارة العقود التي تم اعتمادها وتنتظر توقيع الموظفين</p>
        </div>
        <button onClick={() => handleSign()} disabled={selectedIds.length === 0 || actionLoading} style={{ background: 'var(--brass-600)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer', opacity: selectedIds.length === 0 ? 0.5 : 1 }}>
          ✍️ توقيع مجمع ({selectedIds.length})
        </button>
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
                      const selectableIds = filteredRequests.filter(r => r.signature_status !== 'تم التوقيع').map(r => r.request_id);
                      setSelectedIds(e.target.checked ? selectableIds : []);
                    }} 
                    checked={selectedIds.length > 0 && selectedIds.length === filteredRequests.filter(r => r.signature_status !== 'تم التوقيع').length}
                    disabled={activeTab === 'Signed'} 
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
                      disabled={req.signature_status === 'تم التوقيع'} 
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
                    
                    {/* 🌟 الزر الجديد لإنشاء الـ PDF */}
                    <button 
                      onClick={() => handleGeneratePDF(req)} 
                      style={{ background: '#0284c7', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      📄 إنشاء العقد PDF
                    </button>

                    {req.signature_status !== 'تم التوقيع' ? (
                      <button onClick={() => handleSign(req.request_id)} disabled={actionLoading} style={{ background: 'var(--navy-950)', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>
                        تسجيل التوقيع ✍️
                      </button>
                    ) : null }
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
