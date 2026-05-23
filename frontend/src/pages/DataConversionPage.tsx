/**
 * DataConversionPage.tsx
 * ─────────────────────
 * 3-tier drill-down state machine for the Data Conversion Tool (ETL Pipeline).
 *
 *   Level 1 — Module grid       (selectedModule = null)
 *   Level 2 — Business Objects  (selectedModule set, selectedObject = null)
 *   Level 3 — UniversalETLScreen (both set)
 */

import { useState } from 'react';
import { DATA_LOADER_CONFIG, type ModuleConfig, type BusinessObject } from '@/config/dataLoaderConfig';
import { UniversalETLScreen } from '@/components/UniversalETLScreen';
import {
  ArrowRightLeft, ShieldCheck, Layers, Cpu,
  ArrowRight, ArrowLeft, Lock, UserPlus, CheckCircle2, Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ═══════════════════════════════════════════════════════════════════════════════
//  WELCOME BANNER
// ═══════════════════════════════════════════════════════════════════════════════

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
              Select a module below, then drill into its business objects to upload, validate, preview, and load .xlsx data into Oracle HCM Cloud.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            { icon: Layers, label: 'Extract & Upload' },
            { icon: ShieldCheck, label: 'Validate & Preview' },
            { icon: Cpu, label: 'Load to Oracle' },
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

// ═══════════════════════════════════════════════════════════════════════════════
//  LEVEL 1 — MODULE GRID
// ═══════════════════════════════════════════════════════════════════════════════

function ModuleGrid({ onSelect }: { onSelect: (mod: ModuleConfig) => void }) {
  return (
    <>
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            Select a Module
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Choose an Oracle HCM module to begin the data conversion process.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className="gap-2 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <UserPlus size={15} />
            Add user
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <CheckCircle2 size={15} />
            Validate catalog
          </Button>
          <Button
            variant="default"
            className="gap-2 bg-[#185FA5] hover:bg-[#124A82] text-white"
          >
            <Download size={15} />
            Download data templates
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        {DATA_LOADER_CONFIG.map((mod) => {
          const Icon = mod.icon;
          const isEmpty = mod.objects.length === 0;
          return (
            <button
              key={mod.key}
              onClick={() => !isEmpty && onSelect(mod)}
              disabled={isEmpty}
              className={`group relative text-left rounded-xl overflow-hidden transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 w-full sm:w-[calc(50%-8px)] md:w-[calc(33.333%-12px)] lg:w-[calc(25%-12px)] min-w-[270px] max-w-[310px] ${
                isEmpty
                  ? 'opacity-60 cursor-not-allowed'
                  : 'hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/20 hover:-translate-y-0.5'
              }`}
            >
              {/* Card gradient background */}
              <div
                className="absolute inset-0 opacity-90 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: `linear-gradient(145deg, ${mod.gradientFrom} 0%, ${mod.gradientTo} 100%)`,
                }}
              />
              {/* Noise texture */}
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                }}
              />
              {/* Glow */}
              <div
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ boxShadow: `inset 0 0 0 1px ${mod.accentColor}55` }}
              />
              {/* Decorative icon */}
              <div className="absolute -bottom-3 -right-3 opacity-[0.08] group-hover:opacity-[0.14] transition-opacity duration-500">
                <Icon size={100} strokeWidth={0.8} className="text-white" />
              </div>

              <div className="relative z-10 p-5 min-h-[160px] flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.15)',
                    }}
                  >
                    <Icon size={20} className="text-white" strokeWidth={1.75} />
                  </div>
                  {isEmpty && (
                    <div className="flex items-center gap-1 text-[10px] font-medium text-white/40 bg-white/10 rounded-full px-2 py-0.5">
                      <Lock size={9} /> Coming Soon
                    </div>
                  )}
                  {!isEmpty && (
                    <div
                      className="text-[11px] font-bold rounded-full px-2 py-0.5"
                      style={{ background: `${mod.accentColor}40`, color: mod.tagColor }}
                    >
                      {mod.objects.length} {mod.objects.length === 1 ? 'Object' : 'Objects'}
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <h3 className="text-base font-bold text-white mb-1">{mod.label}</h3>
                  <p className="text-xs text-white/50 leading-relaxed line-clamp-2">{mod.description}</p>
                </div>

                {!isEmpty && (
                  <div className="mt-4 flex items-center gap-1.5">
                    <span className="text-xs font-semibold transition-all duration-300 group-hover:mr-0.5" style={{ color: mod.tagColor }}>
                      Explore
                    </span>
                    <div
                      className="flex h-5 w-5 items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5"
                      style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                    >
                      <ArrowRight size={10} className="text-white" />
                    </div>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LEVEL 2 — BUSINESS OBJECTS GRID
// ═══════════════════════════════════════════════════════════════════════════════

function BusinessObjectGrid({
  module: mod,
  onSelect,
  onBack,
}: {
  module: ModuleConfig;
  onSelect: (obj: BusinessObject) => void;
  onBack: () => void;
}) {
  const ModIcon = mod.icon;

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors mb-5 group"
      >
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
        Back to Modules
      </button>

      {/* Module header card */}
      <div
        className="relative overflow-hidden rounded-xl mb-6"
        style={{ background: `linear-gradient(135deg, ${mod.gradientFrom} 0%, ${mod.gradientTo} 100%)` }}
      >
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
        <div className="pointer-events-none absolute -bottom-3 -right-3 opacity-10">
          <ModIcon size={120} strokeWidth={0.8} className="text-white" />
        </div>
        <div className="relative z-10 px-6 py-5 flex items-center gap-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <ModIcon size={20} className="text-white" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">{mod.label}</h2>
            <p className="text-xs text-white/50 mt-0.5">{mod.objects.length} business objects available</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mod.objects.map((obj) => {
          const ObjIcon = obj.icon;
          return (
            <button
              key={obj.key}
              onClick={() => onSelect(obj)}
              className="group relative text-left bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-xl p-5 transition-all duration-200 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-white/20 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110"
                  style={{ background: `${mod.accentColor}15`, border: `1px solid ${mod.accentColor}25` }}
                >
                  <ObjIcon size={18} style={{ color: mod.accentColor }} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1 truncate">
                    {obj.label}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                    {obj.description}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5">
                <span className="text-xs font-semibold transition-all duration-300 group-hover:mr-0.5" style={{ color: mod.accentColor }}>
                  Open Upload
                </span>
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5"
                  style={{ backgroundColor: `${mod.accentColor}15` }}
                >
                  <ArrowRight size={10} style={{ color: mod.accentColor }} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE — STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════════

export function DataConversionPage() {
  const [selectedModule, setSelectedModule] = useState<ModuleConfig | null>(null);
  const [selectedObject, setSelectedObject] = useState<BusinessObject | null>(null);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-250">
      {/* Always show the welcome banner at Level 1 */}
      {!selectedModule && <ToolWelcomeBanner />}

      {/* Level 1: Module Grid */}
      {!selectedModule && (
        <ModuleGrid onSelect={(mod) => setSelectedModule(mod)} />
      )}

      {/* Level 2: Business Objects */}
      {selectedModule && !selectedObject && (
        <BusinessObjectGrid
          module={selectedModule}
          onSelect={(obj) => setSelectedObject(obj)}
          onBack={() => setSelectedModule(null)}
        />
      )}

      {/* Level 3: Universal ETL Screen */}
      {selectedModule && selectedObject && (
        <UniversalETLScreen
          module={selectedModule}
          object={selectedObject}
          onBack={() => setSelectedObject(null)}
        />
      )}
    </div>
  );
}
