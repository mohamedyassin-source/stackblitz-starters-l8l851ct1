import './globals.css';

export const metadata = {
  title: 'نظام إدارة العقود والتجديدات - مجموعة المراسم',
  description: 'بوابة إدارة عقود الموظفين والتنبيهات الذكية',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}