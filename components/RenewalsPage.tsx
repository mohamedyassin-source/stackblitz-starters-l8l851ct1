'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';

/* ================================================================== */
/*  الثوابت والأنواع                                                    */
/* ================================================================== */

const RETIREMENT_AGE = 60;
const DEFAULT_MONTHS = 12;
const MONTH_OPTIONS = [
  { value: 1, label: 'شهر واحد' },
  { value: 2, label: 'شهران' },
  { value: 3, label: '3 شهور (ربع سنوي)' },
  { value: 6, label: '6 شهور (نصف سنوي)' },
  { value: 9, label: '9 شهور' },
  { value: 12, label: '12 شهر (سنة كاملة)' },
  { value: 24, label: '24 شهر (سنتين)' },
];

type Stage = 'project' | 'general';

/** كل مرحلة اعتماد: الحالات اللي تدخل منها، والحالة اللي تروح لها، وحالة التوقيع. */
const STAGES: Record<Stage, { from: string[]; to: string; signature: string; label: string }> = {
  project: { from: ['Pending_Project_Manager', 'Pending'], to: 'Pending_General_Manager', signature: 'قيد التوقيع', label: 'اعتماد المشروع' },
  general: { from: ['Pending_General_Manager'], to: 'Approved', signature: 'في انتظار توقيع الموظف', label: 'اعتماد الإدارة' },
};
const PENDING_STATUSES = [...STAGES.project.from, ...STAGES.general.from];
const stageOfStatus = (status: string): Stage => (STAGES.general.from.includes(status) ? 'general' : 'project');

type TabKey = 'project' | 'general' | 'approved' | 'rejected' | 'all';

interface TabConfig {
  key: TabKey; label: string; icon: string; accent: string; soft: string; hint: string;
  match: (status: string) => boolean;
}

const TABS: TabConfig[] = [
  { key: 'project', label: 'اعتماد المشروع', icon: '⏳', accent: '#1d4ed8', soft: '#e8effe', hint: 'المرحلة الأولى', match: (s) => STAGES.project.from.includes(s) },
  { key: 'general', label: 'اعتماد الإدارة', icon: '🛡️', accent: '#6d28d9', soft: '#f1eafe', hint: 'الاعتماد النهائي', match: (s) => STAGES.general.from.includes(s) },
  { key: 'approved', label: 'الطلبات المعتمدة', icon: '✅', accent: '#15803d', soft: '#e6f6ec', hint: 'جاهزة للتوقيع', match: (s) => s === 'Approved' },
  { key: 'rejected', label: 'مرفوضة', icon: '❌', accent: '#be123c', soft: '#ffe9ed', hint: 'محفوظة للأرشيف', match: (s) => s === 'Rejected' },
  { key: 'all', label: 'كل الطلبات', icon: '📋', accent: '#475569', soft: '#eef1f5', hint: 'قاعدة البيانات', match: () => true },
];

interface RenewalRequest {
  request_id: string;
  employee_code: string;
  employee_name: string;
  department?: string | null;
  company?: string | null;
  job_title: string;
  contract_type: string;
  contract_end_date?: string | null;
  renewal_months?: number | null;
  new_contract_end_date?: string | null;
  status: string;
  signature_status?: string | null;
  birthDate: string | null;
  national_id: string | null;
}

/* ================================================================== */
/*  دوال التواريخ (كلها بصيغة YYYY-MM-DD بدون مشاكل توقيت)                    */
/* ================================================================== */

const pad = (n: number) => String(n).padStart(2, '0');
const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseYMD = (s?: string | null): Date | null => {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
};

/** بداية العقد الجديد = اليوم التالي لنهاية العقد القديم (أو اليوم لو مفيش). */
const calcNewStart = (oldEnd?: string | null): string => {
  const d = parseYMD(oldEnd);
  if (!d) return toYMD(new Date());
  d.setDate(d.getDate() + 1);
  return toYMD(d);
};

/** نهاية العقد الجديد = بداية + مدة - يوم. بتتعامل صح مع آخر الشهر (31 يناير + شهر = 27 فبراير). */
const calcNewEnd = (start: string | null | undefined, months: number): string => {
  const d = parseYMD(start);
  if (!d) return '';
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, daysInMonth));
  d.setDate(d.getDate() - 1);
  return toYMD(d);
};

