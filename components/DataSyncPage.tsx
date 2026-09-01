```tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';

type Employee = Record<string, any>;

type Change = {
  employee_code: string;
  employee_name: string;
  changes: {
    field: string;
    label: string;
    oldValue: string;
    newValue: string;
  }[];
};

type PreviewData = {
  totalInFile: number;
  totalInDatabase: number;
  newEmployees: Employee[];
  updatedEmployees: Change[];
  deletedEmployees: Employee[];
  unchangedCount: number;
};

export default function DataSyncPage() {
  const { refresh } = useAppData();

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  // =========================================================
  // أسماء الحقول بالعربي
  // =========================================================
  const fieldLabels: Record<string, string> = {
    employee_id: 'Employee ID',
    employee_code: 'كود الموظف',
    employee_name: 'اسم الموظف',
    department: 'الإدارة',
    job_title: 'الوظيفة',
    company: 'الشركة',
    hiring_date: 'تاريخ التعيين',
    national_id: 'الرقم القومي',
    birth_date: 'تاريخ الميلاد',
    age: 'السن',
    age_60_date: 'تاريخ بلوغ 60 سنة',
    age_status: 'حالة السن',
    status: 'الحالة',
    email: 'البريد الإلكتروني',
    mobile: 'الموبايل',
    manager: 'المدير',
    contract_type: 'نوع العقد',
    contract_start_date: 'بداية العقد',
    contract_end_date: 'نهاية العقد',
    password: 'كلمة المرور',
    role: 'الصلاحية',
    must_change_password: 'تغيير كلمة المرور',
  };

  // =========================================================
  // الحقول التي سيتم مقارنتها
  // =========================================================
  const compareFields = [
    'employee_name',
    'department',
    'job_title',
    'company',
    'hiring_date',
    'national_id',
    'birth_date',
    'age',
    'age_60_date',
    'age_status',
    'status',
    'email',
    'mobile',
    'manager',
    'contract_type',
    'contract_start_date',
    'contract_end_date',
    'password',
    'role',
    'must_change_password',
  ];

  // =========================================================
  // تحويل التاريخ
  // =========================================================
  const parseExcelDate = (val: any): string | null => {
    if (val === null || val === undefined || val === '') {
      return null;
    }

    if (val instanceof Date) {
      if (isNaN(val.getTime())) {
        return null;
      }

      const year = val.getFullYear();
      const month = String(val.getMonth() + 1).padStart(2, '0');
      const day = String(val.getDate()).padStart(2, '0');

      return `${year}-${month}-${day}`;
    }

    if (typeof val === 'number') {
      const date = XLSX.SSF.parse_date_code(val);

      if (date) {
        const month = String(date.m).padStart(2, '0');
        const day = String(date.d).padStart(2, '0');

        return `${date.y}-${month}-${day}`;
      }

      return null;
    }

    const str = String(val).trim();

    if (!str) {
      return null;
    }

    const isoMatch = str.match(
      /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/
    );

    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2].padStart(
        2,
        '0'
      )}-${isoMatch[3].padStart(2, '0')}`;
    }

    const dmyMatch = str.match(
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/
    );

    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(
        2,
        '0'
      )}-${dmyMatch[1].padStart(2, '0')}`;
    }

    return null;
  };

  // =========================================================
  // تجهيز موظف من Excel
  // =========================================================
  const prepareEmployee = (row: any): Employee => {
    return {
      employee_id: String(
        row.employee_id || row.employee_code || ''
      ).trim(),

      employee_code: String(
        row.employee_code || ''
      ).trim(),

      employee_name: String(
        row.employee_name || ''
      ).trim(),

      department: String(
        row.department || ''
      ).trim(),

      job_title: String(
        row.job_title || ''
      ).trim(),

      company: String(
        row.company || ''
      ).trim(),

      hiring_date: parseExcelDate(
        row.hiring_date
      ),

      national_id: String(
        row.national_id || ''
      ).trim(),

      birth_date: parseExcelDate(
        row.birth_date
      ),

      age: row.age !== ''
        ? Number(row.age)
        : null,

      age_60_date: parseExcelDate(
        row.age_60_date
      ),

      age_status: String(
        row.age_status || ''
      ).trim(),

      status: String(
        row.status || 'Active'
      ).trim(),

      email: String(
        row.email || ''
      ).trim(),

      mobile: String(
        row.mobile || ''
      ).trim(),

      manager: String(
        row.manager || ''
      ).trim(),

      contract_type: String(
        row.contract_type || 'محدد المدة'
      ).trim(),

      contract_start_date: parseExcelDate(
        row.contract_start_date
      ),

      contract_end_date: parseExcelDate(
        row.contract_end_date
      ),

      password: String(
        row.password || '123456'
      ).trim(),

      role: String(
        row.role || 'Employee'
      ).trim(),

      must_change_password:
        String(
          row.must_change_password
        ).toLowerCase() === 'true',
    };
  };

  // =========================================================
  // تحويل القيمة للمقارنة
  // =========================================================
  const normalizeValue = (value: any): string => {
    if (
      value === null ||
      value === undefined
    ) {
      return '';
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    return String(value).trim();
  };

  // =========================================================
  // جلب كل الموظفين من Supabase
  // =========================================================
  const getExistingEmployees = async () => {
    const allEmployees: Employee[] = [];

    const PAGE_SIZE = 1000;

    let from = 0;

    while (true) {
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .range(from, to);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        break;
      }

      allEmployees.push(...data);

      if (data.length < PAGE_SIZE) {
        break;
      }

      from += PAGE_SIZE;
    }

    return allEmployees;
  };

  // =========================================================
  // إنشاء Preview فقط - بدون أي تعديل في قاعدة البيانات
  // =========================================================
  const handlePreview = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (!file) {
      alert('يرجى اختيار ملف Excel أولاً');
      return;
    }

    setLoading(true);
    setPreview(null);

    setLogs([
      '🔍 بدء فحص الملف...',
      '⏳ لا يوجد أي تعديل أو حذف في قاعدة البيانات الآن.',
    ]);

    try {
      // -----------------------------------------------------
      // قراءة Excel
      // -----------------------------------------------------
      const data = await file.arrayBuffer();

      const workbook = XLSX.read(data, {
        type: 'array',
        cellDates: true,
      });

      const sheetName =
        workbook.SheetNames[0];

      const sheet =
        workbook.Sheets[sheetName];

      const jsonData: any[] =
        XLSX.utils.sheet_to_json(
          sheet,
          {
            defval: '',
          }
        );

      if (jsonData.length === 0) {
        throw new Error(
          'الملف المرفوع فارغ!'
        );
      }

      // -----------------------------------------------------
      // تجهيز Excel
      // -----------------------------------------------------
      const preparedData =
        jsonData
          .map(prepareEmployee)
          .filter(
            emp => emp.employee_code
          );

      if (preparedData.length === 0) {
        throw new Error(
          'لا يوجد موظفون لديهم employee_code صالح.'
        );
      }

      // -----------------------------------------------------
      // منع التكرار
      // -----------------------------------------------------
      const uploadedCodes =
        new Set<string>();

      const duplicateCodes: string[] =
        [];

      for (const emp of preparedData) {
        if (
          uploadedCodes.has(
            emp.employee_code
          )
        ) {
          duplicateCodes.push(
            emp.employee_code
          );
        }

        uploadedCodes.add(
          emp.employee_code
        );
      }

      if (
        duplicateCodes.length > 0
      ) {
        throw new Error(
          `يوجد تكرار في كود الموظف داخل الملف: ${duplicateCodes
            .slice(0, 20)
            .join(', ')}`
        );
      }

      setLogs(prev => [
        ...prev,
        `📄 عدد الموظفين في الملف: ${preparedData.length}`,
        '🔍 جاري قراءة بيانات الموظفين الحالية...',
      ]);

      // -----------------------------------------------------
      // جلب DB
      // -----------------------------------------------------
      const existingEmployees =
        await getExistingEmployees();

      setLogs(prev => [
        ...prev,
        `🗄️ عدد الموظفين الحالي في قاعدة البيانات: ${existingEmployees.length}`,
        '🔄 جاري مقارنة البيانات...',
      ]);

      // -----------------------------------------------------
      // تحويل DB إلى Map
      // -----------------------------------------------------
      const existingMap =
        new Map<string, Employee>();

      existingEmployees.forEach(emp => {
        const code = String(
          emp.employee_code || ''
        ).trim();

        if (code) {
          existingMap.set(code, emp);
        }
      });

      // -----------------------------------------------------
      // NEW + UPDATED + UNCHANGED
      // -----------------------------------------------------
      const newEmployees: Employee[] =
        [];

      const updatedEmployees: Change[] =
        [];

      let unchangedCount = 0;

      for (const newEmp of preparedData) {
        const code =
          newEmp.employee_code;

        const oldEmp =
          existingMap.get(code);

        // جديد
        if (!oldEmp) {
          newEmployees.push(newEmp);
          continue;
        }

        // موجود -> مقارنة
        const changes: Change['changes'] =
          [];

        for (const field of compareFields) {
          const oldValue =
            normalizeValue(
              oldEmp[field]
            );

          const newValue =
            normalizeValue(
              newEmp[field]
            );

          if (oldValue !== newValue) {
            changes.push({
              field,
              label:
                fieldLabels[field] ||
                field,
              oldValue,
              newValue,
            });
          }
        }

        if (changes.length > 0) {
          updatedEmployees.push({
            employee_code: code,
            employee_name:
              newEmp.employee_name ||
              oldEmp.employee_name ||
              '',
            changes,
          });
        } else {
          unchangedCount++;
        }
      }

      // -----------------------------------------------------
      // DELETED
      // -----------------------------------------------------
      const deletedEmployees =
        existingEmployees.filter(
          oldEmp => {
            const code = String(
              oldEmp.employee_code ||
                ''
            ).trim();

            return (
              code &&
              !uploadedCodes.has(code)
            );
          }
        );

      // -----------------------------------------------------
      // حفظ Preview
      // -----------------------------------------------------
      const previewData: PreviewData = {
        totalInFile:
          preparedData.length,

        totalInDatabase:
          existingEmployees.length,

        newEmployees,

        updatedEmployees,

        deletedEmployees,

        unchangedCount,
      };

      setPreview(previewData);

      // -----------------------------------------------------
      // Log
      // -----------------------------------------------------
      setLogs(prev => [
        ...prev,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '📋 انتهى الفحص - لم يتم تنفيذ أي تغيير.',
        `🟢 جديد: ${newEmployees.length}`,
        `🟡 تعديل: ${updatedEmployees.length}`,
        `🔴 حذف: ${deletedEmployees.length}`,
        `⚪ بدون تغيير: ${unchangedCount}`,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '👆 راجع التفاصيل ثم اضغط "اعتماد المزامنة" للتنفيذ.',
      ]);
    } catch (err: any) {
      console.error(
        'Preview Error:',
        err
      );

      setLogs(prev => [
        ...prev,
        `❌ خطأ: ${
          err?.message ||
          'خطأ غير معروف'
        }`,
      ]);

      alert(
        'حدث خطأ أثناء الفحص: ' +
          (err?.message ||
            'خطأ غير معروف')
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // تنفيذ المزامنة بعد اعتماد المستخدم
  // =========================================================
  const handleApplySync = async () => {
    if (!preview || !file) {
      return;
    }

    const confirmed = window.confirm(
      `هل أنت متأكد من اعتماد المزامنة؟\n\n` +
      `🟢 إضافة: ${preview.newEmployees.length}\n` +
      `🟡 تعديل: ${preview.updatedEmployees.length}\n` +
      `🔴 حذف: ${preview.deletedEmployees.length}\n\n` +
      `لن يمكن التراجع عن الحذف من هنا.`
    );

    if (!confirmed) {
      return;
    }

    setApplying(true);

    setLogs(prev => [
      ...prev,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '🚀 تم اعتماد المزامنة. جاري التنفيذ...',
    ]);

    try {
      // -----------------------------------------------------
      // تجهيز كل الموظفين من الملف مرة أخرى
      // -----------------------------------------------------
      const data =
        await file.arrayBuffer();

      const workbook = XLSX.read(data, {
        type: 'array',
        cellDates: true,
      });

      const sheetName =
        workbook.SheetNames[0];

      const sheet =
        workbook.Sheets[sheetName];

      const jsonData: any[] =
        XLSX.utils.sheet_to_json(
          sheet,
          {
            defval: '',
          }
        );

      const preparedData =
        jsonData
          .map(prepareEmployee)
          .filter(
            emp => emp.employee_code
          );

      // -----------------------------------------------------
      // 1. إضافة وتحديث
      // -----------------------------------------------------
      const BATCH_SIZE = 500;

      for (
        let i = 0;
        i < preparedData.length;
        i += BATCH_SIZE
      ) {
        const batch =
          preparedData.slice(
            i,
            i + BATCH_SIZE
          );

        setLogs(prev => [
          ...prev,
          `🔄 جاري حفظ الموظفين من ${
            i + 1
          } إلى ${Math.min(
            i + BATCH_SIZE,
            preparedData.length
          )}...`,
        ]);

        const { error } =
          await supabase
            .from('employees')
            .upsert(
              batch,
              {
                onConflict:
                  'employee_code',
              }
            );

        if (error) {
          throw error;
        }
      }

      setLogs(prev => [
        ...prev,
        '✅ تم تنفيذ الإضافة والتحديث.',
      ]);

      // -----------------------------------------------------
      // 2. الحذف
      // -----------------------------------------------------
      if (
        preview.deletedEmployees.length >
        0
      ) {
        const DELETE_BATCH_SIZE = 500;

        for (
          let i = 0;
          i <
          preview.deletedEmployees
            .length;
          i += DELETE_BATCH_SIZE
        ) {
          const batch =
            preview.deletedEmployees.slice(
              i,
              i +
                DELETE_BATCH_SIZE
            );

          const codes =
            batch
              .map(
                emp =>
                  emp.employee_code
              )
              .filter(Boolean);

          setLogs(prev => [
            ...prev,
            `🗑️ جاري حذف الموظفين من ${
              i + 1
            } إلى ${Math.min(
              i +
                DELETE_BATCH_SIZE,
              preview
                .deletedEmployees
                .length
            )}...`,
          ]);

          const { error } =
            await supabase
              .from('employees')
              .delete()
              .in(
                'employee_code',
                codes
              );

          if (error) {
            throw error;
          }
        }

        setLogs(prev => [
          ...prev,
          `✅ تم حذف ${preview.deletedEmployees.length} موظف.`,
        ]);
      }

      // -----------------------------------------------------
      // النهاية
      // -----------------------------------------------------
      setLogs(prev => [
        ...prev,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '🎉 تمت المزامنة بنجاح!',
        `🟢 تمت إضافة: ${preview.newEmployees.length}`,
        `🟡 تمت معالجة تعديلات: ${preview.updatedEmployees.length}`,
        `🔴 تم حذف: ${preview.deletedEmployees.length}`,
        `⚪ بدون تغيير: ${preview.unchangedCount}`,
      ]);

      alert(
        'تم اعتماد ومزامنة بيانات الموظفين بنجاح ✅'
      );

      await refresh();

      setPreview(null);
      setFile(null);
    } catch (err: any) {
      console.error(
        'Apply Sync Error:',
        err
      );

      setLogs(prev => [
        ...prev,
        `❌ فشل تنفيذ المزامنة: ${
          err?.message ||
          'خطأ غير معروف'
        }`,
      ]);

      alert(
        'حدث خطأ أثناء تنفيذ المزامنة: ' +
          (err?.message ||
            'خطأ غير معروف')
      );
    } finally {
      setApplying(false);
    }
  };

  // =========================================================
  // إلغاء الـ Preview
  // =========================================================
  const handleCancelPreview = () => {
    setPreview(null);
    setLogs(prev => [
      ...prev,
      '↩️ تم إلغاء المزامنة. لم يتم تغيير قاعدة البيانات.',
    ]);
  };

  // =========================================================
  // UI
  // =========================================================
  return (
    <div className="flex flex-col gap-6 pb-10">

      {/* ===================================================
          العنوان
      =================================================== */}
      <div className="executive-card p-6">

        <h3 className="m-0 text-lg font-extrabold text-primary">
          🔄 مزامنة بيانات الموظفين
        </h3>

        <p className="mt-1 text-xs text-muted font-bold">
          ارفع ملف Excel وسيتم أولاً فحص التغييرات
          وعرض الإضافات والتعديلات والحذف بدون تنفيذ أي شيء.
        </p>

        {/* =================================================
            اختيار الملف
        ================================================= */}
        {!preview && (
          <>
            <div className="my-6">

              <button
                onClick={
                  handleDownloadTemplate
                }
                disabled={loading}
                className="bg-[var(--success-text)] hover:opacity-90 text-white px-5 py-2.5 rounded-lg font-bold text-xs transition-opacity flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                📥 تحميل Template Excel
              </button>

            </div>

            <form
              onSubmit={
                handlePreview
              }
              className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-background"
            >

              <div className="text-4xl mb-3">
                📁
              </div>

              <p className="m-0 mb-4 text-xs font-bold text-primary">
                اختر ملف Excel
              </p>

              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={loading}
                onChange={e =>
                  setFile(
                    e.target.files?.[0] ||
                      null
                  )
                }
                className="mb-6 text-xs text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary file:text-card hover:file:opacity-80"
              />

              {file && (
                <div className="mb-5 text-xs font-bold text-primary">
                  📄 {file.name}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  loading ||
                  !file
                }
                className="bg-gold hover:bg-gold-hover text-white font-bold text-xs px-8 py-3 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? 'جاري فحص الملف... ⏳'
                  : 'فحص التغييرات 🔍'}
              </button>

            </form>
          </>
        )}

        {/* =================================================
            Preview Summary
        ================================================= */}
        {preview && (
          <div className="mt-6">

            <div className="bg-background border border-border rounded-xl p-5">

              <div className="text-sm font-extrabold text-primary mb-4">
                📋 نتيجة الفحص - قبل التنفيذ
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">

                <div className="rounded-lg border border-border p-4 text-center">
                  <div className="text-xl font-extrabold text-primary">
                    {preview.totalInFile}
                  </div>
                  <div className="text-xs font-bold text-muted">
                    في الملف
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 text-center">
                  <div className="text-xl font-extrabold text-green-600">
                    {preview.newEmployees.length}
                  </div>
                  <div className="text-xs font-bold text-muted">
                    جديد
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 text-center">
                  <div className="text-xl font-extrabold text-amber-600">
                    {preview.updatedEmployees.length}
                  </div>
                  <div className="text-xs font-bold text-muted">
                    تعديل
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 text-center">
                  <div className="text-xl font-extrabold text-red-600">
                    {preview.deletedEmployees.length}
                  </div>
                  <div className="text-xs font-bold text-muted">
                    حذف
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 text-center">
                  <div className="text-xl font-extrabold text-slate-500">
                    {preview.unchangedCount}
                  </div>
                  <div className="text-xs font-bold text-muted">
                    بدون تغيير
                  </div>
                </div>

              </div>

            </div>

            {/* =================================================
                الموظفون الجدد
            ================================================= */}
            {preview.newEmployees.length >
              0 && (
              <div className="mt-5 border border-green-200 rounded-xl overflow-hidden">

                <div className="bg-green-50 px-4 py-3 font-extrabold text-sm text-green-700">
                  🟢 الموظفون الجدد (
                  {preview.newEmployees.length}
                  )
                </div>

                <div className="max-h-60 overflow-y-auto">

                  {preview.newEmployees.map(
                    (emp, index) => (
                      <div
                        key={
                          emp.employee_code
                        }
                        className="px-4 py-3 border-t border-border text-xs flex justify-between gap-4"
                      >
                        <span className="font-bold">
                          {emp.employee_code}
                        </span>

                        <span>
                          {emp.employee_name}
                        </span>

                        <span className="text-muted">
                          {emp.department}
                        </span>
                      </div>
                    )
                  )}

                </div>
              </div>
            )}

            {/* =================================================
                الموظفون المعدلون
            ================================================= */}
            {preview.updatedEmployees.length >
              0 && (
              <div className="mt-5 border border-amber-200 rounded-xl overflow-hidden">

                <div className="bg-amber-50 px-4 py-3 font-extrabold text-sm text-amber-700">
                  🟡 الموظفون الذين سيتم تعديلهم (
                  {
                    preview
                      .updatedEmployees
                      .length
                  }
                  )
                </div>

                <div className="max-h-96 overflow-y-auto">

                  {preview.updatedEmployees.map(
                    emp => (
                      <div
                        key={
                          emp.employee_code
                        }
                        className="p-4 border-t border-border"
                      >

                        <div className="flex justify-between mb-3 text-xs font-extrabold">
                          <span>
                            {emp.employee_code}
                          </span>

                          <span>
                            {emp.employee_name}
                          </span>
                        </div>

                        <div className="flex flex-col gap-2">

                          {emp.changes.map(
                            change => (
                              <div
                                key={
                                  change.field
                                }
                                className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs bg-background rounded-lg p-2"
                              >

                                <span className="font-bold">
                                  {change.label}
                                </span>

                                <span className="text-red-600 break-all">
                                  القديم:{' '}
                                  {change.oldValue ||
                                    '—'}
                                </span>

                                <span className="text-green-600 break-all">
                                  الجديد:{' '}
                                  {change.newValue ||
                                    '—'}
                                </span>

                                <span className="text-muted">
                                  سيتم التحديث
                                </span>

                              </div>
                            )
                          )}

                        </div>

                      </div>
                    )
                  )}

                </div>
              </div>
            )}

            {/* =================================================
                الموظفون المحذوفون
            ================================================= */}
            {preview.deletedEmployees.length >
              0 && (
              <div className="mt-5 border border-red-200 rounded-xl overflow-hidden">

                <div className="bg-red-50 px-4 py-3 font-extrabold text-sm text-red-700">
                  🔴 الموظفون الذين سيتم حذفهم (
                  {
                    preview
                      .deletedEmployees
                      .length
                  }
                  )
                </div>

                <div className="max-h-72 overflow-y-auto">

                  {preview.deletedEmployees.map(
                    emp => (
                      <div
                        key={
                          emp.employee_code
                        }
                        className="px-4 py-3 border-t border-border text-xs flex justify-between gap-4"
                      >
                        <span className="font-bold text-red-700">
                          {emp.employee_code}
                        </span>

                        <span>
                          {emp.employee_name}
                        </span>

                        <span className="text-muted">
                          {emp.department}
                        </span>
                      </div>
                    )
                  )}

                </div>
              </div>
            )}

            {/* =================================================
                أزرار الاعتماد والإلغاء
            ================================================= */}
            <div className="mt-6 flex flex-wrap gap-3">

              <button
                onClick={
                  handleApplySync
                }
                disabled={applying}
                className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs px-8 py-3 rounded-lg shadow-sm disabled:opacity-50"
              >
                {applying
                  ? 'جاري التنفيذ... ⏳'
                  : '✅ اعتماد وتنفيذ المزامنة'}
              </button>

              <button
                onClick={
                  handleCancelPreview
                }
                disabled={applying}
                className="bg-slate-500 hover:bg-slate-600 text-white font-bold text-xs px-8 py-3 rounded-lg shadow-sm disabled:opacity-50"
              >
                ↩️ إلغاء
              </button>

            </div>

          </div>
        )}

      </div>

      {/* =====================================================
          System Log
      ===================================================== */}
      {logs.length > 0 && (
        <div className="bg-[#0f172a] text-[#38bdf8] p-5 rounded-xl font-mono text-xs max-h-80 overflow-y-auto border border-border">

          <div className="font-bold mb-2 text-white">
            سجل المعالجة (System Log):
          </div>

          {logs.map(
            (log, idx) => (
              <div
                key={idx}
                className="mb-1"
              >
                {log}
              </div>
            )
          )}

        </div>
      )}

    </div>
  );

  // =========================================================
  // Template
  // =========================================================
  function handleDownloadTemplate() {
    const headers = [
      'employee_id',
      'employee_code',
      'employee_name',
      'department',
      'job_title',
      'company',
      'hiring_date',
      'national_id',
      'birth_date',
      'age',
      'age_60_date',
      'age_status',
      'status',
      'email',
      'mobile',
      'manager',
      'contract_type',
      'contract_start_date',
      'contract_end_date',
      'password',
      'role',
      'must_change_password',
    ];

    const ws =
      XLSX.utils.aoa_to_sheet([
        headers,
      ]);

    const wb =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      'Employees_Template'
    );

    XLSX.writeFile(
      wb,
      'قالب_تحديث_بيانات_الموظفين_المجمع.xlsx'
    );
  }
}
```
