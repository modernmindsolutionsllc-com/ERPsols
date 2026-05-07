import { useState } from 'react';
import { etlApi } from '@/services/api';
import { usePermission } from '@/hooks/usePermission';
import { usePoll } from '@/hooks/usePoll';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ProgressBarPulse } from '@/components/shared/ProgressBarPulse';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import { hasError } from '@/services/api';
import {
  Play, X, Download, ArrowRightLeft, CheckCircle2, Clock,
  ShieldCheck, Layers, Cpu,
} from 'lucide-react';

const ETL_STEPS = ['Extract', 'Transform', 'Validate', 'Verify', 'Load'];

function ToolWelcomeBanner() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl mb-8"
      style={{ background: 'linear-gradient(135deg, #073D30 0%, #0A5A43 50%, #0F6E56 100%)' }}
    >
      <div
        className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full opacity-25"
        style={{ background: 'radial-gradient(circle, #6EE7B7 0%, transparent 70%)' }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="pointer-events-none absolute -bottom-4 -right-4 opacity-10">
        <ShieldCheck size={180} strokeWidth={0.8} className="text-white" />
      </div>

      <div className="relative z-10 px-7 py-8 lg:px-10 lg:py-10">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <ArrowRightLeft size={26} className="text-white" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold mb-2 tracking-wide"
              style={{ background: 'rgba(110,231,183,0.15)', color: '#6EE7B7' }}
            >
              ETL Pipeline
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              Data Conversion Tool
            </h1>
            <p className="mt-1 text-sm sm:text-base font-medium" style={{ color: '#6EE7B7' }}>
              Validation &amp; Verification Engine
            </p>
            <p className="mt-2 text-sm text-white/55 max-w-2xl leading-relaxed">
              Run end-to-end ETL pipelines — Extract, Transform, Validate, Verify, and Load. Ensure data integrity and completeness before committing to the target system.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            { icon: Layers, label: 'Extract & Transform' },
            { icon: ShieldCheck, label: 'Validate & Verify' },
            { icon: Cpu, label: 'Live Progress Tracking' },
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

export function DataConversionPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [source, setSource] = useState('Legacy HR');
  const [target, setTarget] = useState('Modern HRIS');
  const [jobName, setJobName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canRun = usePermission('run_etl');

  const { data: jobsData, loading: jobsLoading } = usePoll(
    async () => {
      const res = await etlApi.getJobs();
      return res.data;
    },
    3000,
    true
  );

  const jobs = jobsData || [];
  const activeJobs = jobs.filter(j => j.status === 'running' || j.status === 'pending');
  const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed');

  async function handleRunJob(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await etlApi.runJob(source, target, jobName || undefined);
    if (hasError(res)) {
      toast.error(res.error.message);
    } else {
      toast.success(`ETL job ${res.data.id} started`);
      setModalOpen(false);
      setJobName('');
    }
    setSubmitting(false);
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-250">
      <ToolWelcomeBanner />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#0F172A] tracking-tight">ETL Jobs</h2>
          <p className="text-sm text-[#64748B] mt-0.5">Extract → Transform → Validate → Verify → Load</p>
        </div>
        {canRun && (
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F6E56] hover:bg-[#0A5543] text-white text-sm font-medium rounded-md transition-colors"
          >
            <Play size={16} />
            Run ETL Job
          </button>
        )}
      </div>

      {/* ETL Stepper */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between max-w-[800px] mx-auto">
          {ETL_STEPS.map((step, i) => {
            // Determine step state based on active jobs
            const hasRunning = activeJobs.length > 0;
            const stepStatus = hasRunning
              ? i < 2 ? 'completed' : i === 2 ? 'active' : 'pending'
              : completedJobs.length > 0
                ? 'completed'
                : 'pending';

            return (
              <div key={step} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-all duration-300
                      ${stepStatus === 'completed'
                        ? 'bg-[#0F6E56] border-[#0F6E56] text-white'
                        : stepStatus === 'active'
                          ? 'border-[#0F6E56] text-[#0F6E56] animate-pulse'
                          : 'border-[#E2E8F0] text-[#94A3B8]'
                      }`}
                    style={stepStatus === 'active' ? { boxShadow: '0 0 0 4px rgba(15,110,86,0.15)' } : {}}
                  >
                    {stepStatus === 'completed' ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <span className={`text-xs mt-2 font-medium ${stepStatus === 'completed' ? 'text-[#0F6E56]' : stepStatus === 'active' ? 'text-[#0F6E56]' : 'text-[#94A3B8]'}`}>
                    {step}
                  </span>
                </div>
                {i < ETL_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 transition-colors duration-300 ${stepStatus === 'completed' ? 'bg-[#0F6E56]' : 'bg-[#E2E8F0]'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Jobs */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-[#0F172A]">Active Jobs</h2>
        </div>
        {jobsLoading && activeJobs.length === 0 ? (
          <div className="p-4">
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          </div>
        ) : activeJobs.length === 0 ? (
          <EmptyState
            icon={<ArrowRightLeft size={48} />}
            title="No active ETL jobs"
            description="Start an ETL job to begin migration."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F3F4F6]">
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Job ID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Progress</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {activeJobs.map(job => (
                  <tr key={job.id} className="hover:bg-[#EAF2FB] transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-[#0F172A]">{job.id}</td>
                    <td className="px-4 py-3 w-[280px]">
                      <ProgressBarPulse value={job.progress} status={job.status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status === 'running' ? 'Running' : 'Pending'} pulse={job.status === 'running'} />
                    </td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{new Date(job.startedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Completed Jobs */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-[#0F172A]">Completed Jobs</h2>
        </div>
        {completedJobs.length === 0 ? (
          <EmptyState
            icon={<Clock size={48} />}
            title="No completed jobs yet"
            description="Completed ETL jobs will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F3F4F6]">
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Job ID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Source → Target</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Records</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Duration</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Status</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {completedJobs.map(job => (
                  <tr key={job.id} className="hover:bg-[#EAF2FB] transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-[#0F172A]">{job.id}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{job.source} → {job.target}</td>
                    <td className="px-4 py-3 text-sm text-[#0F172A]">{new Intl.NumberFormat().format(job.recordsProcessed || 0)}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{job.duration || '-'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status === 'completed' ? 'Completed' : 'Failed'} />
                    </td>
                    <td className="px-4 py-3">
                      <button className="p-1.5 hover:bg-gray-100 rounded text-[#64748B] hover:text-[#185FA5] transition-colors">
                        <Download size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Run ETL Job Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/45" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-xl p-6 w-full max-w-[480px] mx-4 shadow-xl" style={{ animation: 'scale-in 200ms ease-out' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#0F172A]">Configure ETL Job</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} className="text-[#64748B]" />
              </button>
            </div>
            <form onSubmit={handleRunJob} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Source System</label>
                <select
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-[#E2E8F0] text-sm focus:outline-none focus:border-[#185FA5] focus:ring-3 focus:ring-[rgba(24,95,165,0.15)] bg-white"
                >
                  <option>Legacy HR</option>
                  <option>Legacy Payroll</option>
                  <option>Legacy CRM</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Target System</label>
                <select
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-[#E2E8F0] text-sm focus:outline-none focus:border-[#185FA5] focus:ring-3 focus:ring-[rgba(24,95,165,0.15)] bg-white"
                >
                  <option>Modern HRIS</option>
                  <option>Modern Payroll</option>
                  <option>Data Lake</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Job Name <span className="text-[#94A3B8] font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={jobName}
                  onChange={e => setJobName(e.target.value)}
                  placeholder={`ETL-${Date.now()}`}
                  className="w-full h-10 px-3 rounded-md border border-[#E2E8F0] text-sm focus:outline-none focus:border-[#185FA5] focus:ring-3 focus:ring-[rgba(24,95,165,0.15)]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-gray-50 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#0F6E56] hover:bg-[#0A5543] text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Starting...' : 'Start Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
