'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

interface DataSyncProps {
  currentUser?: any;
}

/* ===================== أدوات التواريخ (بدون Timezone) ===================== */

const pad = (n: number) => String(n).padStart(2, '0');

const normalizeDigits = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

// يتأكد إن التاريخ حقيقي (مش 31/02 مثلاً) ومنطقي
const fmtYMD = (y: number, m: number, d: number): string | null => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const ok =
    y >= 1950 && y <= 2100 &&
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d;
  return ok ? `${y}-${pad(m)}-${pad(d)}` : null;
};

// تاريخ اليوم بالتوقيت المحلي (مش UTC)
const todayLocal = () => {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
};

// بيرجّع التاريخ زي ما هو مكتوب في الإكسيل
const parseExcelDate = (val: any): string | null => {
  if (val === null || val === undefined || val === '') return null;

  // رقم Excel serial (الحالة الأساسية)
  if (typeof val === 'number') {
    const p = XLSX.SSF.parse_date_code(val);
    return p ? fmtYMD(p.y, p.m, p.d) : null;
  }

  // احتياط لو جالك Date: نستخدم المحلي عشان يطابق اللي ظاهر في الشيت
  if (val instanceof Date) {
    return isNaN(val.getTime())
      ? null
      : fmtYMD(val.getFullYear(), val.getMonth() + 1, val.getDate());
  }

  // نص
  const str = normalizeDigits(String(val).trim());
  let m = str.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); // YYYY-MM-DD
  if (m) return fmtYMD(+m[1], +m[2], +m[3]);
  m = str.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/); // DD-MM-YYYY
  if (m) return fmtYMD(+m[3], +m[2], +m[1]);
  return null;
};

// الافتراضي للموظفين الجدد فقط: تاريخ التعيين + سنة − يوم
const calculateYearMinusOneDay = (startDateStr: string | null): string | null => {
  if (!startDateStr) return null;
  const [y, m, d] = startDateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y + 1, m - 1, d - 1)).toISOString().slice(0, 10);
};

/* ===================== أدوات عامة ===================== */

