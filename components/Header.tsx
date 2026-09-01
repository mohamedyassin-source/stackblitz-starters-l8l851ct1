'use client';
import { usePathname } from 'next/navigation';

export default function Header({ toggleTheme, isDarkMode }: { toggleTheme?: () => void, isDarkMode?: boolean }) {
  const pathname = usePathname();
  
  let pageTitle = 'لوحة القيادة';
  if (pathname.includes('/employees')) pageTitle = 'سجل الموظفين';
  if (pathname.includes('/contracts')) pageTitle = 'إدارة العقود';
  if (pathname.includes('/renewals')) pageTitle = 'طلبات التجديد';
  if (pathname.includes('/signatures')) pageTitle = 'توقيعات العقود';
  if (pathname.includes('/reports')) pageTitle = 'التقارير';
  if (pathname.includes('/audit')) pageTitle = 'سجل النظام';
  if (pathname.includes('/settings')) pageTitle = 'الإعدادات';

  return (
    <header className="bg-card border-b border-border h-16 flex items-center justify-between px-6 transition-colors duration-300 z-10 shadow-sm shrink-0">
      <h1 className="text-lg font-extrabold text-primary tracking-tight">{pageTitle}</h1>
      
      <div className="flex items-center gap-4">
        {/* 🌟 زر تبديل الوضع الداكن والفاتح */}
        {toggleTheme && (
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-full hover:bg-background transition-colors text-muted hover:text-gold border border-transparent hover:border-border cursor-pointer"
            title={isDarkMode ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
          >
            <span className="text-lg">{isDarkMode ? '☀️' : '🌙'}</span>
          </button>
        )}
        
        <div className="w-px h-6 bg-border"></div> {/* فاصل جمالي */}

        <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 rounded-full bg-gold text-white flex items-center justify-center font-bold text-sm shadow-md">
            HR
          </div>
          <div className="hidden sm:block text-right">
            <div className="text-xs font-bold text-primary">مدير النظام</div>
            <div className="text-[10px] font-bold text-muted">إدارة الموارد البشرية</div>
          </div>
        </div>
      </div>
    </header>
  );
}
