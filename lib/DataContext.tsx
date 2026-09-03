'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * مصدر بيانات موحّد لجدولي employees و renewal_requests و contracts.
 */

type Employee = any;
type Renewal = any;

type DataContextValue = {
  employees: Employee[];
  renewals: Renewal[];
  loading: boolean;
  refresh: () => Promise<void>;
  lastFetchedAt: Date | null;
};

const DataContext = createContext<DataContextValue | null>(null);

async function fetchAllRows(table: string) {
  let rows: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + step - 1);
    if (error || !data || data.length === 0) break;
    rows = [...rows, ...data];
    if (data.length < step) break;
    from += step;
  }
  return rows;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;

    const run = (async () => {
      setLoading(true);
      // 1. جلب الجداول الثلاثة (الموظفين، التجديدات، والعقود)
      const [emps, rens, allContracts] = await Promise.all([
        fetchAllRows('employees'),
        fetchAllRows('renewal_requests'),
        fetchAllRows('contracts') // ⬅️ جلب جدول العقود
      ]);

      // 2. دمج بيانات العقد مع بيانات الموظف
      const mergedEmployees = emps.map((emp) => {
        // تنظيف كود الموظف من المسافات والأصفار الوهمية على اليسار
        const empCode = String(emp.employee_code).trim().replace(/^0+/, '');
        
        // البحث عن عقود الموظف في جدول العقود مع نفس التنظيف
        const empContracts = allContracts.filter(c => 
          String(c.employee_code).trim().replace(/^0+/, '') === empCode
        );
        
        // ترتيب العقود بحيث نأخذ أحدث عقد بناءً على تاريخ النهاية
        empContracts.sort((a, b) => new Date(b.contract_end_date).getTime() - new Date(a.contract_end_date).getTime());
        
        // اختيار العقد النشط (إن وجد) أو أحدث عقد
        const activeContract = empContracts.find(c => c.status === 'Active' || c.status === 'نشط' || c.status === 'ساري') || empContracts[0];

        // دمج الحقول في كائن الموظف المبعوث للداشبورد
        if (activeContract) {
          return {
            ...emp,
            contract_type: activeContract.contract_type,
            contract_start_date: activeContract.contract_start_date,
            contract_end_date: activeContract.contract_end_date,
            contract_status: activeContract.status
          };
        }

        return emp;
      });

      setEmployees(mergedEmployees);
      setRenewals(rens);
      setLastFetchedAt(new Date());
      setLoading(false);
    })();

    inFlight.current = run;
    try {
      await run;
    } finally {
      inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <DataContext.Provider value={{ employees, renewals, loading, refresh, lastFetchedAt }}>
      {children}
    </DataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error('useAppData() لازم يُستخدم جوه <DataProvider>');
  }
  return ctx;
}
