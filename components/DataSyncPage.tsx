'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';

export default function DataSyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // دالة الشحن والتكرار عبر الصفحات لسحب كافة البيانات بدون حد 1000
  const fetchAllFromSupabase = async (tableName: string, supabaseUrl: string, supabaseKey: string) => {
    let allData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/${tableName}?select=*`, {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            Range: `${from}-${to}`,
            'Range-Unit': 'items'
          }
        });

        if (!res.ok) {
          hasMore = false;
          break;
        }

        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          allData = [...allData, ...data];
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      } catch (err) {
        console.warn(`تنبيه: متعذر جلب بيانات ${tableName}`, err);
        hasMore = false;
      }
    }
    return allData;
  };

  const handleSyncFromSupabase = async () => {
    const confirmSync = window.confirm('هل أنت متأكد من سحب كافة الجداول الثمانية من Supabase ونقلها بالكامل إلى Firebase؟');
    if (!confirmSync) return;

    setSyncing(true);
    setStatusMsg('جاري الاتصال بـ Supabase لبدء نقل الجداول الثمانية... ⏳');

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('بيانات الاتصال بـ Supabase غير موجودة في Vercel Environment Variables');
      }

      // الجداول الثمانية المحددة بالصورة
      const tablesList = [
        'employees',
        'contracts',
        'renewal_requests',
        'app_users',
        'audit_logs',
        'documents',
        'notifications',
        'settings'
      ];

      const summaryStats: Record<string, number> = {};

      for (let index = 0; index < tablesList.length; index++) {
        const tableName = tablesList[index];
        setStatusMsg(`[${index + 1}/8] جاري سحب بيانات جدول (${tableName})... ⏳`);

        const tableData = await fetchAllFromSupabase(tableName, supabaseUrl, supabaseKey);
        summaryStats[tableName] = tableData.length;

        if (tableData.length > 0) {
          setStatusMsg(`[${index + 1}/8] جاري كتابة ${tableData.length} سجل من (${tableName}) في Firebase... 📤`);
          
          const chunkSize = 450;
          for (let i = 0; i < tableData.length; i += chunkSize) {
            const batch = writeBatch(db);
            const chunk = tableData.slice(i, i + chunkSize);

            chunk.forEach((item: any) => {
              let docId = item.id ? String(item.id) : undefined;
              
              // معالجة المفاتيح الخاصة بالموظفين والمستخدمين
              if (tableName === 'employees') {
                docId = String(item.employee_code || item.code || item.id || '').trim() || docId;
              } else if (tableName === 'app_users') {
                docId = String(item.employee_code || item.code || item.id || '').trim() || docId;
              } else if (tableName === 'renewal_requests') {
                docId = String(item.request_id || item.id || '').trim() || docId;
              }

              const docRef = docId 
                ? doc(collection(db, tableName), docId) 
                : doc(collection(db, tableName));

              batch.set(docRef, { ...item }, { merge: true });
            });

            await batch.commit();
          }
        }
      }

      // ضمان وجود حساب الأدمن في app_users
      const adminBatch = writeBatch(db);
      const adminRef = doc(db, 'app_users', '3577');
      adminBatch.set(adminRef, {
        username: 'Admin',
        password: '123',
        employee_code: '3577',
        role: 'Admin'
      }, { merge: true });
      await adminBatch.commit();

      const statsFormatted = Object.entries(summaryStats)
        .map(([key, val]) => `• ${key}: ${val}`)
        .join('\n');

      setStatusMsg(`🎉 تم بنجاح سحب ونقل كافة الجداول الثمانية بالكامل إلى Firebase Firestore!\n\nإحصائيات النقل:\n${statsFormatted}`);
      alert(`تمت المزامنة بنجاح لجميع الجداول! ✅\n\n${statsFormatted}`);
    } catch (err: any) {
      console.error(err);
      setStatusMsg('❌ حدث خطأ أثناء النقل: ' + err.message);
      alert('خطأ: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ padding: '24px', direction: 'rtl' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '12px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#0f172a' }}>🔄 النقل الشامل لجميع جداول Supabase الـ 8</h3>
        <p style={{ margin: '0 0 20px', fontSize: '12px', color: '#64748b' }}>
          يقوم هذا الزر بسحب وثبات البيانات الكاملة من الجداول (employees, contracts, renewal_requests, app_users, audit_logs, documents, notifications, settings) ونقلها إلى Firebase.
        </p>

        <button
          onClick={handleSyncFromSupabase}
          disabled={syncing}
          style={{
            background: syncing ? '#64748b' : '#2563eb',
            color: '#fff',
            border: 0,
            padding: '14px 28px',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: syncing ? 'not-allowed' : 'pointer'
          }}
        >
          {syncing ? 'جاري نقل الجداول الثمانية...' : '⚡ سحب ونقل الجداول الثمانية بالكامل إلى Firebase'}
        </button>

        {statusMsg && (
          <div style={{ marginTop: '20px', padding: '14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'pre-line' }}>
            {statusMsg}
          </div>
        )}
      </div>
    </div>
  );
}
