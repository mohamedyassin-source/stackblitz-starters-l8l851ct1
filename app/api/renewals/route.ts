import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// جلب كافة طلبات التجديد
export async function GET() {
  try {
    const requests = await prisma.renewalRequest.findMany({
      orderBy: { created_at: 'desc' },
    });

    const formattedRequests = requests.map((req) => ({
      ...req,
      contract_end_date: req.contract_end_date ? req.contract_end_date.toISOString().split('T')[0] : null,
      new_contract_end_date: req.new_contract_end_date ? req.new_contract_end_date.toISOString().split('T')[0] : null,
      request_date: req.request_date ? req.request_date.toISOString().split('T')[0] : null,
    }));

    return NextResponse.json({ success: true, requests: formattedRequests });
  } catch (error: any) {
    console.error('Fetch Renewals Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// تنفيذ عمليات الاعتماد والرفض والحذف
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, request_ids, request_id, confirmed_months, custom_start_date, custom_end_date } = body;

    // 1. اعتماد طلب تجديد (فردي أو مجمع)
    if (action === 'approve') {
      const ids: string[] = request_ids || (request_id ? [request_id] : []);

      for (const id of ids) {
        const renewalReq = await prisma.renewalRequest.findUnique({
          where: { request_id: id },
        });

        if (!renewalReq) continue;

        const empCode = renewalReq.employee_code;
        const newStartDate = custom_start_date ? new Date(custom_start_date) : new Date();
        const newEndDate = custom_end_date ? new Date(custom_end_date) : new Date();

        // تحديث الطلب
        await prisma.renewalRequest.update({
          where: { request_id: id },
          data: {
            status: 'Approved',
            signature_status: 'في انتظار توقيع الموظف',
            renewal_months: confirmed_months || 12,
            new_contract_end_date: newEndDate,
            decision_date: new Date(),
          },
        });

        // تحديث عقد الموظف في جدول العقود
        await prisma.contract.updateMany({
          where: { employee_code: empCode, status: 'Active' },
          data: {
            contract_start_date: newStartDate,
            contract_end_date: newEndDate,
            status: 'Active',
          },
        });
      }

      return NextResponse.json({ success: true, message: 'تم اعتماد الطلبات وتحديث العقود بنجاح ✅' });
    }

    // 2. رفض طلب تجديد
    if (action === 'reject') {
      await prisma.renewalRequest.update({
        where: { request_id },
        data: {
          status: 'Rejected',
          signature_status: 'مرفوض',
          decision_date: new Date(),
        },
      });

      return NextResponse.json({ success: true, message: 'تم رفض الطلب بنجاح ❌' });
    }

    // 3. حذف طلب تجديد
    if (action === 'delete') {
      await prisma.renewalRequest.delete({
        where: { request_id },
      });

      return NextResponse.json({ success: true, message: 'تم حذف طلب التجديد بنجاح 🗑️' });
    }

    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error: any) {
    console.error('Renewal Action Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
