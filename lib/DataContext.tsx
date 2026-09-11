'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// تهيئة الاتصال بـ Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface DataContextType {
  employees: any[];
  contracts: any[];
  renewals: any[];
  appUsers: any[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataContextType>({
  employees: [],
  contracts: [],
  renewals: [],
  appUsers: [],
  loading: true,
  refresh: async () => {},
});

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);
  const [appUsers, setAppUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshData = async () => {
    setLoading(true);
    try {
      // جلب البيانات من Supabase بالتوازي لسرعة الأداء
      const [empRes, contRes, renRes, userRes] = await Promise.all([
        supabase.from('employees').select('*'),
        supabase.from('contracts').select('*'),
        supabase.from('renewals').select('*'), 
        supabase.from('users').select('*') // تم تغييرها لـ users أو حسب اسم الجدول لديك
      ]);

      if (empRes.error) console.error('Error fetching employees:', empRes.error);
      if (contRes.error) console.error('Error fetching contracts:', contRes.error);
      if (renRes.error) console.error('Error fetching renewals:', renRes.error);
      if (userRes.error) console.error('Error fetching users:', userRes.error);

      setEmployees(empRes.data || []);
      setContracts(contRes.data || []);
      setRenewals(renRes.data || []);
      setAppUsers(userRes.data || []);
    } catch (error) {
      console.error('Error fetching global context data from Supabase:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  return (
    <DataContext.Provider value={{ employees, contracts, renewals, appUsers, loading, refresh: refreshData }}>
      {children}
    </DataContext.Provider>
  );
}

// 🌟 تصدير الـ Hook للـ Named Import
export function useAppData() {
  return useContext(DataContext);
}

// تصدير افتراضي احتياطي لتفادي أي خطأ استيراد
export default useAppData;
