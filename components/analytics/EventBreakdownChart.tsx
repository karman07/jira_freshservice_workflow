'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { EventBreakdown } from '@/lib/types';
import { formatEventType } from '@/lib/utils';

interface EventBreakdownChartProps {
  data: EventBreakdown[];
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

export function EventBreakdownChart({ data }: EventBreakdownChartProps) {
  const formatted = data.map((d) => ({
    name: formatEventType(d._id),
    Count: d.count,
    Success: d.successes,
    Failed: d.failures,
  }));

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6">
      <h3 className="text-sm font-semibold text-[var(--text)] mb-6 uppercase tracking-wider">
        Event Type Breakdown
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={formatted} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#71717a', fontSize: 11 }}
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
          <Bar dataKey="Count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Success" fill="#22c55e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
