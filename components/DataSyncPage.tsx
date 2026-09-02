'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';

export default function DataSyncPage() {
  const { refresh } = useAppData();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // 1. تحميل تمبلت Excel فاضي يحتوي فقط على الهيدر الموضح بالصورة
  const handleDownloadTemplate = () => {
    const headers = [
      'employee_id',
      'employee_code',
      'employee_name',
      'department',
      'job_title',
      'company',
      'hiring_date',
      'national_id',
      'birth_date',
      'age',
      'age_60_date',
      'age_status',
      'status',
      'email',
      'mobile',
      'manager',
      'contract_type',
      'contract_start_date',
      'contract_end_date',
      'created_at',
      'updated_at',
      'password',
      'role',
      'must_change_password'
    ];

    // إنشاء شيت فاضي يحتوي على الصف الأول فقط (العناوين)
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees_Template');

    XLSX.writeFile(wb, 'قالب_تحديث_بيانات_الموظفين_المجمع.xlsx');
  };

  // 2. معالجة ورفع شيت البيانات المكتمل إلى Supabase
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return alert('يرجى اختيار ملف Excel أولاً');

    setLoading(true);
    setLogs(['بدء قراءة الملف... ⏳']);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (jsonData.length === 0) {
        setLoading(false);
        return alert('الملف المرفوع فاضي! يرجى ملء البيانات أولاً.');
      }

      setLogs(prev => [...prev, `تم استخراج ${jsonData.length} صف من الملف.`]);

      // تجهيز البيانات المطابقة للجدول
      const preparedData = jsonData.map((row) => ({
        employee_id: String(row.employee_id || row.employee_code || '').trim(),
        employee_code: String(row.employee_code || '').trim(),
        employee_name: String(row.employee_name || '').trim(),
        department: String(row.department || '').trim(),
        job_title: String(row.job_title || '').trim(),
        company: String(row.company || '').trim(),
        hiring_date: row.hiring_date ? String(row.hiring_date).trim() : null,
        national_id: String(row.national_id || '').trim(),
        birth_date: row.birth_date ? String(row.birth_date).trim() : null,
        age: row.age ? Number(row.age) : null,
        age_60_date: row.age_60_date ? String(row.age_60_date).trim() : null,
        age_status: String(row.age_status || '').trim(),
        status: String(row.status || 'Active').trim(),
        email: String(row.email || '').trim(),
        mobile: String(row.mobile || '').trim(),
        manager: String(row.manager || '').trim(),
        contract_type: String(row.contract_type || 'محدد المدة').trim(),
        contract_start_date: row.contract_start_date ? String(row.contract_start_date).trim() : null,
        contract_end_date: row.contract_end_date ? String(row.contract_end_date).trim() : null,
        password: String(row.password || '123456').trim(),
        role: String(row.role || 'Employee').trim(),
        must_change_password: String(row.must_change_password).toLowerCase() === 'true',
      }));

      // تحديث البيانات أو إدراجها المجمع (Upsert)
      const { error } = await supabase
        .from('employees')
        .upsert(preparedData, { onConflict: 'employee_code' });

      if (error) throw error;

      setLogs(prev => [...prev, '✅ تم رفع وتحديث جميع البيانات بنجاح!']);
      alert('تم تحديث البيانات المجمعة بنجاح ✅');
      await refresh();
    } catch (err: any) {
      setLogs(prev => [...prev, `❌ خطأ: ${err.message}`]);
      alert('حدث خطأ أثناء الرفع: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ direction: 'rtl', paddingBottom: '30px' }}>
      <div style={{ background: 'var(--paper-card, #fff)', border: '1px solid var(--line, #e2e8f0)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950, #0f172a)', fontWeight: '800' }}>🔄 تحديث واستيراد البيانات المجمع</h3>
        <p style={{ margin: '4px 0 20px', fontSize: '12px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>
          قم بتنزيل القالب الفاضي، امشِ على نفس هيكل الأعمدة، ثم أعد رفعه لتحديث أو إضافة الموظفين جملة واحدة.
        </p>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
          <button
            onClick={handleDownloadTemplate}
            style={{ background: 'var(--stamp-green)', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            📥 تحميل تمبلت فارغ (Template)
          </button>
        </div>

        <form onSubmit={handleFileUpload} style={{ border: '2px dashed var(--line, #cbd5e1)', borderRadius: '12px', padding: '30px', textAlign: 'center', background: 'var(--paper)' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>📁</div>
          <p style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 'bold', color: 'var(--ink, #0f172a)' }}>اختر ملف Excel المكتمل لرفعه إلى النظام</p>
          
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ marginBottom: '20px', fontSize: '12px' }}
          />

          <div>
            <button
              type="submit"
              disabled={loading || !file}
              style={{ background: 'var(--brass-600, #0d9488)', color: '#fff', border: 0, padding: '10px 24px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: (loading || !file) ? 'not-allowed' : 'pointer', opacity: (loading || !file) ? 0.6 : 1 }}
            >
              {loading ? 'جاري المعالجة والرفع...' : 'رفع وتحديث قاعدة البيانات 🚀'}
            </button>
          </div>
        </form>
      </div>

      {logs.length > 0 && (
        <div style={{ background: '#0f172a', color: 'var(--stamp-blue)', padding: '16px', borderRadius: '10px', fontFamily: 'monospace', fontSize: '11px', maxHeight: '200px', overflowY: 'auto' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#fff' }}>سجل المعالجة (System Log):</div>
          {logs.map((log, idx) => (
            <div key={idx} style={{ marginBottom: '4px' }}>{log}</div>
          ))}
        </div>
      )}
    </div>
  );
}
