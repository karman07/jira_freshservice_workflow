'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { DailyActivity } from '@/lib/types';
import { format, parseISO } from 'date-fns';

interface DailyActivityChartProps {
  data: DailyActivity[];
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
    return (
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-4 py-3 shadow-xl">
        <p className="text-xs text-[var(--muted)] mb-2">{label}</p>
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-[var(--muted)]">{p.name}:</span>
            <span className="text-[var(--text)] font-semibold">{p.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function DailyActivityChart({ data }: DailyActivityChartProps) {
  const formatted = data.map((d) => ({
    date: (() => {
      try {
        return format(parseISO(d._id), 'MMM d');
      } catch {
        return d._id;
      }
    })(),
    Total: d.total,
    Success: d.successes,
    Failed: d.failures,
  }));

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6">
      <h3 className="text-sm font-semibold text-[var(--text)] mb-6 uppercase tracking-wider">
        Daily Sync Activity
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={formatted} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#71717a', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#71717a', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: '16px', fontSize: '12px', color: '#71717a' }}
          />
          <Line
            type="monotone"
            dataKey="Total"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="Success"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ fill: '#22c55e', r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="Failed"
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ fill: '#ef4444', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
