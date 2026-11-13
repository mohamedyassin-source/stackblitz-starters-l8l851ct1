'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';

/* ================================================================== */
/*  الأنواع والثوابت والدوال المساعدة                                      */
/* ================================================================== */
// كل ما يخص شكل بيانات الموظف + الثوابت + الدوال المساعدة في مكان واحد.

/** اسم عمود الدرجة في جدول employees بقاعدة البيانات. غيّره هنا فقط لو الاسم عندك مختلف (مثلاً 'grade'). */
const GRADE_COLUMN = 'grad';

const PERMANENT = 'دائم';
const TRANSFER_DEPARTMENT = 'تحويلات تحت الاعتماد';
const ABOVE_AGE_THRESHOLD = 60;

const STANDARD_CONTRACT_TYPES = [
  'محدد المدة',
  'محدد المدة - فوق السن',
  'محدد المدة - مكافأة شاملة',
  PERMANENT,
] as const;

const TERMINATION_REASONS = [
  'انتهاء عقد', 'إنهاء تعاقد', 'استقالة', 'إنهاء خدمات',
  'بلوغ سن', 'انقطاع عن العمل', 'نقل شركة شقيقة',
  'عدم اجتياز فترة الاختبار', 'أجازة بدون راتب',
] as const;

const AGE_RANGES = {
  '60_plus': { label: 'فوق السن (60 فأكثر)', test: (a: number) => a >= 60 },
  '50_59': { label: 'من 50 إلى 59', test: (a: number) => a >= 50 && a < 60 },
  '30_49': { label: 'من 30 إلى 49', test: (a: number) => a >= 30 && a < 50 },
  under_30: { label: 'أقل من 30', test: (a: number) => a < 30 },
} as const;
type AgeRangeKey = keyof typeof AGE_RANGES;

/* ------------------------------------------------------------------ */
/*  نموذج الموظف بعد التنظيف (Normalized)                                */
/* ------------------------------------------------------------------ */

interface Employee {
  id: string | number | null;
  code: string;
  name: string;
  nationalId: string;
  birthDate: string;
  department: string;
  company: string;
  jobTitle: string;
  grade: string;
  medicalCategory: string;
  hiringDate: string;
  contractId: string;
  contractType: string;
  contractEndDate: string;
  status: string;
  email: string;
  mobile: string;
  manager: string;
  terminationReason: string;
  // مشتقات محسوبة مرة واحدة
  age: number | null;
  isInactive: boolean;
  isFixedTerm: boolean;
  isMissingData: boolean;
}

type Raw = Record<string, any>;

/** يقرأ أول مفتاح موجود من الصف الخام (يدعم الأسماء القديمة PascalCase). */
const pick = (raw: Raw, ...keys: string[]): string => {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null) return String(raw[k]).trim();
  }
  return '';
};

const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** سنة ناقص يوم من تاريخ البداية (للعقود المحددة). بتستخدم UTC عشان ما يحصلش فرق يوم بسبب التوقيت. */
const addYearMinusDay = (start?: string | null): string => {
  if (!start) return '';
  const d = new Date(start);
  if (isNaN(d.getTime())) return '';
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
};

const calcAge = (rawAge: string, birthDate: string, nationalId: string): number | null => {
  if (rawAge !== '' && !isNaN(Number(rawAge))) return Number(rawAge);

  let birth: Date | null = null;
  if (birthDate) {
    const b = new Date(birthDate);
    if (!isNaN(b.getTime())) birth = b;
  }
  if (!birth) {
    const id = nationalId.replace(/\D/g, '');
    if (id.length === 14) {
      const century = id[0] === '3' ? '20' : '19';
      const b = new Date(`${century}${id.slice(1, 3)}-${id.slice(3, 5)}-${id.slice(5, 7)}`);
      if (!isNaN(b.getTime())) birth = b;
    }
  }
  if (!birth) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getUTCFullYear();
  const m = today.getMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getUTCDate())) age--;
  return age;
};

const normalizeEmployee = (raw: Raw): Employee => {
  const nationalId = pick(raw, 'national_id', 'NationalID');
  const mobile = pick(raw, 'mobile', 'Mobile', 'MOBILE');
  const birthDate = pick(raw, 'birth_date', 'BirthDate');
  const department = pick(raw, 'department', 'Department');
  const status = pick(raw, 'status', 'Status') || 'Active';
  const contractType = pick(raw, 'contract_type', 'ContractType');

  return {
    id: raw.id ?? null,
    code: pick(raw, 'employee_code', 'EmployeeCode'),
    name: pick(raw, 'employee_name', 'ArabicName'),
    nationalId,
    birthDate,
    department,
    company: pick(raw, 'company', 'Company'),
    jobTitle: pick(raw, 'job_title', 'JobTitle'),
    grade: pick(raw, GRADE_COLUMN, 'Grade', 'grade'),
    medicalCategory: pick(raw, 'medical_category', 'MedicalCategory'),
    hiringDate: pick(raw, 'hiring_date', 'HiringDate'),
    contractId: pick(raw, 'contract_id', 'ContractID'),
    contractType,
    contractEndDate: pick(raw, 'contract_end_date', 'ContractEndDate'),
    status,
    email: pick(raw, 'email', 'Email'),
    mobile,
    manager: pick(raw, 'manager', 'Manager'),
    terminationReason: pick(raw, 'termination_reason', 'TerminationReason'),
    age: calcAge(pick(raw, 'age', 'Age'), birthDate, nationalId),
    isInactive: department.includes('تحويلات') || status.toLowerCase() !== 'active',
    isFixedTerm: contractType.includes('محدد'),
    isMissingData: !nationalId || !mobile,
  };
};

/* ------------------------------------------------------------------ */
/*  فلاتر الكروت                                                        */
/* ------------------------------------------------------------------ */

type CardKey = 'ALL_ACTIVE' | 'NEW_JOINERS' | 'FIXED' | 'PERM' | 'ABOVE_AGE' | 'MISSING_DATA';

const CARD_PREDICATES: Record<CardKey, (e: Employee, year: number) => boolean> = {
  ALL_ACTIVE: () => true,
  NEW_JOINERS: (e, year) => {
    if (!e.hiringDate) return false;
    const d = new Date(e.hiringDate);
    return !isNaN(d.getTime()) && d.getFullYear() === year;
  },
  FIXED: (e) => e.isFixedTerm,
  PERM: (e) => e.contractType === PERMANENT,
  ABOVE_AGE: (e) => e.contractType.includes('فوق السن') || (e.age !== null && e.age >= ABOVE_AGE_THRESHOLD),
  MISSING_DATA: (e) => e.isMissingData,
};

