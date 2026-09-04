'use client';

import { useState, useEffect, useMemo } from 'react';
import { navigateTo } from '@/lib/navigation';
import { useAppData } from '@/lib/DataContext';
import KpiCard from './KpiCard';
import Stamp from './Stamp';

const MONTHS_LIST = [
  { value: '1', label: 'يناير (01)' },
  { value: '2', label: 'فبراير (02)' },
  { value: '3', label: 'مارس (03)' },
  { value: '4', label: 'أبريل (04)' },
  { value: '5', label: 'مايو (05)' },
  { value: '6', label: 'يونيو (06)' },
  { value: '7', label: 'يوليو (07)' },
  { value: '8', label: 'أغسطس (08)' },
  { value: '9', label: 'سبتمبر (09)' },
  { value: '10', label: 'أكتوبر (10)' },
  { value: '11', label: 'نوفمبر (11)' },
  { value: '12', label: 'ديسمبر (12)' },
];

const MONTH_NAMES = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
];

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const DAY_MS = 1000 * 60 * 60 * 24;

function firstValue(...values: any[]) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
    ) {
      return value;
    }
  }
  return '';
}

function normalizeText(value: any) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeStatus(value: any) {
  const v = normalizeText(value);

  if (
    !v ||
    v === 'active' ||
    v === 'نشط' ||
    v === 'ساري' ||
    v === 'valid'
  ) {
    return 'active';
  }

  if (
    v === 'inactive' ||
    v === 'غير نشط' ||
    v === 'terminated' ||
    v === 'منتهي خدمة' ||
    v === 'متوقف'
  ) {
    return 'inactive';
  }

  return v;
}

function isApprovedRenewal(req: any) {
  const status = normalizeText(
    firstValue(
      req?.status,
      req?.renewal_status,
      req?.RenewalStatus
    )
  );

  return (
    status === 'approved' ||
    status === 'معتمد' ||
    status === 'مقبول'
  );
}

function isPendingRenewal(req: any) {
  const status = normalizeText(
    firstValue(
      req?.status,
      req?.renewal_status,
      req?.RenewalStatus
    )
  );

  return (
    status === 'pending' ||
    status === 'قيد الانتظار'
  );
}

function getEmployeeId(emp: any) {
  return String(
    firstValue(
      emp?.employee_id,
      emp?.EmployeeID,
      emp?.employeeId
    )
  ).trim();
}

function getEmployeeCode(emp: any) {
  return String(
    firstValue(
      emp?.employee_code,
      emp?.EmployeeCode,
      emp?.employeeCode,
      emp?.code,
      emp?.Code
    )
  ).trim();
}

function getEmployeeName(emp: any) {
  return firstValue(
    emp?.employee_name,
    emp?.EmployeeName,
    emp?.employeeName,
    emp?.ArabicName,
    emp?.name,
    emp?.Name
  );
}

function getDepartment(emp: any) {
  return firstValue(
    emp?.department,
    emp?.Department,
    emp?.dept,
    emp?.Dept,
    'غير محدد'
  );
}

function getJobTitle(emp: any) {
  return firstValue(
    emp?.job_title,
    emp?.JobTitle,
    emp?.jobTitle,
    emp?.Job,
    emp?.job
  );
}

function getCompany(emp: any) {
  return firstValue(
    emp?.company,
    emp?.Company
  );
}

function getNationalId(emp: any) {
  return String(
    firstValue(
      emp?.national_id,
      emp?.NationalID,
      emp?.nationalId,
      emp?.NationalId
    )
  ).trim();
}

function getMobile(emp: any) {
  return firstValue(
    emp?.mobile,
    emp?.Mobile,
    emp?.phone,
    emp?.Phone
  );
}

function getContractType(emp: any) {
  return String(
    firstValue(
      emp?.contract_type,
      emp?.ContractType,
      emp?.contractType
    )
  ).trim();
}

function getContractStart(emp: any) {
  return firstValue(
    emp?.contract_start_date,
    emp?.ContractStartDate,
    emp?.contractStartDate
  );
}

function getContractEnd(emp: any) {
  return firstValue(
    emp?.contract_end_date,
    emp?.ContractEndDate,
    emp?.contractEndDate
  );
}

function getContractStatus(emp: any) {
  return firstValue(
    emp?.contract_status,
    emp?.ContractStatus,
    emp?.status,
    emp?.Status,
    'Active'
  );
}

function getRenewalEmployeeCode(req: any) {
  return String(
    firstValue(
      req?.employee_code,
      req?.EmployeeCode,
      req?.employeeCode,
      req?.employee_id,
      req?.EmployeeID
    )
  ).trim();
}

function parseDate(value: any): Date | null {
  if (value instanceof Date) {
    return isNaN(value.getTime())
      ? null
      : new Date(value);
  }

  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return null;
  }

  const raw = String(value).trim();

  if (!raw) return null;

  const direct = new Date(raw);

  if (!isNaN(direct.getTime())) {
    return direct;
  }

  const clean = raw
    .split('T')[0]
    .trim();

  const parts = clean
    .split(/[\/\-\s]/)
    .filter(Boolean);

  if (parts.length >= 3) {
    let day = Number(parts[0]);
    let month = Number(parts[1]);
    let year = Number(parts[2]);

    if (year < 100) {
      year += year >= 30
        ? 1900
        : 2000;
    }

    if (
      Number.isInteger(day) &&
      Number.isInteger(month) &&
      Number.isInteger(year) &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      const result = new Date(
        year,
        month - 1,
        day
      );

      if (
        result.getFullYear() === year &&
        result.getMonth() === month - 1 &&
        result.getDate() === day
      ) {
        return result;
      }
    }
  }

  return null;
}

function getDaysRemaining(endDateStr: any) {
  const end = parseDate(endDateStr);

  if (!end) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const normalizedEnd = new Date(end);
  normalizedEnd.setHours(0, 0, 0, 0);

  return Math.ceil(
    (normalizedEnd.getTime() -
      today.getTime()) /
      DAY_MS
  );
}

