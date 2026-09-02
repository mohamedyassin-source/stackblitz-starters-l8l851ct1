'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';

export default function DataSyncPage() {
  const { refresh } = useAppData();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  // دالة ترجع القيمة النصية كما هي أو null إذا كانت الخلية فارغة
  const getValueOrNull = (val: any): string | null => {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    if (str === '' || str === '—' || str === 'undefined' || str === 'null') return null;
    return str;
  };

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
        return alert('الملف فارغ!');
      }

      // قراءة كل عمود وتصفية الخانات الفارغة لتصبح null صريح
      const payload = rawData
        .map((row) => {
          const empCode = getValueOrNull(row.employee_code);
          if (!empCode) return null;

          return {
            employee_code: empCode,
            employee_id: getValueOrNull(row.employee_id) || empCode,
            employee_name: getValueOrNull(row.employee_name),
            department: getValueOrNull(row.department),
            job_title: getValueOrNull(row.job_title),
            company: getValueOrNull(row.company),
            hiring_date: getValueOrNull(row.hiring_date),
            national_id: getValueOrNull(row.national_id),
            birth_date: getValueOrNull(row.birth_date),
            age: row.age && !isNaN(Number(row.age)) ? Number(row.age) : null,
            age_60_date: getValueOrNull(row.age_60_date),
            age_status: getValueOrNull(row.age_status),
            status: getValueOrNull(row.status) || 'Active',
            email: getValueOrNull(row.email),
            mobile: getValueOrNull(row.mobile),
            manager: getValueOrNull(row.manager),
            contract_type: getValueOrNull(row.contract_type),
            contract_start_date: getValueOrNull(row.contract_start_date),
            contract_end_date: getValueOrNull(row.contract_end_date),
            role: getValueOrNull(row.role) || 'Employee',
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // رفع وتحديث البيانات في Supabase بأسلوب الدفعات (Batches)
      const BATCH_SIZE = 300;
      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const batch = payload.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('employees')
          .upsert(batch, { onConflict: 'employee_code' });

        if (error) throw error;
      }

      alert('تم استرجاع وتحديث البيانات بنجاح من الشيت المطلوب! ✅');
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
      <h3 className="text-lg font-bold text-primary mb-2">🔄 استرجاع البيانات المطابق للشيت</h3>
      <p className="text-xs text-muted mb-6">
        سيتم قراءة الشيت حرفياً: الأعمدة المكتوبة ستُحدث، والخلية الفاضية ستتحول إلى (null) لضبط الداتابيز تماماً مع ملفك.
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
            {loading ? 'جاري الاسترجاع والرفع...' : 'رفع الشيت وتعديل الداتابيز 🚀'}
          </button>
        </div>
      </form>
    </div>
  );
}
