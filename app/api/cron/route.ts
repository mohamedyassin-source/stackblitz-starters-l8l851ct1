import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // 1. جلب الموظفين والعقود
    const [empRes, contRes] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('contracts').select('*').eq('status', 'Active')
    ]);

    if (empRes.error) throw empRes.error;
    if (contRes.error) throw contRes.error;

    const empData = empRes.data || [];
    const contData = contRes.data || [];

    // 2. خريطة العقود بنحت الأصفار من الشمال (نفس منطق التنبيهات بالظبط)
    const contractsMap = new Map<string, any[]>();
    contData.forEach(c => {
      if (!c) return;
      const code = String(c.employee_code || '').trim().replace(/^0+/, '');
      if (!contractsMap.has(code)) contractsMap.set(code, []);
      contractsMap.get(code)?.push(c);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 3. دمج البيانات وحساب الأيام المتبقية
    const criticalList = empData
      .filter(e => e && e.status !== 'Inactive' && e.status !== 'Terminated' && e.contract_type !== 'إنهاء تعاقد')
      .map(emp => {
        const empCodeClean = String(emp.employee_code || '').trim().replace(/^0+/, '');
        const empContracts = contractsMap.get(empCodeClean) || [];

        // ترتيب العقود لمعرفة أحدث عقد
        empContracts.sort((a, b) => {
          const dateA = a.contract_end_date ? new Date(a.contract_end_date).getTime() : 0;
          const dateB = b.contract_end_date ? new Date(b.contract_end_date).getTime() : 0;
          return dateB - dateA;
        });

        const activeContract = empContracts[0] || {};
        const endDateStr = activeContract.contract_end_date || emp.contract_end_date || null;
        const type = activeContract.contract_type || emp.contract_type || '';

        if (!endDateStr || type.includes('دائم')) return null;

        const endDate = new Date(endDateStr);
        if (isNaN(endDate.getTime())) return null;

        const days = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
        
        // النطاق الحرج جداً (أقل من أو يساوي 30 يوم)
        if (days <= 30) {
          return {
            code: empCodeClean,
            name: emp.employee_name || emp.ArabicName,
            days
          };
        }
        return null;
      })
      .filter(Boolean);

    // 4. الإيميلات المسجلة
    const rawEmails = process.env.NOTIFICATION_EMAILS || 'mohamed.yassin@almarasem.com';
    const emailList = rawEmails.split(',').map(e => e.trim()).filter(Boolean);

    const msg = `تم إعداد وتجهيز تقرير الخطر بنجاح! 📧\n\nالمستلمون المحددون: ${emailList.join(', ')}\nإجمالي العقود الحرجة المكتشفة: (${criticalList.length}) عقد.`;

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
