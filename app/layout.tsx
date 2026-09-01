'use client';
import './globals.css'
import { Cairo } from 'next/font/google' // 🌟 استخدمنا خط Cairo الفخم والداعم للعربية
import { DataProvider } from '../lib/DataContext' // 🌟 تعديل المسار
import Sidebar from '../Sidebar' // 🌟 تعديل المسار ليقرأ من المجلد الرئيسي
import Header from '../Header' // 🌟 تعديل المسار ليقرأ من المجلد الرئيسي
import { useState, useEffect } from 'react';

// تجهيز الخط بجميع الأوزان
const cairo = Cairo({ subsets: ['latin', 'arabic'], display: 'swap' })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 🌟 استرجاع حالة الوضع الداكن من الذاكرة المحلية عند تحميل الصفحة
  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('executive-theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  // 🌟 دالة تبديل الوضع (Light / Dark)
  const toggleTheme = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('executive-theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('executive-theme', 'dark');
      setIsDarkMode(true);
    }
  };

  // لتفادي مشاكل الـ Hydration في Next.js
  if (!mounted) return <html lang="ar" dir="rtl"><body className="bg-[var(--bg-color)]"></body></html>;

  return (
    <html lang="ar" dir="rtl" className={isDarkMode ? 'dark' : ''}>
      <head>
        <title>نظام إدارة الموارد البشرية | المراسم</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className={`${cairo.className} antialiased selection:bg-[var(--accent-gold)] selection:text-white`}>
        <DataProvider>
          <div className="flex h-screen overflow-hidden">
            {/* القائمة الجانبية */}
            <Sidebar />
            
            <div className="flex-1 flex flex-col h-screen overflow-hidden transition-all duration-300">
              {/* 🌟 تمرير دالة تغيير الثيم للهيدر */}
              <Header toggleTheme={toggleTheme} isDarkMode={isDarkMode} />
              
              <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                <div className="max-w-7xl mx-auto">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </DataProvider>
      </body>
    </html>
  )
}
