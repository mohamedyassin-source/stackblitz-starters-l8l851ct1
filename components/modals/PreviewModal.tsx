import { supabase } from '@/lib/supabase';
import ModalShell from '@/components/ModalShell';
import Field from '@/components/Field';
export interface PreviewData {
  emp: any;
  contracts: any[];
  renewals: any[];
  loading: boolean;
}

export default function PreviewModal({ data, onClose }: { data: PreviewData; onClose: () => void }) {
  const { emp } = data;
  const name = getField(emp, 'employee_name', 'ArabicName');
  const code = getField(emp, 'employee_code', 'EmployeeCode', 'employee_id');

  return (
    <ModalShell title={`ملف الموظف: ${name || code}`} width={620} onClose={onClose}>
      {data.loading ? (
        <div className="p-5 text-center text-ink-muted font-bold text-[11px]">جاري سحب السجل...</div>
      ) : (
        <div>
          <div className="grid grid-cols-2 gap-2 mb-4 bg-paper border border-paper-line rounded p-3 text-[10.5px]">
            <div>
              الكود: <span className="font-bold font-mono text-brass-600">{code}</span>
            </div>
            <div>
              الإدارة: <span className="font-bold">{getField(emp, 'department', 'Department') || '—'}</span>
            </div>
            <div>
              الوظيفة: <span className="font-bold">{getField(emp, 'job_title', 'JobTitle') || '—'}</span>
            </div>
            <div>
              نوع العقد: <span className="font-bold text-blue-600">{getField(emp, 'contract_type', 'ContractType') || '—'}</span>
            </div>
          </div>

          <h4 className="text-[11px] text-brass-600 font-bold mb-1.5 border-b border-paper-line pb-1">سجل العقود</h4>
          {data.contracts.length === 0 ? (
            <p className="text-[10px] text-ink-muted mb-4">لا توجد عقود مسجلة في الأرشيف لهذا الموظف.</p>
          ) : (
            <div className="mb-4 space-y-1.5">
              {data.contracts.map((c, i) => (
                <div key={i} className="flex justify-between items-center text-[10px] border-b border-paper-line py-1.5">
                  <span className="font-mono">
                    {getField(c, 'contract_start_date', 'ContractStartDate') || '—'} ← {getField(c, 'contract_end_date', 'ContractEndDate') || '—'}
                  </span>
                  <span className="font-bold text-blue-600">{getField(c, 'contract_type', 'ContractType') || '—'}</span>
                </div>
              ))}
            </div>
          )}

          <h4 className="text-[11px] text-brass-600 font-bold mb-1.5 border-b border-paper-line pb-1">طلبات التجديد</h4>
          {data.renewals.length === 0 ? (
            <p className="text-[10px] text-ink-muted">لا توجد طلبات تجديد سابقة لهذا الموظف.</p>
          ) : (
            <div className="space-y-1.5">
              {data.renewals.map((r, i) => {
                const isRejected = getField(r, 'status') === 'Rejected';
                const isSigned = getField(r, 'signature_status') === 'تم التوقيع';
                return (
                  <div key={i} className="flex justify-between items-center text-[10px] border-b border-paper-line py-1.5">
                    <span className="font-mono">{getField(r, 'request_date') || '—'}</span>
                    <div className="flex gap-1.5">
                      <Stamp color={isRejected ? 'red' : 'green'}>{isRejected ? 'مرفوض' : 'Approved'}</Stamp>
                      <Stamp color={isSigned ? 'green' : 'amber'}>{isSigned ? 'موقّع' : 'قيد التوقيع'}</Stamp>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end mt-4">
            <button onClick={onClose} className="bg-white border border-paper-line px-3 py-1.5 rounded text-[10px] font-bold text-ink">
              إغلاق
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
