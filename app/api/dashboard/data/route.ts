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
    });

    const renewalsData = await prisma.renewalRequest.findMany({
      orderBy: { created_at: 'desc' },
    });

    // تحويل الـ BigInt لـ String لحماية السيرفر من أخطاء الـ JSON
    const employees = employeesData.map((emp) => ({
      ...emp,
      national_id: emp.national_id ? emp.national_id.toString() : '',
    }));

    const renewals = renewalsData.map((req) => ({
      ...req,
      contract_end_date: req.contract_end_date ? req.contract_end_date.toISOString().split('T')[0] : null,
      new_contract_end_date: req.new_contract_end_date ? req.new_contract_end_date.toISOString().split('T')[0] : null,
      request_date: req.request_date ? req.request_date.toISOString().split('T')[0] : null,
    }));

    return NextResponse.json({
      success: true,
      employees,
      renewals,
    });
  } catch (error: any) {
    console.error('Dashboard Fetch Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
