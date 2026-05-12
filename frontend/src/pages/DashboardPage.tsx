import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { ToolKey } from '@/types';
import {
  Camera, ArrowRightLeft, BarChart3, Wallet, ArrowRight,
  Database, ShieldCheck, TrendingUp, Receipt,
} from 'lucide-react';

export const DASHBOARD_TOOLS = [
  {
    key: 'config_snapshot' as ToolKey,
    path: '/config',
    title: 'Config Snapshot',
    subtitle: 'REST API Configuration Tracker',
    description:
      'Capture live system configurations via REST endpoints. Compare snapshots across time and detect configuration drift before it impacts your migration.',
    icon: Camera,
    decorIcon: Database,
    accentColor: '#185FA5',
    gradientFrom: '#0D3B6E',
    gradientTo: '#1E6FBA',
    glowColor: 'rgba(24,95,165,0.45)',
    tag: 'REST API',
    tagBg: 'rgba(24,95,165,0.18)',
    tagColor: '#93C5FD',
    stat: '4 Snapshots',
    statLabel: 'Active',
  },
  {
    key: 'data_conversion' as ToolKey,
    path: '/data-conversion',
    title: 'Data Conversion',
    subtitle: 'Validation & Verification Engine',
    description:
      'Run end-to-end ETL pipelines — Extract, Transform, Validate, Verify, Load. Ensure data integrity and completeness before committing to the target system.',
    icon: ArrowRightLeft,
    decorIcon: ShieldCheck,
    accentColor: '#0F6E56',
    gradientFrom: '#073D30',
    gradientTo: '#0F6E56',
    glowColor: 'rgba(15,110,86,0.45)',
    tag: 'ETL Pipeline',
    tagBg: 'rgba(15,110,86,0.18)',
    tagColor: '#6EE7B7',
    stat: '1,432 Jobs',
    statLabel: 'Processed',
  },
  {
    key: 'bip_reporting' as ToolKey,
    path: '/bip-reporting',
    title: 'BIP Reporting',
    subtitle: 'ETL Performance & Audit Reports',
    description:
      'Monitor ETL throughput, data quality scores, and schema drift events. Generate Oracle BIP-compatible reports in PDF or CSV format for audit compliance.',
    icon: BarChart3,
    decorIcon: TrendingUp,
    accentColor: '#BA7517',
    gradientFrom: '#6B3F05',
    gradientTo: '#BA7517',
    glowColor: 'rgba(186,117,23,0.45)',
    tag: 'Analytics',
    tagBg: 'rgba(186,117,23,0.18)',
    tagColor: '#FCD34D',
    stat: '98.7%',
    statLabel: 'Pass Rate',
  },
  {
    key: 'payroll' as ToolKey,
    path: '/payroll',
    title: 'Payroll Reconciliation',
    subtitle: 'Pre/Post Migration Record Matching',
    description:
      'Compare pre and post-migration payroll records at field level. Surface discrepancies, flag sensitive exceptions, and achieve match rate targets.',
    icon: Wallet,
    decorIcon: Receipt,
    accentColor: '#993C1D',
    gradientFrom: '#5C1F0D',
    gradientTo: '#993C1D',
    glowColor: 'rgba(153,60,29,0.45)',
    tag: 'Reconciliation',
    tagBg: 'rgba(153,60,29,0.18)',
    tagColor: '#FCA5A5',
    stat: '96.2%',
    statLabel: 'Match Rate',
  },
];

