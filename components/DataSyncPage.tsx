'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, getDocs } from 'firebase/firestore';
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

  const calculateContractEndDate = (hiringDateStr: string) => {
    if (!hiringDateStr) return null;
    const date = new Date(hiringDateStr);
    if (isNaN(date.getTime())) return null;

    date.setFullYear(date.getFullYear() + 1);
    date.setDate(date.getDate() - 1);

    return date.toISOString().split('T')[0];
  };

  const determineEmployeeStatus = (dept: string, jobTitle: string) => {
    const cleanDept = String(dept || '').trim().toLowerCase();
    const cleanJob = String(jobTitle || '').trim().toLowerCase();

    const isTransferDept = cleanDept.includes('تحويل') || cleanDept.includes('تحويلات') || cleanDept.includes('تحت الاعتماد');

    if (isTransferDept) {
      const isActiveException = 
        cleanJob.includes('اجازة بدون راتب') || 
        cleanJob.includes('إجازة بدون راتب') ||
        cleanJob.includes('بدون تحضير') || 
        cleanJob.includes('تحقيقات');

      return isActiveException ? 'Active' : 'Inactive';
    }

    return 'Active';
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

        setStatusMsg(`تم جلب ${rows.length} صف من الملف. جاري مطابقة البيانات مع Firebase... 🔍`);

        const empSnap = await getDocs(collection(db, 'employees'));
        const existingEmpCodes = new Set<string>();
        empSnap.forEach((doc) => {
          const code = String(doc.data().employee_code || doc.id).trim();
          if (code) existingEmpCodes.add(code);
        });

        let updatedCount = 0;
        let newCount = 0;

        const chunkSize = 400;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const batch = writeBatch(db);
          const chunk = rows.slice(i, i + chunkSize);

          chunk.forEach((row) => {
            const empCode = String(
              row.employee_code || row.EmployeeCode || row.code || row.Code || row['كود الموظف'] || ''
            ).trim();

            if (!empCode) return;

            const dept = String(row.department || row.Department || row['الإدارة'] || '').trim();
            const jobTitle = String(row.job_title || row.JobTitle || row['الوظيفة'] || '').trim();
            const company = String(row.company || row.Company || row['الشركة'] || '').trim();
            const empName = String(row.employee_name || row.EmployeeName || row.name || row['اسم الموظف'] || '').trim();
            const nationalId = String(row.national_id || row.NationalID || row['الرقم القومي'] || '').trim();
            const hiringDate = String(row.hiring_date || row.HiringDate || row['تاريخ التعيين'] || '').trim();
            const mobile = String(row.mobile || row.Mobile || row['الموبايل'] || '').trim();
            const email = String(row.email || row.Email || row['البريد الإلكتروني'] || '').trim();

            const calculatedStatus = determineEmployeeStatus(dept, jobTitle);
            const empRef = doc(db, 'employees', empCode);

            if (existingEmpCodes.has(empCode)) {
              batch.set(empRef, {
                department: dept,
                job_title: jobTitle,
                status: calculatedStatus,
                ...(company && { company }),
              }, { merge: true });

              updatedCount++;
            } else {
              batch.set(empRef, {
                employee_code: empCode,
                employee_name: empName,
                national_id: nationalId,
                department: dept,
                job_title: jobTitle,
                company: company,
                hiring_date: hiringDate || null,
                contract_type: 'محدد المدة',
                status: calculatedStatus,
                mobile: mobile,
                email: email,
              }, { merge: true });

              const contractEndDate = calculateContractEndDate(hiringDate);
              const contRef = doc(collection(db, 'contracts'));
              batch.set(contRef, {
                employee_code: empCode,
                contract_type: 'محدد المدة',
                contract_start_date: hiringDate || null,
                contract_end_date: contractEndDate,
                status: calculatedStatus,
              }, { merge: true });

              newCount++;
            }
          });

          await batch.commit();
        }

        setStatusMsg(`🎉 اكتملت العملية بنجاح!\n\n• تم تحديث (الوظيفة والإدارة): ${updatedCount} موظف موجود.\n• تم إضافة موظفين وعقود جديدة: ${newCount} موظف جديد.`);
        alert(`تمت معالجة ملف الإكسيل بنجاح! ✅\n\nتحديث الموظفين الحاليين: ${updatedCount}\nإضافة موظفين وعقود جديدة: ${newCount}`);
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
              📊 تحديث واستيراد بيانات الموظفين والعقود عبر Excel
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
              تحديث الإدارة والوظيفة للموجودين، وإضافة الجدد مع إنشاء عقد محدد تلقائياً.
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
