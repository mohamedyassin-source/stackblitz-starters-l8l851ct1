'use client';
import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';
import * as XLSX from 'xlsx';

// 🌟 القاموس المعتمد لمطابقة أسماء العواميد
const COLUMN_MAP: Record<string, string[]> = {
  employee_code: ['employee_code', 'employee_code2', 'كود الموظف', 'كود', 'الكود'],
  employee_name: ['employee_name', 'اسم الموظف', 'الاسم'],
  national_id: ['national_id', 'id_no', 'الرقم القومي'],
  department: ['department', 'الإدارة', 'القسم'],
  company: ['company', 'comany_name', 'company_name', 'الشركة'],
  job_title: ['job_title', 'الوظيفة', 'المسمى الوظيفي'],
  email: ['email', 'البريد'],
  mobile: ['mobile', 'الموبايل', 'الهاتف'],
  hiring_date: ['hiring_date', 'تاريخ التعيين'],
  contract_end_date: ['contract_end_date', 'contract end date', 'تاريخ نهاية العقد', 'نهاية العقد'],
  contract_type: ['contract_type', 'contract type', 'نوع العقد'],
};

// 🌟 دالة قراءة وتنسيق التاريخ الفولاذية
const parseExcelDateStrict = (val: any): string | null => {
  if (val === undefined || val === null || val === '') return null;

  const toIso = (y: number, m: number, d: number) => {
    if (!y || !m || !d || isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return toIso(val.getUTCFullYear(), val.getUTCMonth() + 1, val.getUTCDate());
  }

  if (typeof val === 'number') {
    const ms = Date.UTC(1899, 11, 30) + Math.round(val) * 86400000;
    const d = new Date(ms);
    return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return null;

    let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return toIso(+m[1], +m[2], +m[3]);

    m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (m) return toIso(+m[3], +m[2], +m[1]);

    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return toIso(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }
  return null;
};

// توحيد الأكواد وإزالة الأصفار على الشمال
const normalizeCode = (v: any) => String(v).trim().replace(/^0+(?=\d)/, '');

export default function DataSyncPage() {
  const { employees, refresh: fetchEmployees } = useAppData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setTotalStats] = useState({ totalRows: 0, updated: 0, skipped: 0, warnings: 0 });

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('ar-EG');
    setLogs(prev => [`[${time}] ${msg}`, ...prev]);
  };

  // 1. تنزيل القالب المعتمد للبيانات الحالية من Supabase
  const handleDownloadTemplate = () => {
    if (!employees || employees.length === 0) {
      alert('⚠️ لا توجد بيانات موظفين حالية لتصدير القالب.');
      return;
    }

    const templateData = employees.map(e => ({
      employee_code: e.employee_code || '',
      employee_name: e.employee_name || '',
      job_title: e.job_title || '',
      department: e.department || '',
      national_id: e.national_id || '',
      mobile: e.mobile || '',
      hiring_date: e.hiring_date || '',
      contract_end_date: e.contract_end_date || '',
      contract_type: e.contract_type || '',
      company: e.company || ''
    }));

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Supabase');
    XLSX.writeFile(wb, `HR_Employees_Template_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // 2. معالجة الرفع والتحديث المجمع مع Log تفصيلي
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setLogs([]);
    setTotalStats({ totalRows: 0, updated: 0, skipped: 0, warnings: 0 });

    addLog(`بدء معالجة الملف: ${file.name}...`);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const excelRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: undefined, raw: true });

      if (excelRows.length === 0) {
        addLog('❌ الملف المرفوع فارغ تماماً.');
        alert('⚠️ الملف المرفوع فارغ.');
        return;
      }

      addLog(`تم قراءة ${excelRows.length} صف من الإكسيل.`);

      // جلب جميع البيانات الحالية لكسر حاجز 1000 موظف في Supabase
      addLog('جاري سحب كافة الموظفين من قاعدة البيانات للمطابقة الدقيقة...');
      let allExistingEmps: any[] = [];
      let fromIdx = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase.from('employees').select('*').range(fromIdx, fromIdx + step - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allExistingEmps.push(...data);
        if (data.length < step) break;
        fromIdx += step;
      }

      addLog(`تم الربط مع ${allExistingEmps.length} موظف مسجل في Supabase بنجاح.`);

      const existingMap = new Map(allExistingEmps.map(emp => [normalizeCode(emp.employee_code), emp]));

      const getVal = (rowObj: any, keys: string[]) => {
        for (const k of keys) {
          const val = rowObj[k.toLowerCase()];
          if (val !== undefined && val !== null && String(val).trim() !== '') return val;
        }
        return undefined;
      };

      let skippedCount = 0;
      let dateWarnCount = 0;

      const formattedRows = excelRows.map((rawRow: any, idx: number) => {
        const row: any = {};
        for (const k of Object.keys(rawRow)) row[k.trim().toLowerCase()] = rawRow[k];

        const codeVal = getVal(row, COLUMN_MAP.employee_code);
        if (!codeVal) {
          skippedCount++;
          addLog(`⚠️ تحذير: صف ${idx + 2} اتجاهل بسبب عدم وجود كود موظف.`);
          return null;
        }

        const code = String(codeVal).trim();
        const existingEmp = existingMap.get(normalizeCode(code)) || {};
        const isNew = Object.keys(existingEmp).length === 0;

        // التحديث الجزئي: يبدأ بالداتا القديمة كأصل
        const payload: any = { ...existingEmp };
        payload.employee_id = existingEmp.employee_id || `EMP-${code}`;
        payload.employee_code = existingEmp.employee_code || code;

        const textFields: [string, string[]][] = [
          ['employee_name', COLUMN_MAP.employee_name],
          ['national_id', COLUMN_MAP.national_id],
          ['department', COLUMN_MAP.department],
          ['company', COLUMN_MAP.company],
          ['job_title', COLUMN_MAP.job_title],
          ['email', COLUMN_MAP.email],
          ['mobile', COLUMN_MAP.mobile],
        ];

        for (const [field, keys] of textFields) {
          const v = getVal(row, keys);
          if (v !== undefined) payload[field] = String(v).trim();
        }

        // التواريخ
        const valHiring = getVal(row, COLUMN_MAP.hiring_date);
        if (valHiring !== undefined) {
          const parsed = parseExcelDateStrict(valHiring);
          if (parsed) payload.hiring_date = parsed;
          else {
            dateWarnCount++;
            addLog(`⚠️ صف ${idx + 2} (كود ${code}): تاريخ التعيين غير مفهوم "${valHiring}" -> تم الاحتفاظ بالقديم.`);
          }
        }

        const valEnd = getVal(row, COLUMN_MAP.contract_end_date);
        if (valEnd !== undefined) {
          const parsed = parseExcelDateStrict(valEnd);
          if (parsed) payload.contract_end_date = parsed;
          else {
            dateWarnCount++;
            addLog(`⚠️ صف ${idx + 2} (كود ${code}): تاريخ نهاية العقد غير مفهوم "${valEnd}" -> تم الاحتفاظ بالقديم.`);
          }
        }

        // نوع العقد
        const valType = getVal(row, COLUMN_MAP.contract_type);
        if (valType !== undefined) {
          const strType = String(valType).trim();
          if (strType.includes('دائم') || strType.toLowerCase().includes('perm')) payload.contract_type = 'دائم';
          else if (strType.includes('فوق السن')) payload.contract_type = 'محدد المدة - فوق السن';
          else payload.contract_type = strType;
        }

        // تحويلات تحت الاعتماد
        if (payload.department === 'تحويلات تحت الاعتماد') payload.status = 'Inactive';
        else if (!payload.status) payload.status = 'Active';

        // الموظف الجديد
        if (isNew) {
          addLog(`🆕 موظف جديد مكتشف بالكود: ${code} - سيتم إضافة سجل جديد له.`);
          if (!payload.contract_type) payload.contract_type = 'محدد المدة';
          if (payload.hiring_date && !payload.contract_end_date && payload.contract_type !== 'دائم') {
            const [y, m, d] = payload.hiring_date.split('-').map(Number);
            const end = new Date(Date.UTC(y + 1, m - 1, d - 1));
            payload.contract_end_date = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(end.getUTCDate()).padStart(2, '0')}`;
          }
        }

        if (payload.contract_type === 'دائم' || payload.contract_type === 'Permanent') {
          payload.contract_end_date = null;
        }

        return payload;
      }).filter(r => r !== null) as any[];

      addLog(`تجهيز ${formattedRows.length} سجل متطابق للرفع إلى Supabase...`);

      let updatedCount = 0;
      for (let i = 0; i < formattedRows.length; i += 1000) {
        const chunk = formattedRows.slice(i, i + 1000);
        const { error } = await supabase.from('employees').upsert(chunk, { onConflict: 'employee_code' });
        if (error) {
          addLog(`❌ خطأ في الدفعة ${Math.floor(i / 1000) + 1}: ${error.message}`);
        } else {
          updatedCount += chunk.length;
          addLog(`✅ تم تحديث الدفعة (${chunk.length} موظف) بنجاح.`);
        }
      }

      setTotalStats({
        totalRows: excelRows.length,
        updated: updatedCount,
        skipped: skippedCount,
        warnings: dateWarnCount
      });

      addLog(`🎉 اكتملت عملية التحديث بالكامل! تم تحديث ${updatedCount} موظف.`);
      await fetchEmployees();
    } catch (err: any) {
      addLog(`❌ خطأ عام: ${err.message}`);
      alert('❌ حدث خطأ أثناء التحديث: ' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-in-out' }}>
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept=".xlsx, .xls" 
        style={{ display: 'none' }} 
      />

      {/* رأس الصفحة */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '20px', color: 'var(--navy-950, #0f172a)', fontWeight: '800' }}>🔄 مركز تحديث واستيراد البيانات المجمع</h3>
        <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)', fontWeight: 'bold' }}>
          رفع ملفات الإكسيل لتحديث بيانات الموظفين والعقود في Supabase مع تقارير السجل المباشر
        </p>
      </div>

      {/* كروت الخطوات والإجراءات */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        
        {/* كارت 1: تنزيل القالب المعتمد */}
        <div className="db-card" style={{ background: 'var(--paper-card, #fff)', border: '1px solid var(--line, #e2e8f0)', padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: '#e0f2fe', color: '#0284c7', width: '40px', height: '40px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '18px', fontWeight: 'bold' }}>1</div>
            <div>
              <h4 style={{ margin: 0, fontSize: '14px', color: '#0f172a' }}>تنزيل القالب الرسمي (Template)</h4>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>حمل الشيت المتوافق بالمللي مع أسماء عواميد الداتا بيز الحالية</p>
            </div>
          </div>
          <button 
            onClick={handleDownloadTemplate} 
            style={{ width: '100%', background: '#0284c7', color: '#fff', border: 0, padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            📄 تنزيل شيت الموظفين المعتمد (Excel)
          </button>
        </div>

        {/* كارت 2: رفع الشيت والتحديث */}
        <div className="db-card" style={{ background: 'var(--paper-card, #fff)', border: '1px solid var(--line, #e2e8f0)', padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: '#dcfce7', color: '#16a34a', width: '40px', height: '40px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '18px', fontWeight: 'bold' }}>2</div>
            <div>
              <h4 style={{ margin: 0, fontSize: '14px', color: '#0f172a' }}>رفع الشيت وتحديث قاعدة البيانات</h4>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>سيتم تحديث الخلايا المعدلة فقط والحفاظ على بقية البيانات</p>
            </div>
          </div>
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={uploading}
            style={{ width: '100%', background: '#16a34a', color: '#fff', border: 0, padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1 }}
          >
            {uploading ? 'جاري الفحص والتحديث... ⏳' : '📤 اختيار ملف الإكسيل ورفعه'}
          </button>
        </div>

      </div>

      {/* كروت الإحصائيات بعد الرفع */}
      {stats.totalRows > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px', animation: 'fadeIn 0.3s' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>إجمالي الصفوف</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>{stats.totalRows}</div>
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold' }}>تم تحديثهم بصلابة</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#16a34a' }}>{stats.updated}</div>
          </div>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: 'bold' }}>صفوف اتجاهلت (بدون كود)</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#dc2626' }}>{stats.skipped}</div>
          </div>
          <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#d97706', fontWeight: 'bold' }}>تحذيرات التواريخ</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#d97706' }}>{stats.warnings}</div>
          </div>
        </div>
      )}

      {/* نافذة السجل الحي Live Error & Action Log Terminal */}
      <div className="db-card" style={{ background: '#0f172a', color: '#38bdf8', padding: '16px', borderRadius: '12px', border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🖥️</span> سجل معالجة البيانات المباشر (Live Sync Terminal Log)
          </div>
          {logs.length > 0 && (
            <button onClick={() => setLogs([])} style={{ background: 'transparent', border: '1px solid #475569', color: '#94a3b8', padding: '3px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>مسح السجل</button>
          )}
        </div>

        <div style={{ fontFamily: 'monospace', fontSize: '11.5px', height: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', direction: 'ltr', textAlign: 'left', paddingRight: '10px' }}>
          {logs.length === 0 ? (
            <div style={{ color: '#64748b', fontStyle: 'italic', paddingTop: '100px', textAlign: 'center' }}>
              السجل فارغ. قم برفع ملف إكسيل لبدء الفحص وإظهار التقرير هنا...
            </div>
          ) : (
            logs.map((log, index) => {
              let logColor = '#38bdf8'; // أزرق افتراضي
              if (log.includes('✅') || log.includes('🎉')) logColor = '#4ade80'; // أخضر
              if (log.includes('⚠️') || log.includes('🆕')) logColor = '#fbbf24'; // أصفر
              if (log.includes('❌')) logColor = '#f87171'; // أحمر

              return (
                <div key={index} style={{ color: logColor, borderBottom: '1px solid #1e293b', paddingBottom: '2px' }}>
                  {log}
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
