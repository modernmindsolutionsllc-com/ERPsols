import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { ArrowRightLeft, BarChart3, Wallet, Zap, Crown, Check, Sparkles, Camera } from 'lucide-react';
import type { ToolKey } from '@/types';

const ALL_FEATURES: { toolKey: ToolKey; icon: React.ElementType; label: string; desc: string; color: string; bg: string }[] = [
  {
    toolKey: 'config_snapshot',
    icon: Camera,
    label: 'Config Snapshot',
    desc: 'Capture & compare ERP config states',
    color: '#6366F1',
    bg: 'rgba(99,102,241,0.12)',
  },
  {
    toolKey: 'data_conversion',
    icon: ArrowRightLeft,
    label: 'Data Conversion',
    desc: 'Full ETL pipeline access',
    color: '#10B981',
    bg: 'rgba(16,185,129,0.12)',
  },
  {
    toolKey: 'bip_reporting',
    icon: BarChart3,
    label: 'BIP Reporting',
    desc: 'Advanced analytics & audits',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.12)',
  },
  {
    toolKey: 'payroll',
    icon: Wallet,
    label: 'Payroll Reconciliation',
    desc: 'Pre/post migration matching',
    color: '#EF4444',
    bg: 'rgba(239,68,68,0.12)',
  },
];

const SESSION_KEY = 'migrateos_sub_shown';

interface SubscribeModalProps {
  /** Controlled open state from navbar button */
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}

/**
 * SubscribeModal — Premium Enterprise upsell
 * Auto-triggers ONCE per session for "user" role on first login.
 * Can also be opened on demand via externalOpen prop.
 */
export function SubscribeModal({ externalOpen, onExternalOpenChange }: SubscribeModalProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Auto-show once per session after first login
  useEffect(() => {
    if (user?.role !== 'user') return;
    if (sessionStorage.getItem(SESSION_KEY)) return; // already shown this session
    const timer = setTimeout(() => {
      setOpen(true);
      sessionStorage.setItem(SESSION_KEY, '1');
    }, 800);
    return () => clearTimeout(timer);
  }, [user?.role]); // only re-run if role changes (i.e. fresh login)

  // Sync with external open signal (navbar button)
  useEffect(() => {
    if (externalOpen !== undefined) setOpen(externalOpen);
  }, [externalOpen]);

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    onExternalOpenChange?.(val);
  };

  if (user?.role !== 'user') return null;

  // Only show tools the user does NOT already have access to
  const features = ALL_FEATURES.filter(
    f => !user?.tool_access?.includes(f.toolKey)
  );

  // Nothing to upsell — all tools granted
  if (features.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[720px] p-0 overflow-hidden border-0 shadow-2xl rounded-2xl"
        showCloseButton={false}
      >
        <div className="flex flex-col sm:flex-row min-h-[320px]">

          {/* ─── Left: Gradient Brand Panel ─── */}
          <div
            className="relative sm:w-[280px] shrink-0 p-7 flex flex-col justify-between overflow-hidden"
            style={{
              background: 'linear-gradient(145deg, #1E3A8A 0%, #6D28D9 55%, #A855F7 100%)',
            }}
          >
            {/* Decorative orbs */}
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/[0.06] blur-xl" />
            <div className="absolute bottom-6 -left-8 w-28 h-28 rounded-full bg-purple-400/10 blur-lg" />
            <div className="absolute top-1/2 right-4 w-3 h-3 rounded-full bg-amber-300/40 animate-pulse" />
            <div className="absolute top-8 right-12 w-2 h-2 rounded-full bg-cyan-300/50 animate-pulse" style={{ animationDelay: '1s' }} />

            <div className="relative z-10">
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-[10px] font-semibold tracking-wider text-amber-200 uppercase mb-5">
                <Sparkles size={10} />
                Enterprise Tier
              </div>

              <div className="w-14 h-14 bg-gradient-to-br from-amber-300 to-orange-400 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-amber-500/20">
                <Crown size={26} className="text-white drop-shadow" />
              </div>

              <h2 className="text-[22px] font-bold text-white leading-tight tracking-tight">
                Unlock Enterprise<br />Power 🚀
              </h2>
              <p className="text-white/60 text-[13px] leading-relaxed mt-2.5">
                Supercharge your migration workflow with the full ERP toolkit.
              </p>
            </div>

            {/* Social proof pill */}
            <div className="relative z-10 mt-6 flex items-center gap-2">
              <div className="flex -space-x-1.5">
                {['#3B82F6', '#10B981', '#F59E0B'].map((c, i) => (
                  <div
                    key={i}
                    className="w-6 h-6 rounded-full border-2 border-[#1E3A8A] flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ backgroundColor: c }}
                  >
                    {['A', 'J', 'K'][i]}
                  </div>
                ))}
              </div>
              <span className="text-[11px] text-white/50">
                Trusted by <span className="text-white/80 font-semibold">120+</span> teams
              </span>
            </div>
          </div>

          {/* ─── Right: Features + CTA ─── */}
          <div className="flex-1 bg-white p-7 flex flex-col justify-between">
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer z-20"
            >
              <span className="text-lg leading-none">&times;</span>
            </button>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#94A3B8] mb-4">
                Everything you need
              </p>

              <div className="space-y-2.5">
                {features.map((feat) => {
                  const Icon = feat.icon;
                  return (
                    <div
                      key={feat.label}
                      className="group flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-purple-200 hover:bg-purple-50/30 transition-all duration-200"
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                        style={{ backgroundColor: feat.bg, color: feat.color }}
                      >
                        <Icon size={17} strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-[#0F172A]">
                          {feat.label}
                        </p>
                        <p className="text-[11px] text-[#94A3B8]">{feat.desc}</p>
                      </div>
                      <Check size={14} className="text-emerald-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="mt-6 space-y-2.5">
              <button
                onClick={() => setOpen(false)}
                className="group w-full relative h-11 rounded-xl text-white text-sm font-semibold shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-300 cursor-pointer overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #6D28D9 0%, #A855F7 50%, #7C3AED 100%)',
                }}
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="relative inline-flex items-center gap-1.5">
                  <Zap size={15} />
                  Upgrade to Enterprise
                </span>
              </button>

              <button
                onClick={() => setOpen(false)}
                className="w-full h-9 rounded-xl text-[13px] font-medium text-[#94A3B8] hover:text-[#64748B] hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
