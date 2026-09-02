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

  // 1. تنظيف النصوص (بترجع null لو الخلية فاضية)
  const sanitizeString = (val: any): string | null => {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    if (str === '' || str === '—' || str === 'undefined' || str === 'null') return null;
    return str;
  };

  // 2. تنظيف التواريخ (بيعالج تواريخ الإكسيل والأرقام التسلسلية)
  const sanitizeDate = (val: any): string | null => {
    if (!val) return null;
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
    if (!str || str === '—') return null;
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(str)) {
      return str.replace(/\//g, '-');
    }
    return null;
  };

  // 3. تنظيف الأرقام (لمنع خطأ نوع numeric)
  const sanitizeNumeric = (val: any): number | null => {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'string' && val.includes('-')) return null;
    const num = Number(val);
    if (isNaN(num)) return null;
    return num;
  };

  // 4. تحميل تمبلت لضمان توحيد أسماء الأعمدة
  const handleDownloadTemplate = () => {
    const headers = [
      'employee_code', 'employee_name', 'status', 'department', 'job_title', 'company', 
      'hiring_date', 'national_id', 'mobile', 'contract_type', 'contract_start_date', 'contract_end_date'
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'قالب_تحديث_البيانات_الشامل.xlsx');
  };

  // 5. دالة الرفع الأساسية
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return alert('يرجى اختيار ملف Excel أولاً');

    setLoading(true);
    setLogs(['جاري قراءة الملف... ⏳']);
    
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      
      const rawData: any[] = XLSX.utils.sheet_to_json(sheet);

      if (rawData.length === 0) {
        setLoading(false);
        return alert('الملف فارغ!');
      }

      // تجهيز خريطة لأكواد الموظفين من الإكسيل
      const excelUpdatesMap = new Map();
      rawData.forEach(row => {
        const code = sanitizeString(row.employee_code);
        if (code) excelUpdatesMap.set(code, row);
      });

      const excelCodes = Array.from(excelUpdatesMap.keys());
      setLogs(prev => [...prev, `تم العثور على ${excelCodes.length} سجل في الشيت.`]);

      // جلب بيانات الموظفين الحاليين من الداتابيز
      setLogs(prev => [...prev, `جاري جلب البيانات الحالية للمطابقة...`]);
      let existingEmps: any[] = [];
      const FETCH_BATCH = 200;
      for (let i = 0; i < excelCodes.length; i += FETCH_BATCH) {
        const batchCodes = excelCodes.slice(i, i + FETCH_BATCH);
        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .in('employee_code', batchCodes);
          
        if (error) throw error;
        if (data) existingEmps.push(...data);
      }

      const existingMap = new Map(existingEmps.map(emp => [emp.employee_code, emp]));

      // 🌟 بناء البيانات النهائية (الدمج بين القديم والجديد)
      const finalPayload = excelCodes.map(empCode => {
        const excelRow = excelUpdatesMap.get(empCode);
        const dbRecord = existingMap.get(empCode);

        if (dbRecord) {
          // --- حالة (1): الموظف موجود (تحديث إدارة/استقالة/نقل) ---
          // بناخد الداتا القديمة كاملة، ونحدث فقط الأعمدة الموجودة في الإكسيل
          const updatedRecord = { ...dbRecord };
          
          if ('employee_name' in excelRow) updatedRecord.employee_name = sanitizeString(excelRow.employee_name) || updatedRecord.employee_name;
          if ('department' in excelRow) updatedRecord.department = sanitizeString(excelRow.department);
          if ('job_title' in excelRow) updatedRecord.job_title = sanitizeString(excelRow.job_title);
          if ('company' in excelRow) updatedRecord.company = sanitizeString(excelRow.company);
          if ('status' in excelRow) updatedRecord.status = sanitizeString(excelRow.status) || updatedRecord.status;
          if ('hiring_date' in excelRow) updatedRecord.hiring_date = sanitizeDate(excelRow.hiring_date);
          if ('national_id' in excelRow) updatedRecord.national_id = sanitizeString(excelRow.national_id);
          if ('mobile' in excelRow) updatedRecord.mobile = sanitizeString(excelRow.mobile);
          if ('contract_type' in excelRow) updatedRecord.contract_type = sanitizeString(excelRow.contract_type);
          if ('contract_start_date' in excelRow) updatedRecord.contract_start_date = sanitizeDate(excelRow.contract_start_date);
          if ('contract_end_date' in excelRow) updatedRecord.contract_end_date = sanitizeDate(excelRow.contract_end_date);
          if ('age' in excelRow) updatedRecord.age = sanitizeNumeric(excelRow.age);

          return updatedRecord;
        } else {
          // --- حالة (2): الموظف جديد لسه متعين (إضافة جديدة) ---
          // بننشئ سجل جديد كامل وبنأمنه بقيم افتراضية للخانات الإجبارية
          return {
            employee_code: empCode,
            employee_id: sanitizeString(excelRow.employee_id) || empCode, // تأمين Not-Null
            employee_name: sanitizeString(excelRow.employee_name) || 'موظف جديد', // تأمين Not-Null
            status: sanitizeString(excelRow.status) || 'Active', // تأمين Not-Null
            role: sanitizeString(excelRow.role) || 'Employee', // تأمين Not-Null
            password: '123456', // تأمين Not-Null
            department: sanitizeString(excelRow.department),
            job_title: sanitizeString(excelRow.job_title),
            company: sanitizeString(excelRow.company),
            hiring_date: sanitizeDate(excelRow.hiring_date),
            national_id: sanitizeString(excelRow.national_id),
            mobile: sanitizeString(excelRow.mobile),
            contract_type: sanitizeString(excelRow.contract_type),
            contract_start_date: sanitizeDate(excelRow.contract_start_date),
            contract_end_date: sanitizeDate(excelRow.contract_end_date),
            age: sanitizeNumeric(excelRow.age),
          };
        }
      });

      setLogs(prev => [...prev, `جاري رفع وتحديث ${finalPayload.length} سجل...`]);

      // رفع البيانات לדاتابيز على دفعات
      const BATCH_SIZE = 300;
      for (let i = 0; i < finalPayload.length; i += BATCH_SIZE) {
        const batch = finalPayload.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('employees')
          .upsert(batch, { onConflict: 'employee_code' });

        if (error) throw error;
      }

      setLogs(prev => [...prev, '✅ تمت العملية بنجاح!']);
      alert('تم تحديث البيانات الشاملة بنجاح وأمان تام! ✅');
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
    <div className="p-6 executive-card max-w-2xl mx-auto my-8" style={{ direction: 'rtl' }}>
      <h3 className="text-lg font-bold text-primary mb-2">🔄 المزامنة الشاملة والآمنة للموظفين</h3>
      <p className="text-xs text-muted mb-6">
        هذه الأداة الذكية تقوم بقراءة الشيت، تحديث الموظفين الحاليين (نقل/استقالة)، وإضافة الموظفين الجدد تلقائياً بأمان دون المساس بالبيانات القديمة.
      </p>

      <div className="mb-6">
        <button
          onClick={handleDownloadTemplate}
          className="bg-[var(--success-text)] text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm"
        >
          📥 تحميل قالب الإكسيل المعتمد
        </button>
      </div>

      <form onSubmit={handleFileUpload} className="border-2 border-dashed border-border p-8 text-center rounded-xl bg-background">
        <input
          type="file"
          accept=".xlsx, .xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mb-4 text-xs text-primary w-full"
        />
        <div>
          <button
            type="submit"
            disabled={loading || !file}
            className="bg-gold text-white font-bold text-xs px-8 py-3 rounded-lg disabled:opacity-50 hover:bg-gold-hover transition-colors"
          >
            {loading ? 'جاري المزامنة...' : 'مزامنة وتحديث النظام 🚀'}
          </button>
        </div>
      </form>
      
      {logs.length > 0 && (
        <div className="mt-6 bg-[#0f172a] text-[#38bdf8] p-4 rounded-xl font-mono text-xs max-h-52 overflow-y-auto border border-border text-right">
          <div className="font-bold mb-2 text-white">سجل العمليات (System Logs):</div>
          {logs.map((log, idx) => (
            <div key={idx} className="mb-1">{log}</div>
          ))}
        </div>
      )}
    </div>
  );
}
