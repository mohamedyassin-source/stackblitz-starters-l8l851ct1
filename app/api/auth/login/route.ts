import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, employee_code, password, new_password } = body;

    const cleanCode = parseInt(String(employee_code || '').trim(), 10);
    if (isNaN(cleanCode)) {
      return NextResponse.json({ success: false, error: 'كود الموظف غير صالح' }, { status: 400 });
    }

    // 1. عملية تسجيل الدخول
    if (action === 'login') {
      const appUser = await prisma.appUser.findFirst({
        where: { employee_code: cleanCode },
      });

      const employee = await prisma.employee.findUnique({
        where: { employee_code: cleanCode },
      });

      if (!appUser && !employee) {
        return NextResponse.json(
          { success: false, error: `كود الموظف (${cleanCode}) غير موجود بالنظام.` },
          { status: 404 }
        );
      }

      const mergedData = {
        employee_code: cleanCode,
        employee_name: appUser?.username || employee?.employee_name || '',
        department: employee?.department || '',
        company: employee?.company || '',
        role: appUser?.role || (employee?.department?.includes('الموارد البشرية') ? 'admin' : 'Employee'),
      };

      const storedPassword = appUser?.password;

      if (storedPassword && storedPassword !== '') {
        if (storedPassword !== password) {
          return NextResponse.json({ success: false, error: 'كلمة السر غير صحيحة.' }, { status: 401 });
        }
      } else {
        if (password !== '123' && password !== '123456' && password !== String(cleanCode)) {
          return NextResponse.json({ success: false, error: 'كلمة السر غير صحيحة.' }, { status: 401 });
        }
        return NextResponse.json({
          success: true,
          requirePasswordChange: true,
          user: mergedData,
        });
      }

      return NextResponse.json({
        success: true,
        requirePasswordChange: false,
        user: mergedData,
      });
    }

    // 2. عملية تغيير كلمة السر
    if (action === 'change_password') {
      if (!new_password || new_password.length < 6) {
        return NextResponse.json({ success: false, error: 'كلمة السر الجديدة يجب أن تكون 6 أحرف/أرقام على الأقل.' }, { status: 400 });
      }

      const employee = await prisma.employee.findUnique({
        where: { employee_code: cleanCode },
      });

      const usernameVal = employee?.employee_name || String(cleanCode);

      await prisma.appUser.upsert({
        where: { username: usernameVal },
        update: { password: new_password },
        create: {
          employee_code: cleanCode,
          username: usernameVal,
          password: new_password,
          role: 'HR',
        },
      });

      return NextResponse.json({
        success: true,
        message: 'تم حفظ كلمة السر الجديدة بنجاح! ✅',
      });
    }

    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error: any) {
    console.error('Auth API Server Error:', error);
    return NextResponse.json({ success: false, error: `خطأ بالسيرفر: ${error.message}` }, { status: 500 });
  }
}
