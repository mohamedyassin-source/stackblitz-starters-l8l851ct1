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
  value: number;
  sub: string;
  icon: string;
  tone?: Tone;
  trend?: Trend;
  onClick?: () => void;
  loading?: boolean;
}) {
  const isBrass = tone === 'brass';

  const palette: Record<Exclude<Tone, 'brass'>, { value: string; iconBg: string; iconColor: string }> = {
    default: { value: 'var(--ink)', iconBg: 'var(--stamp-blue-bg)', iconColor: 'var(--stamp-blue)' },
    amber: { value: 'var(--stamp-amber)', iconBg: 'var(--stamp-amber-bg)', iconColor: 'var(--stamp-amber)' },
    blue: { value: 'var(--stamp-blue)', iconBg: 'var(--stamp-blue-bg)', iconColor: 'var(--stamp-blue)' },
    red: { value: 'var(--stamp-red)', iconBg: 'var(--stamp-red-bg)', iconColor: 'var(--stamp-red)' },
    green: { value: 'var(--stamp-green)', iconBg: 'var(--stamp-green-bg)', iconColor: 'var(--stamp-green)' },
  };
  const c = isBrass
    ? { value: '#fff', iconBg: 'rgba(255,255,255,0.18)', iconColor: '#fff' }
    : palette[tone as Exclude<Tone, 'brass'>] || palette.default;

  const isClickable = typeof onClick === 'function';

  if (loading) {
    return (
      <div className="card px-5 py-4 animate-pulse" aria-hidden="true">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="h-2.5 w-24 rounded" style={{ background: 'var(--line)' }} />
            <div className="h-6 w-16 rounded mt-3" style={{ background: 'var(--line)' }} />
            <div className="h-2 w-20 rounded mt-2" style={{ background: 'var(--line)' }} />
          </div>
          <div className="w-10 h-10 rounded-xl" style={{ background: 'var(--line)' }} />
        </div>
      </div>
    );
  }

  const trendUp = trend ? trend.value > 0 : false;
  const trendDown = trend ? trend.value < 0 : false;
  const trendColor = isBrass
    ? '#fff'
    : trendUp
    ? 'var(--stamp-green)'
    : trendDown
    ? 'var(--stamp-red)'
    : 'var(--muted)';

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
              background: 'linear-gradient(135deg, var(--brass-400), var(--brass-600))',
              boxShadow: '0 10px 20px rgba(184, 147, 74, 0.25)',
            }
          : undefined
      }
    >
      <div className="min-w-0">
        <div
          className="text-[12px] font-bold truncate"
          style={{ color: isBrass ? 'rgba(255,255,255,0.9)' : 'var(--muted)' }}
        >
          {title}
        </div>

        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl font-mono font-extrabold" style={{ color: c.value }}>
            {value.toLocaleString('ar-EG')}
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

        <div className="text-[11px] mt-0.5 truncate" style={{ color: isBrass ? 'rgba(255,255,255,0.8)' : 'var(--muted)' }}>
          {sub}
        </div>
      </div>

      <div
        className="w-10 h-10 shrink-0 rounded-xl grid place-items-center text-lg"
        style={{ background: c.iconBg, color: c.iconColor }}
      >
        {icon}
      </div>
    </div>
  );
}