// تشغيل مهام بعدد محدود من الطلبات المتوازية
async function runLimited<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const current = items[idx++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

const clean = (v: any) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

export default function DataSyncPage({ currentUser }: DataSyncProps) {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [progress, setProgress] = useState(0);

  const [userRole, setUserRole] = useState<string>('');
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // ⚠️ ده فحص واجهة فقط. الحماية الحقيقية لازم تكون RLS في Supabase أو API على السيرفر.
  useEffect(() => {
    if (currentUser?.role) {
      setUserRole(currentUser.role);
      setIsAuthChecking(false);
    } else {
      const savedUser = localStorage.getItem('session_user');
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          setUserRole(parsed.role || 'Viewer');
        } catch (e) {
          console.error(e);
          setUserRole('Viewer');
        }
      } else {
        setUserRole('Viewer');
      }
      setIsAuthChecking(false);
    }
  }, [currentUser]);

  const isAdmin = userRole.toLowerCase() === 'admin';

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        employee_code: '1001',
        employee_name: 'أحمد محمد علي',
        department: 'الموارد البشرية',
        job_title: 'أخصائي HR',
        company: 'المراسم الدولية',
        hiring_date: '2024-01-01',
        contract_end_date: '', // اختياري: للجدد فقط. لو فاضي = تاريخ التعيين + سنة − يوم
        email: 'ahmed@company.com',
        mobile: '01012345678',
        manager: 'محمود حسن',
        status: 'Active',
        termination_date: '',
        termination_reason: '',
        national_id: '29401010101234',
        birth_date: '1994-01-01',
      },
      {
        employee_code: '1002',
        employee_name: 'إبراهيم السيد',
        department: 'تحويلات/تحت الاعتماد',
        job_title: 'ايقاف راتب - اجازة بدون راتب',
        company: 'المراسم الدولية',
        hiring_date: '2023-05-15',
        contract_end_date: '',
        email: 'ibrahim@company.com',
        mobile: '01198765432',
        manager: 'علي جابر',
        status: 'Inactive',
        termination_date: '2024-02-01',
        termination_reason: 'إجازة بدون راتب',
        national_id: '28905050105678',
        birth_date: '1989-05-05',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    worksheet['!cols'] = [
      { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 20 },
      { wch: 15 }, { wch: 18 }, { wch: 25 }, { wch: 15 }, { wch: 20 },
      { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'قالب_الموظفين');
    XLSX.writeFile(workbook, 'Template_Employees_Import.xlsx');
  };

  // جلب كل الصفوف، ولو حصل خطأ بنوقف العملية (مش نكمل ببيانات ناقصة)
  const fetchAllRows = async (tableName: string, selectFields = '*', orderBy = 'employee_code') => {
    let allRows: any[] = [];
    let from = 0;
    const step = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(tableName)
        .select(selectFields)
        .order(orderBy, { ascending: true })
        .range(from, from + step - 1);
      if (error) throw new Error(`فشل جلب بيانات ${tableName}: ${error.message}`);
      if (!data || data.length === 0) break;
      allRows = [...allRows, ...data];
      if (data.length < step) break;
      from += step;
    }
    return allRows;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    setLoading(true);
    setProgress(5);
    setStatusMsg('جاري قراءة ملف Excel وتصنيف البيانات... ⏳');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const errors: string[] = [];
      try {
        // بدون cellDates: التاريخ بيجي كرقم serial ونحوله مباشرة (بدون Timezone)
        const wb = XLSX.read(evt.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        if (rows.length === 0) throw new Error('الملف المرفوع فارغ تماماً.');

        setStatusMsg(`تم قراءة ${rows.length} صف. جاري فحص قاعدة البيانات... 🚀`);
        setProgress(15);

        const existingEmps = await fetchAllRows('employees', 'employee_code');
        const existingCodesSet = new Set(
          existingEmps.map((x) => String(x.employee_code || '').trim().replace(/^0+/, ''))
        );

        // Map عشان نمنع تكرار نفس الكود جوه الملف (آخر صف يكسب)
        const oldToUpdateGeneral = new Map<number, any>();
        const oldToSetInactive = new Map<number, any>();
        const newEmps = new Map<number, { emp: any; contract: any }>();
        let duplicatesInFile = 0;
        let invalidDates = 0;

        for (const row of rows) {
          const rawCode = row['employee_code'] || row['كود الموظف'] || row['EmployeeCode'] || row['code'];
          if (!rawCode) continue;

          const cleanCode = String(rawCode).trim().replace(/^0+/, '');
          const parsedCodeInt = parseInt(cleanCode, 10);
          if (isNaN(parsedCodeInt)) continue;

          const deptVal = clean(row['department'] || row['الإدارة'] || row['Department']);
          const jobVal = clean(row['job_title'] || row['الوظيفة'] || row['JobTitle']);
          const nameVal = clean(row['employee_name'] || row['اسم الموظف']);
          const compVal = clean(row['company'] || row['الشركة']);
          const emailVal = clean(row['email'] || row['البريد الإلكتروني']);
          const mobileVal = clean(row['mobile'] || row['الموبايل']);
          const managerVal = clean(row['manager'] || row['المدير']);
          const natIdVal = clean(row['national_id']);
          const termReasonRaw = clean(row['termination_reason'] || row['سبب الإنهاء']);

          const rawBirth = row['birth_date'] || row['تاريخ الميلاد'];
          const rawHiring = row['hiring_date'] || row['تاريخ التعيين'];
          const rawTerm = row['termination_date'] || row['تاريخ الإنهاء'];
          const rawContractEnd = row['contract_end_date'] || row['تاريخ نهاية العقد'];

          const birthDateFormatted = parseExcelDate(rawBirth);
          const hiringDateFormatted = parseExcelDate(rawHiring); // زي ما هو في الشيت
          const terminationDateFormatted = parseExcelDate(rawTerm);
          const contractEndFromSheet = parseExcelDate(rawContractEnd);

          if (
            (rawBirth && !birthDateFormatted) ||
            (rawHiring && !hiringDateFormatted) ||
            (rawTerm && !terminationDateFormatted) ||
            (rawContractEnd && !contractEndFromSheet)
          ) {
            invalidDates++;
            errors.push(`الموظف ${parsedCodeInt}: يوجد تاريخ غير صالح وتم تجاهله`);
          }

          const deptStr = deptVal || '';
          const jobStr = jobVal || '';
          const isTransferDept = deptStr.includes('تحويلات');
          const isSalaryStop = jobStr.includes('ايقاف راتب');
          const shouldBeInactive = isTransferDept || isSalaryStop;

          const isOldEmployee = existingCodesSet.has(cleanCode);

          // تتبع التكرار داخل الملف
          const alreadySeen =
            oldToUpdateGeneral.has(parsedCodeInt) ||
            oldToSetInactive.has(parsedCodeInt) ||
            newEmps.has(parsedCodeInt);
          if (alreadySeen) {
            duplicatesInFile++;
            oldToUpdateGeneral.delete(parsedCodeInt);
            oldToSetInactive.delete(parsedCodeInt);
            newEmps.delete(parsedCodeInt);
          }

          if (isOldEmployee) {
            // 🔒 القدامى: contract_end_date خط أحمر، مش بيتقرأ ولا بيتكتب هنا نهائياً
            if (shouldBeInactive) {
              oldToSetInactive.set(parsedCodeInt, {
                employee_code: parsedCodeInt,
                termination_reason: termReasonRaw || 'ايقاف راتب / تحويلات',
                termination_date: terminationDateFormatted || todayLocal(),
              });
            } else {
              const updateObj: any = { employee_code: parsedCodeInt };
              if (deptVal !== null) updateObj.department = deptVal;
              if (jobVal !== null) updateObj.job_title = jobVal;
              if (nameVal !== null) updateObj.employee_name = nameVal;
              if (compVal !== null) updateObj.company = compVal;
              if (emailVal !== null) updateObj.email = emailVal;
              if (mobileVal !== null) updateObj.mobile = mobileVal;
              if (managerVal !== null) updateObj.manager = managerVal;
              if (natIdVal !== null) updateObj.national_id = natIdVal;
              if (birthDateFormatted !== null) updateObj.birth_date = birthDateFormatted;
              if (hiringDateFormatted !== null) updateObj.hiring_date = hiringDateFormatted;

              if (Object.keys(updateObj).length > 1) {
                oldToUpdateGeneral.set(parsedCodeInt, updateObj);
              }
            }
          } else {
            // موظف جديد: تاريخ التعيين من الشيت زي ما هو.
            // نهاية العقد: لو متحددة في الشيت ناخدها، غير كده الافتراضي (+سنة −يوم).
            const contractEndFormatted =
              contractEndFromSheet || calculateYearMinusOneDay(hiringDateFormatted);
            const status = shouldBeInactive ? 'Inactive' : 'Active';

            newEmps.set(parsedCodeInt, {
              emp: {
                employee_code: parsedCodeInt,
                employee_name: nameVal || 'غير مسجل',
                department: deptVal,
                job_title: jobVal,
                company: compVal,
                hiring_date: hiringDateFormatted,
                status,
                email: emailVal,
                mobile: mobileVal,
                manager: managerVal,
                national_id: natIdVal,
                birth_date: birthDateFormatted,
                // سبب/تاريخ الإنهاء بس للي Inactive
                termination_date: shouldBeInactive ? terminationDateFormatted || todayLocal() : terminationDateFormatted,
                termination_reason: shouldBeInactive ? termReasonRaw || 'ايقاف راتب / تحويلات' : termReasonRaw,
              },
              contract: {
                employee_code: parsedCodeInt,
                contract_type: 'محدد المدة',
                contract_start_date: hiringDateFormatted,
                contract_end_date: contractEndFormatted,
                status,
              },
            });
          }
        }

        setProgress(30);

        const BATCH_SIZE = 300;
        const CONCURRENCY = 15;

        const inactiveList = Array.from(oldToSetInactive.values());
        const updateList = Array.from(oldToUpdateGeneral.values());
        const newList = Array.from(newEmps.values());

        // 1) إيقاف القدامى المحولين
        if (inactiveList.length > 0) {
          setStatusMsg(`جاري إيقاف وتحويل ${inactiveList.length} موظف قديم...`);
          await runLimited(inactiveList, CONCURRENCY, async (emp) => {
            const { error: empErr } = await supabase
              .from('employees')
              .update({
                status: 'Inactive',
                department: 'تحويلات تحت الاعتماد',
                termination_reason: emp.termination_reason,
                termination_date: emp.termination_date,
              })
              .eq('employee_code', emp.employee_code);
            if (empErr) {
              errors.push(`إيقاف الموظف ${emp.employee_code}: ${empErr.message}`);
              return;
            }

            // 🔒 contract_end_date مش بيتلمس: بنغير الحالة والنوع بس
            const { error: conErr } = await supabase
              .from('contracts')
              .update({
                status: 'Inactive',
                contract_type: emp.termination_reason,
              })
              .eq('employee_code', emp.employee_code)
              .eq('status', 'Active');
            if (conErr) errors.push(`تحديث عقد الموظف ${emp.employee_code}: ${conErr.message}`);
          });
        }

        setProgress(45);

        // 2) تحديث بيانات القدامى (جدول employees فقط، جدول contracts مش بيتلمس)
        if (updateList.length > 0) {
          let done = 0;
          setStatusMsg(`جاري تحديث بيانات ${updateList.length} موظف قديم...`);
          await runLimited(updateList, CONCURRENCY, async (emp) => {
            const { employee_code, ...fields } = emp;
            const { error } = await supabase.from('employees').update(fields).eq('employee_code', employee_code);
            if (error) errors.push(`تحديث الموظف ${employee_code}: ${error.message}`);
            done++;
            if (done % 20 === 0 || done === updateList.length) {
              const pct = Math.min(85, 45 + Math.round((done / updateList.length) * 40));
              setProgress(pct);
              setStatusMsg(`جاري تحديث الموظفين القدامى: ${pct}% (${done} من ${updateList.length})`);
            }
          });
        }

        // 3) إضافة الجدد مع عقودهم (لو العقود فشلت بنرجع الموظفين اللي اتضافوا في نفس الدفعة)
        let insertedNew = 0;
        if (newList.length > 0) {
          setStatusMsg(`جاري إضافة ${newList.length} موظف جديد بعقودهم...`);
          for (let i = 0; i < newList.length; i += BATCH_SIZE) {
            const chunk = newList.slice(i, i + BATCH_SIZE);
            const empChunk = chunk.map((x) => x.emp);
            const contChunk = chunk.map((x) => x.contract);
            const codes = empChunk.map((x) => x.employee_code);

            const { error: empErr } = await supabase
              .from('employees')
              .upsert(empChunk, { onConflict: 'employee_code' });
            if (empErr) {
              errors.push(`إضافة دفعة موظفين (${i + 1}-${i + chunk.length}): ${empErr.message}`);
              continue;
            }

            const { error: conErr } = await supabase.from('contracts').insert(contChunk);
            if (conErr) {
              errors.push(`إضافة عقود الدفعة (${i + 1}-${i + chunk.length}): ${conErr.message} — تم التراجع عن موظفي الدفعة`);
              const { error: rollbackErr } = await supabase.from('employees').delete().in('employee_code', codes);
              if (rollbackErr) errors.push(`فشل التراجع عن الدفعة: ${rollbackErr.message}`);
              continue;
            }

            insertedNew += chunk.length;
            setProgress(Math.min(99, 85 + Math.round(((i + chunk.length) / newList.length) * 14)));
          }
        }

        setProgress(100);

        const failedCount = errors.length;
        let finalMsg =
          (failedCount === 0 ? 'تمت المزامنة بنجاح 100%! 🎉' : `⚠️ انتهت المزامنة مع ${failedCount} ملاحظة/خطأ`) +
          `\n\n- قدامى تم تحديث بياناتهم الشخصية/الوظيفية: ${updateList.length}` +
          `\n- قدامى تم إيقافهم وتحديث عقودهم (بدون المساس بتاريخ نهاية العقد): ${inactiveList.length}` +
          `\n- موظفين وعقود جديدة تم إنشاؤهم: ${insertedNew} من ${newList.length}`;
        if (duplicatesInFile > 0) finalMsg += `\n- أكواد مكررة داخل الملف (تم اعتماد آخر صف): ${duplicatesInFile}`;
        if (invalidDates > 0) finalMsg += `\n- صفوف بها تواريخ غير صالحة: ${invalidDates}`;
        if (failedCount > 0) {
          finalMsg += `\n\nالتفاصيل (أول 10):\n` + errors.slice(0, 10).map((x) => '• ' + x).join('\n');
          if (failedCount > 10) finalMsg += `\n... و ${failedCount - 10} أخرى (راجع الـ Console)`;
          console.error('Sync errors:', errors);
        }

        setStatusMsg(finalMsg);
        alert(failedCount === 0 ? 'تمت المزامنة بنجاح بنسبة 100%!' : 'انتهت المزامنة مع بعض الأخطاء، راجع التفاصيل.');
        input.value = '';
      } catch (err: any) {
        console.error(err);
        setStatusMsg('❌ حدث خطأ أثناء المزامنة: ' + err.message);
        alert('خطأ: ' + err.message);
        input.value = '';
      } finally {
        setLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  if (isAuthChecking) {
    return <div style={{ padding: '60px', textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>جاري التحقق من الصلاحيات... ⏳</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', direction: 'rtl' }}>
        <div style={{ borderColor: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '40px', borderRadius: '12px', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '20px', fontWeight: '900', color: '#dc2626' }}>🚨 محاولة وصول غير مصرح بها!</h2>
          <p style={{ fontWeight: 'bold', color: '#dc2626', fontSize: '14px' }}>ليس لديك صلاحيات مدير النظام (Admin) للدخول لهذه الصفحة. (دورك الحالي: {userRole})</p>
        </div>
      </div>
    );
  }

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
              📊 مركز مزامنة ورفع البيانات (Data Sync Tool) 👑
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: 'bold', lineHeight: '1.6' }}>
              تحديث شامل وآمن. لا يتم المساس بتواريخ نهاية العقود للموظفين القدامى نهائياً.
            </p>
          </div>

          <button
            onClick={handleDownloadTemplate}
            style={{ background: '#10b981', color: '#fff', border: 0, padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', boxShadow: '0 2px 6px rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span style={{ fontSize: '16px' }}>📥</span> تحميل القالب المعتمد
          </button>
        </div>

        <div className="upload-area">
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📂</div>
          <h4 style={{ margin: '0 0 8px', fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>ارفع ملف الإكسيل المعبأ هنا</h4>
          <p style={{ margin: '0 0 24px', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>يمكنك رفع آلاف الصفوف وسيقوم النظام بتحديث الموظفين وإيقاف المحولين تلقائياً</p>

          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            disabled={loading}
            id="excel-upload-input"
            style={{ display: 'none' }}
          />
          <label htmlFor="excel-upload-input" className={`custom-file-upload ${loading ? 'disabled' : ''}`}>
            {loading ? <>⏳ جاري المزامنة والحفظ ({progress}%)...</> : <>🚀 اختر الملف للرفع والتحديث</>}
          </label>
        </div>

        <div style={{ background: '#0f172a', padding: '18px', borderRadius: '12px', minHeight: '130px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', background: loading ? '#f59e0b' : '#10b981', borderRadius: '50%' }}></span>
              مراقبة تنفيذ العمليات (Batch Logs):
            </span>
            {loading && <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{progress}%</span>}
          </div>

          <div style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'pre-line', color: statusMsg.includes('❌') || statusMsg.includes('⚠️') ? '#fca5a5' : '#6ee7b7', fontFamily: 'monospace', lineHeight: '1.6' }}>
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
