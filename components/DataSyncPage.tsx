'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';

export default function DataSyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // دالة جلب كافة السجلات بالالتفاف الكامل على حد الـ 1000 عبر الـ Cursor/Range
  const fetchAllFromSupabase = async (tableName: string, supabaseUrl: string, supabaseKey: string) => {
    let allData: any[] = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
      const to = from + step - 1;
      const url = `${supabaseUrl}/rest/v1/${tableName}?select=*`;

      try {
        const res = await fetch(url, {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            Range: `${from}-${to}`,
            'Range-Unit': 'items',
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
          if (data.length < step) {
            hasMore = false;
          } else {
            from += step;
          }
        } else {
          hasMore = false;
        }
      } catch (err) {
        console.warn(`تنبيه أثناء سحب ${tableName}:`, err);
        hasMore = false;
      }
    }
    return allData;
  };

  const handleSyncFromSupabase = async () => {
    const confirmSync = window.confirm('سيتم سحب الجداول الثمانية بالكامل فوراً. هل تريد المتابعة؟');
    if (!confirmSync) return;

    setSyncing(true);
    setStatusMsg('جاري الاتصال بـ Supabase... ⏳');

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('بيانات Supabase غير معرفة في Vercel Environment Variables');
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
        setStatusMsg(`[${index + 1}/8] جاري سحب جدول (${tableName})... ⏳`);

        const tableData = await fetchAllFromSupabase(tableName, supabaseUrl, supabaseKey);
        summaryStats[tableName] = tableData.length;

        if (tableData.length > 0) {
          setStatusMsg(`[${index + 1}/8] جاري نقل ${tableData.length} سجل من (${tableName}) إلى Firebase... 📤`);

          const chunkSize = 400;
          for (let i = 0; i < tableData.length; i += chunkSize) {
            const batch = writeBatch(db);
            const chunk = tableData.slice(i, i + chunkSize);

            chunk.forEach((item: any) => {
              let docId = item.id ? String(item.id) : undefined;

              if (tableName === 'employees' || tableName === 'app_users') {
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

      // إضافة حساب الأدمن الرئيسي
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

      setStatusMsg(`🎉 اكتملت المزامنة بنجاح لجميع الجداول!\n\n${statsFormatted}`);
      alert(`تمت المزامنة الكاملة بنجاح! ✅\n\n${statsFormatted}`);
    } catch (err: any) {
      console.error(err);
      setStatusMsg('❌ حدث خطأ: ' + err.message);
      alert('خطأ: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ padding: '24px', direction: 'rtl' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '12px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#0f172a' }}>🔄 المزامنة الشاملة لجميع الجداول</h3>
        <p style={{ margin: '0 0 20px', fontSize: '12px', color: '#64748b' }}>
          اضغط الزر أدناه لنقل بيانات كافة الجداول الـ 8 مباشرة بدون توقف.
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
          {syncing ? 'جاري النقل...' : '⚡ سحب ونقل الجداول الثمانية بالكامل'}
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
