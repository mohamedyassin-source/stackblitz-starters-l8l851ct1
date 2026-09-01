'use client';
import './globals.css'
import { Inter } from 'next/font/google'
import { DataProvider } from '@/lib/DataContext'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { useState, useEffect } from 'react';

// استخدام خط ناعم واحترافي
const inter = Inter({ subsets: ['latin', 'arabic'], display: 'swap' })

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
  if (!mounted) return <html lang="ar" dir="rtl"><body className="bg-slate-50"></body></html>;

  return (
    <html lang="ar" dir="rtl" className={isDarkMode ? 'dark' : ''}>
      <head>
        <title>نظام إدارة الموارد البشرية | المراسم</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className={`${inter.className} antialiased selection:bg-gold selection:text-white`}>
        <DataProvider>
          <div className="flex h-screen overflow-hidden">
            {/* القائمة الجانبية */}
            <Sidebar />
            
            <div className="flex-1 flex flex-col h-screen overflow-hidden transition-all duration-300">
              {/* 🌟 تمرير دالة تغيير الثيم للهيدر لربطها بزر هناك لاحقاً */}
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
