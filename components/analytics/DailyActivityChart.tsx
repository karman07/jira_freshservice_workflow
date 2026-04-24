'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { DailyActivity } from '@/lib/types';
import { format, parseISO, subDays, formatISO } from 'date-fns';

interface DailyActivityChartProps {
  data: DailyActivity[];
}

/** Fill in any missing days in the last 7 days with 0s so the chart always shows a 7-day range */
function fillMissingDays(data: DailyActivity[]): DailyActivity[] {
  const map = new Map(data.map((d) => [d._id, d]));
  const filled: DailyActivity[] = [];
  for (let i = 6; i >= 0; i--) {
    const dateStr = formatISO(subDays(new Date(), i), { representation: 'date' });
    filled.push(map.get(dateStr) ?? { _id: dateStr, total: 0, successes: 0, failures: 0 });
  }
  return filled;
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { color: string; name: string; value: number }[];
  label?: string;
}) => {
  if (active && payload && payload.length) {
    const total = payload.find((p) => p.name === 'Total')?.value ?? 0;
    return (
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-4 py-3 shadow-2xl">
        <p className="text-xs font-medium text-[var(--text)] mb-2">{label}</p>
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-6 text-xs py-0.5">
            <span className="flex items-center gap-1.5 text-[var(--muted)]">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-semibold tabular-nums" style={{ color: p.color }}>
              {p.value}
              {total > 0 && p.name !== 'Total' && (
                <span className="text-[var(--muted)] font-normal ml-1">
                  ({Math.round((p.value / total) * 100)}%)
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function DailyActivityChart({ data }: DailyActivityChartProps) {
  const filled = fillMissingDays(data);
  const formatted = filled.map((d) => ({
    date: (() => {
      try { return format(parseISO(d._id), 'MMM d'); } catch { return d._id; }
    })(),
    Total: d.total,
    Success: d.successes,
    Failed: d.failures,
  }));

  const maxVal = Math.max(...formatted.map((d) => d.Total), 1);
  const hasData = formatted.some((d) => d.Total > 0);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wider">Daily Sync Activity</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">Last 7 days</p>
        </div>
        {!hasData && (
          <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--bg-elevated)] text-[var(--muted)] border border-[var(--border)]">
            No activity yet
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradSuccess" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#71717a', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#71717a', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            domain={[0, maxVal + 1]}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ paddingTop: '16px', fontSize: '11px', color: '#71717a' }}
          />
          <Area type="monotone" dataKey="Total" stroke="#3b82f6" strokeWidth={2} fill="url(#gradTotal)" dot={{ fill: '#3b82f6', r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
          <Area type="monotone" dataKey="Success" stroke="#22c55e" strokeWidth={2} fill="url(#gradSuccess)" dot={{ fill: '#22c55e', r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
          <Area type="monotone" dataKey="Failed" stroke="#ef4444" strokeWidth={2} fill="url(#gradFailed)" dot={{ fill: '#ef4444', r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
