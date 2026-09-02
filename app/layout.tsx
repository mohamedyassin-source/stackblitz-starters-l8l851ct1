import './globals.css';

export const metadata = {
  title: 'نظام إدارة العقود والتجديدات - مجموعة المراسم',
  description: 'بوابة إدارة عقود الموظفين والتنبيهات الذكية',
};

export const viewport = {
  themeColor: '#0a0f1c',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        {/* سكريبت متزامن (blocking) يقرأ تفضيل الوضع الليلي المحفوظ ويطبّقه
            قبل أول رسم للصفحة. بدونه كانت الصفحة تُرسم دائمًا بالوضع النهاري
            أولًا ثم تتحول للوضع الليلي بعد تحميل React، مما يسبب "ومضة" لونية
            مزعجة لأي مستخدم مفضّل الوضع الليلي — عيب فعلي في تجربة الاستخدام. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try {
              var t = localStorage.getItem('theme');
              if (t === 'dark') document.documentElement.classList.add('dark-init');
            } catch (e) {}`,
          }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}