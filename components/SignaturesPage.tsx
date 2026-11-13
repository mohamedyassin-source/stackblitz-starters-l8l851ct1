'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/DataContext';

/* ================================================================== */
/*  الثوابت والأنواع                                                    */
/* ================================================================== */

const SIGNED = 'تم التوقيع';
const ARABIC_WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

type CardKey = 'pending' | 'signed' | 'all';

interface CardConfig { key: CardKey; label: string; icon: string; accent: string; soft: string; match: (r: SignatureRequest) => boolean }

const isSigned = (r: SignatureRequest) => r.signature_status === SIGNED;

const CARDS: CardConfig[] = [
  { key: 'pending', label: 'بانتظار التوقيع والطباعة', icon: '⏳', accent: '#c2410c', soft: '#fff1e6', match: (r) => !isSigned(r) },
  { key: 'signed', label: 'تم التوقيع والتحديث', icon: '✅', accent: '#15803d', soft: '#e6f6ec', match: isSigned },
  { key: 'all', label: 'كل النماذج المعتمدة', icon: '📋', accent: '#1d4ed8', soft: '#e8effe', match: () => true },
];

interface SignatureRequest {
  request_id: string;
  employee_id?: string | number | null;
  employee_code: string | number;
  employee_name: string;
  department?: string | null;
  renewal_months?: number | null;
  contract_end_date?: string | null;
  new_contract_end_date?: string | null;
  signature_status?: string | null;
  salary?: string | number | null;
  salary_in_words?: string | null;
  status: string;
  [key: string]: any;
}

/* ================================================================== */
/*  دوال التواريخ (بدون مشاكل توقيت)                                      */
/* ================================================================== */

const pad = (n: number) => String(n).padStart(2, '0');
const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDMY = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

const parseYMD = (s?: string | null): Date | null => {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
};

/** بداية العقد الجديد = اليوم التالي لنهاية العقد القديم. فاضي لو مفيش تاريخ. */
const calcNewStart = (oldEnd?: string | null): string => {
  const d = parseYMD(oldEnd);
  if (!d) return '';
  d.setDate(d.getDate() + 1);
  return toYMD(d);
};

const fmtDate = (s?: string | null) => { const d = parseYMD(s); return d ? toDMY(d) : ''; };
const fmtNextDay = (s?: string | null) => { const d = parseYMD(s); if (!d) return ''; d.setDate(d.getDate() + 1); return toDMY(d); };

const normCode = (c: unknown) => String(c ?? '').trim().replace(/^0+/, '');
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

/* ================================================================== */
/*  الأنماط                                                             */
/* ================================================================== */

