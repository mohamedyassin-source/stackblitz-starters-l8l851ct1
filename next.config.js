/** @type {import('next').NextConfig} */
const nextConfig = {
  // كانت هذه القيم true سابقًا، بمعنى أن الأخطاء البرمجية (زي ملفات المودالز التي
  // كانت لا تُترجم أصلاً) كانت تمر بصمت أثناء الـ build. تم تفعيلهم الآن حتى يتوقف
  // الـ build فورًا عند أي خطأ TypeScript أو ESLint حقيقي بدل اكتشافه لاحقًا في الإنتاج.
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

module.exports = nextConfig;