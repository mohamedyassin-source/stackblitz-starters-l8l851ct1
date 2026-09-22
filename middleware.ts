import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // 1. قراءة بيانات المستخدم من الـ Cookies
  const sessionCookie = request.cookies.get('session_user')?.value;
  let userRole = 'Viewer';

  if (sessionCookie) {
    try {
      const parsed = JSON.parse(sessionCookie);
      userRole = parsed.role || 'Viewer';
    } catch (error) {
      console.error('Error parsing cookie', error);
    }
  }

  // 2. تحديد الصفحات السرية (اللي للأدمن بس)
  const isAdminPage = 
    request.nextUrl.pathname.startsWith('/data-sync') || 
    request.nextUrl.pathname.startsWith('/settings');

  // 3. اتخاذ القرار (حارس البوابة)
  if (isAdminPage && userRole !== 'Admin') {
    // لو بيحاول يدخل صفحة أدمن وهو مش أدمن، اطرده للصفحة الرئيسية!
    return NextResponse.redirect(new URL('/', request.url));
  }

  // لو كله تمام، خليه يكمل عادي
  return NextResponse.next();
}

// 4. تشغيل الـ Middleware على الصفحات المحددة فقط عشان منبطأش السيستم
export const config = {
  matcher: ['/data-sync/:path*', '/settings/:path*'],
};
