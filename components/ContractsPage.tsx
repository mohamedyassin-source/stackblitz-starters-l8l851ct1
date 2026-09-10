import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// جلب الموظفين والعقود بطلب واحد سريع
export async function GET() {
  try {
    const employees = await prisma.employee.findMany({
      include: {
        contracts: {
          orderBy: { created_at: 'desc' },
        },
      },
      orderBy: { employee_code: 'asc' },
    });

    const renewals = await prisma.renewalRequest.findMany({
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json({ success: true, employees, renewals });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// تنفيذ العمليات المختلفة
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    // 1. إنهاء تعاقد
    if (action === 'terminate') {
      const code = parseInt(body.employee_code, 10);
      await prisma.employee.update({
        where: { employee_code: code },
        data: { status: 'Inactive', department: 'تحويلات/تحت الاعتماد' },
      });
      await prisma.contract.updateMany({
        where: { employee_code: code, status: 'Active' },
        data: { status: 'Terminated', contract_type: 'إنهاء تعاقد' },
      });
      return NextResponse.json({ success: true, message: 'تم إنهاء التعاقد بنجاح ✅' });
    }

    // 2. إعادة تفعيل موظف
    if (action === 'reactivate') {
      const code = parseInt(body.employee_code, 10);
      await prisma.employee.update({
        where: { employee_code: code },
        data: { status: 'Active', department: body.department },
      });
      await prisma.contract.updateMany({
        where: { employee_code: code },
        data: { status: 'Active' },
      });
      return NextResponse.json({ success: true, message: 'تم إعادة تفعيل الموظف بنجاح ✅' });
    }

    // 3. تعديل أو إضافة عقد
    if (action === 'edit_contract') {
      const code = parseInt(body.employee_code, 10);
      if (body.contract_id) {
        await prisma.contract.update({
          where: { contract_id: body.contract_id },
          data: {
            contract_type: body.contract_type,
            contract_start_date: body.contract_start_date ? new Date(body.contract_start_date) : null,
            contract_end_date: body.contract_end_date ? new Date(body.contract_end_date) : null,
          },
        });
      } else {
        await prisma.contract.create({
          data: {
            employee_code: code,
            contract_type: body.contract_type,
            contract_start_date: body.contract_start_date ? new Date(body.contract_start_date) : null,
            contract_end_date: body.contract_end_date ? new Date(body.contract_end_date) : null,
            status: 'Active',
          },
        });
      }
      return NextResponse.json({ success: true, message: 'تم حفظ بيانات العقد بنجاح ✅' });
    }

    // 4. طلب تجديد
    if (action === 'create_renewal') {
      const currentYear = new Date().getFullYear();
      const reqId = `RR-${currentYear}-${Math.floor(1000 + Math.random() * 9000)}`;
      
      const newRequest = await prisma.renewalRequest.create({
        data: {
          request_id: reqId,
          employee_code: parseInt(body.employee_code, 10),
          employee_name: body.employee_name,
          department: body.department,
          job_title: body.job_title,
          company: body.company,
          contract_end_date: body.contract_end_date ? new Date(body.contract_end_date) : null,
          new_contract_end_date: body.new_contract_end_date ? new Date(body.new_contract_end_date) : null,
          renewal_months: body.renewal_months || null,
          status: 'Pending',
          signature_status: 'قيد التوقيع',
          request_date: new Date(),
        },
      });
      return NextResponse.json({ success: true, message: `تم إنشاء الطلب ${reqId} بنجاح ✅`, request: newRequest });
    }

    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