/* ------------------------------------------------------------------ */
/*  نموذج الإضافة / التعديل وتحويله لصفوف قاعدة البيانات                     */
/* ------------------------------------------------------------------ */

type EmployeeDraft = Pick<
  Employee,
  | 'code' | 'name' | 'nationalId' | 'birthDate' | 'department' | 'company'
  | 'jobTitle' | 'grade' | 'hiringDate' | 'contractType' | 'contractEndDate'
  | 'status' | 'email' | 'mobile' | 'manager'
>;

const EMPTY_DRAFT: EmployeeDraft = {
  code: '', name: '', nationalId: '', birthDate: '', department: '', company: '',
  jobTitle: '', grade: '', hiringDate: '', contractType: STANDARD_CONTRACT_TYPES[0],
  contractEndDate: '', status: 'Active', email: '', mobile: '', manager: '',
};

const toDraft = (e: Employee): EmployeeDraft => ({
  code: e.code, name: e.name, nationalId: e.nationalId, birthDate: e.birthDate,
  department: e.department, company: e.company, jobTitle: e.jobTitle, grade: e.grade,
  hiringDate: e.hiringDate, contractType: e.contractType || STANDARD_CONTRACT_TYPES[0],
  contractEndDate: e.contractEndDate, status: e.status, email: e.email,
  mobile: e.mobile, manager: e.manager,
});

const buildEmployeeRow = (d: EmployeeDraft) => ({
  employee_code: d.code.trim(),
  employee_name: d.name.trim(),
  national_id: d.nationalId.trim(),
  birth_date: d.birthDate || null,
  department: d.department.trim(),
  company: d.company.trim(),
  job_title: d.jobTitle.trim(),
  [GRADE_COLUMN]: d.grade.trim() || null,
  hiring_date: d.hiringDate || null,
  status: d.status || 'Active',
  email: d.email.trim(),
  mobile: d.mobile.trim(),
  manager: d.manager.trim(),
});

/** نهاية العقد: دائم = لا يوجد، محدد بدون تاريخ = سنة ناقص يوم من التعيين. */
const resolveContractEnd = (d: EmployeeDraft): string | null => {
  if (d.contractType === PERMANENT) return null;
  if (d.contractEndDate) return d.contractEndDate;
  if (d.contractType.includes('محدد') && d.hiringDate) return addYearMinusDay(d.hiringDate) || null;
  return null;
};

const buildContractRow = (d: EmployeeDraft) => ({
  employee_code: d.code.trim(),
  contract_type: d.contractType,
  contract_start_date: d.hiringDate || null,
  contract_end_date: resolveContractEnd(d),
  status: d.status || 'Active',
});

