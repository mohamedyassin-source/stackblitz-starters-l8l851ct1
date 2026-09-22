'use client';

import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  
  // حماية الصفحة (يفضل للأدمن فقط)
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('session_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed.role === 'Admin') {
          setIsAdmin(true);
          fetchRealAuditLogs();
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error('Error parsing session', e);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  // 🌟 سحب السجل الحقيقي من جدول audit_logs
  const fetchRealAuditLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs') // 👈 هنا بنقرأ من الجدول الحقيقي الشامل
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000); // نجيب أحدث 1000 حركة عشان الأداء

      if (error) throw error;
      setLogs(data || []);
    } catch (e) {
      console.error('Error fetching audit logs:', e);
    } finally {
      setLoading(false);
    }
  };

  // 🌟 تطبيق الفلاتر على البيانات الحقيقية
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // مرونة في قراءة أسماء الأعمدة حسب تصميم جدولك
      const logUser = String(log.user_name || log.user || log.created_by || '').toLowerCase();
      const logAction = String(log.action_type || log.action || '').toLowerCase();
      const logDetails = String(log.details || log.description || '').toLowerCase();
      const logDate = log.created_at ? log.created_at.split('T')[0] : '';

      const matchesSearch =
        !searchTerm ||
        logUser.includes(searchTerm.toLowerCase()) ||
        logDetails.includes(searchTerm.toLowerCase()) ||
        logAction.includes(searchTerm.toLowerCase());

      const matchesAction = !selectedAction || logAction === selectedAction.toLowerCase();
      const matchesDate = !dateFilter || logDate === dateFilter;

      return matchesSearch && matchesAction && matchesDate;
    });
  }, [logs, searchTerm, selectedAction, dateFilter]);

  // إحصائيات سريعة للحركات الحقيقية
  const stats = useMemo(() => {
    return {
      total: logs.length,
      updates: logs.filter(l => String(l.action_type || l.action).includes('تعديل') || String(l.action_type || l.action).includes('UPDATE')).length,
      deletes: logs.filter(l => String(l.action_type || l.action).includes('حذف') || String(l.action_type || l.action).includes('DELETE')).length,
      creates: logs.filter(l => String(l.action_type || l.action).includes('إضافة') || String(l.action_type || l.action).includes('CREATE')).length,
    };
  }, [logs]);

  const formatDateTime = (isoString: string) => {
    if (!isoString) return { date: '—', time: '—' };
    const d = new Date(isoString);
    return {
      date: d.toLocaleDateString('ar-EG'),
      time: d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    };
  };

  if (!loading && !isAdmin) {
    return (
      <div style={{ padding: '40px', direction: 'rtl', textAlign: 'center' }}>
        <h2 style={{ color: '#dc2626' }}>🚨 غير مصرح لك بمشاهدة سجلات المراقبة الشاملة.</h2>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '40px', direction: 'rtl' }}>
      
      <style>{`
        .enterprise-stat-card {
          background: #ffffff;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          border-right: 4px solid var(--theme-color);
          border-bottom: 4px solid var(--theme-color);
          padding: 16px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 90px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .enterprise-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08);
          background: #f8fafc;
        }
        .card-icon-box {
          width: 32px; height: 32px;
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
          background: var(--icon-bg);
          color: var(--theme-color);
        }
      `}</style>

      {/* الهيدر العلوي */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900' }}>سجل المراقبة الشامل (Audit Trail) 👁️</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>مراقبة وتتبع كافة حركات (الإضافة، التعديل، الحذف، التجديد) في النظام</p>
        </div>
        <button onClick={fetchRealAuditLogs} style={{ background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          🔄 تحديث السجل
        </button>
      </div>

      {/* 📊 مؤشرات الأداء */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="enterprise-stat-card" style={{ '--theme-color': '#475569', '--icon-bg': '#f1f5f9' } as React.CSSProperties}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>إجمالي الحركات</span>
            <div className="card-icon-box">📋</div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a' }}>{stats.total.toLocaleString()}</div>
        </div>

        <div className="enterprise-stat-card" style={{ '--theme-color': '#10b981', '--icon-bg': '#ecfdf5' } as React.CSSProperties}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>عمليات إضافة</span>
            <div className="card-icon-box">🆕</div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a' }}>{stats.creates.toLocaleString()}</div>
        </div>

        <div className="enterprise-stat-card" style={{ '--theme-color': '#3b82f6', '--icon-bg': '#eff6ff' } as React.CSSProperties}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>عمليات تعديل</span>
            <div className="card-icon-box">✏️</div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a' }}>{stats.updates.toLocaleString()}</div>
        </div>

        <div className="enterprise-stat-card" style={{ '--theme-color': '#dc2626', '--icon-bg': '#fef2f2' } as React.CSSProperties}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>عمليات حذف</span>
            <div className="card-icon-box">🗑️</div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a' }}>{stats.deletes.toLocaleString()}</div>
        </div>
      </div>

      {/* شريط الفلاتر */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <input 
          type="text" 
          placeholder="بحث في السجل (مستخدم، تفاصيل)..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', width: '280px', fontWeight: 'bold' }} 
        />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: '#f8fafc', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginLeft: '8px', paddingRight: '8px' }}>التاريخ:</span>
          <input 
            type="date" 
            value={dateFilter} 
            onChange={e => setDateFilter(e.target.value)} 
            style={{ padding: '4px 6px', border: 0, background: 'transparent', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} 
          />
        </div>

        <button onClick={() => { setSearchTerm(''); setSelectedAction(''); setDateFilter(''); }} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', color: '#334155' }}>
          إعادة ضبط
        </button>
      </div>

      {/* جدول السجل الحقيقي */}
      <div className="table-responsive" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', color: '#64748b' }}>جاري استخراج السجل التاريخي للعمليات... 🕵️‍♂️</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', width: '120px' }}>التاريخ والوقت</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', width: '180px' }}>المُستخدم (الفاعل)</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', width: '160px', textAlign: 'center' }}>نوع الحركة</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>تفاصيل العملية</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا توجد عمليات مطابقة للفلاتر الحالية.</td></tr>
              ) : (
                filteredLogs.map((log, index) => {
                  const { date, time } = formatDateTime(log.created_at);
                  const action = String(log.action_type || log.action || 'حركة غير معروفة');
                  const isDelete = action.includes('حذف') || action.includes('DELETE');
                  const isAdd = action.includes('إضافة') || action.includes('إنشاء') || action.includes('CREATE');
                  
                  return (
                    <tr key={log.id || index} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 'bold', fontFamily: 'monospace', color: '#0f172a' }}>{date}</div>
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontWeight: 'bold' }}>{time}</div>
                      </td>
                      
                      <td style={{ padding: '12px', fontWeight: 'bold', color: '#0f172a' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>👤</span>
                          {log.user_name || log.user || log.created_by || 'مجهول'}
                        </span>
                      </td>

                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ 
                          background: isDelete ? '#fef2f2' : isAdd ? '#f0fdf4' : '#eff6ff', 
                          color: isDelete ? '#dc2626' : isAdd ? '#16a34a' : '#2563eb', 
                          border: `1px solid ${isDelete ? '#fecaca' : isAdd ? '#bbf7d0' : '#bfdbfe'}`, 
                          padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', display: 'inline-block' 
                        }}>
                          {action}
                        </span>
                      </td>

                      <td style={{ padding: '12px', color: '#475569', lineHeight: '1.6', fontWeight: '500' }}>
                        {log.details || log.description || 'لا توجد تفاصيل'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
