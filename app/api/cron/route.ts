import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// دالة سحب جميع الصفوف لتجاوز حد الـ 1000 صف من Supabase
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

export async function GET() {
  try {
    // 1. سحب كامل الموظفين والعقود بالتوازي بدون التقيد بحد الـ 1000 صف
    const [empData, contData] = await Promise.all([
      fetchAllRows('employees'),
      fetchAllRows('contracts', '*', { col: 'status', val: 'Active' })
    ]);

    // 2. تجميع العقود وتجهيز الخريطة بنفس مطابقة الأكواد
    const contractsMap = new Map<string, any[]>();
    contData.forEach(c => {
      if (!c) return;
      const code = String(c.employee_code || '').trim().replace(/^0+/, '');
      if (!contractsMap.has(code)) contractsMap.set(code, []);
      contractsMap.get(code)?.push(c);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 3. مطابقة الموظفين مع العقود وحساب التنبيه الحرج
    const criticalList = empData
      .filter(e => e && e.status !== 'Inactive' && e.status !== 'Terminated' && e.contract_type !== 'إنهاء تعاقد')
      .map(emp => {
        const empCodeClean = String(emp.employee_code || '').trim().replace(/^0+/, '');
        const empContracts = contractsMap.get(empCodeClean) || [];

        // ترتيب العقود لمعرفة أحدث تاريخ
        empContracts.sort((a, b) => {
          const dateA = a.contract_end_date ? new Date(a.contract_end_date).getTime() : 0;
          const dateB = b.contract_end_date ? new Date(b.contract_end_date).getTime() : 0;
          return dateB - dateA;
        });

        const activeContract = empContracts[0] || {};
        const endDateStr = activeContract.contract_end_date || emp.contract_end_date || null;
        const type = String(activeContract.contract_type || emp.contract_type || '');

        if (!endDateStr || type.includes('دائم')) return null;

        const endDate = new Date(endDateStr);
        if (isNaN(endDate.getTime())) return null;

        const days = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
        
        // تصفية التنبيهات الحرجة جداً (أقل من أو يساوي 30 يوم)
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

    // 4. قراءة البريد الإلكتروني المستهدف
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
