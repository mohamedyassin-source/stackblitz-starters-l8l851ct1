'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-supabase-js'; // أو الاستدعاء المباشر عبر API

export default function DataSyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const handleSyncFromSupabase = async () => {
    const confirmSync = window.confirm('هل أنت متأكد من سحب كافة البيانات من Supabase ونقلها إلى Firebase Firestore؟');
    if (!confirmSync) return;

    setSyncing(true);
    setStatusMsg('جاري الاتصال بـ Supabase وسحب البيانات... ⏳');

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('بيانات الاتصال بـ Supabase غير موجودة في ملف .env.local');
      }

      // 1. جلب الموظفين من Supabase عبر REST API المباشر
      const empRes = await fetch(`${supabaseUrl}/rest/v1/employees?select=*`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
      });
      const employeesData = await empRes.json();

      // 2. جلب العقود من Supabase
      const contRes = await fetch(`${supabaseUrl}/rest/v1/contracts?select=*`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
      });
      const contractsData = await contRes.json();

      if (!Array.isArray(employeesData)) {
        throw new Error('فشل في جلب جدول الموظفين من Supabase.');
      }

      setStatusMsg(`تم سحب ${employeesData.length} موظف و ${contractsData.length || 0} عقد. جاري رفع البيانات إلى Firebase... 📤`);

      // 3. كتابة الموظفين والعقود في Firebase باستخدام Batch
      const batch = writeBatch(db);

      // نقل الموظفين
      employeesData.forEach((emp: any) => {
        const empCode = String(emp.employee_code || emp.code || '').trim();
        if (empCode) {
          const empRef = doc(collection(db, 'employees'), empCode);
          batch.set(empRef, {
            employee_code: empCode,
            employee_name: emp.employee_name || emp.name || '',
            department: emp.department || '',
            job_title: emp.job_title || '',
            company: emp.company || '',
            national_id: emp.national_id || '',
            hiring_date: emp.hiring_date || null,
            contract_type: emp.contract_type || 'محدد المدة',
            status: emp.status || 'Active',
            role: emp.role || 'Employee'
          }, { merge: true });
        }
      });

      // نقل العقود
      if (Array.isArray(contractsData)) {
        contractsData.forEach((c: any) => {
          const empCode = String(c.employee_code || '').trim();
          if (empCode) {
            const contRef = doc(collection(db, 'contracts'));
            batch.set(contRef, {
              employee_code: empCode,
              contract_type: c.contract_type || 'محدد المدة',
              contract_start_date: c.contract_start_date || null,
              contract_end_date: c.contract_end_date || null,
              status: c.status || 'Active'
            }, { merge: true });
          }
        });
      }

      // إنشاء حساب الأدمن الافتراضي بجدول app_users
      const adminRef = doc(db, 'app_users', '1001');
      batch.set(adminRef, {
        username: 'Admin',
        password: '123',
        employee_code: '1001',
        role: 'Admin'
      }, { merge: true });

      await batch.commit();

      setStatusMsg('🎉 تم نقل البيانات بنجاح من Supabase إلى Firebase Firestore!');
      alert('تمت مزامنة ونقل كافة البيانات بنجاح! يمكنك الآن مراجعة Firebase Console ✅');
    } catch (err: any) {
      console.error(err);
      setStatusMsg('❌ حدث خطأ أثناء المزامنة: ' + err.message);
      alert('خطأ أثناء المزامنة: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ padding: '24px', direction: 'rtl' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '12px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#0f172a' }}>🔄 مزامنة واستيراد البيانات من Supabase</h3>
        <p style={{ margin: '0 0 20px', fontSize: '12px', color: '#64748b' }}>
          اضغط على الزر أدناه لسحب جميع بيانات الموظفين والعقود الموجودة في Supabase وتحويلها تلقائياً إلى Firebase Firestore.
        </p>

        <button
          onClick={handleSyncFromSupabase}
          disabled={syncing}
          style={{
            background: syncing ? '#64748b' : '#2563eb',
            color: '#fff',
            border: 0,
            padding: '12px 24px',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '13px',
            cursor: syncing ? 'not-allowed' : 'pointer'
          }}
        >
          {syncing ? 'جاري السحب والمزامنة...' : '⚡ سحب ونقل البيانات من Supabase إلى Firebase'}
        </button>

        {statusMsg && (
          <div style={{ marginTop: '20px', padding: '12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold' }}>
            {statusMsg}
          </div>
        )}
      </div>
    </div>
  );
}
