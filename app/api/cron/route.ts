import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // 1. جلب الموظفين الفعالين والعقود النشطة بالتوازي بأمان
    const [empRes, contRes] = await Promise.all([
      supabase
        .from('employees')
        .select('employee_code, employee_name, department, status')
        .eq('status', 'Active'),
      supabase
        .from('contracts')
        .select('employee_code, contract_end_date, contract_type, status')
        .eq('status', 'Active')
    ]);

    if (empRes.error) throw empRes.error;
    if (contRes.error) throw contRes.error;

    const employees = empRes.data || [];
    const contracts = contRes.data || [];

    // 2. ربط أحدث عقود لكل موظف بدلالة كود الموظف
    const contractsMap = new Map<string, { endDate: string; type: string }>();
    
    contracts.forEach(c => {
      if (!c.contract_end_date) return;
      const code = String(c.employee_code || '').trim().replace(/^0+/, '');
      const existing = contractsMap.get(code);
      
      if (!existing || new Date(c.contract_end_date).getTime() > new Date(existing.endDate).getTime()) {
        contractsMap.set(code, {
          endDate: c.contract_end_date,
          type: c.contract_type || ''
        });
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 3. تصفية وحصر العقود الحرجة (أقل من أو يساوي 30 يوم)
    const criticalList = employees.filter((emp) => {
      const safeCode = String(emp.employee_code || '').trim().replace(/^0+/, '');
      const contractData = contractsMap.get(safeCode);

      if (!contractData || !contractData.endDate) return false;

      // إستبعاد العقود الدائمة
      if (contractData.type === 'دائم' || String(contractData.type).includes('دائم')) return false;

      const endDate = new Date(contractData.endDate);
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
