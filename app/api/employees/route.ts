import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const parseBigIntId = (val: any) => {
  if (!val) return null;
  try {
    const numStr = String(val).trim();
    if (numStr.includes('e') || numStr.includes('E') || numStr.includes('.')) {
      return BigInt(Math.round(Number(val)));
    }
    return BigInt(numStr);
  } catch (e) {
    return null;
  }
};

// جلب الموظفين مع عقودهم
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
        contract_id: activeContract?.contract_id || null,
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
    console.error('Employees Fetch Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// تنفيذ العمليات المختلفة
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    // 1. إضافة أو تعديل موظف
    if (action === 'save' || action === 'add') {
      const code = parseInt(body.employee_code, 10);
      if (isNaN(code)) {
        return NextResponse.json({ success: false, error: 'كود الموظف غير صالح' }, { status: 400 });
      }

      const empData = {
        employee_name: body.employee_name || '',
        national_id: parseBigIntId(body.national_id),
        birth_date: body.birth_date ? new Date(body.birth_date) : null,
        age: body.age ? parseInt(String(body.age), 10) : null,
        department: body.department || null,
        company: body.company || null,
        job_title: body.job_title || null,
        hiring_date: body.hiring_date ? new Date(body.hiring_date) : null,
        status: body.status || 'Active',
        email: body.email || null,
        mobile: body.mobile || null,
      };

      await prisma.employee.upsert({
        where: { employee_code: code },
        update: empData,
        create: { employee_code: code, ...empData },
      });

      // إضافة/تحديث العقد المقترن
      const existingContract = await prisma.contract.findFirst({
        where: { employee_code: code, status: 'Active' },
      });

      const contractData = {
        employee_code: code,
        contract_type: body.contract_type || 'محدد المدة',
        contract_start_date: body.hiring_date ? new Date(body.hiring_date) : null,
        contract_end_date: body.contract_end_date ? new Date(body.contract_end_date) : null,
        status: body.status || 'Active',
      };

      if (existingContract) {
        await prisma.contract.update({
          where: { contract_id: existingContract.contract_id },
          data: contractData,
        });
      } else {
        await prisma.contract.create({ data: contractData });
      }

      return NextResponse.json({ success: true, message: 'تم حفظ الموظف وتحديث العقد بنجاح ✅' });
    }

    // 2. إنهاء وتجميد موظف
    if (action === 'terminate') {
      const code = parseInt(body.employee_code, 10);
      await prisma.employee.update({
        where: { employee_code: code },
        data: {
          status: 'Inactive',
          department: 'تحويلات/تحت الاعتماد',
          termination_reason: body.termination_reason || 'استقالة',
          termination_date: body.termination_date ? new Date(body.termination_date) : new Date(),
        },
      });

      await prisma.contract.updateMany({
        where: { employee_code: code, status: 'Active' },
        data: { status: 'Inactive', contract_type: 'إنهاء تعاقد' },
      });

      return NextResponse.json({ success: true, message: 'تم تحويل الموظف وإنهائه بنجاح ✅' });
    }

    // 3. نقل مجمع
    if (action === 'bulk_transfer') {
      const codes = body.employee_codes.map((c: any) => parseInt(c, 10)).filter((c: number) => !isNaN(c));
      const updateData: any = {};
      if (body.department) updateData.department = body.department;
      if (body.company) updateData.company = body.company;

      await prisma.employee.updateMany({
        where: { employee_code: { in: codes } },
        data: updateData,
      });

      return NextResponse.json({ success: true, message: `تم نقل ${codes.length} موظف بنجاح ✅` });
    }

    // 4. حذف مجمع
    if (action === 'bulk_delete') {
      const codes = body.employee_codes.map((c: any) => parseInt(c, 10)).filter((c: number) => !isNaN(c));
      await prisma.employee.deleteMany({
        where: { employee_code: { in: codes } },
      });

      return NextResponse.json({ success: true, message: 'تم حذف الموظفين المحددين بنجاح 🗑️' });
    }

    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error: any) {
    console.error('Employees Action Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
