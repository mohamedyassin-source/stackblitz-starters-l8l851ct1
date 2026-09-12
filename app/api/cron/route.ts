import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');

export async function GET() {
  try {
    // 1. جلب الموظفين الفعالين والعقود من Supabase
    let allEmps: any[] = [];
    let from = 0;
    const step = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('employees')
        .select('employee_code, employee_name, department, contract_end_date, status, contract_type')
        .eq('status', 'Active')
        .range(from, from + step - 1);

      if (error || !data || data.length === 0) break;
      allEmps = [...allEmps, ...data];
      if (data.length < step) break;
      from += step;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 2. تصفية العقود الحرجة (ينتهي خلال 30 يوم)
    const criticalList = allEmps.filter((emp) => {
      if (emp.contract_type === 'دائم' || !emp.contract_end_date) return false;
      const end = new Date(emp.contract_end_date);
      if (isNaN(end.getTime())) return false;
      const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
      return days <= 30;
    });

    // 3. قراءة الإيميلات المستهدفة من البيئة أو الافتراضية وتقسيم الإيميلات المتعددة
    const rawEmails = process.env.NOTIFICATION_EMAILS || 'mohamed.yassin@almarasem.com';
    const emailList = rawEmails.split(',').map(e => e.trim()).filter(Boolean);

    // 4. إرسال الإيميل الفعلي إذا تم ضبط الـ API Key لخدمة البريد Resend
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: 'HR System <onboarding@resend.dev>',
        to: emailList,
        subject: `🚨 تقرير تنبيهات العقود الحرجة (${criticalList.length} عقد) - المراسم الدولية`,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px; color: #0f172a;">
            <h2 style="color: #0d9488;">مجموعة شركات المراسم الدولية - تقرير غرفة العمليات</h2>
            <p style="font-size: 14px; font-weight: bold;">تحية طيبة وبعد،،</p>
            <p style="font-size: 13px;">نفيد سيادتكم بوجود عدد <strong style="color: #ef4444; font-size: 16px;">(${criticalList.length})</strong> عقد حرج منتهي أو ينتهي خلال أقل من 30 يوماً وتتطلب اتخاذ إجراء تجديد عاجل.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 11px; color: #64748b;">تم إرسال هذا التقرير تلقائياً إلى: ${emailList.join(' | ')}</p>
          </div>
        `
      });
    }

    const msg = `تم إرسال تقرير الخطر بنجاح! 📧\n\nالمستلمون: ${emailList.join(', ')}\nإجمالي العقود الحرجة المكتشفة: (${criticalList.length}) عقد.`;

    return NextResponse.json({
      success: true,
      message: msg,
      criticalCount: criticalList.length,
      recipients: emailList,
      timestamp: new Date().toISOString(),
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ أثناء معالجة البريد: ' + err.message },
      { status: 500 }
    );
  }
}
