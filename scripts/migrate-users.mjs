// ترحيل مستخدمي app_users إلى Supabase Auth — بدون ما حد يتقفل برا.
//   معاينة فقط (الافتراضي):  node --env-file=.env.local scripts/migrate-users.mjs
//   تنفيذ فعلي:              node --env-file=.env.local scripts/migrate-users.mjs --apply
// لازم SUPABASE_SERVICE_ROLE_KEY في .env.local (على جهازك فقط). Node 20+.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const DOMAIN = 'users.almarasem.com'; // لازم يطابق AUTH_EMAIL_DOMAIN في lib/auth-utils.ts
const ROLES = ['Admin', 'HR', 'Employee', 'Viewer'];

// نفس منطق lib/auth-utils.ts
const normalizeCode = (raw) => {
  const s = String(raw ?? '').trim();
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
};
const codeToEmail = (c) => `${normalizeCode(c).toLowerCase().replace(/[^a-z0-9._-]/g, '_')}@${DOMAIN}`;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('ناقص NEXT_PUBLIC_SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: users, error } = await admin.from('app_users').select('*');
if (error) { console.error('فشل قراءة app_users:', error.message); process.exit(1); }

// المستخدمين الموجودين أصلاً في Auth (لو السكريبت اتشغل قبل كده)
const existing = new Map();
for (let page = 1; ; page++) {
  const { data, error: e } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (e) { console.error(e.message); process.exit(1); }
  data.users.forEach((u) => existing.set(u.email, u.id));
  if (data.users.length < 1000) break;
}

const report = [['code', 'username', 'role', 'status', 'temp_password']];
const seen = new Set();
const stats = { migrated: 0, skipped: 0, tempPw: 0, noRole: 0 };

for (const u of users) {
  const code = normalizeCode(u.employee_code);
  const name = u.username || u.employee_name || '';
  if (!code) { report.push(['', name, '', 'تخطي: مفيش كود موظف', '']); stats.skipped++; continue; }
  if (seen.has(code)) { report.push([code, name, '', 'تخطي: كود مكرر', '']); stats.skipped++; continue; }
  seen.add(code);
  if (u.auth_id) { report.push([code, name, u.role ?? '', 'مُرحَّل من قبل', '']); stats.skipped++; continue; }

  // ⚠️ الكود القديم كان بيعتبر أي مستخدم من غير دور = Admin. هنا بنحوّله Viewer (من غير صلاحيات) وتراجعه إنت.
  let role = ROLES.includes(u.role) ? u.role : 'Viewer';
  if (!ROLES.includes(u.role)) stats.noRole++;

  let password = String(u.password ?? '').trim();
  let generated = false;
  if (password.length < 6) { password = randomBytes(9).toString('base64url'); generated = true; }

  if (!APPLY) {
    report.push([code, name, role, 'معاينة', generated ? '(هتتولد)' : '']);
    stats.migrated++; if (generated) stats.tempPw++;
    continue;
  }

  const email = codeToEmail(code);
  let authId = existing.get(email);

  if (!authId) {
    let res = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role, employee_code: code } });
    if (res.error && /weak|password/i.test(res.error.message) && !generated) {
      // Supabase رفض الباسورد كضعيف → نولّد مؤقت بدله
      password = randomBytes(9).toString('base64url'); generated = true;
      res = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role, employee_code: code } });
    }
    if (res.error) { report.push([code, name, role, 'فشل: ' + res.error.message, '']); stats.skipped++; continue; }
    authId = res.data.user.id;
  }

  const filter = u.id !== undefined ? ['id', u.id] : ['employee_code', u.employee_code];
  const { error: uErr } = await admin.from('app_users')
    .update({ auth_id: authId, must_change_password: true })
    .eq(...filter);
  if (uErr) { report.push([code, name, role, 'فشل التحديث: ' + uErr.message, '']); stats.skipped++; continue; }

  report.push([code, name, role, 'تم', generated ? password : '']);
  stats.migrated++; if (generated) stats.tempPw++;
}

const csv = report.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
writeFileSync('migration-report.csv', '\ufeff' + csv, { mode: 0o600 });

console.log(APPLY ? '✅ تم التنفيذ' : '👀 معاينة فقط (مفيش تغيير اتعمل). أضف --apply للتنفيذ');
console.log(`إجمالي: ${users.length} | ${APPLY ? 'مُرحَّل' : 'هيتم ترحيله'}: ${stats.migrated} | متخطّى: ${stats.skipped}`);
console.log(`كلمات سر مؤقتة: ${stats.tempPw} | بدون دور محدد (اتحوّلوا Viewer): ${stats.noRole}`);
console.log('التفاصيل في migration-report.csv — فيها كلمات سر مؤقتة، سلّمها واحذف الملف بعدها.');
