import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// جلب مستخدمي النظام والموظفين والإعدادات
export async function GET() {
  try {
    const appUsers = await prisma.appUser.findMany({
      orderBy: { created_at: 'desc' },
    });

    const employees = await prisma.employee.findMany({
      select: {
        employee_code: true,
        employee_name: true,
        status: true,
      },
      orderBy: { employee_code: 'asc' },
    });

    const settings = await prisma.setting.findMany();

    return NextResponse.json({
      success: true,
      appUsers,
      employees,
      settings,
    });
  } catch (error: any) {
    console.error('Settings Fetch Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// تنفيذ العمليات (إضافة/تعديل/حذف مستخدم وتعديل الصلاحيات)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, user_id, username, password, employee_code, role } = body;

    // 1. إضافة مستخدم في app_users
    if (action === 'add_user') {
      const cleanCode = employee_code ? parseInt(String(employee_code).trim(), 10) : null;

      const newUser = await prisma.appUser.create({
        data: {
          username: username.trim(),
          password: password || '123456',
          employee_code: cleanCode || 0,
          role: role || 'Admin',
        },
      });

      return NextResponse.json({ success: true, message: 'تم إضافة المستخدم بنجاح ✅', user: newUser });
    }

    // 2. تحديث دور/صلاحية مستخدم
    if (action === 'update_user_role') {
      await prisma.appUser.update({
        where: { user_id },
        data: { role },
      });

      return NextResponse.json({ success: true, message: 'تم تحديث الصلاحية بنجاح ✅' });
    }

    // 3. حذف مستخدم من app_users
    if (action === 'delete_user') {
      await prisma.appUser.delete({
        where: { user_id },
      });

      return NextResponse.json({ success: true, message: 'تم حذف المستخدم بنجاح 🗑️' });
    }

    // 4. حفظ الإعدادات العامة
    if (action === 'save_general_settings') {
      const { settings } = body;
      for (const key in settings) {
        await prisma.setting.upsert({
          where: { setting_key: key },
          update: { setting_value: String(settings[key]) },
          create: {
            setting_key: key,
            setting_value: String(settings[key]),
            active: true,
          },
        });
      }

      return NextResponse.json({ success: true, message: 'تم حفظ إعدادات النظام بنجاح ✅' });
    }

    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error: any) {
    console.error('Settings Action Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
