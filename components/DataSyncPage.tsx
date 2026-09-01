'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';

type Employee = Record<string, any>;

type FieldChange = {
  field: string;
  label: string;
  oldValue: any;
  newValue: any;
};

type EmployeeChange = {
  employee_code: string;
  employee_name: string;
  changes: FieldChange[];
};

type PreviewData = {
  totalInFile: number;
  totalInDatabase: number;
  newEmployees: Employee[];
  updatedEmployees: EmployeeChange[];
  inactiveEmployees: Employee[];
  unchangedCount: number;
};

const FIELD_LABELS: Record<string, string> = {
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

const COMPARE_FIELDS = [
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

function normalizeValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return String(value).trim();
}

function parseExcelDate(value: any): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  if (typeof value === 'number') {
    try {
      const parsed = XLSX.SSF.parse_date_code(value);

      if (parsed) {
        const year = parsed.y;
        const month = String(parsed.m).padStart(2, '0');
        const day = String(parsed.d).padStart(2, '0');

        return `${year}-${month}-${day}`;
      }
    } catch {
      return null;
    }
  }

  const str = String(value).trim();

  if (!str) {
    return null;
  }

  const isoMatch = str.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})/
  );

  if (isoMatch) {
    const year = isoMatch[1];
    const month = String(Number(isoMatch[2])).padStart(2, '0');
    const day = String(Number(isoMatch[3])).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  const dmyMatch = str.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/
  );

  if (dmyMatch) {
    const day = String(Number(dmyMatch[1])).padStart(2, '0');
    const month = String(Number(dmyMatch[2])).padStart(2, '0');
    const year = dmyMatch[3];

    return `${year}-${month}-${day}`;
  }

  return null;
}

function prepareEmployee(row: any): Employee {
  return {
    employee_id:
      row.employee_id !== undefined &&
      row.employee_id !== ''
        ? row.employee_id
        : null,

    employee_code: String(row.employee_code ?? '').trim(),

    employee_name: String(row.employee_name ?? '').trim(),

    department: String(row.department ?? '').trim(),

    job_title: String(row.job_title ?? '').trim(),

    company: String(row.company ?? '').trim(),

    hiring_date: parseExcelDate(row.hiring_date),

    national_id: String(row.national_id ?? '').trim(),

    birth_date: parseExcelDate(row.birth_date),

    age:
      row.age === '' ||
      row.age === null ||
      row.age === undefined
        ? null
        : Number(row.age),

    age_60_date: parseExcelDate(row.age_60_date),

    age_status: String(row.age_status ?? '').trim(),

    status:
      row.status !== undefined && row.status !== ''
        ? String(row.status).trim()
        : 'Active',

    email: String(row.email ?? '').trim(),

    mobile: String(row.mobile ?? '').trim(),

    manager: String(row.manager ?? '').trim(),

    contract_type:
      row.contract_type !== undefined &&
      row.contract_type !== ''
        ? String(row.contract_type).trim()
        : 'محدد المدة',

    contract_start_date: parseExcelDate(
      row.contract_start_date
    ),

    contract_end_date: parseExcelDate(
      row.contract_end_date
    ),

    password:
      row.password !== undefined &&
      row.password !== ''
        ? String(row.password)
        : '123456',

    role:
      row.role !== undefined &&
      row.role !== ''
        ? String(row.role)
        : 'Employee',

    must_change_password:
      String(row.must_change_password ?? '').toLowerCase() ===
      'true',
  };
}

function displayValue(value: any): string {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '—';
  }

  if (typeof value === 'boolean') {
    return value ? 'نعم' : 'لا';
  }

  return String(value);
}