const daysRemaining = (end?: string | null): number | null => {
  const d = parseYMD(end);
  if (!d) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
};

/** تاريخ الميلاد من العمود، ولو مفيش يتحسب من الرقم القومي (14 رقم). */
const resolveBirthDate = (birth?: string | null, nationalId?: string | null): string | null => {
  if (birth && parseYMD(birth)) return String(birth).slice(0, 10);
  const id = String(nationalId ?? '').replace(/\D/g, '');
  if (id.length === 14 && (id[0] === '2' || id[0] === '3')) {
    const ymd = `${id[0] === '3' ? '20' : '19'}${id.slice(1, 3)}-${id.slice(3, 5)}-${id.slice(5, 7)}`;
    if (parseYMD(ymd)) return ymd;
  }
  return null;
};

const ageFrom = (birth: string | null): number | null => {
  const b = parseYMD(birth);
  if (!b) return null;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age;
};

const retirementDate = (birth: string | null): string | null => {
  const b = parseYMD(birth);
  return b ? `${b.getFullYear() + RETIREMENT_AGE}-${pad(b.getMonth() + 1)}-${pad(b.getDate())}` : null;
};

/** يرجّع تاريخ التقاعد لو العقد الجديد هيعدّيه (ومفيش استثناء "فوق السن")، وإلا null. */
const retirementConflict = (req: RenewalRequest, newEnd: string): string | null => {
  if (String(req.contract_type || '').includes('فوق السن')) return null;
  const age = ageFrom(req.birthDate);
  if (age !== null && age >= RETIREMENT_AGE) return null;
  const ret = retirementDate(req.birthDate);
  return ret && newEnd > ret ? ret : null;
};

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const normCode = (c: unknown) => String(c ?? '').trim().replace(/^0+/, '');

/* ================================================================== */
/*  الأنماط                                                             */
/* ================================================================== */

