import { useState, useEffect } from 'react';
import { reportingApi } from '@/services/api';
import { usePermission } from '@/hooks/usePermission';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonTable } from '@/components/shared/SkeletonTable';
import { toast } from 'sonner';
import { hasError } from '@/services/api';
import type { Report } from '@/types';
import {
  BarChart3, X, Download, TrendingUp, FileText, Activity,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

function ToolWelcomeBanner() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl mb-8"
      style={{ background: 'linear-gradient(135deg, #6B3F05 0%, #9C5A0A 50%, #BA7517 100%)' }}
    >
      <div
        className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full opacity-25"
        style={{ background: 'radial-gradient(circle, #FCD34D 0%, transparent 70%)' }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="pointer-events-none absolute -bottom-4 -right-4 opacity-10">
        <TrendingUp size={180} strokeWidth={0.8} className="text-white" />
      </div>

      <div className="relative z-10 px-7 py-8 lg:px-10 lg:py-10">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <BarChart3 size={26} className="text-white" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold mb-2 tracking-wide"
              style={{ background: 'rgba(252,211,77,0.15)', color: '#FCD34D' }}
            >
              Analytics
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              BIP Reporting Tool
            </h1>
            <p className="mt-1 text-sm sm:text-base font-medium" style={{ color: '#FCD34D' }}>
              ETL Performance &amp; Audit Reports
            </p>
            <p className="mt-2 text-sm text-white/55 max-w-2xl leading-relaxed">
              Monitor ETL throughput, data quality scores, and schema drift events. Generate Oracle BIP-compatible reports in PDF or CSV format for compliance audits.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            { icon: Activity, label: 'ETL Performance Metrics' },
            { icon: FileText, label: 'PDF & CSV Export' },
            { icon: TrendingUp, label: 'Data Quality Trends' },
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

const performanceData = [
  { day: 'Mon', duration: 4.2 },
  { day: 'Tue', duration: 3.8 },
  { day: 'Wed', duration: 5.1 },
  { day: 'Thu', duration: 4.5 },
  { day: 'Fri', duration: 3.2 },
  { day: 'Sat', duration: 6.1 },
  { day: 'Sun', duration: 4.8 }
];

const qualityData = [
  { name: 'Pass', value: 98.7, color: '#0F6E56' },
  { name: 'Warning', value: 0.8, color: '#BA7517' },
  { name: 'Fail', value: 0.5, color: '#993C1D' }
];

export function BIPReportingPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [format, setFormat] = useState<'PDF' | 'CSV'>('PDF');
  const [submitting, setSubmitting] = useState(false);
  const canGenerate = usePermission('run_bip_report');

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);
    const res = await reportingApi.getReports();
    setReports(res.data);
    setLoading(false);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const range = dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : 'Last 7 days';
    const res = await reportingApi.generateReport(range, [], format);
    if (hasError(res)) {
      toast.error(res.error.message);
    } else {
      toast.success('Report generation started');
      setTimeout(() => {
        toast.success('Report ready for download');
        loadReports();
      }, 2000);
      setModalOpen(false);
    }
    setSubmitting(false);
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-250">
      <ToolWelcomeBanner />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#0F172A] tracking-tight">Reports &amp; Analytics</h2>
          <p className="text-sm text-[#64748B] mt-0.5">ETL performance and data quality reports.</p>
        </div>
        {canGenerate && (
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#BA7517] hover:bg-[#946012] text-white text-sm font-medium rounded-md transition-colors"
          >
            <BarChart3 size={16} />
            Generate Report
          </button>
        )}
      </div>

      {/* Two panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* ETL Performance */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-6">
          <h2 className="text-base font-semibold text-[#0F172A] mb-4">ETL Performance</h2>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <div className="text-xs text-[#64748B] uppercase tracking-wider font-medium">Avg Duration</div>
              <div className="text-lg font-semibold text-[#0F172A] mt-1">4m 32s</div>
            </div>
            <div>
              <div className="text-xs text-[#64748B] uppercase tracking-wider font-medium">Throughput</div>
              <div className="text-lg font-semibold text-[#0F172A] mt-1">14,200/min</div>
            </div>
            <div>
              <div className="text-xs text-[#64748B] uppercase tracking-wider font-medium">Failure Rate</div>
              <div className="text-lg font-semibold text-[#0F172A] mt-1">0.8%</div>
            </div>
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                />
                <Bar dataKey="duration" fill="#BA7517" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Data Quality */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-6">
          <h2 className="text-base font-semibold text-[#0F172A] mb-4">Data Quality</h2>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <div className="text-xs text-[#64748B] uppercase tracking-wider font-medium">Pass Rate</div>
              <div className="text-lg font-semibold text-[#0F6E56] mt-1">98.7%</div>
            </div>
            <div>
              <div className="text-xs text-[#64748B] uppercase tracking-wider font-medium">Schema Drift</div>
              <div className="text-lg font-semibold text-[#BA7517] mt-1">2 events</div>
            </div>
            <div>
              <div className="text-xs text-[#64748B] uppercase tracking-wider font-medium">Duplicates</div>
              <div className="text-lg font-semibold text-[#993C1D] mt-1">14 records</div>
            </div>
          </div>
          <div className="h-[180px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={qualityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {qualityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Past Reports */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-[#0F172A]">Past Reports</h2>
        </div>
        {loading ? (
          <div className="p-4">
            <SkeletonTable columns={5} rows={3} />
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            icon={<BarChart3 size={48} />}
            title="No reports generated yet"
            description="Generate your first report to see ETL performance and data quality metrics."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F3F4F6]">
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Report ID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Date Range</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Generated</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Format</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {reports.map(report => (
                  <tr key={report.id} className="hover:bg-[#EAF2FB] transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-[#0F172A]">{report.id}</td>
                    <td className="px-4 py-3 text-sm text-[#0F172A]">{report.type}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{report.dateRange}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{new Date(report.generatedAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={report.format} />
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

      {/* Generate Report Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/45" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-xl p-6 w-full max-w-[480px] mx-4 shadow-xl" style={{ animation: 'scale-in 200ms ease-out' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#0F172A]">Generate BIP Report</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} className="text-[#64748B]" />
              </button>
            </div>
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1.5">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-[#E2E8F0] text-sm focus:outline-none focus:border-[#185FA5] focus:ring-3 focus:ring-[rgba(24,95,165,0.15)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1.5">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-[#E2E8F0] text-sm focus:outline-none focus:border-[#185FA5] focus:ring-3 focus:ring-[rgba(24,95,165,0.15)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Format</label>
                <div className="flex gap-2">
                  {(['PDF', 'CSV'] as const).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f)}
                      className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors
                        ${format === f ? 'bg-[#185FA5] text-white border-[#185FA5]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-gray-50'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
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
                  className="px-4 py-2 bg-[#BA7517] hover:bg-[#946012] text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
