import type { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon?: ReactNode;
  accentColor?: string;
}

export function MetricCard({ label, value, change, changeLabel = 'vs last week', icon, accentColor = '#185FA5' }: MetricCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const changeText = change !== undefined
    ? `${isPositive ? '+' : ''}${change}% ${changeLabel}`
    : null;

  return (
    <div className="bg-white dark:bg-slate-900/80 border border-[#E2E8F0] dark:border-white/10 rounded-lg p-6 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">{label}</span>
        {icon && (
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: accentColor + '1A', color: accentColor }}>
            {icon}
          </div>
        )}
      </div>
      <div className="mt-3">
        <span className="text-2xl font-semibold text-[#0F172A] dark:text-slate-100 tracking-tight">{value}</span>
      </div>
      {changeText && (
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: isPositive ? 'rgba(15,110,86,0.1)' : 'rgba(153,60,29,0.1)',
              color: isPositive ? '#0F6E56' : '#993C1D'
            }}
          >
            {change !== undefined ? '↑' : '↓'} {Math.abs(change || 0)}%
          </span>
          <span className="text-xs text-[#64748B] dark:text-slate-400">{changeLabel}</span>
        </div>
      )}
    </div>
  );
}
