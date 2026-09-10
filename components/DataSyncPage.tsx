'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';

export default function DataSyncPage() {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // دالة إنشاء وتحميل قالب Excel جاهز
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'كود الموظف': '1001',
        'اسم الموظف': 'أحمد محمد علي',
        'الرقم القومي': '29001010101234',
        'الإدارة': 'الموارد البشرية',
        'الوظيفة': 'أخصائي HR',
        'الشركة': 'المراسم الدولية',
        'تاريخ التعيين': '2024-01-01',
        'الموبايل': '01012345678',
        'البريد الإلكتروني': 'ahmed@company.com',
      },
      {
        'كود الموظف': '1002',
        'اسم الموظف': 'محمود إبراهيم',
        'الرقم القومي': '29505050105678',
        'الإدارة': 'تحويلات/تحت الاعتماد',
        'الوظيفة': 'ايقاف راتب - اجازة بدون راتب',
        'الشركة': 'المراسم الدولية',
        'تاريخ التعيين': '2023-05-15',
        'الموبايل': '01198765432',
        'البريد الإلكتروني': 'mahmoud@company.com',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'قالب_الموظفين');

    // تصدير وتحميل الملف
    XLSX.writeFile(workbook, 'Template_Employees_Import.xlsx');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatusMsg('جاري قراءة واستخراج البيانات من ملف Excel... ⏳');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        if (rows.length === 0) {
          throw new Error('ملف Excel فارغ أو غير صالح.');
        }

        setStatusMsg(`تم جلب ${rows.length} صف من الملف. جاري المعالجة والتحديث في Neon PostgreSQL... 🔍`);

        // إرسال الصفوف إلى مسار API في السيرفر
        const res = await fetch('/api/sync/excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows }),
        });

        const data = await res.json();

        if (data.success) {
          setStatusMsg(data.message);
          alert(`تمت معالجة ملف الإكسيل بنجاح! ✅\n\nتحديث الموظفين الحاليين: ${data.updatedCount}\nإضافة موظفين وعقود جديدة: ${data.newCount}`);
        } else {
          throw new Error(data.error || 'حدث خطأ أثناء حفظ البيانات.');
        }
      } catch (err: any) {
        console.error(err);
        setStatusMsg('❌ حدث خطأ أثناء معالجة الملف: ' + err.message);
        alert('خطأ: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  return (
    <div style={{ padding: '24px', direction: 'rtl' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '20px', color: '#0f172a', fontWeight: '900' }}>
              📊 تحديث واستيراد بيانات الموظفين والعقود عبر Excel (Neon DB)
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
              تحديث الإدارة والوظيفة للموجودين، وإضافة الجدد مع إنشاء عقد محدد تلقائياً في قاعدة البيانات.
            </p>
          </div>

          {/* زر تحميل القالب */}
          <button
            onClick={handleDownloadTemplate}
            style={{
              background: '#10b981',
              color: '#fff',
              border: 0,
              padding: '10px 18px',
              borderRadius: '8px',
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(16,185,129,0.2)',
            }}
          >
            📥 تحميل قالب Excel الاسترشادي
          </button>
        </div>

        {/* منطقة رفع الملف */}
        <div style={{ border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '32px', textAlign: 'center', background: '#f8fafc', marginBottom: '20px' }}>
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            disabled={loading}
            id="excel-upload-input"
            style={{ display: 'none' }}
          />
          <label
            htmlFor="excel-upload-input"
            style={{
              background: loading ? '#64748b' : '#2563eb',
              color: '#fff',
              padding: '12px 24px',
              borderRadius: '8px',
              fontWeight: 'bold',
              fontSize: '13px',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'inline-block'
            }}
          >
            {loading ? 'جاري المعالجة والحفظ...' : '📁 اختر ملف Excel المعبأ للاستيراد والتحديث'}
          </label>
        </div>

        {/* رسالة الحالة والتفاصيل */}
        {statusMsg && (
          <div style={{ padding: '16px', borderRadius: '10px', background: '#f1f5f9', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'pre-line', color: '#0f172a' }}>
            {statusMsg}
          </div>
        )}
      </div>
    </div>
  );
}
