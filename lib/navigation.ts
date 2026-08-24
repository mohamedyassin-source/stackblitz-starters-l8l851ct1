/**
 * تنقّل موحّد بين تبويبات النظام من أي مكوّن، بدل البحث في الـ DOM عن أزرار القائمة
 * الجانبية بنص عنوانها ومحاكاة الضغط عليها (كان الأسلوب السابق هشًا: أي تغيير في
 * نص القائمة أو لغة الواجهة كان يكسر التنقّل بصمت).
 *
 * الاستخدام:
 *   navigateTo('contracts', { jumpSearch: employeeCode });
 * وفي app/page.tsx: useAppNavigation(setActiveTab)
 */

export type AppNavigateDetail = {
  tab: string;
  jumpSearch?: string;
};

const EVENT_NAME = 'app:navigate';

export function navigateTo(tab: string, opts?: { jumpSearch?: string }) {
  if (opts?.jumpSearch) {
    localStorage.setItem('jumpSearch', opts.jumpSearch);
  }
  window.dispatchEvent(
    new CustomEvent<AppNavigateDetail>(EVENT_NAME, { detail: { tab, jumpSearch: opts?.jumpSearch } })
  );
}

export function onAppNavigate(handler: (detail: AppNavigateDetail) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<AppNavigateDetail>).detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
