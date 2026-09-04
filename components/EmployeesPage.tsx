'use client';

import {
  useState,
  useMemo,
  useEffect,
} from 'react';

import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';

export default function EmployeesPage() {
  const {
    employees,
    loading,
    refresh: fetchEmployees,
  } = useAppData();

  // ============================================================
  // دالة قراءة الحقول
  // ============================================================

  const getField = (
    obj: any,
    ...keys: string[]
  ) => {
    if (!obj) return '';

    for (const key of keys) {
      if (
        obj[key] !== undefined &&
        obj[key] !== null
      ) {
        return obj[key];
      }
    }

    return '';
  };

  const getEmployeeId = (
    emp: any
  ) => {
    return String(
      getField(
        emp,
        'employee_id',
        'EmployeeID',
        'employeeId'
      ) || ''
    ).trim();
  };

  const getEmployeeCode = (
    emp: any
  ) => {
    return String(
      getField(
        emp,
        'employee_code',
        'EmployeeCode',
        'employeeCode',
        'code',
        'Code'
      ) || ''
    ).trim();
  };

  const getEmployeeName = (
    emp: any
  ) => {
    return getField(
      emp,
      'employee_name',
      'EmployeeName',
      'ArabicName',
      'employeeName',
      'name',
      'Name'
    );
  };

  const getNationalId = (
    emp: any
  ) => {
    return String(
      getField(
        emp,
        'national_id',
        'NationalID',
        'nationalId',
        'NationalId'
      ) || ''
    ).trim();
  };

  const normalizeSearchValue = (
    value: any
  ) => {
    return String(
      value ?? ''
    )
      .trim()
      .toLowerCase();
  };

  // ============================================================
  // حالات الفلاتر
  // ============================================================

  const [
    activeCardFilter,
    setActiveCardFilter,
  ] = useState<
    | 'ALL_ACTIVE'
    | 'PERM'
    | 'FIXED'
    | 'ABOVE_AGE'
    | null
  >('ALL_ACTIVE');

  const [
    searchTerm,
    setSearchTerm,
  ] = useState('');

  const [
    selectedDept,
    setSelectedDept,
  ] = useState('');

  const [
    selectedCompany,
    setSelectedCompany,
  ] = useState('');

  const [
    selectedType,
    setSelectedType,
  ] = useState('');

  const [
    selectedAgeRange,
    setSelectedAgeRange,
  ] = useState('');

  // ============================================================
  // الترتيب والتحديد
  // ============================================================

  const [
    sortColumn,
    setSortColumn,
  ] = useState(
    'employee_code'
  );

  const [
    sortDirection,
    setSortDirection,
  ] = useState<
    'asc' | 'desc'
  >('asc');

  const [
    selectedEmpIds,
    setSelectedEmpIds,
  ] = useState<string[]>([]);

  // ============================================================
  // النوافذ
  // ============================================================

  const [
    showAddModal,
    setShowAddModal,
  ] = useState(false);

  const [
    showTermModal,
    setShowTermModal,
  ] = useState(false);

  const [
    showBulkTransferModal,
    setShowBulkTransferModal,
  ] = useState(false);

  const [
    editData,
    setEditData,
  ] = useState<any>(null);

  const [
    profileEmp,
    setProfileEmp,
  ] = useState<any>(null);

  // ============================================================
  // النقل والحذف
  // ============================================================

  const [
    bulkDept,
    setBulkDept,
  ] = useState('');

  const [
    bulkCompany,
    setBulkCompany,
  ] = useState('');

  const [
    bulkSaving,
    setBulkSaving,
  ] = useState(false);

  const [
    isDeleting,
    setIsDeleting,
  ] = useState(false);

  // ============================================================
  // إنهاء الخدمة
  // ============================================================

  const [
    termSearch,
    setTermSearch,
  ] = useState('');

  const [
    selectedTermEmp,
    setSelectedTermEmp,
  ] = useState<any>(null);

  const [
    termReason,
    setTermReason,
  ] = useState('استقالة');

  const [
    termDate,
    setTermDate,
  ] = useState(
    new Date()
      .toISOString()
      .split('T')[0]
  );

  const [
    termSaving,
    setTermSaving,
  ] = useState(false);

  // ============================================================
  // موظف جديد
  // ============================================================

  const [newEmp, setNewEmp] =
    useState({
      employee_code: '',
      employee_name: '',
      national_id: '',
      birth_date: '',
      department: '',
      company: '',
      job_title: '',
      hiring_date: '',
      contract_type:
        'محدد المدة',
      contract_end_date: '',
      status: 'Active',
      email: '',
      mobile: '',
    });

  // ============================================================
  // العمر
  // ============================================================

  const getEmployeeAge = (
    emp: any
  ) => {
    const rawAge = getField(
      emp,
      'age',
      'Age'
    );

    if (
      rawAge !== '' &&
      rawAge !== null &&
      !isNaN(Number(rawAge))
    ) {
      return Number(rawAge);
    }

    return null;
  };

  // ============================================================
  // الموظفون Active
  // ============================================================

  const activeEmployeesOnly =
    useMemo(() => {
      return employees.filter(
        (e: any) =>
          String(
            getField(
              e,
              'status',
              'Status'
            ) ||
              'Active'
          )
            .trim()
            .toLowerCase() ===
          'active'
      );
    }, [employees]);

  // ============================================================
  // القوائم
  // ============================================================

  const deptsList = useMemo(
    () =>
      Array.from(
        new Set(
          activeEmployeesOnly
            .map((e: any) =>
              getField(
                e,
                'department',
                'Department'
              )
            )
            .filter(Boolean)
        )
      ),
    [activeEmployeesOnly]
  );

  const compsList = useMemo(
    () =>
      Array.from(
        new Set(
          activeEmployeesOnly
            .map((e: any) =>
              getField(
                e,
                'company',
                'Company'
              )
            )
            .filter(Boolean)
        )
      ),
    [activeEmployeesOnly]
  );

  const typesList = useMemo(
    () =>
      Array.from(
        new Set(
          activeEmployeesOnly
            .map((e: any) =>
              getField(
                e,
                'contract_type',
                'ContractType'
              )
            )
            .filter(Boolean)
        )
      ),
    [activeEmployeesOnly]
  );

  // ============================================================
  // البحث والفلاتر
  // الرقم القومي أصبح ضمن البحث
  // ============================================================

  const baseFilteredEmployees =
    useMemo(() => {
      return activeEmployeesOnly.filter(
        (emp: any) => {
          const term =
            normalizeSearchValue(
              searchTerm
            );

          const empCode =
            normalizeSearchValue(
              getEmployeeCode(
                emp
              )
            );

          const empName =
            normalizeSearchValue(
              getEmployeeName(
                emp
              )
            );

          const nationalId =
            normalizeSearchValue(
              getNationalId(
                emp
              )
            );

          const empDept =
            normalizeSearchValue(
              getField(
                emp,
                'department',
                'Department'
              )
            );

          const empComp =
            normalizeSearchValue(
              getField(
                emp,
                'company',
                'Company'
              )
            );

          const cType =
            getField(
              emp,
              'contract_type',
              'ContractType'
            );

          const age =
            getEmployeeAge(
              emp
            );

          const matchesSearch =
            !term ||
            empCode.includes(
              term
            ) ||
            empName.includes(
              term
            ) ||
            nationalId.includes(
              term
            ) ||
            empDept.includes(
              term
            );

          const matchesDept =
            !selectedDept ||
            empDept.includes(
              normalizeSearchValue(
                selectedDept
              )
            );

          const matchesComp =
            !selectedCompany ||
            empComp.includes(
              normalizeSearchValue(
                selectedCompany
              )
            );

          const matchesType =
            !selectedType ||
            cType ===
              selectedType;

          let matchesAge =
            true;

          if (
            selectedAgeRange ===
            '60_plus'
          ) {
            matchesAge =
              age !== null &&
              age >= 60;
          } else if (
            selectedAgeRange ===
            '50_59'
          ) {
            matchesAge =
              age !== null &&
              age >= 50 &&
              age < 60;
          } else if (
            selectedAgeRange ===
            '30_49'
          ) {
            matchesAge =
              age !== null &&
              age >= 30 &&
              age < 50;
          } else if (
            selectedAgeRange ===
            'under_30'
          ) {
            matchesAge =
              age !== null &&
              age < 30;
          }

          return (
            matchesSearch &&
            matchesDept &&
            matchesComp &&
            matchesType &&
            matchesAge
          );
        }
      );
    }, [
      activeEmployeesOnly,
      searchTerm,
      selectedDept,
      selectedCompany,
      selectedType,
      selectedAgeRange,
    ]);

  // ============================================================
  // KPI
  // ============================================================

  const kpiStats =
    useMemo(() => {
      const total =
        baseFilteredEmployees.length;

      const perm =
        baseFilteredEmployees.filter(
          (e: any) =>
            getField(
              e,
              'contract_type',
              'ContractType'
            ) === 'دائم'
        ).length;

      const fixed =
        baseFilteredEmployees.filter(
          (e: any) =>
            String(
              getField(
                e,
                'contract_type',
                'ContractType'
              )
            ).includes(
              'محدد'
            )
        ).length;

      const aboveAge =
        baseFilteredEmployees.filter(
          (e: any) => {
            const cType =
              getField(
                e,
                'contract_type',
                'ContractType'
              );

            const age =
              getEmployeeAge(
                e
              );

            return (
              String(
                cType
              ).includes(
                'فوق السن'
              ) ||
              (age !== null &&
                age >= 60)
            );
          }
        ).length;

      const calcPct =
        (value: number) =>
          total > 0
            ? (
                (value / total) *
                100
              ).toFixed(1)
            : '0';

      return {
        total,
        perm,
        permPct:
          calcPct(perm),
        fixed,
        fixedPct:
          calcPct(fixed),
        aboveAge,
        aboveAgePct:
          calcPct(aboveAge),
      };
    }, [baseFilteredEmployees]);

  // ============================================================
  // الجدول النهائي
  // ============================================================

  const finalTableEmployees =
    useMemo(() => {
      const filtered =
        baseFilteredEmployees.filter(
          (emp: any) => {
            const cType =
              getField(
                emp,
                'contract_type',
                'ContractType'
              );

            const age =
              getEmployeeAge(
                emp
              );

            if (
              activeCardFilter ===
              'PERM'
            ) {
              return (
                cType === 'دائم'
              );
            }

            if (
              activeCardFilter ===
              'FIXED'
            ) {
              return String(
                cType
              ).includes(
                'محدد'
              );
            }

            if (
              activeCardFilter ===
              'ABOVE_AGE'
            ) {
              return (
                String(
                  cType
                ).includes(
                  'فوق السن'
                ) ||
                (age !== null &&
                  age >= 60)
              );
            }

            return true;
          }
        );

      return [...filtered].sort(
        (
          a: any,
          b: any
        ) => {
          if (
            sortColumn ===
            'age'
          ) {
            const ageA =
              getEmployeeAge(
                a
              ) ?? 0;

            const ageB =
              getEmployeeAge(
                b
              ) ?? 0;

            const res =
              ageA - ageB;

            return sortDirection ===
              'asc'
              ? res
              : -res;
          }

          const valA =
            String(
              getField(
                a,
                sortColumn
              ) || ''
            );

          const valB =
            String(
              getField(
                b,
                sortColumn
              ) || ''
            );

          const res =
            valA.localeCompare(
              valB,
              undefined,
              {
                numeric:
                  true,
                sensitivity:
                  'base',
              }
            );

          return sortDirection ===
            'asc'
            ? res
            : -res;
        }
      );
    }, [
      baseFilteredEmployees,
      activeCardFilter,
      sortColumn,
      sortDirection,
    ]);

  // ============================================================
  // نتائج بحث إنهاء الخدمة
  // ============================================================

  const termSearchResults =
    useMemo(() => {
      if (
        !termSearch.trim()
      ) {
        return [];
      }

      const term =
        normalizeSearchValue(
          termSearch
        );

      return activeEmployeesOnly
        .filter(
          (e: any) => {
            const code =
              normalizeSearchValue(
                getEmployeeCode(
                  e
                )
              );

            const name =
              normalizeSearchValue(
                getEmployeeName(
                  e
                )
              );

            const dept =
              normalizeSearchValue(
                getField(
                  e,
                  'department',
                  'Department'
                )
              );

            const nationalId =
              normalizeSearchValue(
                getNationalId(
                  e
                )
              );

            return (
              code.includes(
                term
              ) ||
              name.includes(
                term
              ) ||
              dept.includes(
                term
              ) ||
              nationalId.includes(
                term
              )
            );
          }
        )
        .slice(0, 8);
    }, [
      activeEmployeesOnly,
      termSearch,
    ]);

  // ============================================================
  // ترتيب
  // ============================================================

  const handleSort = (
    columnKey: string
  ) => {
    if (
      sortColumn ===
      columnKey
    ) {
      setSortDirection(
        (prev) =>
          prev === 'asc'
            ? 'desc'
            : 'asc'
      );
    } else {
      setSortColumn(
        columnKey
      );
      setSortDirection(
        'asc'
      );
    }
  };

  const renderSortArrow = (
    colKey: string
  ) => {
    if (
      sortColumn !==
      colKey
    ) {
      return (
        <span
          style={{
            opacity: 0.3,
            marginRight:
              '4px',
          }}
        >
          ↕
        </span>
      );
    }

    return sortDirection ===
      'asc' ? (
      <span
        style={{
          color:
            'var(--brass-600, #0d9488)',
          marginRight:
            '4px',
        }}
      >
        ▲
      </span>
    ) : (
      <span
        style={{
          color:
            'var(--brass-600, #0d9488)',
          marginRight:
            '4px',
        }}
      >
        ▼
      </span>
    );
  };

  // ============================================================
  // فتح التعديل
  // ============================================================

  const handleOpenEdit =
    async (emp: any) => {
      setEditData({
        emp: {
          ...emp,
        },
        loading:
          false,
      });
    };

  // ============================================================
  // استقبال الموظف من Dashboard
  // هذا هو الإصلاح الرئيسي
  // ============================================================

  uuseEffect(() => {
  const openRequestedEmployee = () => {
    if (loading || !employees?.length) return;

    const savedId =
      localStorage.getItem(
        'selectedEmployeeId'
      ) || '';

    const savedCode =
      localStorage.getItem(
        'selectedEmployeeCode'
      ) ||
      localStorage.getItem(
        'employeeSearch'
      ) ||
      localStorage.getItem(
        'jumpSearch'
      ) ||
      '';

    const cleanId =
      String(savedId).trim();

    const cleanCode =
      String(savedCode).trim();

    if (!cleanId && !cleanCode) {
      return;
    }

    const targetEmployee =
      employees.find(
        (emp: any) => {
          const empId =
            getEmployeeId(emp);

          const empCode =
            getEmployeeCode(emp);

          return (
            (cleanId &&
              empId === cleanId) ||
            (cleanCode &&
              empCode.toLowerCase() ===
                cleanCode.toLowerCase())
          );
        }
      );

    if (!targetEmployee) {
      return;
    }

    // إلغاء الفلاتر
    setSearchTerm('');
    setSelectedDept('');
    setSelectedCompany('');
    setSelectedType('');
    setSelectedAgeRange('');
    setActiveCardFilter(null);

    // فتح التعديل
    setEditData({
      emp: {
        ...targetEmployee,
      },
      loading: false,
    });

    // تنظيف المفاتيح
    localStorage.removeItem(
      'selectedEmployeeId'
    );

    localStorage.removeItem(
      'selectedEmployeeCode'
    );

    localStorage.removeItem(
      'employeeSearch'
    );

    localStorage.removeItem(
      'jumpSearch'
    );
  };

  openRequestedEmployee();

  window.addEventListener(
    'storage',
    openRequestedEmployee
  );

  return () => {
    window.removeEventListener(
      'storage',
      openRequestedEmployee
    );
  };
[employees, loading]);
  ]);

  // ============================================================
  // حفظ التعديل
  // ============================================================

  const handleSaveEdit =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      if (!editData) {
        return;
      }

      setEditData({
        ...editData,
        saving: true,
      });

      try {
        const rawHiring =
          getField(
            editData.emp,
            'hiring_date',
            'HiringDate'
          );

        const rawEnd =
          getField(
            editData.emp,
            'contract_end_date',
            'ContractEndDate'
          );

        const empCode =
          getEmployeeCode(
            editData.emp
          );

        if (!empCode) {
          throw new Error(
            'كود الموظف غير موجود.'
          );
        }

        const employeeUpdateData =
          {
            employee_code:
              empCode,

            employee_name:
              getField(
                editData.emp,
                'employee_name',
                'EmployeeName',
                'ArabicName'
              ),

            national_id:
              getField(
                editData.emp,
                'national_id',
                'NationalID'
              ),

            birth_date:
              getField(
                editData.emp,
                'birth_date',
                'BirthDate'
              ) || null,

            age:
              editData.emp
                .age !==
                undefined &&
              editData.emp
                .age !== ''
                ? Number(
                    editData.emp.age
                  )
                : null,

            department:
              getField(
                editData.emp,
                'department',
                'Department'
              ),

            company:
              getField(
                editData.emp,
                'company',
                'Company'
              ),

            job_title:
              getField(
                editData.emp,
                'job_title',
                'JobTitle'
              ),

            hiring_date:
              rawHiring &&
              String(
                rawHiring
              ).trim() !== ''
                ? rawHiring
                : null,

            status:
              getField(
                editData.emp,
                'status',
                'Status'
              ) ||
              'Active',

            email:
              getField(
                editData.emp,
                'email',
                'Email'
              ),

            mobile:
              getField(
                editData.emp,
                'mobile',
                'Mobile',
                'MOBILE'
              ),
          };

        const {
          error: empError,
        } = await supabase
          .from(
            'employees'
          )
          .update(
            employeeUpdateData
          )
          .eq(
            'employee_code',
            empCode
          );

        if (empError) {
          throw empError;
        }

        const contractUpdateData =
          {
            contract_type:
              getField(
                editData.emp,
                'contract_type',
                'ContractType'
              ),

            contract_end_date:
              rawEnd &&
              String(
                rawEnd
              ).trim() !== ''
                ? rawEnd
                : null,

            status:
              getField(
                editData.emp,
                'status',
                'Status'
              ) ||
              'Active',
          };

        const {
          error: contractError,
        } = await supabase
          .from(
            'contracts'
          )
          .update(
            contractUpdateData
          )
          .eq(
            'employee_code',
            empCode
          );

        if (contractError) {
          throw contractError;
        }

        alert(
          'تم حفظ التعديلات بنجاح ✅'
        );

        setEditData(
          null
        );

        await fetchEmployees();
      } catch (
        err: any
      ) {
        alert(
          'حدث خطأ أثناء الحفظ: ' +
            err.message
        );

        setEditData(
          (prev: any) =>
            prev
              ? {
                  ...prev,
                  saving:
                    false,
                }
              : null
        );
      }
    };

  // ============================================================
  // إنهاء الخدمة
  // ============================================================

  const handleConfirmTermination =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      if (
        !selectedTermEmp
      ) {
        return alert(
          'يرجى اختيار موظف أولاً.'
        );
      }

      setTermSaving(
        true
      );

      try {
        const empCode =
          getEmployeeCode(
            selectedTermEmp
          );

        const {
          error: empError,
        } = await supabase
          .from(
            'employees'
          )
          .update({
            department:
              'تحويلات تحت الاعتماد',

            status:
              'Inactive',

            termination_reason:
              termReason,

            termination_date:
              termDate,
          })
          .eq(
            'employee_code',
            empCode
          );

        if (empError) {
          throw empError;
        }

        await supabase
          .from(
            'contracts'
          )
          .update({
            status:
              'Inactive',
          })
          .eq(
            'employee_code',
            empCode
          );

        alert(
          `✅ تم تحويل الموظف (${getEmployeeName(
            selectedTermEmp
          )}) إلى قسم (تحويلات تحت الاعتماد) بنجاح.`
        );

        setShowTermModal(
          false
        );

        setSelectedTermEmp(
          null
        );

        setTermSearch(
          ''
        );

        await fetchEmployees();
      } catch (
        err: any
      ) {
        alert(
          'خطأ أثناء العملية: ' +
            err.message
        );
      } finally {
        setTermSaving(
          false
        );
      }
    };

  // ============================================================
  // النقل المجمع
  // ============================================================

  const handleConfirmBulkTransfer =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      if (
        selectedEmpIds.length ===
        0
      ) {
        return;
      }

      if (
        !bulkDept &&
        !bulkCompany
      ) {
        return alert(
          'يرجى تحديد إدارة جديدة أو شركة جديدة.'
        );
      }

      setBulkSaving(
        true
      );

      try {
        const updatePayload: any =
          {};

        if (bulkDept) {
          updatePayload.department =
            bulkDept;
        }

        if (bulkCompany) {
          updatePayload.company =
            bulkCompany;
        }

        const {
          error,
        } = await supabase
          .from(
            'employees'
          )
          .update(
            updatePayload
          )
          .in(
            'employee_code',
            selectedEmpIds
          );

        if (error) {
          throw error;
        }

        alert(
          `✅ تم نقل ${selectedEmpIds.length} موظف بنجاح.`
        );

        setShowBulkTransferModal(
          false
        );

        setSelectedEmpIds(
          []
        );

        setBulkDept(
          ''
        );

        setBulkCompany(
          ''
        );

        await fetchEmployees();
      } catch (
        err: any
      ) {
        alert(
          'خطأ أثناء النقل المجمع: ' +
            err.message
        );
      } finally {
        setBulkSaving(
          false
        );
      }
    };

  // ============================================================
  // الحذف
  // ============================================================

  const handleDeleteSelected =
    async () => {
      if (
        !window.confirm(
          `هل أنت متأكد من حذف ${selectedEmpIds.length} موظف بشكل نهائي من قاعدة البيانات؟\nهذا الإجراء لا يمكن التراجع عنه.`
        )
      ) {
        return;
      }

      setIsDeleting(
        true
      );

      try {
        await supabase
          .from(
            'contracts'
          )
          .delete()
          .in(
            'employee_code',
            selectedEmpIds
          );

        const {
          error:
            empError,
        } =
          await supabase
            .from(
              'employees'
            )
            .delete()
            .in(
              'employee_code',
              selectedEmpIds
            );

        if (empError) {
          throw empError;
        }

        alert(
          'تم حذف الموظفين بنجاح 🗑️✅'
        );

        setSelectedEmpIds(
          []
        );

        await fetchEmployees();
      } catch (
        err: any
      ) {
        alert(
          'حدث خطأ أثناء الحذف: ' +
            err.message
        );
      } finally {
        setIsDeleting(
          false
        );
      }
    };

  // ============================================================
  // إضافة موظف
  // ============================================================

  const handleAddEmployee =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      try {
        let calculatedAge =
          null;

        if (
          newEmp.birth_date
        ) {
          const birth =
            new Date(
              newEmp.birth_date
            );

          const today =
            new Date();

          calculatedAge =
            today.getFullYear() -
            birth.getFullYear();

          const beforeBirthday =
            today.getMonth() <
              birth.getMonth() ||
            (today.getMonth() ===
              birth.getMonth() &&
              today.getDate() <
                birth.getDate());

          if (
            beforeBirthday
          ) {
            calculatedAge--;
          }
        }

        const {
          error:
            empError,
        } =
          await supabase
            .from(
              'employees'
            )
            .insert([
              {
                employee_code:
                  newEmp.employee_code,

                employee_name:
                  newEmp.employee_name,

                national_id:
                  newEmp.national_id,

                birth_date:
                  newEmp.birth_date
                    ? newEmp.birth_date
                    : null,

                age:
                  calculatedAge,

                department:
                  newEmp.department,

                company:
                  newEmp.company,

                job_title:
                  newEmp.job_title,

                hiring_date:
                  newEmp.hiring_date
                    ? newEmp.hiring_date
                    : null,

                status:
                  newEmp.status,

                email:
                  newEmp.email,

                mobile:
                  newEmp.mobile,
              },
            ]);

        if (empError) {
          throw empError;
        }

        const {
          error:
            contractError,
        } =
          await supabase
            .from(
              'contracts'
            )
            .insert([
              {
                employee_code:
                  newEmp.employee_code,

                contract_type:
                  newEmp.contract_type,

                contract_end_date:
                  newEmp.contract_type ===
                    'دائم' ||
                  !newEmp.contract_end_date
                    ? null
                    : newEmp.contract_end_date,

                contract_start_date:
                  newEmp.hiring_date
                    ? newEmp.hiring_date
                    : null,

                status:
                  newEmp.status,
              },
            ]);

        if (contractError) {
          throw contractError;
        }

        alert(
          'تم إضافة الموظف وعقده بنجاح ✅'
        );

        setShowAddModal(
          false
        );

        setNewEmp({
          employee_code:
            '',
          employee_name:
            '',
          national_id:
            '',
          birth_date:
            '',
          department:
            '',
          company:
            '',
          job_title:
            '',
          hiring_date:
            '',
          contract_type:
            'محدد المدة',
          contract_end_date:
            '',
          status:
            'Active',
          email:
            '',
          mobile:
            '',
        });

        await fetchEmployees();
      } catch (
        err: any
      ) {
        alert(
          'خطأ أثناء الإضافة: ' +
            err.message
        );
      }
    };

  // ============================================================
  // تصدير Excel
  // ============================================================

  const handleExportToExcel =
    (
      onlySelected = false
    ) => {
      const listToExport =
        onlySelected
          ? finalTableEmployees.filter(
              (e: any) =>
                selectedEmpIds.includes(
                  getEmployeeCode(
                    e
                  )
                )
            )
          : finalTableEmployees;

      const exportData =
        listToExport.map(
          (e: any) => ({
            employee_id:
              getEmployeeId(e),

            employee_code:
              getEmployeeCode(
                e
              ),

            employee_name:
              getEmployeeName(
                e
              ),

            job_title:
              getField(
                e,
                'job_title',
                'JobTitle'
              ),

            department:
              getField(
                e,
                'department',
                'Department'
              ),

            age:
              getEmployeeAge(
                e
              ) !== null
                ? `${getEmployeeAge(
                    e
                  )} سنة`
                : '—',

            national_id:
              getNationalId(
                e
              ),

            mobile:
              getField(
                e,
                'mobile',
                'Mobile'
              ),

            hiring_date:
              getField(
                e,
                'hiring_date',
                'HiringDate'
              ),

            contract_end_date:
              getField(
                e,
                'contract_end_date',
                'ContractEndDate'
              ),

            contract_type:
              getField(
                e,
                'contract_type',
                'ContractType'
              ),

            company:
              getField(
                e,
                'company',
                'Company'
              ),
          })
        );

      const ws =
        XLSX.utils.json_to_sheet(
          exportData
        );

      const wb =
        XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        wb,
        ws,
        'الموظفين_Active'
      );

      XLSX.writeFile(
        wb,
        `بيانات_الموظفين_${new Date()
          .toISOString()
          .split('T')[0]}.xlsx`
      );
    };

  // ============================================================
  // Badge نهاية العقد
  // ============================================================

  const getContractStatusBadge =
    (
      contractType: string,
      endDateStr: string
    ) => {
      if (
        endDateStr &&
        String(
          endDateStr
        ).trim() !== ''
      ) {
        const end =
          new Date(
            endDateStr
          );

        const today =
          new Date();

        today.setHours(
          0,
          0,
          0,
          0
        );

        end.setHours(
          0,
          0,
          0,
          0
        );

        const days =
          Math.ceil(
            (end.getTime() -
              today.getTime()) /
              (1000 *
                3600 *
                24)
          );

        if (
          days < 0
        ) {
          return (
            <span
              style={{
                background:
                  'var(--stamp-red-bg)',
                color:
                  'var(--stamp-red)',
                padding:
                  '3px 8px',
                borderRadius:
                  '6px',
                fontWeight:
                  'bold',
                fontSize:
                  '10px',
              }}
            >
              {endDateStr} 🚨
            </span>
          );
        }

        if (
          days <= 60
        ) {
          return (
            <span
              style={{
                background:
                  'var(--stamp-amber-bg)',
                color:
                  'var(--stamp-amber)',
                padding:
                  '3px 8px',
                borderRadius:
                  '6px',
                fontWeight:
                  'bold',
                fontSize:
                  '10px',
              }}
            >
              {endDateStr} ⏳
            </span>
          );
        }

        return (
          <span
            style={{
              background:
                'var(--stamp-blue-bg)',
              color:
                'var(--stamp-blue)',
              padding:
                '3px 8px',
              borderRadius:
                '6px',
              fontWeight:
                'bold',
              fontSize:
                '10px',
            }}
          >
            {endDateStr}
          </span>
        );
      }

      if (
        contractType ===
        'دائم'
      ) {
        return (
          <span
            style={{
              background:
                'var(--stamp-green-bg)',
              color:
                'var(--stamp-green)',
              padding:
                '3px 8px',
              borderRadius:
                '6px',
              fontWeight:
                'bold',
              fontSize:
                '10px',
            }}
          >
            عقد دائم 🛡️
          </span>
        );
      }

      return (
        <span
          style={{
            color:
              'var(--muted)',
          }}
        >
          —
        </span>
      );
    };

  // ============================================================
  // Badge العمر
  // ============================================================

  const renderAgeBadge =
    (
      emp: any
    ) => {
      const age =
        getEmployeeAge(
          emp
        );

      if (
        age === null
      ) {
        return (
          <span
            style={{
              color:
                'var(--muted)',
            }}
          >
            —
          </span>
        );
      }

      if (
        age >= 60
      ) {
        return (
          <span
            style={{
              background:
                'var(--stamp-amber-bg)',
              color:
                'var(--stamp-amber)',
              padding:
                '3px 8px',
              borderRadius:
                '6px',
              fontWeight:
                'bold',
              fontSize:
                '10px',
            }}
          >
            💼 {age} سنة (60+)
          </span>
        );
      }

      return (
        <span
          style={{
            background:
              'var(--paper)',
            color:
              'var(--ink)',
            padding:
              '3px 8px',
            borderRadius:
              '6px',
            fontWeight:
              'bold',
            fontSize:
              '10px',
          }}
        >
          {age} سنة
        </span>
      );
    };

  return (
    <div
      style={{
        animation:
          'fadeIn 0.4s ease-in-out',
      }}
    >
      {/* ==================================================
          الرأس
      ================================================== */}

      <div
        style={{
          display:
            'flex',
          justifyContent:
            'space-between',
          alignItems:
            'center',
          marginBottom:
            '16px',
          flexWrap:
            'wrap',
          gap:
            '10px',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize:
                '18px',
              color:
                'var(--navy-950, #0f172a)',
              fontWeight:
                '800',
            }}
          >
            بيانات الموظفين Active
          </h3>

          <p
            style={{
              margin:
                '2px 0 0',
              fontSize:
                '11px',
              color:
                'var(--muted, #64748b)',
              fontWeight:
                'bold',
            }}
          >
            إدارة وتتبع السجل الرئيسي
            المباشر للموظفين وقوة العمل
          </p>
        </div>

        <div
          style={{
            display:
              'flex',
            gap:
              '8px',
            flexWrap:
              'wrap',
            alignItems:
              'center',
          }}
        >
          <button
            onClick={() =>
              handleExportToExcel(
                false
              )
            }
            style={{
              background:
                'var(--stamp-green)',
              color:
                '#fff',
              border: 0,
              padding:
                '7px 14px',
              borderRadius:
                '6px',
              fontWeight:
                'bold',
              fontSize:
                '11px',
              cursor:
                'pointer',
            }}
          >
            📥 تصدير Excel
          </button>

          <button
            onClick={() => {
              setShowTermModal(
                true
              );
              setSelectedTermEmp(
                null
              );
              setTermSearch(
                ''
              );
            }}
            style={{
              background:
                'var(--stamp-red)',
              color:
                '#fff',
              border: 0,
              padding:
                '7px 14px',
              borderRadius:
                '6px',
              fontWeight:
                'bold',
              fontSize:
                '11px',
              cursor:
                'pointer',
            }}
          >
            🚫 Terminated
          </button>

          <button
            onClick={() =>
              setShowAddModal(
                true
              )
            }
            style={{
              background:
                'var(--brass-600, #0d9488)',
              color:
                '#fff',
              border: 0,
              padding:
                '7px 14px',
              borderRadius:
                '6px',
              fontWeight:
                'bold',
              fontSize:
                '11px',
              cursor:
                'pointer',
            }}
          >
            + إضافة موظف
          </button>
        </div>
      </div>

      {/* ==================================================
          KPI
      ================================================== */}

      <div
        style={{
          display:
            'grid',
          gridTemplateColumns:
            'repeat(4, 1fr)',
          gap:
            '14px',
          marginBottom:
            '20px',
        }}
      >
        <div
          onClick={() =>
            setActiveCardFilter(
              activeCardFilter ===
                'ALL_ACTIVE'
                ? null
                : 'ALL_ACTIVE'
            )
          }
          style={{
            background:
              activeCardFilter ===
              'ALL_ACTIVE'
                ? '#f0fdf4'
                : 'var(--paper-card)',
            border:
              activeCardFilter ===
              'ALL_ACTIVE'
                ? '2px solid #22c55e'
                : '1px solid var(--line, #e2e8f0)',
            padding:
              '12px 16px',
            borderRadius:
              '12px',
            cursor:
              'pointer',
          }}
        >
          <div
            style={{
              fontSize:
                '11px',
              color:
                'var(--muted, #64748b)',
              fontWeight:
                'bold',
            }}
          >
            إجمالي الموظفين
            (Active)
          </div>

          <div
            style={{
              fontSize:
                '20px',
              fontWeight:
                '900',
              color:
                'var(--stamp-green)',
              marginTop:
                '4px',
            }}
          >
            {kpiStats.total.toLocaleString(
              'en-US'
            )}
          </div>

          <div
            style={{
              fontSize:
                '10px',
              color:
                'var(--stamp-green)',
              fontWeight:
                'bold',
            }}
          >
            100% من القوة المفلترة
          </div>
        </div>

        <div
          onClick={() =>
            setActiveCardFilter(
              activeCardFilter ===
                'PERM'
                ? null
                : 'PERM'
            )
          }
          style={{
            background:
              activeCardFilter ===
              'PERM'
                ? '#f0fdf4'
                : 'var(--paper-card)',
            border:
              activeCardFilter ===
              'PERM'
                ? '2px solid #16a34a'
                : '1px solid var(--line, #e2e8f0)',
            padding:
              '12px 16px',
            borderRadius:
              '12px',
            cursor:
              'pointer',
          }}
        >
          <div
            style={{
              fontSize:
                '11px',
              fontWeight:
                'bold',
            }}
          >
            عقود دائمة
          </div>

          <div
            style={{
              fontSize:
                '20px',
              fontWeight:
                '900',
              color:
                'var(--stamp-green)',
            }}
          >
            {kpiStats.perm.toLocaleString(
              'en-US'
            )}
          </div>

          <div
            style={{
              fontSize:
                '10px',
              color:
                'var(--stamp-green)',
              fontWeight:
                'bold',
            }}
          >
            {kpiStats.permPct}% من القوة الحالية
          </div>
        </div>

        <div
          onClick={() =>
            setActiveCardFilter(
              activeCardFilter ===
                'FIXED'
                ? null
                : 'FIXED'
            )
          }
          style={{
            background:
              activeCardFilter ===
              'FIXED'
                ? '#eff6ff'
                : 'var(--paper-card)',
            border:
              activeCardFilter ===
              'FIXED'
                ? '2px solid #2563eb'
                : '1px solid var(--line, #e2e8f0)',
            padding:
              '12px 16px',
            borderRadius:
              '12px',
            cursor:
              'pointer',
          }}
        >
          <div
            style={{
              fontSize:
                '11px',
              fontWeight:
                'bold',
            }}
          >
            عقود محددة المدة
          </div>

          <div
            style={{
              fontSize:
                '20px',
              fontWeight:
                '900',
              color:
                'var(--stamp-blue)',
            }}
          >
            {kpiStats.fixed.toLocaleString(
              'en-US'
            )}
          </div>

          <div
            style={{
              fontSize:
                '10px',
              color:
                'var(--stamp-blue)',
              fontWeight:
                'bold',
            }}
          >
            {kpiStats.fixedPct}% من القوة الحالية
          </div>
        </div>

        <div
          onClick={() =>
            setActiveCardFilter(
              activeCardFilter ===
                'ABOVE_AGE'
                ? null
                : 'ABOVE_AGE'
            )
          }
          style={{
            background:
              activeCardFilter ===
              'ABOVE_AGE'
                ? '#fef3c7'
                : 'var(--paper-card)',
            border:
              activeCardFilter ===
              'ABOVE_AGE'
                ? '2px solid #d97706'
                : '1px solid var(--line, #e2e8f0)',
            padding:
              '12px 16px',
            borderRadius:
              '12px',
            cursor:
              'pointer',
          }}
        >
          <div
            style={{
              fontSize:
                '11px',
              fontWeight:
                'bold',
            }}
          >
            موظفين فوق السن (60+)
          </div>

          <div
            style={{
              fontSize:
                '20px',
              fontWeight:
                '900',
              color:
                'var(--stamp-amber)',
            }}
          >
            {kpiStats.aboveAge.toLocaleString(
              'en-US'
            )}
          </div>

          <div
            style={{
              fontSize:
                '10px',
              color:
                'var(--stamp-amber)',
              fontWeight:
                'bold',
            }}
          >
            {kpiStats.aboveAgePct}% من القوة الحالية
          </div>
        </div>
      </div>

      {/* ==================================================
          الفلاتر
      ================================================== */}

      <div
        className="db-card"
        style={{
          background:
            'var(--paper-card)',
          border:
            '1px solid var(--line, #e2e8f0)',
          padding:
            '12px 16px',
          borderRadius:
            '12px',
          marginBottom:
            '20px',
          display:
            'flex',
          gap:
            '10px',
          alignItems:
            'center',
          flexWrap:
            'wrap',
        }}
      >
        <input
          type="text"
          placeholder="بحث بالاسم، الكود، الرقم القومي، الإدارة..."
          value={
            searchTerm
          }
          onChange={(e) =>
            setSearchTerm(
              e.target.value
            )
          }
          className="db-input"
          style={{
            padding:
              '8px 12px',
            borderRadius:
              '8px',
            border:
              '1px solid var(--line, #e2e8f0)',
            fontSize:
              '11px',
            outline:
              'none',
            minWidth:
              '240px',
            background:
              'transparent',
            color:
              'var(--ink, #0f172a)',
          }}
        />

        <input
          list="deptList"
          placeholder="الإدارة..."
          value={
            selectedDept
          }
          onChange={(e) =>
            setSelectedDept(
              e.target.value
            )
          }
          style={{
            padding:
              '8px 12px',
            borderRadius:
              '8px',
            border:
              '1px solid var(--line)',
            fontSize:
              '11px',
            outline:
              'none',
            width:
              '130px',
          }}
        />

        <datalist id="deptList">
          {deptsList.map(
            (
              d: any,
              i: number
            ) => (
              <option
                key={i}
                value={d}
              />
            )
          )}
        </datalist>

        <input
          list="compList"
          placeholder="الشركة..."
          value={
            selectedCompany
          }
          onChange={(e) =>
            setSelectedCompany(
              e.target.value
            )
          }
          style={{
            padding:
              '8px 12px',
            borderRadius:
              '8px',
            border:
              '1px solid var(--line)',
            fontSize:
              '11px',
            outline:
              'none',
            width:
              '130px',
          }}
        />

        <datalist id="compList">
          {compsList.map(
            (
              c: any,
              i: number
            ) => (
              <option
                key={i}
                value={c}
              />
            )
          )}
        </datalist>

        <select
          value={
            selectedType
          }
          onChange={(e) =>
            setSelectedType(
              e.target.value
            )
          }
          style={{
            padding:
              '8px 12px',
            borderRadius:
              '8px',
            border:
              '1px solid var(--line)',
            fontSize:
              '11px',
            outline:
              'none',
          }}
        >
          <option value="">
            كل أنواع العقود
          </option>

          {typesList.map(
            (
              t: any,
              i: number
            ) => (
              <option
                key={i}
                value={t}
              >
                {t}
              </option>
            )
          )}
        </select>

        <select
          value={
            selectedAgeRange
          }
          onChange={(e) =>
            setSelectedAgeRange(
              e.target.value
            )
          }
          style={{
            padding:
              '8px 12px',
            borderRadius:
              '8px',
            border:
              '1px solid var(--line)',
            fontSize:
              '11px',
            outline:
              'none',
          }}
        >
          <option value="">
            فئة السن (الكل)
          </option>

          <option value="60_plus">
            💼 فوق السن (60 سنة فأكثر)
          </option>

          <option value="50_59">
            🎂 من 50 إلى 59 سنة
          </option>

          <option value="30_49">
            👔 من 30 إلى 49 سنة
          </option>

          <option value="under_30">
            🌱 أقل من 30 سنة
          </option>
        </select>

        <button
          onClick={() => {
            setSearchTerm('');
            setSelectedDept('');
            setSelectedCompany('');
            setSelectedType('');
            setSelectedAgeRange('');
            setActiveCardFilter(
              'ALL_ACTIVE'
            );
          }}
          style={{
            background:
              'var(--line)',
            border: 0,
            padding:
              '8px 14px',
            borderRadius:
              '8px',
            fontWeight:
              'bold',
            cursor:
              'pointer',
          }}
        >
          إعادة ضبط
        </button>

        <div
          style={{
            flex: 1,
            textAlign:
              'left',
            fontSize:
              '11px',
            color:
              'var(--muted)',
            fontWeight:
              'bold',
          }}
        >
          النتائج:
          <span
            style={{
              color:
                'var(--ink)',
              marginRight:
                '4px',
            }}
          >
            {finalTableEmployees.length.toLocaleString(
              'en-US'
            )}
          </span>
          موظف
        </div>
      </div>

      {/* ==================================================
          الجدول
      ================================================== */}

      <div
        className="db-card"
        style={{
          background:
            'var(--paper-card)',
          border:
            '1px solid var(--line)',
          borderRadius:
            '12px',
          overflow:
            'hidden',
        }}
      >
        {loading ? (
          <div
            style={{
              padding:
                '60px',
              textAlign:
                'center',
              fontSize:
                '13px',
              fontWeight:
                'bold',
              color:
                'var(--muted)',
            }}
          >
            جاري سحب بيانات الموظفين...
            ⏳
          </div>
        ) : (
          <div
            style={{
              maxHeight:
                '55vh',
              overflowY:
                'auto',
            }}
          >
            <table
              className="data-table"
              style={{
                width:
                  '100%',
                borderCollapse:
                  'collapse',
                textAlign:
                  'right',
                fontSize:
                  '11.5px',
                whiteSpace:
                  'nowrap',
              }}
            >
              <thead
                style={{
                  position:
                    'sticky',
                  top: 0,
                  background:
                    'var(--paper-card)',
                  zIndex:
                    10,
                }}
              >
                <tr>
                  <th
                    style={{
                      padding:
                        '12px',
                    }}
                  >
                    ✓
                  </th>

                  <th
                    onClick={() =>
                      handleSort(
                        'employee_code'
                      )
                    }
                    style={{
                      padding:
                        '12px',
                      cursor:
                        'pointer',
                    }}
                  >
                    الكود{' '}
                    {renderSortArrow(
                      'employee_code'
                    )}
                  </th>

                  <th
                    onClick={() =>
                      handleSort(
                        'employee_name'
                      )
                    }
                    style={{
                      padding:
                        '12px',
                      cursor:
                        'pointer',
                    }}
                  >
                    الاسم{' '}
                    {renderSortArrow(
                      'employee_name'
                    )}
                  </th>

                  <th
                    onClick={() =>
                      handleSort(
                        'job_title'
                      )
                    }
                    style={{
                      padding:
                        '12px',
                      cursor:
                        'pointer',
                    }}
                  >
                    الوظيفة{' '}
                    {renderSortArrow(
                      'job_title'
                    )}
                  </th>

                  <th
                    onClick={() =>
                      handleSort(
                        'department'
                      )
                    }
                    style={{
                      padding:
                        '12px',
                      cursor:
                        'pointer',
                    }}
                  >
                    الإدارة{' '}
                    {renderSortArrow(
                      'department'
                    )}
                  </th>

                  <th
                    onClick={() =>
                      handleSort(
                        'age'
                      )
                    }
                    style={{
                      padding:
                        '12px',
                      cursor:
                        'pointer',
                    }}
                  >
                    السن{' '}
                    {renderSortArrow(
                      'age'
                    )}
                  </th>

                  <th
                    onClick={() =>
                      handleSort(
                        'hiring_date'
                      )
                    }
                    style={{
                      padding:
                        '12px',
                      cursor:
                        'pointer',
                    }}
                  >
                    تاريخ التعيين
                  </th>

                  <th
                    style={{
                      padding:
                        '12px',
                    }}
                  >
                    نوع العقد
                  </th>

                  <th
                    style={{
                      padding:
                        '12px',
                    }}
                  >
                    نهاية العقد
                  </th>

                  <th
                    style={{
                      padding:
                        '12px',
                      textAlign:
                        'center',
                    }}
                  >
                    إجراءات
                  </th>
                </tr>
              </thead>

              <tbody>
                {finalTableEmployees.map(
                  (
                    emp: any
                  ) => {
                    const empCode =
                      getEmployeeCode(
                        emp
                      );

                    const nationalId =
                      getNationalId(
                        emp
                      );

                    const mobile =
                      getField(
                        emp,
                        'mobile',
                        'Mobile'
                      );

                    const isMissingData =
                      !nationalId ||
                      !mobile;

                    const cType =
                      getField(
                        emp,
                        'contract_type',
                        'ContractType'
                      );

                    const endDate =
                      getField(
                        emp,
                        'contract_end_date',
                        'ContractEndDate'
                      );

                    const empId =
                      getEmployeeId(
                        emp
                      );

                    return (
                      <tr
                        key={
                          empId ||
                          empCode
                        }
                        style={{
                          borderBottom:
                            '1px solid var(--line, #f1f5f9)',
                        }}
                      >
                        <td
                          style={{
                            padding:
                              '10px',
                            textAlign:
                              'center',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedEmpIds.includes(
                              empCode
                            )}
                            onChange={(
                              e
                            ) =>
                              setSelectedEmpIds(
                                e.target
                                  .checked
                                  ? [
                                      ...selectedEmpIds,
                                      empCode,
                                    ]
                                  : selectedEmpIds.filter(
                                      (
                                        id
                                      ) =>
                                        id !==
                                        empCode
                                    )
                              )
                            }
                          />
                        </td>

                        <td
                          style={{
                            padding:
                              '10px',
                            fontWeight:
                              'bold',
                            fontFamily:
                              'monospace',
                            color:
                              'var(--brass-600, #0d9488)',
                          }}
                        >
                          {empCode}
                        </td>

                        <td
                          style={{
                            padding:
                              '10px',
                            fontWeight:
                              'bold',
                          }}
                        >
                          {getEmployeeName(
                            emp
                          )}

                          {isMissingData && (
                            <span
                              title="بيانات غير مكتملة"
                              style={{
                                marginRight:
                                  '6px',
                              }}
                            >
                              ⚠️
                            </span>
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              '10px',
                            color:
                              'var(--muted)',
                          }}
                        >
                          {getField(
                            emp,
                            'job_title',
                            'JobTitle'
                          ) || '—'}
                        </td>

                        <td
                          style={{
                            padding:
                              '10px',
                            color:
                              'var(--muted)',
                          }}
                        >
                          {getField(
                            emp,
                            'department',
                            'Department'
                          ) || '—'}
                        </td>

                        <td
                          style={{
                            padding:
                              '10px',
                          }}
                        >
                          {renderAgeBadge(
                            emp
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              '10px',
                            fontFamily:
                              'monospace',
                          }}
                        >
                          {getField(
                            emp,
                            'hiring_date',
                            'HiringDate'
                          ) || '—'}
                        </td>

                        <td
                          style={{
                            padding:
                              '10px',
                            fontWeight:
                              'bold',
                          }}
                        >
                          {cType ||
                            '—'}
                        </td>

                        <td
                          style={{
                            padding:
                              '10px',
                          }}
                        >
                          {getContractStatusBadge(
                            cType,
                            endDate
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              '10px',
                            textAlign:
                              'center',
                          }}
                        >
                          <div
                            style={{
                              display:
                                'flex',
                              gap:
                                '6px',
                              justifyContent:
                                'center',
                            }}
                          >
                            <button
                              onClick={() =>
                                setProfileEmp(
                                  emp
                                )
                              }
                              style={{
                                padding:
                                  '4px 8px',
                                borderRadius:
                                  '6px',
                                border:
                                  '1px solid var(--line)',
                                cursor:
                                  'pointer',
                                fontSize:
                                  '10px',
                              }}
                            >
                              👁️ الملف
                            </button>

                            <button
                              onClick={() =>
                                handleOpenEdit(
                                  emp
                                )
                              }
                              style={{
                                padding:
                                  '4px 8px',
                                borderRadius:
                                  '6px',
                                border:
                                  '1px solid var(--line)',
                                cursor:
                                  'pointer',
                                fontSize:
                                  '10px',
                                fontWeight:
                                  'bold',
                              }}
                            >
                              تعديل ✏️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================================================
          PROFILE
      ================================================== */}

      {profileEmp && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15,23,42,0.8)',
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            zIndex:
              9999,
            padding:
              '20px',
          }}
        >
          <div
            style={{
              width:
                '600px',
              maxWidth:
                '100%',
              background:
                '#fff',
              borderRadius:
                '16px',
              padding:
                '24px',
              boxShadow:
                '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center',
                marginBottom:
                  '16px',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize:
                    '16px',
                  fontWeight:
                    '800',
                }}
              >
                👤 الملف الوظيفي الشامل
              </h3>

              <button
                onClick={() =>
                  setProfileEmp(
                    null
                  )
                }
                style={{
                  background:
                    '#fef2f2',
                  color:
                    '#dc2626',
                  border: 0,
                  padding:
                    '6px 12px',
                  borderRadius:
                    '6px',
                  cursor:
                    'pointer',
                }}
              >
                إغلاق ✕
              </button>
            </div>

            <div
              style={{
                display:
                  'grid',
                gridTemplateColumns:
                  '1fr 1fr',
                gap:
                  '10px',
                fontSize:
                  '12px',
              }}
            >
              <div>كود الموظف: <strong>{getEmployeeCode(profileEmp)}</strong></div>
              <div>EmployeeID: <strong>{getEmployeeId(profileEmp) || '—'}</strong></div>
              <div>الاسم: <strong>{getEmployeeName(profileEmp)}</strong></div>
              <div>الرقم القومي: <strong>{getNationalId(profileEmp) || 'غير مسجل'}</strong></div>
              <div>الإدارة: <strong>{getField(profileEmp, 'department', 'Department')}</strong></div>
              <div>الشركة: <strong>{getField(profileEmp, 'company', 'Company')}</strong></div>
              <div>الوظيفة: <strong>{getField(profileEmp, 'job_title', 'JobTitle')}</strong></div>
              <div>الموبايل: <strong>{getField(profileEmp, 'mobile', 'Mobile') || 'غير مسجل'}</strong></div>
              <div>تاريخ التعيين: <strong>{getField(profileEmp, 'hiring_date', 'HiringDate') || '—'}</strong></div>
              <div>نوع العقد: <strong>{getField(profileEmp, 'contract_type', 'ContractType') || '—'}</strong></div>
              <div>نهاية العقد: <strong>{getField(profileEmp, 'contract_end_date', 'ContractEndDate') || '—'}</strong></div>
              <div>الحالة: <strong>{getField(profileEmp, 'status', 'Status') || '—'}</strong></div>
            </div>

            <div
              style={{
                marginTop:
                  '20px',
                textAlign:
                  'left',
              }}
            >
              <button
                onClick={() => {
                  handleOpenEdit(
                    profileEmp
                  );
                  setProfileEmp(
                    null
                  );
                }}
                style={{
                  background:
                    'var(--brass-500)',
                  color:
                    '#fff',
                  border: 0,
                  padding:
                    '8px 16px',
                  borderRadius:
                    '6px',
                  fontWeight:
                    'bold',
                  cursor:
                    'pointer',
                }}
              >
                تعديل البيانات ✏️
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================
          إنهاء الخدمة
      ================================================== */}

      {showTermModal && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15,23,42,0.8)',
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            zIndex:
              9999,
            padding:
              '20px',
          }}
        >
          <div
            style={{
              width:
                '550px',
              maxWidth:
                '100%',
              background:
                '#fff',
              borderRadius:
                '16px',
              padding:
                '24px',
            }}
          >
            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                marginBottom:
                  '16px',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  color:
                    'var(--stamp-red)',
                }}
              >
                🚫 إنهاء خدمة /
                تحويل للانتظار
              </h3>

              <button
                onClick={() =>
                  setShowTermModal(
                    false
                  )
                }
                style={{
                  background:
                    '#fef2f2',
                  border: 0,
                  color:
                    '#dc2626',
                  padding:
                    '6px 12px',
                  borderRadius:
                    '6px',
                  cursor:
                    'pointer',
                }}
              >
                إغلاق ✕
              </button>
            </div>

            <form
              onSubmit={
                handleConfirmTermination
              }
              style={{
                display:
                  'flex',
                flexDirection:
                  'column',
                gap:
                  '14px',
              }}
            >
              <input
                type="text"
                placeholder="كود أو اسم أو رقم قومي..."
                value={
                  termSearch
                }
                onChange={(e) => {
                  setTermSearch(
                    e.target.value
                  );
                  setSelectedTermEmp(
                    null
                  );
                }}
                style={{
                  width:
                    '100%',
                  padding:
                    '10px',
                  border:
                    '1px solid var(--line)',
                  borderRadius:
                    '8px',
                  boxSizing:
                    'border-box',
                }}
              />

              {termSearchResults.length >
                0 &&
                !selectedTermEmp && (
                  <div
                    style={{
                      border:
                        '1px solid var(--line)',
                      borderRadius:
                        '8px',
                    }}
                  >
                    {termSearchResults.map(
                      (
                        emp: any,
                        i: number
                      ) => (
                        <div
                          key={
                            i
                          }
                          onClick={() => {
                            setSelectedTermEmp(
                              emp
                            );

                            setTermSearch(
                              `${getEmployeeCode(
                                emp
                              )} - ${getEmployeeName(
                                emp
                              )}`
                            );
                          }}
                          style={{
                            padding:
                              '10px',
                            cursor:
                              'pointer',
                            borderBottom:
                              '1px solid #f1f5f9',
                          }}
                        >
                          <strong>
                            [
                            {
                              getEmployeeCode(
                                emp
                              )
                            }
                            ]
                          </strong>{' '}
                          {
                            getEmployeeName(
                              emp
                            )
                          }

                          <div
                            style={{
                              fontSize:
                                '10px',
                              color:
                                '#64748b',
                            }}
                          >
                            الرقم القومي:{' '}
                            {
                              getNationalId(
                                emp
                              ) ||
                              '—'
                            }
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}

              {selectedTermEmp && (
                <div
                  style={{
                    background:
                      '#fef2f2',
                    padding:
                      '10px',
                    borderRadius:
                      '8px',
                    color:
                      '#dc2626',
                    fontWeight:
                      'bold',
                  }}
                >
                  الموظف المحدد:{' '}
                  {
                    getEmployeeName(
                      selectedTermEmp
                    )
                  }{' '}
                  —{' '}
                  {
                    getEmployeeCode(
                      selectedTermEmp
                    )
                  }
                </div>
              )}

              <select
                value={
                  termReason
                }
                onChange={(e) =>
                  setTermReason(
                    e.target.value
                  )
                }
                style={{
                  padding:
                    '9px',
                  borderRadius:
                    '8px',
                }}
              >
                <option value="استقالة">
                  استقالة
                </option>
                <option value="إنهاء عقد">
                  إنهاء عقد
                </option>
                <option value="إنهاء خدمات">
                  إنهاء خدمات
                </option>
                <option value="بلوغ سن">
                  بلوغ سن
                </option>
                <option value="انقطاع عن العمل">
                  انقطاع عن العمل
                </option>
                <option value="نقل شركة شقيقة">
                  نقل شركة شقيقة
                </option>
              </select>

              <input
                type="date"
                required
                value={
                  termDate
                }
                onChange={(e) =>
                  setTermDate(
                    e.target.value
                  )
                }
                style={{
                  padding:
                    '9px',
                  border:
                    '1px solid var(--line)',
                  borderRadius:
                    '8px',
                }}
              />

              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'flex-end',
                  gap:
                    '10px',
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setShowTermModal(
                      false
                    )
                  }
                  style={{
                    padding:
                      '8px 16px',
                    border:
                      '1px solid var(--line)',
                    borderRadius:
                      '8px',
                    background:
                      'transparent',
                  }}
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={
                    termSaving ||
                    !selectedTermEmp
                  }
                  style={{
                    background:
                      'var(--stamp-red)',
                    color:
                      '#fff',
                    border: 0,
                    padding:
                      '8px 16px',
                    borderRadius:
                      '8px',
                    fontWeight:
                      'bold',
                  }}
                >
                  {termSaving
                    ? 'جاري الحفظ...'
                    : 'تأكيد التحويل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================
          النقل المجمع
      ================================================== */}

      {showBulkTransferModal && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15,23,42,0.8)',
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            zIndex:
              9999,
            padding:
              '20px',
          }}
        >
          <div
            style={{
              width:
                '500px',
              maxWidth:
                '100%',
              background:
                '#fff',
              borderRadius:
                '16px',
              padding:
                '24px',
            }}
          >
            <h3
              style={{
                marginTop: 0,
              }}
            >
              🔄 النقل المجمع
            </h3>

            <form
              onSubmit={
                handleConfirmBulkTransfer
              }
              style={{
                display:
                  'flex',
                flexDirection:
                  'column',
                gap:
                  '14px',
              }}
            >
              <input
                list="bulkDeptList"
                placeholder="الإدارة الجديدة"
                value={
                  bulkDept
                }
                onChange={(e) =>
                  setBulkDept(
                    e.target.value
                  )
                }
                style={{
                  padding:
                    '10px',
                  borderRadius:
                    '8px',
                  border:
                    '1px solid var(--line)',
                }}
              />

              <datalist id="bulkDeptList">
                {deptsList.map(
                  (
                    d: any,
                    i: number
                  ) => (
                    <option
                      key={
                        i
                      }
                      value={d}
                    />
                  )
                )}
              </datalist>

              <input
                list="bulkCompList"
                placeholder="الشركة الجديدة"
                value={
                  bulkCompany
                }
                onChange={(e) =>
                  setBulkCompany(
                    e.target.value
                  )
                }
                style={{
                  padding:
                    '10px',
                  borderRadius:
                    '8px',
                  border:
                    '1px solid var(--line)',
                }}
              />

              <datalist id="bulkCompList">
                {compsList.map(
                  (
                    c: any,
                    i: number
                  ) => (
                    <option
                      key={
                        i
                      }
                      value={c}
                    />
                  )
                )}
              </datalist>

              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'flex-end',
                  gap:
                    '10px',
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setShowBulkTransferModal(
                      false
                    )
                  }
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={
                    bulkSaving
                  }
                >
                  {bulkSaving
                    ? 'جاري التحديث...'
                    : 'تأكيد النقل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================
          نافذة التعديل
      ================================================== */}

      {editData && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15,23,42,0.8)',
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            zIndex:
              9999,
            padding:
              '20px',
          }}
        >
          <div
            style={{
              width:
                '800px',
              maxWidth:
                '100%',
              maxHeight:
                '90vh',
              overflowY:
                'auto',
              background:
                'var(--paper-card, #fff)',
              borderRadius:
                '16px',
              padding:
                '24px',
            }}
          >
            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center',
                marginBottom:
                  '20px',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize:
                    '18px',
                  fontWeight:
                    '800',
                }}
              >
                تعديل بيانات الموظف
              </h3>

              <button
                onClick={() =>
                  setEditData(
                    null
                  )
                }
                style={{
                  background:
                    '#fef2f2',
                  color:
                    '#dc2626',
                  border: 0,
                  padding:
                    '6px 12px',
                  borderRadius:
                    '6px',
                  cursor:
                    'pointer',
                }}
              >
                إغلاق ✕
              </button>
            </div>

            <form
              onSubmit={
                handleSaveEdit
              }
            >
              <div
                style={{
                  display:
                    'grid',
                  gridTemplateColumns:
                    'repeat(3, 1fr)',
                  gap:
                    '12px',
                }}
              >
                {[
                  {
                    label:
                      'الكود',
                    key1:
                      'employee_code',
                    key2:
                      'EmployeeCode',
                    disabled:
                      true,
                  },
                  {
                    label:
                      'الاسم',
                    key1:
                      'employee_name',
                    key2:
                      'EmployeeName',
                  },
                  {
                    label:
                      'الرقم القومي',
                    key1:
                      'national_id',
                    key2:
                      'NationalID',
                  },
                  {
                    label:
                      'تاريخ الميلاد',
                    key1:
                      'birth_date',
                    key2:
                      'BirthDate',
                  },
                  {
                    label:
                      'السن',
                    key1:
                      'age',
                    key2:
                      'Age',
                  },
                  {
                    label:
                      'الإدارة',
                    key1:
                      'department',
                    key2:
                      'Department',
                  },
                  {
                    label:
                      'الشركة',
                    key1:
                      'company',
                    key2:
                      'Company',
                  },
                  {
                    label:
                      'الوظيفة',
                    key1:
                      'job_title',
                    key2:
                      'JobTitle',
                  },
                  {
                    label:
                      'الموبايل',
                    key1:
                      'mobile',
                    key2:
                      'Mobile',
                  },
                  {
                    label:
                      'البريد الإلكتروني',
                    key1:
                      'email',
                    key2:
                      'Email',
                  },
                ].map(
                  (
                    field
                  ) => (
                    <div
                      key={
                        field.label
                      }
                    >
                      <label
                        style={{
                          display:
                            'block',
                          fontSize:
                            '11px',
                          marginBottom:
                            '6px',
                          fontWeight:
                            'bold',
                        }}
                      >
                        {
                          field.label
                        }
                      </label>

                      <input
                        type="text"
                        disabled={
                          field.disabled
                        }
                        value={
                          getField(
                            editData.emp,
                            field.key1,
                            field.key2
                          ) ?? ''
                        }
                        onChange={(
                          e
                        ) =>
                          setEditData(
                            {
                              ...editData,
                              emp: {
                                ...editData.emp,
                                [field.key1]:
                                  e.target
                                    .value,
                                [field.key2]:
                                  e.target
                                    .value,
                              },
                            }
                          )
                        }
                        style={{
                          width:
                            '100%',
                          padding:
                            '8px 10px',
                          borderRadius:
                            '6px',
                          border:
                            '1px solid var(--line)',
                          boxSizing:
                            'border-box',
                        }}
                      />
                    </div>
                  )
                )}

                <div>
                  <label
                    style={{
                      display:
                        'block',
                      fontSize:
                        '11px',
                      marginBottom:
                        '6px',
                      fontWeight:
                        'bold',
                    }}
                  >
                    تاريخ التعيين
                  </label>

                  <input
                    type="date"
                    value={
                      getField(
                        editData.emp,
                        'hiring_date',
                        'HiringDate'
                      ) || ''
                    }
                    onChange={(
                      e
                    ) =>
                      setEditData(
                        {
                          ...editData,
                          emp: {
                            ...editData.emp,
                            hiring_date:
                              e.target
                                .value,
                            HiringDate:
                              e.target
                                .value,
                          },
                        }
                      )
                    }
                    style={{
                      width:
                        '100%',
                      padding:
                        '8px 10px',
                      borderRadius:
                        '6px',
                      border:
                        '1px solid var(--line)',
                      boxSizing:
                        'border-box',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display:
                        'block',
                      fontSize:
                        '11px',
                      marginBottom:
                        '6px',
                      fontWeight:
                        'bold',
                    }}
                  >
                    نوع العقد
                  </label>

                  <select
                    value={
                      getField(
                        editData.emp,
                        'contract_type',
                        'ContractType'
                      ) ||
                      'محدد المدة'
                    }
                    onChange={(
                      e
                    ) =>
                      setEditData(
                        {
                          ...editData,
                          emp: {
                            ...editData.emp,
                            contract_type:
                              e.target
                                .value,
                            ContractType:
                              e.target
                                .value,
                          },
                        }
                      )
                    }
                    style={{
                      width:
                        '100%',
                      padding:
                        '8px 10px',
                      borderRadius:
                        '6px',
                      border:
                        '1px solid var(--line)',
                    }}
                  >
                    <option value="دائم">
                      دائم
                    </option>

                    <option value="محدد المدة">
                      محدد المدة
                    </option>

                    <option value="محدد المدة - فوق السن">
                      محدد المدة - فوق السن
                    </option>

                    <option value="محدد المدة - مكافأة شاملة">
                      محدد المدة - مكافأة شاملة
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display:
                        'block',
                      fontSize:
                        '11px',
                      marginBottom:
                        '6px',
                      fontWeight:
                        'bold',
                    }}
                  >
                    نهاية العقد
                  </label>

                  <input
                    type="date"
                    value={
                      getField(
                        editData.emp,
                        'contract_end_date',
                        'ContractEndDate'
                      ) || ''
                    }
                    onChange={(
                      e
                    ) =>
                      setEditData(
                        {
                          ...editData,
                          emp: {
                            ...editData.emp,
                            contract_end_date:
                              e.target
                                .value,
                            ContractEndDate:
                              e.target
                                .value,
                          },
                        }
                      )
                    }
                    style={{
                      width:
                        '100%',
                      padding:
                        '8px 10px',
                      borderRadius:
                        '6px',
                      border:
                        '1px solid var(--line)',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display:
                        'block',
                      fontSize:
                        '11px',
                      marginBottom:
                        '6px',
                      fontWeight:
                        'bold',
                    }}
                  >
                    الحالة
                  </label>

                  <select
                    value={
                      getField(
                        editData.emp,
                        'status',
                        'Status'
                      ) ||
                      'Active'
                    }
                    onChange={(
                      e
                    ) =>
                      setEditData(
                        {
                          ...editData,
                          emp: {
                            ...editData.emp,
                            status:
                              e.target
                                .value,
                            Status:
                              e.target
                                .value,
                          },
                        }
                      )
                    }
                    style={{
                      width:
                        '100%',
                      padding:
                        '8px 10px',
                      borderRadius:
                        '6px',
                      border:
                        '1px solid var(--line)',
                    }}
                  >
                    <option value="Active">
                      Active
                    </option>
                    <option value="Inactive">
                      Inactive
                    </option>
                  </select>
                </div>
              </div>

              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'flex-end',
                  gap:
                    '12px',
                  marginTop:
                    '24px',
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setEditData(
                      null
                    )
                  }
                  style={{
                    padding:
                      '10px 20px',
                    borderRadius:
                      '8px',
                    border:
                      '1px solid var(--line)',
                    background:
                      'transparent',
                    cursor:
                      'pointer',
                  }}
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={
                    editData.saving
                  }
                  style={{
                    background:
                      editData.saving
                        ? '#64748b'
                        : '#0d9488',
                    color:
                      '#fff',
                    border: 0,
                    padding:
                      '10px 20px',
                    borderRadius:
                      '8px',
                    fontWeight:
                      'bold',
                    cursor:
                      editData.saving
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {editData.saving
                    ? 'جاري الحفظ...'
                    : 'حفظ كافة التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================
          إضافة موظف
      ================================================== */}

      {showAddModal && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15,23,42,0.8)',
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            zIndex:
              9999,
            padding:
              '20px',
          }}
        >
          <div
            style={{
              width:
                '700px',
              maxWidth:
                '100%',
              background:
                '#fff',
              borderRadius:
                '16px',
              padding:
                '24px',
            }}
          >
            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                marginBottom:
                  '20px',
              }}
            >
              <h3
                style={{
                  margin:
                    0,
                }}
              >
                إضافة موظف جديد
              </h3>

              <button
                onClick={() =>
                  setShowAddModal(
                    false
                  )
                }
              >
                إغلاق ✕
              </button>
            </div>

            <form
              onSubmit={
                handleAddEmployee
              }
            >
              <div
                style={{
                  display:
                    'grid',
                  gridTemplateColumns:
                    '1fr 1fr',
                  gap:
                    '12px',
                }}
              >
                <input
                  required
                  placeholder="كود الموظف *"
                  value={
                    newEmp.employee_code
                  }
                  onChange={(e) =>
                    setNewEmp({
                      ...newEmp,
                      employee_code:
                        e.target
                          .value,
                    })
                  }
                />

                <input
                  required
                  placeholder="الاسم *"
                  value={
                    newEmp.employee_name
                  }
                  onChange={(e) =>
                    setNewEmp({
                      ...newEmp,
                      employee_name:
                        e.target
                          .value,
                    })
                  }
                />

                <input
                  placeholder="الرقم القومي"
                  value={
                    newEmp.national_id
                  }
                  onChange={(e) =>
                    setNewEmp({
                      ...newEmp,
                      national_id:
                        e.target
                          .value,
                    })
                  }
                />

                <input
                  type="date"
                  value={
                    newEmp.birth_date
                  }
                  onChange={(e) =>
                    setNewEmp({
                      ...newEmp,
                      birth_date:
                        e.target
                          .value,
                    })
                  }
                />

                <input
                  placeholder="الإدارة"
                  value={
                    newEmp.department
                  }
                  onChange={(e) =>
                    setNewEmp({
                      ...newEmp,
                      department:
                        e.target
                          .value,
                    })
                  }
                />

                <input
                  placeholder="الشركة"
                  value={
                    newEmp.company
                  }
                  onChange={(e) =>
                    setNewEmp({
                      ...newEmp,
                      company:
                        e.target
                          .value,
                    })
                  }
                />

                <input
                  placeholder="الوظيفة"
                  value={
                    newEmp.job_title
                  }
                  onChange={(e) =>
                    setNewEmp({
                      ...newEmp,
                      job_title:
                        e.target
                          .value,
                    })
                  }
                />

                <input
                  type="date"
                  value={
                    newEmp.hiring_date
                  }
                  onChange={(e) =>
                    setNewEmp({
                      ...newEmp,
                      hiring_date:
                        e.target
                          .value,
                    })
                  }
                />

                <select
                  value={
                    newEmp.contract_type
                  }
                  onChange={(e) =>
                    setNewEmp({
                      ...newEmp,
                      contract_type:
                        e.target
                          .value,
                    })
                  }
                >
                  <option value="دائم">
                    دائم
                  </option>

                  <option value="محدد المدة">
                    محدد المدة
                  </option>

                  <option value="محدد المدة - فوق السن">
                    محدد المدة - فوق السن
                  </option>

                  <option value="محدد المدة - مكافأة شاملة">
                    محدد المدة - مكافأة شاملة
                  </option>
                </select>

                <input
                  type="date"
                  disabled={
                    newEmp.contract_type ===
                    'دائم'
                  }
                  value={
                    newEmp.contract_end_date
                  }
                  onChange={(e) =>
                    setNewEmp({
                      ...newEmp,
                      contract_end_date:
                        e.target
                          .value,
                    })
                  }
                />

                <input
                  placeholder="الموبايل"
                  value={
                    newEmp.mobile
                  }
                  onChange={(e) =>
                    setNewEmp({
                      ...newEmp,
                      mobile:
                        e.target
                          .value,
                    })
                  }
                />

                <input
                  placeholder="البريد الإلكتروني"
                  value={
                    newEmp.email
                  }
                  onChange={(e) =>
                    setNewEmp({
                      ...newEmp,
                      email:
                        e.target
                          .value,
                    })
                  }
                />
              </div>

              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'flex-end',
                  gap:
                    '10px',
                  marginTop:
                    '20px',
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setShowAddModal(
                      false
                    )
                  }
                >
                  إلغاء
                </button>

                <button type="submit">
                  إضافة الموظف وعقده
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
