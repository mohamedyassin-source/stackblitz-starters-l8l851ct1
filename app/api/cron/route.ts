import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { Resend } from 'resend';

// تهيئة Resend بـ API Key من بيئة العمل
const resend = new Resend(process.env.RESEND_API_KEY || '');

// دالة سحب كافة البيانات لتجاوز حد الـ 1000 صف
async function fetchAllRows(tableName: string, selectFields = '*', filterEq?: { col: string; val: any }) {
  let allRows: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    let query = supabase.from(tableName).select(selectFields).range(from, from + step - 1);
    if (filterEq) query = query.eq(filterEq.col, filterEq.val);
    const { data, error } = await query;
    if (error || !data || data.length === 0) break;
    allRows = [...allRows, ...data];
    if (data.length < step) break;
    from += step;
  }
  return allRows;
}

const getDaysToRetirement = (birthDateRaw: any) => {
  if (!birthDateRaw) return null;
  const birthDate = new Date(birthDateRaw);
  if (isNaN(birthDate.getTime())) return null;
  const age60Date = new Date(birthDate.getFullYear() + 60, birthDate.getMonth(), birthDate.getDate());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((age60Date.getTime() - today.getTime()) / (1000 * 3600 * 24));
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filterType = searchParams.get('type') || 'critical';

    // 1. جلب الموظفين والعقود
    const [empData, contData] = await Promise.all([
      fetchAllRows('employees'),
      fetchAllRows('contracts', '*', { col: 'status', val: 'Active' })
    ]);

    const contractsMap = new Map<string, any[]>();
    contData.forEach(c => {
      if (!c) return;
      const code = String(c.employee_code || '').trim().replace(/^0+/, '');
      if (!contractsMap.has(code)) contractsMap.set(code, []);
      contractsMap.get(code)?.push(c);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 2. تصفية البيانات
    const targetList = empData
      .filter(e => e && e.status !== 'Inactive' && e.status !== 'Terminated' && e.contract_type !== 'إنهاء تعاقد')
      .map(emp => {
        const empCodeClean = String(emp.employee_code || '').trim().replace(/^0+/, '');
        const empContracts = contractsMap.get(empCodeClean) || [];

        empContracts.sort((a, b) => {
          const dateA = a.contract_end_date ? new Date(a.contract_end_date).getTime() : 0;
          const dateB = b.contract_end_date ? new Date(b.contract_end_date).getTime() : 0;
          return dateB - dateA;
        });

        const activeContract = empContracts[0] || {};
        const endDateStr = activeContract.contract_end_date || emp.contract_end_date || null;
        const type = String(activeContract.contract_type || emp.contract_type || '');

        const daysToRetirement = getDaysToRetirement(emp.birth_date);
        const isRetiringSoon = daysToRetirement !== null && daysToRetirement <= 90 && daysToRetirement >= 0;

        let days = null;
        if (endDateStr) {
          const endDate = new Date(endDateStr);
          if (!isNaN(endDate.getTime())) {
            days = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
          }
        }

        let match = false;
        if (filterType === 'retirement' && isRetiringSoon) {
          match = true;
        } else if (!type.includes('دائم') && days !== null) {
          if (filterType === 'critical' && days <= 30) match = true;
          else if (filterType === 'warning' && days > 0 && days <= 30) match = true;
          else if (filterType === 'notice' && days > 30 && days <= 90) match = true;
          else if (filterType === 'all' && (days <= 90 || isRetiringSoon)) match = true;
        }

        if (match) {
          return {
            code: empCodeClean,
            name: emp.employee_name || emp.ArabicName,
            department: emp.department || '—',
            endDate: endDateStr || '—',
            daysLeft: days
          };
        }
        return null;
      })
      .filter(Boolean);

    // 3. الإيميلات المسجلة
    const rawEmails = process.env.NOTIFICATION_EMAILS || 'mohamed.yassin@almarasem.com';
    const emailList = rawEmails.split(',').map(e => e.trim()).filter(Boolean);

    // 4. فحص وجود مفتاح Resend وإرسال البريد الفعلي
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({
        success: false,
        message: '⚠️ مفتاح RESEND_API_KEY غير معرف في إعدادات البيئة (Environment Variables) على Vercel.'
      }, { status: 400 });
    }

    const rowsHtml = targetList.slice(0, 50).map(item => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${item?.code}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${item?.name}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${item?.department}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item?.endDate}</td>
      </tr>
    `).join('');

    const emailResponse = await resend.emails.send({
      from: 'HR Contracts <onboarding@resend.dev>',
      to: emailList,
      subject: `🚨 تقرير تنبيهات العقود (${targetList.length} حالة) - المراسم الدولية`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px; color: #0f172a;">
          <h2 style="color: #0d9488;">مجموعة شركات المراسم الدولية - تقرير غرفة العمليات</h2>
          <p style="font-size: 14px;">نفيد سيادتكم بوجود عدد <strong style="color: #ef4444; font-size: 16px;">(${targetList.length})</strong> حالة تتطلب اتخاذ إجراء عاجل.</p>
          <table style="width: 100%; border-collapse: collapse; text-align: right; font-size: 12px; margin-top: 15px;">
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="padding: 8px; border: 1px solid #ddd;">الكود</th>
                <th style="padding: 8px; border: 1px solid #ddd;">الموظف</th>
                <th style="padding: 8px; border: 1px solid #ddd;">الإدارة</th>
                <th style="padding: 8px; border: 1px solid #ddd;">تاريخ الانتهاء</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 11px; color: #64748b;">تم إرسال هذا التقرير تلقائياً من نظام إدارة العقود.</p>
        </div>
      `
    });

    if (emailResponse.error) {
      return NextResponse.json({
        success: false,
        message: `❌ فشل إرسال البريد من Resend: ${emailResponse.error.message}`
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `تم إرسال البريد بنجاح إلى (${emailList.join(', ')}) 📧\n\nمعرف الرسالة: ${emailResponse.data?.id}`,
      count: targetList.length,
      emailId: emailResponse.data?.id
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ أثناء معالجة الطلب: ' + err.message },
      { status: 500 }
    );
  }
}
