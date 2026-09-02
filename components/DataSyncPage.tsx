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

  // 🌟 دالة معالجة التواريخ والوقاية من أخطاء فروق التوقيت
  const parseExcelDate = (val: any): string | null => {
    if (!val || val === '' || val === '—') return null;

    if (typeof val === 'number') {
      const date = XLSX.SSF.parse_date_code(val);
      if (date && date.y > 1900 && date.y < 2100) {
        const m = String(date.m).padStart(2, '0');
        const d = String(date.d).padStart(2, '0');
        return `${date.y}-${m}-${d}`;
      }
      return null;
    }

    const str = String(val).trim();
    const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
      const day = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
      if (year >= 1900 && year <= 2100) return `${year}-${month}-${day}`;
      return null;
    }

    const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (dmyMatch) {
      const year = parseInt(dmyMatch[3], 10);
      const month = String(parseInt(dmyMatch[2], 10)).padStart(2, '0');
      const day = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
      if (year >= 1900 && year <= 2100) return `${year}-${month}-${day}`;
      return null;
    }

    return null;
  };

  // 🌟 دالة حساب نهاية العقد للموظف الجديد (إضافة سنة ناقص يوم)
  const calculateDefaultEndDate = (hiringDateStr: string | null) => {
    if (!hiringDateStr) return null;
    const parts = hiringDateStr.split('-');
    if (parts.length < 3) return null;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    // ضبط الوقت 12 ظهراً لتفادي فروق GMT
    const d = new Date(year, month, day, 12, 0, 0);
    d.setFullYear(d.getFullYear() + 1); // إضافة سنة
    d.setDate(d.getDate() - 1); // طرح يوم واحد

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // 1. تحميل تمبلت Excel فارغ
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

  // 2. معالجة وتحديث الموظفين الجدد والحاليين
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
        return alert('الملف المرفوع فارغ!');
      }

      setLogs(prev => [...prev, `تم استخراج ${jsonData.length} صف من الملف.`]);

      // 🔍 1. سحب الأكواد الموجودة حالياً بجدول الموظفين لمعرفة الموظف الجديد من الحالي
      const excelCodes = jsonData.map(r => String(r.employee_code || '').trim()).filter(Boolean);
      const { data: existingEmps, error: fetchError } = await supabase
        .from('employees')
        .select('employee_code')
        .in('employee_code', excelCodes);

      if (fetchError) throw fetchError;

      const existingCodesSet = new Set((existingEmps || []).map(e => e.employee_code));

      // ⚙️ 2. تجهيز البيانات وتطبيق شروط الموظف الجديد
      const preparedData = jsonData.map((row) => {
        const empCode = String(row.employee_code || '').trim();
        const isNewEmp = !existingCodesSet.has(empCode);

        const parsedHiringDate = parseExcelDate(row.hiring_date);
        let parsedStart = parseExcelDate(row.contract_start_date);
        let parsedEnd = parseExcelDate(row.contract_end_date);

        // 🌟 شروط الموظف الجديد: إذا لم يحدد العقد، نحسب البداية والنهاية من تاريخ التعيين تلقائياً (سنة - يوم)
        if (isNewEmp) {
          if (!parsedStart && parsedHiringDate) {
            parsedStart = parsedHiringDate;
          }
          if (!parsedEnd && parsedHiringDate) {
            parsedEnd = calculateDefaultEndDate(parsedHiringDate);
          }
        }

        const payload: any = {
          employee_id: String(row.employee_id || empCode || '').trim(),
          employee_code: empCode,
          employee_name: String(row.employee_name || '').trim(),
          department: String(row.department || '').trim(),
          job_title: String(row.job_title || '').trim(),
          company: String(row.company || '').trim(),
          hiring_date: parsedHiringDate,
          national_id: String(row.national_id || '').trim(),
          birth_date: parseExcelDate(row.birth_date),
          age: row.age && !isNaN(Number(row.age)) ? Number(row.age) : null,
          age_60_date: parseExcelDate(row.age_60_date),
          age_status: String(row.age_status || '').trim(),
          status: String(row.status || 'Active').trim(),
          email: String(row.email || '').trim(),
          mobile: String(row.mobile || '').trim(),
          manager: String(row.manager || '').trim(),
          contract_type: String(row.contract_type || 'محدد المدة').trim(),
          contract_start_date: parsedStart,
          contract_end_date: parsedEnd,
          password: String(row.password || '123456').trim(),
          role: String(row.role || 'Employee').trim(),
          must_change_password: String(row.must_change_password).toLowerCase() === 'true',
        };

        // تنظيف القيم الفارغة لتحديث الأعمدة المحددة فقط
        Object.keys(payload).forEach(key => {
          if (payload[key] === '' && key !== 'employee_code') {
            delete payload[key];
          }
        });

        return payload;
      }).filter(emp => emp.employee_code);

      setLogs(prev => [...prev, `جاري مزامنة وتحديث ${preparedData.length} سجل...`]);

      // 🚀 3. رفع البيانات بأسلوب Upsert على دفعات
      const BATCH_SIZE = 300;
      for (let i = 0; i < preparedData.length; i += BATCH_SIZE) {
        const batch = preparedData.slice(i, i + BATCH_SIZE);
        
        const { error } = await supabase
          .from('employees')
          .upsert(batch, { onConflict: 'employee_code' });

        if (error) throw error;
      }

      setLogs(prev => [...prev, '✅ تم تحديث الموظفين الحاليين وإضافة الموظفين الجدد بحساب تواريخ عقودهم بنجاح!']);
      alert('تمت المزامنة وحساب التواريخ بنجاح ✅');
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
    <div style={{ direction: 'rtl', paddingBottom: '30px' }}>
      <div style={{ background: 'var(--paper-card, #fff)', border: '1px solid var(--line, #e2e8f0)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950, #0f172a)', fontWeight: '800' }}>🔄 تحديث واستيراد البيانات المجمع</h3>
        <p style={{ margin: '4px 0 20px', fontSize: '12px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>
          يتم مطابقة البيانات بكود الموظف؛ لتحديث البيانات الحالية وتوليد تواريخ العقود تلقائياً للموظفين الجدد (سنة - يوم من التعيين).
        </p>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
          <button
            onClick={handleDownloadTemplate}
            style={{ background: '#059669', color: '#fff', border: 0, padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            📥 تحميل تمبلت فارغ (Template)
          </button>
        </div>

        <form onSubmit={handleFileUpload} style={{ border: '2px dashed var(--line, #cbd5e1)', borderRadius: '12px', padding: '30px', textAlign: 'center', background: '#f8fafc' }}>
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
        <div style={{ background: '#0f172a', color: '#38bdf8', padding: '16px', borderRadius: '10px', fontFamily: 'monospace', fontSize: '11px', maxHeight: '200px', overflowY: 'auto' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#fff' }}>سجل المعالجة (System Log):</div>
          {logs.map((log, idx) => (
            <div key={idx} style={{ marginBottom: '4px' }}>{log}</div>
          ))}
        </div>
      )}
    </div>
  );
}
