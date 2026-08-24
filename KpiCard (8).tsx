export default function KpiCard({
  title,
  value,
  sub,
  icon,
  tone = 'default',
}: {
  title: string;
  value: number;
  sub: string;
  icon: string;
  tone?: 'default' | 'brass' | 'amber' | 'blue' | 'red';
}) {
  if (tone === 'brass') {
    return (
      <div
        className="rounded-2xl px-5 py-4 flex items-center justify-between text-white"
        style={{ background: 'linear-gradient(135deg, var(--brass-400), var(--brass-600))', boxShadow: '0 10px 20px rgba(184, 147, 74, 0.25)' }}
      >
        <div>
          <div className="text-[12px] font-bold opacity-90">{title}</div>
          <div className="text-2xl font-mono font-extrabold mt-1">{value.toLocaleString()}</div>
          <div className="text-[11px] opacity-80 mt-0.5">{sub}</div>
        </div>
        <div className="w-10 h-10 rounded-xl grid place-items-center text-lg bg-white/15">{icon}</div>
      </div>
    );
  }

  const palette: Record<string, { value: string; iconBg: string; iconColor: string }> = {
    default: { value: 'var(--ink)', iconBg: 'var(--stamp-blue-bg)', iconColor: 'var(--stamp-blue)' },
    amber:   { value: 'var(--stamp-amber)', iconBg: 'var(--stamp-amber-bg)', iconColor: 'var(--stamp-amber)' },
    blue:    { value: 'var(--stamp-blue)', iconBg: 'var(--stamp-blue-bg)', iconColor: 'var(--stamp-blue)' },
    red:     { value: 'var(--stamp-red)', iconBg: 'var(--stamp-red-bg)', iconColor: 'var(--stamp-red)' },
  };
  const c = palette[tone] || palette.default;

  return (
    <div className="card px-5 py-4 flex items-center justify-between">
      <div>
        <div className="text-[12px] font-bold" style={{ color: 'var(--muted)' }}>{title}</div>
        <div className="text-2xl font-mono font-extrabold mt-1" style={{ color: c.value }}>{value.toLocaleString()}</div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>{sub}</div>
      </div>
      <div className="w-10 h-10 rounded-xl grid place-items-center text-lg" style={{ background: c.iconBg, color: c.iconColor }}>{icon}</div>
    </div>
  );
}