const SIG_CSS = `
.sig-page {
  --ink: #14202b; --muted: #5b6b7a; --line: #e3e8ee; --surface: #ffffff;
  --brand: #4338ca; --green: #15803d; --rose: #be123c; --radius: 12px;
  direction: rtl; color: var(--ink);
  font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
  padding-bottom: 40px; display: flex; flex-direction: column; gap: 16px;
}
.sig-header { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 22px; }
.sig-title { margin: 0; font-size: 20px; font-weight: 800; }
.sig-subtitle { margin: 4px 0 0; font-size: 12.5px; color: var(--muted); }

.sig-btn { border: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 8px 14px; border-radius: 8px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: background .15s; }
.sig-btn:hover:not(:disabled) { background: #f0f3f6; }
.sig-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.sig-btn:disabled { opacity: .5; cursor: not-allowed; }
.sig-btnPrimary { background: var(--brand); border-color: var(--brand); color: #fff; }
.sig-btnPrimary:hover:not(:disabled) { background: #3730a3; }
.sig-btnSuccess { background: var(--green); border-color: var(--green); color: #fff; }
.sig-btnSuccess:hover:not(:disabled) { background: #11652f; }
.sig-btnDanger { background: var(--rose); border-color: var(--rose); color: #fff; }
.sig-btnDangerSoft { color: var(--rose); border-color: #f8c2cd; background: #fff5f7; }
.sig-btnAccent { color: var(--brand); border-color: #c7d2fe; background: #f5f6ff; }
.sig-btnSm { padding: 4px 10px; font-size: 11.5px; }

.sig-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
.sig-card { --accent: var(--brand); --accent-soft: #eef2ff; position: relative; text-align: right; font: inherit; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; cursor: pointer; transition: border-color .15s, background .15s; }
.sig-card::before { content: ''; position: absolute; inset-block: 14px; inset-inline-start: 0; width: 3px; border-radius: 3px; background: var(--accent); }
.sig-card:hover { border-color: var(--accent); }
.sig-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sig-cardActive { background: var(--accent-soft); border-color: var(--accent); }
.sig-cardLabel { font-size: 12.5px; color: var(--muted); font-weight: 700; display: flex; justify-content: space-between; }
.sig-cardValue { font-size: 26px; font-weight: 800; color: var(--accent); margin-top: 6px; line-height: 1.1; }
.sig-cardHint { font-size: 11.5px; color: var(--muted); margin-top: 4px; }

.sig-bulkBar { background: var(--ink); color: #fff; padding: 10px 16px; border-radius: var(--radius); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.sig-bulkBar .sig-btn { background: transparent; border-color: #3a4a5a; color: #e8edf2; }
.sig-bulkBar .sig-btn:hover:not(:disabled) { background: #22313f; }
.sig-bulkBar .sig-btnSuccess { background: var(--green); border-color: var(--green); color: #fff; }
.sig-bulkBar .sig-btnDanger { background: var(--rose); border-color: var(--rose); color: #fff; }
.sig-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.sig-toolbar { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.sig-input, .sig-select { padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; font: inherit; font-size: 12.5px; color: var(--ink); background: #fff; min-width: 0; }
.sig-input:focus, .sig-select:focus { outline: 2px solid var(--brand); border-color: var(--brand); }
.sig-search { min-width: 250px; }
.sig-monthBox { display: flex; align-items: center; gap: 6px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 3px 10px; font-size: 12px; font-weight: 700; color: #3730a3; }
.sig-monthBox input { border: 0; background: transparent; font: inherit; color: inherit; outline: none; }
.sig-count { margin-inline-start: auto; font-size: 12.5px; color: var(--muted); }
.sig-count strong { color: var(--ink); font-size: 14px; }

.sig-tableCard { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.sig-tableScroll { max-height: 62vh; overflow: auto; }
.sig-table { width: 100%; border-collapse: collapse; text-align: right; font-size: 12.5px; white-space: nowrap; }
.sig-table thead th { position: sticky; top: 0; z-index: 2; background: #f8fafb; border-bottom: 1px solid var(--line); color: var(--muted); font-weight: 700; padding: 11px 12px; user-select: none; }
.sig-sortable { cursor: pointer; }
.sig-sortable:hover { color: var(--ink); }
.sig-sortArrow { color: var(--brand); margin-inline-start: 4px; }
.sig-sortIdle { opacity: .3; margin-inline-start: 4px; }
.sig-table td { padding: 10px 12px; border-bottom: 1px solid #f0f3f6; }
.sig-table tbody tr:hover { background: #fafbfc; }
.sig-rowSelected { background: #eef2ff !important; }
.sig-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
.sig-code { font-weight: 800; color: var(--brand); }
.sig-muted { color: var(--muted); }
.sig-center { text-align: center; }
.sig-cellActions { display: flex; gap: 6px; justify-content: center; }
.sig-empty { padding: 56px 20px; text-align: center; color: var(--muted); font-size: 13.5px; }

.sig-badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; border: 1px solid transparent; }
.sig-badgeGreen { background: #e6f6ec; color: #15803d; border-color: #bde5c9; }
.sig-badgeOrange { background: #fff1e6; color: #c2410c; border-color: #fbd5b5; }
.sig-badgeGray { background: #f1f4f7; color: #334155; border-color: var(--line); }

.sig-overlay { position: fixed; inset: 0; background: rgba(20,32,43,.55); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; }
.sig-modal { background: #fff; border-radius: 16px; width: 100%; max-width: 480px; max-height: 92vh; overflow-y: auto; padding: 22px 24px; box-shadow: 0 24px 60px rgba(0,0,0,.28); }
.sig-modalHead { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 16px; }
.sig-modalTitle { margin: 0; font-size: 16.5px; font-weight: 800; color: var(--brand); }
.sig-modalFoot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.sig-box { background: #f8fafb; border: 1px solid var(--line); border-radius: 10px; padding: 12px; margin-bottom: 14px; font-size: 12.5px; }
.sig-field label { display: block; font-size: 11.5px; font-weight: 700; color: var(--muted); margin-bottom: 5px; }
.sig-field .sig-input { width: 100%; box-sizing: border-box; }
.sig-notice { border-radius: 10px; padding: 10px 12px; font-size: 12.5px; line-height: 1.7; margin-top: 12px; }
.sig-noticeWarn { background: #fef3c7; color: #92400e; }
.sig-noticeInfo { background: #eef2ff; color: #3730a3; }

.sig-toast { position: fixed; bottom: 24px; inset-inline-start: 24px; z-index: 10000; padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 700; box-shadow: 0 10px 30px rgba(0,0,0,.2); max-width: min(480px, calc(100vw - 48px)); white-space: pre-line; color: #fff; }
.sig-toastOk { background: var(--green); }
.sig-toastError { background: var(--rose); }

@media (prefers-reduced-motion: reduce) { .sig-page * { transition: none !important; } }
`;

