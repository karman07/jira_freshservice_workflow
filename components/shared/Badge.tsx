interface BadgeProps {
  status: 'success' | 'failed' | 'skipped';
}

export function Badge({ status }: BadgeProps) {
  const styles = {
    success: 'bg-green-500/10 text-green-400 border-green-500/20',
    failed: 'bg-red-500/10 text-red-400 border-red-500/20',
    skipped: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };

  const dots = {
    success: 'bg-green-400',
    failed: 'bg-red-400',
    skipped: 'bg-amber-400',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
