'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';

export default function DataSyncPage() {
  const { refresh } = useAppData();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

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

  const sanitizeNumeric = (val: any): number | null => {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'string' && val.includes('-')) return null;
    const num = Number(val);
    if (isNaN(num)) return null;
    return num;
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return alert('يرجى اختيار ملف Excel أولاً');

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      
      const rawData: any[] = XLSX.utils.sheet_to_json(sheet);

      if (rawData.length === 0) {
        setLoading(false);
        return alert('الملف فارغ!');
      }

      const payload = rawData
        .map((row) => {
          const empCode = sanitizeString(row.employee_code);
          if (!empCode) return null;

          // 🌟 إجبار الكود على إرسال employee_id لترضية قاعدة البيانات
          const updateItem: any = { 
            employee_code: empCode,
            employee_id: row.employee_id !== undefined ? (sanitizeString(row.employee_id) || empCode) : empCode
          };

          if (row.hiring_date !== undefined) updateItem.hiring_date = sanitizeDate(row.hiring_date);
          if (row.employee_name !== undefined) updateItem.employee_name = sanitizeString(row.employee_name);
          if (row.department !== undefined) updateItem.department = sanitizeString(row.department);
          if (row.job_title !== undefined) updateItem.job_title = sanitizeString(row.job_title);
          if (row.company !== undefined) updateItem.company = sanitizeString(row.company);
          if (row.national_id !== undefined) updateItem.national_id = sanitizeString(row.national_id);
          if (row.birth_date !== undefined) updateItem.birth_date = sanitizeDate(row.birth_date);
          if (row.age !== undefined) updateItem.age = sanitizeNumeric(row.age);
          if (row.age_60_date !== undefined) updateItem.age_60_date = sanitizeDate(row.age_60_date);
          if (row.age_status !== undefined) updateItem.age_status = sanitizeString(row.age_status);
          if (row.status !== undefined) updateItem.status = sanitizeString(row.status);
          if (row.email !== undefined) updateItem.email = sanitizeString(row.email);
          if (row.mobile !== undefined) updateItem.mobile = sanitizeString(row.mobile);
          if (row.manager !== undefined) updateItem.manager = sanitizeString(row.manager);
          if (row.contract_type !== undefined) updateItem.contract_type = sanitizeString(row.contract_type);
          if (row.contract_start_date !== undefined) updateItem.contract_start_date = sanitizeDate(row.contract_start_date);
          if (row.contract_end_date !== undefined) updateItem.contract_end_date = sanitizeDate(row.contract_end_date);
          if (row.role !== undefined) updateItem.role = sanitizeString(row.role);

          return updateItem;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const BATCH_SIZE = 300;
      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const batch = payload.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('employees')
          .upsert(batch, { onConflict: 'employee_code' });

        if (error) throw error;
      }

      alert('تم تحديث تاريخ التعيين بنجاح وأمان تام! ✅');
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
      <h3 className="text-lg font-bold text-primary mb-2">🔄 التحديث الجزئي الآمن (Partial Update)</h3>
      <p className="text-xs text-muted mb-6">
        ارفع شيت إكسيل يحتوي فقط على كود الموظف والأعمدة التي تريد تعديلها (مثل تاريخ التعيين). سيتم تجاهل باقي البيانات للحفاظ عليها.
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
            {loading ? 'جاري التحديث الآمن...' : 'رفع وتحديث البيانات 🚀'}
          </button>
        </div>
      </form>
    </div>
  );
}