/* ================================================================== */
/*  نافذة تعديل التاريخ                                                  */
/* ================================================================== */

function EditModal({ req, busy, onAlign, onSave, onClose }: {
  req: SignatureRequest; busy: boolean;
  onAlign: () => { ok: string } | { error: string };
  onSave: (endDate: string) => void;
  onClose: () => void;
}) {
  const [end, setEnd] = useState(req.new_contract_end_date || '');
  const [message, setMessage] = useState<string | null>(null);
  const signed = isSigned(req);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const align = () => {
    const result = onAlign();
    if ('ok' in result) { setEnd(result.ok); setMessage(null); } else setMessage(result.error);
  };

  const submit = (e: FormEvent) => { e.preventDefault(); if (end) onSave(end); };

  return (
    <div className="sig-overlay" role="dialog" aria-modal="true">
      <div className="sig-modal">
        <div className="sig-modalHead">
          <h3 className="sig-modalTitle">تعديل تاريخ نهاية العقد الجديد</h3>
          <button type="button" className="sig-btn" onClick={onClose}>إغلاق</button>
        </div>
        <form onSubmit={submit}>
          <div className="sig-box">
            <strong>{req.employee_name}</strong>
            <div className="sig-muted" style={{ marginTop: 4 }}>الكود: {req.employee_code} · رقم الطلب: {req.request_id}</div>
          </div>

          <div className="sig-field">
            <label>تاريخ نهاية العقد الجديد *</label>
            <input className="sig-input sig-mono" type="date" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>

          <button type="button" className="sig-btn sig-btnAccent" style={{ width: '100%', marginTop: 12 }} onClick={align}>
            محاذاة لآخر يوم في شهر تعيين الموظف
          </button>
          {message && <div className="sig-notice sig-noticeWarn">{message}</div>}

          <div className="sig-notice sig-noticeInfo">
            {signed
              ? 'العقد موقّع بالفعل، فسيتم تحديث الطلب وجدول العقود السارية معاً.'
              : 'العقد لم يُوقّع بعد، فسيتم تعديل الطلب فقط، وجدول العقود يتحدث عند التوقيع.'}
          </div>

          <div className="sig-modalFoot">
            <button type="button" className="sig-btn" onClick={onClose}>إلغاء</button>
            <button type="submit" className="sig-btn sig-btnPrimary" disabled={busy || !end}>{busy ? 'جاري الحفظ...' : 'حفظ التعديل'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  الصفحة                                                              */
/* ================================================================== */

type SortKey = 'request_id' | 'employee_code' | 'employee_name' | 'department' | 'renewal_months' | 'new_contract_end_date' | 'signature_status';

const COLUMNS: { key: SortKey; label: string; center?: boolean; render: (r: SignatureRequest) => ReactNode }[] = [
  { key: 'request_id', label: 'رقم الطلب', render: (r) => <span className="sig-mono sig-muted">{r.request_id}</span> },
  { key: 'employee_code', label: 'الكود', render: (r) => <span className="sig-mono sig-code">{r.employee_code}</span> },
  { key: 'employee_name', label: 'الموظف', render: (r) => <strong>{r.employee_name}</strong> },
  { key: 'department', label: 'الإدارة', render: (r) => r.department || <span className="sig-muted">—</span> },
  { key: 'renewal_months', label: 'المدة المعتمدة', center: true, render: (r) => <span className="sig-badge sig-badgeGray">{r.renewal_months ? `${r.renewal_months} شهر` : 'مخصص'}</span> },
  { key: 'new_contract_end_date', label: 'الانتهاء الجديد', center: true, render: (r) => <span className="sig-mono">{r.new_contract_end_date || '—'}</span> },
  { key: 'signature_status', label: 'حالة التوقيع', center: true, render: (r) => isSigned(r) ? <span className="sig-badge sig-badgeGreen">تم التوقيع</span> : <span className="sig-badge sig-badgeOrange">بانتظار التوقيع</span> },
];

export default function SignaturesPage() {
  const { renewals, employees, loading, refresh } = useAppData();

  const requests = useMemo<SignatureRequest[]>(
    () => ((renewals ?? []) as SignatureRequest[])
      .filter((r) => r.status === 'Approved')
      .sort((a, b) => String(b.request_id).localeCompare(String(a.request_id))),
    [renewals],
  );

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [card, setCard] = useState<CardKey>('pending');
  const [sortKey, setSortKey] = useState<SortKey>('request_id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [month, setMonth] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<SignatureRequest | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = (kind: 'ok' | 'error', text: string) => setToast({ kind, text });
  const closeEdit = useCallback(() => setEditing(null), []);

  /* ---------- سجلات الموظفين (بالـ id أو الكود) ---------- */
  const employeeLookup = useMemo(() => {
    const byId = new Map<string, any>();
    const byCode = new Map<string, any>();
    ((employees ?? []) as any[]).forEach((e) => {
      [e.id, e.employee_id].forEach((v) => v != null && byId.set(String(v), e));
      byCode.set(normCode(e.employee_code), e);
    });
    return (req: SignatureRequest) =>
      (req.employee_id != null ? byId.get(String(req.employee_id)) : undefined) ?? byCode.get(normCode(req.employee_code));
  }, [employees]);

  /* ---------- الفلترة والترتيب ---------- */
  const departments = useMemo(() => Array.from(new Set<string>(requests.map((r) => r.department ?? '').filter(Boolean))), [requests]);

  const globalFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (term && ![r.employee_code, r.employee_name, r.request_id].some((v) => String(v ?? '').toLowerCase().includes(term))) return false;
      if (dept && r.department !== dept) return false;
      if (month && !calcNewStart(r.contract_end_date).startsWith(month)) return false;
      return true;
    });
  }, [requests, search, dept, month]);

  const counts = useMemo(() => {
    const c = {} as Record<CardKey, number>;
    CARDS.forEach((k) => { c[k.key] = globalFiltered.filter(k.match).length; });
    return c;
  }, [globalFiltered]);

  const rows = useMemo(() => {
    const active = CARDS.find((c) => c.key === card)!;
    const sign = sortDir === 'asc' ? 1 : -1;
    return globalFiltered.filter(active.match).sort((a, b) =>
      sign * String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), undefined, { numeric: true, sensitivity: 'base' }));
  }, [globalFiltered, card, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  /* التحديد يشمل المعروض فقط */
  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.includes(r.request_id)), [rows, selectedIds]);
  const selectedUnsigned = selectedRows.filter((r) => !isSigned(r));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  /* ---------- العمليات ---------- */
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      notify('ok', await action());
      await refresh();
      return true;
    } catch (err: any) {
      notify('error', err?.message ?? 'حدث خطأ غير متوقع');
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** يحدّث العقد الساري للموظف ويتأكد إن فيه صف اتحدّث فعلاً. */
  const updateActiveContract = async (req: SignatureRequest, patch: Record<string, string>) => {
    const code = String(req.employee_code).trim();
    const { data, error } = await supabase.from('contracts').update(patch).eq('employee_code', code).eq('status', 'Active').select('employee_code');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error(`لا يوجد عقد ساري للموظف ${req.employee_name} (كود ${code}) لتحديثه.`);
  };

  /** التوقيع: العقد الأول ثم الطلب، فلو العقد فشل ما يتعلّمش الطلب إنه موقّع. العملية آمنة للإعادة. */
  const signRequests = async (list: SignatureRequest[]) => {
    const targets = list.filter((r) => !isSigned(r));
    if (targets.length === 0) return notify('error', 'لا توجد عقود غير موقّعة في التحديد.');
    if (!window.confirm(`إثبات توقيع ${targets.length} عقد؟\nسيتم تحديث تواريخ عقود الموظفين فوراً.`)) return;

    setBusy(true);
    const results = await Promise.allSettled(targets.map(async (req) => {
      if (!req.new_contract_end_date) throw new Error(`${req.employee_name}: لا يوجد تاريخ نهاية جديد، عدّله أولاً.`);
      const start = calcNewStart(req.contract_end_date);
      if (!start) throw new Error(`${req.employee_name}: لا يوجد تاريخ نهاية للعقد القديم لتحديد بداية العقد الجديد.`);

      await updateActiveContract(req, { contract_start_date: start, contract_end_date: req.new_contract_end_date });

      const { error } = await supabase.from('renewal_requests').update({ signature_status: SIGNED }).eq('request_id', req.request_id);
      if (error) throw new Error(`${req.employee_name}: العقد اتحدّث لكن تعليم الطلب فشل، أعد التوقيع.`);
    }));
    setBusy(false);

    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    const ok = results.length - failed.length;
    if (ok > 0) { setSelectedIds([]); await refresh(); }
    notify(failed.length ? 'error' : 'ok',
      failed.length
        ? `تم توقيع ${ok} وفشل ${failed.length}:\n` + failed.map((f) => '• ' + (f.reason?.message ?? 'خطأ')).join('\n')
        : `تم توقيع ${ok} عقد وتحديث تواريخها.`);
  };

  const deleteRequests = async (list: SignatureRequest[]) => {
    if (list.length === 0) return;
    const hasSigned = list.some(isSigned);
    const warn = hasSigned ? '\n\nتنبيه: بينها عقود موقّعة. الحذف يمسح الطلب فقط، ولا يتراجع عن تحديث العقد.' : '';
    if (!window.confirm(`حذف ${list.length} طلب نهائياً من صفحة التوقيعات؟${warn}`)) return;

    const ids = list.map((r) => r.request_id);
    const ok = await run(async () => {
      const { error } = await supabase.from('renewal_requests').delete().in('request_id', ids);
      if (error) throw error;
      return `تم حذف ${ids.length} طلب.`;
    });
    if (ok) setSelectedIds((p) => p.filter((id) => !ids.includes(id)));
  };

  const saveEdit = async (endDate: string) => {
    if (!editing) return;
    const req = editing;
    const start = calcNewStart(req.contract_end_date);
    if (start && endDate <= start) return notify('error', 'تاريخ النهاية لازم يكون بعد بداية العقد الجديد (' + start + ').');

    const ok = await run(async () => {
      const { error } = await supabase.from('renewal_requests').update({ new_contract_end_date: endDate }).eq('request_id', req.request_id);
      if (error) throw error;
      if (isSigned(req)) {
        await updateActiveContract(req, { contract_end_date: endDate });
        return 'تم تحديث تاريخ النهاية في الطلب وفي جدول العقود السارية.';
      }
      return 'تم تعديل التاريخ في الطلب، وسيتحدث جدول العقود عند التوقيع.';
    });
    if (ok) closeEdit();
  };

  /** آخر يوم في شهر تعيين الموظف، أول مرة بعد بداية العقد الجديد. */
  const alignToHireMonth = (req: SignatureRequest): { ok: string } | { error: string } => {
    const emp = employeeLookup(req);
    const hire = parseYMD(emp?.hiring_date || emp?.contract_start_date);
    if (!hire) return { error: 'تاريخ تعيين هذا الموظف غير مسجل أو غير صالح.' };

    const anchor = parseYMD(calcNewStart(req.contract_end_date)) ?? new Date();
    let target = new Date(anchor.getFullYear(), hire.getMonth() + 1, 0, 12);
    if (target <= anchor) target = new Date(anchor.getFullYear() + 1, hire.getMonth() + 1, 0, 12);
    return { ok: toYMD(target) };
  };

  /** توليد عقد PDF. كل القيم بتتعمل لها escape، وبنستنى صورة الخلفية قبل التصوير. */
  const generatePDF = async (req: SignatureRequest) => {
    setBusy(true);
    try {
      // @ts-ignore
      const html2pdf = (await import('html2pdf.js')).default;
      await new Promise<void>((resolve) => { const img = new Image(); img.onload = () => resolve(); img.onerror = () => resolve(); img.src = '/contract-bg.jpg'; });

      const emp = employeeLookup(req);
      const today = new Date();
      const startDate = fmtNextDay(req.contract_end_date) || fmtDate(emp?.contract_start_date);
      const endDate = fmtDate(req.new_contract_end_date);

      const span = (top: string, right: string, width: number, align: 'center' | 'right', value: unknown) =>
        `<span style="position:absolute;top:${top};right:${right};width:${width}px;text-align:${align};">${esc(value)}</span>`;

      const element = document.createElement('div');
      element.innerHTML = `
        <div style="position:relative;width:210mm;height:297mm;background:#fff;overflow:hidden;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#000;direction:rtl;">
          <img src="/contract-bg.jpg" style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;" />
          <div style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:2;">
            ${span('11.5%', '30%', 120, 'center', ARABIC_WEEKDAYS[today.getDay()])}
            ${span('11.5%', '65%', 120, 'center', toDMY(today))}
            ${span('25.5%', '28%', 300, 'center', req.employee_name)}
            ${span('28%', '18%', 400, 'right', emp?.address)}
            ${span('30.5%', '23%', 200, 'center', emp?.national_id)}
            ${span('30.5%', '68%', 120, 'center', emp?.birth_gov)}
            ${span('37.5%', '53%', 250, 'center', req.department)}
            ${span('49%', '35%', 120, 'center', startDate)}
            ${span('49%', '68%', 120, 'center', endDate)}
            ${span('56.5%', '33%', 180, 'center', emp?.job_title)}
            ${span('56.5%', '68%', 120, 'center', req.salary)}
            ${span('59%', '18%', 400, 'right', req.salary_in_words)}
            ${span('93%', '23%', 100, 'center', req.employee_code)}
          </div>
        </div>`;

      await html2pdf().from(element).set({
        margin: 0,
        filename: `عقد_عمل_${req.employee_name}_${req.request_id}.pdf`,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).save();
    } catch (err) {
      console.error('PDF error:', err);
      notify('error', 'تعذر تصدير العقد كملف PDF.');
    } finally {
      setBusy(false);
    }
  };

  /* ---------- الواجهة ---------- */
  return (
    <div className="sig-page">
      <style>{SIG_CSS}</style>

      <header className="sig-header">
        <h1 className="sig-title">توقيعات العقود</h1>
        <p className="sig-subtitle">طباعة النماذج المعتمدة، تعديل تواريخ نهايتها، وتوثيق التوقيع لتحديث العقود</p>
      </header>

      <section className="sig-cards" aria-label="حالة التوقيع">
        {CARDS.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={card === c.key}
            className={cx('sig-card', card === c.key && 'sig-cardActive')}
            style={{ ['--accent' as string]: c.accent, ['--accent-soft' as string]: c.soft }}
            onClick={() => setCard(c.key)}
          >
            <div className="sig-cardLabel"><span>{c.label}</span><span aria-hidden>{c.icon}</span></div>
            <div className="sig-cardValue">{counts[c.key]}</div>
            <div className="sig-cardHint">
              {c.key === 'all' ? 'الإجمالي' : `${counts.all > 0 ? ((counts[c.key] / counts.all) * 100).toFixed(1) : '0'}% من الإجمالي`}
            </div>
          </button>
        ))}
      </section>

      {selectedRows.length > 0 && (
        <div className="sig-bulkBar">
          <span style={{ fontSize: 13, fontWeight: 700 }}>تم تحديد {selectedRows.length} نموذج</span>
          <div className="sig-actions">
            <button className="sig-btn sig-btnSuccess" disabled={busy || selectedUnsigned.length === 0} onClick={() => signRequests(selectedRows)}>
              إثبات التوقيع ({selectedUnsigned.length})
            </button>
            <button className="sig-btn sig-btnDanger" disabled={busy} onClick={() => deleteRequests(selectedRows)}>حذف المحدد</button>
            <button className="sig-btn" onClick={() => setSelectedIds([])}>إلغاء التحديد</button>
          </div>
        </div>
      )}

      <section className="sig-toolbar" aria-label="البحث والفلاتر">
        <input className="sig-input sig-search" placeholder="بحث بالاسم أو الكود أو رقم الطلب" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="sig-select" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">كل الإدارات</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="sig-monthBox">شهر بداية العقد الجديد <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <button className="sig-btn" onClick={() => { setSearch(''); setDept(''); setMonth(''); setCard('pending'); }}>إعادة ضبط</button>
        <div className="sig-count">المعروض: <strong>{rows.length}</strong> نموذج</div>
      </section>

      <section className="sig-tableCard">
        {loading ? (
          <div className="sig-empty">جاري تحميل النماذج المعتمدة...</div>
        ) : rows.length === 0 ? (
          <div className="sig-empty">لا توجد نماذج مطابقة لهذه الحالة.</div>
        ) : (
          <div className="sig-tableScroll">
            <table className="sig-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input type="checkbox" aria-label="تحديد الكل" checked={allSelected} onChange={(e) => setSelectedIds(e.target.checked ? rows.map((r) => r.request_id) : [])} />
                  </th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={cx('sig-sortable', c.center && 'sig-center')} onClick={() => toggleSort(c.key)}>
                      {c.label}
                      {sortKey === c.key
                        ? <span className="sig-sortArrow">{sortDir === 'asc' ? '▲' : '▼'}</span>
                        : <span className="sig-sortIdle">↕</span>}
                    </th>
                  ))}
                  <th className="sig-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.request_id} className={cx(selectedIds.includes(r.request_id) && 'sig-rowSelected')}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label={`تحديد ${r.employee_name}`}
                        checked={selectedIds.includes(r.request_id)}
                        onChange={(e) => setSelectedIds((p) => (e.target.checked ? [...p, r.request_id] : p.filter((id) => id !== r.request_id)))}
                      />
                    </td>
                    {COLUMNS.map((c) => <td key={c.key} className={c.center ? 'sig-center' : undefined}>{c.render(r)}</td>)}
                    <td>
                      <div className="sig-cellActions">
                        {!isSigned(r) && <button className="sig-btn sig-btnSm sig-btnSuccess" disabled={busy} onClick={() => signRequests([r])}>توقيع</button>}
                        <button className="sig-btn sig-btnSm sig-btnAccent" disabled={busy} onClick={() => setEditing(r)}>تعديل</button>
                        <button className="sig-btn sig-btnSm sig-btnAccent" disabled={busy} onClick={() => generatePDF(r)}>طباعة</button>
                        <button className="sig-btn sig-btnSm sig-btnDangerSoft" disabled={busy} onClick={() => deleteRequests([r])}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && <EditModal req={editing} busy={busy} onAlign={() => alignToHireMonth(editing)} onSave={saveEdit} onClose={closeEdit} />}

      {toast && <div role="status" className={cx('sig-toast', toast.kind === 'ok' ? 'sig-toastOk' : 'sig-toastError')}>{toast.text}</div>}
    </div>
  );
}
