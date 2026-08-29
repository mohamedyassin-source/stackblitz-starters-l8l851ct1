'use client';
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';

// أسماء أيام الأسبوع بالعربي
const ARABIC_WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function formatArabicDate(d: Date) {
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

// يحسب أول يوم في مدة التجديد الجديدة = اليوم التالي لتاريخ انتهاء العقد القديم
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

  // حالات Slicers
  const [activeTab, setActiveTab] = useState<'PendingSignature' | 'Signed' | 'All'>('PendingSignature');

  // حالات الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 🌟 نافذة معاينة وطباعة العقد
  const [previewContract, setPreviewContract] = useState<any>(null);

  // إيجاد بيانات الموظف الكاملة (المسمى الوظيفي، الرقم القومي...) المرتبطة بطلب التجديد
  const getEmployeeRecord = (req: any) =>
    employees.find((e: any) => (req.employee_id && (e.id === req.employee_id || e.employee_id === req.employee_id)) || e.employee_code === req.employee_code);

  const handlePrint = () => window.print();

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

  return (
    <>
      {/* 🌟 CSS سحري لعزل العقد تماماً وإخفاء أي شيء آخر في الموقع أثناء الطباعة */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-contract, #printable-contract * {
            visibility: visible;
          }
          #printable-contract {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm;
            margin: 0;
            padding: 15mm;
            background: #fff;
          }
          @page { size: A4 portrait; margin: 0; }
          .hide-on-print { display: none !important; }
        }
      `}</style>

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
                      <button onClick={() => setPreviewContract(req)} style={{ background: '#0284c7', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>
                        📄 معاينة وطباعة
                      </button>

                      {req.signature_status !== 'تم التوقيع' ? (
                        <button onClick={() => handleSign(req.request_id)} disabled={actionLoading} style={{ background: 'var(--navy-950)', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>
                          تسجيل التوقيع ✍️
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

      {/* 🌟 نافذة معاينة العقد بالشكل الرسمي (مطابق لنموذج M-Contract) */}
      {previewContract && (() => {
        const emp = getEmployeeRecord(previewContract);
        const today = new Date();
        const dayName = ARABIC_WEEKDAYS[today.getDay()];
        const todayStr = formatArabicDate(today);
        const startDate = addOneDay(previewContract.contract_end_date) || formatDate(emp?.contract_start_date) || '';
        const endDate = formatDate(previewContract.new_contract_end_date) || '';

        return (
          <div className="hide-on-print" style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex',
            justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: '20px'
          }}>
            
            {/* أزرار التحكم - تظهر فوق العقد في المعاينة فقط */}
            <div style={{ position: 'fixed', top: '20px', display: 'flex', gap: '15px', zIndex: 10000 }}>
              <button onClick={handlePrint} style={{ background: '#15803d', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>طباعة / حفظ PDF 🖨️</button>
              <button onClick={() => setPreviewContract(null)} style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>إغلاق ❌</button>
            </div>

            {/* ورقة العقد (التي ستُطبع) */}
            <div id="printable-contract" style={{
              background: '#fff', width: '210mm', minHeight: '297mm', padding: '20mm 20mm',
              boxShadow: '0 0 15px rgba(0,0,0,0.3)', position: 'relative', direction: 'rtl',
              fontFamily: '"Times New Roman", Arial, serif', color: '#000', margin: '60px auto 0', boxSizing: 'border-box'
            }}>

              <div style={{ textAlign: 'left', fontWeight: 'bold', fontSize: '20px', marginBottom: '20px' }}>ALMARASEM</div>
              <h2 style={{ textAlign: 'center', fontSize: '24px', textDecoration: 'underline', margin: '0 0 30px 0' }}>عقد عمل محدد المدة</h2>
              
              {/* سطر التاريخ */}
              <div style={{ display: 'flex', fontSize: '16px', marginBottom: '25px', alignItems: 'flex-end' }}>
                <span>انه في يوم </span>
                <span style={{ borderBottom: '1.5px dashed #000', flex: 1, textAlign: 'center', margin: '0 10px', fontWeight: 'bold' }}>{dayName}</span>
                <span>الموافق : </span>
                <span style={{ borderBottom: '1.5px dashed #000', flex: 1, textAlign: 'center', margin: '0 10px', fontWeight: 'bold' }}>{todayStr}</span>
              </div>

              <div style={{ fontSize: '16px', marginBottom: '20px' }}>
                قد تحرر هذا العقد بين كل من :-
              </div>

              {/* الطرف الأول */}
              <div style={{ fontSize: '16px', marginBottom: '25px', lineHeight: '1.8' }}>
                <div><strong>أولاً : شركة المراسم لتنمية وادرة الاصول</strong></div>
                <div>ويمثلها السيد : <strong>أسامه محمد زيدان عبدالله</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>ويشار اليه في هذا العقد</span>
                    <strong>بالطرف الأول</strong>
                </div>
              </div>

              {/* الطرف الثاني */}
              <div style={{ fontSize: '16px', marginBottom: '25px', lineHeight: '2' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <span style={{ whiteSpace: 'nowrap' }}><strong>ثانياً : السيد : </strong></span>
                    <span style={{ borderBottom: '1.5px dashed #000', flex: 1, textAlign: 'center', margin: '0 10px', fontWeight: 'bold' }}>{previewContract.employee_name || ''}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>العنوان </span>
                    <span style={{ borderBottom: '1.5px dashed #000', flex: 1, textAlign: 'center', margin: '0 10px', fontWeight: 'bold' }}>{emp?.address || ''}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>بطاقة رقم : </span>
                    <span style={{ borderBottom: '1.5px dashed #000', flex: 2, textAlign: 'center', margin: '0 10px', fontWeight: 'bold' }}>{emp?.national_id || ''}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>محافظة الميلاد </span>
                    <span style={{ borderBottom: '1.5px dashed #000', flex: 1, textAlign: 'center', margin: '0 10px', fontWeight: 'bold' }}>{emp?.birth_gov || ''}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                    <span>ويشار اليه في هذا العقد</span>
                    <strong>بالطرف الثاني</strong>
                </div>
              </div>

              {/* تمهيد */}
              <div style={{ fontSize: '16px', marginBottom: '10px' }}><strong>تمهيد :</strong></div>
              <div style={{ fontSize: '15px', marginBottom: '20px', lineHeight: '2', textAlign: 'justify' }}>
                حيث أن الشركة تقوم ببعض العمليات المؤقته في إدارة / مشروع 
                <span style={{ borderBottom: '1.5px dashed #000', display: 'inline-block', minWidth: '250px', textAlign: 'center', margin: '0 10px', fontWeight: 'bold' }}>{previewContract.department || ''}</span> 
                مما يستلزم ذلك إستخدام بعض الموظفين للعمل، ومن المتفق عليه بين الطرفين المتعاقدين أن هذا العقد ينتهى بأنتهاء مدته أو بإنتهاء المشروع أو بإنتهاء عمل الموظف أيهما أقل طبقاً لما يراه الطرف الأول سواء بالنقل الى مشروع أخر أو إنهاء الخدمة.
              </div>
              
              <div style={{ fontSize: '16px', marginBottom: '15px' }}>
                وعلى ذلك فقد إتفق الطرفان على ما يأتي :
              </div>

              {/* البنود */}
              <div style={{ fontSize: '15px', lineHeight: '1.8', textAlign: 'justify' }}>
                <div style={{ marginBottom: '8px' }}><strong>1- </strong>إعتبار هذا التمهيد السابق جزء لا يتجزء من هذا العقد.</div>
                <div style={{ marginBottom: '8px' }}>
                    <strong>2- </strong>مدة هذا العقد تبدأ من 
                    <span style={{ borderBottom: '1.5px dashed #000', display: 'inline-block', minWidth: '120px', textAlign: 'center', margin: '0 10px', fontWeight: 'bold' }}>{startDate}</span> 
                    وتنتهى في 
                    <span style={{ borderBottom: '1.5px dashed #000', display: 'inline-block', minWidth: '120px', textAlign: 'center', margin: '0 10px', fontWeight: 'bold' }}>{endDate}</span>.
                </div>
                <div style={{ marginBottom: '8px' }}><strong>3- </strong>ينتهى هذا العقد بانتهاء مدته أو بانتهاء العمل الموكل للموظف أى المدتين أقرب أو أقل طبقا لما يراه الطرف الأول دون التزام الطرف الأول بأداء لأى مكافأة أو تعويض عدا ما يقرره قانون العمل المصرى رقم 12 لسنة 2003.</div>
                <div style={{ marginBottom: '8px' }}><strong>4- </strong>يجدد هذا العقد بإخطار كتابي قبل تاريخ إنتهائه بشهر واحد على الأقل.</div>
                <div style={{ marginBottom: '8px', lineHeight: '2' }}>
                    <strong>5- </strong>يعمل الطرف الثاني بمهنة : 
                    <span style={{ borderBottom: '1.5px dashed #000', display: 'inline-block', minWidth: '180px', textAlign: 'center', margin: '0 10px', fontWeight: 'bold' }}>{emp?.job_title || ''}</span> 
                    بمرتب وقدره 
                    <span style={{ borderBottom: '1.5px dashed #000', display: 'inline-block', minWidth: '120px', textAlign: 'center', margin: '0 10px', fontWeight: 'bold' }}>{previewContract.salary || ''}</span><br/>
                    (<span style={{ borderBottom: '1.5px dashed #000', display: 'inline-block', minWidth: '400px', textAlign: 'center', margin: '0 10px', fontWeight: 'bold' }}>{previewContract.salary_in_words || ''}</span>) فقط لا غير.
                </div>
                <div style={{ marginBottom: '8px' }}><strong>6- </strong>يقر الطرف الثاني أن محله المختار هو العنوان الموضح بصدر هذا العقد وكل خطاب أو إعلان يرسل له عليه يعتبر قانونيا ما لم يخطر الشركة بكتاب بتغيير عنوانه.</div>
                <div style={{ marginBottom: '8px' }}><strong>7- </strong>يخضع هذا العقد لأحكام قانون العمل رقم 12 لسنة 2003 ولائحتى العمل الداخلية والجزاءات المعمول بها حاليا أو مستقبلا وهما يعتبران جزء لا يتجزء من هذا العقد.</div>
                <div style={{ marginBottom: '8px' }}><strong>8- </strong>يحق للطرف الأول أن يطلب من الطرف الثاني العمل في أي مشروع / فرع للشركة بداخل جمهورية مصر العربية أو خارجها، وكذلك تغيير مواقيت بدء وانتهاء فترة العمل الرسمية (الورديات) وذلك وفقا لمقتضيات العمل التي يقدرها الطرف الأول.</div>
                <div style={{ marginBottom: '8px' }}><strong>9- </strong>لا يحق لأي من الطرفين إنهاء هذا العقد إلا بعد إخطار الطرف الآخر بمدة لا تقل عن شهر من رغبته في الإنهاء.</div>
                <div style={{ marginBottom: '8px' }}><strong>10- </strong>حرر هذا العقد من أربع نسخ لكل طرف نسخة والنسخة الثالثة للتأمينات الاجتماعية والنسخة الرابعة الى الجهة الادارية المختصة.</div>
              </div>

              {/* التوقيعات */}
              <table style={{ width: '100%', textAlign: 'center', fontSize: '16px', marginTop: '30px', fontWeight: 'bold' }}>
                  <tbody>
                      <tr>
                          <td style={{ width: '50%' }}>الطرف الأول</td>
                          <td style={{ width: '50%' }}>الطرف الثاني<br/><span style={{ fontSize: '13px', fontWeight: 'normal' }}>استلمت نسخه من العقد</span></td>
                      </tr>
                      <tr>
                          <td style={{ paddingTop: '60px' }}>.......................................</td>
                          <td style={{ paddingTop: '60px' }}>.......................................</td>
                      </tr>
                  </tbody>
              </table>

              {/* التذييل */}
              <div style={{ position: 'absolute', bottom: '15mm', right: '20mm', left: '20mm', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#000' }}>
                  <span>FM-HR-ER-024</span>
                  <span>{previewContract.employee_code || ''}</span>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