/* ================================================================== */
/*  الأنماط (CSS)                                                       */
/* ================================================================== */
const EMP_CSS = `
.emp-page {
  --ink: #14202b;
  --muted: #5b6b7a;
  --line: #e3e8ee;
  --bg: #f4f6f8;
  --surface: #ffffff;
  --brand: #0f766e;
  --brand-soft: #e6f4f1;
  --blue: #1d4ed8;
  --blue-soft: #e8effe;
  --green: #15803d;
  --green-soft: #e6f6ec;
  --amber: #b45309;
  --amber-soft: #fef3c7;
  --rose: #be123c;
  --rose-soft: #ffe9ed;
  --radius: 12px;

  direction: rtl;
  color: var(--ink);
  font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
  padding-bottom: 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ---------- الرأس ---------- */
.emp-header {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 18px 22px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.emp-title { margin: 0; font-size: 20px; font-weight: 800; }
.emp-subtitle { margin: 4px 0 0; font-size: 12.5px; color: var(--muted); }
.emp-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

/* ---------- الأزرار ---------- */
.emp-btn {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  padding: 8px 14px;
  border-radius: 8px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.emp-btn:hover:not(:disabled) { background: #f0f3f6; }
.emp-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.emp-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.emp-btnPrimary { background: var(--brand); border-color: var(--brand); color: #fff; }
.emp-btnPrimary:hover:not(:disabled) { background: #0b5f58; }
.emp-btnDanger { background: var(--rose); border-color: var(--rose); color: #fff; }
.emp-btnDanger:hover:not(:disabled) { background: #9f0f33; }
.emp-btnSuccess { background: var(--green); border-color: var(--green); color: #fff; }
.emp-btnSuccess:hover:not(:disabled) { background: #11652f; }
.emp-btnSm { padding: 4px 10px; font-size: 11.5px; }

/* ---------- كروت الإحصائيات ---------- */
.emp-kpiGrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
@media (min-width: 768px) { .emp-kpiGrid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 1280px) { .emp-kpiGrid { grid-template-columns: repeat(6, 1fr); } }

.emp-kpi {
  --accent: var(--brand);
  --accent-soft: var(--brand-soft);
  position: relative;
  text-align: right;
  font: inherit;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.emp-kpi::before {
  content: '';
  position: absolute;
  inset-block: 14px;
  inset-inline-start: 0;
  width: 3px;
  border-radius: 3px;
  background: var(--accent);
}
.emp-kpi:hover { border-color: var(--accent); }
.emp-kpi:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.emp-kpiActive { background: var(--accent-soft); border-color: var(--accent); }
.emp-kpiLabel { font-size: 12px; color: var(--muted); font-weight: 700; display: flex; justify-content: space-between; }
.emp-kpiValue { font-size: 26px; font-weight: 800; color: var(--accent); margin-top: 6px; line-height: 1.1; }
.emp-kpiHint { font-size: 11.5px; color: var(--muted); margin-top: 4px; }

/* ---------- شريط الإجراءات المجمعة ---------- */
.emp-bulkBar {
  background: var(--ink);
  color: #fff;
  padding: 10px 16px;
  border-radius: var(--radius);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.emp-bulkCount { font-size: 13px; font-weight: 700; }
.emp-bulkBar .emp-btn { background: transparent; border-color: #3a4a5a; color: #e8edf2; }
.emp-bulkBar .emp-btn:hover:not(:disabled) { background: #22313f; }
.emp-bulkBar .emp-btnDanger { background: var(--rose); border-color: var(--rose); color: #fff; }

/* ---------- الفلاتر ---------- */
.emp-toolbar {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px 16px;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.emp-input, .emp-select {
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font: inherit;
  font-size: 12.5px;
  color: var(--ink);
  background: #fff;
  min-width: 0;
}
.emp-input:focus, .emp-select:focus { outline: 2px solid var(--brand); outline-offset: 0; border-color: var(--brand); }
.emp-searchInput { min-width: 240px; }
.emp-shortInput { width: 150px; }
.emp-resultCount { margin-inline-start: auto; font-size: 12.5px; color: var(--muted); }
.emp-resultCount strong { color: var(--ink); font-size: 14px; }

/* ---------- الجدول ---------- */
.emp-tableCard {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}
.emp-tableScroll { max-height: 62vh; overflow: auto; }
.emp-table { width: 100%; border-collapse: collapse; text-align: right; font-size: 12.5px; white-space: nowrap; }
.emp-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f8fafb;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-weight: 700;
  padding: 11px 12px;
  user-select: none;
}
.emp-sortable { cursor: pointer; }
.emp-sortable:hover { color: var(--ink); }
.emp-sortArrow { color: var(--brand); margin-inline-start: 4px; }
.emp-sortIdle { opacity: 0.3; margin-inline-start: 4px; }
.emp-table td { padding: 10px 12px; border-bottom: 1px solid #f0f3f6; }
.emp-table tbody tr:hover { background: #fafbfc; }
.emp-rowInactive { background: #fff7f8; }
.emp-rowSelected { background: var(--brand-soft); }
.emp-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
.emp-code { font-weight: 800; color: var(--brand); }
.emp-codeInactive { color: var(--rose); }
.emp-nameCell { font-weight: 700; display: flex; align-items: center; gap: 6px; }
.emp-muted { color: var(--muted); }
.emp-cellActions { display: flex; gap: 6px; justify-content: center; }
.emp-empty { padding: 56px 20px; text-align: center; color: var(--muted); font-size: 13.5px; }

/* ---------- الشارات ---------- */
.emp-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid transparent;
}
.emp-badgeBlue { background: var(--blue-soft); color: var(--blue); border-color: #c7d7fb; }
.emp-badgeGreen { background: var(--green-soft); color: var(--green); border-color: #bde5c9; }
.emp-badgeAmber { background: var(--amber-soft); color: var(--amber); border-color: #f6dc8a; }
.emp-badgeRed { background: var(--rose-soft); color: var(--rose); border-color: #f8c2cd; }
.emp-badgeMedical { background: #15803d; color: #fff; border-color: #15803d; font-weight: 800; padding: 3px 10px; }
.emp-badgeGray { background: #f1f4f7; color: #334155; border-color: var(--line); }

/* ---------- النوافذ المنبثقة ---------- */
.emp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 32, 43, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}
.emp-modal {
  background: var(--surface);
  border-radius: 16px;
  width: 100%;
  max-height: 92vh;
  overflow-y: auto;
  padding: 22px 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
}
.emp-modalHead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--line);
  padding-bottom: 12px;
  margin-bottom: 16px;
}
.emp-modalTitle { margin: 0; font-size: 17px; font-weight: 800; }
.emp-modalFoot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.emp-form { display: flex; flex-direction: column; gap: 14px; }
.emp-notice { background: var(--brand-soft); color: #0b5f58; border-radius: 10px; padding: 12px; font-size: 12.5px; }
.emp-noticeDanger { background: var(--rose-soft); color: var(--rose); }

.emp-section {
  background: #f8fafb;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 14px;
}
.emp-sectionTitle { margin: 0 0 12px; font-size: 14px; font-weight: 800; color: var(--brand); }
.emp-formGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
@media (max-width: 720px) { .emp-formGrid { grid-template-columns: 1fr 1fr; } }
.emp-field label { display: block; font-size: 11.5px; font-weight: 700; color: var(--muted); margin-bottom: 5px; }
.emp-field .emp-input, .emp-field .emp-select { width: 100%; box-sizing: border-box; }
.emp-field .emp-input:disabled { background: #f1f4f7; color: var(--muted); }

.emp-profileGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12.5px; }
.emp-profileItem { background: #f8fafb; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
.emp-profileItem span { display: block; font-size: 11px; color: var(--muted); font-weight: 700; margin-bottom: 2px; }

.emp-suggest {
  position: absolute;
  top: 100%;
  inset-inline: 0;
  margin-top: 4px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 10px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 20;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}
.emp-suggestItem { display: block; width: 100%; text-align: right; background: none; border: 0; border-bottom: 1px solid #f0f3f6; padding: 10px 12px; font: inherit; font-size: 12.5px; cursor: pointer; }
.emp-suggestItem:hover { background: #f8fafb; }

/* ---------- التنبيهات ---------- */
.emp-toast {
  position: fixed;
  bottom: 24px;
  inset-inline-start: 24px;
  z-index: 10000;
  padding: 12px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  max-width: min(480px, calc(100vw - 48px));
}
.emp-toastOk { background: var(--green); color: #fff; }
.emp-toastError { background: var(--rose); color: #fff; }

@media (prefers-reduced-motion: reduce) {
  .emp-page * { transition: none !important; }
}

`;

/* ================================================================== */
/*  إعدادات العرض                                                       */
/* ================================================================== */

interface KpiConfig { key: CardKey; label: string; icon: string; accent: string; soft: string; hint: (pct: string) => string }

const KPI_CARDS: KpiConfig[] = [
  { key: 'ALL_ACTIVE', label: 'إجمالي الموظفين', icon: '👥', accent: '#0f766e', soft: '#e6f4f1', hint: () => 'القوة الفعالة' },
  { key: 'NEW_JOINERS', label: 'تعيينات العام', icon: '🌱', accent: '#15803d', soft: '#e6f6ec', hint: (p) => `${p}% من القوة` },
  { key: 'FIXED', label: 'عقود محددة المدة', icon: '📂', accent: '#1d4ed8', soft: '#e8effe', hint: (p) => `${p}% من القوة` },
  { key: 'PERM', label: 'عقود دائمة', icon: '🛡️', accent: '#0e7490', soft: '#e3f4f8', hint: (p) => `${p}% من القوة` },
  { key: 'ABOVE_AGE', label: `فوق السن (${ABOVE_AGE_THRESHOLD}+)`, icon: '💼', accent: '#b45309', soft: '#fef3c7', hint: (p) => `${p}% من القوة` },
  { key: 'MISSING_DATA', label: 'بيانات ناقصة', icon: '⚠️', accent: '#be123c', soft: '#ffe9ed', hint: () => 'اضغط للاستكمال' },
];

type SortKey = keyof Employee;

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const Dash = () => <span className={'emp-muted'}>—</span>;

