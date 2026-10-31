-- الخطوة 4: تفعيل RLS — شغّله بعد ما تنشر الكود الجديد وتتأكد إن الدخول شغال.
-- الدور بيتقرا من app_metadata جوه التوكن (المستخدم مينفعش يعدّله).
-- ⚠️ راجع أسماء الأعمدة (employee_code) على جداولك قبل التشغيل.

create or replace function public.app_role() returns text
language sql stable as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'role', '') $$;

create or replace function public.app_code() returns text
language sql stable as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'employee_code', '') $$;

-- ---------- employees ----------
alter table public.employees enable row level security;
create policy "staff full access" on public.employees for all to authenticated
  using (public.app_role() in ('Admin','HR')) with check (public.app_role() in ('Admin','HR'));
create policy "employee reads own" on public.employees for select to authenticated
  using (public.app_role() = 'Employee'
         and ltrim(employee_code::text, '0') = ltrim(public.app_code(), '0'));

-- ---------- contracts ----------
alter table public.contracts enable row level security;
create policy "staff full access" on public.contracts for all to authenticated
  using (public.app_role() in ('Admin','HR')) with check (public.app_role() in ('Admin','HR'));
create policy "employee reads own" on public.contracts for select to authenticated
  using (public.app_role() = 'Employee'
         and ltrim(employee_code::text, '0') = ltrim(public.app_code(), '0'));

-- ---------- renewal_requests ----------
alter table public.renewal_requests enable row level security;
create policy "staff full access" on public.renewal_requests for all to authenticated
  using (public.app_role() in ('Admin','HR')) with check (public.app_role() in ('Admin','HR'));
create policy "employee reads own" on public.renewal_requests for select to authenticated
  using (public.app_role() = 'Employee'
         and ltrim(employee_code::text, '0') = ltrim(public.app_code(), '0'));
create policy "employee signs own" on public.renewal_requests for update to authenticated
  using (public.app_role() = 'Employee'
         and ltrim(employee_code::text, '0') = ltrim(public.app_code(), '0'))
  with check (public.app_role() = 'Employee'
         and ltrim(employee_code::text, '0') = ltrim(public.app_code(), '0'));

-- ---------- app_users: القراءة فقط، والكتابة من السيرفر (service role) ----------
alter table public.app_users enable row level security;
create policy "read own row" on public.app_users for select to authenticated
  using (auth_id = auth.uid());
create policy "admin reads all" on public.app_users for select to authenticated
  using (public.app_role() = 'Admin');

-- ---------- audit_logs ----------
alter table public.audit_logs enable row level security;
create policy "admin reads audit" on public.audit_logs for select to authenticated
  using (public.app_role() = 'Admin');
create policy "staff writes audit" on public.audit_logs for insert to authenticated
  with check (public.app_role() is not null);

-- تراجع سريع لو حصلت مشكلة (لجدول واحد):
--   alter table public.employees disable row level security;