export default function DataSyncPage() {
  const { refresh } = useAppData();

  const [file, setFile] = useState<File | null>(null);

  const [preview, setPreview] = useState<PreviewData | null>(
    null
  );

  const [loading, setLoading] = useState(false);

  const [applying, setApplying] = useState(false);

  const [message, setMessage] = useState('');

  const [error, setError] = useState('');

  const [showNew, setShowNew] = useState(false);

  const [showUpdated, setShowUpdated] = useState(false);

  const [showInactive, setShowInactive] = useState(false);

  async function getExistingEmployees(): Promise<Employee[]> {
    const allEmployees: Employee[] = [];

    const pageSize = 1000;

    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .range(from, from + pageSize - 1);

      if (error) {
        throw new Error(
          `خطأ في تحميل الموظفين: ${error.message}`
        );
      }

      if (!data || data.length === 0) {
        break;
      }

      allEmployees.push(...data);

      if (data.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    return allEmployees;
  }

  async function readExcelFile(): Promise<Employee[]> {
    if (!file) {
      throw new Error('من فضلك اختر ملف Excel أولاً');
    }

    const buffer = await file.arrayBuffer();

    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
    });

    if (!workbook.SheetNames.length) {
      throw new Error('ملف Excel لا يحتوي على أي Sheet');
    }

    const sheetName = workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      defval: '',
    });

    if (!rows.length) {
      throw new Error('ملف Excel فارغ');
    }

    const employees = rows
      .map((row: any) => prepareEmployee(row))
      .filter(
        (employee) =>
          normalizeValue(employee.employee_code) !== ''
      );

    if (!employees.length) {
      throw new Error(
        'لم يتم العثور على أي موظف. تأكد من وجود عمود employee_code'
      );
    }

    return employees;
  }

  function validateDuplicates(employees: Employee[]) {
    const codes = new Set<string>();

    const duplicates = new Set<string>();

    for (const employee of employees) {
      const code = normalizeValue(employee.employee_code);

      if (codes.has(code)) {
        duplicates.add(code);
      }

      codes.add(code);
    }

    if (duplicates.size > 0) {
      throw new Error(
        `يوجد كود موظف مكرر داخل ملف Excel:\n${Array.from(
          duplicates
        ).join(', ')}`
      );
    }
  }

  function compareEmployees(
    oldEmployee: Employee,
    newEmployee: Employee
  ): FieldChange[] {
    const changes: FieldChange[] = [];

    for (const field of COMPARE_FIELDS) {
      const oldValue = oldEmployee[field];

      const newValue = newEmployee[field];

      const oldNormalized = normalizeValue(oldValue);

      const newNormalized = normalizeValue(newValue);

      if (oldNormalized !== newNormalized) {
        changes.push({
          field,
          label: FIELD_LABELS[field] || field,
          oldValue,
          newValue,
        });
      }
    }

    return changes;
  }

  async function handlePreview() {
    try {
      setLoading(true);
      setError('');
      setMessage('');
      setPreview(null);

      const excelEmployees = await readExcelFile();

      validateDuplicates(excelEmployees);

      setMessage('جاري قراءة بيانات قاعدة البيانات...');

      const databaseEmployees = await getExistingEmployees();

      const databaseMap = new Map<string, Employee>();

      for (const employee of databaseEmployees) {
        const code = normalizeValue(employee.employee_code);

        if (code) {
          databaseMap.set(code, employee);
        }
      }

      const excelCodes = new Set<string>();

      const newEmployees: Employee[] = [];

      const updatedEmployees: EmployeeChange[] = [];

      let unchangedCount = 0;

      for (const excelEmployee of excelEmployees) {
        const code = normalizeValue(
          excelEmployee.employee_code
        );

        excelCodes.add(code);

        const existingEmployee = databaseMap.get(code);

        if (!existingEmployee) {
          newEmployees.push(excelEmployee);
          continue;
        }

        const changes = compareEmployees(
          existingEmployee,
          excelEmployee
        );

        if (changes.length > 0) {
          updatedEmployees.push({
            employee_code: code,
            employee_name:
              excelEmployee.employee_name ||
              existingEmployee.employee_name ||
              '',
            changes,
          });
        } else {
          unchangedCount++;
        }
      }

      const inactiveEmployees = databaseEmployees.filter(
        (employee) => {
          const code = normalizeValue(
            employee.employee_code
          );

          const status = normalizeValue(
            employee.status
          ).toLowerCase();

          return (
            code &&
            !excelCodes.has(code) &&
            status !== 'inactive'
          );
        }
      );

      setPreview({
        totalInFile: excelEmployees.length,
        totalInDatabase: databaseEmployees.length,
        newEmployees,
        updatedEmployees,
        inactiveEmployees,
        unchangedCount,
      });

      setMessage(
        'تم فحص الملف بنجاح. لم يتم تعديل أي بيانات.'
      );
    } catch (err: any) {
      console.error(err);

      setError(
        err?.message ||
          'حدث خطأ أثناء فحص ملف Excel'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleApplySync() {
    if (!preview || !file) {
      setError(
        'لا توجد معاينة جاهزة للتنفيذ'
      );
      return;
    }

    let confirmationMessage =
      `سيتم تنفيذ المزامنة:\n\n` +
      `إجمالي Excel: ${preview.totalInFile}\n` +
      `إضافة: ${preview.newEmployees.length}\n` +
      `تعديل: ${preview.updatedEmployees.length}\n` +
      `بدون تغيير: ${preview.unchangedCount}\n` +
      `تحويل إلى Inactive: ${preview.inactiveEmployees.length}\n\n`;

    if (preview.inactiveEmployees.length > 0) {
      confirmationMessage +=
        `⚠️ لن يتم حذف أي موظف.\n` +
        `سيتم فقط تحويل ${preview.inactiveEmployees.length} موظف إلى Inactive.\n\n`;
    }

    confirmationMessage +=
      'هل تريد اعتماد وتنفيذ المزامنة؟';

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    try {
      setApplying(true);
      setError('');
      setMessage('');

      setMessage('جاري قراءة ملف Excel...');

      const excelEmployees = await readExcelFile();

      validateDuplicates(excelEmployees);

      setMessage(
        'جاري تحميل بيانات الموظفين الحالية...'
      );

      const databaseEmployees = await getExistingEmployees();

      const databaseMap = new Map<string, Employee>();

      for (const employee of databaseEmployees) {
        const code = normalizeValue(employee.employee_code);

        if (code) {
          databaseMap.set(code, employee);
        }
      }

      /*
       * الموظف الموجود بالفعل يحتفظ
       * بنفس EmployeeID الموجود في قاعدة البيانات.
       */
      const employeesToSave = excelEmployees.map(
        (employee) => {
          const code = normalizeValue(
            employee.employee_code
          );

          const existingEmployee = databaseMap.get(code);

          if (existingEmployee) {
            return {
              ...employee,
              employee_id: existingEmployee.employee_id,
            };
          }

          return employee;
        }
      );

      const batchSize = 500;

      /*
       * إضافة الموظفين الجدد
       * وتحديث الموظفين الموجودين
       */
      for (
        let i = 0;
        i < employeesToSave.length;
        i += batchSize
      ) {
        const batch = employeesToSave.slice(
          i,
          i + batchSize
        );

        setMessage(
          `جاري حفظ الموظفين... ${Math.min(
            i + batch.length,
            employeesToSave.length
          )} / ${employeesToSave.length}`
        );

        const { error: upsertError } =
          await supabase
            .from('employees')
            .upsert(batch, {
              onConflict: 'employee_code',
            });

        if (upsertError) {
          throw new Error(
            `خطأ أثناء حفظ الموظفين: ${upsertError.message}`
          );
        }
      }

      /*
       * تحديد الموظفين الموجودين في DB
       * وغير الموجودين في Excel.
       */
      const excelCodes = new Set(
        employeesToSave.map((employee) =>
          normalizeValue(employee.employee_code)
        )
      );

      const employeesToInactive =
        databaseEmployees.filter((employee) => {
          const code = normalizeValue(
            employee.employee_code
          );

          const status = normalizeValue(
            employee.status
          ).toLowerCase();

          return (
            code &&
            !excelCodes.has(code) &&
            status !== 'inactive'
          );
        });

      /*
       * تحويل الموظفين إلى Inactive
       * بدلاً من حذفهم.
       */
      for (
        let i = 0;
        i < employeesToInactive.length;
        i += batchSize
      ) {
        const batch = employeesToInactive.slice(
          i,
          i + batchSize
        );

        const codes = batch.map(
          (employee) => employee.employee_code
        );

        setMessage(
          `جاري تحويل الموظفين إلى Inactive... ${Math.min(
            i + batch.length,
            employeesToInactive.length
          )} / ${employeesToInactive.length}`
        );

        const { error: inactiveError } =
          await supabase
            .from('employees')
            .update({
              status: 'Inactive',
            })
            .in('employee_code', codes);

        if (inactiveError) {
          throw new Error(
            `خطأ أثناء تحويل الموظفين إلى Inactive: ${inactiveError.message}`
          );
        }
      }

      await refresh();

      setMessage(
        `تمت المزامنة بنجاح. إضافة: ${preview.newEmployees.length} | تعديل: ${preview.updatedEmployees.length} | Inactive: ${employeesToInactive.length}`
      );

      setPreview(null);
      setFile(null);

      const input = document.getElementById(
        'employee-excel-file'
      ) as HTMLInputElement | null;

      if (input) {
        input.value = '';
      }

      setShowNew(false);
      setShowUpdated(false);
      setShowInactive(false);
    } catch (err: any) {
      console.error(err);

      setError(
        err?.message ||
          'حدث خطأ أثناء تنفيذ المزامنة'
      );
    } finally {
      setApplying(false);
    }
  }

  function handleCancelPreview() {
    setPreview(null);
    setMessage('');
    setError('');
    setShowNew(false);
    setShowUpdated(false);
    setShowInactive(false);
  }

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

    const worksheet = XLSX.utils.aoa_to_sheet([
      headers,
    ]);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      'Employees'
    );

    XLSX.writeFile(
      workbook,
      'Employees_Template.xlsx'
    );
  }

  return (
    <div
      dir="rtl"
      style={{
        padding: '24px',
        maxWidth: '1400px',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '24px',
          boxShadow:
            '0 4px 20px rgba(0,0,0,0.08)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '20px',
            flexWrap: 'wrap',
            marginBottom: '24px',
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '26px',
                fontWeight: 700,
              }}
            >
              مزامنة الموظفين
            </h1>

            <p
              style={{
                marginTop: '8px',
                color: '#666',
              }}
            >
              مراجعة الإضافات والتعديلات
              وتحويل الموظفين غير الموجودين
              إلى Inactive قبل التنفيذ.
            </p>
          </div>

          <button
            onClick={handleDownloadTemplate}
            disabled={loading || applying}
            style={{
              border: 'none',
              borderRadius: '10px',
              padding: '12px 18px',
              cursor: 'pointer',
              background: '#f1f5f9',
              fontWeight: 600,
            }}
          >
            تحميل نموذج Excel
          </button>
        </div>

        {!preview && (
          <>
            <div
              style={{
                border: '2px dashed #cbd5e1',
                borderRadius: '14px',
                padding: '30px',
                textAlign: 'center',
                background: '#f8fafc',
              }}
            >
              <input
                id="employee-excel-file"
                type="file"
                accept=".xlsx,.xls"
                disabled={loading || applying}
                onChange={(e) => {
                  const selectedFile =
                    e.target.files?.[0] || null;

                  setFile(selectedFile);
                  setError('');
                  setMessage('');
                }}
              />

              {file && (
                <div
                  style={{
                    marginTop: '12px',
                    fontWeight: 600,
                  }}
                >
                  الملف المختار: {file.name}
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: '20px',
                padding: '14px',
                borderRadius: '10px',
                background: '#fff7ed',
                color: '#9a3412',
                fontSize: '14px',
              }}
            >
              ⚠️ يجب أن يحتوي ملف Excel
              على جميع الموظفين الحاليين.
              <br />
              أي موظف موجود في قاعدة
              البيانات وغير موجود في الملف
              سيتم تحويله إلى
              <strong> Inactive </strong>
              ولن يتم حذفه.
            </div>

            <button
              onClick={handlePreview}
              disabled={!file || loading}
              style={{
                width: '100%',
                marginTop: '20px',
                border: 'none',
                borderRadius: '10px',
                padding: '14px',
                cursor:
                  !file || loading
                    ? 'not-allowed'
                    : 'pointer',
                background:
                  !file || loading
                    ? '#cbd5e1'
                    : '#2563eb',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 700,
              }}
            >
              {loading
                ? 'جاري الفحص...'
                : '🔍 فحص التغييرات'}
            </button>
          </>
        )}

        {preview && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '14px',
                marginBottom: '24px',
              }}
            >
              <SummaryCard
                title="إجمالي Excel"
                value={preview.totalInFile}
                icon="📄"
              />

              <SummaryCard
                title="إجمالي قاعدة البيانات"
                value={preview.totalInDatabase}
                icon="🗄️"
              />

              <SummaryCard
                title="موظفون جدد"
                value={preview.newEmployees.length}
                icon="➕"
              />

              <SummaryCard
                title="موظفون سيتم تعديلهم"
                value={preview.updatedEmployees.length}
                icon="✏️"
              />

              <SummaryCard
                title="سيتم تحويلهم Inactive"
                value={preview.inactiveEmployees.length}
                icon="🟠"
              />

              <SummaryCard
                title="بدون تغيير"
                value={preview.unchangedCount}
                icon="✅"
              />
            </div>

            {preview.newEmployees.length > 0 && (
              <section
                style={{
                  marginBottom: '20px',
                  border: '1px solid #bbf7d0',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                <SectionHeader
                  title={`الموظفون الجدد (${preview.newEmployees.length})`}
                  open={showNew}
                  onClick={() =>
                    setShowNew(!showNew)
                  }
                />

                {showNew && (
                  <div
                    style={{
                      padding: '16px',
                      maxHeight: '400px',
                      overflow: 'auto',
                    }}
                  >
                    {preview.newEmployees.map(
                      (employee, index) => (
                        <div
                          key={`${employee.employee_code}-${index}`}
                          style={{
                            padding: '12px',
                            borderBottom:
                              '1px solid #eee',
                          }}
                        >
                          <strong>
                            {employee.employee_code}
                          </strong>

                          {' — '}

                          {employee.employee_name}

                          <div
                            style={{
                              color: '#666',
                              fontSize: '13px',
                              marginTop: '4px',
                            }}
                          >
                            {employee.department}
                            {' — '}
                            {employee.job_title}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </section>
            )}

            {preview.updatedEmployees.length > 0 && (
              <section
                style={{
                  marginBottom: '20px',
                  border: '1px solid #fde68a',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                <SectionHeader
                  title={`الموظفون الذين سيتم تعديلهم (${preview.updatedEmployees.length})`}
                  open={showUpdated}
                  onClick={() =>
                    setShowUpdated(!showUpdated)
                  }
                />

                {showUpdated && (
                  <div
                    style={{
                      padding: '16px',
                      maxHeight: '600px',
                      overflow: 'auto',
                    }}
                  >
                    {preview.updatedEmployees.map(
                      (employee, index) => (
                        <div
                          key={`${employee.employee_code}-${index}`}
                          style={{
                            marginBottom: '18px',
                            padding: '16px',
                            border:
                              '1px solid #e5e7eb',
                            borderRadius: '10px',
                            background: '#fff',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '17px',
                              fontWeight: 700,
                              marginBottom: '12px',
                            }}
                          >
                            {employee.employee_code}
                            {' — '}
                            {employee.employee_name}
                          </div>

                          {employee.changes.map(
                            (change, changeIndex) => (
                              <div
                                key={`${change.field}-${changeIndex}`}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns:
                                    '180px 1fr 1fr',
                                  gap: '10px',
                                  padding: '8px 0',
                                  borderBottom:
                                    '1px solid #f1f5f9',
                                  fontSize: '14px',
                                }}
                              >
                                <strong>
                                  {change.label}
                                </strong>

                                <div
                                  style={{
                                    background:
                                      '#fef2f2',
                                    padding: '8px',
                                    borderRadius: '6px',
                                  }}
                                >
                                  القديم:
                                  <br />
                                  {displayValue(
                                    change.oldValue
                                  )}
                                </div>

                                <div
                                  style={{
                                    background:
                                      '#f0fdf4',
                                    padding: '8px',
                                    borderRadius: '6px',
                                  }}
                                >
                                  الجديد:
                                  <br />
                                  {displayValue(
                                    change.newValue
                                  )}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}
              </section>
            )}

            {preview.inactiveEmployees.length > 0 && (
              <section
                style={{
                  marginBottom: '20px',
                  border: '1px solid #fed7aa',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                <SectionHeader
                  title={`الموظفون الذين سيتم تحويلهم إلى Inactive (${preview.inactiveEmployees.length})`}
                  open={showInactive}
                  onClick={() =>
                    setShowInactive(!showInactive)
                  }
                />

                {showInactive && (
                  <div
                    style={{
                      padding: '16px',
                      maxHeight: '400px',
                      overflow: 'auto',
                    }}
                  >
                    {preview.inactiveEmployees.map(
                      (employee, index) => (
                        <div
                          key={`${employee.employee_code}-${index}`}
                          style={{
                            padding: '12px',
                            borderBottom:
                              '1px solid #eee',
                          }}
                        >
                          <strong>
                            {employee.employee_code}
                          </strong>

                          {' — '}

                          {employee.employee_name}

                          <div
                            style={{
                              color: '#666',
                              fontSize: '13px',
                              marginTop: '4px',
                            }}
                          >
                            {employee.department}
                            {' — '}
                            {employee.job_title}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </section>
            )}

            <div
              style={{
                padding: '16px',
                borderRadius: '10px',
                background: '#eff6ff',
                color: '#1e40af',
                marginBottom: '20px',
              }}
            >
              🔍 تمت المعاينة فقط.
              <br />
              لم يتم تعديل أي بيانات حتى الآن.
              <br />
              الموظفون غير الموجودين في Excel
              سيتم تحويلهم إلى
              <strong> Inactive </strong>
              ولن يتم حذفهم.
            </div>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <button
                onClick={handleApplySync}
                disabled={applying}
                style={{
                  flex: 1,
                  minWidth: '250px',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '14px',
                  cursor: applying
                    ? 'not-allowed'
                    : 'pointer',
                  background: applying
                    ? '#cbd5e1'
                    : '#16a34a',
                  color: '#fff',
                  fontSize: '16px',
                  fontWeight: 700,
                }}
              >
                {applying
                  ? 'جاري تنفيذ المزامنة...'
                  : '✅ اعتماد وتنفيذ المزامنة'}
              </button>

              <button
                onClick={handleCancelPreview}
                disabled={applying}
                style={{
                  flex: 1,
                  minWidth: '200px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '14px',
                  cursor: applying
                    ? 'not-allowed'
                    : 'pointer',
                  background: '#fff',
                  fontSize: '16px',
                  fontWeight: 700,
                }}
              >
                ↩️ إلغاء
              </button>
            </div>
          </>
        )}

        {message && (
          <div
            style={{
              marginTop: '20px',
              padding: '14px',
              borderRadius: '10px',
              background: '#f0fdf4',
              color: '#166534',
            }}
          >
            {message}
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: '20px',
              padding: '14px',
              borderRadius: '10px',
              background: '#fef2f2',
              color: '#b91c1c',
              whiteSpace: 'pre-wrap',
            }}
          >
            <strong>حدث خطأ:</strong>
            <br />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: string;
}) {
  return (
    <div
      style={{
        padding: '18px',
        borderRadius: '12px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: '24px',
          marginBottom: '8px',
        }}
      >
        {icon}
      </div>

      <div
        style={{
          fontSize: '28px',
          fontWeight: 800,
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: '5px',
          color: '#64748b',
          fontSize: '14px',
        }}
      >
        {title}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  open,
  onClick,
}: {
  title: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        border: 'none',
        background: '#fff',
        padding: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: 700,
        textAlign: 'right',
      }}
    >
      <span>{title}</span>
      <span>{open ? '▲' : '▼'}</span>
    </button>
  );
}