export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const visibleTools = DASHBOARD_TOOLS.filter(tool =>
    user?.role !== 'admin' && user?.role !== 'Admin' && user?.tool_access?.includes(tool.key)
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0A0F1C] relative overflow-hidden transition-colors">
      {/* Ambient background orbs */}
      <div
        className="pointer-events-none absolute -top-64 -left-64 h-[600px] w-[600px] rounded-full opacity-15 dark:opacity-20"
        style={{ background: 'radial-gradient(circle, #185FA5 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-64 -right-64 h-[600px] w-[600px] rounded-full opacity-10 dark:opacity-15"
        style={{ background: 'radial-gradient(circle, #0F6E56 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[900px] w-[900px] rounded-full opacity-[0.04] dark:opacity-5"
        style={{ background: 'radial-gradient(circle, #BA7517 0%, transparent 70%)' }}
      />

      <div className="relative z-10 max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 py-10 lg:py-14">

        {/* Header */}
        <div className="mb-10 lg:mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/75 px-3 py-1.5 mb-5 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-slate-600 tracking-wide uppercase dark:text-white/60">MigrateOS Platform</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white leading-tight">
            Hi, <span className="bg-gradient-to-r from-[#60A5FA] to-[#34D399] bg-clip-text text-transparent">{firstName}</span> 👋
          </h1>
          <p className="mt-3 text-base sm:text-lg text-slate-600 dark:text-white/50 max-w-xl">
            Welcome to the ERP Migration Platform. Choose a tool below to get started.
          </p>
        </div>

        {/* Tool Tiles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
          {visibleTools.map((tool) => {
            const Icon = tool.icon;
            const DecorIcon = tool.decorIcon;
            return (
              <Link
                key={tool.path}
                to={tool.path}
                className="group relative block rounded-2xl overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5]/40 dark:focus-visible:ring-white/40"
                style={{ '--glow': tool.glowColor } as React.CSSProperties}
              >
                {/* Card gradient background */}
                <div
                  className="absolute inset-0 opacity-90 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background: `linear-gradient(145deg, ${tool.gradientFrom} 0%, ${tool.gradientTo} 100%)`,
                  }}
                />

                {/* Noise texture overlay */}
                <div
                  className="absolute inset-0 opacity-[0.03]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                  }}
                />

                {/* Glow border on hover */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ boxShadow: `inset 0 0 0 1px ${tool.accentColor}55, 0 0 40px ${tool.glowColor}` }}
                />

                {/* Decorative large background icon */}
                <div
                  className="absolute -bottom-6 -right-6 opacity-[0.07] group-hover:opacity-[0.12] transition-all duration-500 group-hover:scale-110"
                  style={{ color: tool.accentColor }}
                >
                  <DecorIcon size={180} strokeWidth={1} />
                </div>

                {/* Card content */}
                <div className="relative z-10 p-7 lg:p-8 flex flex-col h-full min-h-[260px]">

                  {/* Top row: icon + tag */}
                  <div className="flex items-start justify-between mb-6">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.12)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.15)',
                      }}
                    >
                      <Icon size={22} className="text-white" strokeWidth={1.75} />
                    </div>

                    {/* Stat badge */}
                    <div
                      className="text-right"
                      style={{ color: tool.tagColor }}
                    >
                      <div className="text-xl font-bold tabular-nums leading-none">{tool.stat}</div>
                      <div className="text-xs opacity-70 mt-0.5">{tool.statLabel}</div>
                    </div>
                  </div>

                  {/* Title & subtitle */}
                  <div className="flex-1">
                    <div
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold mb-3 tracking-wide"
                      style={{ backgroundColor: tool.tagBg, color: tool.tagColor }}
                    >
                      {tool.tag}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-1.5 leading-snug">
                      {tool.title}
                    </h2>
                    <p className="text-sm font-medium mb-3" style={{ color: tool.tagColor }}>
                      {tool.subtitle}
                    </p>
                    <p className="text-sm text-white/55 leading-relaxed line-clamp-2">
                      {tool.description}
                    </p>
                  </div>

                  {/* CTA row */}
                  <div className="mt-6 flex items-center gap-2">
                    <span
                      className="text-sm font-semibold transition-all duration-300 group-hover:mr-1"
                      style={{ color: tool.tagColor }}
                    >
                      Open Tool
                    </span>
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full transition-all duration-300 group-hover:translate-x-1"
                      style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                    >
                      <ArrowRight size={13} className="text-white" />
                    </div>

                    {/* Animated underline */}
                    <div
                      className="ml-auto h-px flex-1 max-w-[80px] transition-all duration-500 opacity-0 group-hover:opacity-40"
                      style={{ background: `linear-gradient(to right, transparent, ${tool.accentColor})` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {visibleTools.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white/75 px-6 py-10 text-center shadow-sm dark:border-white/10 dark:bg-white/5">
            <ShieldCheck size={32} className="mx-auto text-slate-400 dark:text-white/35 mb-3" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">No tools assigned</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-white/50">
              Ask an administrator to assign access from the Admin Control Panel.
            </p>
          </div>
        )}

        {/* Footer note */}
        <p className="mt-10 text-center text-xs text-slate-500 dark:text-white/25">
          MigrateOS Enterprise Data Migration Platform · All sessions are monitored and logged.
        </p>
      </div>
    </div>
  );
}
