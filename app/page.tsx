'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { onAppNavigate } from '@/lib/navigation';

// استدعاء الصفحات بشكل ديناميكي لتسريع التحميل
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
const DataSyncPage = dynamic(() => import('@/components/DataSyncPage'), { ssr: false });

const SIDEBAR_GROUPS = [
  { title: 'الرئيسية', items: [{ id: 'dashboard', icon: '📊', label: 'لوحة التحكم', roles: ['Admin', 'HR', 'Employee'] }] },
  { 
    title: 'شؤون العاملين', 
    items: [
      { id: 'employees_data', icon: '👥', label: 'بيانات الموظفين', roles: ['Admin', 'HR'] },
    ] 
  },
  { 
    title: 'إدارة العقود', 
    items: [
      { id: 'contracts', icon: '📑', label: 'العقود السارية', roles: ['Admin', 'HR'] },
      { id: 'renewals', icon: '⏳', label: 'طلبات التجديد', roles: ['Admin', 'HR'] },
      { id: 'signatures', icon: '✍️', label: 'توقيع العقود', roles: ['Admin', 'HR', 'Employee'] },
    ]
  },
  { 
    title: 'المتابعة والتقارير', 
    items: [
      { id: 'reports', icon: '📈', label: 'التقارير والإحصائيات', roles: ['Admin', 'HR'] },
      { id: 'alerts', icon: '🚨', label: 'التنبيهات العاجلة', roles: ['Admin', 'HR'] },
      { id: 'audit', icon: '🕵️‍♂️', label: 'سجل النظام', roles: ['Admin'] },
    ]
  }
];

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'لوحة التحكم (Dashboard)',
  employees_data: ' بيانات الموظفين',
  data_sync: 'تحديث ومزامنة البيانات',
  contracts: 'إدارة العقود الحالية السارية',
  renewals: 'دورة اعتماد طلبات التجديد',
  signatures: 'الاعتماد وتوقيع العقود',
  reports: 'التقارير التحليلية والإحصائيات',
  alerts: 'لوحة التنبيهات العاجلة',
  audit: 'سجل حركات النظام (Audit Log)',
  settings: 'إعدادات النظام والصلاحيات',
};

