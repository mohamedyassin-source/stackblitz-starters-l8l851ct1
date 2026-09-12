import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // 1. جلب الموظفين العمالة الفعالة من Supabase
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

    // 2. تصفية العقود الحرجة (تصل لأقل من 30 يوم)
    const criticalList = allEmps.filter((emp) => {
      if (emp.contract_type === 'دائم' || !emp.contract_end_date) return false;
      const end = new Date(emp.contract_end_date);
      if (isNaN(end.getTime())) return false;
      const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
      return days <= 30;
    });

    const rawEmails = process.env.NOTIFICATION_EMAILS || 'mohamed.yassin@almarasem.com';
    const emailList = rawEmails.split(',').map(e => e.trim()).filter(Boolean);

    const msg = `تم إعداد وتجهيز تقرير الخطر بنجاح! 📧\n\nالمستلمون المفترضون: ${emailList.join(', ')}\nإجمالي العقود الحرجة المكتشفة: (${criticalList.length}) عقد.`;

    return NextResponse.json({
      success: true,
      message: msg,
      criticalCount: criticalList.length,
      recipients: emailList,
      timestamp: new Date().toISOString(),
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ أثناء معالجة البيانات: ' + err.message },
      { status: 500 }
    );
  }
}