const ContractEndBadge = ({ emp }: { emp: Employee }) => {
  if (emp.contractEndDate) {
    const days = Math.ceil((new Date(emp.contractEndDate).getTime() - Date.now()) / 86_400_000);
    if (days < 0) return <span className={cx('emp-badge', 'emp-badgeRed')}>{emp.contractEndDate} · منتهي</span>;
    if (days <= 60) return <span className={cx('emp-badge', 'emp-badgeAmber')}>{emp.contractEndDate} · خلال {days} يوم</span>;
    return <span className={cx('emp-badge', 'emp-badgeBlue')}>{emp.contractEndDate}</span>;
  }
  if (emp.contractType === PERMANENT) return <span className={cx('emp-badge', 'emp-badgeGreen')}>عقد دائم</span>;
  return <Dash />;
};

const AgeBadge = ({ age }: { age: number | null }) => {
  if (age === null) return <Dash />;
  return age >= ABOVE_AGE_THRESHOLD
    ? <span className={cx('emp-badge', 'emp-badgeAmber')}>{age} سنة (+{ABOVE_AGE_THRESHOLD})</span>
    : <span className={cx('emp-badge', 'emp-badgeGray')}>{age} سنة</span>;
};

interface Column { key: SortKey | null; label: string; render: (e: Employee) => ReactNode }

const COLUMNS: Column[] = [
  { key: 'code', label: 'الكود', render: (e) => <span className={cx('emp-mono', 'emp-code', e.isInactive && 'emp-codeInactive')}>{e.code}</span> },
  {
    key: 'name', label: 'الاسم',
    render: (e) => (
      <span className={'emp-nameCell'}>
        {e.name}
        {e.isMissingData && <span title="ناقص الرقم القومي أو الموبايل">⚠️</span>}
        {e.isInactive && <span className={cx('emp-badge', 'emp-badgeRed')}>{e.terminationReason || 'محول / موقوف'}</span>}
      </span>
    ),
  },
  { key: 'jobTitle', label: 'الوظيفة', render: (e) => e.jobTitle || <Dash /> },
  { key: 'department', label: 'الإدارة', render: (e) => e.department || <Dash /> },
  { key: 'grade', label: 'الدرجة', render: (e) => e.grade || <Dash /> },
  { key: 'medicalCategory', label: 'الفئة الطبية', render: (e) => e.medicalCategory ? <span className={cx('emp-badge', 'emp-badgeMedical')}>{e.medicalCategory}</span> : <Dash /> },
  { key: 'age', label: 'السن', render: (e) => <AgeBadge age={e.age} /> },
  { key: 'hiringDate', label: 'تاريخ التعيين', render: (e) => <span className={'emp-mono'}>{e.hiringDate || '—'}</span> },
  { key: 'contractType', label: 'نوع العقد', render: (e) => e.contractType || <Dash /> },
  { key: 'contractEndDate', label: 'نهاية العقد', render: (e) => <ContractEndBadge emp={e} /> },
];

/* ================================================================== */
/*  مكونات مساعدة صغيرة                                                  */
/* ================================================================== */

function Modal({ title, onClose, width = 560, children }: { title: string; onClose: () => void; width?: number; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={'emp-overlay'} role="dialog" aria-modal="true" aria-label={title}>
      <div className={'emp-modal'} style={{ maxWidth: width }}>
        <div className={'emp-modalHead'}>
          <h3 className={'emp-modalTitle'}>{title}</h3>
          <button type="button" className={'emp-btn'} onClick={onClose}>إغلاق</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={'emp-field'}>
      <label>{label}</label>
      {children}
    </div>
  );
}

/* ================================================================== */
/*  نافذة الإضافة / التعديل (نفس النموذج للاتنين)                           */
/* ================================================================== */

interface FormModalProps {
  mode: 'add' | 'edit';
  initial: EmployeeDraft;
  busy: boolean;
  grades: string[];
  onSubmit: (draft: EmployeeDraft) => void;
  onClose: () => void;
}

