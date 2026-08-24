// Employee/contract records in Supabase come from two historical column-naming
// conventions (snake_case and legacy PascalCase). getField reads whichever is set.
export function getField(obj: any, ...keys: string[]): string {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return '';
}

export function getDaysRemaining(endDateStr: string): number | null {
  if (!endDateStr || endDateStr === '—') return null;
  const end = new Date(endDateStr);
  if (isNaN(end.getTime())) return null;
  const today = new Date();
  const diffTime = end.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 3600 * 24));
}

export function isPermanent(emp: any): boolean {
  const type = getField(emp, 'contract_type', 'ContractType');
  const job = getField(emp, 'job_title', 'JobTitle');
  return type === 'دائم' || job.includes('دائم');
}

export const CONTRACT_TYPES = ['محدد المدة', 'محدد المدة - فوق السن', 'دائم'];
