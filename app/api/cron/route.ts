import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // 1. جلب الموظفين الفعالين والعقود النشطة بالتوازي (بدون طلب contract_end_date من employees)
    const [empRes, contRes] = await Promise.all([
      supabase
        .from('employees')
        .select('employee_code, employee_name, department, status, contract_type')
        .eq('status', 'Active'),
      supabase
        .from('contracts')
        .select('employee_code, contract_end_date, status')
        .eq('status', 'Active')
    ]);

    if (empRes.error) throw empRes.error;
    if (contRes.error) throw contRes.error;

    const employees = empRes.data || [];
    const contracts = contRes.data || [];

    // 2. ربط كل موظف بأحدث تاريخ نهاية عقد له من جدول contracts
    const contractsMap = new Map<string, string>();
    contracts.forEach(c => {
      if (!c.contract_end_date) return;
      const code = String(c.employee_code || '').trim().replace(/^0+/, '');
      const existingDate = contractsMap.get(code);
      if (!existingDate || new Date(c.contract_end_date).getTime() > new Date(existingDate).getTime()) {
        contractsMap.set(code, c.contract_end_date);
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 3. تصفية وحصر العقود الحرجة (أقل من أو يساوي 30 يوم)
    const criticalList = employees.filter((emp) => {
      if (emp.contract_type === 'دائم' || String(emp.contract_type).includes('دائم')) return false;

      const safeCode = String(emp.employee_code || '').trim().replace(/^0+/, '');
      const actualEndDateStr = contractsMap.get(safeCode);

      if (!actualEndDateStr) return false;

      const endDate = new Date(actualEndDateStr);
      if (isNaN(endDate.getTime())) return false;

      const days = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
      return days <= 30;
    });

    // 4. قراءة الإيميل المسجل
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
