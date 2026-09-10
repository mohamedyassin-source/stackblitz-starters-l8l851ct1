import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { db } from '@/lib/firebase'; // لو مسار فايربيز عندك مختلف غيره
import { collection, getDocs } from 'firebase/firestore';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const empSnapshot = await getDocs(collection(db, 'employees'));
    const employees = empSnapshot.docs.map(doc => doc.data());

    let successCount = 0;

    for (const emp of employees) {
      const code = String(emp.employee_code || emp.EmployeeCode || '').trim();
      if (!code) continue;

      const safeDate = (dateStr: any) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
      };

      await prisma.employee.upsert({
        where: { employee_code: code },
        update: {}, 
        create: {
          employee_code: code,
          employee_name: String(emp.employee_name || emp.ArabicName || emp.EmployeeName || ''),
          national_id: emp.national_id || emp.NationalID || null,
          department: emp.department || emp.Department || null,
          status: emp.status || emp.Status || 'Active',
          birth_date: safeDate(emp.birth_date || emp.BirthDate),
          hiring_date: safeDate(emp.hiring_date || emp.HiringDate),
        },
      });
      successCount++;
    }

    return NextResponse.json({ 
      success: true, 
      message: `تم نقل عدد ${successCount} موظف بنجاح إلى Neon!` 
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
