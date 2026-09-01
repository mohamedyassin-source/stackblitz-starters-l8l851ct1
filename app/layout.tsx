'use client';
import './globals.css'
import { Cairo } from 'next/font/google' // 🌟 خط Cairo الاحترافي
import { DataProvider } from '@/lib/DataContext'
import { useState, useEffect } from 'react';

// تجهيز الخط بجميع الأوزان
const cairo = Cairo({ subsets: ['latin', 'arabic'], display: 'swap' })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // 🌟 استرجاع حالة الوضع الداكن من الذاكرة المحلية
  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('executive-theme');
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }, []);

  if (!mounted) return <html lang="ar" dir="rtl"><body className="bg-[var(--bg-color)]"></body></html>;

  return (
    <html lang="ar" dir="rtl">
      <head>
        <title>بوابة الموارد البشرية | المراسم</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className={`${cairo.className} antialiased selection:bg-gold selection:text-white`}>
        <DataProvider>
          {children}
        </DataProvider>
      </body>
    </html>
  )
}
