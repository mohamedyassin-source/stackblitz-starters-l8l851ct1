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
  
  // حالة لفتح وإغلاق نافذة المعاينة
  const [previewContract, setPreviewContract] = useState<any>(null);

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

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* 🌟 استايلات احترافية لضبط الطباعة والعقد */}
      <style>{`
        @media print {
          .hide-on-print { display: none !important; }
          .print-only { display: block !important; position: static !important; overflow: visible !important; background: white !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; width: 100% !important; height: 100% !important;}
          @page { margin: 15mm 20mm; size: A4 portrait; }
          body { background: #fff; margin: 0; }
        }
        .data-value {
          display: inline-block;
          border-bottom: 1.5px dotted #1e293b;
          min-width: 150px;
          text-align: center;
          font-weight: bold;
          color: #0f172a;
          padding: 0 8px;
        }
        .contract-text {
          text-align: justify;
          text-justify: inter-word;
          line-height: 2.2;
          font-size: 16px;
        }
      `}</style>

      {/* محتوى الصفحة الرئيسية */}
      <div className="hide-on-print">
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
                  <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>المدة</th>
                  <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>تاريخ الانتهاء الجديد</th>
                  <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>الحالة</th>
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
                      
                      <button 
                        onClick={() => setPreviewContract(req)} 
                        style={{ background: '#0284c7', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        📄 معاينة العقد
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

      {/* 🌟 نافذة العقد الرسمية المطبوعة */}
      {previewContract && (
        <div className="print-only" style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
          background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', 
          justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: '20px'
        }}>
          {/* حاوية ورقة A4 */}
          <div style={{
            background: '#fff', width: '210mm', minHeight: '297mm', padding: '25mm 20mm',
            boxShadow: '0 0 15px rgba(0,0,0,0.3)', position: 'relative', direction: 'rtl',
            fontFamily: 'Arial, "Sakkal Majalla", "Traditional Arabic", sans-serif', color: '#000', margin: 'auto'
          }}>
            
            {/* شريط التحكم (يختفي عند الطباعة) */}
            <div className="hide-on-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', borderBottom: '1px solid #ccc', paddingBottom: '15px' }}>
              <button onClick={() => setPreviewContract(null)} style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق المعاينة ❌</button>
              <button onClick={handlePrint} style={{ background: '#15803d', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>طباعة / حفظ PDF 🖨️</button>
            </div>

            {/* --- بداية التصميم الرسمي للعقد --- */}
            <div style={{ fontWeight: 'bold', fontSize: '24px', marginBottom: '10px' }}>ALMARASEM</div>
            <div style={{ textAlign: 'center', margin: '20px 0 35px' }}>
                <h2 style={{ margin: 0, fontSize: '22px', textDecoration: 'underline', fontWeight: 'bold' }}>عقد عمل محدد المدة</h2>
            </div>
            
            <div style={{ fontSize: '17px', marginBottom: '20px' }}>
                انه في يوم : <span className="data-value">{new Date().toLocaleDateString('ar-EG', { weekday: 'long' })}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; الموافق : <span className="data-value">{new Date().toLocaleDateString('ar-EG')}</span><br/><br/>
                قد تحرر هذا العقد بين كل من :-
            </div>

            {/* الطرف الأول */}
            <div style={{ fontSize: '17px', marginBottom: '25px' }}>
                <strong>أولاً : شركة المراسم لتنمية وادرة الاصول</strong><br/>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span>ويمثلها السيد : <strong>أسامه محمد زيدان عبدالله</strong></span>
                   <strong>بالطرف الأول</strong>
                </div>
            </div>

            {/* الطرف الثاني */}
            <div style={{ fontSize: '17px', marginBottom: '25px' }}>
                <strong>ثانياً : السيد :</strong> <span className="data-value" style={{ minWidth: '300px' }}>{previewContract.employee_name || ' '}</span><br/>
                <div style={{ marginTop: '10px' }}>
                   العنوان : <span className="data-value" style={{ width: '85%' }}>{previewContract.address || ' '}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                   <span>بطاقة رقم : <span className="data-value" style={{ minWidth: '200px' }}>{previewContract.national_id || ' '}</span></span>
                   <span>محافظة الميلاد : <span className="data-value">{previewContract.birth_gov || ' '}</span></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                   <span>ويشار اليه في هذا العقد</span>
                   <strong>بالطرف الثاني</strong>
                </div>
            </div>

            <div className="contract-text">
                <strong style={{ fontSize: '17px' }}>تمهيد :</strong><br/>
                حيث أن الشركة تقوم ببعض العمليات المؤقته في إدارة / مشروع <span className="data-value" style={{ minWidth: '200px' }}>{previewContract.department || ' '}</span> مما يستلزم ذلك إستخدام بعض الموظفين للعمل، ومن المتفق عليه بين الطرفين المتعاقدين أن هذا العقد ينتهى بأنتهاء مدته أو بإنتهاء المشروع أو بإنتهاء عمل الموظف أيهما أقل طبقاً لما يراه الطرف الأول سواء بالنقل الى مشروع أخر أو إنهاء الخدمة.<br/>
                وعلى ذلك فقد إتفق الطرفان على ما يأتي :
            </div>

            <div className="contract-text" style={{ marginTop: '20px' }}>
                1- إعتبار هذا التمهيد السابق جزء لا يتجزء من هذا العقد.<br/>
                2- مدة هذا العقد تبدأ من <span className="data-value">{previewContract.start_date || ' '}</span> وتنتهى في <span className="data-value">{previewContract.new_contract_end_date || ' '}</span>.<br/>
                3- ينتهى هذا العقد بانتهاء مدته أو بانتهاء العمل الموكل للموظف أى المدتين أقرب أو أقل طبقا لما يراه الطرف الأول دون التزام الطرف الأول بأداء لأى مكافأة أو تعويض عدا ما يقرره قانون العمل المصرى رقم 12 لسنة 2003.<br/>
                4- يجدد هذا العقد بإخطار كتابي قبل تاريخ إنتهائه بشهر واحد على الأقل.<br/>
                5- يعمل الطرف الثاني بمهنة : <span className="data-value">{previewContract.job_title || ' '}</span> بمرتب وقدره <span className="data-value">{previewContract.salary ? previewContract.salary + ' جنيه' : ' '}</span><br/>
                <span className="data-value" style={{ width: '80%' }}>{previewContract.salary_in_words || ' '}</span> فقط لا غير.<br/>
                6- يقر الطرف الثاني أن محله المختار هو العنوان الموضح بصدر هذا العقد وكل خطاب أو إعلان يرسل له عليه يعتبر قانونيا ما لم يخطر الشركة بكتاب بتغيير عنوانه.<br/>
                7- يخضع هذا العقد لأحكام قانون العمل رقم 12 لسنة 2003 ولائحتى العمل الداخلية والجزاءات المعمول بها حاليا أو مستقبلا وهما يعتبران جزء لا يتجزء من هذا العقد.<br/>
                8- يحق للطرف الأول أن يطلب من الطرف الثاني العمل في أي مشروع / فرع للشركة بداخل جمهورية مصر العربية أو خارجها، وكذلك تغيير مواقيت بدء وانتهاء فترة العمل الرسمية (الورديات) وذلك وفقا لمقتضيات العمل التي يقدرها الطرف الأول.<br/>
                9- لا يحق لأي من الطرفين إنهاء هذا العقد إلا بعد إخطار الطرف الآخر بمدة لا تقل عن شهر من رغبته في الإنهاء.<br/>
                10- حرر هذا العقد من أربع نسخ لكل طرف نسخة والنسخة الثالثة للتأمينات الاجتماعية والنسخة الرابعة الى الجهة الادارية المختصة.
            </div>

            <table style={{ width: '100%', textAlign: 'center', fontSize: '18px', marginTop: '50px', fontWeight: 'bold' }}>
                <tbody>
                  <tr>
                      <td style={{ width: '50%' }}>الطرف الأول</td>
                      <td style={{ width: '50%' }}>الطرف الثاني<br/><span style={{ fontSize: '13px', fontWeight: 'normal' }}>استلمت نسخه من العقد</span></td>
                  </tr>
                  <tr>
                      <td style={{ paddingTop: '80px' }}>.......................................</td>
                      <td style={{ paddingTop: '80px' }}>.......................................</td>
                  </tr>
                </tbody>
            </table>

            <div style={{ position: 'absolute', bottom: '30px', right: '20mm', left: '20mm', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#333' }}>
                <span>FM-HR-ER-024</span>
                <span>{previewContract.employee_code || ' '}</span>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
