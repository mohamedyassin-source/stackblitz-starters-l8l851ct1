'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase } from './supabase';

/**
 * مصدر بيانات موحّد لجدولي employees و renewal_requests.
 *
 * قبل هذا الملف: كل صفحة (Dashboard, Reports, Contracts, Alerts, Audit) كانت
 * تجيب الجدولين كاملين بنفسها بنفس كود الـ pagination المكرر — يعني عند فتح
 * التطبيق والتنقل بين الصفحات كان بيحصل 5 مرات fetch كامل لنفس البيانات.
 * دلوقتي: يتم الجلب مرة واحدة عند بدء التطبيق، ويُعاد استخدامها في كل صفحة عبر
 * useAppData()، مع إمكانية طلب تحديث فوري بعد أي عملية تعديل (إضافة/موافقة/رفض...).
 */

type Employee = any;
type Renewal = any;

type DataContextValue = {
  employees: Employee[];
  renewals: Renewal[];
  loading: boolean;
  /** أعد الجلب من Supabase الآن (استخدمها بعد أي إضافة/تعديل/حذف) */
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
    // لو فيه طلب تحديث شغال بالفعل، انتظره بدل ما تطلق نداء مكرر لـ Supabase
    if (inFlight.current) return inFlight.current;

    const run = (async () => {
      setLoading(true);
      const [emps, rens] = await Promise.all([fetchAllRows('employees'), fetchAllRows('renewal_requests')]);
      setEmployees(emps);
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
    throw new Error('useAppData() لازم يُستخدم جوه <DataProvider> (مضاف في app/page.tsx)');
  }
  return ctx;
}
