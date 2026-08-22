export default function ModalShell({
  title,
  width = 700,
  onClose,
  children,
}: {
  title: string;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-navy-950/70 flex justify-center items-center z-[100] p-4" onClick={onClose}>
      <div
        className="bg-paper-card rounded-lg p-5 max-h-[90vh] overflow-y-auto ledger-scroll w-full border-2 border-brass-500/40 shadow-2xl"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-paper-line">
          <h3 className="m-0 text-navy-950 text-[13px] font-display font-extrabold">{title}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-lg leading-none">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label className="block text-[9.5px] text-ink-muted mb-1 font-bold">{label}</label>
      {children}
    </div>
  );
}

export const inputClass =
  'w-full px-1.5 py-1.5 rounded border border-paper-line text-[10px] box-border outline-none focus:border-brass-500 bg-white';
