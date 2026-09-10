import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const employees = await prisma.employee.findMany({
      include: {
        contracts: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    const renewals = await prisma.renewalRequest.findMany({
      orderBy: { created_at: 'desc' },
    });

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
