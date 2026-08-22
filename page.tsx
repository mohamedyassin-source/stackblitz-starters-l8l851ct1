'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const LoginPage = dynamic(() => import('@/components/LoginPage'), { ssr: false });
const DashboardPage = dynamic(() => import('@/components/DashboardPage'), { ssr: false });
const EmployeesPage = dynamic(() => import('@/components/EmployeesPage'), { ssr: false });
const ContractsPage = dynamic(() => import('@/components/ContractsPage'), { ssr: false });
const RenewalsPage = dynamic(() => import('@/components/RenewalsPage'), { ssr: false });
const SignaturesPage = dynamic(() => import('@/components/SignaturesPage'), { ssr: false });
const ReportsPage = dynamic(() => import('@/components/ReportsPage'), { ssr: false });
const AlertsPage = dynamic(() => import('@/components/AlertsPage'), { ssr: false });
const AuditPage = dynamic(() => import('@/components/AuditPage'), { ssr: false });
const SettingsPage = dynamic(() => import('@/components/SettingsPage'), { ssr: false });

const SIDEBAR_GROUPS = [
  { title: 'الرئيسية', items: [{ id: 'dashboard', icon: '📊', label: 'لوحة التحكم', roles: ['Admin', 'HR', 'Employee'] }] },
  { title: 'شؤون العاملين', items: [{ id: 'employees_data', icon: '👥', label: 'بيانات الموظفين', roles: ['Admin', 'HR'] }] },
  { title: 'إدارة العقود', items: [
      { id: 'contracts', icon: '📂', label: 'العقود الحالية', roles: ['Admin', 'HR'] },
      { id: 'renewals', icon: '⏳', label: 'طلبات التجديد', roles: ['Admin', 'HR'] },
      { id: 'signatures', icon: '✍️', label: 'توقيع العقود', roles: ['Admin', 'HR', 'Employee'] },
  ]},
  { title: 'المتابعة والتقارير', items: [
      { id: 'reports', icon: '📈', label: 'التقارير', roles: ['Admin', 'HR'] },
      { id: 'alerts', icon: '🚨', label: 'التنبيهات', roles: ['Admin', 'HR'] },
      { id: 'audit', icon: '🕵️‍♂️', label: 'سجل العمليات', roles: ['Admin'] },
  ]}
];

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'لوحة التحكم',
  employees_data: 'بيانات الموظفين',
  contracts: 'العقود الحالية',
  renewals: 'طلبات التجديد',
  signatures: 'توقيع العقود',
  reports: 'التقارير',
  alerts: 'التنبيهات',
  audit: 'سجل العمليات',
  settings: 'إعدادات النظام',
};

export default function Home() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('session_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('session_user');
      }
    }
    // مصدر واحد للحقيقة للوضع الليلي، مطبَّق على body ومحفوظ محلياً
    const savedTheme = localStorage.getItem('theme');
    const dark = savedTheme === 'dark';
    setIsDarkMode(dark);
    document.body.classList.toggle('dark', dark);
    setCheckingAuth(false);
  }, []);

  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    document.body.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const handleLogout = () => {
    localStorage.removeItem('session_user');
    setCurrentUser(null);
  };

  if (checkingAuth) {
    return (
      <div className="grid place-items-center min-h-screen bg-navy-950 text-white text-sm font-bold gap-3">
        <div className="w-10 h-10 border-2 border-brass-400 border-t-transparent rounded-full animate-spin" />
        جاري التحقق من الصلاحيات والتأمين...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setActiveTab('dashboard');
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--paper)' }}>

      {/* overlay للموبايل عند فتح القائمة */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ========================== الشريط الجانبي ========================== */}
      <aside
        className={`w-[264px] bg-navy-950 text-white flex flex-col fixed lg:static inset-y-0 right-0 z-50 transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-6 border-b border-white/10">
          <div className="seal w-10 h-10 text-base">★</div>
          <div>
            <h3 className="m-0 text-[17px] font-extrabold text-brass-300 leading-tight">المراسم الدولية</h3>
            <span className="text-[11px] text-slate-400 font-medium">بوابة العقود والتجديدات</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5">
          {SIDEBAR_GROUPS.map((group, index) => {
            const visibleItems = group.items.filter(item => item.roles.includes(currentUser.role));
            if (visibleItems.length === 0) return null;
            return (
              <div key={index} className="mb-6">
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
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="px-4 py-4 bg-black/20 border-t border-white/10">
          {currentUser.role === 'Admin' && (
            <button
              onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }}
              className={`w-full text-right px-3.5 py-2.5 rounded-lg text-[13px] font-bold mb-3 border transition-colors ${
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

      {/* ========================== منطقة المحتوى ========================== */}
      <div className="flex-1 flex flex-col min-h-screen lg:mr-0">
        <header
          className="h-[72px] flex items-center justify-between px-4 sm:px-6 border-b sticky top-0 z-30"
          style={{ background: 'var(--paper-card)', borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden w-9 h-9 rounded-lg grid place-items-center border"
              style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <h2 className="m-0 text-[17px] sm:text-[19px] font-extrabold" style={{ color: 'var(--navy-950)' }}>
              {PAGE_TITLES[activeTab] || 'نظام العقود'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="hidden sm:flex items-center gap-2.5 px-4 py-2 rounded-lg border text-[12px]"
              style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}
            >
              <span className="font-extrabold" style={{ color: 'var(--ink)' }}>{currentUser.name}</span>
              <span style={{ color: 'var(--line)' }}>|</span>
              <span className="font-extrabold text-brass-600">{currentUser.role}</span>
              <span style={{ color: 'var(--line)' }}>|</span>
              <span className="font-mono font-extrabold" style={{ color: 'var(--muted)' }}>{currentUser.code}</span>
            </div>
            <button
              onClick={toggleTheme}
              className="w-10 h-10 rounded-full border grid place-items-center text-[17px] transition-colors"
              style={{ borderColor: 'var(--line)', background: 'var(--paper-card)' }}
              title={isDarkMode ? 'الوضع النهاري' : 'الوضع الليلي'}
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'dashboard' && <DashboardPage />}
          {activeTab === 'employees_data' && <EmployeesPage />}
          {activeTab === 'contracts' && <ContractsPage />}
          {activeTab === 'renewals' && <RenewalsPage />}
          {activeTab === 'signatures' && <SignaturesPage />}
          {activeTab === 'reports' && <ReportsPage />}
          {activeTab === 'alerts' && <AlertsPage />}
          {activeTab === 'audit' && <AuditPage />}
          {activeTab === 'settings' && <SettingsPage currentUser={currentUser} />}
        </main>
      </div>
    </div>
  );
}
