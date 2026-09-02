'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';

export default function DataSyncPage() {
  const { refresh } = useAppData();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return alert('يرجى اختيار ملف Excel أولاً');

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rawData.length === 0) {
        setLoading(false);
        return alert('الملف فارغ');
      }

      // تجهيز الحقول المكتوبة فقط في الإكسيل وتجاهل الحقول الفاضية
      const payload = rawData.map((row) => {
        const item: any = {
          employee_code: String(row.employee_code || '').trim(),
        };

        // نأخذ القيمة فقط إذا كانت مكتوبة في الإكسيل، لعدم مسح أو تغيير البيانات القديمة
        if (row.employee_name) item.employee_name = String(row.employee_name).trim();
        if (row.department) item.department = String(row.department).trim();
        if (row.job_title) item.job_title = String(row.job_title).trim();
        if (row.company) item.company = String(row.company).trim();
        if (row.contract_type) item.contract_type = String(row.contract_type).trim();
        if (row.hiring_date) item.hiring_date = String(row.hiring_date).trim();
        if (row.contract_start_date) item.contract_start_date = String(row.contract_start_date).trim();
        if (row.contract_end_date) item.contract_end_date = String(row.contract_end_date).trim();
        if (row.national_id) item.national_id = String(row.national_id).trim();
        if (row.status) item.status = String(row.status).trim();

        return item;
      }).filter(e => e.employee_code !== '');

      const { error } = await supabase
        .from('employees')
        .upsert(payload, { onConflict: 'employee_code' });

      if (error) throw error;

      alert('تم تحديث البيانات المحددة في الإكسيل بنجاح ✅');
      await refresh();
      setFile(null);
    } catch (err: any) {
      alert('حدث خطأ أثناء الرفع: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 executive-card max-w-2xl mx-auto my-8">
      <h3 className="text-lg font-bold text-primary mb-2">🔄 استيراد وتعديل البيانات الآمن</h3>
      <p className="text-xs text-muted mb-6">يقوم النظام بتعديل الحقول المكتوبة فقط في الإكسيل دون المساس بأي حقول أخرى.</p>

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
            {loading ? 'جاري التعديل...' : 'تحديث الشيت في الداتابيز 🚀'}
          </button>
        </div>
      </form>
    </div>
  );
}