export default function Home() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // التحقق من هوية المستخدم
    const savedUser = localStorage.getItem('session_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('session_user');
      }
    }
    
    // 🌟 تهيئة الوضع الداكن بناءً على التخزين المحلي
    const savedTheme = localStorage.getItem('executive-theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
    
    setCheckingAuth(false);

    const unsubscribe = onAppNavigate(({ tab }) => {
      setActiveTab(tab);
      setSidebarOpen(false);
    });
    return unsubscribe;
  }, []);

  // 🌟 دالة تبديل الوضع (Light / Dark) متوافقة مع Tailwind
  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('executive-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('executive-theme', 'light');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('session_user');
    setCurrentUser(null);
  };

  if (checkingAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] text-white text-sm font-bold gap-4">
        <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin" />
        جاري تهيئة النظام والتحقق من الصلاحيات...
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
    <div className="flex h-screen overflow-hidden bg-background text-primary transition-colors duration-300">

      {/* خلفية القائمة الجانبية للموبايل */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity" onClick={() => setSidebarOpen(false)} />
      )}

      {/* 🌟 القائمة الجانبية (Sidebar) - تصميم فخم وثابت */}
      <aside
        className={`w-[264px] h-screen bg-[#0f172a] border-l border-white/5 text-white flex flex-col fixed top-0 right-0 z-50 transition-transform duration-300 shadow-2xl lg:shadow-none ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        {/* اللوجو */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10 shrink-0 bg-black/20">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold to-yellow-600 flex items-center justify-center text-xl shadow-lg shadow-gold/20">
            ★
          </div>
          <div>
            <h3 className="m-0 text-base font-extrabold text-white tracking-wide">المراسم الدولية</h3>
            <span className="text-[10px] text-gold font-bold uppercase tracking-wider">بوابة الموارد البشرية</span>
          </div>
        </div>

        {/* روابط التنقل */}
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {SIDEBAR_GROUPS.map((group, index) => {
            const visibleItems = group.items.filter(item => item.roles.includes(currentUser.role));
            if (visibleItems.length === 0) return null;
            return (
              <div key={index}>
                <div className="text-[10px] text-slate-500 font-black mb-3 px-2 uppercase tracking-widest">{group.title}</div>
                <div className="flex flex-col gap-1.5">
                  {visibleItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                      className={`w-full text-right px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-3 transition-all duration-200 ${
                        activeTab === item.id
                          ? 'bg-gold text-white shadow-lg shadow-gold/20 translate-x-1'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="text-lg opacity-90">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* الجزء السفلي (الإعدادات والخروج) */}
        <div className="p-4 bg-black/30 border-t border-white/5 shrink-0 flex flex-col gap-2">
          {['Admin', 'HR'].includes(currentUser.role) && (
            <button
              onClick={() => { setActiveTab('data_sync'); setSidebarOpen(false); }}
              className={`w-full text-right px-4 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-3 ${
                activeTab === 'data_sync' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="text-base">🔄</span> مزامنة البيانات
            </button>
          )}

          {currentUser.role === 'Admin' && (
            <button
              onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }}
              className={`w-full text-right px-4 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-3 ${
                activeTab === 'settings' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="text-base">⚙️</span> إعدادات النظام
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full text-right px-4 py-2.5 mt-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition-colors flex items-center gap-3"
          >
            <span className="text-base">🚪</span> تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* 🌟 مساحة العرض الرئيسية */}
      <div className="flex-1 flex flex-col h-screen w-full lg:pr-[264px]">
        
        {/* 🌟 الهيدر (Header) */}
        <header className="h-[72px] bg-card border-b border-border flex items-center justify-between px-5 sm:px-8 sticky top-0 z-30 shrink-0 transition-colors duration-300">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center text-primary hover:text-gold transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <h2 className="m-0 text-base sm:text-lg font-extrabold text-primary tracking-tight">
              {PAGE_TITLES[activeTab] || 'نظام العقود'}
            </h2>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            
            {/* معلومات المستخدم */}
            <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-xl bg-background border border-border">
              <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center text-white font-bold text-xs shadow-sm">
                {currentUser.name.charAt(0)}
              </div>
              <div className="flex flex-col text-right">
                <span className="text-xs font-extrabold text-primary leading-none">{currentUser.name}</span>
                <span className="text-[10px] font-bold text-muted mt-1">{currentUser.role} | {currentUser.code}</span>
              </div>
            </div>

            <div className="w-px h-8 bg-border hidden sm:block"></div>

            {/* زر الوضع الداكن */}
            <button
              onClick={toggleTheme}
              className="w-10 h-10 rounded-full bg-background border border-border flex items-center justify-center text-lg text-muted hover:text-gold hover:border-gold transition-all duration-300"
              title={isDarkMode ? 'الوضع النهاري' : 'الوضع الليلي'}
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        {/* 🌟 محتوى الصفحة المتغير */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-background relative">
          <div className="max-w-[1400px] mx-auto w-full">
            {activeTab === 'dashboard' && <DashboardPage />}
            {activeTab === 'employees_data' && <EmployeesPage />}
            {activeTab === 'data_sync' && <DataSyncPage />}
            {activeTab === 'contracts' && <ContractsPage />}
            {activeTab === 'renewals' && <RenewalsPage />}
            {activeTab === 'signatures' && <SignaturesPage />}
            {activeTab === 'reports' && <ReportsPage />}
            {activeTab === 'alerts' && <AlertsPage />}
            {activeTab === 'audit' && <AuditPage />}
            {activeTab === 'settings' && <SettingsPage currentUser={currentUser} />}
          </div>
        </main>
        
      </div>
    </div>
  );
}
