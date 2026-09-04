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
    employees = [],
    loading,
    refresh: fetchEmployees,
  } = useAppData();

  // ============================================================
  // HELPERS
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

  const getEmployeeId = (emp: any) =>
    String(
      getField(
        emp,
        'employee_id',
        'EmployeeID',
        'employeeId'
      ) || ''
    ).trim();

  const getEmployeeCode = (emp: any) =>
    String(
      getField(
        emp,
        'employee_code',
        'EmployeeCode',
        'employeeCode',
        'code',
        'Code'
      ) || ''
    ).trim();

  const getEmployeeName = (emp: any) =>
    getField(
      emp,
      'employee_name',
      'EmployeeName',
      'ArabicName',
      'employeeName',
      'name',
      'Name'
    );

  const getNationalId = (emp: any) =>
    String(
      getField(
        emp,
        'national_id',
        'NationalID',
        'nationalId',
        'NationalId'
      ) || ''
    ).trim();

  const normalizeSearch = (value: any) =>
    String(value ?? '')
      .trim()
      .toLowerCase();

  const getEmployeeAge = (emp: any) => {
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

    const birthDateRaw = getField(
      emp,
      'birth_date',
      'BirthDate'
    );

    if (!birthDateRaw) {
      return null;
    }

    const birthDate = new Date(
      birthDateRaw
    );

    if (
      isNaN(
        birthDate.getTime()
      )
    ) {
      return null;
    }

    const today = new Date();

    let age =
      today.getFullYear() -
      birthDate.getFullYear();

    const hasBirthdayPassed =
      today.getMonth() >
        birthDate.getMonth() ||
      (
        today.getMonth() ===
          birthDate.getMonth() &&
        today.getDate() >=
          birthDate.getDate()
      );

    if (!hasBirthdayPassed) {
      age--;
    }

    return age;
  };

  // ============================================================
  // FILTER STATES
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
  // SORT / SELECTION
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
  // MODALS
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
  // BULK
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
  // TERMINATION
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
  // NEW EMPLOYEE
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
  // ACTIVE EMPLOYEES
  // ============================================================

  const activeEmployeesOnly =
    useMemo(() => {
      return employees.filter(
        (emp: any) => {
          const status =
            String(
              getField(
                emp,
                'status',
                'Status'
              ) || 'Active'
            )
              .trim()
              .toLowerCase();

          return (
            status === 'active'
          );
        }
      );
    }, [employees]);

  // ============================================================
  // LISTS
  // ============================================================

  const deptsList = useMemo(() => {
    return Array.from(
      new Set(
        activeEmployeesOnly
          .map((emp: any) =>
            getField(
              emp,
              'department',
              'Department'
            )
          )
          .filter(Boolean)
      )
    );
  }, [
    activeEmployeesOnly,
  ]);

  const compsList = useMemo(() => {
    return Array.from(
      new Set(
        activeEmployeesOnly
          .map((emp: any) =>
            getField(
              emp,
              'company',
              'Company'
            )
          )
          .filter(Boolean)
      )
    );
  }, [
    activeEmployeesOnly,
  ]);

  const typesList = useMemo(() => {
    return Array.from(
      new Set(
        activeEmployeesOnly
          .map((emp: any) =>
            getField(
              emp,
              'contract_type',
              'ContractType'
            )
          )
          .filter(Boolean)
      )
    );
  }, [
    activeEmployeesOnly,
  ]);

  // ============================================================
  // MAIN FILTER
  // ============================================================

  const baseFilteredEmployees =
    useMemo(() => {
      const search =
        normalizeSearch(
          searchTerm
        );

      return activeEmployeesOnly.filter(
        (emp: any) => {
          const code =
            normalizeSearch(
              getEmployeeCode(
                emp
              )
            );

          const name =
            normalizeSearch(
              getEmployeeName(
                emp
              )
            );

          const nationalId =
            normalizeSearch(
              getNationalId(
                emp
              )
            );

          const department =
            normalizeSearch(
              getField(
                emp,
                'department',
                'Department'
              )
            );

          const company =
            normalizeSearch(
              getField(
                emp,
                'company',
                'Company'
              )
            );

          const contractType =
            getField(
              emp,
              'contract_type',
              'ContractType'
            );

          const age =
            getEmployeeAge(emp);

          const matchesSearch =
            !search ||
            code.includes(search) ||
            name.includes(search) ||
            nationalId.includes(
              search
            ) ||
            department.includes(
              search
            );

          const matchesDept =
            !selectedDept ||
            department.includes(
              normalizeSearch(
                selectedDept
              )
            );

          const matchesCompany =
            !selectedCompany ||
            company.includes(
              normalizeSearch(
                selectedCompany
              )
            );

          const matchesType =
            !selectedType ||
            contractType ===
              selectedType;

          let matchesAge = true;

          if (
            selectedAgeRange ===
            '60_plus'
          ) {
            matchesAge =
              age !== null &&
              age >= 60;
          }

          if (
            selectedAgeRange ===
            '50_59'
          ) {
            matchesAge =
              age !== null &&
              age >= 50 &&
              age < 60;
          }

          if (
            selectedAgeRange ===
            '30_49'
          ) {
            matchesAge =
              age !== null &&
              age >= 30 &&
              age < 50;
          }

          if (
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
            matchesCompany &&
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
          (emp: any) =>
            getField(
              emp,
              'contract_type',
              'ContractType'
            ) === 'دائم'
        ).length;

      const fixed =
        baseFilteredEmployees.filter(
          (emp: any) =>
            String(
              getField(
                emp,
                'contract_type',
                'ContractType'
              )
            ).includes(
              'محدد'
            )
        ).length;

      const aboveAge =
        baseFilteredEmployees.filter(
          (emp: any) => {
            const type =
              String(
                getField(
                  emp,
                  'contract_type',
                  'ContractType'
                )
              );

            const age =
              getEmployeeAge(
                emp
              );

            return (
              type.includes(
                'فوق السن'
              ) ||
              (age !== null &&
                age >= 60)
            );
          }
        ).length;

      const pct = (
        value: number
      ) =>
        total
          ? (
              (value / total) *
              100
            ).toFixed(1)
          : '0';

      return {
        total,
        perm,
        permPct: pct(perm),
        fixed,
        fixedPct: pct(fixed),
        aboveAge,
        aboveAgePct:
          pct(aboveAge),
      };
    }, [
      baseFilteredEmployees,
    ]);

  // ============================================================
  // TABLE EMPLOYEES
  // ============================================================

  const finalTableEmployees =
    useMemo(() => {
      const filtered =
        baseFilteredEmployees.filter(
          (emp: any) => {
            const type =
              String(
                getField(
                  emp,
                  'contract_type',
                  'ContractType'
                )
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
                type === 'دائم'
              );
            }

            if (
              activeCardFilter ===
              'FIXED'
            ) {
              return type.includes(
                'محدد'
              );
            }

            if (
              activeCardFilter ===
              'ABOVE_AGE'
            ) {
              return (
                type.includes(
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
            const aAge =
              getEmployeeAge(
                a
              ) ?? 0;

            const bAge =
              getEmployeeAge(
                b
              ) ?? 0;

            const result =
              aAge - bAge;

            return sortDirection ===
              'asc'
              ? result
              : -result;
          }

          const aValue =
            String(
              getField(
                a,
                sortColumn
              ) || ''
            );

          const bValue =
            String(
              getField(
                b,
                sortColumn
              ) || ''
            );

          const result =
            aValue.localeCompare(
              bValue,
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
            ? result
            : -result;
        }
      );
    }, [
      baseFilteredEmployees,
      activeCardFilter,
      sortColumn,
      sortDirection,
    ]);

  // ============================================================
  // TERMINATION SEARCH
  // ============================================================

  const termSearchResults =
    useMemo(() => {
      const search =
        normalizeSearch(
          termSearch
        );

      if (!search) {
        return [];
      }

      return activeEmployeesOnly
        .filter(
          (emp: any) => {
            const code =
              normalizeSearch(
                getEmployeeCode(
                  emp
                )
              );

            const name =
              normalizeSearch(
                getEmployeeName(
                  emp
                )
              );

            const nationalId =
              normalizeSearch(
                getNationalId(
                  emp
                )
              );

            const dept =
              normalizeSearch(
                getField(
                  emp,
                  'department',
                  'Department'
                )
              );

            return (
              code.includes(search) ||
              name.includes(search) ||
              nationalId.includes(
                search
              ) ||
              dept.includes(search)
            );
          }
        )
        .slice(0, 8);
    }, [
      activeEmployeesOnly,
      termSearch,
    ]);

  // ============================================================
  // SORT
  // ============================================================

  const handleSort = (
    column: string
  ) => {
    if (
      sortColumn === column
    ) {
      setSortDirection(
        (prev) =>
          prev === 'asc'
            ? 'desc'
            : 'asc'
      );
    } else {
      setSortColumn(column);
      setSortDirection(
        'asc'
      );
    }
  };

  const renderSortArrow = (
    column: string
  ) => {
    if (
      sortColumn !== column
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

    return (
      <span
        style={{
          marginRight:
            '4px',
          color:
            'var(--brass-600, #0d9488)',
        }}
      >
        {sortDirection ===
        'asc'
          ? '▲'
          : '▼'}
      </span>
    );
  };

  // ============================================================
  // OPEN EDIT
  // ============================================================

  const handleOpenEdit = (
    emp: any
  ) => {
    setEditData({
      emp: {
        ...emp,
      },
      loading: false,
      saving: false,
    });
  };

  // ============================================================
  // IMPORTANT:
  // RECEIVE EMPLOYEE FROM DASHBOARD
  // ============================================================

  useEffect(() => {
    if (
      loading ||
      !employees ||
      employees.length === 0
    ) {
      return;
    }

    const savedEmployeeId =
      localStorage.getItem(
        'selectedEmployeeId'
      ) ||
      sessionStorage.getItem(
        'selectedEmployeeId'
      ) ||
      '';

    const savedEmployeeCode =
      localStorage.getItem(
        'selectedEmployeeCode'
      ) ||
      localStorage.getItem(
        'employeeSearch'
      ) ||
      localStorage.getItem(
        'jumpSearch'
      ) ||
      sessionStorage.getItem(
        'employeeSearch'
      ) ||
      sessionStorage.getItem(
        'jumpSearch'
      ) ||
      '';

    const cleanId =
      String(
        savedEmployeeId
      ).trim();

    const cleanCode =
      String(
        savedEmployeeCode
      ).trim();

    if (
      !cleanId &&
      !cleanCode
    ) {
      return;
    }

    const targetEmployee =
      employees.find(
        (emp: any) => {
          const employeeId =
            getEmployeeId(
              emp
            );

          const employeeCode =
            getEmployeeCode(
              emp
            );

          const matchId =
            cleanId &&
            employeeId ===
              cleanId;

          const matchCode =
            cleanCode &&
            employeeCode.toLowerCase() ===
              cleanCode.toLowerCase();

          return (
            matchId ||
            matchCode
          );
        }
      );

    if (!targetEmployee) {
      console.warn(
        'Employee from Dashboard was not found.',
        {
          cleanId,
          cleanCode,
        }
      );

      return;
    }

    // ========================================================
    // افتح السجل مباشرة
    // ========================================================

    setSearchTerm('');
    setSelectedDept('');
    setSelectedCompany('');
    setSelectedType('');
    setSelectedAgeRange('');
    setActiveCardFilter(
      null
    );

    handleOpenEdit(
      targetEmployee
    );

    // ========================================================
    // تنظيف مفاتيح الانتقال
    // ========================================================

    localStorage.removeItem(
      'selectedEmployeeId'
    );

    localStorage.removeItem(
      'selectedEmployeeCode'
    );

    localStorage.removeItem(
      'employeeId'
    );

    localStorage.removeItem(
      'employeeSearch'
    );

    localStorage.removeItem(
      'jumpSearch'
    );

    sessionStorage.removeItem(
      'selectedEmployeeId'
    );

    sessionStorage.removeItem(
      'employeeSearch'
    );

    sessionStorage.removeItem(
      'jumpSearch'
    );
  }, [
    employees,
    loading,
  ]);

  // ============================================================
  // SAVE EDIT
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
        const emp =
          editData.emp;

        const employeeCode =
          getEmployeeCode(emp);

        if (!employeeCode) {
          throw new Error(
            'كود الموظف غير موجود.'
          );
        }

        const rawHiring =
          getField(
            emp,
            'hiring_date',
            'HiringDate'
          );

        const rawBirth =
          getField(
            emp,
            'birth_date',
            'BirthDate'
          );

        const rawEnd =
          getField(
            emp,
            'contract_end_date',
            'ContractEndDate'
          );

        const employeeUpdate =
          {
            employee_code:
              employeeCode,

            employee_name:
              getField(
                emp,
                'employee_name',
                'EmployeeName',
                'ArabicName'
              ),

            national_id:
              getField(
                emp,
                'national_id',
                'NationalID'
              ),

            birth_date:
              rawBirth || null,

            age:
              emp.age !==
                undefined &&
              emp.age !== ''
                ? Number(
                    emp.age
                  )
                : null,

            department:
              getField(
                emp,
                'department',
                'Department'
              ),

            company:
              getField(
                emp,
                'company',
                'Company'
              ),

            job_title:
              getField(
                emp,
                'job_title',
                'JobTitle'
              ),

            hiring_date:
              rawHiring || null,

            status:
              getField(
                emp,
                'status',
                'Status'
              ) ||
              'Active',

            email:
              getField(
                emp,
                'email',
                'Email'
              ),

            mobile:
              getField(
                emp,
                'mobile',
                'Mobile',
                'MOBILE'
              ),
          };

        const {
          error:
            employeeError,
        } = await supabase
          .from(
            'employees'
          )
          .update(
            employeeUpdate
          )
          .eq(
            'employee_code',
            employeeCode
          );

        if (employeeError) {
          throw employeeError;
        }

        const contractType =
          getField(
            emp,
            'contract_type',
            'ContractType'
          );

        const contractUpdate =
          {
            contract_type:
              contractType,

            contract_end_date:
              rawEnd || null,

            status:
              getField(
                emp,
                'status',
                'Status'
              ) ||
              'Active',
          };

        const {
          error:
            contractError,
        } = await supabase
          .from(
            'contracts'
          )
          .update(
            contractUpdate
          )
          .eq(
            'employee_code',
            employeeCode
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
        error: any
      ) {
        alert(
          'حدث خطأ أثناء الحفظ: ' +
            error.message
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
  // TERMINATION
  // ============================================================

  const handleConfirmTermination =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      if (
        !selectedTermEmp
      ) {
        alert(
          'يرجى اختيار موظف أولاً.'
        );
        return;
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
          error,
        } =
          await supabase
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

        if (error) {
          throw error;
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
          )}) إلى قسم تحويلات تحت الاعتماد.`
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
        error: any
      ) {
        alert(
          'خطأ أثناء العملية: ' +
            error.message
        );
      } finally {
        setTermSaving(
          false
        );
      }
    };

  // ============================================================
  // BULK TRANSFER
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
        alert(
          'يرجى تحديد إدارة جديدة أو شركة جديدة.'
        );
        return;
      }

      setBulkSaving(
        true
      );

      try {
        const payload: any =
          {};

        if (bulkDept) {
          payload.department =
            bulkDept;
        }

        if (bulkCompany) {
          payload.company =
            bulkCompany;
        }

        const {
          error,
        } =
          await supabase
            .from(
              'employees'
            )
            .update(
              payload
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
        error: any
      ) {
        alert(
          'خطأ أثناء النقل المجمع: ' +
            error.message
        );
      } finally {
        setBulkSaving(
          false
        );
      }
    };

  // ============================================================
  // DELETE
  // ============================================================

  const handleDeleteSelected =
    async () => {
      if (
        selectedEmpIds.length ===
        0
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `هل أنت متأكد من حذف ${selectedEmpIds.length} موظف نهائيًا؟`
        );

      if (!confirmed) {
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
          error,
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

        if (error) {
          throw error;
        }

        alert(
          'تم حذف الموظفين بنجاح 🗑️✅'
        );

        setSelectedEmpIds(
          []
        );

        await fetchEmployees();
      } catch (
        error: any
      ) {
        alert(
          'حدث خطأ أثناء الحذف: ' +
            error.message
        );
      } finally {
        setIsDeleting(
          false
        );
      }
    };

  // ============================================================
  // ADD EMPLOYEE
  // ============================================================

  const handleAddEmployee =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      try {
        let age =
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

          age =
            today.getFullYear() -
            birth.getFullYear();

          const notYetBirthday =
            today.getMonth() <
              birth.getMonth() ||
            (
              today.getMonth() ===
                birth.getMonth() &&
              today.getDate() <
                birth.getDate()
            );

          if (
            notYetBirthday
          ) {
            age--;
          }
        }

        const {
          error:
            employeeError,
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
                  newEmp.birth_date ||
                  null,

                age,

                department:
                  newEmp.department,

                company:
                  newEmp.company,

                job_title:
                  newEmp.job_title,

                hiring_date:
                  newEmp.hiring_date ||
                  null,

                status:
                  newEmp.status,

                email:
                  newEmp.email,

                mobile:
                  newEmp.mobile,
              },
            ]);

        if (employeeError) {
          throw employeeError;
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

                contract_start_date:
                  newEmp.hiring_date ||
                  null,

                contract_end_date:
                  newEmp.contract_type ===
                    'دائم' ||
                  !newEmp.contract_end_date
                    ? null
                    : newEmp.contract_end_date,

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
        error: any
      ) {
        alert(
          'خطأ أثناء الإضافة: ' +
            error.message
        );
      }
    };

  // ============================================================
  // EXPORT
  // ============================================================

  const handleExportToExcel =
    (
      onlySelected = false
    ) => {
      const rows =
        onlySelected
          ? finalTableEmployees.filter(
              (emp: any) =>
                selectedEmpIds.includes(
                  getEmployeeCode(
                    emp
                  )
                )
            )
          : finalTableEmployees;

      const data =
        rows.map(
          (emp: any) => ({
            EmployeeID:
              getEmployeeId(
                emp
              ),

            EmployeeCode:
              getEmployeeCode(
                emp
              ),

            EmployeeName:
              getEmployeeName(
                emp
              ),

            NationalID:
              getNationalId(
                emp
              ),

            Department:
              getField(
                emp,
                'department',
                'Department'
              ),

            Company:
              getField(
                emp,
                'company',
                'Company'
              ),

            JobTitle:
              getField(
                emp,
                'job_title',
                'JobTitle'
              ),

            Age:
              getEmployeeAge(
                emp
              ),

            HiringDate:
              getField(
                emp,
                'hiring_date',
                'HiringDate'
              ),

            ContractType:
              getField(
                emp,
                'contract_type',
                'ContractType'
              ),

            ContractEndDate:
              getField(
                emp,
                'contract_end_date',
                'ContractEndDate'
              ),

            Mobile:
              getField(
                emp,
                'mobile',
                'Mobile'
              ),

            Email:
              getField(
                emp,
                'email',
                'Email'
              ),
          })
        );

      const ws =
        XLSX.utils.json_to_sheet(
          data
        );

      const wb =
        XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        wb,
        ws,
        'Employees'
      );

      XLSX.writeFile(
        wb,
        `Employees_${new Date()
          .toISOString()
          .split('T')[0]}.xlsx`
      );
    };

  // ============================================================
  // CONTRACT BADGE
  // ============================================================

  const getContractStatusBadge = (
    type: string,
    endDate: string
  ) => {
    if (
      endDate &&
      String(
        endDate
      ).trim()
    ) {
      const end =
        new Date(
          endDate
        );

      const today =
        new Date();

      end.setHours(
        0,
        0,
        0,
        0
      );

      today.setHours(
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
              60 *
              60 *
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
            {endDate} 🚨
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
            {endDate} ⏳
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
          {endDate}
        </span>
      );
    }

    if (
      type === 'دائم'
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
  // AGE BADGE
  // ============================================================

  const renderAgeBadge =
    (emp: any) => {
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

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div
      style={{
        direction:
          'rtl',
        animation:
          'fadeIn 0.4s ease-in-out',
      }}
    >
      {/* ========================================================
          HEADER
      ======================================================== */}

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
            إدارة وتتبع السجل الرئيسي للموظفين
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
              cursor:
                'pointer',
            }}
          >
            + إضافة موظف
          </button>
        </div>
      </div>

      {/* ========================================================
          KPI CARDS
      ======================================================== */}

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
                : '1px solid var(--line)',
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
            إجمالي الموظفين
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
            100% من القوة الحالية
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
                : '1px solid var(--line)',
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
                : '1px solid var(--line)',
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
                : '1px solid var(--line)',
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

      {/* ========================================================
          BULK ACTIONS
      ======================================================== */}

      {selectedEmpIds.length >
        0 && (
        <div
          style={{
            background:
              '#0f172a',
            color:
              '#fff',
            padding:
              '10px 16px',
            borderRadius:
              '10px',
            marginBottom:
              '16px',
            display:
              'flex',
            justifyContent:
              'space-between',
            alignItems:
              'center',
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
            تم تحديد{' '}
            <span
              style={{
                color:
                  '#38bdf8',
              }}
            >
              {
                selectedEmpIds.length
              }
            </span>{' '}
            موظف
          </div>

          <div
            style={{
              display:
                'flex',
              gap:
                '8px',
            }}
          >
            <button
              onClick={() =>
                setShowBulkTransferModal(
                  true
                )
              }
              style={{
                padding:
                  '6px 12px',
                background:
                  '#2563eb',
                color:
                  '#fff',
                border: 0,
                borderRadius:
                  '6px',
                fontWeight:
                  'bold',
                cursor:
                  'pointer',
              }}
            >
              نقل مجمع 🔄
            </button>

            <button
              onClick={() =>
                handleExportToExcel(
                  true
                )
              }
              style={{
                padding:
                  '6px 12px',
                background:
                  '#16a34a',
                color:
                  '#fff',
                border: 0,
                borderRadius:
                  '6px',
                fontWeight:
                  'bold',
                cursor:
                  'pointer',
              }}
            >
              تصدير المحدد 📥
            </button>

            <button
              onClick={
                handleDeleteSelected
              }
              disabled={
                isDeleting
              }
              style={{
                padding:
                  '6px 12px',
                background:
                  '#dc2626',
                color:
                  '#fff',
                border: 0,
                borderRadius:
                  '6px',
                fontWeight:
                  'bold',
                cursor:
                  'pointer',
              }}
            >
              {isDeleting
                ? 'جاري الحذف...'
                : 'حذف نهائي 🗑️'}
            </button>

            <button
              onClick={() =>
                setSelectedEmpIds(
                  []
                )
              }
              style={{
                padding:
                  '6px 12px',
                background:
                  'transparent',
                color:
                  '#fff',
                border:
                  '1px solid #64748b',
                borderRadius:
                  '6px',
                cursor:
                  'pointer',
              }}
            >
              إلغاء ✕
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          FILTERS
      ======================================================== */}

      <div
        style={{
          background:
            'var(--paper-card)',
          border:
            '1px solid var(--line)',
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
          flexWrap:
            'wrap',
          alignItems:
            'center',
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
          style={{
            padding:
              '8px 12px',
            borderRadius:
              '8px',
            border:
              '1px solid var(--line)',
            fontSize:
              '11px',
            minWidth:
              '260px',
            outline:
              'none',
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
          }}
        >
          <option value="">
            كل أنواع العقود
          </option>

          {typesList.map(
            (
              type: any,
              i: number
            ) => (
              <option
                key={i}
                value={type}
              >
                {type}
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
          }}
        >
          <option value="">
            فئة السن (الكل)
          </option>

          <option value="60_plus">
            فوق السن (60+)
          </option>

          <option value="50_59">
            من 50 إلى 59
          </option>

          <option value="30_49">
            من 30 إلى 49
          </option>

          <option value="under_30">
            أقل من 30
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
            marginRight:
              'auto',
            fontSize:
              '11px',
            fontWeight:
              'bold',
          }}
        >
          النتائج:{' '}
          {finalTableEmployees.length.toLocaleString(
            'en-US'
          )}
        </div>
      </div>

      {/* ========================================================
          TABLE
      ======================================================== */}

      <div
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
              fontWeight:
                'bold',
              color:
                'var(--muted)',
            }}
          >
            جاري تحميل بيانات الموظفين...
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
                whiteSpace:
                  'nowrap',
                fontSize:
                  '11.5px',
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
                    <input
                      type="checkbox"
                      checked={
                        finalTableEmployees.length >
                          0 &&
                        selectedEmpIds.length ===
                          finalTableEmployees.length
                      }
                      onChange={(
                        e
                      ) => {
                        setSelectedEmpIds(
                          e.target.checked
                            ? finalTableEmployees.map(
                                (
                                  emp: any
                                ) =>
                                  getEmployeeCode(
                                    emp
                                  )
                              )
                            : []
                        );
                      }}
                    />
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
                    الوظيفة
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
                    الإدارة
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
                    السن
                  </th>

                  <th
                    style={{
                      padding:
                        '12px',
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
                    const code =
                      getEmployeeCode(
                        emp
                      );

                    const employeeId =
                      getEmployeeId(
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

                    const contractType =
                      getField(
                        emp,
                        'contract_type',
                        'ContractType'
                      );

                    const contractEnd =
                      getField(
                        emp,
                        'contract_end_date',
                        'ContractEndDate'
                      );

                    const missing =
                      !nationalId ||
                      !mobile;

                    return (
                      <tr
                        key={
                          employeeId ||
                          code
                        }
                        style={{
                          borderBottom:
                            '1px solid var(--line)',
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
                              code
                            )}
                            onChange={(
                              e
                            ) =>
                              setSelectedEmpIds(
                                e.target
                                  .checked
                                  ? [
                                      ...selectedEmpIds,
                                      code,
                                    ]
                                  : selectedEmpIds.filter(
                                      (
                                        id
                                      ) =>
                                        id !==
                                        code
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
                            color:
                              'var(--brass-600, #0d9488)',
                            fontFamily:
                              'monospace',
                          }}
                        >
                          {code}
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

                          {missing && (
                            <span
                              title="ناقص الرقم القومي أو الموبايل"
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
                          ) ||
                            '—'}
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
                          ) ||
                            '—'}
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
                          ) ||
                            '—'}
                        </td>

                        <td
                          style={{
                            padding:
                              '10px',
                            fontWeight:
                              'bold',
                          }}
                        >
                          {contractType ||
                            '—'}
                        </td>

                        <td
                          style={{
                            padding:
                              '10px',
                          }}
                        >
                          {getContractStatusBadge(
                            contractType,
                            contractEnd
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
                                background:
                                  'transparent',
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

      {/* ========================================================
          PROFILE MODAL
      ======================================================== */}

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
                '650px',
              maxWidth:
                '100%',
              background:
                '#fff',
              borderRadius:
                '16px',
              padding:
                '24px',
              maxHeight:
                '90vh',
              overflowY:
                'auto',
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
                  '18px',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize:
                    '17px',
                  fontWeight:
                    '800',
                }}
              >
                👤 الملف الوظيفي
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
                  border: 0,
                  color:
                    '#dc2626',
                  padding:
                    '6px 12px',
                  borderRadius:
                    '6px',
                  fontWeight:
                    'bold',
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
              <div>
                <strong>
                  EmployeeID:
                </strong>{' '}
                {getEmployeeId(
                  profileEmp
                ) || '—'}
              </div>

              <div>
                <strong>
                  الكود:
                </strong>{' '}
                {getEmployeeCode(
                  profileEmp
                ) || '—'}
              </div>

              <div>
                <strong>
                  الاسم:
                </strong>{' '}
                {getEmployeeName(
                  profileEmp
                ) || '—'}
              </div>

              <div>
                <strong>
                  الرقم القومي:
                </strong>{' '}
                {getNationalId(
                  profileEmp
                ) || 'غير مسجل'}
              </div>

              <div>
                <strong>
                  تاريخ الميلاد:
                </strong>{' '}
                {getField(
                  profileEmp,
                  'birth_date',
                  'BirthDate'
                ) || 'غير مسجل'}
              </div>

              <div>
                <strong>
                  السن:
                </strong>{' '}
                {getEmployeeAge(
                  profileEmp
                ) ?? '—'}
              </div>

              <div>
                <strong>
                  الإدارة:
                </strong>{' '}
                {getField(
                  profileEmp,
                  'department',
                  'Department'
                ) || '—'}
              </div>

              <div>
                <strong>
                  الشركة:
                </strong>{' '}
                {getField(
                  profileEmp,
                  'company',
                  'Company'
                ) || '—'}
              </div>

              <div>
                <strong>
                  الوظيفة:
                </strong>{' '}
                {getField(
                  profileEmp,
                  'job_title',
                  'JobTitle'
                ) || '—'}
              </div>

              <div>
                <strong>
                  الموبايل:
                </strong>{' '}
                {getField(
                  profileEmp,
                  'mobile',
                  'Mobile'
                ) || 'غير مسجل'}
              </div>

              <div>
                <strong>
                  تاريخ التعيين:
                </strong>{' '}
                {getField(
                  profileEmp,
                  'hiring_date',
                  'HiringDate'
                ) || '—'}
              </div>

              <div>
                <strong>
                  نوع العقد:
                </strong>{' '}
                {getField(
                  profileEmp,
                  'contract_type',
                  'ContractType'
                ) || '—'}
              </div>

              <div>
                <strong>
                  نهاية العقد:
                </strong>{' '}
                {getField(
                  profileEmp,
                  'contract_end_date',
                  'ContractEndDate'
                ) || '—'}
              </div>

              <div>
                <strong>
                  الحالة:
                </strong>{' '}
                {getField(
                  profileEmp,
                  'status',
                  'Status'
                ) || '—'}
              </div>
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
                    'var(--brass-600, #0d9488)',
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

      {/* ========================================================
          TERMINATION MODAL
      ======================================================== */}

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
                  '18px',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  color:
                    'var(--stamp-red)',
                }}
              >
                🚫 إنهاء خدمة
              </h3>

              <button
                onClick={() => {
                  setShowTermModal(
                    false
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
                  padding:
                    '10px',
                  borderRadius:
                    '8px',
                  border:
                    '1px solid var(--line)',
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
                      maxHeight:
                        '180px',
                      overflowY:
                        'auto',
                    }}
                  >
                    {termSearchResults.map(
                      (
                        emp: any,
                        index: number
                      ) => (
                        <div
                          key={
                            getEmployeeId(
                              emp
                            ) ||
                            index
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
                  }
                  {' — '}
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
                  border:
                    '1px solid var(--line)',
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
                value={
                  termDate
                }
                onChange={(e) =>
                  setTermDate(
                    e.target.value
                  )
                }
                required
                style={{
                  padding:
                    '9px',
                  borderRadius:
                    '8px',
                  border:
                    '1px solid var(--line)',
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
                    borderRadius:
                      '8px',
                    border:
                      '1px solid var(--line)',
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

      {/* ========================================================
          BULK TRANSFER MODAL
      ======================================================== */}

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
                  margin: 0,
                }}
              >
                🔄 النقل المجمع
              </h3>

              <button
                onClick={() =>
                  setShowBulkTransferModal(
                    false
                  )
                }
              >
                إغلاق ✕
              </button>
            </div>

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
                      key={i}
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
                      key={i}
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
                  style={{
                    background:
                      '#2563eb',
                    color:
                      '#fff',
                    border: 0,
                    padding:
                      '9px 16px',
                    borderRadius:
                      '8px',
                    fontWeight:
                      'bold',
                  }}
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

      {/* ========================================================
          EDIT MODAL
      ======================================================== */}

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
                '850px',
              maxWidth:
                '100%',
              maxHeight:
                '90vh',
              overflowY:
                'auto',
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
                  '20px',
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize:
                      '18px',
                    fontWeight:
                      '800',
                  }}
                >
                  ✏️ تعديل بيانات الموظف
                </h3>

                <div
                  style={{
                    marginTop:
                      '4px',
                    fontSize:
                      '11px',
                    color:
                      '#64748b',
                  }}
                >
                  الكود:{' '}
                  <strong>
                    {
                      getEmployeeCode(
                        editData.emp
                      )
                    }
                  </strong>
                  {'  |  '}
                  EmployeeID:{' '}
                  <strong>
                    {
                      getEmployeeId(
                        editData.emp
                      ) || '—'
                    }
                  </strong>
                </div>
              </div>

              <button
                onClick={() =>
                  setEditData(
                    null
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
                  fontWeight:
                    'bold',
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
                  background:
                    '#f8fafc',
                  border:
                    '1px solid #e2e8f0',
                  borderRadius:
                    '12px',
                  padding:
                    '16px',
                  marginBottom:
                    '16px',
                }}
              >
                <h4
                  style={{
                    margin:
                      '0 0 14px',
                    color:
                      '#0d9488',
                    fontSize:
                      '14px',
                  }}
                >
                  بيانات الموظف
                </h4>

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
                      key:
                        'employee_code',
                      alt:
                        'EmployeeCode',
                      disabled:
                        true,
                    },
                    {
                      label:
                        'الاسم',
                      key:
                        'employee_name',
                      alt:
                        'EmployeeName',
                    },
                    {
                      label:
                        'الرقم القومي',
                      key:
                        'national_id',
                      alt:
                        'NationalID',
                    },
                    {
                      label:
                        'تاريخ الميلاد',
                      key:
                        'birth_date',
                      alt:
                        'BirthDate',
                    },
                    {
                      label:
                        'السن',
                      key:
                        'age',
                      alt:
                        'Age',
                    },
                    {
                      label:
                        'الإدارة',
                      key:
                        'department',
                      alt:
                        'Department',
                    },
                    {
                      label:
                        'الشركة',
                      key:
                        'company',
                      alt:
                        'Company',
                    },
                    {
                      label:
                        'الوظيفة',
                      key:
                        'job_title',
                      alt:
                        'JobTitle',
                    },
                    {
                      label:
                        'الموبايل',
                      key:
                        'mobile',
                      alt:
                        'Mobile',
                    },
                    {
                      label:
                        'البريد الإلكتروني',
                      key:
                        'email',
                      alt:
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
                            fontWeight:
                              'bold',
                            marginBottom:
                              '6px',
                          }}
                        >
                          {
                            field.label
                          }
                        </label>

                        <input
                          type={
                            field.key ===
                            'birth_date'
                              ? 'date'
                              : 'text'
                          }
                          disabled={
                            field.disabled
                          }
                          value={
                            getField(
                              editData.emp,
                              field.key,
                              field.alt
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
                                  [field.key]:
                                    e.target
                                      .value,
                                  [field.alt]:
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
                              '1px solid #e2e8f0',
                            boxSizing:
                              'border-box',
                            background:
                              field.disabled
                                ? '#f1f5f9'
                                : '#fff',
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
                        fontWeight:
                          'bold',
                        marginBottom:
                          '6px',
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
                      onChange={(e) =>
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
                          '1px solid #e2e8f0',
                        boxSizing:
                          'border-box',
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  background:
                    '#f8fafc',
                  border:
                    '1px solid #e2e8f0',
                  borderRadius:
                    '12px',
                  padding:
                    '16px',
                }}
              >
                <h4
                  style={{
                    margin:
                      '0 0 14px',
                    color:
                      '#2563eb',
                    fontSize:
                      '14px',
                  }}
                >
                  بيانات العقد
                </h4>

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
                  <div>
                    <label
                      style={{
                        display:
                          'block',
                        fontSize:
                          '11px',
                        fontWeight:
                          'bold',
                        marginBottom:
                          '6px',
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
                      onChange={(e) =>
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
                          '1px solid #e2e8f0',
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
                        fontWeight:
                          'bold',
                        marginBottom:
                          '6px',
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
                      onChange={(e) =>
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
                          '1px solid #e2e8f0',
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
                        fontWeight:
                          'bold',
                        marginBottom:
                          '6px',
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
                      onChange={(e) =>
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
                          '1px solid #e2e8f0',
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
                    setEditData(
                      null
                    )
                  }
                  style={{
                    padding:
                      '9px 18px',
                    borderRadius:
                      '8px',
                    border:
                      '1px solid #e2e8f0',
                    background:
                      '#fff',
                    cursor:
                      'pointer',
                    fontWeight:
                      'bold',
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
                      '9px 18px',
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

      {/* ========================================================
          ADD EMPLOYEE MODAL
      ======================================================== */}

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
              maxHeight:
                '90vh',
              overflowY:
                'auto',
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
                  margin: 0,
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
                  placeholder="اسم الموظف *"
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

                <button
                  type="submit"
                  style={{
                    background:
                      '#0d9488',
                    color:
                      '#fff',
                    border: 0,
                    padding:
                      '9px 18px',
                    borderRadius:
                      '8px',
                    fontWeight:
                      'bold',
                    cursor:
                      'pointer',
                  }}
                >
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
