'use client';
import { useState, useEffect } from 'react';

export default function Header({ activePage }: { activePage?: string }) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [sessionUser, setSessionUser] = useState<any>(null);

  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains('dark'));

    // سحب بيانات المستخدم صاحب الجلسة الحالية
    const savedUser = localStorage.getItem('session_user');
    if (savedUser) {
      try {
        setSessionUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Error parsing session user', e);
      }
    }
  }, []);

  const toggleTheme = () => {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
      localStorage.setItem('executive-theme', 'light');
      setIsDarkMode(false);
    } else {
      html.classList.add('dark');
      localStorage.setItem('executive-theme', 'dark');
      setIsDarkMode(true);
    }
  };

  let pageTitle = 'لوحة القيادة';
  if (activePage === 'employees') pageTitle = 'بيانات الموظفين';
  if (activePage === 'contracts') pageTitle = 'إدارة العقود';
  if (activePage === 'renewals') pageTitle = 'طلبات التجديد';
  if (activePage === 'signatures') pageTitle = 'توقيعات العقود';
  if (activePage === 'reports') pageTitle = 'التقارير';
  if (activePage === 'audit') pageTitle = 'سجل النظام';
  if (activePage === 'settings') pageTitle = 'الإعدادات';

  // استخراج اسم المستخدم والدور
  const userName = sessionUser?.name || sessionUser?.username || 'مدير النظام';
  const userDept = sessionUser?.department || 'إدارة الموارد البشرية';
  
  // استخراج الحروف الأولى للـ Avatar
  const avatarInitials = userName
    ? userName.split(' ').map((n: string) => n[0]).slice(0, 2).join('')
    : 'HR';

  return (
    <header className="bg-card border-b border-border h-16 flex items-center justify-between px-6 transition-colors duration-300 z-10 shadow-sm shrink-0">
      <h1 className="text-lg font-extrabold text-primary tracking-tight">{pageTitle}</h1>
      
      <div className="flex items-center gap-4">
        {/* 🌟 زر تبديل الوضع الداكن */}
        <button 
          onClick={toggleTheme} 
          className="p-2 rounded-full hover:bg-background transition-colors text-muted hover:text-gold border border-transparent hover:border-border cursor-pointer"
          title={isDarkMode ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
        >
          <span className="text-lg">{isDarkMode ? '☀️' : '🌙'}</span>
        </button>
        
        <div className="w-px h-6 bg-border"></div>

        {/* 👤 بيانات المستخدم الحقيقي للجلسة */}
        <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-md uppercase">
            {avatarInitials}
          </div>
          <div className="hidden sm:block text-right">
            <div className="text-xs font-bold text-primary">{userName}</div>
            <div className="text-[10px] font-bold text-muted">{userDept}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
