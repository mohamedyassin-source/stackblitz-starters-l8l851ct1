'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { useAppData } from '@/lib/DataContext';

// دوال حساب التواريخ
const calculateNewStartDate = (oldEndDateStr: string | null | undefined) => {
  if (!oldEndDateStr) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const parts = String(oldEndDateStr).split('-');
  if (parts.length < 3) return oldEndDateStr;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const calculateNewEndDateFromStart = (startDateStr: string | null, monthsToAdd: number) => {
  if (!startDateStr) return null;
  const parts = String(startDateStr).split('-');
  if (parts.length < 3) return null;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
  d.setMonth(d.getMonth() + monthsToAdd);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 🌟 حاسبة سن التقاعد (60 سنة)
const calculateRetirementDate = (birthDate: string | null | undefined) => {
  if (!birthDate) return null;
  const date = new Date(birthDate);
  if (isNaN(date.getTime())) return null;
  date.setFullYear(date.getFullYear() + 60);
  return date.toISOString().split('T')[0];
};

export default function RenewalsPage() {
  const { refresh: refreshGlobalData } = useAppData();

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // 🌟 حالات التبويبات المتطورة لمرحلتي الاعتماد
  const [activeTab, setActiveTab] = useState<'All' | 'Pending_Project' | 'Pending_General' | 'Approved' | 'Rejected'>('Pending_Project');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [approvalModal, setApprovalModal] = useState<{ isOpen: boolean, type: 'single' | 'bulk', req?: any }>({ isOpen: false, type: 'single' });
  const [confirmedMonths, setConfirmedMonths] = useState<number>(12);
  
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab]);

  useEffect(() => {
    if (approvalModal.isOpen && approvalModal.type === 'single' && approvalModal.req) {
      const start = calculateNewStartDate(approvalModal.req.contract_end_date) || '';
      const end = calculateNewEndDateFromStart(start, confirmedMonths) || '';
      setCustomStartDate(start);
      setCustomEndDate(end);
    }
  }, [approvalModal, confirmedMonths]);

  // 🌟 دالة السحب المتطورة: تجلب الطلبات وبيانات الموظف (عشان سن المعاش)
  const fetchRequests = async () => {
    setLoading(true);
    
    // سحب الطلبات
    const { data: reqData, error: reqErr } = await supabase.from('renewal_requests').select('*');
    if (reqErr) console.error("Error fetching requests:", reqErr.message);
    
    // سحب الموظفين (للحصول على تواريخ الميلاد والرقم القومي)
    const { data: empData, error: empErr } = await supabase.from('employees').select('employee_code, birth_date, national_id');
    if (empErr) console.error("Error fetching employees:", empErr.message);

    if (reqData && empData) {
      // دمج بيانات الميلاد مع الطلب
      const mergedRequests = reqData.map(req => {
        const emp = empData.find(e => String(e.employee_code) === String(req.employee_code));
        return {
          ...req,
          birth_date: emp?.birth_date || null,
          national_id: emp?.national_id || null
        };
      });
      setRequests(mergedRequests);
    }
    setLoading(false);
  };

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return null;
    const parts = endDateStr.split('-');
    if (parts.length < 3) return null;
    const end = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const deptsList = Array.from(new Set(requests.map(r => r.department).filter(Boolean)));
  const compsList = Array.from(new Set(requests.map(r => r.company).filter(Boolean)));

  // 🌟 فلترة الطلبات بناءً على التبويب النشط (المرحلة)
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      // توافق التبويبات
      if (activeTab === 'Pending_Project' && req.status !== 'Pending_Project_Manager' && req.status !== 'Pending') return false; // Pending القديم يظهر هنا
      if (activeTab === 'Pending_General' && req.status !== 'Pending_General_Manager') return false;
      if (activeTab === 'Approved' && req.status !== 'Approved') return false;
      if (activeTab === 'Rejected' && req.status !== 'Rejected') return false;

      const term = searchTerm.toLowerCase();
      const matchesSearch = !term || String(req.employee_code).toLowerCase().includes(term) || String(req.employee_name).toLowerCase().includes(term) || String(req.request_id).toLowerCase().includes(term);
      const matchesDept = !selectedDept || req.department === selectedDept;
      const matchesComp = !selectedCompany || req.company === selectedCompany;
      
      let matchesMonth = true;
      if (selectedMonth) {
        const newStart = calculateNewStartDate(req.contract_end_date);
        matchesMonth = newStart ? newStart.startsWith(selectedMonth) : false;
      }

      return matchesSearch && matchesDept && matchesComp && matchesMonth;
    });
  }, [requests, activeTab, searchTerm, selectedDept, selectedCompany, selectedMonth]);

  const sortedRequests = [...filteredRequests].sort((a, b) => {
    const daysA = getDaysRemaining(a.contract_end_date);
    const daysB = getDaysRemaining(b.contract_end_date);
    if (daysA === null) return 1; 
    if (daysB === null) return -1;
    return daysA - daysB; 
  });

  // حسابات الكروت
  const countProj = requests.filter(r => r.status === 'Pending_Project_Manager' || r.status === 'Pending').length;
  const countGen = requests.filter(r => r.status === 'Pending_General_Manager').length;
  const countApproved = requests.filter(r => r.status === 'Approved').length;
  const countRejected = requests.filter(r => r.status === 'Rejected').length;
  const countAll = requests.length;

  // 🌟 دالة الاعتماد الذكية (تمر بمرحلتين وتحمي من تخطي السن)
  const handleConfirmApproval = async () => {
    setActionLoading(true);
    try {
      // 1. تحديد المرحلة الحالية
      const isProjectStage = activeTab === 'Pending_Project';
      const isGeneralStage = activeTab === 'Pending_General';
      const newStatus = isProjectStage ? 'Pending_General_Manager' : 'Approved';
      const newSigStatus = isProjectStage ? 'قيد التوقيع' : 'في انتظار توقيع الموظف';

      if (approvalModal.type === 'single' && approvalModal.req) {
        const req = approvalModal.req;
        const newStartDate = customStartDate || calculateNewStartDate(req.contract_end_date);
        const newEndDate = customEndDate || calculateNewEndDateFromStart(newStartDate, confirmedMonths);

        if (!newStartDate || !newEndDate) {
          setActionLoading(false); return alert('يرجى التأكد من التواريخ.');
        }

        // 🛑 جدار حماية سن التقاعد 🛑
        const retirementDateStr = calculateRetirementDate(req.birth_date);
        if (retirementDateStr && new Date(newEndDate) > new Date(retirementDateStr)) {
          alert(`🚨 توقف - الموظف سيتجاوز سن التقاعد (60)!\n\nتاريخ بلوغ السن: ${retirementDateStr}\nتاريخ انتهاء العقد المُدخل: ${newEndDate}\n\nيُرجى تعديل تاريخ النهاية المتوقع بحيث لا يتجاوز تاريخ التقاعد.`);
          setActionLoading(false);
          return;
        }

        // تحديث الطلب للحالة الجديدة
        const { error: reqError } = await supabase.from('renewal_requests').update({
          status: newStatus,
          signature_status: newSigStatus,
          renewal_months: confirmedMonths,
          new_contract_end_date: newEndDate
        }).eq('request_id', req.request_id);

        if (reqError) throw reqError;

        // 🌟 إذا كان الاعتماد نهائياً (إدارة عامة)، نحدث تاريخ الموظف ونرحل للتوقيعات
        if (isGeneralStage) {
          const { error: empError } = await supabase.from('employees').update({ 
            contract_start_date: newStartDate,
            contract_end_date: newEndDate 
          }).eq('employee_code', req.employee_code);
          if (empError) throw empError;
          
          await supabase.from('contracts').update({ contract_end_date: newEndDate }).eq('employee_code', req.employee_code).eq('status', 'Active');
        }

        alert(isProjectStage ? `تم اعتماد المشروع بنجاح ✅\nالطلب الآن بانتظار الإدارة العامة.` : `تم الاعتماد النهائي وتحديث العقد بنجاح ✅\nالطلب جاهز الآن بصفحة التوقيعات.`);
        
      } else if (approvalModal.type === 'bulk') {
        const reqsToApprove = requests.filter(r => selectedIds.includes(r.request_id));
        
        // 🛑 فحص جماعي لسن التقاعد 🛑
        const problematicEmps: string[] = [];
        reqsToApprove.forEach(req => {
          const newStartDate = calculateNewStartDate(req.contract_end_date);
          const newEndDate = calculateNewEndDateFromStart(newStartDate, confirmedMonths);
          const retDate = calculateRetirementDate(req.birth_date);
          if (retDate && newEndDate && new Date(newEndDate) > new Date(retDate)) {
            problematicEmps.push(`- ${req.employee_name} (يبلغ السن في ${retDate})`);
          }
        });

        if (problematicEmps.length > 0) {
          alert(`🚨 توقف - يوجد موظفين سيتجاوزون سن التقاعد (60):\n\n${problematicEmps.join('\n')}\n\nيرجى إلغاء تحديدهم من القائمة، واعتمادهم بشكل فردي بتاريخ مخصص.`);
          setActionLoading(false); return;
        }

        const updatePromises = reqsToApprove.map(async (req) => {
          const newStartDate = calculateNewStartDate(req.contract_end_date);
          const newEndDate = calculateNewEndDateFromStart(newStartDate, confirmedMonths);
          
          const { error: reqError } = await supabase.from('renewal_requests').update({
            status: newStatus,
            signature_status: newSigStatus,
            renewal_months: confirmedMonths,
            new_contract_end_date: newEndDate
          }).eq('request_id', req.request_id);

          if (reqError) throw reqError;

          // التحديث النهائي لبيانات الموظف إذا كان الاعتماد عام
          if (isGeneralStage && newEndDate && newStartDate) {
            await supabase.from('employees').update({ contract_start_date: newStartDate, contract_end_date: newEndDate }).eq('employee_code', req.employee_code);
            await supabase.from('contracts').update({ contract_end_date: newEndDate }).eq('employee_code', req.employee_code).eq('status', 'Active');
          }
        });

        await Promise.all(updatePromises);
        alert(`تم تنفيذ الإجراء على ${reqsToApprove.length} طلب بنجاح ✅`);
      }

      setSelectedIds([]);
      setApprovalModal({ isOpen: false, type: 'single' });
      await refreshGlobalData();
      await fetchRequests(); 

    } catch (err: any) {
      alert('حدث خطأ أثناء الاعتماد: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    const confirmDelete = window.confirm('هل أنت متأكد من حذف هذا الطلب نهائياً من النظام؟\n\nتنبيه: سيتم إزالة الطلب وكأنه لم يكن.');
    if (!confirmDelete) return;

    setActionLoading(true);
    try {
      const { error } = await supabase.from('renewal_requests').delete().eq('request_id', requestId);
      if (error) throw error;
      alert('تم حذف طلب التجديد بنجاح 🗑️✅');
      setApprovalModal({ isOpen: false, type: 'single' });
      await refreshGlobalData();
      await fetchRequests();
    } catch (err: any) {
      alert('حدث خطأ أثناء الحذف: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (requestId: string) => {
    const reason = window.prompt("سبب الرفض (اختياري):", "");
    if (reason === null) return; // المستخدم ضغط إلغاء
    
    setActionLoading(true);
    const { error } = await supabase.from('renewal_requests').update({
      status: 'Rejected',
      signature_status: reason ? `مرفوض: ${reason}` : 'مرفوض'
    }).eq('request_id', requestId);
    
    if (error) alert('حدث خطأ أثناء رفض الطلب: ' + error.message);
    else {
      alert('تم رفض الطلب بنجاح ❌');
      await refreshGlobalData();
      fetchRequests();
    }
    setActionLoading(false);
  };

  const handleExportApprovedToExcel = async () => {
    if (selectedIds.length === 0) return alert('يرجى تحديد طلبات أولاً.');
    setActionLoading(true);

    try {
      const selectedReqs = requests.filter(r => selectedIds.includes(r.request_id) && r.status === 'Approved');
      
      if (selectedReqs.length === 0) {
        setActionLoading(false); return alert('⚠️ يرجى تحديد طلبات معتمدة فقط للتصدير.');
      }

      const exportData = selectedReqs.map(req => {
        const newStart = calculateNewStartDate(req.contract_end_date);
        return {
          'رقم الطلب': req.request_id,
          'كود الموظف': req.employee_code,
          'اسم الموظف': req.employee_name,
          'الرقم القومي': req.national_id || '—',
          'الإدارة': req.department || '—',
          'الوظيفة': req.job_title || '—',
          'الشركة': req.company || '—',
          'تاريخ نهاية العقد القديم': req.contract_end_date || '—',
          'تاريخ بداية العقد الجديد': newStart,
          'مدة التجديد (شهور)': req.renewal_months || 12,
          'تاريخ نهاية العقد الجديد': req.new_contract_end_date || calculateNewEndDateFromStart(newStart, req.renewal_months || 12),
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'عقود التجديد المعتمدة');
      XLSX.writeFile(wb, `كشف_عقود_التجديد_${new Date().toISOString().split('T')[0]}.xlsx`);
      setActionLoading(false);
    } catch (err: any) {
      alert('حدث خطأ أثناء التصدير: ' + err.message);
      setActionLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const selectableIds = sortedRequests.filter(r => r.status === activeTab || (activeTab === 'Pending_Project' && r.status === 'Pending')).map(r => r.request_id);
      setSelectedIds(selectableIds);
    } else {
      setSelectedIds([]);
    }
  };

  return (
    <div style={{ paddingBottom: '40px', direction: 'rtl' }}>
      
      {/* 🌟 تصميم Enterprise Cards للتبويبات */}
      <style>{`
        .modern-stat-card {
          background: #ffffff;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          border-bottom: 4px solid var(--theme-color);
          padding: 16px;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 90px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .modern-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08);
          background: #f8fafc;
        }
        .modern-stat-card.active {
          background: #f8fafc;
          border-color: var(--theme-color);
          box-shadow: 0 0 0 1px var(--theme-color) inset;
        }
        .card-icon-box {
          width: 32px; height: 32px;
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
          background: var(--icon-bg);
          color: var(--theme-color);
        }
      `}</style>

      {/* الهيدر */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '900' }}>لوحة اعتمادات التجديد</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>دورة الاعتماد الإداري المتدرج للموافقة على تجديد العقود</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {(activeTab === 'Pending_Project' || activeTab === 'Pending_General') && (
            <button onClick={() => {
              if (selectedIds.length === 0) return alert('يرجى تحديد طلب واحد على الأقل من الجدول.');
              setApprovalModal({ isOpen: true, type: 'bulk' });
            }} disabled={selectedIds.length === 0 || actionLoading} style={{ background: '#4f46e5', color: '#fff', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer', opacity: selectedIds.length === 0 ? 0.5 : 1, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              ✅ اعتماد مجمع ({selectedIds.length})
            </button>
          )}

          {activeTab === 'Approved' && (
            <button onClick={handleExportApprovedToExcel} disabled={selectedIds.length === 0 || actionLoading} style={{ background: '#10b981', color: '#fff', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer', opacity: selectedIds.length === 0 ? 0.5 : 1 }}>
              {actionLoading ? 'جاري التجهيز...' : `📥 تصدير العقود للطباعة (${selectedIds.length})`}
            </button>
          )}
        </div>
      </div>

      {/* 🗂️ التبويبات ككروت إحصائية Enterprise */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        <div className={`modern-stat-card ${activeTab === 'Pending_Project' ? 'active' : ''}`} style={{ '--theme-color': '#3b82f6', '--icon-bg': '#eff6ff' } as React.CSSProperties} onClick={() => setActiveTab('Pending_Project')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>اعتماد المشروع</span>
            <div className="card-icon-box">⏳</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{countProj}</div>
            <div style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 'bold' }}>المرحلة الأولى</div>
          </div>
        </div>

        <div className={`modern-stat-card ${activeTab === 'Pending_General' ? 'active' : ''}`} style={{ '--theme-color': '#8b5cf6', '--icon-bg': '#f3e8ff' } as React.CSSProperties} onClick={() => setActiveTab('Pending_General')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>اعتماد الإدارة</span>
            <div className="card-icon-box">🛡️</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{countGen}</div>
            <div style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: 'bold' }}>الاعتماد النهائي</div>
          </div>
        </div>

        <div className={`modern-stat-card ${activeTab === 'Approved' ? 'active' : ''}`} style={{ '--theme-color': '#10b981', '--icon-bg': '#ecfdf5' } as React.CSSProperties} onClick={() => setActiveTab('Approved')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>الطلبات المعتمدة</span>
            <div className="card-icon-box">✅</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{countApproved}</div>
            <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}>للذهاب للتوقيع</div>
          </div>
        </div>

        <div className={`modern-stat-card ${activeTab === 'Rejected' ? 'active' : ''}`} style={{ '--theme-color': '#ef4444', '--icon-bg': '#fef2f2' } as React.CSSProperties} onClick={() => setActiveTab('Rejected')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>مرفوضة</span>
            <div className="card-icon-box">❌</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{countRejected}</div>
            <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 'bold' }}>محفوظة للأرشيف</div>
          </div>
        </div>

        <div className={`modern-stat-card ${activeTab === 'All' ? 'active' : ''}`} style={{ '--theme-color': '#475569', '--icon-bg': '#f1f5f9' } as React.CSSProperties} onClick={() => setActiveTab('All')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>كل النماذج</span>
            <div className="card-icon-box">📋</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', lineHeight: '1' }}>{countAll}</div>
            <div style={{ fontSize: '11px', color: '#475569', fontWeight: 'bold' }}>قاعدة البيانات</div>
          </div>
        </div>
      </div>

      {/* 🌟 شريط الفلاتر والبحث */}
      <div className="no-print" style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', direction: 'rtl', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="بحث بالاسم، الطلب، الكود..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', width: '220px', fontWeight: 'bold' }} />
          
          <input list="deptList" placeholder="الإدارة..." value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', width: '150px', fontWeight: 'bold' }} />
          <datalist id="deptList">{deptsList.map((d: any, i) => <option key={i} value={d} />)}</datalist>
          
          <input list="compList" placeholder="الشركة..." value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', width: '150px', fontWeight: 'bold' }} />
          <datalist id="compList">{compsList.map((c: any, i) => <option key={i} value={c} />)}</datalist>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: '#f8fafc', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', marginLeft: '6px', paddingRight: '6px' }}>شهر البداية:</span>
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ padding: '4px 6px', border: 0, background: 'transparent', fontSize: '12px', outline: 'none', fontWeight: 'bold', fontFamily: 'monospace' }} />
          </div>

          <button onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedCompany(''); setSelectedMonth(''); }} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', color: '#334155' }}>إعادة ضبط</button>
        </div>
        <div style={{ fontSize: '12px', fontWeight: '900', color: '#0f172a' }}>
          معروض: <span style={{ color: '#4f46e5' }}>{sortedRequests.length}</span> طلب
        </div>
      </div>

      {/* الجدول الرئيسي */}
      <div className="table-responsive no-print" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>جاري تحميل الطلبات وترتيبها...</div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 10 }}>
              <tr>
                <th style={{ padding: '14px 12px', borderBottom: '1px solid #e2e8f0', textAlign: 'center', width: '30px' }}>
                  <input type="checkbox" onChange={handleSelectAll} checked={selectedIds.length > 0 && selectedIds.length === sortedRequests.filter(r => r.status === activeTab || (activeTab === 'Pending_Project' && r.status === 'Pending')).length} disabled={activeTab === 'All' || activeTab === 'Rejected'} style={{ accentColor: '#4f46e5', cursor: 'pointer' }} />
                </th>
                <th style={{ padding: '14px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>رقم الطلب</th>
                <th style={{ padding: '14px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>الكود</th>
                <th style={{ padding: '14px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>الموظف</th>
                <th style={{ padding: '14px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>الإدارة</th>
                <th style={{ padding: '14px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>انتهاء العقد</th>
                <th style={{ padding: '14px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>المتبقي</th>
                <th style={{ padding: '14px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'center' }}>مدة التجديد</th>
                <th style={{ padding: '14px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'center' }}>الاعتماد</th>
                <th style={{ padding: '14px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'center' }}>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {sortedRequests.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>لا توجد طلبات في هذه المرحلة.</td></tr>
              ) : sortedRequests.map((req) => {
                const days = getDaysRemaining(req.contract_end_date);
                return (
                  <tr key={req.request_id} style={{ borderBottom: '1px solid #f1f5f9', background: selectedIds.includes(req.request_id) ? '#eef2ff' : 'transparent', transition: 'background 0.2s' }}>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input type="checkbox" disabled={req.status === 'Rejected' || activeTab === 'All' || activeTab === 'Approved'} checked={selectedIds.includes(req.request_id)} onChange={e => setSelectedIds(e.target.checked ? [...selectedIds, req.request_id] : selectedIds.filter(id => id !== req.request_id))} style={{ accentColor: '#4f46e5', cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '12px', fontFamily: 'monospace', color: '#64748b', fontWeight: 'bold' }}>{req.request_id}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', fontFamily: 'monospace', color: '#4f46e5' }}>{req.employee_code}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#0f172a' }}>{req.employee_name}</td>
                    <td style={{ padding: '12px', color: '#64748b', fontWeight: '500' }}>{req.department || '—'}</td>
                    <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 'bold' }}>{req.contract_end_date || '—'}</td>
                    <td style={{ padding: '12px' }}>
                      {days !== null ? (
                        <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', background: days < 0 ? '#fef2f2' : days <= 60 ? '#fffbeb' : '#eff6ff', color: days < 0 ? '#dc2626' : days <= 60 ? '#d97706' : '#3b82f6' }}>
                          {days < 0 ? `منتهي (${Math.abs(days)})` : `${days} يوم`}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'bold', textAlign: 'center', color: '#0f172a' }}>{req.renewal_months || 12} شهر</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {req.status === 'Approved' && <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #bbf7d0' }}>✅ نهائي</span>}
                      {(req.status === 'Pending_Project_Manager' || req.status === 'Pending') && <span style={{ background: '#eff6ff', color: '#3b82f6', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #bfdbfe' }}>⏳ مشروع</span>}
                      {req.status === 'Pending_General_Manager' && <span style={{ background: '#f3e8ff', color: '#8b5cf6', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #e9d5ff' }}>⏳ إدارة</span>}
                      {req.status === 'Rejected' && <span style={{ background: '#fef2f2', color: '#dc2626', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #fecaca' }}>❌ مرفوض</span>}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {(req.status === 'Pending_Project_Manager' || req.status === 'Pending' || req.status === 'Pending_General_Manager') ? (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button onClick={() => { setApprovalModal({ isOpen: true, type: 'single', req }); setConfirmedMonths(req.renewal_months || 12); }} style={{ background: '#10b981', color: '#fff', border: 0, padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>اعتماد ✅</button>
                          <button onClick={() => handleReject(req.request_id)} style={{ background: '#ef4444', color: '#fff', border: 0, padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>رفض ❌</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>— تمت المعالجة —</span>
                          <button onClick={() => handleDeleteRequest(req.request_id)} title="حذف الطلب نهائياً" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>🗑️</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 🚀 نافذة الاعتماد الذكية (مع جدار حماية السن) */}
      {approvalModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ width: '480px', background: '#ffffff', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#10b981', fontWeight: '900' }}>
                {approvalModal.type === 'single' ? `اعتماد طلب: ${approvalModal.req?.employee_name}` : `اعتماد مجمع لـ (${selectedIds.length}) طلب`}
              </h3>
              {approvalModal.type === 'single' && approvalModal.req && (
                <button onClick={() => handleDeleteRequest(approvalModal.req.request_id)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>حذف الطلب 🗑️</button>
              )}
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#334155', fontWeight: 'bold', lineHeight: '1.6' }}>
                {activeTab === 'Pending_Project' ? 'انت على وشك الموافقة المبدئية وتمرير الطلب للإدارة العامة.' : 'انت على وشك الاعتماد النهائي. سيتم تحديث تواريخ العقد فوراً وإرساله للتوقيع.'}
              </p>
              
              {/* 🌟 مدخلات التواريخ للمراجعة والتعديل (مع حماية السن) */}
              {approvalModal.type === 'single' && approvalModal.req && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold' }}>
                    <span style={{ color: '#64748b' }}>نهاية العقد الحالي:</span>
                    <span style={{ color: '#0f172a', fontFamily: 'monospace' }}>{approvalModal.req.contract_end_date || 'غير مسجل'}</span>
                  </div>
                  
                  {approvalModal.req.birth_date && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold' }}>
                      <span style={{ color: '#ea580c' }}>تاريخ بلوغ سن 60:</span>
                      <span style={{ color: '#ea580c', fontFamily: 'monospace' }}>{calculateRetirementDate(approvalModal.req.birth_date)}</span>
                    </div>
                  )}
                  
                  <hr style={{ border: 'none', borderTop: '1px dashed #cbd5e1', margin: '4px 0' }} />

                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', color: '#10b981', fontWeight: 'bold', fontSize: '12px' }}>بداية العقد الجديد (قابل للتعديل):</label>
                    <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace', outline: 'none' }} />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', color: '#10b981', fontWeight: 'bold', fontSize: '12px' }}>نهاية العقد المتوقعة (قابل للتعديل):</label>
                    <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace', outline: 'none' }} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>المدة المعتمدة للتجديد (شهور):</label>
              <select value={confirmedMonths} onChange={e => setConfirmedMonths(Number(e.target.value))} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', fontWeight: 'bold' }}>
                <option value={1}>شهر واحد (1)</option><option value={2}>شهران (2)</option><option value={3}>3 شهور (ربع سنوي)</option><option value={6}>6 شهور (نصف سنوي)</option><option value={9}>9 شهور</option><option value={12}>12 شهر (سنة كاملة)</option><option value={24}>24 شهر (سنتين)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setApprovalModal({ isOpen: false, type: 'single' })} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', color: '#334155' }}>إلغاء</button>
              <button onClick={handleConfirmApproval} disabled={actionLoading} style={{ background: '#10b981', color: '#fff', border: 0, padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.7 : 1, boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)' }}>
                {actionLoading ? 'جاري الاعتماد...' : 'تأكيد الاعتماد والمتابعة ✅'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
