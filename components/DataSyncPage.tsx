'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';

export default function DataSyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // دالة متطورة لسحب كل البيانات بالالتفاف على سقف الـ 1000 المكونة في Supabase
  const fetchAllFromSupabase = async (tableName: string, supabaseUrl: string, supabaseKey: string) => {
    let allData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      // استخدام البارامترات المباشرة لطلب النطاق من Supabase REST API
      const url = `${supabaseUrl}/rest/v1/${tableName}?select=*&offset=${from}&limit=${pageSize}`;

      try {
        const res = await fetch(url, {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Range-Unit': 'items',
            Range: `${from}-${to}`,
            Prefer: 'count=exact'
          }
        });

        if (!res.ok) {
          hasMore = false;
          break;
        }

        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          allData = [...allData, ...data];
          // إذا كان العدد الجاري سحبه أقل من 1000، فهذا يعني وصولنا لنهاية السجلات
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      } catch (err) {
        console.warn(`خطأ أثناء سحب ${tableName}:`, err);
        hasMore = false;
      }
    }
    return allData;
  };

  const handleSyncFromSupabase = async () => {
    const confirmSync = window.confirm('هل أنت متأكد من سحب كافة الجداول الثمانية بدون أي حد للبيانات ونقلها لـ Firebase؟');
    if (!confirmSync) return;

    setSyncing(true);
    setStatusMsg('جاري الاتصال بـ Supabase وبدء سحب الجداول كاملاً... ⏳');

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('بيانات الاتصال بـ Supabase غير موجودة في Vercel Environment Variables');
      }

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
        setStatusMsg(`[${index + 1}/8] جاري سحب كافة صفوف جدول (${tableName})... ⏳`);

        const tableData = await fetchAllFromSupabase(tableName, supabaseUrl, supabaseKey);
        summaryStats[tableName] = tableData.length;

        if (tableData.length > 0) {
          setStatusMsg(`[${index + 1}/8] جاري كتابة إجمالي ${tableData.length} سجل من (${tableName}) في Firebase... 📤`);

          const chunkSize = 400; // حجم الدفعة لعدم تجاوز سقف فايربيز
          for (let i = 0; i < tableData.length; i += chunkSize) {
            const batch = writeBatch(db);
            const chunk = tableData.slice(i, i + chunkSize);

            chunk.forEach((item: any) => {
              let docId = item.id ? String(item.id) : undefined;

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

      // تأكيد وجود حساب الأدمن
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
        .map(([key, val]) => `• ${key}: ${val} سجل`)
        .join('\n');

      setStatusMsg(`🎉 تم سحب ونقل كافة الجداول بنجاح ودون أي حد متبقي!\n\nنتائج المزامنة:\n${statsFormatted}`);
      alert(`تمت المزامنة بنجاح! ✅\n\n${statsFormatted}`);
    } catch (err: any) {
      console.error(err);
      setStatusMsg('❌ حدث خطأ أثناء المزامنة: ' + err.message);
      alert('خطأ: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ padding: '24px', direction: 'rtl' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '12px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#0f172a' }}>🔄 المزامنة الشاملة والكاملة لجميع البيانات</h3>
        <p style={{ margin: '0 0 20px', fontSize: '12px', color: '#64748b' }}>
          هذا الخيار يتخطى حظر الـ 1000 عنصر المفرض في Supabase ويسحب كافة البيانات كاملة.
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
          {syncing ? 'جاري السحب والمزامنة الشاملة...' : '⚡ سحب كل الموظفين والجداول بدون استثناء'}
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
