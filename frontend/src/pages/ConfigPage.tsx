import { useState, useEffect } from 'react';
import { configApi } from '@/services/api';
import { usePermission } from '@/hooks/usePermission';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonTable } from '@/components/shared/SkeletonTable';
import { toast } from 'sonner';
import { hasError } from '@/services/api';
import type { Snapshot, SnapshotDiff } from '@/types';
import {
  Plus, Camera, ChevronRight, X, CheckCircle2, AlertCircle, ArrowUp, ArrowDown,
  Database, Globe, GitCompare,
} from 'lucide-react';

function ToolWelcomeBanner() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl mb-8"
      style={{
        background: 'linear-gradient(135deg, #0D3B6E 0%, #1E5FAA 50%, #185FA5 100%)',
      }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full opacity-25"
        style={{ background: 'radial-gradient(circle, #60A5FA 0%, transparent 70%)' }}
      />
      {/* Noise overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      {/* Large decorative icon */}
      <div className="pointer-events-none absolute -bottom-4 -right-4 opacity-10">
        <Database size={180} strokeWidth={0.8} className="text-white" />
      </div>

      <div className="relative z-10 px-7 py-8 lg:px-10 lg:py-10">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <Camera size={26} className="text-white" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold mb-2 tracking-wide"
              style={{ background: 'rgba(147,197,253,0.15)', color: '#93C5FD' }}>
              REST API
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              Config Snapshot
            </h1>
            <p className="mt-1 text-sm sm:text-base font-medium" style={{ color: '#93C5FD' }}>
              REST API Configuration Tracker
            </p>
            <p className="mt-2 text-sm text-white/55 max-w-2xl leading-relaxed">
              Capture live system configurations via REST endpoints. Track configuration changes over time and detect drift before it impacts your ERP migration.
            </p>
          </div>
        </div>

        {/* Feature pills */}
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            { icon: Globe, label: 'REST Endpoint Capture' },
            { icon: GitCompare, label: 'Diff Comparison' },
            { icon: CheckCircle2, label: 'Delta Tracking' },
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

export function ConfigPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  const [diffData, setDiffData] = useState<SnapshotDiff[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const canCreate = usePermission('create_snapshot');

  useEffect(() => {
    loadSnapshots();
  }, []);

  async function loadSnapshots() {
    setLoading(true);
    const res = await configApi.getSnapshots();
    setSnapshots(res.data);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!endpoint.trim()) return;
    setSubmitting(true);
    const res = await configApi.createSnapshot(endpoint, description);
    if (hasError(res)) {
      toast.error(res.error.message);
    } else {
      toast.success('Snapshot job started');
      setModalOpen(false);
      setEndpoint('');
      setDescription('');
      loadSnapshots();
    }
    setSubmitting(false);
  }

  async function handleRowClick(snap: Snapshot) {
    setSelectedSnapshot(snap);
    setDiffLoading(true);
    const res = await configApi.getSnapshotDiff(snap.id);
    setDiffData(res.data);
    setDiffLoading(false);
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-250">
      <ToolWelcomeBanner />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#0F172A] tracking-tight">Snapshots</h2>
          <p className="text-sm text-[#64748B] mt-0.5">Capture and compare system configurations.</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#185FA5] hover:bg-[#124A82] text-white text-sm font-medium rounded-md transition-colors"
          >
            <Plus size={16} />
            New Snapshot
          </button>
        )}
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-4">
            <SkeletonTable columns={5} rows={4} />
          </div>
        ) : snapshots.length === 0 ? (
          <EmptyState
            icon={<Camera size={48} />}
            title="No snapshots yet"
            description="Create a snapshot to capture your current system configuration."
            action={canCreate && (
              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#185FA5] hover:bg-[#124A82] text-white text-sm font-medium rounded-md transition-colors"
              >
                <Plus size={16} />
                New Snapshot
              </button>
            )}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F3F4F6]">
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Snapshot ID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">REST Endpoint</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Timestamp</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Delta</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {snapshots.map(snap => (
                  <tr
                    key={snap.id}
                    className="hover:bg-[#EAF2FB] cursor-pointer transition-colors"
                    onClick={() => handleRowClick(snap)}
                  >
                    <td className="px-4 py-3 font-mono text-sm text-[#0F172A]">{snap.id}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B] truncate max-w-[240px]">{snap.endpoint}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{new Date(snap.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={snap.status} pulse={snap.status === 'Processing'} />
                    </td>
                    <td className="px-4 py-3 text-sm text-[#0F172A]">
                      {snap.delta.added > 0 && <span className="text-[#0F6E56]">+{snap.delta.added}</span>}
                      {snap.delta.removed > 0 && <span className="text-[#993C1D] ml-1">-{snap.delta.removed}</span>}
                      {snap.delta.changed > 0 && <span className="text-[#BA7517] ml-1">~{snap.delta.changed}</span>}
                      {snap.delta.added === 0 && snap.delta.removed === 0 && snap.delta.changed === 0 && (
                        <span className="text-[#94A3B8]">0 changed</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight size={16} className="text-[#94A3B8]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Snapshot Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/45" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-xl p-6 w-full max-w-[560px] mx-4 shadow-xl" style={{ animation: 'scale-in 200ms ease-out' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#0F172A]">Create New Snapshot</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} className="text-[#64748B]" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">REST Endpoint URL</label>
                <input
                  type="url"
                  value={endpoint}
                  onChange={e => setEndpoint(e.target.value)}
                  placeholder="https://api.company.com/v1/config"
                  className="w-full h-10 px-3 rounded-md border border-[#E2E8F0] text-sm focus:outline-none focus:border-[#185FA5] focus:ring-3 focus:ring-[rgba(24,95,165,0.15)]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Description <span className="text-[#94A3B8] font-normal">(optional)</span></label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-md border border-[#E2E8F0] text-sm focus:outline-none focus:border-[#185FA5] focus:ring-3 focus:ring-[rgba(24,95,165,0.15)] resize-none"
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
                  className="px-4 py-2 bg-[#185FA5] hover:bg-[#124A82] text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Snapshot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Diff Slide-over */}
      {selectedSnapshot && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/45" onClick={() => setSelectedSnapshot(null)} />
          <div
            className="relative bg-white w-full max-w-[480px] h-full shadow-xl overflow-auto"
            style={{ animation: 'slide-in-right 250ms cubic-bezier(0.32, 0.72, 0, 1)' }}
          >
            <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-semibold text-[#0F172A]">{selectedSnapshot.id}</h2>
                <p className="text-sm text-[#64748B]">{selectedSnapshot.endpoint}</p>
              </div>
              <button onClick={() => setSelectedSnapshot(null)} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} className="text-[#64748B]" />
              </button>
            </div>
            <div className="p-6">
              {diffLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : diffData.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 size={48} className="text-[#CBD5E1] mx-auto mb-3" />
                  <p className="text-sm text-[#64748B]">No changes detected in this snapshot.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {diffData.map((diff, i) => (
                    <div key={i} className="border border-[#E2E8F0] rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        {diff.type === 'added' && <ArrowUp size={14} className="text-[#0F6E56]" />}
                        {diff.type === 'removed' && <ArrowDown size={14} className="text-[#993C1D]" />}
                        {diff.type === 'changed' && <AlertCircle size={14} className="text-[#BA7517]" />}
                        <span className="text-sm font-medium text-[#0F172A]">{diff.field}</span>
                        <span
                          className="text-xs font-medium px-1.5 py-0.5 rounded capitalize"
                          style={{
                            backgroundColor: diff.type === 'added' ? 'rgba(15,110,86,0.1)' : diff.type === 'removed' ? 'rgba(153,60,29,0.1)' : 'rgba(186,117,23,0.1)',
                            color: diff.type === 'added' ? '#0F6E56' : diff.type === 'removed' ? '#993C1D' : '#BA7517'
                          }}
                        >
                          {diff.type}
                        </span>
                      </div>
                      {diff.oldValue !== null && (
                        <div className="text-sm text-[#64748B] line-through">{String(diff.oldValue)}</div>
                      )}
                      {diff.newValue !== null && (
                        <div className="text-sm font-medium text-[#0F172A]">{String(diff.newValue)}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
