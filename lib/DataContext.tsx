'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

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
      // 1. الموظفين
      const empSnap = await getDocs(collection(db, 'employees'));
      const empData = empSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

      // 2. العقود
      const contSnap = await getDocs(collection(db, 'contracts'));
      const contData = contSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

      // 3. طلبات التجديد
      const renSnap = await getDocs(collection(db, 'renewal_requests'));
      const renData = renSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

      // 4. مستخدمي النظام
      const userSnap = await getDocs(collection(db, 'app_users'));
      const userData = userSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

      setEmployees(empData);
      setContracts(contData);
      setRenewals(renData);
      setAppUsers(userData);
    } catch (error) {
      console.error('Error fetching global context data from Firebase:', error);
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