const REN_CSS = `
.ren-page {
  --ink: #14202b; --muted: #5b6b7a; --line: #e3e8ee; --surface: #ffffff;
  --brand: #4338ca; --green: #15803d; --rose: #be123c; --amber: #b45309; --radius: 12px;
  direction: rtl; color: var(--ink);
  font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
  padding-bottom: 40px; display: flex; flex-direction: column; gap: 16px;
}
.ren-header { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.ren-title { margin: 0; font-size: 20px; font-weight: 800; }
.ren-subtitle { margin: 4px 0 0; font-size: 12.5px; color: var(--muted); }
.ren-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

.ren-btn { border: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 8px 14px; border-radius: 8px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: background .15s; }
.ren-btn:hover:not(:disabled) { background: #f0f3f6; }
.ren-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.ren-btn:disabled { opacity: .5; cursor: not-allowed; }
.ren-btnPrimary { background: var(--brand); border-color: var(--brand); color: #fff; }
.ren-btnPrimary:hover:not(:disabled) { background: #3730a3; }
.ren-btnSuccess { background: var(--green); border-color: var(--green); color: #fff; }
.ren-btnSuccess:hover:not(:disabled) { background: #11652f; }
.ren-btnDanger { background: var(--rose); border-color: var(--rose); color: #fff; }
.ren-btnDanger:hover:not(:disabled) { background: #9f0f33; }
.ren-btnDangerSoft { color: var(--rose); border-color: #f8c2cd; background: #fff5f7; }
.ren-btnSm { padding: 4px 10px; font-size: 11.5px; }

.ren-tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.ren-tab { --accent: var(--brand); --accent-soft: #eef2ff; position: relative; text-align: right; font: inherit; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; cursor: pointer; transition: border-color .15s, background .15s; }
.ren-tab::before { content: ''; position: absolute; inset-block: 14px; inset-inline-start: 0; width: 3px; border-radius: 3px; background: var(--accent); }
.ren-tab:hover { border-color: var(--accent); }
.ren-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ren-tabActive { background: var(--accent-soft); border-color: var(--accent); }
.ren-tabLabel { font-size: 12.5px; color: var(--muted); font-weight: 700; display: flex; justify-content: space-between; }
.ren-tabValue { font-size: 26px; font-weight: 800; color: var(--accent); margin-top: 6px; line-height: 1.1; }
.ren-tabHint { font-size: 11.5px; color: var(--muted); margin-top: 4px; }

.ren-toolbar { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.ren-input, .ren-select { padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; font: inherit; font-size: 12.5px; color: var(--ink); background: #fff; min-width: 0; }
.ren-input:focus, .ren-select:focus { outline: 2px solid var(--brand); border-color: var(--brand); }
.ren-search { min-width: 250px; }
.ren-short { width: 150px; }
.ren-monthBox { display: flex; align-items: center; gap: 6px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 3px 10px; font-size: 12px; font-weight: 700; color: #3730a3; }
.ren-monthBox input { border: 0; background: transparent; font: inherit; color: inherit; outline: none; }
.ren-count { margin-inline-start: auto; font-size: 12.5px; color: var(--muted); }
.ren-count strong { color: var(--ink); font-size: 14px; }

.ren-tableCard { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.ren-tableScroll { max-height: 62vh; overflow: auto; }
.ren-table { width: 100%; border-collapse: collapse; text-align: right; font-size: 12.5px; white-space: nowrap; }
.ren-table thead th { position: sticky; top: 0; z-index: 2; background: #f8fafb; border-bottom: 1px solid var(--line); color: var(--muted); font-weight: 700; padding: 11px 12px; user-select: none; }
.ren-sortable { cursor: pointer; }
.ren-sortable:hover { color: var(--ink); }
.ren-sortArrow { color: var(--brand); margin-inline-start: 4px; }
.ren-sortIdle { opacity: .3; margin-inline-start: 4px; }
.ren-table td { padding: 10px 12px; border-bottom: 1px solid #f0f3f6; }
.ren-table tbody tr:hover { background: #fafbfc; }
.ren-rowSelected { background: #eef2ff !important; }
.ren-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
.ren-code { font-weight: 800; color: var(--brand); }
.ren-muted { color: var(--muted); }
.ren-center { text-align: center; }
.ren-cellActions { display: flex; gap: 6px; justify-content: center; align-items: center; }
.ren-empty { padding: 56px 20px; text-align: center; color: var(--muted); font-size: 13.5px; }

.ren-badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; border: 1px solid transparent; }
.ren-badgeBlue { background: #e8effe; color: #1d4ed8; border-color: #c7d7fb; }
.ren-badgeViolet { background: #f1eafe; color: #6d28d9; border-color: #ddd0fb; }
.ren-badgeGreen { background: #e6f6ec; color: #15803d; border-color: #bde5c9; }
.ren-badgeAmber { background: #fef3c7; color: #b45309; border-color: #f6dc8a; }
.ren-badgeRed { background: #ffe9ed; color: #be123c; border-color: #f8c2cd; }

.ren-overlay { position: fixed; inset: 0; background: rgba(20,32,43,.55); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; }
.ren-modal { background: #fff; border-radius: 16px; width: 100%; max-width: 500px; max-height: 92vh; overflow-y: auto; padding: 22px 24px; box-shadow: 0 24px 60px rgba(0,0,0,.28); }
.ren-modalHead { display: flex; justify-content: space-between; align-items: center; gap: 10px; border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 16px; }
.ren-modalTitle { margin: 0; font-size: 16.5px; font-weight: 800; color: var(--green); }
.ren-modalFoot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.ren-box { background: #f8fafb; border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; }
.ren-line { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 700; }
.ren-field label { display: block; font-size: 11.5px; font-weight: 700; color: var(--muted); margin-bottom: 5px; }
.ren-field .ren-input, .ren-field .ren-select { width: 100%; box-sizing: border-box; }
.ren-notice { border-radius: 10px; padding: 10px 12px; font-size: 12.5px; line-height: 1.7; white-space: pre-line; }
.ren-noticeWarn { background: #fef3c7; color: #92400e; }
.ren-noticeError { background: #ffe9ed; color: #9f1239; }
.ren-noticeInfo { background: #eef2ff; color: #3730a3; }

.ren-toast { position: fixed; bottom: 24px; inset-inline-start: 24px; z-index: 10000; padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 700; box-shadow: 0 10px 30px rgba(0,0,0,.2); max-width: min(480px, calc(100vw - 48px)); white-space: pre-line; color: #fff; }
.ren-toastOk { background: var(--green); }
.ren-toastError { background: var(--rose); }

@media (prefers-reduced-motion: reduce) { .ren-page * { transition: none !important; } }
`;

/* ================================================================== */
/*  مكونات صغيرة                                                        */
/* ================================================================== */

