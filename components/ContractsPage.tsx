'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// تهيئة الاتصال بـ Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function ContractsPage() {
  const [employeesRaw, setEmployeesRaw] = useState<any[]>([]);
  const [renewalsRaw, setRenewalsRaw] = useState<any[]>([]);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // الفلاتر والترتيب
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
  const [deptSearchFilter, setDeptSearchFilter] = useState('');
  const deptDropdownRef = useRef<HTMLDivElement>(null);

  const [selectedType, setSelectedType] = useState('');
  const [expiryStatus, setExpiryStatus] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [selectedEmpCodes, setSelectedEmpCodes] = useState<string[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Modals States
  const [modalState, setModalState] = useState<{ isOpen: boolean; type: 'single' | 'bulk'; emp?: any }>({ isOpen: false, type: 'single' });
  const [renewalMode, setRenewalMode] = useState<'months' | 'custom'>('months');
  const [renewalMonths, setRenewalMonths] = useState<number>(12);
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);
  const [terminateEmployeeCode, setTerminateEmployeeCode] = useState('');
  const [terminateSearchTerm, setTerminateSearchTerm] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editEmpData, setEditEmpData] = useState<any>(null);

  const [isReactivateModalOpen, setIsReactivateModalOpen] = useState(false);
  const [reactivateEmployeeCode, setReactivateEmployeeCode] = useState('');
  const [reactivateSearchTerm, setReactivateSearchTerm] = useState('');
  const [reactivateDept, setReactivateDept] = useState('');

  // 🌟 جلب البيانات مباشرة من Supabase ودمجها بذكاء
  const refreshGlobalData = async () => {
    setGlobalLoading(true);
    try {
      const [empRes, contRes, renRes] = await Promise.all([
        supabase.from('employees').select('*'),
        supabase.from('contracts').select('*'),
        supabase.from('renewals').select('*')
      ]);

      if (empRes.error) throw empRes.error;

      // دمج العقود مع الموظفين أوتوماتيكياً في الواجهة
      const mergedEmployees = (empRes.data || []).map(emp => {
        const empContracts = (contRes.data || []).filter(c => String(c.employee_code) === String(emp.employee_code));
        // ترتيب العقود لنجلب الأحدث أولاً
        empContracts.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        return { ...emp, contracts: empContracts };
      });

      setEmployeesRaw(mergedEmployees);
      setRenewalsRaw(renRes.data || []);
    } catch (e) {
      console.error('Failed to fetch contracts from Supabase', e);
    } finally {
      setGlobalLoading(false);
    }
  };

  useEffect(() => {
    refreshGlobalData();
  }, []);

  const normalizeCode = (val: any) => String(val ?? '').trim();
  const dateToInput = (val: any) => (val ? new Date(val).toISOString().split('T')[0] : '');

  // معالجة بيانات الموظفين وتحديد العقد الأحدث
  const employees = useMemo(() => {
    return employeesRaw.map((emp) => {
      const latestContract = emp.contracts?.[0] || null;
      return {
        ...emp,
        contract_id: latestContract?.contract_id || null,
        contract_type: latestContract?.contract_type || emp.contract_type || 'محدد المدة',
        contract_start_date: dateToInput(latestContract?.contract_start_date || emp.hiring_date),
        contract_end_date: dateToInput(latestContract?.contract_end_date),
        contract_status: latestContract?.status || emp.status,
      };
    });
  }, [employeesRaw]);

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((end.getTime() - today.getTime()) / 86400000);
  };

  const filteredContracts = useMemo(() => {
    return employees.filter((emp) => {
      const term = searchTerm.toLowerCase();
      const days = getDaysRemaining(emp.contract_end_date);

      const matchesSearch =
        !term ||
        String(emp.employee_code).includes(term) ||
        String(emp.employee_name).toLowerCase().includes(term) ||
        String(emp.department).toLowerCase().includes(term);

      const matchesDept = selectedDepts.length === 0 || selectedDepts.includes(emp.department);
      let matchesType = !selectedType || emp.contract_type === selectedType;
      
      let matchesExpiry = true;
      if (expiryStatus === 'expiring_60') matchesExpiry = days !== null && days <= 60 && days >= 0;
      if (expiryStatus === 'expired') matchesExpiry = days !== null && days < 0;

      return matchesSearch && matchesDept && matchesType && matchesExpiry;
    });
  }, [employees, searchTerm, selectedDepts, selectedType, expiryStatus]);

  const totalPages = Math.ceil(filteredContracts.length / pageSize);
  const paginatedContracts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredContracts.slice(start, start + pageSize);
  }, [filteredContracts, currentPage]);

  // 🌟 إرسال الإجراءات لـ Supabase مباشرة
  const sendAction = async (payload: any) => {
    setActionLoading(true);
    try {
      const { action } = payload;

      // 1. إنهاء تعاقد
      if (action === 'terminate') {
        const code = parseInt(payload.employee_code, 10);
        
        const { error: empError } = await supabase
          .from('employees')
          .update({ status: 'Inactive', department: 'تحويلات/تحت الاعتماد' })
          .eq('employee_code', code);
        if (empError) throw empError;

        const { error: contError } = await supabase
          .from('contracts')
          .update({ status: 'Terminated', contract_type: 'إنهاء تعاقد' })
          .eq('employee_code', code)
          .eq('status', 'Active');
        if (contError) throw contError;

        alert('تم إنهاء التعاقد بنجاح ✅');
      }

      // 2. إعادة تفعيل موظف
      else if (action === 'reactivate') {
        const code = parseInt(payload.employee_code, 10);
        
        const { error: empError } = await supabase
          .from('employees')
          .update({ status: 'Active', department: payload.department })
          .eq('employee_code', code);
        if (empError) throw empError;

        const { error: contError } = await supabase
          .from('contracts')
          .update({ status: 'Active' })
          .eq('employee_code', code);
        if (contError) throw contError;

        alert('تم إعادة تفعيل الموظف بنجاح ✅');
      }

      // 3. تعديل أو إضافة عقد
      else if (action === 'edit_contract') {
        const code = parseInt(payload.employee_code, 10);
        
        if (payload.contract_id) {
          const { error } = await supabase
            .from('contracts')
            .update({
              contract_type: payload.contract_type,
              contract_start_date: payload.contract_start_date || null,
              contract_end_date: payload.contract_end_date || null,
            })
            .eq('contract_id', payload.contract_id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('contracts')
            .insert([{
              employee_code: code,
              contract_type: payload.contract_type,
              contract_start_date: payload.contract_start_date || null,
              contract_end_date: payload.contract_end_date || null,
              status: 'Active',
            }]);
          if (error) throw error;
        }
        alert('تم حفظ بيانات العقد بنجاح ✅');
      }

      // تحديث البيانات في الواجهة بعد نجاح العملية
      refreshGlobalData();

    } catch (e: any) {
      console.error(e);
      alert('خطأ في التنفيذ: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ paddingBottom: '40px', direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950)' }}>العقود الحالية السارية (Supabase)</h3>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--muted)' }}>سجل شامل للعقود والموظفين مباشرة من قاعدة بيانات Supabase</p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setIsReactivateModalOpen(true)} style={{ background: '#16a34a', color: '#fff', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
            🔄 عودة الغير نشطين
          </button>
          <button onClick={() => setIsTerminateModalOpen(true)} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
            ❌ إنهاء تعاقد
          </button>
        </div>
      </div>

      {/* شريط الفلاتر والجدول */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>
        <input type="text" placeholder="بحث بالاسم، الكود، الإدارة..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', outline: 'none', width: '250px' }} />
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', overflowX: 'auto' }}>
        {globalLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>جاري تحميل البيانات من Supabase... ⏳</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--line)' }}>
                <th style={{ padding: '12px' }}>الكود</th>
                <th style={{ padding: '12px' }}>الموظف</th>
                <th style={{ padding: '12px' }}>الإدارة</th>
                <th style={{ padding: '12px' }}>النوع</th>
                <th style={{ padding: '12px' }}>بداية العقد</th>
                <th style={{ padding: '12px' }}>نهاية العقد</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginatedContracts.length === 0 ? (
                 <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center' }}>لا توجد بيانات مطابقة</td></tr>
              ) : (
                paginatedContracts.map((emp) => (
                  <tr key={emp.employee_code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#dc2626' }}>{emp.employee_code}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold' }}>{emp.employee_name}</td>
                    <td style={{ padding: '10px' }}>{emp.department || '—'}</td>
                    <td style={{ padding: '10px', color: '#2563eb', fontWeight: 'bold' }}>{emp.contract_type}</td>
                    <td style={{ padding: '10px' }}>{emp.contract_start_date || '—'}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold' }}>{emp.contract_end_date || '—'}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <button onClick={() => { setEditEmpData(emp); setIsEditModalOpen(true); }} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                        ✏️ تعديل
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
