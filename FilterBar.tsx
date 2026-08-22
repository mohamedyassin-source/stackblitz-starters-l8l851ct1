export function FilterBar({ children, resultsLabel }: { children: React.ReactNode; resultsLabel: React.ReactNode }) {
  return (
    <div className="bg-paper-card border border-paper-line px-3 py-2 rounded-md mb-3 flex flex-wrap gap-2 items-center">
      {children}
      <div className="flex-1 text-left text-[9.5px] text-ink-muted font-bold">{resultsLabel}</div>
    </div>
  );
}

export function FilterInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`px-2 py-1 rounded border border-paper-line text-[10px] outline-none bg-paper focus:border-brass-500 ${props.className || ''}`}
    />
  );
}

export function FilterSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`px-2 py-1 rounded border border-paper-line text-[10px] outline-none bg-paper focus:border-brass-500 ${props.className || ''}`}
    />
  );
}

export function FilterResetButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 rounded border border-paper-line text-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-ink"
    >
      {children}
    </button>
  );
}
