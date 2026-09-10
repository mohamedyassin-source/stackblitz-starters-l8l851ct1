import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    // جلب الموظفين مع عقودهم النشطة
    const employeesData = await prisma.employee.findMany({
      include: {
        contracts: {
          where: { status: 'Active' },
          take: 1,
          orderBy: { created_at: 'desc' },
        },
      },
    });

    // جلب كافة طلبات التجديد
    const renewalsData = await prisma.renewalRequest.findMany({
      orderBy: { created_at: 'desc' },
    });

    // تنسيق شكل البيانات ليتوافق تماماً مع الواجهة
    const employees = employeesData.map((emp) => {
      const activeContract = emp.contracts[0];
      return {
        ...emp,
        contract_end_date: activeContract?.contract_end_date
          ? activeContract.contract_end_date.toISOString().split('T')[0]
          : null,
        contract_type: activeContract?.contract_type || emp.contract_type || 'محدد المدة',
      };
    });

    return NextResponse.json({
      success: true,
      employees,
      renewals: renewalsData,
    });
  } catch (error: any) {
    console.error('Alerts Data Fetch Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
