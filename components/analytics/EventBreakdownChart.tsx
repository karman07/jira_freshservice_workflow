'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import { EventBreakdown } from '@/lib/types';
import { formatEventType } from '@/lib/utils';

interface EventBreakdownChartProps {
  data: EventBreakdown[];
}

const COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ec4899', '#06b6d4'];

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { color: string; name: string; value: number; payload: any }[];
  label?: string;
}) => {
  if (active && payload && payload.length) {
    const item = payload[0]?.payload;
    if (!item) return null;
    const successRate = item.Count > 0 ? Math.round((item.Success / item.Count) * 100) : 0;
    return (
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-4 py-3 shadow-2xl min-w-[160px]">
        <p className="text-xs font-semibold text-[var(--text)] mb-2">{label}</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4 text-xs">
            <span className="text-[var(--muted)]">Total</span>
            <span className="font-bold text-[var(--text)]">{item.Count}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-xs">
            <span className="text-green-400">Success</span>
            <span className="font-semibold text-green-400">{item.Success}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-xs">
            <span className="text-red-400">Failed</span>
            <span className="font-semibold text-red-400">{item.Failed}</span>
          </div>
          <div className="border-t border-[var(--border)] pt-1 mt-1 flex items-center justify-between text-xs">
            <span className="text-[var(--muted)]">Success Rate</span>
            <span className={`font-bold ${successRate >= 90 ? 'text-green-400' : successRate >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
              {successRate}%
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export function EventBreakdownChart({ data }: EventBreakdownChartProps) {
  const formatted = data.map((d, i) => ({
    name: formatEventType(d._id),
    Count: d.count,
    Success: d.successes,
    Failed: d.failures,
    color: COLORS[i % COLORS.length],
  }));

  const hasData = formatted.some((d) => d.Count > 0);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wider">Event Breakdown</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">By event type</p>
        </div>
        {!hasData && (
          <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--bg-elevated)] text-[var(--muted)] border border-[var(--border)]">
            No events yet
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={formatted} margin={{ top: 16, right: 4, left: -24, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: '#71717a', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fill: '#71717a', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="Count" radius={[5, 5, 0, 0]} maxBarSize={48}>
            {formatted.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} />
            ))}
            <LabelList dataKey="Count" position="top" style={{ fill: '#71717a', fontSize: 10 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Mini legend showing success/fail breakdown */}
      {hasData && (
        <div className="mt-4 grid grid-cols-2 gap-2 pt-4 border-t border-[var(--border)]">
          {formatted.slice(0, 4).map((d) => (
            <div key={d.name} className="flex items-center justify-between text-xs px-2 py-1 rounded-lg bg-[var(--bg-elevated)]">
              <span className="flex items-center gap-1.5 text-[var(--muted)] truncate">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                <span className="truncate">{d.name}</span>
              </span>
              <span className="font-mono text-[var(--text)] font-semibold ml-2">{d.Count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
