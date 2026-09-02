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

  const sanitizeString = (val: any): string | null => {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    if (str === '' || str === '—' || str === 'undefined' || str === 'null') return null;
    return str;
  };

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

      // 1. استخراج الأكواد والبيانات من الشيت
      const updatesMap = new Map();
      rawData.forEach(row => {
        const code = sanitizeString(row.employee_code);
        if (code) {
          updatesMap.set(code, row);
        }
      });

      const excelCodes = Array.from(updatesMap.keys());
      setLogs(prev => [...prev, `تم العثور على ${excelCodes.length} موظف في الشيت.`]);

      // 2. جلب بيانات الموظفين الحالية كاملة من الداتابيز (على دفعات لمنع أخطاء الحجم)
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

      if (existingEmps.length === 0) {
         setLoading(false);
         return alert('لم يتم العثور على أي موظف من الشيت في قاعدة البيانات.');
      }

      // 3. دمج تاريخ التعيين الجديد مع بيانات الموظف القديمة الكاملة
      const payload = existingEmps.map(emp => {
        const newUpdates = updatesMap.get(emp.employee_code);
        
        // إذا وجدنا تاريخ تعيين في الشيت، نقوم بوضعه مكان القديم
        if (newUpdates && newUpdates.hiring_date !== undefined) {
           emp.hiring_date = sanitizeDate(newUpdates.hiring_date);
        }
        
        return emp;
      });

      setLogs(prev => [...prev, `جاري تحديث ${payload.length} موظف بأمان تام...`]);

      // 4. الرفع للداتابيز بدون أي نقص في الأعمدة
      const BATCH_SIZE = 300;
      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const batch = payload.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('employees')
          .upsert(batch, { onConflict: 'employee_code' });

        if (error) throw error;
      }

      setLogs(prev => [...prev, '✅ تم التحديث بنجاح!']);
      alert('تم تحديث التواريخ بنجاح وأمان تام! ✅');
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
      <h3 className="text-lg font-bold text-primary mb-2">🔄 التحديث الجزئي الآمن 100%</h3>
      <p className="text-xs text-muted mb-6">
        ارفع شيت إكسيل يحتوي فقط على (كود الموظف) و (تاريخ التعيين). سيقوم النظام بدمجها مع بيانات الموظف الحالية ورفعها دون مساس بأي بيانات أخرى.
      </p>

      <form onSubmit={handleFileUpload} className="border-2 border-dashed border-border p-8 text-center rounded-xl bg-background">
        <input
          type="file"
          accept=".xlsx, .xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mb-4 text-xs text-primary"
        />
        <div>
          <button
            type="submit"
            disabled={loading || !file}
            className="bg-gold text-white font-bold text-xs px-6 py-2.5 rounded-lg disabled:opacity-50"
          >
            {loading ? 'جاري التحديث...' : 'رفع وتحديث تاريخ التعيين 🚀'}
          </button>
        </div>
      </form>
      
      {logs.length > 0 && (
        <div className="mt-6 bg-[#0f172a] text-[#38bdf8] p-4 rounded-xl font-mono text-xs max-h-52 overflow-y-auto border border-border text-right">
          <div className="font-bold mb-2 text-white">سجل المعالجة:</div>
          {logs.map((log, idx) => (
            <div key={idx} className="mb-1">{log}</div>
          ))}
        </div>
      )}
    </div>
  );
}
