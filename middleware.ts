import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // 1. قراءة بيانات المستخدم من الـ Cookies
  const sessionCookie = request.cookies.get('session_user')?.value;
  let userRole = null;
  let isAuthenticated = false;

  if (sessionCookie) {
    try {
      // فك تشفير الكوكي اللي عملناله encodeURIComponent في صفحة الـ Login
      const decodedCookie = decodeURIComponent(sessionCookie);
      const parsed = JSON.parse(decodedCookie);
      userRole = parsed.role || 'Viewer';
      isAuthenticated = true;
    } catch (error) {
      console.error('Error parsing cookie', error);
    }
  }

  const currentPath = request.nextUrl.pathname;

  // 2. الحماية العامة: إذا لم يكن مسجل دخول، امنعه من كل شيء (ما عدا ملفات النظام والصور)
  if (!isAuthenticated && currentPath !== '/' && !currentPath.startsWith('/_next') && !currentPath.includes('.')) {
      // افترض أن صفحة الـ Login هي الصفحة الرئيسية '/' أو '/login' حسب هيكلة مشروعك
      return NextResponse.redirect(new URL('/', request.url));
  }

  // 3. الحماية الخاصة: تحديد الصفحات السرية (للأدمن فقط)
  const isAdminPage = 
    currentPath.startsWith('/data-sync') || 
    currentPath.startsWith('/settings');

  // 4. اتخاذ القرار (حارس البوابة) للصفحات السرية
  if (isAdminPage && userRole !== 'Admin') {
    // لو بيحاول يدخل صفحة أدمن وهو مش أدمن (مثلاً HR)، اطرده للداشبورد أو الصفحة الرئيسية
    return NextResponse.redirect(new URL('/', request.url));
  }

  // لو كله تمام، خليه يكمل عادي
  return NextResponse.next();
}

// 5. تشغيل الـ Middleware على جميع المسارات (للتأكد من تسجيل الدخول)، 
// مع استثناء ملفات الـ API، والـ Next.js الداخلية، والصور لتجنب إبطاء النظام
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
