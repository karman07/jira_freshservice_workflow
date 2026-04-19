interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  accent?: 'default' | 'success' | 'danger' | 'warning';
}

const borderStyles = {
  default: 'border-[var(--primary)]/20',
  success: 'border-green-500/20',
  danger:  'border-red-500/20',
  warning: 'border-amber-500/20',
};

const iconStyles = {
  default: 'bg-[var(--primary)]/10 text-[var(--primary)]',
  success: 'bg-green-500/10 text-green-400',
  danger:  'bg-red-500/10 text-red-400',
  warning: 'bg-amber-500/10 text-amber-400',
};

const valueStyles = {
  default: 'text-[var(--text)]',
  success: 'text-[var(--text)]',
  danger:  'text-[var(--text)]',
  warning: 'text-[var(--text)]',
};

export function StatCard({
  title,
  value,
  icon,
  subtitle,
  accent = 'default',
}: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border ${borderStyles[accent]} bg-[var(--bg-surface)] p-6 transition-transform duration-200 hover:-translate-y-0.5`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2">
            {title}
          </p>
          <p className={`text-3xl font-bold tabular-nums ${valueStyles[accent]}`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-[var(--muted)] mt-1.5">{subtitle}</p>
          )}
        </div>
        <div className={`flex-shrink-0 rounded-xl p-3 ${iconStyles[accent]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
