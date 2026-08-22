export default function Header({
  title,
  subtitle,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'بحث سريع بكود أو اسم الموظف...',
}: {
  title: string;
  subtitle: string;
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
}) {
  return (
    <div className="flex justify-between items-center mb-4">
      <div>
        <h2 className="m-0 text-navy-950 text-base font-display font-extrabold">{title}</h2>
        <p className="mt-0.5 mb-0 text-[10px] text-ink-muted">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2.5">
        <input
          type="text"
          className="bg-paper-card border border-paper-line rounded-md px-2.5 py-1.5 w-[260px] text-[10px] outline-none focus:border-brass-500"
          placeholder={`🔍 ${searchPlaceholder}`}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <div className="flex items-center gap-1.5 bg-paper-card px-2 py-1 rounded-md border border-paper-line">
          <div className="seal w-6 h-6 text-[10px] font-bold">م</div>
          <div>
            <div className="text-[9px] font-bold text-ink">محمد ياسين</div>
            <div className="text-[8px] text-brass-600">مدير النظام (Admin)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
