// أدوات مشتركة للمصادقة (تعمل في المتصفح والسيرفر).
// ⚠️ نفس منطق normalizeCode/codeToEmail موجود في scripts/migrate-users.mjs — لازم يفضلوا متطابقين.

export const AUTH_EMAIL_DOMAIN = 'users.almarasem.com'; // إيميل داخلي شكلي، مش بيتبعتله أي رسالة
export const ROLES = ['Admin', 'HR', 'Employee', 'Viewer'] as const;
export type AppRole = (typeof ROLES)[number];

export const WEAK_PASSWORDS = ['123', '1234', '12345', '123456', '12345678', 'password', 'admin'];

/** "01234" و "1234" و " 1234 " كلهم يرجعوا "1234"؛ الأكواد النصية بتفضل كما هي. */
export function normalizeCode(raw: unknown): string {
  const s = String(raw ?? '').trim();
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
}

export function codeToEmail(code: unknown): string {
  const local = normalizeCode(code).toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  return `${local}@${AUTH_EMAIL_DOMAIN}`;
}

/** كائن المستخدم اللي الواجهة بتعرضه (للعرض فقط — الصلاحيات الحقيقية على السيرفر وRLS). */
export function buildSessionUser(authUser: any, profile: any) {
  return {
    code: profile?.employee_code ?? authUser?.app_metadata?.employee_code,
    name: profile?.employee_name || profile?.username || profile?.name,
    department: profile?.department || 'الموارد البشرية',
    role: authUser?.app_metadata?.role, // من app_metadata: المستخدم مش قادر يعدّلها
    company: profile?.company || 'المراسم الدولية',
  };
}
