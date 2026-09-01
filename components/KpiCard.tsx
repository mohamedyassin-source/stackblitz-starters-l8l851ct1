'use client';

export default function KpiCard({ title, value, sub, icon, onClick, loading }: any) {
  return (
    <div 
      onClick={onClick}
      className="executive-card p-5 flex flex-col justify-between cursor-pointer group relative overflow-hidden"
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-xs font-bold text-muted transition-colors group-hover:text-primary">{title}</h3>
        <span className="text-xl opacity-80 group-hover:scale-125 transition-transform duration-300">{icon}</span>
      </div>
      
      <div className="mt-1">
        {loading ? (
          <div className="h-8 w-16 bg-border animate-pulse rounded-md"></div>
        ) : (
          <span className="text-2xl font-black text-primary transition-colors">{value?.toLocaleString('en-US') || 0}</span>
        )}
      </div>
      
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="text-[10px] font-bold text-gold group-hover:text-gold-hover transition-colors">{sub}</span>
        <span className="text-[10px] text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-bold">
          عرض التفاصيل ↗
        </span>
      </div>
    </div>
  );
}
