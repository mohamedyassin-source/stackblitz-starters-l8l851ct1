import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// جلب العقود المعتمدة المتاحة للتوقيع
export async function GET() {
  try {
    const approvedRequests = await prisma.renewalRequest.findMany({
      where: { status: 'Approved' },
      orderBy: { created_at: 'desc' },
    });

    const employees = await prisma.employee.findMany();

    const formattedRequests = approvedRequests.map((req) => {
      const emp = employees.find((e) => e.employee_code === req.employee_code);
      return {
        ...req,
        contract_end_date: req.contract_end_date ? req.contract_end_date.toISOString().split('T')[0] : null,
        new_contract_end_date: req.new_contract_end_date ? req.new_contract_end_date.toISOString().split('T')[0] : null,
        employee_address: emp?.termination_reason || '', // أو العنوان المتاح
        national_id: emp?.national_id ? emp.national_id.toString() : '',
      };
    });

    return NextResponse.json({ success: true, requests: formattedRequests });
  } catch (error: any) {
    console.error('Signatures Fetch Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// تنفيذ التوقيع المجمع والحذف
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, request_ids } = body;

    if (!request_ids || !Array.isArray(request_ids) || request_ids.length === 0) {
      return NextResponse.json({ success: false, error: 'لم يتم اختيار أية طلبات' }, { status: 400 });
    }

    // 1. تسجيل التوقيع (فردي أو مجمع)
    if (action === 'sign') {
      await prisma.renewalRequest.updateMany({
        where: { request_id: { in: request_ids } },
        data: { signature_status: 'تم التوقيع' },
      });

      return NextResponse.json({ success: true, message: 'تم تسجيل التوقيع بنجاح ✍️✅' });
    }

    // 2. حذف طلبات التجديد
    if (action === 'delete') {
      await prisma.renewalRequest.deleteMany({
        where: { request_id: { in: request_ids } },
      });

      return NextResponse.json({ success: true, message: 'تم حذف الطلبات بنجاح 🗑️✅' });
    }

    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error: any) {
    console.error('Signatures Action Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
