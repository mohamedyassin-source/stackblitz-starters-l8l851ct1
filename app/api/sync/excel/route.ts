import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const determineEmployeeStatus = (dept: string, jobTitle: string) => {
  const cleanDept = String(dept || '').trim().toLowerCase();
  const cleanJob = String(jobTitle || '').trim().toLowerCase();

  const isTransferDept = cleanDept.includes('تحويل') || cleanDept.includes('تحويلات') || cleanDept.includes('تحت الاعتماد');

  if (isTransferDept) {
    const isActiveException = 
      cleanJob.includes('اجازة بدون راتب') || 
      cleanJob.includes('إجازة بدون راتب') ||
      cleanJob.includes('بدون تحضير') || 
      cleanJob.includes('تحقيقات');

    return isActiveException ? 'Active' : 'Inactive';
  }

  return 'Active';
};

const calculateContractEndDate = (hiringDateStr: string) => {
  if (!hiringDateStr) return null;
  const date = new Date(hiringDateStr);
  if (isNaN(date.getTime())) return null;

  date.setFullYear(date.getFullYear() + 1);
  date.setDate(date.getDate() - 1);

  return date;
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

export async function POST(req: Request) {
  try {
    const { rows } = await req.json();
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'الملف فارغ أو البيانات غير صالحة' }, { status: 400 });
    }

    let updatedCount = 0;
    let newCount = 0;

    for (const row of rows) {
      const codeRaw = row.employee_code || row.EmployeeCode || row.code || row.Code || row['كود الموظف'];
      const empCode = parseInt(String(codeRaw || '').trim(), 10);

      if (isNaN(empCode)) continue;

      const dept = String(row.department || row.Department || row['الإدارة'] || '').trim();
      const jobTitle = String(row.job_title || row.JobTitle || row['الوظيفة'] || '').trim();
      const company = String(row.company || row.Company || row['الشركة'] || '').trim();
      const empName = String(row.employee_name || row.EmployeeName || row.name || row['اسم الموظف'] || '').trim();
      const nationalId = row.national_id || row.NationalID || row['الرقم القومي'];
      const hiringDateStr = String(row.hiring_date || row.HiringDate || row['تاريخ التعيين'] || '').trim();
      const mobile = String(row.mobile || row.Mobile || row['الموبايل'] || '').trim();
      const email = String(row.email || row.Email || row['البريد الإلكتروني'] || '').trim();

      const calculatedStatus = determineEmployeeStatus(dept, jobTitle);
      const hiringDate = hiringDateStr ? new Date(hiringDateStr) : null;

      // التأكد من وجود الموظف في نيون
      const existingEmployee = await prisma.employee.findUnique({
        where: { employee_code: empCode },
      });

      if (existingEmployee) {
        await prisma.employee.update({
          where: { employee_code: empCode },
          data: {
            department: dept || existingEmployee.department,
            job_title: jobTitle || existingEmployee.job_title,
            status: calculatedStatus,
            ...(company && { company }),
          },
        });
        updatedCount++;
      } else {
        await prisma.employee.create({
          data: {
            employee_code: empCode,
            employee_name: empName,
            national_id: parseNationalId(nationalId),
            department: dept || null,
            job_title: jobTitle || null,
            company: company || null,
            hiring_date: hiringDate && !isNaN(hiringDate.getTime()) ? hiringDate : null,
            status: calculatedStatus,
            mobile: mobile || null,
            email: email || null,
          },
        });

        const contractEndDate = calculateContractEndDate(hiringDateStr);
        await prisma.contract.create({
          data: {
            employee_code: empCode,
            contract_type: 'محدد المدة',
            contract_start_date: hiringDate && !isNaN(hiringDate.getTime()) ? hiringDate : null,
            contract_end_date: contractEndDate,
            status: calculatedStatus,
          },
        });

        newCount++;
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      newCount,
      message: `🎉 اكتملت العملية بنجاح!\n\n• تم تحديث بيانات: ${updatedCount} موظف موجود.\n• تم إضافة موظفين وعقود جديدة: ${newCount} موظف جديد.`,
    });
  } catch (error: any) {
    console.error('Data Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
