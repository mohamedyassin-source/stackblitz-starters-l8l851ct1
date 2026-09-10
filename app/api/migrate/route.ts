import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const empSnapshot = await getDocs(collection(db, 'employees'));
    const employees = empSnapshot.docs.map(doc => doc.data());

    const contractSnapshot = await getDocs(collection(db, 'contracts'));
    const contracts = contractSnapshot.docs.map(doc => doc.data());

    let migratedEmployees = 0;
    let migratedContracts = 0;

    const safeDate = (dateStr: any) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    };

    const parseNationalId = (val: any) => {
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

    for (const emp of employees) {
      const codeRaw = emp.employee_code || emp.EmployeeCode;
      const code = parseInt(String(codeRaw), 10);
      
      if (isNaN(code)) continue;

      await prisma.employee.upsert({
        where: { employee_code: code },
        update: {},
        create: {
          employee_code: code,
          employee_name: String(emp.employee_name || emp.ArabicName || emp.EmployeeName || ''),
          national_id: parseNationalId(emp.national_id || emp.NationalID),
          department: emp.department || emp.Department || null,
          company: emp.company || emp.Company || null,
          job_title: emp.job_title || emp.JobTitle || null,
          status: emp.status || emp.Status || 'Active',
          birth_date: safeDate(emp.birth_date || emp.BirthDate),
          hiring_date: safeDate(emp.hiring_date || emp.HiringDate),
          age: emp.age ? parseInt(String(emp.age), 10) : null,
        },
      });
      migratedEmployees++;

      const empContract = contracts.find(c => parseInt(String(c.employee_code || c.EmployeeCode), 10) === code);
      if (empContract) {
        await prisma.contract.create({
          data: {
            employee_code: code,
            contract_type: empContract.contract_type || empContract.ContractType || 'محدد المدة',
            contract_start_date: safeDate(empContract.contract_start_date || empContract.ContractStartDate),
            contract_end_date: safeDate(empContract.contract_end_date || empContract.ContractEndDate),
            status: empContract.status || empContract.Status || 'Active',
          }
        });
        migratedContracts++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `🎉 تم نقل ${migratedEmployees} موظف و ${migratedContracts} عقد بنجاح إلى Neon PostgreSQL!`
    });

  } catch (error: any) {
    console.error("Migration Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
