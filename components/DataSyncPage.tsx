'use client';
import { useState } from 'react';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';

export default function DataSyncPage() {
  const { refresh } = useAppData();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // 1. تنظيف النصوص
  const sanitizeString = (val: any): string | null => {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    if (str === '' || str === '—' || str === 'undefined' || str === 'null') return null;
    return str;
  };

  // 2. تنظيف التواريخ
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

  // 3. تنظيف الأرقام (للعمر)
  const sanitizeNumeric = (val: any): number | null => {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'string' && val.includes('-')) return null;
    const num = Number(val);
    if (isNaN(num)) return null;
    return num;
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'employee_code', 'employee_name', 'department', 'job_title', 
      'company', 'hiring_date', 'national_id', 'birth_date', 'status', 
      'email', 'mobile', 'manager', 'termination_date', 'termination_reason'
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'قالب_بيانات_الموظفين.xlsx');
  };

  // الدالة الأساسية للمزامنة وتحديث بيانات الموظفين باستخدام Firebase
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

      const excelUpdatesMap = new Map();
      rawData.forEach(row => {
        const code = sanitizeString(row.employee_code);
        if (code) excelUpdatesMap.set(code, row);
      });

      const excelCodes = Array.from(excelUpdatesMap.keys());
      setLogs(prev => [...prev, `تم العثور على ${excelCodes.length} سجل في الشيت.`]);
      setLogs(prev => [...prev, `جاري جلب البيانات الحالية للمطابقة...`]);

      const existingMap = new Map();
      
      // 🌟 جلب الموظفين من فايربيز على دفعات (حجم الدفعة 30 لتناسب قيود استعلام IN)
      const FETCH_BATCH = 30;
      for (let i = 0; i < excelCodes.length; i += FETCH_BATCH) {
        const batchCodes = excelCodes.slice(i, i + FETCH_BATCH);
        const q = query(collection(db, 'employees'), where('employee_code', 'in', batchCodes));
        const snap = await getDocs(q);
        
        snap.forEach(docSnap => {
          const data = docSnap.data();
          existingMap.set(data.employee_code, { id: docSnap.id, ...data });
        });
      }

      setLogs(prev => [...prev, `تم الانتهاء من المطابقة. جاري التحديث والرفع للبيانات...`]);

      let batch = writeBatch(db);
      let operationCount = 0;
      let totalProcessed = 0;

      for (const empCode of excelCodes) {
        const excelRow = excelUpdatesMap.get(empCode);
        const dbRecord = existingMap.get(empCode);

        if (dbRecord) {
          // ⚠️ الموظف موجود مسبقاً (تحديث جزئي محكوم للإدارة والوظيفة والموبايل فقط)
          const updatePayload: any = {};
          
          if ('department' in excelRow) {
             updatePayload.department = sanitizeString(excelRow.department) || dbRecord.department;
          }
          if ('job_title' in excelRow) {
             updatePayload.job_title = sanitizeString(excelRow.job_title) || dbRecord.job_title;
          }
          if ('mobile' in excelRow) {
             const newMobile = sanitizeString(excelRow.mobile);
             if (newMobile) updatePayload.mobile = newMobile;
          }

          if (Object.keys(updatePayload).length > 0) {
            const docRef = doc(db, 'employees', dbRecord.id);
            batch.update(docRef, updatePayload);
            operationCount++;
          }

        } else {
          // ⚠️ الموظف جديد كلياً (يتم إضافته بكامل بياناته المطابقة للـ Schema)
          const newRecord = {
            employee_code: empCode,
            employee_name: sanitizeString(excelRow.employee_name) || 'موظف بدون اسم',
            department: sanitizeString(excelRow.department),
            job_title: sanitizeString(excelRow.job_title),
            company: sanitizeString(excelRow.company),
            hiring_date: sanitizeDate(excelRow.hiring_date),
            national_id: sanitizeString(excelRow.national_id),
            birth_date: sanitizeDate(excelRow.birth_date),
            email: sanitizeString(excelRow.email),
            mobile: sanitizeString(excelRow.mobile),
            manager: sanitizeString(excelRow.manager),
            status: sanitizeString(excelRow.status) || 'Active',
            termination_date: sanitizeDate(excelRow.termination_date),
            termination_reason: sanitizeString(excelRow.termination_reason),
            age: sanitizeNumeric(excelRow.age)
          };
          
          const docRef = doc(collection(db, 'employees')); // إنشاء ID تلقائي
          batch.set(docRef, newRecord);
          operationCount++;
        }

        // 🌟 تنفيذ الحزمة (Batch) لما توصل لـ 450 عملية (الحد الأقصى لفايربيز 500)
        if (operationCount >= 450) {
          await batch.commit();
          totalProcessed += operationCount;
          batch = writeBatch(db); // فتح حزمة جديدة
          operationCount = 0;
        }
      }

      // 🌟 تنفيذ أي عمليات متبقية
      if (operationCount > 0) {
        await batch.commit();
        totalProcessed += operationCount;
      }

      setLogs(prev => [...prev, `✅ تمت المزامنة بنجاح! تم معالجة ${totalProcessed} حركة.`]);
      alert('تم التحديث بنجاح! قاعدة البيانات الآن نظيفة ومحدثة بالكامل. ✅');
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
      <h3 className="text-lg font-bold text-primary mb-2">🔄 تحديث بيانات الموظفين الأساسية</h3>
      <p className="text-xs text-muted mb-6">
        هذه الأداة تقوم بتحديث البيانات الوظيفية الأساسية للموظفين (الإدارة، الوظيفة، ورقم التليفون فقط للموظفين الحاليين). الموظف الجديد سيتم إضافته بكامل بياناته.
      </p>

      <div className="mb-6">
        <button
          onClick={handleDownloadTemplate}
          className="bg-[var(--success-text)] text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm"
        >
          📥 تحميل القالب المعتمد (بدون بيانات العقود)
        </button>
      </div>

      <div className="border-2 border-dashed border-border p-8 text-center rounded-xl bg-background">
        <input
          type="file"
          accept=".xlsx, .xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mb-6 text-xs text-primary w-full"
        />
        
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={handleFileUpload}
            disabled={loading || !file}
            className="bg-gold text-white font-bold text-xs px-6 py-3 rounded-lg disabled:opacity-50 hover:bg-gold-hover transition-colors"
          >
            {loading ? 'جاري المزامنة...' : 'رفع وتحديث النظام 🚀'}
          </button>
        </div>
        
      </div>
      
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
