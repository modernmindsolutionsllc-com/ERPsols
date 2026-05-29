/**
 * DataConversionPage.tsx
 * ─────────────────────
 * 3-tier drill-down state machine for the Data Conversion Tool (ETL Pipeline).
 *
 *   Level 1 — Module grid       (selectedModule = null)
 *   Level 2 — Business Objects  (selectedModule set, selectedObject = null)
 *   Level 3 — UniversalETLScreen (both set)
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { DATA_LOADER_CONFIG, type ModuleConfig, type BusinessObject } from '@/config/dataLoaderConfig';
import { UniversalETLScreen } from '@/components/UniversalETLScreen';
import { useOracleSessions } from '@/hooks/useOracleSessions';
import { OracleSessionSelector } from '@/components/shared/OracleSessionSelector';
import { bipReportingApi, type OracleStatus, type OracleSessionResponse, type TemplateMeta } from '@/services/api';
import {
  ArrowRightLeft, ShieldCheck, Layers, Cpu,
  ArrowRight, ArrowLeft, Lock, CheckCircle2, Download,
  Loader2, XCircle, FileSpreadsheet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

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

function ModuleGrid({
  onSelect,
  isValidating,
  onValidateCatalog,
  onDownloadTemplates,
  activeEnv,
  savedSessions,
  oracleStatus,
  onSessionRefresh,
  onSwitchEnv,
  onDeleteAll,
}: {
  onSelect: (mod: ModuleConfig) => void;
  isValidating: boolean;
  onValidateCatalog: () => void;
  onDownloadTemplates: () => void;
  activeEnv: OracleSessionResponse | null;
  savedSessions: OracleSessionResponse[];
  oracleStatus: OracleStatus | null;
  onSessionRefresh: (newActiveEnvName?: string) => Promise<void> | void;
  onSwitchEnv: (s: OracleSessionResponse) => void;
  onDeleteAll: () => Promise<void> | void;
}) {
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
          <OracleSessionSelector
            activeEnv={activeEnv}
            savedSessions={savedSessions}
            oracleStatus={oracleStatus}
            onSessionRefresh={onSessionRefresh}
            onSwitchEnv={onSwitchEnv}
            onDeleteAll={onDeleteAll}
          />
          <Button
            variant="outline"
            onClick={onValidateCatalog}
            disabled={isValidating}
            className="gap-2 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isValidating ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {isValidating ? 'Validating...' : 'Validate catalog'}
          </Button>
          <Button
            variant="default"
            onClick={onDownloadTemplates}
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

              <div className="relative z-10 p-5 min-h-[200px] flex flex-col justify-between">
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

const ORACLE_VALIDATE_SOURCE_FOLDER = '/QuickConfigTool';

function isApiError(v: unknown): v is { error: { message: string } } {
  return typeof v === 'object' && v !== null && 'error' in v;
}

export function DataConversionPage() {
  const [selectedModule, setSelectedModule] = useState<ModuleConfig | null>(null);
  const [selectedObject, setSelectedObject] = useState<BusinessObject | null>(null);

  // Catalog validation/deployment state
  const [isCatalogRunning, setIsCatalogRunning] = useState(false);
  const [catalogLogs, setCatalogLogs] = useState<string[]>([]);
  const [catalogSuccess, setCatalogSuccess] = useState<boolean | null>(null);
  const [isCatalogLogOpen, setIsCatalogLogOpen] = useState(false);
  const [catalogOperation, setCatalogOperation] = useState<'deploy' | 'sync'>('deploy');

  // Template picker modal state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<TemplateMeta[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateMeta | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  const syncOracleQueriesForEnv = useCallback(async (envName: string) => {
    const res = await bipReportingApi.importOracleCatalogQueries(
      envName,
      ORACLE_VALIDATE_SOURCE_FOLDER,
    );

    if (isApiError(res)) {
      throw new Error(res.error.message || 'Oracle query sync failed.');
    }
    return res;
  }, []);

  const runValidateCatalog = useCallback(async (envName: string) => {
    setCatalogOperation('deploy');
    setIsCatalogRunning(true);
    setCatalogLogs([]);
    setCatalogSuccess(null);
    setIsCatalogLogOpen(true);
    toast.info('Deploying catalog to Oracle...', { id: 'catalog-deploy' });

    try {
      const res = await bipReportingApi.validateCatalog(envName);
      toast.dismiss('catalog-deploy');
      if (isApiError(res)) {
        toast.error(res.error.message || 'Catalog deployment failed.');
        setCatalogLogs([res.error.message || 'Unknown error']);
        setCatalogSuccess(false);
      } else {
        setCatalogLogs(res.logs);
        setCatalogSuccess(res.success);
        if (res.success) {
          toast.success('Catalog deployed successfully!');
          try {
            setCatalogLogs(current => [
              ...current,
              '',
              '===== Query Sync =====',
              `Source: ${ORACLE_VALIDATE_SOURCE_FOLDER}`,
              'Syncing QuickConfigTool SQL definitions into SQLite...',
            ]);
            const syncRes = await syncOracleQueriesForEnv(envName);
            setCatalogLogs(current => [
              ...current,
              ...syncRes.logs,
              `Synced ${syncRes.imported_count} QuickConfigTool quer${syncRes.imported_count === 1 ? 'y' : 'ies'} into SQLite.`,
            ]);
            toast.success(
              `Synced ${syncRes.imported_count} QuickConfigTool quer${syncRes.imported_count === 1 ? 'y' : 'ies'}.`,
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Oracle query sync failed.';
            setCatalogLogs(current => [
              ...current,
              '',
              '===== Query Sync =====',
              `Source: ${ORACLE_VALIDATE_SOURCE_FOLDER}`,
              `Sync failed: ${message}`,
            ]);
            setCatalogSuccess(false);
            toast.warning(message);
          }
        } else {
          toast.warning('Catalog deployment completed with issues.');
        }
      }
    } catch {
      toast.dismiss('catalog-deploy');
      toast.error('Network error during catalog deployment.');
      setCatalogLogs(['Network error: Could not reach the backend.']);
      setCatalogSuccess(false);
    } finally {
      setIsCatalogRunning(false);
    }
  }, [syncOracleQueriesForEnv]);

  const {
    oracleStatus,
    savedSessions,
    activeEnv,
    handleSessionRefresh,
    handleDeleteAll,
    handleSwitchEnv,
  } = useOracleSessions(async (newActiveEnvName) => {
    await runValidateCatalog(newActiveEnvName);
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleValidateCatalog = async () => {
    if (!activeEnv) {
      toast.error('Please select an Oracle environment first.');
      return;
    }
    await runValidateCatalog(activeEnv.env_name);
  };

  const handleOpenTemplatePicker = async () => {
    setIsLoadingTemplates(true);
    setSelectedTemplate(null);
    setIsTemplateModalOpen(true);
    try {
      const res = await bipReportingApi.getAvailableTemplates();
      if (isApiError(res)) {
        toast.error(res.error.message || 'Failed to load templates.');
        setAvailableTemplates([]);
      } else {
        setAvailableTemplates(res);
      }
    } catch {
      toast.error('Network error while fetching templates.');
      setAvailableTemplates([]);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const handleDownloadSelectedTemplate = async () => {
    if (!selectedTemplate) {
      toast.error('Please select a template first.');
      return;
    }
    setIsDownloadingTemplate(true);
    try {
      const blob = await bipReportingApi.downloadDataTemplate(
        selectedTemplate.module_name,
        selectedTemplate.business_object,
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', selectedTemplate.file_name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Template downloaded — ${selectedTemplate.file_name}`);
      setIsTemplateModalOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to download template.');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-250">
      {/* Always show the welcome banner at Level 1 */}
      {!selectedModule && <ToolWelcomeBanner />}

      {/* Level 1: Module Grid */}
      {!selectedModule && (
        <ModuleGrid
          onSelect={(mod) => setSelectedModule(mod)}
          isValidating={isCatalogRunning}
          onValidateCatalog={handleValidateCatalog}
          onDownloadTemplates={handleOpenTemplatePicker}
          activeEnv={activeEnv}
          savedSessions={savedSessions}
          oracleStatus={oracleStatus}
          onSessionRefresh={handleSessionRefresh}
          onSwitchEnv={handleSwitchEnv}
          onDeleteAll={handleDeleteAll}
        />
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

      {/* ══════ CATALOG DEPLOYMENT LOG DIALOG ══════ */}
      <Dialog open={isCatalogLogOpen} onOpenChange={setIsCatalogLogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="mx-auto size-12 rounded-full flex items-center justify-center mb-2" style={{ background: catalogSuccess === null ? 'rgba(59,130,246,0.1)' : catalogSuccess ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
              {catalogSuccess === null ? (
                <Loader2 className="animate-spin text-blue-500" size={22} />
              ) : catalogSuccess ? (
                <CheckCircle2 className="text-emerald-500" size={22} />
              ) : (
                <XCircle className="text-red-500" size={22} />
              )}
            </div>
            <DialogTitle className="text-center text-lg">
              {catalogSuccess === null
                ? catalogOperation === 'sync' ? 'Syncing Catalog Queries...' : 'Deploying Catalog...'
                : catalogSuccess
                  ? catalogOperation === 'sync' ? 'Queries Synced' : 'Catalog Deployed'
                  : catalogOperation === 'sync' ? 'Sync Issues' : 'Deployment Issues'}
            </DialogTitle>
            <DialogDescription className="text-center">
              {activeEnv ? `Target: ${activeEnv.env_name}` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto mt-3 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0A0F1E] p-4 font-mono text-xs leading-relaxed space-y-1 max-h-[400px]">
            {catalogLogs.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="animate-spin" size={14} />
                Waiting for deployment logs...
              </div>
            ) : (
              catalogLogs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    'py-0.5',
                    log.startsWith('✅') && 'text-emerald-600 dark:text-emerald-400',
                    log.startsWith('❌') && 'text-red-500 dark:text-red-400',
                    log.startsWith('⬆️') && 'text-blue-600 dark:text-blue-400',
                    log.startsWith('📁') && 'text-amber-600 dark:text-amber-400',
                    log.startsWith('🔥') && 'text-red-600 dark:text-red-400 font-bold',
                    log.startsWith('🎉') && 'text-emerald-600 dark:text-emerald-400 font-bold',
                    log.startsWith('⚙️') && 'text-gray-500 dark:text-slate-400',
                    log.startsWith('⏳') && 'text-gray-400 dark:text-slate-500',
                    log.includes('Summary') && 'text-white dark:text-white font-bold border-t border-gray-300 dark:border-white/10 pt-2 mt-2',
                  )}
                >
                  {log}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════ TEMPLATE PICKER DIALOG ══════ */}
      <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="mx-auto size-12 rounded-full flex items-center justify-center mb-2 bg-[#185FA5]/10">
              <Download className="text-[#185FA5]" size={22} />
            </div>
            <DialogTitle className="text-center text-lg">Download Data Template</DialogTitle>
            <DialogDescription className="text-center">
              Select a template to download from the database.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto mt-3 max-h-[400px]">
            {isLoadingTemplates ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 size={28} className="animate-spin text-[#185FA5]" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading templates...</p>
              </div>
            ) : availableTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400 dark:text-slate-500">
                <FileSpreadsheet size={40} strokeWidth={1} className="opacity-40" />
                <p className="text-sm">No templates found in the database.</p>
                <p className="text-xs">Upload a template from the Admin Panel first.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTemplate(t)}
                    className={cn(
                      'w-full text-left rounded-lg border p-4 transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5]/50',
                      selectedTemplate?.id === t.id
                        ? 'border-[#185FA5] bg-[#185FA5]/5 dark:bg-[#185FA5]/10 shadow-sm'
                        : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/[0.02]',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                          selectedTemplate?.id === t.id
                            ? 'bg-[#185FA5]/15 text-[#185FA5]'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500',
                        )}
                      >
                        <FileSpreadsheet size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {t.business_object}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[#185FA5]/10 text-[#185FA5]">
                            {t.module_name}
                          </span>
                          <span className="truncate">{t.file_name}</span>
                        </p>
                      </div>
                      {selectedTemplate?.id === t.id && (
                        <CheckCircle2 size={18} className="text-[#185FA5] shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {availableTemplates.length > 0 && (
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-white/10">
              <Button
                variant="outline"
                onClick={() => setIsTemplateModalOpen(false)}
                disabled={isDownloadingTemplate}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDownloadSelectedTemplate}
                disabled={!selectedTemplate || isDownloadingTemplate}
                className="gap-2 bg-[#185FA5] hover:bg-[#124A82] text-white"
              >
                {isDownloadingTemplate ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {isDownloadingTemplate ? 'Downloading...' : 'Download Selected'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
