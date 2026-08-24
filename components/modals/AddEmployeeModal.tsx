'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import ModalShell from '@/components/ModalShell';
import Field from '@/components/Field';

const CONTRACT_TYPES = ['محدد المدة', 'محدد المدة - فوق السن', 'دائم', 'مهمة/مشروع'];
const inputClass = "w-full px-2.5 py-2 border border-slate-300 rounded-md text-[11px] outline-none focus:border-brass-500 bg-white text-slate-800 font-bold";

const EMPTY = {
  employee_code: '',
  employee_name: '',
  english_name: '',
  national_id: '',
  department: '',
  company: '',
  job_title: '',
  hiring_date: '',
  contract_type: 'محدد المدة - فوق السن',
  contract_end_date: '',
  status: 'Active',
  email: '',
  phone: '',
};

export default function AddEmployeeModal({ onClose, onSave }: { onClose: () => void; onSave: (data: typeof EMPTY) => Promise<void> }) {
  const [newEmp, setNewEmp] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<typeof EMPTY>) => setNewEmp((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmp.employee_code || !newEmp.employee_name) {
      alert('يرجى كتابة الكود والاسم');
      return;
    }
    setSaving(true);
    await onSave(newEmp);
    setSaving(false);
  };

  return (
    <ModalShell title="إضافة موظف جديد بكافة البيانات" width={640} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <Field label="الكود (employee_code) *">
            <input required className={inputClass} value={newEmp.employee_code} onChange={(e) => set({ employee_code: e.target.value })} placeholder="1107" />
          </Field>
          <Field label="الاسم العربي *">
            <input required className={inputClass} value={newEmp.employee_name} onChange={(e) => set({ employee_name: e.target.value })} />
          </Field>
          <Field label="الاسم الإنجليزي">
            <input className={inputClass} value={newEmp.english_name} onChange={(e) => set({ english_name: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <Field label="الرقم القومي">
            <input className={inputClass} value={newEmp.national_id} onChange={(e) => set({ national_id: e.target.value })} />
          </Field>
          <Field label="الإدارة">
            <input className={inputClass} value={newEmp.department} onChange={(e) => set({ department: e.target.value })} />
          </Field>
          <Field label="الشركة">
            <input className={inputClass} value={newEmp.company} onChange={(e) => set({ company: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <Field label="الوظيفة">
            <input className={inputClass} value={newEmp.job_title} onChange={(e) => set({ job_title: e.target.value })} />
          </Field>
          <Field label="تاريخ التعيين">
            <input type="date" className={inputClass} value={newEmp.hiring_date} onChange={(e) => set({ hiring_date: e.target.value })} />
          </Field>
          <Field label="نوع العقد">
            <select className={inputClass} value={newEmp.contract_type} onChange={(e) => set({ contract_type: e.target.value })}>
              {CONTRACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <Field label="تاريخ انتهاء العقد">
            <input
              type="date"
              disabled={newEmp.contract_type === 'دائم'}
              className={`${inputClass} disabled:bg-slate-100`}
              value={newEmp.contract_end_date}
              onChange={(e) => set({ contract_end_date: e.target.value })}
            />
          </Field>
          <Field label="البريد الإلكتروني">
            <input type="email" className={inputClass} value={newEmp.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="الهاتف">
            <input className={inputClass} value={newEmp.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
        </div>

        <div className="flex gap-2 justify-end mt-4">
          <button type="button" onClick={onClose} className="bg-white border border-slate-200 px-3 py-1.5 rounded text-[10px] font-bold text-slate-700">
            إلغاء
          </button>
          <button type="submit" disabled={saving} className="bg-brass-600 hover:bg-brass-700 text-white border-0 px-3.5 py-1.5 rounded-md font-bold text-[10px] disabled:opacity-60">
            {saving ? 'جاري الحفظ...' : 'حفظ البيانات'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
