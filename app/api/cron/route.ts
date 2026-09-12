import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// دالة سحب كافة البيانات لتجاوز حد الـ 1000 صف من Supabase
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

// دالة حساب سن التقاعد (60 سنة)
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
    // 1. قراءة الفلتر المحدد من رابط الطلب
    const { searchParams } = new URL(req.url);
    const filterType = searchParams.get('type') || 'critical';

    // 2. جلب الموظفين والعقود الفعالة بالتوازي
    const [empData, contData] = await Promise.all([
      fetchAllRows('employees'),
      fetchAllRows('contracts', '*', { col: 'status', val: 'Active' })
    ]);

    // 3. مطابقة العقود بالأكواد بدون أصفار جهة الشمال
    const contractsMap = new Map<string, any[]>();
    contData.forEach(c => {
      if (!c) return;
      const code = String(c.employee_code || '').trim().replace(/^0+/, '');
      if (!contractsMap.has(code)) contractsMap.set(code, []);
      contractsMap.get(code)?.push(c);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 4. فرز وتصفية القائمة بحسب الكارت المحدد
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
            daysLeft: days,
            daysToRetirement
          };
        }
        return null;
      })
      .filter(Boolean);

    const titlesMap: Record<string, string> = {
      critical: 'خطر قانوني/حرج جداً (أقل من 30 يوم)',
      warning: 'تنبيه حرج جداً (أقل من 30 يوم)',
      notice: 'إنذار قياسي (أقل من 90 يوم)',
      retirement: 'رادار المعاشات (سن الـ 60)',
      all: 'صندوق التنبيهات الشامل'
    };

    const cardTitle = titlesMap[filterType] || 'تقرير التنبيهات';

    // 5. جلب الإيميلات المعرفة في متغيرات البيئة
    const rawEmails = process.env.NOTIFICATION_EMAILS || 'mohamed.yassin@almarasem.com';
    const emailList = rawEmails.split(',').map(e => e.trim()).filter(Boolean);

    const msg = `تم إعداد تقرير [${cardTitle}] بنجاح! 📧\n\nالمستلمون: ${emailList.join(', ')}\nإجمالي الحالات المكتشفة للكارت المختار: (${targetList.length}) حالة.`;

    return NextResponse.json({
      success: true,
      message: msg,
      count: targetList.length,
      recipients: emailList,
      filterType,
      timestamp: new Date().toISOString(),
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ أثناء معالجة البيانات: ' + err.message },
      { status: 500 }
    );
  }
}
