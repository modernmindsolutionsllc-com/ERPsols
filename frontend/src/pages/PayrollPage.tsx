import { useState, useEffect } from 'react';
import { payrollApi } from '@/services/api';
import { usePermission } from '@/hooks/usePermission';
import { MetricCard } from '@/components/shared/MetricCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataReveal } from '@/components/shared/DataReveal';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonTable } from '@/components/shared/SkeletonTable';
import { toast } from 'sonner';
import { hasError } from '@/services/api';
import type { PayrollException } from '@/types';
import {
  Play, Download, CheckCircle2, Users, AlertTriangle, TrendingUp,
  Receipt, GitCompare, ShieldAlert,
} from 'lucide-react';

function ToolWelcomeBanner() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl mb-8"
      style={{ background: 'linear-gradient(135deg, #5C1F0D 0%, #7A2F15 50%, #993C1D 100%)' }}
    >
      <div
        className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full opacity-25"
        style={{ background: 'radial-gradient(circle, #FCA5A5 0%, transparent 70%)' }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="pointer-events-none absolute -bottom-4 -right-4 opacity-10">
        <Receipt size={180} strokeWidth={0.8} className="text-white" />
      </div>

      <div className="relative z-10 px-7 py-8 lg:px-10 lg:py-10">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <Receipt size={26} className="text-white" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold mb-2 tracking-wide"
              style={{ background: 'rgba(252,165,165,0.15)', color: '#FCA5A5' }}
            >
              Reconciliation
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              Payroll Reconciliation Tool
            </h1>
            <p className="mt-1 text-sm sm:text-base font-medium" style={{ color: '#FCA5A5' }}>
              Pre/Post Migration Record Matching
            </p>
            <p className="mt-2 text-sm text-white/55 max-w-2xl leading-relaxed">
              Compare pre and post-migration payroll records at field level. Surface discrepancies, flag sensitive exceptions, and achieve your target match rate.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            { icon: GitCompare, label: 'Field-Level Comparison' },
            { icon: ShieldAlert, label: 'Sensitive Data Masking' },
            { icon: Users, label: 'Employee Record Tracking' },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <Icon size={11} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PayrollPage() {
  const [exceptions, setExceptions] = useState<PayrollException[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const canRun = usePermission('run_reconciliation');
  const canResolve = usePermission('run_reconciliation');

  useEffect(() => {
    void loadExceptions();
  }, []);

  async function loadExceptions() {
    setLoading(true);
    const res = await payrollApi.getExceptions();
    setExceptions(res.data);
    setLoading(false);
  }

  async function handleReconcile() {
    setReconciling(true);
    const res = await payrollApi.runReconciliation();
    if (hasError(res)) {
      toast.error(res.error.message);
    } else {
      toast.success(`Reconciliation complete: ${res.data.matchRate}% match rate`);
      void loadExceptions();
    }
    setReconciling(false);
  }

  async function handleResolve(id: string) {
    const res = await payrollApi.resolveException(id);
    if (hasError(res)) {
      toast.error(res.error.message);
    } else {
      toast.success(`Exception ${id} marked as resolved`);
      void loadExceptions();
    }
  }

  const openCount = exceptions.filter(e => e.status === 'Open').length;
  const reviewCount = exceptions.filter(e => e.status === 'Under Review').length;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-250">
      <ToolWelcomeBanner />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#0F172A] dark:text-slate-100 tracking-tight">Reconciliation Summary</h2>
          <p className="text-sm text-[#64748B] dark:text-slate-400 mt-0.5">Compare pre/post migration payroll records.</p>
        </div>
        {canRun && (
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#993C1D] hover:bg-[#7A3017] text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            <Play size={16} />
            {reconciling ? 'Running...' : 'Run Reconciliation'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Total Employees"
          value="4,218"
          icon={<Users size={18} />}
          accentColor="#185FA5"
        />
        <MetricCard
          label="Matched Records"
          value="4,058"
          icon={<CheckCircle2 size={18} />}
          accentColor="#0F6E56"
        />
        <MetricCard
          label="Exceptions"
          value={String(openCount + reviewCount)}
          icon={<AlertTriangle size={18} />}
          accentColor="#993C1D"
        />
        <MetricCard
          label="Match Rate"
          value="96.2%"
          change={-1.2}
          icon={<TrendingUp size={18} />}
          accentColor="#0F6E56"
        />
      </div>

      <div className="bg-white dark:bg-slate-950/90 border border-[#E2E8F0] dark:border-white/10 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-white/10 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#0F172A] dark:text-slate-100">Exceptions</h2>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#64748B] dark:text-slate-400 hover:text-[#185FA5] hover:bg-[#EAF2FB] dark:hover:bg-slate-900 rounded-md transition-colors">
            <Download size={14} />
            Export CSV
          </button>
        </div>
        {loading ? (
          <div className="p-4">
            <SkeletonTable columns={6} rows={5} />
          </div>
        ) : exceptions.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={48} />}
            title="No exceptions found"
            description="All payroll records matched successfully between legacy and modern systems."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F3F4F6] dark:bg-slate-900">
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">Employee ID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">Field</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">Legacy Value</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">New Value</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">Status</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-white/10">
                {exceptions.map(exc => (
                  <tr key={exc.id} className="hover:bg-[#EAF2FB] dark:hover:bg-slate-900/70 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-[#0F172A] dark:text-slate-100">{exc.employeeId}</td>
                    <td className="px-4 py-3 text-sm text-[#0F172A] dark:text-slate-100 capitalize">{exc.field.replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <DataReveal value={exc.legacyValue} isSensitive={exc.isSensitive} />
                    </td>
                    <td className="px-4 py-3">
                      <DataReveal value={exc.newValue} isSensitive={exc.isSensitive} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={exc.status} />
                    </td>
                    <td className="px-4 py-3">
                      {canResolve && exc.status !== 'Resolved' && (
                        <button
                          onClick={() => handleResolve(exc.id)}
                          className="p-1.5 hover:bg-[rgba(15,110,86,0.1)] dark:hover:bg-[rgba(15,110,86,0.16)] rounded text-[#64748B] dark:text-slate-400 hover:text-[#0F6E56] transition-colors"
                          title="Mark as resolved"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
