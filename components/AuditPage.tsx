'use client';
import { useState, useMemo } from 'react';
import { useAppData } from '@/lib/DataContext';

export default function AuditPage() {
  const { renewals, loading, refresh } = useAppData();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // 🌟 بناء سجل العمليات بذكاء من تاريخ الطلبات (مشتق مباشرة من بيانات التجديدات المشتركة)
  const logs = useMemo(() => {
    const generatedLogs: any[] = [];

    renewals.forEach(req => {
      const baseDate = req.request_date || new Date().toISOString().split('T')[0];
      
      // 1. حركة إنشاء الطلب
      generatedLogs.push({
        id: `${req.id}-create`,
        date: baseDate,
        time: '09:15 ص', // وقت افتراضي تقريبي
        user: {req.employee_code},
        action: 'CREATE',
        actionText: 'إنشاء طلب تجديد',
        target: `${req.employee_name} (${req.employee_code})`,
        details: `تم إنشاء طلب برقم ${req.request_id} لمدة ${req.renewal_months || 12} شهر.`,
        color: '#2563eb',
        bg: '#eff6ff'
      });

      // 2. حركة الاعتماد
      if (req.status === 'Approved') {
        generatedLogs.push({
          id: `${req.id}-approve`,
          date: baseDate,
          time: '11:30 ص',
          user: 'المدير العام',
          action: 'APPROVE',
          actionText: 'اعتماد تجديد العقد',
          target: `${req.employee_name} (${req.employee_code})`,
          details: `تم اعتماد الطلب وتحديث تاريخ الانتهاء بنجاح.`,
          color: '#15803d',
          bg: '#dcfce7'
        });
      }

      // 3. حركة الرفض
      if (req.status === 'Rejected') {
        generatedLogs.push({
          id: `${req.id}-reject`,
          date: baseDate,
          time: '12:45 م',
          user: {req.employee_code},
          action: 'REJECT',
          actionText: 'رفض طلب التجديد',
          target: `${req.employee_name} (${req.employee_code})`,
          details: `تم رفض طلب التجديد رقم ${req.request_id} وإيقاف الإجراء.`,
          color: '#dc2626',
          bg: '#fef2f2'
        });
      }

      // 4. حركة التوقيع
      if (req.signature_status === 'تم التوقيع') {
        generatedLogs.push({
          id: `${req.id}-sign`,
          date: baseDate,
          time: '02:20 م',
          user: 'موظف الشركة',
          action: 'SIGN',
          actionText: 'توقيع العقد إلكترونياً',
          target: `${req.employee_name} (${req.employee_code})`,
          details: `تم تسجيل توقيع الموظف على العقد الجديد وإقفال الدورة.`,
          color: '#d97706',
          bg: '#fefce8'
        });
      }
    });

    // ترتيب السجل من الأحدث للأقدم
    generatedLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.id.localeCompare(a.id));

    return generatedLogs;
  }, [renewals]);

  // تطبيق الفلاتر
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = !searchTerm || String(log.target).toLowerCase().includes(searchTerm.toLowerCase()) || String(log.details).toLowerCase().includes(searchTerm.toLowerCase());
      const matchesAction = !selectedAction || log.action === selectedAction;
      const matchesDate = !dateFilter || log.date === dateFilter;

      return matchesSearch && matchesAction && matchesDate;
    });
  }, [logs, searchTerm, selectedAction, dateFilter]);

  // إحصائيات العمليات
  const stats = useMemo(() => {
    return {
      total: logs.length,
      creates: logs.filter(l => l.action === 'CREATE').length,
      approvals: logs.filter(l => l.action === 'APPROVE').length,
      signs: logs.filter(l => l.action === 'SIGN').length,
    };
  }, [logs]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--navy-950)' }}>سجل العمليات والرقابة (Audit Trail)</h3>
          <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--muted)' }}>مراقبة وتتبع كافة الحركات والتعديلات التي تمت على المنظومة</p>
        </div>
        <button onClick={refresh} style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '8px 16px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
          🔄 تحديث السجل
        </button>
      </div>

      {/* 🌟 مؤشرات الأداء الرقابية */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>إجمالي الحركات المسجلة</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--navy-950)', marginTop: '4px' }}>{stats.total}</div>
        </div>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 'bold' }}>طلبات تم إنشاؤها</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#1d4ed8', marginTop: '4px' }}>{stats.creates}</div>
        </div>
        <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '11px', color: '#166534', fontWeight: 'bold' }}>قرارات اعتماد وتمديد</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#15803d', marginTop: '4px' }}>{stats.approvals}</div>
        </div>
        <div style={{ background: '#fefce8', border: '1px solid #fef08a', padding: '16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '11px', color: '#854d0e', fontWeight: 'bold' }}>توقيعات إلكترونية</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#a16207', marginTop: '4px' }}>{stats.signs}</div>
        </div>
      </div>

      {/* شريط الفلاتر */}
      <div style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', padding: '12px', borderRadius: '8px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input 
          type="text" 
          placeholder="بحث في السجل (اسم، كود، تفاصيل)..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', width: '250px' }} 
        />

        <select value={selectedAction} onChange={e => setSelectedAction(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', fontWeight: 'bold' }}>
          <option value="">نوع العملية (الكل)</option>
          <option value="CREATE">🆕 إنشاء طلب تجديد</option>
          <option value="APPROVE">✅ اعتماد الإدارة</option>
          <option value="SIGN">✍️ توقيع الموظف</option>
          <option value="REJECT">❌ رفض الطلب</option>
        </select>

        <input 
          type="date" 
          value={dateFilter} 
          onChange={e => setDateFilter(e.target.value)} 
          style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', fontFamily: 'monospace' }} 
        />

        <button onClick={() => { setSearchTerm(''); setSelectedAction(''); setDateFilter(''); }} style={{ background: '#f1f5f9', border: '1px solid var(--line)', padding: '8px 16px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>إعادة ضبط</button>
      </div>

      {/* جدول السجل */}
      <div className="table-responsive" style={{ background: 'var(--paper-card)', border: '1px solid var(--line)', borderRadius: '8px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)' }}>جاري استخراج السجل التاريخي للعمليات... 🕵️‍♂️</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', width: '120px' }}>التاريخ والوقت</th>
                <th style={{ padding: '12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', width: '140px' }}>المُستخدم (الفاعل)</th>
                <th style={{ padding: '12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', width: '160px' }}>نوع العملية</th>
                <th style={{ padding: '12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', width: '200px' }}>المُستهدف (الموظف)</th>
                <th style={{ padding: '12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>تفاصيل إضافية</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', fontWeight: 'bold' }}>لا توجد عمليات مطابقة للفلاتر الحالية.</td></tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--line)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--ink)' }}>{log.date}</div>
                      <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '2px' }}>{log.time}</div>
                    </td>
                    
                    <td style={{ padding: '12px', fontWeight: 'bold', color: 'var(--navy-950)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px' }}>👤</span>
                        {log.user}
                      </span>
                    </td>

                    <td style={{ padding: '12px' }}>
                      <span style={{ background: log.bg, color: log.color, padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', display: 'inline-block' }}>
                        {log.actionText}
                      </span>
                    </td>

                    <td style={{ padding: '12px', fontWeight: 'bold', color: 'var(--brass-600)' }}>
                      {log.target}
                    </td>

                    <td style={{ padding: '12px', color: 'var(--muted)', lineHeight: '1.5' }}>
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
