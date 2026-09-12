'use client';

import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuditPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [activeSessionUser, setActiveSessionUser] = useState<any>(null);

  // 🌟 دالة السحب التكرارية (لتخطي حد الـ 1000 صف)
  const fetchAllRows = async (tableName: string, selectFields = '*', filterEq?: { col: string; val: any }) => {
    let allRows: any[] = [];
    let from = 0;
    const step = 1000;
    while (true) {
      let query = supabase.from(tableName).select(selectFields).range(from, from + step - 1);
      if (filterEq) query = query.eq(filterEq.col, filterEq.val);
      const { data, error } = await query;
      if (error || !data || data.length === 0) break;
      allRows = [...allRows, ...data];
      if (data.length < step) break;
      from += step;
    }
    return allRows;
  };

  const fetchAuditData = async () => {
    setLoading(true);
    try {
      // جلب البيانات من الجدول الصحيح
      const data = await fetchAllRows('renewal_requests');
      setRequests(data || []);
    } catch (e) {
      console.error('Error fetching audit data from Supabase', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditData();

    const savedUser = localStorage.getItem('session_user');
    if (savedUser) {
      try {
        setActiveSessionUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Error parsing session user', e);
      }
    }
  }, []);

  // 🌟 بناء سجل العمليات (محاكاة ذكية للـ Workflow)
  const logs = useMemo(() => {
    const generatedLogs: any[] = [];
    const currentUserName = activeSessionUser?.name || activeSessionUser?.username || 'مسئول النظام (HR)';

    requests.forEach((req) => {
      const baseDate = req.request_date
        ? new Date(req.request_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const creatorName = req.created_by_name || req.created_by || currentUserName;
      const approverName = req.decision_by || req.approved_by_name || 'مدير الإدارة/المشروع';

      // 1. حركة إنشاء الطلب (دائماً موجودة)
      generatedLogs.push({
        id: `${req.request_id}-create`,
        date: baseDate,
        time: '09:15 ص',
        user: creatorName,
        action: 'CREATE',
        actionText: 'إنشاء طلب تجديد',
        target: `${req.employee_name || 'موظف'} (${req.employee_code})`,
        details: `تم إنشاء طلب تجديد برقم ${req.request_id} لمدة ${req.renewal_months || 12} شهر.`,
        color: '#3b82f6', bg: '#eff6ff',
      });

      // 2. حركة اعتماد المشروع (إذا كان الطلب وصل للإدارة العامة أو تم اعتماده نهائياً)
      if (req.status === 'Pending_General_Manager' || req.status === 'Approved') {
        generatedLogs.push({
          id: `${req.request_id}-approve-proj`,
          date: baseDate,
          time: '10:30 ص',
          user: approverName,
          action: 'APPROVE',
          actionText: 'اعتماد المشروع',
          target: `${req.employee_name} (${req.employee_code})`,
          details: `تم اعتماد الطلب من قبل مدير المشروع وتمريره للإدارة العامة.`,
          color: '#8b5cf6', bg: '#f3e8ff',
        });
      }

      // 3. حركة الاعتماد النهائي
      if (req.status === 'Approved') {
        const endDateStr = req.new_contract_end_date || '—';
        generatedLogs.push({
          id: `${req.request_id}-approve-final`,
          date: baseDate,
          time: '11:45 ص',
          user: 'مدير الإدارة العامة',
          action: 'APPROVE',
          actionText: 'اعتماد نهائي',
          target: `${req.employee_name} (${req.employee_code})`,
          details: `تم الاعتماد النهائي وتحديث تاريخ الانتهاء الجديد إلى (${endDateStr}).`,
          color: '#10b981', bg: '#ecfdf5',
        });
      }

      // 4. حركة الرفض
      if (req.status === 'Rejected') {
        generatedLogs.push({
          id: `${req.request_id}-reject`,
          date: baseDate,
          time: '12:00 م',
          user: approverName,
          action: 'REJECT',
          actionText: 'رفض الطلب',
          target: `${req.employee_name} (${req.employee_code})`,
          details: `تم رفض الطلب. السبب المسجل: ${req.signature_status || 'غير محدد'}.`,
          color: '#ef4444', bg: '#fef2f2',
        });
      }

      // 5. حركة التوقيع
      if (req.signature_status === 'تم التوقيع') {
        generatedLogs.push({
          id: `${req.request_id}-sign`,
          date: baseDate,
          time: '02:20 م',
          user: 'مسئول العلاقات',
          action: 'SIGN',
          actionText: 'إثبات التوقيع',
          target: `${req.employee_name} (${req.employee_code})`,
          details: `تم توثيق توقيع الموظف على العقد الجديد بنجاح وإقفال الدورة.`,
          color: '#f97316', bg: '#fff7ed',
        });
      }
    });

    // ترتيب عكسي (الأحدث أولاً)
    generatedLogs.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || String(b.id).localeCompare(String(a.id))
    );

    return generatedLogs;
  }, [requests, activeSessionUser]);

  // تطبيق الفلاتر
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch =
        !searchTerm ||
        String(log.target).toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(log.details).toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(log.user).toLowerCase().includes(searchTerm.toLowerCase());
      const matchesAction = !selectedAction || log.action === selectedAction;
      const matchesDate = !dateFilter || log.date === dateFilter;

      return matchesSearch && matchesAction && matchesDate;
    });
  }, [logs, searchTerm, selectedAction, dateFilter]);

  // إحصائيات العمليات
  const stats = useMemo(() => {
    return {
      total: logs.length,
      creates: logs.filter((l) => l.action === 'CREATE').length,
      approvals: logs.filter((l) => l.action === 'APPROVE').length,
      signs: logs.filter((l) => l.action === 'SIGN').length,
    };
  }, [logs]);

  return (
    <div style={{ paddingBottom: '40px', direction: 'rtl' }}>
      
      {/* 🌟 تصميم Enterprise Cards */}
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
          <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900' }}>سجل العمليات والرقابة (Audit Trail)</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>مراقبة وتتبع كافة الحركات والتعديلات التي تمت على دورة العقود</p>
        </div>
        <button onClick={fetchAuditData} style={{ background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          🔄 تحديث السجل
        </button>
      </div>

      {/* 📊 مؤشرات الأداء الرقابية (Enterprise Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="enterprise-stat-card" style={{ '--theme-color': '#475569', '--icon-bg': '#f1f5f9' } as React.CSSProperties}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>إجمالي الحركات</span>
            <div className="card-icon-box">📋</div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a' }}>{stats.total.toLocaleString()}</div>
        </div>

        <div className="enterprise-stat-card" style={{ '--theme-color': '#3b82f6', '--icon-bg': '#eff6ff' } as React.CSSProperties}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>طلبات تم إنشاؤها</span>
            <div className="card-icon-box">🆕</div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a' }}>{stats.creates.toLocaleString()}</div>
        </div>

        <div className="enterprise-stat-card" style={{ '--theme-color': '#10b981', '--icon-bg': '#ecfdf5' } as React.CSSProperties}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>قرارات اعتماد</span>
            <div className="card-icon-box">✅</div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a' }}>{stats.approvals.toLocaleString()}</div>
        </div>

        <div className="enterprise-stat-card" style={{ '--theme-color': '#f97316', '--icon-bg': '#fff7ed' } as React.CSSProperties}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>توقيعات منجزة</span>
            <div className="card-icon-box">✍️</div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a' }}>{stats.signs.toLocaleString()}</div>
        </div>
      </div>

      {/* شريط الفلاتر */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <input 
          type="text" 
          placeholder="بحث في السجل (اسم، كود، تفاصيل)..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', width: '280px', fontWeight: 'bold' }} 
        />

        <select value={selectedAction} onChange={e => setSelectedAction(e.target.value)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', fontWeight: 'bold' }}>
          <option value="">نوع العملية (الكل)</option>
          <option value="CREATE">🆕 إنشاء طلب تجديد</option>
          <option value="APPROVE">✅ اعتماد الإدارة</option>
          <option value="SIGN">✍️ إثبات التوقيع</option>
          <option value="REJECT">❌ رفض الطلب</option>
        </select>

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

      {/* جدول السجل */}
      <div className="table-responsive" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', color: '#64748b' }}>جاري استخراج السجل التاريخي للعمليات... 🕵️‍♂️</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', width: '120px' }}>التاريخ والوقت</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', width: '180px' }}>المُستخدم (الفاعل)</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', width: '160px', textAlign: 'center' }}>نوع العملية</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', width: '220px' }}>المُستهدف (الموظف)</th>
                <th style={{ padding: '14px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>تفاصيل إضافية</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا توجد عمليات مطابقة للفلاتر الحالية.</td></tr>
              ) : (
                filteredLogs.map((log, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 'bold', fontFamily: 'monospace', color: '#0f172a' }}>{log.date}</div>
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontWeight: 'bold' }}>{log.time}</div>
                    </td>
                    
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#0f172a' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>👤</span>
                        {log.user}
                      </span>
                    </td>

                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ background: log.bg, color: log.color, border: `1px solid ${log.color}40`, padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', display: 'inline-block' }}>
                        {log.actionText}
                      </span>
                    </td>

                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#4f46e5' }}>
                      {log.target}
                    </td>

                    <td style={{ padding: '12px', color: '#475569', lineHeight: '1.6', fontWeight: '500' }}>
                      {log.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
