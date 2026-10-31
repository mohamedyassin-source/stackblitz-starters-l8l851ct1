-- الخطوة 1: إضافات فقط — آمنة وما بتكسر أي حاجة شغالة دلوقتي.
alter table public.app_users add column if not exists auth_id uuid unique;
alter table public.app_users add column if not exists must_change_password boolean not null default false;
