```tsx
'use client';

import { useState } from 'react';
import ModalShell from '@/components/modals/ModalShell';

const CONTRACT_TYPES = [
  'محدد المدة',
  'محدد المدة - فوق السن',
  'دائم',
  'مهمة/مشروع',
];

const inputClass =
  'w-full px-2.5 py-2 border border-slate-300 rounded-md text-[11px] outline-none focus:border-brass-500 bg-white text-slate-800 font-bold';

const labelClass =
  'block text-[10px] font-bold text-slate-600 mb-1';

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

export default function AddEmployeeModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: typeof EMPTY) => Promise<void>;
}) {
  const [newEmp, setNewEmp] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<typeof EMPTY>) => {
    setNewEmp((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newEmp.employee_code.trim() || !newEmp.employee_name.trim()) {
      alert('يرجى كتابة الكود والاسم');
      return;
    }

    setSaving(true);

    try {
      await onSave(newEmp);
    } catch (error) {
      console.error('Error saving employee:', error);
      alert('حدث خطأ أثناء حفظ بيانات الموظف');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="إضافة موظف جديد بكافة البيانات"
      width={640}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>

        {/* البيانات الأساسية */}
        <div className="grid grid-cols-3 gap-2 mb-2">

          <div>
            <label className={labelClass}>
              الكود (employee_code) *
            </label>

            <input
              required
              className={inputClass}
              value={newEmp.employee_code}
              onChange={(e) =>
                set({
                  employee_code: e.target.value,
                })
              }
              placeholder="1107"
            />
          </div>

          <div>
            <label className={labelClass}>
              الاسم العربي *
            </label>

            <input
              required
              className={inputClass}
              value={newEmp.employee_name}
              onChange={(e) =>
                set({
                  employee_name: e.target.value,
                })
              }
            />
          </div>

          <div>
            <label className={labelClass}>
              الاسم الإنجليزي
            </label>

            <input
              className={inputClass}
              value={newEmp.english_name}
              onChange={(e) =>
                set({
                  english_name: e.target.value,
                })
              }
            />
          </div>

        </div>

        {/* البيانات الشخصية */}
        <div className="grid grid-cols-3 gap-2 mb-2">

          <div>
            <label className={labelClass}>
              الرقم القومي
            </label>

            <input
              className={inputClass}
              value={newEmp.national_id}
              onChange={(e) =>
                set({
                  national_id: e.target.value,
                })
              }
            />
          </div>

          <div>
            <label className={labelClass}>
              الإدارة
            </label>

            <input
              className={inputClass}
              value={newEmp.department}
              onChange={(e) =>
                set({
                  department: e.target.value,
                })
              }
            />
          </div>

          <div>
            <label className={labelClass}>
              الشركة
            </label>

            <input
              className={inputClass}
              value={newEmp.company}
              onChange={(e) =>
                set({
                  company: e.target.value,
                })
              }
            />
          </div>

        </div>

        {/* الوظيفة والعقد */}
        <div className="grid grid-cols-3 gap-2 mb-2">

          <div>
            <label className={labelClass}>
              الوظيفة
            </label>

            <input
              className={inputClass}
              value={newEmp.job_title}
              onChange={(e) =>
                set({
                  job_title: e.target.value,
                })
              }
            />
          </div>

          <div>
            <label className={labelClass}>
              تاريخ التعيين
            </label>

            <input
              type="date"
              className={inputClass}
              value={newEmp.hiring_date}
              onChange={(e) =>
                set({
                  hiring_date: e.target.value,
                })
              }
            />
          </div>

          <div>
            <label className={labelClass}>
              نوع العقد
            </label>

            <select
              className={inputClass}
              value={newEmp.contract_type}
              onChange={(e) =>
                set({
                  contract_type: e.target.value,
                  contract_end_date:
                    e.target.value === 'دائم'
                      ? ''
                      : newEmp.contract_end_date,
                })
              }
            >
              {CONTRACT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* نهاية العقد والتواصل */}
        <div className="grid grid-cols-3 gap-2 mb-2">

          <div>
            <label className={labelClass}>
              تاريخ انتهاء العقد
            </label>

            <input
              type="date"
              disabled={newEmp.contract_type === 'دائم'}
              className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-400`}
              value={newEmp.contract_end_date}
              onChange={(e) =>
                set({
                  contract_end_date: e.target.value,
                })
              }
            />
          </div>

          <div>
            <label className={labelClass}>
              البريد الإلكتروني
            </label>

            <input
              type="email"
              className={inputClass}
              value={newEmp.email}
              onChange={(e) =>
                set({
                  email: e.target.value,
                })
              }
            />
          </div>

          <div>
            <label className={labelClass}>
              الهاتف
            </label>

            <input
              className={inputClass}
              value={newEmp.phone}
              onChange={(e) =>
                set({
                  phone: e.target.value,
                })
              }
            />
          </div>

        </div>

        {/* الأزرار */}
        <div className="flex gap-2 justify-end mt-4">

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="bg-white border border-slate-200 px-3 py-1.5 rounded text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            إلغاء
          </button>

          <button
            type="submit"
            disabled={saving}
            className="bg-brass-600 hover:bg-brass-700 text-white border-0 px-3.5 py-1.5 rounded-md font-bold text-[10px] disabled:opacity-60"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ البيانات'}
          </button>

        </div>

      </form>
    </ModalShell>
  );
}
```
