# ترحيل الدخول والأمان — خطوات التنفيذ (بدون ما حد يتقفل برا)

## قبل ما تبدأ
- خد نسخة احتياطية من جدول `app_users` (Supabase → Table Editor → Export CSV).
- **اعتبر كل كلمات السر الحالية مكشوفة** (كانت مقروءة بالـ anon key). عشان كده الترحيل بيجبر كل مستخدم يغيّر كلمة السر عند أول دخول.
- من Supabase → Authentication → Providers/Settings: **اقفل "Allow new users to sign up"**.

## الخطوات بالترتيب
1. **SQL:** شغّل `sql/01_prepare.sql` (إضافات بس، آمنة).
2. **المتغيرات:** في Vercel وفي `.env.local` على جهازك ضيف `SUPABASE_SERVICE_ROLE_KEY` و`CRON_SECRET` (شوف `.env.example`).
   الـ service role key من Supabase → Project Settings → API. **سرّي: مش بتتحط في الكود ولا تتبعت لحد.**
3. **ثبّت الحزم:** `npm install` (أضفنا `@supabase/ssr`).
4. **معاينة الترحيل:** `node --env-file=.env.local scripts/migrate-users.mjs` (مفيش أي تغيير، بيطبع الأعداد بس).
5. **الترحيل الفعلي:** نفس الأمر + `--apply`. المستخدمين بيدخلوا بنفس كود الموظف وكلمة السر الحالية، واللي كلمة سره أقصر من 6 أحرف بيتولّد له كلمة مؤقتة في `migration-report.csv` (سلّمها واحذف الملف).
   راجع في التقرير المستخدمين اللي "بدون دور" — اتحوّلوا `Viewer` (الكود القديم كان بيخليهم Admin).
6. **انشر الكود الجديد** على Vercel وجرّب بحساب أدمن: دخول ← تغيير كلمة السر ← الإعدادات ← إضافة/حذف مستخدم.
7. **فعّل RLS:** شغّل `sql/02_rls.sql` وجرّب الصفحات بدور HR وبدور Employee. لو صفحة وقفت: `alter table <الجدول> disable row level security;` وراجع السياسة.
8. **بعد أسبوع من الاستقرار:** شغّل `sql/03_cleanup.sql` لمسح عمود `password` نهائياً.
9. **GitHub Actions:** ضيف secrets باسم `CRON_SECRET` و`APP_URL` عشان `keep-alive.yml` يشتغل.

## اللي اتغيّر
| الملف | التغيير |
|---|---|
| `components/LoginPage.tsx` | الدخول بـ Supabase Auth، تغيير كلمة السر إجباري، مفيش دور افتراضي Admin |
| `app/page.tsx` | الجلسة من Supabase مش من localStorage، وتسجيل خروج حقيقي |
| `middleware.ts` | تجديد الجلسة (الكود القديم كان بيصدّق كوكي يكتبها المتصفح) |
| `app/api/admin/users` | إضافة/حذف/صلاحيات/إعادة تعيين كلمة السر — للأدمن فقط من السيرفر |
| `app/api/auth/change-password` | تغيير كلمة السر |
| `app/api/cron`, `keep-alive` | محمية بـ `CRON_SECRET` أو جلسة Admin/HR |
| `components/SettingsPage.tsx` | إدارة المستخدمين عبر الـ API |
| `components/EmployeesPage.tsx` | تصحيح `justifyBetween` → `justifyContent` |

## ملاحظات
- الأدمن بيشوف كلمة السر المؤقتة مرة واحدة بس عند الإضافة أو إعادة التعيين.
- تغيير دور مستخدم بيتطبّق على توكنه خلال ساعة (أو أول تسجيل دخول جديد).
- بعد RLS، دور `Employee` هيشوف بياناته فقط (ومنها لوحة التحكم)، و`Viewer` مش هيشوف بيانات.
- امسح `public/M-Contract.xlsx` من المشروع ومن Vercel.