function EmployeeFormModal({ mode, initial, busy, grades, onSubmit, onClose }: FormModalProps) {
  const [d, setD] = useState<EmployeeDraft>(initial);
  const set = <K extends keyof EmployeeDraft>(key: K, value: EmployeeDraft[K]) => setD((p) => ({ ...p, [key]: value }));
  const isPerm = d.contractType === PERMANENT;

  const text = (key: keyof EmployeeDraft, label: string, opts: { required?: boolean; type?: string; disabled?: boolean; list?: string } = {}) => (
    <Field label={opts.required ? `${label} *` : label}>
      <input
        className={'emp-input'}
        type={opts.type ?? 'text'}
        required={opts.required}
        disabled={opts.disabled}
        list={opts.list}
        value={d[key]}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </Field>
  );

  const submit = (e: FormEvent) => { e.preventDefault(); onSubmit(d); };

  return (
    <Modal title={mode === 'add' ? 'إضافة موظف جديد' : 'تعديل بيانات الموظف'} onClose={onClose} width={820}>
      <form onSubmit={submit}>
        <div className={'emp-section'}>
          <h4 className={'emp-sectionTitle'}>البيانات الأساسية</h4>
          <div className={'emp-formGrid'}>
            {text('code', 'كود الموظف', { required: true, disabled: mode === 'edit' })}
            {text('name', 'الاسم', { required: true })}
            {text('nationalId', 'الرقم القومي')}
            {text('birthDate', 'تاريخ الميلاد', { type: 'date' })}
            {text('mobile', 'الموبايل')}
            {text('email', 'البريد الإلكتروني', { type: 'email' })}
            {text('department', 'الإدارة')}
            {text('company', 'الشركة')}
            {text('jobTitle', 'الوظيفة')}
            {text('grade', 'الدرجة', { list: 'gradeOptions' })}
            {text('manager', 'المدير المباشر')}
          </div>
          <datalist id="gradeOptions">{grades.map((g) => <option key={g} value={g} />)}</datalist>
        </div>

        <div className={'emp-section'}>
          <h4 className={'emp-sectionTitle'}>التعاقد</h4>
          <div className={'emp-formGrid'}>
            {text('hiringDate', 'تاريخ التعيين', { type: 'date' })}
            <Field label="نوع العقد">
              <select className={'emp-select'} value={d.contractType} onChange={(e) => set('contractType', e.target.value)}>
                {STANDARD_CONTRACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label={isPerm ? 'نهاية العقد (غير مطلوبة)' : 'نهاية العقد (تُحسب تلقائياً لو تُركت فارغة)'}>
              <input className={'emp-input'} type="date" disabled={isPerm} value={isPerm ? '' : d.contractEndDate} onChange={(e) => set('contractEndDate', e.target.value)} />
            </Field>
            {mode === 'edit' && (
              <Field label="حالة الموظف">
                <select className={'emp-select'} value={d.status} onChange={(e) => set('status', e.target.value)}>
                  <option value="Active">نشط (Active)</option>
                  <option value="Inactive">منتهي الخدمة (Inactive)</option>
                </select>
              </Field>
            )}
          </div>
        </div>

        <div className={'emp-modalFoot'}>
          <button type="button" className={'emp-btn'} onClick={onClose}>إلغاء</button>
          <button type="submit" className={cx('emp-btn', 'emp-btnPrimary')} disabled={busy}>
            {busy ? 'جاري الحفظ...' : mode === 'add' ? 'إضافة الموظف' : 'حفظ التعديلات'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ================================================================== */
/*  الصفحة                                                              */
/* ================================================================== */

type ModalState =
  | { type: 'add' }
  | { type: 'edit'; emp: Employee }
  | { type: 'profile'; emp: Employee }
  | { type: 'terminate' }
  | { type: 'reactivate'; emp: Employee }
  | { type: 'bulk' }
  | null;

export default function EmployeesPage() {
  const { employees: rawEmployees, loading, refresh } = useAppData();
  const employees = useMemo<Employee[]>(() => ((rawEmployees ?? []) as any[]).map((r) => normalizeEmployee(r)), [rawEmployees]);

  /* ---------- الحالة ---------- */
  const [activeCard, setActiveCard] = useState<CardKey | null>('ALL_ACTIVE');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [company, setCompany] = useState('');
  const [contractType, setContractType] = useState('');
  const [ageRange, setAgeRange] = useState<AgeRangeKey | ''>('');
  const [medical, setMedical] = useState('');

  const [sortKey, setSortKey] = useState<SortKey>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<string[]>([]);

  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const closeModal = useCallback(() => setModal(null), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  /** ينفذ عملية على قاعدة البيانات مع إدارة حالة التحميل والتنبيهات. يرجع true عند النجاح. */
  const run = useCallback(async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      const message = await action();
      setToast({ kind: 'ok', text: message });
      await refresh();
      return true;
    } catch (err: any) {
      setToast({ kind: 'error', text: err?.message ?? 'حدث خطأ غير متوقع' });
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  /* ---------- القوائم ---------- */
  const unique = (pick: (e: Employee) => string): string[] => Array.from(new Set<string>(employees.map(pick).filter(Boolean)));
  const departments = useMemo(() => unique((e) => e.department), [employees]);
  const companies = useMemo(() => unique((e) => e.company), [employees]);
  const grades = useMemo(() => unique((e) => e.grade), [employees]);
  const medicalCategories = useMemo(() => unique((e) => e.medicalCategory).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [employees]);

  /* ---------- الفلترة ---------- */
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (term && !(e.code.toLowerCase().includes(term) || e.name.toLowerCase().includes(term) || e.department.toLowerCase().includes(term))) return false;
      if (dept && !e.department.toLowerCase().includes(dept.toLowerCase())) return false;
      if (company && !e.company.toLowerCase().includes(company.toLowerCase())) return false;
      if (contractType && !e.contractType.includes(contractType)) return false;
      if (ageRange && !(e.age !== null && AGE_RANGES[ageRange].test(e.age))) return false;
      if (medical && e.medicalCategory !== medical) return false;
      return true;
    });
  }, [employees, search, dept, company, contractType, ageRange, medical]);

  const year = new Date().getFullYear();

  const kpi = useMemo(() => {
    const active = filtered.filter((e) => !e.isInactive);
    const total = active.length;
    const counts = {} as Record<CardKey, number>;
    (Object.keys(CARD_PREDICATES) as CardKey[]).forEach((k) => {
      counts[k] = k === 'ALL_ACTIVE' ? total : active.filter((e) => CARD_PREDICATES[k](e, year)).length;
    });
    const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : '0');
    return { counts, pct };
  }, [filtered, year]);

  const rows = useMemo(() => {
    const explicitSearch = search.trim() !== '' || dept.includes('تحويلات');
    const list = filtered.filter((e) => {
      if (e.isInactive && !explicitSearch) return false;
      return activeCard ? CARD_PREDICATES[activeCard](e, year) : true;
    });

    const sign = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (sortKey === 'age') return sign * (((va as number | null) ?? 0) - ((vb as number | null) ?? 0));
      return sign * String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [filtered, activeCard, sortKey, sortDir, search, dept, year]);

  /* ---------- الفرز والتحديد ---------- */
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((p) => (p === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const allSelected = rows.length > 0 && rows.every((e) => selected.includes(e.code));
  const toggleAll = (checked: boolean) => setSelected(checked ? rows.map((e) => e.code) : []);
  const toggleOne = (code: string, checked: boolean) =>
    setSelected((p) => (checked ? [...p, code] : p.filter((c) => c !== code)));

  const resetFilters = () => {
    setSearch(''); setDept(''); setCompany(''); setContractType(''); setAgeRange(''); setMedical(''); setActiveCard('ALL_ACTIVE');
  };

  /* ---------- العمليات على قاعدة البيانات ---------- */

  const addEmployee = (d: EmployeeDraft) =>
    run(async () => {
      const { error: empErr } = await supabase.from('employees').insert([buildEmployeeRow(d)]);
      if (empErr) throw new Error('تعذر إضافة الموظف: ' + empErr.message);

      const { error: conErr } = await supabase.from('contracts').insert([buildContractRow(d)]);
      if (conErr) {
        // نتراجع عن الموظف حتى ما يفضلش سجل بدون عقد
        await supabase.from('employees').delete().eq('employee_code', d.code.trim());
        throw new Error('تعذر إنشاء العقد، تم إلغاء الإضافة: ' + conErr.message);
      }
      return `تمت إضافة الموظف ${d.name} وعقده.`;
    }).then((ok) => ok && closeModal());

  const saveEmployee = (d: EmployeeDraft, contractId: string) =>
    run(async () => {
      const code = d.code.trim();
      const { error: empErr } = await supabase.from('employees').update(buildEmployeeRow(d)).eq('employee_code', code);
      if (empErr) throw new Error('تعذر تحديث بيانات الموظف: ' + empErr.message);

      const contractRow = buildContractRow(d);

      if (contractId) {
        const { error } = await supabase.from('contracts').update(contractRow).eq('contract_id', contractId);
        if (error) throw new Error('تعذر تحديث العقد: ' + error.message);
      } else {
        const { data: latest, error: fetchErr } = await supabase
          .from('contracts').select('contract_id').eq('employee_code', code)
          .order('contract_id', { ascending: false }).limit(1);
        if (fetchErr) throw new Error('تعذر جلب العقد: ' + fetchErr.message);

        const { error } = latest?.length
          ? await supabase.from('contracts').update(contractRow).eq('contract_id', latest[0].contract_id)
          : await supabase.from('contracts').insert([contractRow]);
        if (error) throw new Error('تعذر حفظ العقد: ' + error.message);
      }
      return 'تم حفظ التعديلات.';
    }).then((ok) => ok && closeModal());

  const terminateEmployee = (emp: Employee, reason: string, date: string) =>
    run(async () => {
      const { error: empErr } = await supabase.from('employees')
        .update({ department: TRANSFER_DEPARTMENT, status: 'Inactive', termination_reason: reason, termination_date: date })
        .eq('employee_code', emp.code);
      if (empErr) throw empErr;

      const { error: conErr } = await supabase.from('contracts')
        .update({ status: 'Inactive', contract_end_date: date, contract_type: reason })
        .eq('employee_code', emp.code);
      if (conErr) throw conErr;

      return `تم تحويل ${emp.name} (${reason}).`;
    }).then((ok) => ok && closeModal());

  const reactivateEmployee = (emp: Employee, newDept: string, newCompany: string) =>
    run(async () => {
      const { error } = await supabase.from('employees')
        .update({ department: newDept, company: newCompany || emp.company, status: 'Active', termination_reason: null, termination_date: null })
        .eq('employee_code', emp.code);
      if (error) throw error;

      const { error: conErr } = await supabase.from('contracts').update({ status: 'Active' }).eq('employee_code', emp.code);
      if (conErr) throw conErr;

      return `تمت إعادة تفعيل ${emp.name} في إدارة ${newDept}.`;
    }).then((ok) => ok && closeModal());

  const bulkTransfer = (newDept: string, newCompany: string) =>
    run(async () => {
      const payload: Record<string, string> = {};
      if (newDept) payload.department = newDept;
      if (newCompany) payload.company = newCompany;

      const { error } = await supabase.from('employees').update(payload).in('employee_code', selected);
      if (error) throw error;
      const count = selected.length;
      setSelected([]);
      return `تم نقل ${count} موظف.`;
    }).then((ok) => ok && closeModal());

  const deleteSelected = () => {
    if (!window.confirm(`حذف ${selected.length} موظف نهائياً مع عقودهم؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    run(async () => {
      const { error: conErr } = await supabase.from('contracts').delete().in('employee_code', selected);
      if (conErr) throw conErr;
      const { error } = await supabase.from('employees').delete().in('employee_code', selected);
      if (error) throw error;
      const count = selected.length;
      setSelected([]);
      return `تم حذف ${count} موظف.`;
    });
  };

  /** يحذف النسخ المكررة بالـ id فقط ويحتفظ بأفضل سجل لكل كود، بدون حذف وإعادة إدخال. */
  const cleanDuplicates = () => {
    if (window.prompt('سيتم حذف السجلات المكررة (نفس الكود) والإبقاء على الأكمل والأنشط.\nاكتب كلمة "تأكيد" للمتابعة:') !== 'تأكيد') return;

    run(async () => {
      const groups = new Map<string, Employee[]>();
      employees.forEach((e) => e.code && groups.set(e.code, [...(groups.get(e.code) ?? []), e]));

      const score = (e: Employee) =>
        (e.isInactive ? 0 : 100) + (e.nationalId ? 10 : 0) + (e.mobile ? 5 : 0) + (e.birthDate ? 2 : 0) + (e.grade ? 1 : 0);

      const toDelete: (string | number)[] = [];
      let missingId = false;
      groups.forEach((records) => {
        if (records.length < 2) return;
        [...records].sort((a, b) => score(b) - score(a)).slice(1).forEach((r) => {
          if (r.id === null) missingId = true; else toDelete.push(r.id);
        });
      });

      if (missingId) throw new Error('جدول employees لا يحتوي عمود id، لا يمكن تحديد السجل المكرر بأمان.');
      if (toDelete.length === 0) return 'لا توجد سجلات مكررة.';

      const { error } = await supabase.from('employees').delete().in('id', toDelete);
      if (error) throw error;
      return `تم حذف ${toDelete.length} سجل مكرر.`;
    });
  };

  /* ---------- التصدير ---------- */
  const exportToExcel = (onlySelected: boolean) => {
    const list = onlySelected ? rows.filter((e) => selected.includes(e.code)) : rows;
    const data = list.map((e) => ({
      'الكود': e.code,
      'الاسم': e.name,
      'الوظيفة': e.jobTitle,
      'الإدارة': e.department,
      'الدرجة': e.grade,
      'الفئة الطبية': e.medicalCategory,
      'السن': e.age ?? '',
      'الرقم القومي': e.nationalId,
      'الموبايل': e.mobile,
      'تاريخ التعيين': e.hiringDate,
      'نوع العقد': e.contractType,
      'نهاية العقد': e.contractEndDate,
      'الشركة': e.company,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'الموظفين');
    XLSX.writeFile(wb, `بيانات_الموظفين_${toISODate(new Date())}.xlsx`);
  };

  /* ---------- الواجهة ---------- */
  return (
    <div className={'emp-page'}>
      <style>{EMP_CSS}</style>
      <header className={'emp-header'}>
        <div>
          <h1 className={'emp-title'}>سجل الموظفين الفعالين</h1>
          <p className={'emp-subtitle'}>إدارة بيانات وعقود قوة العمل بالشركة والشركات الشقيقة</p>
        </div>
        <div className={'emp-actions'}>
          <button className={'emp-btn'} onClick={cleanDuplicates} disabled={busy}>تنظيف التكرارات</button>
          <button className={'emp-btn'} onClick={() => exportToExcel(false)}>تصدير Excel</button>
          <button className={cx('emp-btn', 'emp-btnDanger')} onClick={() => setModal({ type: 'terminate' })}>إنهاء خدمة</button>
          <button className={cx('emp-btn', 'emp-btnPrimary')} onClick={() => setModal({ type: 'add' })}>+ إضافة موظف</button>
        </div>
      </header>

      <section className={'emp-kpiGrid'} aria-label="إحصائيات سريعة">
        {KPI_CARDS.map((c) => {
          const count = kpi.counts[c.key];
          const isActive = activeCard === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={isActive}
              className={cx('emp-kpi', isActive && 'emp-kpiActive')}
              style={{ ['--accent' as string]: c.accent, ['--accent-soft' as string]: c.soft }}
              onClick={() => setActiveCard(isActive ? null : c.key)}
            >
              <div className={'emp-kpiLabel'}>
                <span>{c.key === 'NEW_JOINERS' ? `تعيينات ${year}` : c.label}</span>
                <span aria-hidden>{c.icon}</span>
              </div>
              <div className={'emp-kpiValue'}>{count.toLocaleString('en-US')}</div>
              <div className={'emp-kpiHint'}>{c.hint(kpi.pct(count))}</div>
            </button>
          );
        })}
      </section>

      {selected.length > 0 && (
        <div className={'emp-bulkBar'}>
          <span className={'emp-bulkCount'}>تم تحديد {selected.length} موظف</span>
          <div className={'emp-actions'}>
            <button className={'emp-btn'} onClick={() => setModal({ type: 'bulk' })}>نقل مجمع</button>
            <button className={'emp-btn'} onClick={() => exportToExcel(true)}>تصدير المحدد</button>
            <button className={cx('emp-btn', 'emp-btnDanger')} onClick={deleteSelected} disabled={busy}>حذف نهائي</button>
            <button className={'emp-btn'} onClick={() => setSelected([])}>إلغاء التحديد</button>
          </div>
        </div>
      )}

      <section className={'emp-toolbar'} aria-label="البحث والفلاتر">
        <input className={cx('emp-input', 'emp-searchInput')} placeholder="بحث بالاسم أو الكود أو الإدارة" value={search} onChange={(e) => setSearch(e.target.value)} />
        <input className={cx('emp-input', 'emp-shortInput')} list="deptFilter" placeholder="الإدارة" value={dept} onChange={(e) => setDept(e.target.value)} />
        <datalist id="deptFilter">{departments.map((d) => <option key={d} value={d} />)}</datalist>
        <input className={cx('emp-input', 'emp-shortInput')} list="companyFilter" placeholder="الشركة" value={company} onChange={(e) => setCompany(e.target.value)} />
        <datalist id="companyFilter">{companies.map((c) => <option key={c} value={c} />)}</datalist>

        <select className={'emp-select'} value={contractType} onChange={(e) => setContractType(e.target.value)}>
          <option value="">كل أنواع العقود</option>
          {STANDARD_CONTRACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={'emp-select'} value={ageRange} onChange={(e) => setAgeRange(e.target.value as AgeRangeKey | '')}>
          <option value="">كل الفئات العمرية</option>
          {(Object.keys(AGE_RANGES) as AgeRangeKey[]).map((k) => <option key={k} value={k}>{AGE_RANGES[k].label}</option>)}
        </select>
        <select className={'emp-select'} value={medical} onChange={(e) => setMedical(e.target.value)}>
          <option value="">كل الفئات الطبية</option>
          {medicalCategories.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <button className={'emp-btn'} onClick={resetFilters}>إعادة ضبط</button>
        <div className={'emp-resultCount'}>النتائج: <strong>{rows.length.toLocaleString('en-US')}</strong> موظف</div>
      </section>

      <section className={'emp-tableCard'}>
        {loading ? (
          <div className={'emp-empty'}>جاري تحميل بيانات الموظفين...</div>
        ) : rows.length === 0 ? (
          <div className={'emp-empty'}>لا توجد نتائج مطابقة. جرّب تغيير الفلاتر أو اضغط «إعادة ضبط».</div>
        ) : (
          <div className={'emp-tableScroll'}>
            <table className={'emp-table'}>
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input type="checkbox" aria-label="تحديد الكل" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} />
                  </th>
                  {COLUMNS.map((c) => (
                    <th key={c.label} className={'emp-sortable'} onClick={() => c.key && toggleSort(c.key)}>
                      {c.label}
                      {c.key && (sortKey === c.key
                        ? <span className={'emp-sortArrow'}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                        : <span className={'emp-sortIdle'}>↕</span>)}
                    </th>
                  ))}
                  <th style={{ textAlign: 'center' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id ?? e.code} className={cx(e.isInactive && 'emp-rowInactive', selected.includes(e.code) && 'emp-rowSelected')}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" aria-label={`تحديد ${e.name}`} checked={selected.includes(e.code)} onChange={(ev) => toggleOne(e.code, ev.target.checked)} />
                    </td>
                    {COLUMNS.map((c) => <td key={c.label}>{c.render(e)}</td>)}
                    <td>
                      <div className={'emp-cellActions'}>
                        <button className={cx('emp-btn', 'emp-btnSm')} onClick={() => setModal({ type: 'profile', emp: e })}>الملف</button>
                        <button className={cx('emp-btn', 'emp-btnSm')} onClick={() => setModal({ type: 'edit', emp: e })}>تعديل</button>
                        {e.isInactive && (
                          <button className={cx('emp-btn', 'emp-btnSm', 'emp-btnSuccess')} onClick={() => setModal({ type: 'reactivate', emp: e })}>إعادة تفعيل</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------------- النوافذ ---------------- */}
      {modal?.type === 'add' && (
        <EmployeeFormModal mode="add" initial={EMPTY_DRAFT} busy={busy} grades={grades} onClose={closeModal} onSubmit={addEmployee} />
      )}
      {modal?.type === 'edit' && (
        <EmployeeFormModal mode="edit" initial={toDraft(modal.emp)} busy={busy} grades={grades} onClose={closeModal} onSubmit={(d) => saveEmployee(d, modal.emp.contractId)} />
      )}
      {modal?.type === 'profile' && (
        <ProfileModal emp={modal.emp} onClose={closeModal} onEdit={() => setModal({ type: 'edit', emp: modal.emp })} />
      )}
      {modal?.type === 'terminate' && (
        <TerminateModal employees={employees} busy={busy} onClose={closeModal} onSubmit={terminateEmployee} />
      )}
      {modal?.type === 'reactivate' && (
        <ReactivateModal emp={modal.emp} departments={departments} companies={companies} busy={busy} onClose={closeModal} onSubmit={reactivateEmployee} />
      )}
      {modal?.type === 'bulk' && (
        <BulkTransferModal count={selected.length} departments={departments} companies={companies} busy={busy} onClose={closeModal} onSubmit={bulkTransfer} />
      )}

      {toast && <div role="status" className={cx('emp-toast', toast.kind === 'ok' ? 'emp-toastOk' : 'emp-toastError')}>{toast.text}</div>}
    </div>
  );
}

/* ================================================================== */
/*  باقي النوافذ                                                        */
/* ================================================================== */

function ProfileModal({ emp, onClose, onEdit }: { emp: Employee; onClose: () => void; onEdit: () => void }) {
  const items: [string, string][] = [
    ['الكود', emp.code],
    ['الاسم', emp.name],
    ['الرقم القومي', emp.nationalId || 'غير مسجل'],
    ['تاريخ الميلاد', emp.birthDate || 'غير مسجل'],
    ['السن', emp.age !== null ? `${emp.age} سنة` : 'غير مسجل'],
    ['الموبايل', emp.mobile || 'غير مسجل'],
    ['الإدارة', emp.department || '—'],
    ['الشركة', emp.company || '—'],
    ['الوظيفة', emp.jobTitle || '—'],
    ['الدرجة', emp.grade || 'غير مسجل'],
    ['الفئة الطبية', emp.medicalCategory || 'غير مسجل'],
    ['المدير المباشر', emp.manager || '—'],
    ['تاريخ التعيين', emp.hiringDate || '—'],
    ['نوع العقد', emp.contractType || '—'],
    ['نهاية العقد', emp.contractEndDate || '—'],
  ];
  return (
    <Modal title="الملف الوظيفي" onClose={onClose} width={640}>
      <div className={'emp-profileGrid'}>
        {items.map(([label, value]) => (
          <div key={label} className={'emp-profileItem'}><span>{label}</span>{value}</div>
        ))}
      </div>
      <div className={'emp-modalFoot'}>
        <button className={cx('emp-btn', 'emp-btnPrimary')} onClick={onEdit}>تعديل البيانات</button>
      </div>
    </Modal>
  );
}

function TerminateModal({ employees, busy, onClose, onSubmit }: {
  employees: Employee[]; busy: boolean; onClose: () => void;
  onSubmit: (emp: Employee, reason: string, date: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Employee | null>(null);
  const [reason, setReason] = useState<string>(TERMINATION_REASONS[2]);
  const [date, setDate] = useState(toISODate(new Date()));

  const results = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t || picked) return [];
    return employees
      .filter((e) => e.code.toLowerCase().includes(t) || e.name.toLowerCase().includes(t) || e.department.toLowerCase().includes(t))
      .slice(0, 8);
  }, [employees, query, picked]);

  const submit = (e: FormEvent) => { e.preventDefault(); if (picked) onSubmit(picked, reason, date); };

  return (
    <Modal title="إنهاء خدمة / تحويل للانتظار" onClose={onClose}>
      <form className={'emp-form'} onSubmit={submit}>
        <Field label="ابحث عن الموظف">
          <div style={{ position: 'relative' }}>
            <input className={'emp-input'} placeholder="الكود أو الاسم أو الإدارة" value={query} onChange={(e) => { setQuery(e.target.value); setPicked(null); }} />
            {results.length > 0 && (
              <div className={'emp-suggest'}>
                {results.map((e) => (
                  <button type="button" key={e.code} className={'emp-suggestItem'} onClick={() => { setPicked(e); setQuery(`${e.code} - ${e.name}`); }}>
                    <strong>[{e.code}]</strong> {e.name} <span className={'emp-muted'}>({e.department || 'بدون إدارة'})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>

        {picked && <div className={cx('emp-notice', 'emp-noticeDanger')}>الموظف المحدد: <strong>{picked.name}</strong> (كود {picked.code})</div>}

        <Field label="السبب">
          <select className={'emp-select'} value={reason} onChange={(e) => setReason(e.target.value)}>
            {TERMINATION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="تاريخ الإجراء">
          <input className={'emp-input'} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <div className={'emp-modalFoot'}>
          <button type="button" className={'emp-btn'} onClick={onClose}>إلغاء</button>
          <button type="submit" className={cx('emp-btn', 'emp-btnDanger')} disabled={busy || !picked}>
            {busy ? 'جاري الحفظ...' : 'تأكيد التحويل'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReactivateModal({ emp, departments, companies, busy, onClose, onSubmit }: {
  emp: Employee; departments: string[]; companies: string[]; busy: boolean; onClose: () => void;
  onSubmit: (emp: Employee, dept: string, company: string) => void;
}) {
  const [dept, setDept] = useState('');
  const [company, setCompany] = useState(emp.company);
  const submit = (e: FormEvent) => { e.preventDefault(); onSubmit(emp, dept.trim(), company.trim()); };

  return (
    <Modal title="إعادة تفعيل الموظف" onClose={onClose}>
      <form className={'emp-form'} onSubmit={submit}>
        <div className={'emp-notice'}>سيعود <strong>{emp.name}</strong> (كود {emp.code}) إلى القوة الفعالة.</div>
        <Field label="الإدارة التي سيعود إليها *">
          <input className={'emp-input'} required list="reactDepts" placeholder="اختر أو اكتب اسم الإدارة" value={dept} onChange={(e) => setDept(e.target.value)} />
          <datalist id="reactDepts">{departments.filter((d) => !d.includes('تحويلات')).map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
        <Field label="الشركة">
          <input className={'emp-input'} list="reactCompanies" value={company} onChange={(e) => setCompany(e.target.value)} />
          <datalist id="reactCompanies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <div className={'emp-modalFoot'}>
          <button type="button" className={'emp-btn'} onClick={onClose}>إلغاء</button>
          <button type="submit" className={cx('emp-btn', 'emp-btnSuccess')} disabled={busy}>{busy ? 'جاري التحديث...' : 'تأكيد إعادة التفعيل'}</button>
        </div>
      </form>
    </Modal>
  );
}

function BulkTransferModal({ count, departments, companies, busy, onClose, onSubmit }: {
  count: number; departments: string[]; companies: string[]; busy: boolean; onClose: () => void;
  onSubmit: (dept: string, company: string) => void;
}) {
  const [dept, setDept] = useState('');
  const [company, setCompany] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); onSubmit(dept.trim(), company.trim()); };

  return (
    <Modal title="النقل المجمع" onClose={onClose}>
      <form className={'emp-form'} onSubmit={submit}>
        <div className={'emp-notice'}>سيتم تطبيق التغيير على <strong>{count}</strong> موظف. اترك أي حقل فارغاً لو لا تريد تغييره.</div>
        <Field label="الإدارة الجديدة">
          <input className={'emp-input'} list="bulkDepts" value={dept} onChange={(e) => setDept(e.target.value)} />
          <datalist id="bulkDepts">{departments.map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
        <Field label="الشركة الجديدة">
          <input className={'emp-input'} list="bulkCompanies" value={company} onChange={(e) => setCompany(e.target.value)} />
          <datalist id="bulkCompanies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <div className={'emp-modalFoot'}>
          <button type="button" className={'emp-btn'} onClick={onClose}>إلغاء</button>
          <button type="submit" className={cx('emp-btn', 'emp-btnPrimary')} disabled={busy || (!dept.trim() && !company.trim())}>
            {busy ? 'جاري التحديث...' : 'تأكيد النقل'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
