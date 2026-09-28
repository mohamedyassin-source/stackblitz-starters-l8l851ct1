function SidebarContent({ currentUser, activeTab, setActiveTab, setSidebarOpen, sidebarOpen, handleLogout }: any) {
  const { employees } = useAppData();

  // حساب العقود الحرجة جداً (متبقي 30 يوم أو أقل، ولم تنتهِ بعد)
  const warningCount = useMemo(() => {
    if (!employees) return 0;
    
    return employees.filter(emp => {
      if (emp.contract_type === 'دائم' || String(emp.job_title).includes('دائم')) return false;
      
      const endDateStr = emp.contract_end_date;
      if (!endDateStr) return false;
      
      const end = new Date(endDateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
      return days >= 0 && days <= 30; // حرج جداً
    }).length;
  }, [employees]);

  return (
    <>
      <style>{`
        @keyframes pulse-orange-badge {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(249, 115, 22, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
        }

        .urgent-badge {
          background-color: #f97316; /* برتقالي */
          color: white;
          border-radius: 50%;
          min-width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 6px;
          font-size: 10px;
          font-weight: bold;
          animation: pulse-orange-badge 1.5s infinite;
          margin-right: auto;
        }
      `}</style>
      
      <aside
        className={`w-[264px] h-screen bg-navy-950 text-white flex flex-col fixed top-0 right-0 z-50 transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10 shrink-0">
          <div className="seal w-10 h-10 text-base">★</div>
          <div>
            <h3 className="m-0 text-[17px] font-extrabold text-brass-300 leading-tight">المراسم الدولية</h3>
            <span className="text-[11px] text-slate-400 font-medium">بوابة العقود والتجديدات</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {SIDEBAR_GROUPS.map((group, index) => {
            const visibleItems = group.items.filter(item => item.roles.includes(currentUser.role));
            if (visibleItems.length === 0) return null;
            return (
              <div key={index}>
                <div className="text-[10.5px] text-slate-500 font-extrabold mb-2 px-2 tracking-wide">{group.title}</div>
                <div className="flex flex-col gap-1">
                  {visibleItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                      className={`nav-item w-full text-right px-3.5 py-2.5 rounded-lg text-[13.5px] font-bold flex items-center gap-2.5 transition-all ${
                        activeTab === item.id
                          ? 'bg-gradient-to-l from-brass-600 to-brass-400 text-white shadow-md shadow-brass-600/20'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                      
                      {/* عرض الإشعار النابض بجانب "التنبيهات" إذا كان هناك خطر */}
                      {item.id === 'alerts' && warningCount > 0 && (
                        <span className="urgent-badge">
                          {warningCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* ... باقي الكود السفلي للقائمة كما هو */}
        <div className="px-4 py-4 bg-black/20 border-t border-white/10 shrink-0 flex flex-col gap-2">
          {['Admin', 'HR'].includes(currentUser.role) && (
            <button
              onClick={() => { setActiveTab('data_sync'); setSidebarOpen(false); }}
              className={`w-full text-right px-3.5 py-2.5 rounded-lg text-[13px] font-bold border transition-colors flex items-center gap-2.5 ${
                activeTab === 'data_sync' ? 'bg-brass-600 border-brass-500 text-white' : 'border-white/10 text-slate-300 hover:bg-white/5'
              }`}
            >
              <span>🔄</span>
              <span>تحديث البيانات المجمع</span>
            </button>
          )}

          {currentUser.role === 'Admin' && (
            <button
              onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }}
              className={`w-full text-right px-3.5 py-2.5 rounded-lg text-[13px] font-bold border transition-colors ${
                activeTab === 'settings' ? 'bg-navy-700 border-navy-700 text-white' : 'border-white/10 text-slate-300 hover:bg-white/5'
              }`}
            >
              ⚙️ الإعدادات والصلاحيات
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full px-3.5 py-2.5 rounded-lg text-[12.5px] font-bold bg-red-950/60 text-red-300 border border-red-900 hover:bg-red-950 transition-colors"
          >
            🚪 تسجيل الخروج
          </button>
        </div>
      </aside>
    </>
  );
}
