-- الخطوة 6: بعد أسبوع من استقرار النظام الجديد.
-- بيمسح كلمات السر النصية للأبد — خد نسخة احتياطية قبلها.
alter table public.app_users drop column if exists password;
