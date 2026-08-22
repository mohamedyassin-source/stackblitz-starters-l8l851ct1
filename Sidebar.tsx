type Page = 'employees' | 'contracts' | 'renewals';

export default function Sidebar({ activePage, setActivePage }: { activePage: Page; setActivePage: (p: Page) => void }) {
  const navItem = (page: Page, icon: string, label: string) => (
    <button
      className={`w-full text-right px-3 py-2 rounded-md mb-1 text-[11px] font-bold flex items-center gap-2 transition-colors ${
        activePage === page
          ? 'bg-gradient-to-l from-brass-500 to-brass-400 text-navy-950'
          : 'text-slate-400 hover:text-white hover:bg-white/5'
      }`}
      onClick={() => setActivePage(page)}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <aside className="w-[220px] bg-navy-950 text-white px-2.5 py-4 fixed right-0 top-0 bottom-0 z-50 flex flex-col">
      <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-white/10">
        <div className="seal w-9 h-9 text-base font-bold shrink-0">★</div>
        <div>
          <h1 className="m-0 text-sm font-display font-extrabold">بوابة العقود</h1>
          <p className="m-0 text-[9px] text-slate-400">نظام المراسم للموارد البشرية</p>
        </div>
      </div>

      <nav className="flex-1">
        <div className="text-[9px] text-slate-600 mx-2 mt-3 mb-1 font-extrabold uppercase tracking-wide">الرئيسية</div>
        <button className="w-full text-right px-3 py-2 rounded-md mb-1 text-[11px] font-bold flex items-center gap-2 text-slate-400 hover:text-white hover:bg-white/5">
          <span>🏠</span><span>لوحة التحكم</span>
        </button>

        <div className="text-[9px] text-slate-600 mx-2 mt-3 mb-1 font-extrabold uppercase tracking-wide">البيانات</div>
        {navItem('employees', '👥', 'الموظفون')}
        {navItem('contracts', '📄', 'العقود الحالية')}

        <div className="text-[9px] text-slate-600 mx-2 mt-3 mb-1 font-extrabold uppercase tracking-wide">التجديد</div>
        {navItem('renewals', '🔄', 'طلبات التجديد')}
        <button className="w-full text-right px-3 py-2 rounded-md mb-1 text-[11px] font-bold flex items-center gap-2 text-slate-400 hover:text-white hover:bg-white/5">
          <span>⚡</span><span>الاعتماد السريع</span>
        </button>
      </nav>

      <div className="text-[8.5px] text-slate-600 border-t border-white/10 pt-3 px-1">
        محفوظات موثّقة وفق سجل العقود الرسمي
      </div>
    </aside>
  );
}
