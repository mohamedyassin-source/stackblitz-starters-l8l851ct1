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

  // دالة تحويل تواريخ Excel النصية أو التسلسلية إلى YYYY-MM-DD
  const parseExcelDate = (val: any): string | null => {
    if (!val) return null;
    if (typeof val === 'number') {
      const date = XLSX.SSF.parse_date_code(val);
      if (date) {
        const m = String(date.m).padStart(2, '0');
        const d = String(date.d).padStart(2, '0');
        return `${date.y}-${m}-${d}`;
      }
    }
    const str = String(val).trim();
    return str ? str : null;
  };

  // 1. تحميل تمبلت Excel متوافق
  const handleDownloadTemplate = () => {
    const headers = [
      'employee_id', 'employee_code', 'employee_name', 'department',
      'job_title', 'company', 'hiring_date', 'national_id',
      'birth_date', 'age', 'age_60_date', 'age_status',
      'status', 'email', 'mobile', 'manager',
      'contract_type', 'contract_start_date', 'contract_end_date',
      'password', 'role', 'must_change_password'
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees_Template');
    XLSX.writeFile(wb, 'قالب_تحديث_بيانات_الموظفين_المجمع.xlsx');
  };

  // 2. معالجة وتدفيق البيانات بأسلوب الخانات (Batches)
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return alert('يرجى اختيار ملف Excel أولاً');

    setLoading(true);
    setLogs(['بدء قراءة الملف... ⏳']);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (jsonData.length === 0) {
        setLoading(false);
        return alert('الملف المرفوع فارغ! يرجى ملء البيانات أولاً.');
      }

      setLogs(prev => [...prev, `تم استخراج ${jsonData.length} صف من الملف.`]);

      const preparedData = jsonData.map((row) => ({
        employee_id: String(row.employee_id || row.employee_code || '').trim(),
        employee_code: String(row.employee_code || '').trim(),
        employee_name: String(row.employee_name || '').trim(),
        department: String(row.department || '').trim(),
        job_title: String(row.job_title || '').trim(),
        company: String(row.company || '').trim(),
        hiring_date: parseExcelDate(row.hiring_date),
        national_id: String(row.national_id || '').trim(),
        birth_date: parseExcelDate(row.birth_date),
        age: row.age ? Number(row.age) : null,
        age_60_date: parseExcelDate(row.age_60_date),
        age_status: String(row.age_status || '').trim(),
        status: String(row.status || 'Active').trim(),
        email: String(row.email || '').trim(),
        mobile: String(row.mobile || '').trim(),
        manager: String(row.manager || '').trim(),
        contract_type: String(row.contract_type || 'محدد المدة').trim(),
        contract_start_date: parseExcelDate(row.contract_start_date),
        contract_end_date: parseExcelDate(row.contract_end_date),
        password: String(row.password || '123456').trim(),
        role: String(row.role || 'Employee').trim(),
        must_change_password: String(row.must_change_password).toLowerCase() === 'true',
      })).filter(emp => emp.employee_code); // استبعاد الصفوف بدون كود

      // تقسيم البيانات على دفعات (Batching by 500)
      const BATCH_SIZE = 500;
      for (let i = 0; i < preparedData.length; i += BATCH_SIZE) {
        const batch = preparedData.slice(i, i + BATCH_SIZE);
        setLogs(prev => [...prev, `جاري رفع الدفعة من ${i + 1} إلى ${Math.min(i + BATCH_SIZE, preparedData.length)}...`]);

        const { error } = await supabase
          .from('employees')
          .upsert(batch, { onConflict: 'employee_code' });

        if (error) throw error;
      }

      setLogs(prev => [...prev, '✅ تم رفع وتحديث جميع البيانات بنجاح!']);
      alert('تم تحديث البيانات المجمعة بنجاح ✅');
      await refresh();
      setFile(null);
    } catch (err: any) {
      setLogs(prev => [...prev, `❌ خطأ: ${err.message}`]);
      alert('حدث خطأ أثناء الرفع: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="executive-card p-6">
        <h3 className="m-0 text-lg font-extrabold text-primary">🔄 تحديث واستيراد البيانات المجمع</h3>
        <p className="mt-1 text-xs text-muted font-bold">
          قم بتنزيل القالب الفارغ، ادخل البيانات بنفس التنسيق، ثم أعد رفعه لتحديث أو إضافة الموظفين جملة واحدة.
        </p>

        <div className="my-6">
          <button
            onClick={handleDownloadTemplate}
            className="bg-[var(--success-text)] hover:opacity-90 text-white px-5 py-2.5 rounded-lg font-bold text-xs transition-opacity flex items-center gap-2 shadow-sm"
          >
            📥 تحميل تمبلت فارغ (Excel Template)
          </button>
        </div>

        <form onSubmit={handleFileUpload} className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-background">
          <div className="text-4xl mb-3">📁</div>
          <p className="m-0 mb-4 text-xs font-bold text-primary">اختر ملف Excel المكتمل لرفعه إلى النظام</p>
          
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="mb-6 text-xs text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary file:text-card hover:file:opacity-80"
          />

          <div>
            <button
              type="submit"
              disabled={loading || !file}
              className="bg-gold hover:bg-gold-hover text-white font-bold text-xs px-8 py-3 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'جاري المعالجة والرفع...' : 'رفع وتحديث قاعدة البيانات 🚀'}
            </button>
          </div>
        </form>
      </div>

      {logs.length > 0 && (
        <div className="bg-[#0f172a] text-[#38bdf8] p-5 rounded-xl font-mono text-xs max-h-52 overflow-y-auto border border-border">
          <div className="font-bold mb-2 text-white">سجل المعالجة (System Log):</div>
          {logs.map((log, idx) => (
            <div key={idx} className="mb-1">{log}</div>
          ))}
        </div>
      )}
    </div>
  );
}
