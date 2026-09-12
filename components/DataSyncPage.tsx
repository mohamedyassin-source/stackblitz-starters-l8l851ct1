'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

export default function DataSyncPage() {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [progress, setProgress] = useState(0);

  // 🌟 دالة إنشاء وتحميل قالب Excel
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        employee_code: '1001',
        employee_name: 'أحمد محمد علي',
        department: 'الموارد البشرية',
        job_title: 'أخصائي HR',
        company: 'المراسم الدولية',
        hiring_date: '2024-01-01',
        email: 'ahmed@company.com',
        mobile: '01012345678',
        manager: 'محمود حسن',
        status: 'Active',
        termination_date: '',
        termination_reason: '',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
        age: 30,
        national_id: '29401010101234',
        birth_date: '1994-01-01'
      },
      {
        employee_code: '1002',
        employee_name: 'إبراهيم السيد',
        department: 'تحويلات/تحت الاعتماد',
        job_title: 'ايقاف راتب - اجازة بدون راتب',
        company: 'المراسم الدولية',
        hiring_date: '2023-05-15',
        email: 'ibrahim@company.com',
        mobile: '01198765432',
        manager: 'علي جابر',
        status: 'Inactive',
        termination_date: '2024-02-01',
        termination_reason: 'إجازة بدون راتب',
        created_at: '2023-05-15',
        updated_at: '2024-02-01',
        age: 35,
        national_id: '28905050105678',
        birth_date: '1989-05-05'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    worksheet['!cols'] = [
      { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 20 },
      { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 12 },
      { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 10 },
      { wch: 18 }, { wch: 15 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'قالب_الموظفين');
    XLSX.writeFile(workbook, 'Template_Employees_Import.xlsx');
  };

  const parseExcelDate = (excelDate: any) => {
    if (!excelDate) return null;
    if (typeof excelDate === 'number') {
      const d = new Date((excelDate - (25567 + 2)) * 86400 * 1000);
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    }
    const d = new Date(excelDate);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  };

  const calculateYearMinusOneDay = (startDateStr: string | null) => {
    if (!startDateStr) return null;
    const parts = startDateStr.split('-');
    if (parts.length < 3) return null;
    const start = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    if (isNaN(start.getTime())) return null;

    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);

    return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  };

  // 🌟 دالة جلب كل الموظفين لتخطي حد الـ 1000
  const fetchAllRows = async (tableName: string, selectFields = '*') => {
    let allRows: any[] = [];
    let from = 0;
    const step = 1000;
    while (true) {
      const { data, error } = await supabase.from(tableName).select(selectFields).range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      allRows = [...allRows, ...data];
      if (data.length < step) break;
      from += step;
    }
    return allRows;
  };

  // 🌟 دالة الرفع فائقة السرعة مع النسبة المئوية
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setProgress(5);
    setStatusMsg('جاري قراءة ملف Excel وتصنيف البيانات... ⏳');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        if (rows.length === 0) throw new Error('الملف المرفوع فارغ تماماً.');

        setStatusMsg(`تم قراءة ${rows.length} صف. جاري فحص قاعدة البيانات... 🚀`);
        setProgress(15);

        // 1. جلب أكواد الموظفين الموجودة حالياً بالكامل
        const existingEmps = await fetchAllRows('employees', 'employee_code');
        const existingCodesSet = new Set(existingEmps.map(e => String(e.employee_code || '').trim().replace(/^0+/, '')));

        const oldToUpdateDeptAndJob: any[] = [];
        const oldToSetInactiveCodes: number[] = [];
        const newEmpsPayload: any[] = [];
        const newContractsPayload: any[] = [];

        // 2. تصنيف السجلات في الذاكرة (سريع جداً)
        for (const row of rows) {
          const rawCode = row['employee_code'] || row['كود الموظف'] || row['EmployeeCode'] || row['code'];
          if (!rawCode) continue;

          const cleanCode = String(rawCode).trim().replace(/^0+/, '');
          const parsedCodeInt = parseInt(cleanCode, 10);
          if (isNaN(parsedCodeInt)) continue;

          const deptVal = row['department'] || row['الإدارة'] || row['Department'] || null;
          const jobVal = row['job_title'] || row['الوظيفة'] || row['JobTitle'] || null;

          const deptStr = String(deptVal || '');
          const jobStr = String(jobVal || '');
          const isTransferDept = deptStr.includes('تحويلات/تحت الاعتماد') || deptStr.includes('تحويلات تحت الاعتماد') || deptStr.includes('تحويلات');
          const isSalaryStop = jobStr.includes('ايقاف راتب');

          const isOldEmployee = existingCodesSet.has(cleanCode);

          if (isOldEmployee) {
            if (isTransferDept || isSalaryStop) {
              oldToSetInactiveCodes.push(parsedCodeInt);
            } else {
              const updateObj: any = { employee_code: parsedCodeInt };
              if (deptVal !== null) updateObj.department = deptVal;
              if (jobVal !== null) updateObj.job_title = jobVal;
              if (Object.keys(updateObj).length > 1) {
                oldToUpdateDeptAndJob.push(updateObj);
              }
            }
          } else {
            const hiringDateFormatted = parseExcelDate(row['hiring_date'] || row['تاريخ التعيين']);
            const contractEndFormatted = calculateYearMinusOneDay(hiringDateFormatted);

            newEmpsPayload.push({
              employee_code: parsedCodeInt,
              employee_name: row['employee_name'] || row['اسم الموظف'] || 'غير مسجل',
              department: deptVal,
              job_title: jobVal,
              company: row['company'] || row['الشركة'] || null,
              hiring_date: hiringDateFormatted,
              contract_start_date: hiringDateFormatted,
              contract_end_date: contractEndFormatted,
              email: row['email'] || row['البريد الإلكتروني'] || null,
              mobile: row['mobile'] || row['الموبايل'] || null,
              manager: row['manager'] || row['المدير'] || null,
              status: (isTransferDept || isSalaryStop) ? 'Inactive' : 'Active',
              contract_type: 'محدد المدة',
              national_id: row['national_id'] ? String(row['national_id']) : null,
              birth_date: parseExcelDate(row['birth_date'] || row['تاريخ الميلاد']),
              age: row['age'] ? parseInt(row['age'], 10) : null,
              termination_date: parseExcelDate(row['termination_date']),
              termination_reason: row['termination_reason'] || null,
            });

            newContractsPayload.push({
              employee_code: parsedCodeInt,
              contract_type: 'محدد المدة',
              contract_start_date: hiringDateFormatted,
              contract_end_date: contractEndFormatted,
              status: 'Active'
            });
          }
        }

        setProgress(30);

        // 3. معالجة الدفعات المجمعة (Batch Operations)
        const BATCH_SIZE = 300;

        // أ) تحويل الموظفين المستبعدين لـ Inactive
        if (oldToSetInactiveCodes.length > 0) {
          setStatusMsg(`جاري تحويل ${oldToSetInactiveCodes.length} موظف لـ Inactive...`);
          for (let i = 0; i < oldToSetInactiveCodes.length; i += BATCH_SIZE) {
            const chunk = oldToSetInactiveCodes.slice(i, i + BATCH_SIZE);
            await supabase.from('employees').update({ status: 'Inactive' }).in('employee_code', chunk);
          }
        }

        setProgress(45);

        // ب) تحديث الموظفين القدامى باستخدام Upsert (سريع جداً بالدفعة)
        if (oldToUpdateDeptAndJob.length > 0) {
          setStatusMsg(`جاري تحديث الوظيفة والإدارة لـ ${oldToUpdateDeptAndJob.length} موظف قديم...`);
          for (let i = 0; i < oldToUpdateDeptAndJob.length; i += BATCH_SIZE) {
            const chunk = oldToUpdateDeptAndJob.slice(i, i + BATCH_SIZE);
            await supabase.from('employees').upsert(chunk, { onConflict: 'employee_code' });
            
            const currentPct = Math.min(85, 45 + Math.round(((i + chunk.length) / oldToUpdateDeptAndJob.length) * 40));
            setProgress(currentPct);
            setStatusMsg(`جاري تحديث الموظفين القدامى: ${currentPct}% (${Math.min(i + BATCH_SIZE, oldToUpdateDeptAndJob.length)} من ${oldToUpdateDeptAndJob.length})`);
          }
        }

        // ج) إدخال الموظفين الجدد وعقودهم بالدفعة المجمعة
        if (newEmpsPayload.length > 0) {
          setStatusMsg(`جاري إضافة ${newEmpsPayload.length} موظف جديد بجدول العقود...`);
          for (let i = 0; i < newEmpsPayload.length; i += BATCH_SIZE) {
            const empChunk = newEmpsPayload.slice(i, i + BATCH_SIZE);
            const contChunk = newContractsPayload.slice(i, i + BATCH_SIZE);

            await supabase.from('employees').insert(empChunk);
            await supabase.from('contracts').insert(contChunk);
          }
        }

        setProgress(100);
        const finalMsg = `تمت المزامنة بنجاح 100%! 🎉\n\n- قدامى تم تحديث (وظيفتهم وإدارتهم): ${oldToUpdateDeptAndJob.length}\n- قدامى تم تحويلهم لـ Inactive: ${oldToSetInactiveCodes.length}\n- موظفين وعقود جديدة تم إنشاؤهم: ${newEmpsPayload.length}`;
        setStatusMsg(finalMsg);
        alert('تمت المزامنة بنجاح بنسبة 100%!');
        e.target.value = '';

      } catch (err: any) {
        console.error(err);
        setStatusMsg('❌ حدث خطأ أثناء المزامنة: ' + err.message);
        alert('خطأ: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  return (
    <div style={{ padding: '24px', direction: 'rtl' }}>
      
      <style>{`
        .upload-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          padding: 32px;
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
          max-width: 850px;
          margin: 0 auto;
        }
        .upload-area {
          border: 2px dashed #94a3b8;
          border-radius: 12px;
          padding: 40px;
          text-align: center;
          background: #f8fafc;
          transition: all 0.2s ease;
          margin-bottom: 24px;
        }
        .upload-area:hover {
          border-color: #3b82f6;
          background: #eff6ff;
        }
        .custom-file-upload {
          background: #3b82f6;
          color: #ffffff;
          padding: 12px 32px;
          border-radius: 8px;
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 6px rgba(59, 130, 246, 0.2);
        }
        .custom-file-upload.disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; }
        .progress-bar-container {
          width: 100%;
          height: 10px;
          background: #334155;
          border-radius: 5px;
          overflow: hidden;
          margin-top: 12px;
        }
        .progress-bar-fill {
          height: 100%;
          background: #10b981;
          transition: width 0.3s ease;
        }
      `}</style>

      <div className="upload-card">
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: '22px', color: '#0f172a', fontWeight: '900' }}>
              📊 مركز مزامنة ورفع البيانات (Data Sync Tool)
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: 'bold', lineHeight: '1.6' }}>
              تحديث جراحي سريع بنظام الدفعات (Batches). يدعم رفع الآلاف من الصفوف مع شريط تقدم حي ومتابعة مباشرة للعمليات.
            </p>
          </div>

          <button
            onClick={handleDownloadTemplate}
            style={{ background: '#10b981', color: '#fff', border: 0, padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', boxShadow: '0 2px 6px rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span style={{ fontSize: '16px' }}>📥</span> تحميل القالب المعتمد
          </button>
        </div>

        {/* منطقة رفع الملف */}
        <div className="upload-area">
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📂</div>
          <h4 style={{ margin: '0 0 8px', fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>ارفع ملف الإكسيل المعبأ هنا</h4>
          <p style={{ margin: '0 0 24px', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>يمكنك رفع أي عدد من الصفوف وسيقوم النظام بتحديث الموظفين بسرعة وسلاسة</p>

          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            disabled={loading}
            id="excel-upload-input"
            style={{ display: 'none' }}
          />
          <label htmlFor="excel-upload-input" className={`custom-file-upload ${loading ? 'disabled' : ''}`}>
            {loading ? (
              <>⏳ جاري المزامنة والحفظ ({progress}%)...</>
            ) : (
              <>🚀 اختر الملف للرفع والتحديث</>
            )}
          </label>
        </div>

        {/* شاشة الكونسول والشريط الحي */}
        <div style={{ background: '#0f172a', padding: '18px', borderRadius: '12px', minHeight: '130px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', background: loading ? '#f59e0b' : '#10b981', borderRadius: '50%' }}></span>
              مراقبة تنفيذ العمليات (Batch Logs):
            </span>
            {loading && <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{progress}%</span>}
          </div>
          
          <div style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'pre-line', color: statusMsg.includes('❌') ? '#fca5a5' : '#6ee7b7', fontFamily: 'monospace', lineHeight: '1.6' }}>
            {statusMsg || 'المنظومة في وضع الاستعداد.. اختر الملف للبدء.'}
          </div>

          {loading && (
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
