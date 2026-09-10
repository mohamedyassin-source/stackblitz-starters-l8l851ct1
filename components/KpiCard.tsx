'use client';

type Tone = 'default' | 'brass' | 'amber' | 'blue' | 'red' | 'green';

type Trend = {
  /** نسبة أو رقم التغيّر، مثال: 12 أو -4 */
  value: number;
  /** نص اختياري بجانب النسبة، مثال: "عن الشهر الماضي" */
  label?: string;
};

export default function KpiCard({
  title,
  value,
  sub,
  icon,
  tone = 'default',
  trend,
  onClick,
  loading = false,
}: {
  title: string;
  value?: number | string;
  sub?: string;
  icon?: string;
  tone?: Tone;
  trend?: Trend;
  onClick?: () => void;
  loading?: boolean;
}) {
  const isBrass = tone === 'brass';

  const palette: Record<Exclude<Tone, 'brass'>, { value: string; iconBg: string; iconColor: string }> = {
    default: { value: 'var(--ink, #0f172a)', iconBg: 'var(--stamp-blue-bg, #eff6ff)', iconColor: 'var(--stamp-blue, #2563eb)' },
    amber: { value: 'var(--stamp-amber, #d97706)', iconBg: 'var(--stamp-amber-bg, #fef3c7)', iconColor: 'var(--stamp-amber, #d97706)' },
    blue: { value: 'var(--stamp-blue, #2563eb)', iconBg: 'var(--stamp-blue-bg, #eff6ff)', iconColor: 'var(--stamp-blue, #2563eb)' },
    red: { value: 'var(--stamp-red, #dc2626)', iconBg: 'var(--stamp-red-bg, #fef2f2)', iconColor: 'var(--stamp-red, #dc2626)' },
    green: { value: 'var(--stamp-green, #16a34a)', iconBg: 'var(--stamp-green-bg, #f0fdf4)', iconColor: 'var(--stamp-green, #16a34a)' },
  };

  const c = isBrass
    ? { value: '#fff', iconBg: 'rgba(255,255,255,0.18)', iconColor: '#fff' }
    : palette[tone as Exclude<Tone, 'brass'>] || palette.default;

  const isClickable = typeof onClick === 'function';

  // معالجة القيمة بأمان لضمان عدم حدوث Crash
  const formattedValue = typeof value === 'number' 
    ? value.toLocaleString('en-US') 
    : value ?? 0;

  if (loading) {
    return (
      <div className="card px-5 py-4 animate-pulse" aria-hidden="true">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="h-2.5 w-24 rounded" style={{ background: 'var(--line, #e2e8f0)' }} />
            <div className="h-6 w-16 rounded mt-3" style={{ background: 'var(--line, #e2e8f0)' }} />
            <div className="h-2 w-20 rounded mt-2" style={{ background: 'var(--line, #e2e8f0)' }} />
          </div>
          <div className="w-10 h-10 rounded-xl" style={{ background: 'var(--line, #e2e8f0)' }} />
        </div>
      </div>
    );
  }

  const trendUp = trend ? trend.value > 0 : false;
  const trendDown = trend ? trend.value < 0 : false;
  const trendColor = isBrass
    ? '#fff'
    : trendUp
    ? 'var(--stamp-green, #16a34a)'
    : trendDown
    ? 'var(--stamp-red, #dc2626)'
    : 'var(--muted, #64748b)';

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`px-5 py-4 flex items-center justify-between transition-all duration-200 ${
        isBrass ? 'rounded-2xl text-white' : 'card'
      } ${isClickable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2' : ''}`}
      style={
        isBrass
          ? {
              background: 'linear-gradient(135deg, var(--brass-400, #0d9488), var(--brass-600, #0f172a))',
              boxShadow: '0 10px 20px rgba(13, 148, 136, 0.25)',
            }
          : undefined
      }
    >
      <div className="min-w-0">
        <div
          className="text-[12px] font-bold truncate"
          style={{ color: isBrass ? 'rgba(255,255,255,0.9)' : 'var(--muted, #64748b)' }}
        >
          {title}
        </div>

        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl font-mono font-extrabold" style={{ color: c.value }}>
            {formattedValue}
          </span>
          {trend && (
            <span
              className="text-[11px] font-bold flex items-center gap-0.5"
              style={{ color: trendColor }}
              title={trend.label}
            >
              {trendUp ? '▲' : trendDown ? '▼' : '—'} {Math.abs(trend.value)}
              {trend.label ? ` ${trend.label}` : ''}
            </span>
          )}
        </div>

        {sub && (
          <div className="text-[11px] mt-0.5 truncate" style={{ color: isBrass ? 'rgba(255,255,255,0.8)' : 'var(--muted, #64748b)' }}>
            {sub}
          </div>
        )}
      </div>

      {icon && (
        <div
          className="w-10 h-10 shrink-0 rounded-xl grid place-items-center text-lg"
          style={{ background: c.iconBg, color: c.iconColor }}
        >
          {icon}
        </div>
      )}
    </div>
  );
}