function getAge60Info(nationalId: string) {
  const idStr = String(nationalId || '')
    .replace(/\D/g, '');

  if (idStr.length !== 14) {
    return null;
  }

  const centuryDigit = idStr.charAt(0);

  if (
    centuryDigit !== '2' &&
    centuryDigit !== '3'
  ) {
    return null;
  }

  const yearDigits = idStr.substring(1, 3);
  const monthDigits = idStr.substring(3, 5);
  const dayDigits = idStr.substring(5, 7);

  const month = Number(monthDigits);
  const day = Number(dayDigits);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const fullYear = Number(
    (centuryDigit === '3'
      ? '20'
      : '19') + yearDigits
  );

  const birthDate = new Date(
    fullYear,
    month - 1,
    day
  );

  if (
    birthDate.getFullYear() !== fullYear ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return null;
  }

  const age60Date = new Date(birthDate);

  age60Date.setFullYear(
    age60Date.getFullYear() + 60
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const normalizedAge60 =
    new Date(age60Date);

  normalizedAge60.setHours(
    0,
    0,
    0,
    0
  );

  const daysUntil60 = Math.ceil(
    (normalizedAge60.getTime() -
      today.getTime()) /
      DAY_MS
  );

  const formatDate = (date: Date) =>
    `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;

  return {
    birthDate: formatDate(birthDate),
    age60Date: formatDate(age60Date),
    age60Year: String(
      age60Date.getFullYear()
    ),
    age60Month: String(
      age60Date.getMonth() + 1
    ),
    daysUntil60,
  };
}

function getRenewalMonths(req: any) {
  const value = firstValue(
    req?.renewal_months,
    req?.RenewalMonths,
    req?.renewalMonths
  );

  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

export default function DashboardPage() {
  const {
    employees: allEmployees = [],
    renewals: allRenewals = [],
    loading,
  } = useAppData();

  const [filterCompany, setFilterCompany] =
    useState('');
  const [filterDept, setFilterDept] =
    useState('');
  const [currentTime, setCurrentTime] =
    useState(new Date());

  const [
    showTotalEmpsModal,
    setShowTotalEmpsModal,
  ] = useState(false);

  const [
    showExpiringSoonModal,
    setShowExpiringSoonModal,
  ] = useState(false);

  const [showAgeModal, setShowAgeModal] =
    useState(false);

  const [
    showShortTermModal,
    setShowShortTermModal,
  ] = useState(false);

  const [
    showMissingDataModal,
    setShowMissingDataModal,
  ] = useState(false);

  const [
    ageModalFilterMode,
    setAgeModalFilterMode,
  ] = useState<
    '60days' | 'byMonth' | 'allYear'
  >('60days');

  const [
    ageModalSelectedMonth,
    setAgeModalSelectedMonth,
  ] = useState(
    String(new Date().getMonth() + 1)
  );

  const [
    ageModalSelectedYear,
    setAgeModalSelectedYear,
  ] = useState(
    String(new Date().getFullYear())
  );

  const [
    selectedMonthDetails,
    setSelectedMonthDetails,
  ] = useState<{
    name: string;
    emps: any[];
  } | null>(null);

  const [
    selectedDonutDetails,
    setSelectedDonutDetails,
  ] = useState<{
    title: string;
    emps: any[];
  } | null>(null);

  const [
    selectedDeptDetails,
    setSelectedDeptDetails,
  ] = useState<{
    name: string;
    emps: any[];
  } | null>(null);

  const [
    selectedShortTermDept,
    setSelectedShortTermDept,
  ] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(
      () => setCurrentTime(new Date()),
      1000
    );

    return () => clearInterval(timer);
  }, []);

  const companiesList = useMemo(() => {
    return Array.from(
      new Set(
        allEmployees
          .map((e: any) => getCompany(e))
          .filter(Boolean)
      )
    ).sort((a: any, b: any) =>
      String(a).localeCompare(
        String(b),
        'ar'
      )
    );
  }, [allEmployees]);

  const deptsList = useMemo(() => {
    return Array.from(
      new Set(
        allEmployees
          .map((e: any) =>
            getDepartment(e)
          )
          .filter(Boolean)
      )
    ).sort((a: any, b: any) =>
      String(a).localeCompare(
        String(b),
        'ar'
      )
    );
  }, [allEmployees]);

  const dashboardData = useMemo(() => {
    const currentYear =
      new Date().getFullYear();

    const activeEmployeesOnly =
      allEmployees.filter((emp: any) => {
        const employeeStatus =
          normalizeStatus(
            firstValue(
              emp?.status,
              emp?.Status,
              'Active'
            )
          );

        const department =
          getDepartment(emp);

        return (
          employeeStatus === 'active' &&
          department !==
            'تحويلات تحت الاعتماد'
        );
      });

    const normalizedCompanyFilter =
      normalizeText(filterCompany);

    const normalizedDeptFilter =
      normalizeText(filterDept);

    const filteredEmps =
      activeEmployeesOnly.filter(
        (emp: any) => {
          const company = normalizeText(
            getCompany(emp)
          );

          const department =
            normalizeText(
              getDepartment(emp)
            );

          return (
            (!normalizedCompanyFilter ||
              company.includes(
                normalizedCompanyFilter
              )) &&
            (!normalizedDeptFilter ||
              department.includes(
                normalizedDeptFilter
              ))
          );
        }
      );

    const filteredRens =
      allRenewals.filter((req: any) => {
        const company =
          normalizeText(
            firstValue(
              req?.company,
              req?.Company
            )
          );

        const department =
          normalizeText(
            firstValue(
              req?.department,
              req?.Department
            )
          );

        return (
          (!normalizedCompanyFilter ||
            company.includes(
              normalizedCompanyFilter
            )) &&
          (!normalizedDeptFilter ||
            department.includes(
              normalizedDeptFilter
            ))
        );
      });

    const renewalsByEmployee =
      new Map<string, any[]>();

    filteredRens.forEach(
      (req: any) => {
        const code =
          getRenewalEmployeeCode(req);

        if (!code) return;

        const current =
          renewalsByEmployee.get(code);

        if (current) {
          current.push(req);
        } else {
          renewalsByEmployee.set(
            code,
            [req]
          );
        }
      }
    );

    let expired = 0;
    let expiring = 0;

    const deptsCount: Record<
      string,
      number
    > = {};

    const alerts: any[] = [];
    const expiringSoonList: any[] = [];
    const allTurning60List: any[] = [];
    const shortTermByDept: Record<
      string,
      any[]
    > = {};
    const missingDataList: any[] = [];

    const permEmps: any[] = [];
    const fixedEmps: any[] = [];
    const rewardEmps: any[] = [];
    const aboveAgeEmps: any[] = [];
    const shortTermEmpsList: any[] =
      [];

    const contractsByMonth =
      MONTH_NAMES.map((name) => ({
        name,
        count: 0,
        emps: [] as any[],
      }));

    filteredEmps.forEach(
      (emp: any) => {
        const type =
          getContractType(emp);

        const typeNormalized =
          normalizeText(type);

        const dept =
          getDepartment(emp);

        const contractStatus =
          normalizeStatus(
            getContractStatus(emp)
          );

        const nationalId =
          getNationalId(emp);

        const mobile = getMobile(emp);

        const contractStart =
          getContractStart(emp);

        const contractEnd =
          getContractEnd(emp);

        deptsCount[dept] =
          (deptsCount[dept] || 0) +
          1;

        if (!nationalId || !mobile) {
          missingDataList.push(emp);
        }

        const employeeCode =
          getEmployeeCode(emp);

        const empRens =
          employeeCode
            ? renewalsByEmployee.get(
                employeeCode
              ) || []
            : [];

        const approvedRens =
          empRens.filter(
            isApprovedRenewal
          );

        const isPermanent =
          typeNormalized === 'دائم' ||
          typeNormalized ===
            'permanent' ||
          typeNormalized.includes(
            'غير محدد'
          );

        const isReward =
          typeNormalized.includes(
            'مكافأة'
          ) ||
          typeNormalized.includes(
            'مكافاه'
          ) ||
          typeNormalized.includes(
            'reward'
          );

        const isAboveAgeType =
          typeNormalized.includes(
            'فوق السن'
          ) ||
          typeNormalized.includes(
            'above age'
          );

        const ageInfo =
          getAge60Info(
            nationalId
          );

        if (
          isPermanent &&
          ageInfo
        ) {
          allTurning60List.push({
            ...emp,
            birthDate:
              ageInfo.birthDate,
            age60Date:
              ageInfo.age60Date,
            age60Month:
              ageInfo.age60Month,
            age60Year:
              ageInfo.age60Year,
            daysLeft:
              ageInfo.daysUntil60,
          });
        }

        let isShort = false;
        let historyDesc = '';

        if (
          typeNormalized ===
            'محدد المدة' ||
          typeNormalized ===
            'fixed term' ||
          typeNormalized ===
            'fixed_term'
        ) {
          if (
            approvedRens.length > 0
          ) {
            const sortedApproved = [
              ...approvedRens,
            ].sort((a, b) => {
              const dateA =
                parseDate(
                  firstValue(
                    a?.request_date,
                    a?.RequestDate,
                    a?.created_at,
                    a?.CreatedAt
                  )
                );

              const dateB =
                parseDate(
                  firstValue(
                    b?.request_date,
                    b?.RequestDate,
                    b?.created_at,
                    b?.CreatedAt
                  )
                );

              return (
                (dateA?.getTime() ||
                  0) -
                (dateB?.getTime() ||
                  0)
              );
            });

            const lastRen =
              sortedApproved[
                sortedApproved.length -
                  1
              ];

            const lastRenewalMonths =
              getRenewalMonths(
                lastRen
              );

            if (
              lastRenewalMonths !==
                null &&
              lastRenewalMonths > 0 &&
              lastRenewalMonths < 12
            ) {
              isShort = true;

              const historyArr =
                sortedApproved
                  .map(
                    (r: any) => {
                      const months =
                        getRenewalMonths(
                          r
                        );

                      return months !==
                        null
                        ? `${months} ش`
                        : null;
                    }
                  )
                  .filter(Boolean);

              if (
                historyArr.length > 0
              ) {
                historyDesc =
                  `سجل التجديدات: (${historyArr.join(
                    ' + '
                  )})`;
              } else {
                historyDesc =
                  'تجديد قصير المدة';
              }
            }
          } else if (
            contractStart &&
            contractEnd
          ) {
            const start =
              parseDate(
                contractStart
              );

            const end =
              parseDate(
                contractEnd
              );

            if (start && end) {
              const diffDays =
                Math.ceil(
                  (end.getTime() -
                    start.getTime()) /
                    DAY_MS
                );

              if (
                diffDays > 0 &&
                diffDays <= 360
              ) {
                isShort = true;

                const diffMonths =
                  Math.round(
                    diffDays / 30
                  ) || 1;

                historyDesc =
                  `تعيين جديد (${diffMonths} شهور)`;
              }
            }
          }
        }

        if (isPermanent) {
          permEmps.push(emp);
        } else if (isReward) {
          rewardEmps.push(emp);
        } else if (
          isAboveAgeType
        ) {
          aboveAgeEmps.push(emp);
        } else if (isShort) {
          shortTermEmpsList.push(
            emp
          );

          if (
            !shortTermByDept[dept]
          ) {
            shortTermByDept[dept] =
              [];
          }

          shortTermByDept[dept].push({
            ...emp,
            historyDesc,
          });
        } else {
          fixedEmps.push(emp);
        }

        if (
          contractStart &&
          contractStatus ===
            'active'
        ) {
          const startDate =
            parseDate(
              contractStart
            );

          if (startDate) {
            const monthIndex =
              startDate.getMonth();

            if (
              startDate.getFullYear() ===
                currentYear &&
              monthIndex >= 0 &&
              monthIndex < 9
            ) {
              contractsByMonth[
                monthIndex
              ].count++;

              contractsByMonth[
                monthIndex
              ].emps.push(emp);
            }
          }
        }

        if (
          contractStatus ===
          'active'
        ) {
          const days =
            getDaysRemaining(
              contractEnd
            );

          if (days !== null) {
            if (
              days < 0 &&
              !isPermanent
            ) {
              expired++;

              alerts.push({
                ...emp,
                days,
                status:
                  'expired',
              });
            } else if (
              days >= 0 &&
              days <= 60
            ) {
              const isTurning60In60Days =
                !!ageInfo &&
                ageInfo.daysUntil60 >=
                  0 &&
                ageInfo.daysUntil60 <=
                  60;

              if (
                !isPermanent ||
                isTurning60In60Days
              ) {
                expiring++;

                alerts.push({
                  ...emp,
                  days,
                  status:
                    'expiring',
                });

                expiringSoonList.push(
                  {
                    ...emp,
                    days,
                    isPermanentTurning60:
                      isPermanent,
                  }
                );
              }
            }
          }
        }
      }
    );

    alerts.sort(
      (a, b) => a.days - b.days
    );

    expiringSoonList.sort(
      (a, b) => a.days - b.days
    );

    allTurning60List.sort(
      (a, b) =>
        a.daysLeft -
        b.daysLeft
    );

    const shortTermList =
      Object.entries(
        shortTermByDept
      )
        .map(
          ([deptName, emps]) => ({
            deptName,
            emps: [
              ...emps,
            ].sort(
              (a, b) =>
                (getDaysRemaining(
                  getContractEnd(a)
                ) ?? 9999) -
                (getDaysRemaining(
                  getContractEnd(b)
                ) ?? 9999)
            ),
          })
        )
        .sort(
          (a, b) =>
            b.emps.length -
            a.emps.length
        );

    const topDepts =
      Object.entries(deptsCount)
        .sort(
          (a, b) => b[1] - a[1]
        )
        .slice(0, 5)
        .map(
          ([name, count]) => ({
            name,
            count,
          })
        );

    const pendingRequests =
      filteredRens.filter(
        isPendingRenewal
      );

    const waitingSign =
      filteredRens.filter(
        (r: any) => {
          const status =
            normalizeText(
              firstValue(
                r?.status,
                r?.renewal_status,
                r?.RenewalStatus
              )
            );

          const signatureStatus =
            normalizeText(
              firstValue(
                r?.signature_status,
                r?.SignatureStatus
              )
            );

          return (
            (status ===
              'approved' ||
              status === 'معتمد') &&
            signatureStatus !==
              'تم التوقيع'
          );
        }
      );

    const turning60In60DaysCount =
      allTurning60List.filter(
        (e) =>
          e.daysLeft >= 0 &&
          e.daysLeft <= 60
      ).length;

    return {
      filteredEmps,

      totalEmps:
        filteredEmps.length,

      permCount:
        permEmps.length,

      fixedCount:
        fixedEmps.length,

      aboveAgeCount:
        aboveAgeEmps.length,

      rewardCount:
        rewardEmps.length,

      shortTermTotal:
        shortTermEmpsList.length,

      permEmps,
      fixedEmps,
      rewardEmps,
      aboveAgeEmps,
      shortTermEmpsList,

      expiredCount: expired,
      expiringSoonCount:
        expiring,

      expiringSoonList,

      pendingCount:
        pendingRequests.length,

      waitingSignCount:
        waitingSign.length,

      missingDataList,

      allTurning60List,

      turning60In60DaysCount,

      topDepts,

      urgentAlerts:
        alerts.slice(0, 20),

      contractsByMonth,

      shortTermList,
    };
  }, [
    allEmployees,
    allRenewals,
    filterCompany,
    filterDept,
  ]);

  const displayTurning60List =
    useMemo(() => {
      return dashboardData.allTurning60List.filter(
        (emp: any) => {
          if (
            ageModalFilterMode ===
            '60days'
          ) {
            return (
              emp.daysLeft >= 0 &&
              emp.daysLeft <= 60
            );
          }

          if (
            ageModalFilterMode ===
            'byMonth'
          ) {
            const matchM =
              !ageModalSelectedMonth ||
              emp.age60Month ===
                ageModalSelectedMonth;

            const matchY =
              !ageModalSelectedYear ||
              emp.age60Year ===
                ageModalSelectedYear;

            return matchM && matchY;
          }

          if (
            ageModalFilterMode ===
            'allYear'
          ) {
            return (
              !ageModalSelectedYear ||
              emp.age60Year ===
                ageModalSelectedYear
            );
          }

          return true;
        }
      );
    }, [
      dashboardData.allTurning60List,
      ageModalFilterMode,
      ageModalSelectedMonth,
      ageModalSelectedYear,
    ]);

  // ============================================================
  // مهم جداً:
  // نخزن EmployeeID + EmployeeCode معاً
  // عشان EmployeesPage يفتح السجل المطلوب مباشرة
  // ============================================================

  const handleRowClick = (
    rawCode: any,
    targetPage:
      | 'contracts'
      | 'employees' = 'contracts',
    employee?: any
  ) => {
    const code =
      String(rawCode || '').trim();

    if (!code) return;

    setShowTotalEmpsModal(
      false
    );
    setShowExpiringSoonModal(
      false
    );
    setShowAgeModal(false);
    setShowShortTermModal(false);
    setShowMissingDataModal(
      false
    );

    setSelectedMonthDetails(
      null
    );
    setSelectedDonutDetails(
      null
    );
    setSelectedDeptDetails(
      null
    );

    const employeeId =
      getEmployeeId(
        employee
      );

    const employeeCode =
      getEmployeeCode(
        employee
      ) || code;

    // مفاتيح الربط الجديدة
    localStorage.setItem(
      'selectedEmployeeCode',
      employeeCode
    );

    localStorage.setItem(
      'employeeSearch',
      employeeCode
    );

    localStorage.setItem(
      'jumpSearch',
      employeeCode
    );

    if (employeeId) {
      localStorage.setItem(
        'selectedEmployeeId',
        employeeId
      );

      localStorage.setItem(
        'employeeId',
        employeeId
      );
    }

    // sessionStorage كنسخة احتياطية
    sessionStorage.setItem(
      'employeeSearch',
      employeeCode
    );

    sessionStorage.setItem(
      'jumpSearch',
      employeeCode
    );

    if (employeeId) {
      sessionStorage.setItem(
        'selectedEmployeeId',
        employeeId
      );
    }

    navigateTo(targetPage);
  };

  const dateFormatted =
    currentTime.toLocaleDateString(
      'ar-EG',
      {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }
    );

  const timeFormatted =
    currentTime.toLocaleTimeString(
      'en-US',
      {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }
    );

  const maxMonthCount =
    Math.max(
      ...(
        dashboardData?.contractsByMonth ||
        []
      ).map(
        (m: any) => m.count
      ),
      1
    );

  // ============================================================
  // الدونات - 5 فئات منفصلة فعلياً
  // ============================================================

  const totalContracts =
    dashboardData.permCount +
    dashboardData.fixedCount +
    dashboardData.rewardCount +
    dashboardData.aboveAgeCount +
    dashboardData.shortTermTotal;

  const p1 =
    totalContracts > 0
      ? (dashboardData.permCount /
          totalContracts) *
        100
      : 0;

  const p2 =
    p1 +
    (totalContracts > 0
      ? (dashboardData.fixedCount /
          totalContracts) *
        100
      : 0);

  const p3 =
    p2 +
    (totalContracts > 0
      ? (dashboardData.rewardCount /
          totalContracts) *
        100
      : 0);

  const p4 =
    p3 +
    (totalContracts > 0
      ? (dashboardData.aboveAgeCount /
          totalContracts) *
        100
      : 0);

  const donutGradient =
    totalContracts === 0
      ? 'conic-gradient(#e2e8f0 0% 100%)'
      : `conic-gradient(
          #10b981 0% ${p1}%,
          #2563eb ${p1}% ${p2}%,
          #f59e0b ${p2}% ${p3}%,
          #8b5cf6 ${p3}% ${p4}%,
          #06b6d4 ${p4}% 100%
        )`;

  return (
    <div
      className="flex flex-col gap-5"
      style={{
        direction: 'rtl',
        paddingBottom: '40px',
      }}
    >
      {/* رأس الصفحة */}

      <div
        className="card flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 sm:px-6 py-5"
        style={{
          background: '#fff',
          border:
            '1px solid #e2e8f0',
          borderRadius: '16px',
        }}
      >
        <div>
          <h2
            className="m-0 text-lg sm:text-xl font-black tracking-tight"
            style={{
              color: '#0f172a',
            }}
          >
            بوابة تجديد العقود
            لشركة المراسم الدولية
            والشركات الشقيقة
          </h2>

          <div
            className="flex items-center gap-3 mt-2 text-[12px] font-bold"
            style={{
              color: '#64748b',
            }}
          >
            <span>
              📅 {dateFormatted}
            </span>

            <span
              style={{
                color: '#cbd5e1',
              }}
            >
              |
            </span>

            <span
              className="font-mono"
              style={{
                color: '#2563eb',
              }}
            >
              ⏰ {timeFormatted}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            list="dashCompList"
            className="field"
            placeholder="🏢 كل الشركات (ابحث...)"
            value={filterCompany}
            onChange={(e) =>
              setFilterCompany(
                e.target.value
              )
            }
          />

          <datalist id="dashCompList">
            {companiesList.map(
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

          <input
            list="dashDeptList"
            className="field"
            placeholder="💼 كل الإدارات (ابحث...)"
            value={filterDept}
            onChange={(e) =>
              setFilterDept(
                e.target.value
              )
            }
          />

          <datalist id="dashDeptList">
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

          {(filterCompany ||
            filterDept) && (
            <button
              className="field font-bold"
              style={{
                background:
                  '#f1f5f9',
                cursor:
                  'pointer',
              }}
              onClick={() => {
                setFilterCompany('');
                setFilterDept('');
              }}
            >
              إعادة ضبط
            </button>
          )}
        </div>
      </div>

      {/* الكروت */}

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard
          loading={loading}
          tone="brass"
          title="إجمالي القوة"
          value={
            dashboardData.totalEmps
          }
          sub="عرض الكشف 👁️"
          icon="👥"
          onClick={() =>
            setShowTotalEmpsModal(
              true
            )
          }
        />

        <KpiCard
          loading={loading}
          tone="blue"
          title="طلبات معلقة"
          value={
            dashboardData.pendingCount
          }
          sub={`+ ${dashboardData.waitingSignCount} توقيع`}
          icon="⏳"
          onClick={() =>
            navigateTo('renewals')
          }
        />

        <KpiCard
          loading={loading}
          tone="blue"
          title="عقود مؤقتة"
          value={
            dashboardData.shortTermTotal
          }
          sub="عرض القائمة ⏱️"
          icon="⏱️"
          onClick={() =>
            setShowShortTermModal(
              true
            )
          }
        />

        <KpiCard
          loading={loading}
          tone="amber"
          title="تنتهي قريباً (0-60)"
          value={
            dashboardData.expiringSoonCount
          }
          sub="عرض القائمة 👁️"
          icon="📆"
          onClick={() =>
            setShowExpiringSoonModal(
              true
            )
          }
        />

        <KpiCard
          loading={loading}
          tone="red"
          title="عقود منتهية"
          value={
            dashboardData.expiredCount
          }
          sub="إدارة العقود 🚨"
          icon="🚨"
          onClick={() =>
            navigateTo('contracts')
          }
        />

        <KpiCard
          loading={loading}
          tone="amber"
          title="بلوغ الـ 60 (قريباً)"
          value={
            dashboardData.turning60In60DaysCount
          }
          sub="عرض الكشف/الفلاتر 🎂"
          icon="🎂"
          onClick={() =>
            setShowAgeModal(true)
          }
        />

        <KpiCard
          loading={loading}
          tone="red"
          title="نواقص بيانات"
          value={
            dashboardData
              .missingDataList
              .length
          }
          sub="عرض القائمة ⚠️"
          icon="⚠️"
          onClick={() =>
            setShowMissingDataModal(
              true
            )
          }
        />
      </div>

      {/* الرسومات */}

      <div className="grid lg:grid-cols-3 gap-5">
        <div
          className="card px-5 sm:px-6 py-5"
          style={{
            background: '#fff',
            border:
              '1px solid #e2e8f0',
            borderRadius: '16px',
          }}
        >
          <h4
            className="m-0 mb-5 text-[13.5px] font-black"
            style={{
              color: '#0f172a',
            }}
          >
            📊 أكبر 5 إدارات
            (اضغط لعرض الموظفين)
          </h4>

          <div className="flex flex-col gap-4">
            {dashboardData.topDepts.map(
              (
                dept: any,
                idx: number
              ) => {
                const max =
                  dashboardData
                    .topDepts[0]
                    ?.count || 1;

                const percentage =
                  (dept.count / max) *
                  100;

                const deptEmps =
                  dashboardData
                    .filteredEmps
                    .filter(
                      (e: any) =>
                        getDepartment(
                          e
                        ) ===
                        dept.name
                    );

                return (
                  <div
                    key={idx}
                    onClick={() =>
                      setSelectedDeptDetails(
                        {
                          name:
                            dept.name,
                          emps:
                            deptEmps,
                        }
                      )
                    }
                    className="cursor-pointer group p-1.5 rounded-lg hover:bg-slate-50 transition-all"
                  >
                    <div
                      className="flex justify-between text-[11px] font-bold mb-1.5"
                      style={{
                        color:
                          '#1e293b',
                      }}
                    >
                      <span className="group-hover:text-blue-600 transition-colors">
                        🏢 {dept.name}
                      </span>

                      <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[10px]">
                        {dept.count.toLocaleString(
                          'en-US'
                        )}{' '}
                        موظف
                      </span>
                    </div>

                    <div
                      className="w-full h-2 rounded-full overflow-hidden"
                      style={{
                        background:
                          '#f1f5f9',
                      }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-700 group-hover:brightness-110"
                        style={{
                          width: `${percentage}%`,
                          background:
                            'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                        }}
                      />
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* الرسم الشهري */}

        <div
          className="card px-5 sm:px-6 py-5 flex flex-col lg:col-span-2"
          style={{
            background: '#fff',
            border:
              '1px solid #e2e8f0',
            borderRadius: '16px',
          }}
        >
          <h4
            className="m-0 mb-6 text-[13.5px] font-black"
            style={{
              color: '#0f172a',
            }}
          >
            📈 التوزيع الشهري لبدايات
            العقود النشطة والمجددة —
            حتى سبتمبر
          </h4>

          <div
            className="flex-1 flex items-end gap-1.5 sm:gap-2 h-[150px] pb-4 border-b"
            style={{
              borderColor:
                '#e2e8f0',
            }}
          >
            {dashboardData.contractsByMonth.map(
              (
                month: any,
                idx: number
              ) => {
                const height =
                  maxMonthCount >
                  0
                    ? (month.count /
                        maxMonthCount) *
                      100
                    : 0;

                return (
                  <div
                    key={idx}
                    onClick={() =>
                      month.count >
                        0 &&
                      setSelectedMonthDetails(
                        {
                          name:
                            month.name,
                          emps:
                            month.emps,
                        }
                      )
                    }
                    className={`flex-1 flex flex-col items-center justify-end h-full ${
                      month.count >
                      0
                        ? 'cursor-pointer group'
                        : ''
                    }`}
                  >
                    <span
                      className="text-[10px] font-mono font-bold mb-1"
                      style={{
                        color:
                          month.count >
                          0
                            ? '#2563eb'
                            : 'transparent',
                      }}
                    >
                      {month.count.toLocaleString(
                        'en-US'
                      )}
                    </span>

                    <div
                      className="w-full max-w-[32px] rounded-t-md transition-all duration-300 group-hover:opacity-80 group-hover:scale-105"
                      style={{
                        height: `${height}%`,
                        minHeight:
                          month.count >
                          0
                            ? '4px'
                            : '0',
                        background:
                          month.count >
                          0
                            ? 'linear-gradient(180deg, #3b82f6, #1d4ed8)'
                            : '#f1f5f9',
                      }}
                    />

                    <span
                      className="text-[10px] font-bold mt-2"
                      style={{
                        color:
                          month.count >
                          0
                            ? '#0f172a'
                            : '#94a3b8',
                      }}
                    >
                      {month.name}
                    </span>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* الدونات */}

        <div
          className="card px-5 sm:px-6 py-5 flex flex-col justify-center items-center relative lg:col-span-1"
          style={{
            background: '#fff',
            border:
              '1px solid #e2e8f0',
            borderRadius: '16px',
          }}
        >
          <h4
            className="m-0 mb-4 text-[13.5px] font-black w-full text-right"
            style={{
              color: '#0f172a',
            }}
          >
            📑 توزيع هيكل العقود
            (اضغط للعرض)
          </h4>

          <div
            style={{
              width: '160px',
              height: '160px',
              borderRadius: '50%',
              background:
                donutGradient,
              position:
                'relative',
              display: 'flex',
              alignItems:
                'center',
              justifyContent:
                'center',
              boxShadow:
                '0 10px 25px rgba(0,0,0,0.06)',
            }}
          >
            <div
              style={{
                width: '105px',
                height: '110px',
                background:
                  '#ffffff',
                borderRadius:
                  '50%',
                display:
                  'flex',
                flexDirection:
                  'column',
                alignItems:
                  'center',
                justifyContent:
                  'center',
              }}
            >
              <span
                style={{
                  fontSize:
                    '10px',
                  color:
                    '#64748b',
                  fontWeight:
                    'bold',
                }}
              >
                إجمالي الهيكل
              </span>

              <span
                style={{
                  fontSize:
                    '18px',
                  fontWeight:
                    '900',
                  color:
                    '#0f172a',
                }}
              >
                {totalContracts.toLocaleString(
                  'en-US'
                )}
              </span>
            </div>
          </div>

          <div className="w-full grid grid-cols-2 gap-2 mt-5 text-[10.5px] font-bold px-1">
            <div
              onClick={() =>
                setSelectedDonutDetails(
                  {
                    title:
                      'العقود الدائمة',
                    emps:
                      dashboardData.permEmps,
                  }
                )
              }
              className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors"
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius:
                    '50%',
                  background:
                    '#10b981',
                }}
              />
              دائم (
              {
                dashboardData
                  .permCount
              }
              )
            </div>

            <div
              onClick={() =>
                setSelectedDonutDetails(
                  {
                    title:
                      'العقود المحددة',
                    emps:
                      dashboardData.fixedEmps,
                  }
                )
              }
              className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors"
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius:
                    '50%',
                  background:
                    '#2563eb',
                }}
              />
              محدد (
              {
                dashboardData
                  .fixedCount
              }
              )
            </div>

            <div
              onClick={() =>
                setSelectedDonutDetails(
                  {
                    title:
                      'عقود المكافأة الشاملة',
                    emps:
                      dashboardData.rewardEmps,
                  }
                )
              }
              className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors"
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius:
                    '50%',
                  background:
                    '#f59e0b',
                }}
              />
              مكافأة (
              {
                dashboardData
                  .rewardCount
              }
              )
            </div>

            <div
              onClick={() =>
                setSelectedDonutDetails(
                  {
                    title:
                      'عقود فوق السن',
                    emps:
                      dashboardData.aboveAgeEmps,
                  }
                )
              }
              className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors"
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius:
                    '50%',
                  background:
                    '#8b5cf6',
                }}
              />
              فوق السن (
              {
                dashboardData
                  .aboveAgeCount
              }
              )
            </div>

            <div
              onClick={() =>
                setSelectedDonutDetails(
                  {
                    title:
                      'العقود المؤقتة (بالأشهر)',
                    emps:
                      dashboardData.shortTermEmpsList,
                  }
                )
              }
              className="flex items-center gap-1.5 col-span-2 justify-center cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors"
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius:
                    '50%',
                  background:
                    '#06b6d4',
                }}
              />
              عقود مؤقتة بالأشهر (
              {
                dashboardData
                  .shortTermTotal
              }
              )
            </div>
          </div>
        </div>

        {/* المهام العاجلة */}

        <div
          className="card px-5 sm:px-6 py-5 lg:col-span-2"
          style={{
            background: '#fff',
            border:
              '1px solid #e2e8f0',
            borderRadius: '16px',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h4
              className="m-0 text-[13.5px] font-black flex items-center gap-2"
              style={{
                color: '#dc2626',
              }}
            >
              <span className="text-base">
                🚨
              </span>
              مهام عاجلة
              (اضغط للتجديد)
            </h4>
          </div>

          {dashboardData.urgentAlerts
            .length === 0 ? (
            <div
              className="stamp-green text-center py-8 rounded-xl text-[13px] font-bold"
              style={{
                background:
                  '#f0fdf4',
                color:
                  '#16a34a',
              }}
            >
              لا توجد مهام عاجلة!
              جميع العقود سارية.
              🎉
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[220px]">
              <table
                className="data-table"
                style={{
                  width: '100%',
                }}
              >
                <thead>
                  <tr>
                    <th>الكود</th>
                    <th>الموظف</th>
                    <th>الإدارة</th>
                    <th>الانتهاء</th>
                    <th>الحالة</th>
                  </tr>
                </thead>

                <tbody>
                  {dashboardData.urgentAlerts.map(
                    (alert: any) => {
                      const code =
                        getEmployeeCode(
                          alert
                        );

                      return (
                        <tr
                          key={
                            alert.id ||
                            code
                          }
                          onClick={() =>
                            handleRowClick(
                              code,
                              'contracts',
                              alert
                            )
                          }
                          className="cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <td
                            className="font-mono font-bold"
                            style={{
                              color:
                                '#2563eb',
                            }}
                          >
                            {code}
                          </td>

                          <td className="font-bold">
                            {getEmployeeName(
                              alert
                            )}
                          </td>

                          <td
                            style={{
                              color:
                                '#64748b',
                              fontSize:
                                '11px',
                            }}
                          >
                            {getDepartment(
                              alert
                            )}
                          </td>

                          <td className="font-mono font-bold">
                            {getContractEnd(
                              alert
                            )}
                          </td>

                          <td>
                            {alert.status ===
                            'expired' ? (
                              <Stamp color="red">
                                منتهي (
                                {Math.abs(
                                  alert.days
                                )}
                                )
                              </Stamp>
                            ) : (
                              <Stamp color="amber">
                                متبقي{' '}
                                {
                                  alert.days
                                }{' '}
                                يوم
                              </Stamp>
                            )}
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
      </div>

      {/* ============================================================
          Modal نواقص البيانات
      ============================================================ */}

      {showMissingDataModal && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15,23,42,0.7)',
            display: 'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            zIndex: 9999,
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
                '85vh',
              overflowY:
                'auto',
              background:
                '#ffffff',
              borderRadius:
                '16px',
              padding:
                '24px',
              boxShadow:
                '0 20px 60px rgba(0,0,0,0.3)',
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
                borderBottom:
                  '1px solid #e2e8f0',
                paddingBottom:
                  '12px',
                marginBottom:
                  '20px',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize:
                    '16px',
                  color:
                    '#dc2626',
                  fontWeight:
                    '800',
                }}
              >
                ⚠️ سجل نواقص البيانات (
                {
                  dashboardData
                    .missingDataList
                    .length
                }{' '}
                موظف)
              </h3>

              <button
                onClick={() =>
                  setShowMissingDataModal(
                    false
                  )
                }
                style={{
                  background:
                    '#f8fafc',
                  border: 0,
                  color:
                    '#64748b',
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

            {dashboardData.missingDataList
              .length === 0 ? (
              <div
                style={{
                  padding:
                    '40px',
                  textAlign:
                    'center',
                  color:
                    '#16a34a',
                  fontWeight:
                    'bold',
                }}
              >
                بيانات جميع الموظفين
                مكتملة بنجاح! ✅
              </div>
            ) : (
              <div className="table-responsive">
                <table
                  style={{
                    width: '100%',
                    borderCollapse:
                      'collapse',
                    textAlign:
                      'right',
                    fontSize:
                      '11px',
                    whiteSpace:
                      'nowrap',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background:
                          '#f8fafc',
                        borderBottom:
                          '1px solid #e2e8f0',
                      }}
                    >
                      <th
                        style={{
                          padding:
                            '10px',
                          color:
                            '#64748b',
                        }}
                      >
                        الكود
                      </th>

                      <th
                        style={{
                          padding:
                            '10px',
                          color:
                            '#64748b',
                        }}
                      >
                        الموظف
                      </th>

                      <th
                        style={{
                          padding:
                            '10px',
                          color:
                            '#64748b',
                        }}
                      >
                        النواقص
                      </th>

                      <th
                        style={{
                          padding:
                            '10px',
                          color:
                            '#64748b',
                          textAlign:
                            'center',
                        }}
                      >
                        إجراء
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {dashboardData.missingDataList.map(
                      (
                        emp: any,
                        idx: number
                      ) => {
                        const empCode =
                          getEmployeeCode(
                            emp
                          );

                        const empName =
                          getEmployeeName(
                            emp
                          );

                        const nationalId =
                          getNationalId(
                            emp
                          );

                        const mobile =
                          getMobile(
                            emp
                          );

                        return (
                          <tr
                            key={
                              getEmployeeId(
                                emp
                              ) ||
                              empCode ||
                              idx
                            }
                            style={{
                              borderBottom:
                                '1px solid #f1f5f9',
                            }}
                          >
                            <td
                              style={{
                                padding:
                                  '10px',
                                fontWeight:
                                  'bold',
                                color:
                                  '#0f172a',
                              }}
                            >
                              {empCode ||
                                '—'}
                            </td>

                            <td
                              style={{
                                padding:
                                  '10px',
                                fontWeight:
                                  'bold',
                                color:
                                  '#0f172a',
                              }}
                            >
                              {empName ||
                                '—'}
                            </td>

                            <td
                              style={{
                                padding:
                                  '10px',
                                color:
                                  '#dc2626',
                                fontWeight:
                                  'bold',
                              }}
                            >
                              {!nationalId && (
                                <span>
                                  الرقم القومي
                                </span>
                              )}

                              {!mobile && (
                                <span
                                  style={{
                                    marginRight:
                                      '8px',
                                  }}
                                >
                                  {!nationalId
                                    ? ''
                                    : '- '}
                                  الموبايل
                                </span>
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
                              {/* ==================================================
                                  أهم تعديل:
                                  نبعت emp نفسه وليس الكود فقط
                                 ================================================== */}

                              <button
                                onClick={() =>
                                  handleRowClick(
                                    empCode,
                                    'employees',
                                    emp
                                  )
                                }
                                style={{
                                  background:
                                    '#2563eb',
                                  color:
                                    '#ffffff',
                                  border: 0,
                                  padding:
                                    '6px 12px',
                                  borderRadius:
                                    '6px',
                                  fontSize:
                                    '10px',
                                  fontWeight:
                                    'bold',
                                  cursor:
                                    'pointer',
                                }}
                              >
                                تحديث السجل ✏️
                              </button>
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
        </div>
      )}

      {/* ============================================================
          Modal الإدارة
      ============================================================ */}

      {selectedDeptDetails && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15,23,42,0.7)',
            display: 'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            zIndex: 9999,
            padding:
              '20px',
          }}
        >
          <div
            style={{
              width:
                '820px',
              maxWidth:
                '100%',
              height:
                '80vh',
              background:
                '#ffffff',
              borderRadius:
                '16px',
              display:
                'flex',
              flexDirection:
                'column',
              boxShadow:
                '0 20px 60px rgba(0,0,0,0.3)',
              overflow:
                'hidden',
            }}
          >
            <div
              style={{
                padding:
                  '20px 24px',
                background:
                  '#f8fafc',
                borderBottom:
                  '1px solid #e2e8f0',
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center',
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize:
                      '16px',
                    color:
                      '#0f172a',
                    fontWeight:
                      '800',
                  }}
                >
                  🏢 موظفو إدارة:{' '}
                  {
                    selectedDeptDetails.name
                  }
                </h3>

                <p
                  style={{
                    margin:
                      '4px 0 0',
                    fontSize:
                      '11px',
                    color:
                      '#64748b',
                  }}
                >
                  إجمالي القوة الإدارية:{' '}
                  {
                    selectedDeptDetails
                      .emps.length
                  }{' '}
                  موظف
                </p>
              </div>

              <button
                onClick={() =>
                  setSelectedDeptDetails(
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

            <div
              style={{
                flex: 1,
                overflowY:
                  'auto',
                padding:
                  '24px',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse:
                    'collapse',
                  textAlign:
                    'right',
                  fontSize:
                    '11px',
                  whiteSpace:
                    'nowrap',
                }}
              >
                <thead>
                  <tr
                    style={{
                      background:
                        '#f8fafc',
                      borderBottom:
                        '1px solid #e2e8f0',
                    }}
                  >
                    <th style={{ padding: '10px' }}>
                      الكود
                    </th>

                    <th style={{ padding: '10px' }}>
                      الموظف
                    </th>

                    <th style={{ padding: '10px' }}>
                      الوظيفة
                    </th>

                    <th style={{ padding: '10px' }}>
                      نوع العقد
                    </th>

                    <th style={{ padding: '10px' }}>
                      نهاية العقد
                    </th>

                    <th
                      style={{
                        padding: '10px',
                        textAlign:
                          'center',
                      }}
                    >
                      إجراء
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {selectedDeptDetails.emps.map(
                    (
                      emp: any
                    ) => {
                      const empCode =
                        getEmployeeCode(
                          emp
                        );

                      return (
                        <tr
                          key={
                            getEmployeeId(
                              emp
                            ) ||
                            empCode
                          }
                          style={{
                            borderBottom:
                              '1px solid #f1f5f9',
                          }}
                        >
                          <td
                            style={{
                              padding:
                                '10px',
                              fontWeight:
                                'bold',
                              fontFamily:
                                'monospace',
                              color:
                                '#2563eb',
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
                          </td>

                          <td
                            style={{
                              padding:
                                '10px',
                              color:
                                '#64748b',
                            }}
                          >
                            {getJobTitle(
                              emp
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
                            {getContractType(
                              emp
                            ) ||
                              '—'}
                          </td>

                          <td
                            style={{
                              padding:
                                '10px',
                              fontFamily:
                                'monospace',
                            }}
                          >
                            {getContractEnd(
                              emp
                            ) ||
                              '—'}
                          </td>

                          <td
                            style={{
                              padding:
                                '10px',
                              textAlign:
                                'center',
                            }}
                          >
                            <button
                              onClick={() =>
                                handleRowClick(
                                  empCode,
                                  'contracts',
                                  emp
                                )
                              }
                              style={{
                                background:
                                  '#eff6ff',
                                color:
                                  '#2563eb',
                                border:
                                  '1px solid #bfdbfe',
                                padding:
                                  '5px 10px',
                                borderRadius:
                                  '4px',
                                fontSize:
                                  '10px',
                                fontWeight:
                                  'bold',
                                cursor:
                                  'pointer',
                              }}
                            >
                              عرض العقد ↗️
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          باقي الـ Modals
          ============================================================ */}

      {showAgeModal && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15,23,42,0.7)',
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
                '820px',
              maxWidth:
                '100%',
              height:
                '85vh',
              background:
                '#ffffff',
              borderRadius:
                '16px',
              display:
                'flex',
              flexDirection:
                'column',
              overflow:
                'hidden',
            }}
          >
            <div
              style={{
                padding:
                  '18px 24px',
                background:
                  '#f8fafc',
                borderBottom:
                  '1px solid #e2e8f0',
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center',
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize:
                      '16px',
                    color:
                      '#d97706',
                    fontWeight:
                      '800',
                  }}
                >
                  🎂 سجل بلوغ سن الـ 60
                  (لصناع العقود الدائمة)
                </h3>

                <p
                  style={{
                    margin:
                      '4px 0 0',
                    fontSize:
                      '11px',
                    color:
                      '#64748b',
                  }}
                >
                  إجمالي الموظفين:
                  {
                    displayTurning60List.length
                  }
                </p>
              </div>

              <button
                onClick={() =>
                  setShowAgeModal(
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
                  fontWeight:
                    'bold',
                }}
              >
                إغلاق ✕
              </button>
            </div>

            <div
              style={{
                padding:
                  '12px 24px',
                borderBottom:
                  '1px solid #e2e8f0',
                display:
                  'flex',
                gap:
                  '10px',
                flexWrap:
                  'wrap',
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setAgeModalFilterMode(
                    '60days'
                  )
                }
                style={{
                  padding:
                    '7px 12px',
                  border: 0,
                  borderRadius:
                    '6px',
                  background:
                    ageModalFilterMode ===
                    '60days'
                      ? '#d97706'
                      : '#f8fafc',
                  color:
                    ageModalFilterMode ===
                    '60days'
                      ? '#fff'
                      : '#0f172a',
                  fontWeight:
                    'bold',
                  cursor:
                    'pointer',
                }}
              >
                الـ 60 يوماً القادمة
              </button>

              <button
                type="button"
                onClick={() =>
                  setAgeModalFilterMode(
                    'byMonth'
                  )
                }
                style={{
                  padding:
                    '7px 12px',
                  border: 0,
                  borderRadius:
                    '6px',
                  background:
                    ageModalFilterMode ===
                    'byMonth'
                      ? '#d97706'
                      : '#f8fafc',
                  color:
                    ageModalFilterMode ===
                    'byMonth'
                      ? '#fff'
                      : '#0f172a',
                  fontWeight:
                    'bold',
                  cursor:
                    'pointer',
                }}
              >
                🗓️ اختيار شهر وسنة
              </button>

              <button
                type="button"
                onClick={() =>
                  setAgeModalFilterMode(
                    'allYear'
                  )
                }
                style={{
                  padding:
                    '7px 12px',
                  border: 0,
                  borderRadius:
                    '6px',
                  background:
                    ageModalFilterMode ===
                    'allYear'
                      ? '#d97706'
                      : '#f8fafc',
                  color:
                    ageModalFilterMode ===
                    'allYear'
                      ? '#fff'
                      : '#0f172a',
                  fontWeight:
                    'bold',
                  cursor:
                    'pointer',
                }}
              >
                📅 كامل السنة
              </button>

              {(ageModalFilterMode ===
                'byMonth' ||
                ageModalFilterMode ===
                  'allYear') && (
                <>
                  {ageModalFilterMode ===
                    'byMonth' && (
                    <select
                      value={
                        ageModalSelectedMonth
                      }
                      onChange={(e) =>
                        setAgeModalSelectedMonth(
                          e.target.value
                        )
                      }
                      style={{
                        padding:
                          '7px 10px',
                        border:
                          '1px solid #e2e8f0',
                        borderRadius:
                          '6px',
                        fontWeight:
                          'bold',
                      }}
                    >
                      <option value="">
                        كل الأشهر
                      </option>

                      {MONTHS_LIST.map(
                        (m) => (
                          <option
                            key={
                              m.value
                            }
                            value={
                              m.value
                            }
                          >
                            {m.label}
                          </option>
                        )
                      )}
                    </select>
                  )}

                  <select
                    value={
                      ageModalSelectedYear
                    }
                    onChange={(e) =>
                      setAgeModalSelectedYear(
                        e.target.value
                      )
                    }
                    style={{
                      padding:
                        '7px 10px',
                      border:
                        '1px solid #e2e8f0',
                      borderRadius:
                        '6px',
                      fontWeight:
                        'bold',
                    }}
                  >
                    <option value="">
                      كل السنوات
                    </option>
                    <option value="2025">
                      2025
                    </option>
                    <option value="2026">
                      2026
                    </option>
                    <option value="2027">
                      2027
                    </option>
                    <option value="2028">
                      2028
                    </option>
                  </select>
                </>
              )}
            </div>

            <div
              style={{
                flex: 1,
                overflowY:
                  'auto',
                padding:
                  '24px',
              }}
            >
              {displayTurning60List.length ===
              0 ? (
                <div
                  style={{
                    textAlign:
                      'center',
                    padding:
                      '40px',
                    color:
                      '#64748b',
                    fontWeight:
                      'bold',
                  }}
                >
                  لا يوجد موظفون مطابقون.
                </div>
              ) : (
                <table
                  style={{
                    width: '100%',
                    borderCollapse:
                      'collapse',
                    fontSize:
                      '11px',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background:
                          '#f8fafc',
                      }}
                    >
                      <th style={{ padding: '10px' }}>
                        الكود
                      </th>
                      <th style={{ padding: '10px' }}>
                        الموظف
                      </th>
                      <th style={{ padding: '10px' }}>
                        الإدارة
                      </th>
                      <th style={{ padding: '10px' }}>
                        الميلاد
                      </th>
                      <th style={{ padding: '10px' }}>
                        بلوغ 60
                      </th>
                      <th style={{ padding: '10px' }}>
                        الحالة
                      </th>
                      <th style={{ padding: '10px' }}>
                        إجراء
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {displayTurning60List.map(
                      (emp: any) => (
                        <tr
                          key={
                            getEmployeeId(
                              emp
                            ) ||
                            getEmployeeCode(
                              emp
                            )
                          }
                        >
                          <td style={{ padding: '10px' }}>
                            {getEmployeeCode(
                              emp
                            )}
                          </td>

                          <td style={{ padding: '10px' }}>
                            {getEmployeeName(
                              emp
                            )}
                          </td>

                          <td style={{ padding: '10px' }}>
                            {getDepartment(
                              emp
                            )}
                          </td>

                          <td style={{ padding: '10px' }}>
                            {emp.birthDate}
                          </td>

                          <td style={{ padding: '10px' }}>
                            {emp.age60Date}
                          </td>

                          <td style={{ padding: '10px' }}>
                            {emp.daysLeft <
                            0
                              ? 'بلغ'
                              : `متبقي ${emp.daysLeft} يوم`}
                          </td>

                          <td style={{ padding: '10px' }}>
                            <button
                              onClick={() =>
                                handleRowClick(
                                  getEmployeeCode(
                                    emp
                                  ),
                                  'contracts',
                                  emp
                                )
                              }
                              style={{
                                background:
                                  '#2563eb',
                                color:
                                  '#fff',
                                border: 0,
                                padding:
                                  '5px 10px',
                                borderRadius:
                                  '5px',
                                cursor:
                                  'pointer',
                                fontWeight:
                                  'bold',
                                fontSize:
                                  '10px',
                              }}
                            >
                              العقد ↗️
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedMonthDetails && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15,23,42,0.7)',
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
              height:
                '80vh',
              background:
                '#fff',
              borderRadius:
                '16px',
              overflow:
                'hidden',
              display:
                'flex',
              flexDirection:
                'column',
            }}
          >
            <div
              style={{
                padding:
                  '20px 24px',
                background:
                  '#f8fafc',
                borderBottom:
                  '1px solid #e2e8f0',
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center',
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize:
                      '16px',
                    fontWeight:
                      '800',
                  }}
                >
                  📈 عقود بدأ العمل
                  عليها لشهر (
                  {
                    selectedMonthDetails.name
                  }
                  )
                </h3>

                <p
                  style={{
                    margin:
                      '4px 0 0',
                    fontSize:
                      '11px',
                    color:
                      '#64748b',
                  }}
                >
                  إجمالي الموظفين:{' '}
                  {
                    selectedMonthDetails
                      .emps.length
                  }
                </p>
              </div>

              <button
                onClick={() =>
                  setSelectedMonthDetails(
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
                  fontWeight:
                    'bold',
                }}
              >
                إغلاق ✕
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY:
                  'auto',
                padding:
                  '24px',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse:
                    'collapse',
                  fontSize:
                    '11px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      background:
                        '#f8fafc',
                    }}
                  >
                    <th style={{ padding: '10px' }}>
                      الكود
                    </th>
                    <th style={{ padding: '10px' }}>
                      الموظف
                    </th>
                    <th style={{ padding: '10px' }}>
                      الإدارة
                    </th>
                    <th style={{ padding: '10px' }}>
                      نوع العقد
                    </th>
                    <th style={{ padding: '10px' }}>
                      بداية العقد
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {selectedMonthDetails.emps.map(
                    (emp: any) => (
                      <tr
                        key={
                          getEmployeeId(
                            emp
                          ) ||
                          getEmployeeCode(
                            emp
                          )
                        }
                        style={{
                          borderBottom:
                            '1px solid #f1f5f9',
                        }}
                      >
                        <td style={{ padding: '10px' }}>
                          {getEmployeeCode(
                            emp
                          )}
                        </td>

                        <td style={{ padding: '10px' }}>
                          {getEmployeeName(
                            emp
                          )}
                        </td>

                        <td style={{ padding: '10px' }}>
                          {getDepartment(
                            emp
                          )}
                        </td>

                        <td style={{ padding: '10px' }}>
                          {getContractType(
                            emp
                          )}
                        </td>

                        <td style={{ padding: '10px' }}>
                          {getContractStart(
                            emp
                          ) || '—'}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {selectedDonutDetails && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15,23,42,0.7)',
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
              height:
                '80vh',
              background:
                '#fff',
              borderRadius:
                '16px',
              overflow:
                'hidden',
              display:
                'flex',
              flexDirection:
                'column',
            }}
          >
            <div
              style={{
                padding:
                  '20px 24px',
                background:
                  '#f8fafc',
                borderBottom:
                  '1px solid #e2e8f0',
                display:
                  'flex',
                justifyContent:
                  'space-between',
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize:
                      '16px',
                    fontWeight:
                      '800',
                  }}
                >
                  📑 كشف الموظفين:{' '}
                  {
                    selectedDonutDetails.title
                  }
                </h3>

                <p
                  style={{
                    margin:
                      '4px 0 0',
                    fontSize:
                      '11px',
                    color:
                      '#64748b',
                  }}
                >
                  إجمالي الموظفين:{' '}
                  {
                    selectedDonutDetails
                      .emps.length
                  }
                </p>
              </div>

              <button
                onClick={() =>
                  setSelectedDonutDetails(
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

            <div
              style={{
                flex: 1,
                overflowY:
                  'auto',
                padding:
                  '24px',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse:
                    'collapse',
                  fontSize:
                    '11px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      background:
                        '#f8fafc',
                    }}
                  >
                    <th style={{ padding: '10px' }}>
                      الكود
                    </th>
                    <th style={{ padding: '10px' }}>
                      الموظف
                    </th>
                    <th style={{ padding: '10px' }}>
                      الإدارة
                    </th>
                    <th style={{ padding: '10px' }}>
                      الوظيفة
                    </th>
                    <th style={{ padding: '10px' }}>
                      نوع العقد
                    </th>
                    <th style={{ padding: '10px' }}>
                      إجراء
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {selectedDonutDetails.emps.map(
                    (emp: any) => {
                      const code =
                        getEmployeeCode(
                          emp
                        );

                      return (
                        <tr
                          key={
                            getEmployeeId(
                              emp
                            ) ||
                            code
                          }
                        >
                          <td style={{ padding: '10px' }}>
                            {code}
                          </td>

                          <td style={{ padding: '10px' }}>
                            {getEmployeeName(
                              emp
                            )}
                          </td>

                          <td style={{ padding: '10px' }}>
                            {getDepartment(
                              emp
                            )}
                          </td>

                          <td style={{ padding: '10px' }}>
                            {getJobTitle(
                              emp
                            ) || '—'}
                          </td>

                          <td style={{ padding: '10px' }}>
                            {getContractType(
                              emp
                            ) || '—'}
                          </td>

                          <td style={{ padding: '10px' }}>
                            <button
                              onClick={() =>
                                handleRowClick(
                                  code,
                                  'contracts',
                                  emp
                                )
                              }
                              style={{
                                background:
                                  '#eff6ff',
                                color:
                                  '#2563eb',
                                border:
                                  '1px solid #bfdbfe',
                                padding:
                                  '5px 10px',
                                borderRadius:
                                  '4px',
                                cursor:
                                  'pointer',
                              }}
                            >
                              عرض العقد ↗️
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showTotalEmpsModal && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15,23,42,0.7)',
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
              height:
                '80vh',
              background:
                '#fff',
              borderRadius:
                '16px',
              overflow:
                'hidden',
              display:
                'flex',
              flexDirection:
                'column',
            }}
          >
            <div
              style={{
                padding:
                  '20px 24px',
                background:
                  '#f8fafc',
                borderBottom:
                  '1px solid #e2e8f0',
                display:
                  'flex',
                justifyContent:
                  'space-between',
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize:
                      '16px',
                    fontWeight:
                      '800',
                  }}
                >
                  👥 كشف إجمالي القوة
                  البشرية النشطة
                </h3>

                <p
                  style={{
                    margin:
                      '4px 0 0',
                    fontSize:
                      '11px',
                    color:
                      '#64748b',
                  }}
                >
                  إجمالي:{' '}
                  {
                    dashboardData.totalEmps
                  }
                </p>
              </div>

              <button
                onClick={() =>
                  setShowTotalEmpsModal(
                    false
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
                  fontWeight:
                    'bold',
                }}
              >
                إغلاق ✕
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY:
                  'auto',
                padding:
                  '24px',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse:
                    'collapse',
                  fontSize:
                    '11px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      background:
                        '#f8fafc',
                    }}
                  >
                    <th style={{ padding: '10px' }}>
                      الكود
                    </th>
                    <th style={{ padding: '10px' }}>
                      الموظف
                    </th>
                    <th style={{ padding: '10px' }}>
                      الإدارة
                    </th>
                    <th style={{ padding: '10px' }}>
                      الوظيفة
                    </th>
                    <th style={{ padding: '10px' }}>
                      نوع العقد
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {dashboardData.filteredEmps.map(
                    (emp: any) => (
                      <tr
                        key={
                          getEmployeeId(
                            emp
                          ) ||
                          getEmployeeCode(
                            emp
                          )
                        }
                      >
                        <td style={{ padding: '10px' }}>
                          {getEmployeeCode(
                            emp
                          )}
                        </td>
                        <td style={{ padding: '10px' }}>
                          {getEmployeeName(
                            emp
                          )}
                        </td>
                        <td style={{ padding: '10px' }}>
                          {getDepartment(
                            emp
                          )}
                        </td>
                        <td style={{ padding: '10px' }}>
                          {getJobTitle(
                            emp
                          ) || '—'}
                        </td>
                        <td style={{ padding: '10px' }}>
                          {getContractType(
                            emp
                          ) || '—'}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showExpiringSoonModal && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15,23,42,0.7)',
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
              height:
                '80vh',
              background:
                '#fff',
              borderRadius:
                '16px',
              overflow:
                'hidden',
              display:
                'flex',
              flexDirection:
                'column',
            }}
          >
            <div
              style={{
                padding:
                  '20px 24px',
                background:
                  '#f8fafc',
                borderBottom:
                  '1px solid #e2e8f0',
                display:
                  'flex',
                justifyContent:
                  'space-between',
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize:
                      '16px',
                    color:
                      '#d97706',
                    fontWeight:
                      '800',
                  }}
                >
                  📆 عقود تنتهي خلال الـ
                  60 يوم القادمة
                </h3>

                <p
                  style={{
                    margin:
                      '4px 0 0',
                    fontSize:
                      '11px',
                    color:
                      '#64748b',
                  }}
                >
                  إجمالي:{' '}
                  {
                    dashboardData
                      .expiringSoonList
                      .length
                  }
                </p>
              </div>

              <button
                onClick={() =>
                  setShowExpiringSoonModal(
                    false
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
                  fontWeight:
                    'bold',
                }}
              >
                إغلاق ✕
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY:
                  'auto',
                padding:
                  '24px',
              }}
            >
              {dashboardData.expiringSoonList
                .length ===
              0 ? (
                <div
                  style={{
                    textAlign:
                      'center',
                    padding:
                      '40px',
                    color:
                      '#64748b',
                    fontWeight:
                      'bold',
                  }}
                >
                  لا توجد عقود تنتهي خلال
                  الـ 60 يوم القادمة.
                </div>
              ) : (
                <table
                  style={{
                    width: '100%',
                    borderCollapse:
                      'collapse',
                    fontSize:
                      '11px',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background:
                          '#f8fafc',
                      }}
                    >
                      <th style={{ padding: '10px' }}>
                        الكود
                      </th>
                      <th style={{ padding: '10px' }}>
                        الموظف
                      </th>
                      <th style={{ padding: '10px' }}>
                        الإدارة
                      </th>
                      <th style={{ padding: '10px' }}>
                        نوع العقد
                      </th>
                      <th style={{ padding: '10px' }}>
                        الانتهاء
                      </th>
                      <th style={{ padding: '10px' }}>
                        المتبقي
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {dashboardData.expiringSoonList.map(
                      (emp: any) => (
                        <tr
                          key={
                            getEmployeeId(
                              emp
                            ) ||
                            getEmployeeCode(
                              emp
                            )
                          }
                        >
                          <td style={{ padding: '10px' }}>
                            {getEmployeeCode(
                              emp
                            )}
                          </td>
                          <td style={{ padding: '10px' }}>
                            {getEmployeeName(
                              emp
                            )}
                          </td>
                          <td style={{ padding: '10px' }}>
                            {getDepartment(
                              emp
                            )}
                          </td>
                          <td style={{ padding: '10px' }}>
                            {getContractType(
                              emp
                            )}
                          </td>
                          <td style={{ padding: '10px' }}>
                            {getContractEnd(
                              emp
                            )}
                          </td>
                          <td style={{ padding: '10px' }}>
                            متبقي {emp.days} يوم
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Short Term */}

      {showShortTermModal && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15,23,42,0.7)',
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
              height:
                '80vh',
              background:
                '#fff',
              borderRadius:
                '16px',
              overflow:
                'hidden',
              display:
                'flex',
              flexDirection:
                'column',
            }}
          >
            <div
              style={{
                padding:
                  '20px 24px',
                background:
                  '#f8fafc',
                borderBottom:
                  '1px solid #e2e8f0',
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center',
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize:
                      '16px',
                    color:
                      '#2563eb',
                    fontWeight:
                      '800',
                  }}
                >
                  ⏱️ العقود المؤقتة وفترات
                  الاختبار
                </h3>

                <p
                  style={{
                    margin:
                      '4px 0 0',
                    fontSize:
                      '11px',
                    color:
                      '#64748b',
                  }}
                >
                  إجمالي:{' '}
                  {
                    dashboardData
                      .shortTermTotal
                  }
                </p>
              </div>

              <div
                style={{
                  display:
                    'flex',
                  gap:
                    '8px',
                }}
              >
                {selectedShortTermDept && (
                  <button
                    onClick={() =>
                      setSelectedShortTermDept(
                        null
                      )
                    }
                    style={{
                      background:
                        '#e2e8f0',
                      border: 0,
                      color:
                        '#0f172a',
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
                    🔙 رجوع
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowShortTermModal(
                      false
                    );
                    setSelectedShortTermDept(
                      null
                    );
                  }}
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
            </div>

            <div
              style={{
                flex: 1,
                overflowY:
                  'auto',
                padding:
                  '24px',
              }}
            >
              {!selectedShortTermDept ? (
                <div
                  style={{
                    display:
                      'flex',
                    flexDirection:
                      'column',
                    gap:
                      '12px',
                  }}
                >
                  {dashboardData.shortTermList.map(
                    (
                      group: any,
                      idx: number
                    ) => (
                      <div
                        key={idx}
                        onClick={() =>
                          setSelectedShortTermDept(
                            group.deptName
                          )
                        }
                        style={{
                          padding:
                            '16px',
                          border:
                            '1px solid #e2e8f0',
                          borderRadius:
                            '10px',
                          cursor:
                            'pointer',
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
                            fontWeight:
                              'bold',
                          }}
                        >
                          🏢{' '}
                          {
                            group.deptName
                          }
                        </div>

                        <span
                          style={{
                            background:
                              '#eff6ff',
                            color:
                              '#2563eb',
                            padding:
                              '4px 10px',
                            borderRadius:
                              '100px',
                            fontSize:
                              '11px',
                            fontWeight:
                              'bold',
                          }}
                        >
                          {
                            group.emps
                              .length
                          }{' '}
                          موظف
                        </span>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <table
                  style={{
                    width: '100%',
                    borderCollapse:
                      'collapse',
                    fontSize:
                      '11px',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background:
                          '#f8fafc',
                      }}
                    >
                      <th style={{ padding: '10px' }}>
                        الموظف
                      </th>
                      <th style={{ padding: '10px' }}>
                        سجل التعاقد
                      </th>
                      <th style={{ padding: '10px' }}>
                        الانتهاء
                      </th>
                      <th style={{ padding: '10px' }}>
                        إجراء
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {dashboardData.shortTermList
                      .find(
                        (g: any) =>
                          g.deptName ===
                          selectedShortTermDept
                      )
                      ?.emps.map(
                        (emp: any) => {
                          const code =
                            getEmployeeCode(
                              emp
                            );

                          return (
                            <tr
                              key={
                                getEmployeeId(
                                  emp
                                ) ||
                                code
                              }
                            >
                              <td
                                style={{
                                  padding:
                                    '10px',
                                }}
                              >
                                {getEmployeeName(
                                  emp
                                )}
                                <div
                                  style={{
                                    fontSize:
                                      '10px',
                                    color:
                                      '#2563eb',
                                  }}
                                >
                                  {code}
                                </div>
                              </td>

                              <td
                                style={{
                                  padding:
                                    '10px',
                                }}
                              >
                                {
                                  emp.historyDesc
                                }
                              </td>

                              <td
                                style={{
                                  padding:
                                    '10px',
                                }}
                              >
                                {getContractEnd(
                                  emp
                                )}
                              </td>

                              <td
                                style={{
                                  padding:
                                    '10px',
                                }}
                              >
                                <button
                                  onClick={() =>
                                    handleRowClick(
                                      code,
                                      'contracts',
                                      emp
                                    )
                                  }
                                  style={{
                                    background:
                                      '#eff6ff',
                                    color:
                                      '#2563eb',
                                    border:
                                      '1px solid #bfdbfe',
                                    padding:
                                      '5px 10px',
                                    borderRadius:
                                      '5px',
                                    cursor:
                                      'pointer',
                                  }}
                                >
                                  العقد ↗️
                                </button>
                              </td>
                            </tr>
                          );
                        }
                      )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
