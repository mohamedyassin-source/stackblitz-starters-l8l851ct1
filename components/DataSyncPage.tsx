'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';

export default function DataSyncPage() {
  const { refresh } = useAppData();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  // 1. تنظيف النصوص والتأكد من أنها ليست تواريخ عشوائية مقتطعة
  const sanitizeString = (val: any): string | null => {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    if (str === '' || str === '—' || str === 'undefined' || str === 'null') return null;
    return str;
  };

  // 2. تنظيف التواريخ الحقيقية فقط (YYYY-MM-DD)
  const sanitizeDate = (val: any): string | null => {
    if (!val) return null;

    // إذا كانت القيمة رقم تسلسلي من الإكسيل
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

    // إذا كانت صيغة تاريخ YYYY-MM-DD أو YYYY/MM/DD
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(str)) {
      return str.replace(/\//g, '-');
    }

    return null;
  };

  // 3. تنظيف الأرقام فقط (يضمن عدم إرسال تواريخ مثل "1906-01-11" للحقول الرقمية)
  const sanitizeNumeric = (val: any): number | null => {
    if (val === undefined || val === null || val === '') return null;
    
    // إذا كانت القيمة تاريخ نصي تحوي شرائط '-' نلغيها فوراً
    if (typeof val === 'string' && val.includes('-')) {
      return null;
    }

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
      const rawData: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rawData.length === 0) {
        setLoading(false);
        return alert('الملف فارغ!');
      }

      // معالجة صريحة لكل حقل بنوعه الصحيح لمنع التضارب
      const payload = rawData
        .map((row) => {
          const empCode = sanitizeString(row.employee_code);
          if (!empCode) return null;

          return {
            employee_code: empCode,
            employee_id: sanitizeString(row.employee_id) || empCode,
            employee_name: sanitizeString(row.employee_name),
            department: sanitizeString(row.department),
            job_title: sanitizeString(row.job_title),
            company: sanitizeString(row.company),
            hiring_date: sanitizeDate(row.hiring_date),
            national_id: sanitizeString(row.national_id), // معاملة الرقم القومي كنص دائماً
            birth_date: sanitizeDate(row.birth_date),
            age: sanitizeNumeric(row.age), // تنظيف حقل السن حصراً كـ numeric
            age_60_date: sanitizeDate(row.age_60_date),
            age_status: sanitizeString(row.age_status),
            status: sanitizeString(row.status) || 'Active',
            email: sanitizeString(row.email),
            mobile: sanitizeString(row.mobile),
            manager: sanitizeString(row.manager),
            contract_type: sanitizeString(row.contract_type),
            contract_start_date: sanitizeDate(row.contract_start_date),
            contract_end_date: sanitizeDate(row.contract_end_date),
            role: sanitizeString(row.role) || 'Employee',
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // الرفع لداتابيز Supabase على دفعات
      const BATCH_SIZE = 300;
      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const batch = payload.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('employees')
          .upsert(batch, { onConflict: 'employee_code' });

        if (error) throw error;
      }

      alert('تم استرجاع وتحديث البيانات بنجاح وبدون أي أخطاء! ✅');
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
      <h3 className="text-lg font-bold text-primary mb-2">🔄 استرجاع البيانات المباشر المظبوط</h3>
      <p className="text-xs text-muted mb-6">
        تم تأمين أنواع البيانات: الخانات الفاضية تنزل (null)، والأعمدة الرقمية محمية تماماً من التداخل.
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
