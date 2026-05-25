import { useEffect, useState, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  BarChart3, Database, Download, FileSpreadsheet, Loader2, PlayCircle,
  Layers, Info, Check, ChevronsUpDown, CloudUpload, CheckCircle2, XCircle,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { usePermission, useToolAccess } from '@/hooks/usePermission';
import {
  bipReportingApi, type BipReportResponse,
} from '@/services/api';

import { Card } from '@/components/ui/card';
import { useOracleSessions } from '@/hooks/useOracleSessions';
import { OracleSessionSelector } from '@/components/shared/OracleSessionSelector';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

function isApiError(v: unknown): v is { error: { message: string } } {
  return typeof v === 'object' && v !== null && 'error' in v;
}

function downloadWorkbook(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

const ORACLE_VALIDATE_SOURCE_FOLDER = '/QuickConfigTool';
const PREVIEW_ROW_LIMIT = 100;

export function BIPReportingPage() {
  const { user } = useAuth();
  const canAccess = usePermission('run_bip_report') || useToolAccess('bip_reporting');



  // Report state
  const [reports, setReports] = useState<BipReportResponse[]>([]);
  const [selectedReport, setSelectedReport] = useState<BipReportResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [tableData, setTableData] = useState<any[]>([]);
  const [lastWorkbookName, setLastWorkbookName] = useState('');
  const [lastWorkbookBlob, setLastWorkbookBlob] = useState<Blob | null>(null);
  
  // Combobox state
  const [openCombobox, setOpenCombobox] = useState(false);
  const [reportSearch, setReportSearch] = useState('');

  // Catalog deployment state
  const [isCatalogRunning, setIsCatalogRunning] = useState(false);
  const [catalogLogs, setCatalogLogs] = useState<string[]>([]);
  const [catalogSuccess, setCatalogSuccess] = useState<boolean | null>(null);
  const [isCatalogLogOpen, setIsCatalogLogOpen] = useState(false);
  const [catalogOperation, setCatalogOperation] = useState<'deploy' | 'sync'>('deploy');



  const fetchReports = useCallback(async () => {
    const res = await bipReportingApi.getBipReports();
    if (isApiError(res)) {
      toast.error(res.error.message || 'Failed to load reports.');
      setReports([]);
    } else {
      setReports(res);
    }
  }, []);

  const filteredReports = useMemo(() => {
    const term = reportSearch.trim().toLowerCase();
    if (!term) return reports;
    return reports.filter(report => {
      const haystack = [
        report.module,
        report.sub_module || '',
        report.report_name,
        report.description || '',
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [reports, reportSearch]);

  const syncOracleQueriesForEnv = useCallback(async (envName: string) => {
    const res = await bipReportingApi.importOracleCatalogQueries(
      envName,
      ORACLE_VALIDATE_SOURCE_FOLDER,
    );

    if (isApiError(res)) {
      throw new Error(res.error.message || 'Oracle query sync failed.');
    }

    await fetchReports();
    if (res.reports.length > 0 && !selectedReport) {
      setSelectedReport(res.reports[0]);
    }

    return res;
  }, [fetchReports, selectedReport]);

  useEffect(() => {
    void fetchReports();
  }, []);

  useEffect(() => {
    const refreshReports = () => void fetchReports();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshReports();
    };

    window.addEventListener('focus', refreshReports);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshReports);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [fetchReports]);



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

  const oracleConnected = oracleStatus?.connected === true;

  const handleValidateCatalog = async () => {
    if (!activeEnv) { toast.error('Please select an Oracle environment first.'); return; }
    await runValidateCatalog(activeEnv.env_name);
  };


  const handleRunReport = async () => {
    if (!activeEnv) { toast.error('Please select an Oracle environment first.'); return; }
    if (!selectedReport) { toast.error('Please select a report from the menu.'); return; }
    
    setIsRunning(true);
    setHasResults(false);
    setTableData([]);
    setLastWorkbookBlob(null);
    toast.info('Executing report in Oracle BIP...', { id: 'run-report' });
    
    try {
      const response = await bipReportingApi.executeBipReports([selectedReport.id], activeEnv.env_name);
      toast.dismiss('run-report');
      if (isApiError(response)) { toast.error(response.error.message || 'Execution failed.'); }
      else {
        toast.success('Report executed successfully.');
        setLastWorkbookBlob(response);
        const workbookName = `${selectedReport.report_name}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
        setLastWorkbookName(workbookName);
        const buffer = await response.arrayBuffer();
        const workbook = XLSX.read(buffer, {
          type: 'array',
          sheetRows: PREVIEW_ROW_LIMIT + 4,
        });
        const targetSheetName = workbook.SheetNames.length > 1 ? workbook.SheetNames[1] : workbook.SheetNames[0];
        const worksheet = workbook.Sheets[targetSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: 3 });
        
        const cleanJsonData = jsonData.map((row: any) => {
          if (!row || typeof row !== 'object') return row;
          const cleanRow: any = {};
          Object.keys(row).forEach(key => {
            if (key.trim().toUpperCase() !== 'GO TO INDEX') {
              cleanRow[key] = row[key];
            }
          });
          return cleanRow;
        }).filter((row: any) => {
          if (!row || typeof row !== 'object') return false;
          if (Object.keys(row).length === 0) return false;
          return !Object.values(row).some(val => 
            typeof val === 'string' && val.trim().toUpperCase() === 'GO TO INDEX'
          );
        });
        
        setTableData(cleanJsonData.slice(0, PREVIEW_ROW_LIMIT));
        setHasResults(true);
      }
    } catch { toast.dismiss('run-report'); toast.error('An unexpected error occurred.'); }
    finally { setIsRunning(false); }
  };

  if (!user) return <Navigate to="/login" />;
  if (!canAccess) return <Navigate to="/dashboard" />;

  return (
    <>
      <div className="max-w-[1400px] mx-auto space-y-6 animate-in fade-in duration-250 p-6 lg:p-8">
        {/* ══════ HEADER + SESSION DROPDOWN ══════ */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100 tracking-tight flex items-center gap-3">
              <BarChart3 className="text-[#185FA5]" size={32} /> BIP Reporting Tool
            </h1>
            <p className="text-gray-500 dark:text-slate-400 mt-2">Select a report from the dropdown, execute against Oracle BIP, and review the data.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <OracleSessionSelector
              activeEnv={activeEnv}
              savedSessions={savedSessions}
              oracleStatus={oracleStatus}
              onSessionRefresh={handleSessionRefresh}
              onSwitchEnv={handleSwitchEnv}
              onDeleteAll={handleDeleteAll}
            />
          </div>
        </div>

        {/* ══════ MAIN SINGLE PANE LAYOUT ══════ */}
        <div className="space-y-6">

          {/* Configuration & Selection Card */}
          <Card className="border dark:border-white/10 shadow-sm rounded-xl bg-white dark:bg-slate-950">
            <div className="px-6 py-5 flex flex-col lg:flex-row items-center gap-6" style={{ background: 'linear-gradient(145deg, rgba(24,95,165,0.06) 0%, rgba(13,59,110,0.04) 100%)' }}>
              
              <div className="w-full lg:w-[400px]">
                <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                  Select Oracle Report
                </label>
                <Popover
                  open={openCombobox}
                  onOpenChange={(nextOpen) => {
                    setOpenCombobox(nextOpen);
                    if (nextOpen) void fetchReports();
                    else setReportSearch('');
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openCombobox}
                      className="w-full justify-between bg-white dark:bg-[#0C1425] border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 h-12"
                    >
                      {selectedReport ? (
                        <div className="flex items-center gap-2 truncate">
                          <FileSpreadsheet className="h-4 w-4 text-[#185FA5] shrink-0" />
                          <span className="truncate">{selectedReport.report_name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Search by module or report name...</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent 
                    className="p-0 shadow-2xl border border-gray-200 dark:border-white/10 dark:bg-[#0C1425] z-50 overflow-hidden 
                               data-[state=open]:animate-in data-[state=closed]:animate-out 
                               data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 
                               data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 
                               data-[side=bottom]:slide-in-from-top-2"
                    style={{ width: 'var(--radix-popover-trigger-width)' }}
                    align="start"
                    side="bottom"
                    sideOffset={8}
                  >
                    <Command className="dark:bg-[#0C1425]" shouldFilter={false}>
                      <CommandInput
                        placeholder="Search reports (e.g. Core HR, Payroll)..."
                        className="h-11"
                        value={reportSearch}
                        onValueChange={setReportSearch}
                      />
                      <CommandList className="max-h-[300px] overflow-y-auto">
                        {reports.length === 0 ? (
                          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                            No saved SQL reports found. Add one from Admin, then reopen this list.
                          </div>
                        ) : filteredReports.length === 0 ? (
                          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                            No reports match your search.
                          </div>
                        ) : (
                          <CommandGroup heading="Available Reports">
                            {filteredReports.map((report) => (
                            <CommandItem
                              key={report.id}
                              value={`${report.module} ${report.report_name}`}
                              onSelect={() => {
                                setSelectedReport(report);
                                setOpenCombobox(false);
                                setHasResults(false);
                                setTableData([]);
                                setLastWorkbookName('');
                              }}
                              className="cursor-pointer py-2.5"
                            >
                              <div className="flex items-center w-full">
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4 text-[#185FA5]",
                                    selectedReport?.id === report.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="text-sm font-medium truncate dark:text-slate-200">{report.report_name}</span>
                                  <span className="text-[10px] uppercase text-muted-foreground font-semibold">{report.module}</span>
                                </div>
                              </div>
                            </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex-1 min-w-0 bg-white/50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 p-4 w-full lg:w-auto">
                {selectedReport ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-md bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                        <Layers size={14} className="text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Module</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{selectedReport.module}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 sm:col-span-1 lg:col-span-2">
                      <div className="size-8 rounded-md bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center shrink-0">
                        <Info size={14} className="text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Description</p>
                        <p className="text-xs text-gray-600 dark:text-slate-300 line-clamp-2 mt-0.5">{selectedReport.description || 'No description available'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-2">
                    Select a report to view details.
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-2 lg:pl-6 lg:border-l lg:border-gray-200 dark:lg:border-white/10 w-full lg:w-auto mt-4 lg:mt-0">
                <Button 
                  onClick={handleRunReport} 
                  disabled={!oracleConnected || isRunning || !activeEnv || !selectedReport} 
                  className="w-full lg:w-auto gap-2.5 bg-[#185FA5] hover:bg-[#0D3B6E] text-white shadow-lg hover:shadow-xl transition-all px-8 h-12 text-sm font-semibold" 
                  size="lg"
                >
                  {isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
                  {isRunning ? 'Running SQL...' : '▶ Run SQL'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleValidateCatalog}
                  disabled={!oracleConnected || isCatalogRunning || !activeEnv}
                  className="w-full lg:w-auto gap-2 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 h-9 text-xs font-semibold"
                  size="sm"
                >
                  {isCatalogRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                  {isCatalogRunning ? 'Deploying...' : 'Deploy Catalog'}
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  {activeEnv ? `Targeting ${activeEnv.env_name}` : 'Connect to Oracle first'}
                </p>
              </div>

            </div>
          </Card>

          {/* Oracle Response Data Table */}
          <Card className="border dark:border-white/10 shadow-sm rounded-xl overflow-hidden bg-white dark:bg-slate-950">
            <div className="border-b dark:border-white/10 bg-gray-50 dark:bg-slate-900 px-6 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-[#185FA5]/10 dark:bg-[#185FA5]/20 flex items-center justify-center">
                  <Database size={16} className="text-[#185FA5]" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Oracle Execution Results</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {hasResults
                      ? `Previewing ${tableData.length} rows (max ${PREVIEW_ROW_LIMIT} shown). Download the file for the complete result.`
                      : 'Execute a report to view the dataset'}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                disabled={!lastWorkbookBlob || !lastWorkbookName}
                onClick={() => {
                  if (!lastWorkbookBlob || !lastWorkbookName) return;
                  downloadWorkbook(lastWorkbookBlob, lastWorkbookName);
                }}
                className="gap-2 text-sm font-medium border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
              >
                <Download size={15} /> Download Export (.xlsx)
              </Button>
            </div>
            <div className="p-0">
              {!hasResults || tableData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-gray-400 dark:text-slate-500">
                  <div className="size-16 rounded-2xl bg-gray-50 dark:bg-white/5 flex items-center justify-center mb-4 border border-gray-100 dark:border-white/5">
                    <BarChart3 className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-base font-medium text-gray-500 dark:text-slate-400">Waiting for report execution...</p>
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto overflow-x-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-900 border-b-2 dark:border-white/10">
                        {Object.keys(tableData[0]).map(key => (
                          <TableHead key={key} className="font-bold text-xs uppercase tracking-wider text-gray-700 dark:text-slate-300 py-4 h-auto whitespace-nowrap">
                            {key.replace(/_/g, ' ')}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.map((row, i) => (
                        <TableRow key={i} className="transition-colors hover:bg-[#185FA5]/5 border-b dark:border-white/5">
                          {Object.keys(tableData[0]).map(col => (
                            <TableCell key={col} className="text-sm py-3 font-medium whitespace-nowrap">
                              {col.toLowerCase() === 'module' ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-500/20">
                                  {row[col]}
                                </span>
                              ) : col.toLowerCase() === 'status' ? (
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold border ${row[col] === 'COMPLETED' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20'}`}>
                                  {row[col]}
                                </span>
                              ) : (
                                <span className="text-gray-600 dark:text-slate-300">{row[col]}</span>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>



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
    </>
  );
}
