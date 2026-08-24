import { supabase } from '@/lib/supabase';
import ModalShell from '@/components/ModalShell';
import Field from '@/components/Field';
import Stamp from '@/components/Stamp';
export interface EditData {
  emp: any;
  contract: any;
  renewal: any;
  loading: boolean;
}

export default function EditEmployeeModal({
  editData,
  onClose,
  onSave,
}: {
  editData: EditData;
  onClose: () => void;
  onSave: (emp: any) => Promise<void>;
}) {
  const [emp, setEmp] = useState<any>(editData.emp);
  const [saving, setSaving] = useState(false);
  const set = (patch: any) => setEmp((prev: any) => ({ ...prev, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave(emp);
    setSaving(false);
  };

  const contractType = getField(emp, 'contract_type', 'ContractType');

  return (
    <ModalShell title="تعديل كافة حقول شيت الموظفين والعقود" onClose={onClose}>
      {editData.loading ? (
        <div className="p-5 text-center text-ink-muted font-bold text-[11px]">جاري سحب الحقول...</div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="bg-paper border border-paper-line p-3 rounded mb-3">
            <h4 className="m-0 mb-2 text-brass-600 text-[11px] border-b border-paper-line pb-1">1. حقول شيت الموظفين (Employees Sheet)</h4>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <Field label="الكود (employee_code)">
                <input className={inputClass} value={getField(emp, 'employee_code', 'EmployeeCode')} onChange={(e) => set({ employee_code: e.target.value, EmployeeCode: e.target.value })} />
              </Field>
              <Field label="الاسم العربي (employee_name)">
                <input className={inputClass} value={getField(emp, 'employee_name', 'ArabicName')} onChange={(e) => set({ employee_name: e.target.value, ArabicName: e.target.value })} />
              </Field>
              <Field label="الاسم الإنجليزي (english_name)">
                <input className={inputClass} value={getField(emp, 'english_name', 'EnglishName')} onChange={(e) => set({ english_name: e.target.value, EnglishName: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <Field label="الرقم القومي (national_id)">
                <input className={inputClass} value={getField(emp, 'national_id', 'NationalID')} onChange={(e) => set({ national_id: e.target.value, NationalID: e.target.value })} />
              </Field>
              <Field label="الإدارة (department)">
                <input className={inputClass} value={getField(emp, 'department', 'Department')} onChange={(e) => set({ department: e.target.value, Department: e.target.value })} />
              </Field>
              <Field label="الشركة (company)">
                <input className={inputClass} value={getField(emp, 'company', 'Company')} onChange={(e) => set({ company: e.target.value, Company: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="الوظيفة (job_title)">
                <input className={inputClass} value={getField(emp, 'job_title', 'JobTitle')} onChange={(e) => set({ job_title: e.target.value, JobTitle: e.target.value })} />
              </Field>
              <Field label="البريد الإلكتروني (email)">
                <input type="email" className={inputClass} value={getField(emp, 'email', 'Email')} onChange={(e) => set({ email: e.target.value, Email: e.target.value })} />
              </Field>
              <Field label="الهاتف (phone)">
                <input className={inputClass} value={getField(emp, 'phone', 'Phone')} onChange={(e) => set({ phone: e.target.value, Phone: e.target.value })} />
              </Field>
            </div>
          </div>

          <div className="bg-paper border border-paper-line p-3 rounded mb-3">
            <h4 className="m-0 mb-2 text-brass-600 text-[11px] border-b border-paper-line pb-1">2. حقول العقد الحالي</h4>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <Field label="تاريخ التعيين (hiring_date)">
                <input type="date" className={inputClass} value={getField(emp, 'hiring_date', 'HiringDate')} onChange={(e) => set({ hiring_date: e.target.value, HiringDate: e.target.value })} />
              </Field>
              <Field label="نوع العقد (contract_type)">
                <select className={inputClass} value={contractType} onChange={(e) => set({ contract_type: e.target.value, ContractType: e.target.value })}>
                  {CONTRACT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="تاريخ الانتهاء (contract_end_date)">
                <input
                  type="date"
                  disabled={contractType === 'دائم'}
                  className={`${inputClass} disabled:bg-slate-100`}
                  value={getField(emp, 'contract_end_date', 'ContractEndDate')}
                  onChange={(e) => set({ contract_end_date: e.target.value, ContractEndDate: e.target.value })}
                />
              </Field>
            </div>
            <Field label="الحالة (status)">
              <select className={inputClass} value={getField(emp, 'status', 'Status') || 'Active'} onChange={(e) => set({ status: e.target.value, Status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </Field>
          </div>

          {(editData.contract?.id || editData.renewal?.id) && (
            <div className="bg-paper border border-paper-line p-3 rounded mb-3">
              <h4 className="m-0 mb-2 text-brass-600 text-[11px] border-b border-paper-line pb-1">3. ملخص السجل الرسمي (للاطلاع فقط)</h4>
              <div className="flex gap-4 flex-wrap text-[10px] text-ink-muted">
                {editData.contract?.id && (
                  <div>
                    آخر عقد مسجل:{' '}
                    <span className="font-bold text-ink font-mono">
                      {getField(editData.contract, 'contract_end_date', 'ContractEndDate') || '—'}
                    </span>
                  </div>
                )}
                {editData.renewal?.id && (
                  <div className="flex items-center gap-1.5">
                    آخر طلب تجديد: <Stamp color="blue">{getField(editData.renewal, 'status') || '—'}</Stamp>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end mt-4">
            <button type="button" onClick={onClose} className="bg-white border border-paper-line px-3 py-1.5 rounded text-[10px] font-bold text-ink">
              إلغاء
            </button>
            <button type="submit" disabled={saving} className="bg-brass-600 hover:bg-brass-700 text-white border-0 px-3.5 py-1.5 rounded-md font-bold text-[10px] disabled:opacity-60">
              {saving ? 'جاري الحفظ...' : 'حفظ التعديلات الشاملة'}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}
