import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const employeesData = await prisma.employee.findMany({
      include: {
        contracts: {
          orderBy: { created_at: 'desc' },
        },
      },
      orderBy: { employee_code: 'asc' },
    });

    const employees = employeesData.map((emp) => {
      const activeContract = emp.contracts[0];
      return {
        ...emp,
        national_id: emp.national_id ? emp.national_id.toString() : '',
        contract_start_date: activeContract?.contract_start_date
          ? activeContract.contract_start_date.toISOString().split('T')[0]
          : emp.hiring_date
          ? emp.hiring_date.toISOString().split('T')[0]
          : '',
        contract_end_date: activeContract?.contract_end_date
          ? activeContract.contract_end_date.toISOString().split('T')[0]
          : '',
        contract_type: activeContract?.contract_type || emp.contract_type || 'محدد المدة',
      };
    });

    return NextResponse.json({ success: true, employees });
  } catch (error: any) {
    console.error('Reports Data Fetch Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
