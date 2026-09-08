'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase'; // ربطناها بملف فايربيز الجديد بتاعك

interface AppDataContextType {
  employees: any[];
  contracts: any[];
  renewals: any[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType>({
  employees: [],
  contracts: [],
  renewals: [],
  loading: true,
  refresh: async () => {},
});

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 🌟 الدالة الصاروخية لجلب البيانات من فايربيز
  const refresh = async () => {
    setLoading(true);
    try {
      // 1. جلب كل الموظفين
      const empSnapshot = await getDocs(collection(db, 'employees'));
      const empList = empSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 2. جلب كل العقود
      const contSnapshot = await getDocs(collection(db, 'contracts'));
      const contList = contSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 3. جلب طلبات التجديد
      const renSnapshot = await getDocs(collection(db, 'renewal_requests'));
      const renList = renSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      setEmployees(empList);
      setContracts(contList);
      setRenewals(renList);

      console.log('🔥 تم سحب البيانات من فايربيز بنجاح!');
    } catch (error) {
      console.error('❌ خطأ أثناء سحب البيانات من فايربيز:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <AppDataContext.Provider value={{ employees, contracts, renewals, loading, refresh }}>
      {children}
    </AppDataContext.Provider>
  );
};

export const useAppData = () => useContext(AppDataContext);
