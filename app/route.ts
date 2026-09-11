import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  // 🔒 حماية الرابط: لازم يبقى فيه CRON_SECRET في env، وإلا أي حد لاقى الرابط يقدر يشغّله ويبعت إيميلات
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }
  }

  try {
    // 1. سحب بيانات الموظفين
    const { data: employees, error } = await supabase.from('employees').select('*').neq('contract_type', 'دائم');
    if (error) throw error;

    // 2. حساب الأيام المتبقية وتصفية العقود الحرجة (أقل من 45 يوم أو منتهية)
    const today = new Date();
    const urgentAlerts = (employees || []).map((emp: any) => {
      if (!emp.contract_end_date) return null;
      const end = new Date(emp.contract_end_date);
      if (isNaN(end.getTime())) return null;
      const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
      return { ...emp, days };
    }).filter((emp: any) => emp !== null && emp.days <= 45)
      .sort((a: any, b: any) => a.days - b.days);

    if (urgentAlerts.length === 0) {
      return NextResponse.json({ message: 'لا توجد تنبيهات عاجلة اليوم.' });
    }

    // 3. تصميم الإيميل (HTML Table) بشكل فخم ومناسب للإيميلات
    let tableRows = urgentAlerts.map((emp: any) => {
      const isExpired = emp.days < 0;
      const statusColor = isExpired ? '#dc2626' : '#ea580c';
      const statusBg = isExpired ? '#fef2f2' : '#fff7ed';
      const statusText = isExpired ? `منتهي (${Math.abs(emp.days)} يوم)` : `متبقي ${emp.days} يوم`;

      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px; font-family: monospace; font-weight: bold; color: #9c7a2e;">${emp.employee_code}</td>
          <td style="padding: 10px; font-weight: bold; color: #0f172a;">${emp.employee_name}</td>
          <td style="padding: 10px; color: #64748b;">${emp.department || '—'}</td>
          <td style="padding: 10px; font-family: monospace;">${emp.contract_end_date}</td>
          <td style="padding: 10px;">
            <span style="background-color: ${statusBg}; color: ${statusColor}; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
              ${statusText}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; text-align: right; background-color: #f8fafc; padding: 20px;">
        <div style="max-width: 700px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          
          <div style="background-color: #0a0f1c; padding: 20px; text-align: center; border-bottom: 4px solid #b8934a;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px;">مجموعة شركات المراسم الدولية</h1>
            <p style="color: #94a3b8; margin: 5px 0 0; font-size: 13px;">التقرير اليومي لتنبيهات العقود</p>
          </div>

          <div style="padding: 20px;">
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">السيد مدير الموارد البشرية،<br>يرجى العلم بوجود <strong>(${urgentAlerts.length})</strong> عقد يتطلب اتخاذ إجراء فوري (عقود منتهية أو يتبقى عليها أقل من 45 يوماً):</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; text-align: right;">
              <thead>
                <tr>
                  <th style="background-color: #f1f5f9; padding: 10px; color: #475569; border-bottom: 2px solid #e2e8f0;">الكود</th>
                  <th style="background-color: #f1f5f9; padding: 10px; color: #475569; border-bottom: 2px solid #e2e8f0;">الموظف</th>
                  <th style="background-color: #f1f5f9; padding: 10px; color: #475569; border-bottom: 2px solid #e2e8f0;">الإدارة</th>
                  <th style="background-color: #f1f5f9; padding: 10px; color: #475569; border-bottom: 2px solid #e2e8f0;">الانتهاء</th>
                  <th style="background-color: #f1f5f9; padding: 10px; color: #475569; border-bottom: 2px solid #e2e8f0;">الموقف</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>

            <div style="margin-top: 30px; text-align: center;">
              <a href="https://your-system-link.com" style="background-color: #9c7a2e; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px;">
                الانتقال للنظام لاتخاذ إجراء
              </a>
            </div>
          </div>

          <div style="background-color: #f8fafc; padding: 15px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0;">
            هذه رسالة تلقائية من نظام إدارة العقود والتجديدات، لا تقم بالرد عليها.
          </div>
        </div>
      </div>
    `;

    // 4. إعداد مرسل الإيميل (استخدمت Gmail كمثال، يفضل تغييره لاحقاً لإيميل الشركة)
    const transporter = nodemailer.createTransport({
      service: 'gmail', // أو outlook أو أي SMTP
      auth: {
        user: process.env.EMAIL_USER, // إيميلك اللي هيبعت
        pass: process.env.EMAIL_PASS  // الباسورد (أو App Password لو بتسخدم Gmail)
      }
    });

    // 5. إرسال الإيميل
    await transporter.sendMail({
      from: `"نظام إدارة العقود" <${process.env.EMAIL_USER}>`,
      to: 'hr-director@almarasem.com', // 🌟 اكتب هنا الإيميل اللي هيستقبل التقرير
      subject: `🚨 تنبيهات العقود اليومية (${urgentAlerts.length} عقد هام) - ${new Date().toLocaleDateString('ar-EG')}`,
      html: htmlContent,
    });

    return NextResponse.json({ message: 'تم إرسال إيميل التنبيهات بنجاح!' });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}