const Dash = () => <span className="ren-muted">—</span>;

const StatusBadge = ({ status }: { status: string }) => {
  if (status === 'Approved') return <span className="ren-badge ren-badgeGreen">معتمد نهائياً</span>;
  if (STAGES.project.from.includes(status)) return <span className="ren-badge ren-badgeBlue">عند المشروع</span>;
  if (STAGES.general.from.includes(status)) return <span className="ren-badge ren-badgeViolet">عند الإدارة</span>;
  if (status === 'Rejected') return <span className="ren-badge ren-badgeRed">مرفوض</span>;
  return <span className="ren-badge">{status}</span>;
};

const DaysBadge = ({ days }: { days: number | null }) => {
  if (days === null) return <Dash />;
  if (days < 0) return <span className="ren-badge ren-badgeRed">منتهي منذ {Math.abs(days)} يوم</span>;
  if (days <= 60) return <span className="ren-badge ren-badgeAmber">{days} يوم</span>;
  return <span className="ren-badge ren-badgeBlue">{days} يوم</span>;
};

/* ================================================================== */
/*  نافذة الاعتماد                                                      */
/* ================================================================== */

interface ApprovalModalProps {
  stage: Stage;
  req?: RenewalRequest;       // فردي
  bulkCount?: number;         // مجمع
  busy: boolean;
  error: string | null;
  onConfirm: (months: number, start: string, end: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}

function ApprovalModal({ stage, req, bulkCount, busy, error, onConfirm, onDelete, onClose }: ApprovalModalProps) {
  const [months, setMonths] = useState<number>(req?.renewal_months || DEFAULT_MONTHS);
  const [start, setStart] = useState(() => (req ? calcNewStart(req.contract_end_date) : ''));
  const [end, setEnd] = useState(() => (req ? calcNewEnd(calcNewStart(req.contract_end_date), req.renewal_months || DEFAULT_MONTHS) : ''));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const changeMonths = (m: number) => { setMonths(m); if (req) setEnd(calcNewEnd(start, m)); };
  const changeStart = (s: string) => { setStart(s); setEnd(calcNewEnd(s, months)); };

  const ret = req ? retirementDate(req.birthDate) : null;
  const conflict = req && end ? retirementConflict(req, end) : null;

  return (
    <div className="ren-overlay" role="dialog" aria-modal="true">
      <div className="ren-modal">
        <div className="ren-modalHead">
          <h3 className="ren-modalTitle">
            {req ? `${STAGES[stage].label}: ${req.employee_name}` : `${STAGES[stage].label} المجمع (${bulkCount} طلب)`}
          </h3>
          {onDelete && <button type="button" className="ren-btn ren-btnSm ren-btnDangerSoft" onClick={onDelete}>حذف الطلب</button>}
        </div>

        <div className="ren-box">
          <div className="ren-notice ren-noticeInfo">
            {stage === 'project'
              ? 'موافقة مبدئية، وسيتم تمرير الطلب للإدارة العامة.'
              : 'اعتماد نهائي، وسيتم تجهيز العقد وإرساله للتوقيع. لن تتحدث تواريخ العقد إلا بعد توقيع الموظف.'}
          </div>

          {req && (
            <>
              <div className="ren-line"><span className="ren-muted">نهاية العقد الحالي</span><span className="ren-mono">{req.contract_end_date || 'غير مسجل'}</span></div>
              {ret
                ? <div className="ren-line" style={{ color: '#b45309' }}><span>تاريخ بلوغ سن {RETIREMENT_AGE}</span><span className="ren-mono">{ret}</span></div>
                : <div className="ren-notice ren-noticeWarn">لا يوجد تاريخ ميلاد ولا رقم قومي صالح لهذا الموظف، فلا يمكن فحص سن التقاعد. راجع بياناته.</div>}
              <div className="ren-field">
                <label>بداية العقد الجديد</label>
                <input className="ren-input ren-mono" type="date" value={start} onChange={(e) => changeStart(e.target.value)} />
              </div>
              <div className="ren-field">
                <label>نهاية العقد الجديد</label>
                <input className="ren-input ren-mono" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              {conflict && (
                <div className="ren-notice ren-noticeWarn">
                  العقد ينتهي بعد بلوغ السن في {conflict}. عدّل تاريخ النهاية أو حوّل نوع العقد إلى «فوق السن».
                </div>
              )}
            </>
          )}
        </div>

        <div className="ren-field">
          <label>المدة المعتمدة للتجديد</label>
          <select className="ren-select" value={months} onChange={(e) => changeMonths(Number(e.target.value))}>
            {MONTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {error && <div className="ren-notice ren-noticeError" style={{ marginTop: 14 }}>{error}</div>}

        <div className="ren-modalFoot">
          <button type="button" className="ren-btn" onClick={onClose}>إلغاء</button>
          <button type="button" className="ren-btn ren-btnSuccess" disabled={busy} onClick={() => onConfirm(months, start, end)}>
            {busy ? 'جاري الاعتماد...' : 'تأكيد الاعتماد'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  الصفحة                                                              */
/* ================================================================== */

type SortKey = 'request_id' | 'employee_code' | 'employee_name' | 'department' | 'job_title' | 'contract_end_date' | 'days_left' | 'renewal_months' | 'status';

const COLUMNS: { key: SortKey; label: string; center?: boolean; render: (r: RenewalRequest) => ReactNode }[] = [
  { key: 'request_id', label: 'رقم الطلب', render: (r) => <span className="ren-mono ren-muted">{r.request_id}</span> },
  { key: 'employee_code', label: 'الكود', render: (r) => <span className="ren-mono ren-code">{r.employee_code}</span> },
  { key: 'employee_name', label: 'الموظف', render: (r) => <strong>{r.employee_name}</strong> },
  { key: 'department', label: 'الإدارة', render: (r) => r.department || <Dash /> },
  { key: 'job_title', label: 'الوظيفة', render: (r) => r.job_title || <Dash /> },
  { key: 'contract_end_date', label: 'انتهاء العقد', render: (r) => <span className="ren-mono">{r.contract_end_date || '—'}</span> },
  { key: 'days_left', label: 'المتبقي', render: (r) => <DaysBadge days={daysRemaining(r.contract_end_date)} /> },
  { key: 'renewal_months', label: 'مدة التجديد', center: true, render: (r) => `${r.renewal_months || DEFAULT_MONTHS} شهر` },
  { key: 'status', label: 'الاعتماد', center: true, render: (r) => <StatusBadge status={r.status} /> },
];

export default function RenewalsPage() {
  const { refresh: refreshGlobalData } = useAppData();

  const [requests, setRequests] = useState<RenewalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [tab, setTab] = useState<TabKey>('project');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [company, setCompany] = useState('');
  const [month, setMonth] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('days_left');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [modal, setModal] = useState<{ type: 'single'; req: RenewalRequest } | { type: 'bulk' } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const closeModal = useCallback(() => { setModal(null); setModalError(null); }, []);
  const notify = (kind: 'ok' | 'error', text: string) => setToast({ kind, text });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ---------- جلب البيانات ---------- */
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, empRes] = await Promise.all([
        supabase.from('renewal_requests').select('*'),
        supabase.from('employees').select('*'),
      ]);
      if (reqRes.error) throw reqRes.error;
      if (empRes.error) throw empRes.error;

      const empByCode = new Map<string, any>();
      (empRes.data ?? []).forEach((e: any) => empByCode.set(normCode(e.employee_code), e));

      setRequests(
        (reqRes.data ?? []).map((req: any): RenewalRequest => {
          const emp = empByCode.get(normCode(req.employee_code));
          return {
            ...req,
            job_title: req.job_title || emp?.job_title || '',
            contract_type: req.contract_type || emp?.contract_type || '',
            national_id: emp?.national_id ?? null,
            birthDate: resolveBirthDate(emp?.birth_date, emp?.national_id),
          };
        }),
      );
    } catch (err: any) {
      notify('error', 'تعذر تحميل الطلبات: ' + (err?.message ?? ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);
  useEffect(() => { setSelectedIds([]); }, [tab]);

  const reload = async () => { await Promise.all([refreshGlobalData(), fetchRequests()]); };

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      notify('ok', await action());
      await reload();
      return true;
    } catch (err: any) {
      notify('error', err?.message ?? 'حدث خطأ غير متوقع');
      return false;
    } finally {
      setBusy(false);
    }
  };

  /* ---------- الفلترة والترتيب ---------- */
  const departments = useMemo(() => Array.from(new Set<string>(requests.map((r) => r.department ?? '').filter(Boolean))), [requests]);
  const companies = useMemo(() => Array.from(new Set<string>(requests.map((r) => r.company ?? '').filter(Boolean))), [requests]);

  const globalFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (term && ![r.employee_code, r.employee_name, r.request_id, r.job_title].some((v) => String(v ?? '').toLowerCase().includes(term))) return false;
      if (dept && r.department !== dept) return false;
      if (company && r.company !== company) return false;
      if (month && !calcNewStart(r.contract_end_date).startsWith(month)) return false;
      return true;
    });
  }, [requests, search, dept, company, month]);

  const counts = useMemo(() => {
    const c = {} as Record<TabKey, number>;
    TABS.forEach((t) => { c[t.key] = globalFiltered.filter((r) => t.match(r.status)).length; });
    return c;
  }, [globalFiltered]);

  const rows = useMemo(() => {
    const activeTab = TABS.find((t) => t.key === tab)!;
    const list = globalFiltered.filter((r) => activeTab.match(r.status));
    const sign = sortDir === 'asc' ? 1 : -1;

    const value = (r: RenewalRequest): number | string | null => {
      if (sortKey === 'days_left') return daysRemaining(r.contract_end_date);
      if (sortKey === 'renewal_months') return Number(r.renewal_months || DEFAULT_MONTHS);
      return String((r as any)[sortKey] ?? '');
    };

    return [...list].sort((a, b) => {
      const va = value(a); const vb = value(b);
      if (va === null) return 1;      // الفاضي دايماً في الآخر
      if (vb === null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
      return sign * String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [globalFiltered, tab, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  /* ---------- التحديد (يشمل المعروض فقط) ---------- */
  const isPendingTab = tab === 'project' || tab === 'general';
  const canSelect = isPendingTab || tab === 'approved';
  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.includes(r.request_id)), [rows, selectedIds]);
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  const toggleAll = (checked: boolean) => setSelectedIds(checked ? rows.map((r) => r.request_id) : []);
  const toggleOne = (id: string, checked: boolean) => setSelectedIds((p) => (checked ? [...p, id] : p.filter((x) => x !== id)));

  /* ---------- العمليات ---------- */

  /** اعتماد طلب أو أكثر. كل تحديث مشروط بالحالة الحالية لمنع الاعتماد المزدوج. */
  const approve = async (stage: Stage, targets: RenewalRequest[], months: number, custom?: { start: string; end: string }) => {
    setModalError(null);
    const plan = targets.map((req) => {
      const start = custom?.start || calcNewStart(req.contract_end_date);
      const end = custom?.end || calcNewEnd(start, months);
      return { req, start, end };
    });

    // 1) تحقق من التواريخ
    if (plan.some((p) => !p.start || !p.end)) return setModalError('يرجى التأكد من تواريخ البداية والنهاية.');
    if (plan.some((p) => p.end <= p.start)) return setModalError('تاريخ النهاية لازم يكون بعد تاريخ البداية.');

    // 2) تحقق من سن التقاعد
    const conflicts = plan
      .map((p) => ({ name: p.req.employee_name, ret: retirementConflict(p.req, p.end) }))
      .filter((c) => c.ret);
    if (conflicts.length > 0) {
      return setModalError(
        `سيتجاوز موظفون سن ${RETIREMENT_AGE} خلال فترة التجديد:\n` +
        conflicts.map((c) => `• ${c.name} (يبلغ السن في ${c.ret})`).join('\n') +
        '\nألغِ تحديدهم واعتمدهم فردياً بتاريخ مخصص، أو حوّل عقدهم إلى «فوق السن».',
      );
    }

    // 3) التنفيذ
    const cfg = STAGES[stage];
    setBusy(true);
    const results = await Promise.allSettled(
      plan.map(async (p) => {
        const { data, error } = await supabase
          .from('renewal_requests')
          .update({ status: cfg.to, signature_status: cfg.signature, renewal_months: months, new_contract_end_date: p.end })
          .eq('request_id', p.req.request_id)
          .in('status', cfg.from)
          .select('request_id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error(`تغيّرت حالة الطلب ${p.req.request_id} قبل الاعتماد`);
      }),
    );

    setBusy(false);
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    const okCount = results.length - failed.length;

    if (okCount > 0) {
      setSelectedIds([]);
      await reload();
    }
    if (failed.length === 0) {
      closeModal();
      notify('ok', stage === 'project' ? `تم اعتماد ${okCount} طلب وتمريره للإدارة العامة.` : `تم الاعتماد النهائي لـ ${okCount} طلب، وهو الآن في صفحة التوقيعات.`);
    } else {
      setModalError(`نجح ${okCount} وفشل ${failed.length}:\n` + failed.map((f) => '• ' + (f.reason?.message ?? 'خطأ')).join('\n'));
    }
  };

  const rejectRequest = async (req: RenewalRequest) => {
    const reason = window.prompt('سبب الرفض (اختياري):', '');
    if (reason === null) return;
    run(async () => {
      const { data, error } = await supabase
        .from('renewal_requests')
        .update({ status: 'Rejected', signature_status: reason ? `مرفوض: ${reason}` : 'مرفوض' })
        .eq('request_id', req.request_id)
        .in('status', PENDING_STATUSES)
        .select('request_id');
      if (error) throw error;
      if (!data?.length) throw new Error('تغيّرت حالة الطلب، حدّث الصفحة وحاول مرة أخرى.');
      return `تم رفض طلب ${req.employee_name}.`;
    });
  };

  const deleteRequests = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!window.confirm(`حذف ${ids.length} طلب تجديد نهائياً؟ لا يمكن التراجع.`)) return;
    const ok = await run(async () => {
      const { error } = await supabase.from('renewal_requests').delete().in('request_id', ids);
      if (error) throw error;
      return `تم حذف ${ids.length} طلب.`;
    });
    if (ok) { closeModal(); setSelectedIds((p) => p.filter((id) => !ids.includes(id))); }
  };

  const exportApproved = () => {
    const list = selectedRows.filter((r) => r.status === 'Approved');
    if (list.length === 0) return notify('error', 'حدد طلبات معتمدة أولاً.');

    const data = list.map((r) => {
      const months = r.renewal_months || DEFAULT_MONTHS;
      const newStart = calcNewStart(r.contract_end_date);
      return {
        'رقم الطلب': r.request_id,
        'كود الموظف': r.employee_code,
        'اسم الموظف': r.employee_name,
        'الرقم القومي': r.national_id || '—',
        'الإدارة': r.department || '—',
        'الوظيفة': r.job_title || '—',
        'الشركة': r.company || '—',
        'نهاية العقد القديم': r.contract_end_date || '—',
        'بداية العقد الجديد': newStart,
        'مدة التجديد (شهور)': months,
        'نهاية العقد الجديد': r.new_contract_end_date || calcNewEnd(newStart, months),
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'عقود التجديد المعتمدة');
    XLSX.writeFile(wb, `كشف_عقود_التجديد_${toYMD(new Date())}.xlsx`);
  };

  /* ---------- الواجهة ---------- */
  const bulkStage: Stage = tab === 'general' ? 'general' : 'project';

  return (
    <div className="ren-page">
      <style>{REN_CSS}</style>

      <header className="ren-header">
        <div>
          <h1 className="ren-title">اعتمادات التجديد</h1>
          <p className="ren-subtitle">دورة الاعتماد المتدرج لتجديد العقود: المشروع ثم الإدارة العامة</p>
        </div>
        <div className="ren-actions">
          {isPendingTab && (
            <>
              <button className="ren-btn ren-btnPrimary" disabled={selectedRows.length === 0 || busy} onClick={() => setModal({ type: 'bulk' })}>
                اعتماد مجمع ({selectedRows.length})
              </button>
              <button className="ren-btn ren-btnDangerSoft" disabled={selectedRows.length === 0 || busy} onClick={() => deleteRequests(selectedRows.map((r) => r.request_id))}>
                حذف مجمع ({selectedRows.length})
              </button>
            </>
          )}
          {tab === 'approved' && (
            <button className="ren-btn ren-btnSuccess" disabled={selectedRows.length === 0 || busy} onClick={exportApproved}>
              تصدير للطباعة ({selectedRows.length})
            </button>
          )}
        </div>
      </header>

      <section className="ren-tabs" aria-label="مراحل الاعتماد">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            className={cx('ren-tab', tab === t.key && 'ren-tabActive')}
            style={{ ['--accent' as string]: t.accent, ['--accent-soft' as string]: t.soft }}
            onClick={() => setTab(t.key)}
          >
            <div className="ren-tabLabel"><span>{t.label}</span><span aria-hidden>{t.icon}</span></div>
            <div className="ren-tabValue">{counts[t.key]}</div>
            <div className="ren-tabHint">{t.hint}</div>
          </button>
        ))}
      </section>

      <section className="ren-toolbar" aria-label="البحث والفلاتر">
        <input className="ren-input ren-search" placeholder="بحث بالاسم أو الكود أو رقم الطلب أو الوظيفة" value={search} onChange={(e) => setSearch(e.target.value)} />
        <input className="ren-input ren-short" list="renDepts" placeholder="الإدارة" value={dept} onChange={(e) => setDept(e.target.value)} />
        <datalist id="renDepts">{departments.map((d) => <option key={d} value={d} />)}</datalist>
        <input className="ren-input ren-short" list="renCompanies" placeholder="الشركة" value={company} onChange={(e) => setCompany(e.target.value)} />
        <datalist id="renCompanies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
        <label className="ren-monthBox">شهر بداية العقد الجديد <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <button className="ren-btn" onClick={() => { setSearch(''); setDept(''); setCompany(''); setMonth(''); }}>إعادة ضبط</button>
        <div className="ren-count">المعروض: <strong>{rows.length}</strong> طلب</div>
      </section>

      <section className="ren-tableCard">
        {loading ? (
          <div className="ren-empty">جاري تحميل الطلبات...</div>
        ) : rows.length === 0 ? (
          <div className="ren-empty">لا توجد طلبات في هذه المرحلة تطابق البحث.</div>
        ) : (
          <div className="ren-tableScroll">
            <table className="ren-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input type="checkbox" aria-label="تحديد الكل" disabled={!canSelect} checked={canSelect && allSelected} onChange={(e) => toggleAll(e.target.checked)} />
                  </th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={cx('ren-sortable', c.center && 'ren-center')} onClick={() => toggleSort(c.key)}>
                      {c.label}
                      {sortKey === c.key
                        ? <span className="ren-sortArrow">{sortDir === 'asc' ? '▲' : '▼'}</span>
                        : <span className="ren-sortIdle">↕</span>}
                    </th>
                  ))}
                  <th className="ren-center">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pending = PENDING_STATUSES.includes(r.status);
                  return (
                    <tr key={r.request_id} className={cx(selectedIds.includes(r.request_id) && 'ren-rowSelected')}>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" aria-label={`تحديد ${r.employee_name}`} disabled={!canSelect} checked={selectedIds.includes(r.request_id)} onChange={(e) => toggleOne(r.request_id, e.target.checked)} />
                      </td>
                      {COLUMNS.map((c) => <td key={c.key} className={c.center ? 'ren-center' : undefined}>{c.render(r)}</td>)}
                      <td>
                        <div className="ren-cellActions">
                          {pending ? (
                            <>
                              <button className="ren-btn ren-btnSm ren-btnSuccess" onClick={() => { setModalError(null); setModal({ type: 'single', req: r }); }}>اعتماد</button>
                              <button className="ren-btn ren-btnSm ren-btnDanger" onClick={() => rejectRequest(r)}>رفض</button>
                            </>
                          ) : (
                            <span className="ren-muted" style={{ fontSize: 11 }}>تمت المعالجة</span>
                          )}
                          <button className="ren-btn ren-btnSm ren-btnDangerSoft" title="حذف الطلب نهائياً" onClick={() => deleteRequests([r.request_id])}>حذف</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal?.type === 'single' && (
        <ApprovalModal
          stage={stageOfStatus(modal.req.status)}
          req={modal.req}
          busy={busy}
          error={modalError}
          onClose={closeModal}
          onDelete={() => deleteRequests([modal.req.request_id])}
          onConfirm={(months, start, end) => approve(stageOfStatus(modal.req.status), [modal.req], months, { start, end })}
        />
      )}
      {modal?.type === 'bulk' && (
        <ApprovalModal
          stage={bulkStage}
          bulkCount={selectedRows.length}
          busy={busy}
          error={modalError}
          onClose={closeModal}
          onConfirm={(months) => approve(bulkStage, selectedRows, months)}
        />
      )}

      {toast && <div role="status" className={cx('ren-toast', toast.kind === 'ok' ? 'ren-toastOk' : 'ren-toastError')}>{toast.text}</div>}
    </div>
  );
}
