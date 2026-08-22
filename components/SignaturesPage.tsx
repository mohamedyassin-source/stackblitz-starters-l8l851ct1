'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function SignaturesPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // حالات Slicers
  const [activeTab, setActiveTab] = useState<'PendingSignature' | 'Signed' | 'All'>('PendingSignature');

  // حالات الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    fetchApprovedRequests();
  }, []);

  const fetchApprovedRequests = async () => {
    setLoading(true);
    // نجلب فقط الطلبات المعتمدة لأنها هي التي تحتاج توقيع
    const { data } = await supabase.from('renewal_requests').select('*').eq('status', 'Approved').order('request_id', { ascending: false });
    if (data) setRequests(data);
    setLoading(false);
  };

  const deptsList = Array.from(new Set(requests.map(r => r.department).filter(Boolean)));

  const filteredRequests = requests.filter(req => {
    // فلتر التبويبات
    if (activeTab === 'PendingSignature' && req.signature_status === 'تم التوقيع') return false;
    if (activeTab === 'Signed' && req.signature_status !== 'تم التوقيع') return false;
    
    // فلتر البحث
    const term = searchTerm.toLowerCase();
    const matchesSearch = !term || String(req.employee_code).toLowerCase().includes(term) || String(req.employee_name).toLowerCase().includes(term) || String(req.request_id).toLowerCase().includes(term);
    const matchesDept = !selectedDept || req.department === selectedDept;
    
    return matchesSearch && matchesDept;
  });

  const countPending = requests.filter(r => r.signature_status !== 'تم التوقيع').length;
  const countSigned = requests.filter(r => r.signature_status === 'تم التوقيع').length;
  const countAll = requests.length;

  // 🌟 دالة تنفيذ التوقيع (فردي ومجمع)
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
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>حالة التوقيع</th>
                <th style={{ padding: '10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', textAlign: 'center' }}>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>لا توجد عقود مطابقة.</td></tr>
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
                  <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#15803d' }}>{req.renewal_months || 12} شهور</td>
                  
                  <td style={{ padding: '8px 10px' }}>
                    {req.signature_status === 'تم التوقيع' ? 
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>تم التوقيع ✍️</span>
                      : 
                      <span style={{ background: '#fff7ed', color: '#ea580c', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>ينتظر التوقيع ⏳</span>
                    }
                  </td>
                  
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    {req.signature_status !== 'تم التوقيع' ? (
                      <button onClick={() => handleSign(req.request_id)} disabled={actionLoading} style={{ background: 'var(--navy-950)', color: '#fff', border: 0, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>
                        تسجيل التوقيع ✍️
                      </button>
                    ) : (
                      <button style={{ background: '#f1f5f9', color: 'var(--muted)', border: '1px solid var(--line)', padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>
                        🖨️ طباعة العقد
                      </button>
                    )}
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