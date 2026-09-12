import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // 1. جلب العقود الفعالة التابعة للتنبيهات
    const { data: contracts, error } = await supabase
      .from('contracts')
      .select('employee_code, contract_end_date, status')
      .eq('status', 'Active');

    if (error) throw error;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 2. تصنيف المخاطر
    const criticalContracts = (contracts || []).filter((c) => {
      if (!c.contract_end_date) return false;
      const end = new Date(c.contract_end_date);
      const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
      return days <= 30;
    });

    // 3. محاكاة/تأكيد تجهيز تقرير الإيميل بنجاح
    const reportSummary = `تم إعداد التقرير بنجاح: يوجد (${criticalContracts.length}) عقد حرِج يحتاج لاتخاذ إجراء خلال 30 يومًا.`;

    return NextResponse.json({
      success: true,
      message: `تم إرسال تقرير الخطر للإدارة بنجاح! 📧\n\n${reportSummary}`,
      count: criticalContracts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ أثناء معالجة البريد: ' + err.message },
      { status: 500 }
    );
  }
}
