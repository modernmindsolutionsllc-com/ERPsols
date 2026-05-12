import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  BarChart3, Database, Download, FileSpreadsheet, Loader2, PlayCircle,
  Server, Globe, Pencil, UserPlus, Users, Trash2, Key, ChevronDown,
  Zap, Layers, FileText, Info, Search,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePermission, useToolAccess } from '@/hooks/usePermission';
import {
  bipReportingApi, type OracleStatus, type OracleSessionResponse, type BipReportResponse,
} from '@/services/api';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  EnvSetupModal, EditCredentialsModal, AddAccountModal, DeleteAllUsersModal,
} from '@/components/shared/OracleSessionModals';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import * as XLSX from 'xlsx';

function isApiError(v: unknown): v is { error: { message: string } } {
  return typeof v === 'object' && v !== null && 'error' in v;
}

export function BIPReportingPage() {
  const { user } = useAuth();
  const canAccess = usePermission('run_bip_report') || useToolAccess('bip_reporting');

  // Oracle session state
  const [oracleStatus, setOracleStatus] = useState<OracleStatus | null>(null);
  const [savedSessions, setSavedSessions] = useState<OracleSessionResponse[]>([]);
  const [activeEnv, setActiveEnv] = useState<OracleSessionResponse | null>(null);
  const [isEnvSetupOpen, setIsEnvSetupOpen] = useState(false);
  const [isEditCredsOpen, setIsEditCredsOpen] = useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);

  // Report state
  const [reports, setReports] = useState<BipReportResponse[]>([]);
  const [selectedReport, setSelectedReport] = useState<BipReportResponse | null>(null);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [tableData, setTableData] = useState<any[]>([]);

  const fetchOracleStatus = useCallback(async () => {
    const res = await bipReportingApi.getOracleStatus();
    if (!isApiError(res)) setOracleStatus(res);
  }, []);

  const fetchSessions = useCallback(async () => {
    const res = await bipReportingApi.getOracleSessions();
    if (!isApiError(res)) {
      setSavedSessions(res);
      if (res.length > 0 && !activeEnv) setActiveEnv(res[0]);
    }
  }, [activeEnv]);

  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    const res = await bipReportingApi.getBipReports();
    if (!isApiError(res)) setReports(res);
    setReportsLoading(false);
  }, []);

  useEffect(() => { void fetchOracleStatus(); void fetchSessions(); void fetchReports(); }, []);

  const handleSessionRefresh = useCallback(async (newActiveEnvName?: string) => {
    await fetchOracleStatus();
    const res = await bipReportingApi.getOracleSessions();
    if (!isApiError(res)) {
      setSavedSessions(res);
      if (res.length === 0) {
        setActiveEnv(null);
      } else if (newActiveEnvName) {
        const target = res.find(s => s.env_name === newActiveEnvName);
        setActiveEnv(target || res[0]);
      } else {
        setActiveEnv(prev => {
          if (!prev) return res[0];
          const updated = res.find(s => s.id === prev.id);
          return updated || res[0];
        });
      }
    }
  }, [fetchOracleStatus]);

  const handleDeleteAll = useCallback(async () => {
    try {
      const res = await bipReportingApi.deleteAllOracleSessions();
      if (isApiError(res)) { toast.error(res.error.message); return; }
      // Explicitly purge all React state — zero ghost data
      setSavedSessions([]);
      setActiveEnv(null);
      setOracleStatus(null);
      toast.success('All Oracle credentials purged from the vault.');
      await fetchOracleStatus();
    } catch {
      toast.error('Failed to delete credentials.');
    }
  }, [fetchOracleStatus]);

  const handleSwitchEnv = (s: OracleSessionResponse) => {
    setActiveEnv(s);
    toast.success(`Switched to "${s.env_name}" (${s.oracle_username})`);
  };

  const oracleConnected = oracleStatus?.connected === true;
  const triggerLabel = oracleConnected ? activeEnv?.env_name || 'Connected' : 'Connect';

  const handleRunReport = async () => {
    if (!activeEnv) { toast.error('Please select an Oracle environment first.'); return; }
    if (!selectedReport) { toast.error('Please select a report from the menu.'); return; }
    setIsRunning(true);
    toast.info('Executing report in Oracle BIP...', { id: 'run-report' });
    try {
      const response = await bipReportingApi.executeBipReports([selectedReport.id], activeEnv.env_name);
      toast.dismiss('run-report');
      if (isApiError(response)) { toast.error(response.error.message || 'Execution failed.'); }
      else {
        toast.success('Report executed successfully.');
        
        // Parse the Excel Blob using SheetJS
        const buffer = await response.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        
        // If there's more than one sheet, assume the first is an Index and target the second.
        const targetSheetName = workbook.SheetNames.length > 1 ? workbook.SheetNames[1] : workbook.SheetNames[0];
        const worksheet = workbook.Sheets[targetSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        setTableData(jsonData);
        setHasResults(true);

        const url = window.URL.createObjectURL(response);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedReport.report_name}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
        document.body.appendChild(a); a.click(); a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch { toast.dismiss('run-report'); toast.error('An unexpected error occurred.'); }
    finally { setIsRunning(false); }
  };

  if (!user) return <Navigate to="/login" />;
  if (!canAccess) return <Navigate to="/dashboard" />;

  const filtered = reports.filter(r =>
    r.report_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.module.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-250 p-6 lg:p-8">
        {/* ══════ HEADER + SESSION DROPDOWN ══════ */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100 tracking-tight flex items-center gap-3">
              <BarChart3 className="text-[#185FA5]" size={32} /> BIP Reporting Cockpit
            </h1>
            <p className="text-gray-500 dark:text-slate-400 mt-2">Select a report, execute against Oracle BIP, and review the response data below.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant={oracleConnected ? 'outline' : 'default'} className={oracleConnected ? 'gap-2 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : 'gap-2 bg-[#185FA5] text-white'} size="lg">
                  <Server className="h-5 w-5" />
                  {triggerLabel}
                  <ChevronDown className="h-4 w-4 opacity-50 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[260px] dark:bg-[#0C1425] dark:border-white/10">
                <DropdownMenuLabel className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-lg flex items-center justify-center" style={{ background: oracleConnected ? 'linear-gradient(135deg,#059669,#10B981)' : 'linear-gradient(135deg,#475569,#64748B)' }}>
                      <Server size={15} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate dark:text-white">{oracleConnected ? 'Oracle Connected' : 'Not Connected'}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{activeEnv ? activeEnv.env_name : 'Set up an environment to connect'}</p>
                    </div>
                    {oracleConnected && <Zap size={13} className="text-emerald-400 shrink-0" />}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => savedSessions.length > 0 ? setIsAddAccountOpen(true) : setIsEnvSetupOpen(true)} className="gap-2.5 px-3 py-2 cursor-pointer">
                    {savedSessions.length > 0 ? <UserPlus size={14} className="text-emerald-400" /> : <Globe size={14} className="text-blue-400" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{savedSessions.length > 0 ? 'Add More Account' : 'Add Account'}</p>
                      <p className="text-[10px] text-muted-foreground">{savedSessions.length > 0 ? 'Add secondary credentials' : 'Connect to an Oracle environment'}</p>
                    </div>
                  </DropdownMenuItem>
                  {savedSessions.length > 0 && (
                    <DropdownMenuItem onSelect={() => setIsEditCredsOpen(true)} className="gap-2.5 px-3 py-2 cursor-pointer"><Pencil size={14} className="text-amber-400" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">Edit Credentials</p><p className="text-[10px] text-muted-foreground">Modify active connection</p></div></DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                {savedSessions.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2.5 px-3 py-2 cursor-pointer"><Users size={14} className="text-purple-400" /><span className="text-sm font-medium">Switch Account</span></DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="dark:bg-[#0C1425] dark:border-white/10">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-3">Available Accounts</DropdownMenuLabel>
                        {savedSessions.map(s => (
                          <DropdownMenuItem key={s.id} className="gap-2.5 px-3 py-2 cursor-pointer" onSelect={() => handleSwitchEnv(s)}>
                            <Key size={13} className={activeEnv?.id === s.id ? 'text-emerald-400' : 'text-muted-foreground'} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium flex items-center gap-1.5">{s.env_name}{activeEnv?.id === s.id && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">ACTIVE</span>}</p>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setIsDeleteAllOpen(true)} className="gap-2.5 px-3 py-2 cursor-pointer"><Trash2 size={14} /><span className="text-sm font-medium">Delete All Users</span></DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ══════ DUAL-PANE LAYOUT ══════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── LEFT PANE: Report Menu (span 4) ── */}
          <div className="lg:col-span-4">
            <Card className="border dark:border-white/10 shadow-sm rounded-xl overflow-hidden bg-white dark:bg-slate-950 h-full">
              <div className="border-b dark:border-white/10 bg-gray-50 dark:bg-slate-900 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-2.5">
                  <Database size={15} className="text-[#185FA5]" /> Available Reports
                  <span className="ml-auto text-[10px] font-normal text-muted-foreground">{reports.length} total</span>
                </h3>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input placeholder="Search reports..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-8 text-xs dark:bg-white/5 dark:border-white/10" />
                </div>
              </div>

              <ScrollArea className="h-[520px]">
                <div className="p-3 space-y-2">
                  {reportsLoading ? (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mb-2 text-[#185FA5]" /><p className="text-xs">Loading reports...</p>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                      <BarChart3 className="h-8 w-8 opacity-20 mb-2" /><p className="text-xs">{searchQuery ? 'No matching reports' : 'No reports found'}</p>
                    </div>
                  ) : filtered.map(report => {
                    const isActive = selectedReport?.id === report.id;
                    return (
                      <button
                        key={report.id}
                        onClick={() => { setSelectedReport(report); setHasResults(false); }}
                        className={`w-full text-left p-3 rounded-lg border transition-all duration-150 group ${
                          isActive
                            ? 'ring-2 ring-[#185FA5] border-[#185FA5]/30 bg-[#185FA5]/5 dark:bg-[#185FA5]/10 dark:border-[#185FA5]/40'
                            : 'border-gray-100 dark:border-white/10 bg-white dark:bg-white/[0.02] hover:border-gray-200 dark:hover:border-white/20 hover:bg-gray-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isActive ? 'bg-[#185FA5]/15' : 'bg-gray-100 dark:bg-white/5 group-hover:bg-gray-200 dark:group-hover:bg-white/10'}`}>
                            <FileSpreadsheet size={14} className={isActive ? 'text-[#185FA5]' : 'text-muted-foreground'} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-semibold truncate ${isActive ? 'text-[#185FA5] dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                              {report.report_name.replace(/_/g, ' ')}
                            </p>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-slate-300 mt-1">
                              {report.module}
                            </span>
                            {report.description && (
                              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{report.description}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </Card>
          </div>

          {/* ── RIGHT PANE: Cockpit (span 8) ── */}
          <div className="lg:col-span-8 space-y-6">

            {/* Selected Query Status Panel */}
            <Card className="border dark:border-white/10 shadow-sm rounded-xl overflow-hidden bg-white dark:bg-slate-950">
              <div className="px-6 py-5" style={{ background: 'linear-gradient(145deg, rgba(24,95,165,0.06) 0%, rgba(13,59,110,0.04) 100%)' }}>
                {!selectedReport ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="size-14 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-3">
                      <FileSpreadsheet className="h-7 w-7 text-muted-foreground opacity-40" />
                    </div>
                    <p className="text-base font-medium text-gray-500 dark:text-slate-400">👈 Select a report from the menu to begin</p>
                    <p className="text-xs text-muted-foreground mt-1">Choose a saved data model to configure and execute</p>
                  </div>
                ) : (
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="size-9 rounded-lg bg-[#185FA5]/10 dark:bg-[#185FA5]/20 flex items-center justify-center">
                          <FileSpreadsheet size={18} className="text-[#185FA5]" />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Selected Report</p>
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{selectedReport.report_name.replace(/_/g, ' ')}</h2>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10">
                          <Layers size={14} className="text-blue-500 shrink-0" />
                          <div className="min-w-0"><p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Module</p><p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{selectedReport.module}</p></div>
                        </div>
                        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10">
                          <FileText size={14} className="text-purple-500 shrink-0" />
                          <div className="min-w-0"><p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Report</p><p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{selectedReport.report_name}</p></div>
                        </div>
                        <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10">
                          <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
                          <div className="min-w-0"><p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Description</p><p className="text-xs text-gray-600 dark:text-slate-300 line-clamp-2">{selectedReport.description || 'No description provided'}</p></div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2 lg:pl-4 lg:border-l lg:border-gray-200 dark:lg:border-white/10">
                      <Button onClick={handleRunReport} disabled={!oracleConnected || isRunning || !activeEnv} className="gap-2.5 bg-[#185FA5] hover:bg-[#0D3B6E] text-white shadow-lg hover:shadow-xl transition-all px-8 h-12 text-sm font-semibold" size="lg">
                        {isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
                        {isRunning ? 'Running...' : '▶ Run SQL & Download'}
                      </Button>
                      <p className="text-[10px] text-muted-foreground text-center">{activeEnv ? `Targeting ${activeEnv.env_name}` : 'Select an environment first'}</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Oracle Response Data Table */}
            <Card className="border dark:border-white/10 shadow-sm rounded-xl overflow-hidden bg-white dark:bg-slate-950">
              <div className="border-b dark:border-white/10 bg-gray-50 dark:bg-slate-900 px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="size-7 rounded-md bg-[#185FA5]/10 dark:bg-[#185FA5]/20 flex items-center justify-center"><Database size={14} className="text-[#185FA5]" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Oracle Response Data</h3>
                    <p className="text-[10px] text-muted-foreground">{hasResults ? `${tableData.length} rows returned` : 'Execute a report to view results'}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" disabled={!hasResults} onClick={() => toast.info('Preparing download...')} className="gap-2 text-xs border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
                  <Download size={13} /> Download Report (.xlsx)
                </Button>
              </div>
              <div className="p-0">
                {!hasResults || tableData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-52 text-gray-400 dark:text-slate-500">
                    <div className="size-14 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-3"><BarChart3 className="h-7 w-7 opacity-30" /></div>
                    <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Run a report to view data here.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow className="bg-gray-50 dark:bg-slate-900">
                        {Object.keys(tableData[0]).map(key => <TableHead key={key} className="font-semibold text-xs uppercase tracking-wider">{key.replace(/_/g, ' ')}</TableHead>)}
                      </TableRow></TableHeader>
                      <TableBody>
                        {tableData.map((row, i) => (
                          <TableRow key={i} className="transition-colors hover:bg-[#185FA5]/5">
                            {Object.keys(tableData[0]).map(col => (
                              <TableCell key={col} className="text-sm">
                                {col.toLowerCase() === 'module' ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-500/20">{row[col]}</span>
                                : col.toLowerCase() === 'status' ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">{row[col]}</span>
                                : <span className="text-gray-700 dark:text-slate-300">{row[col]}</span>}
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
      </div>

      {/* ══════ MODALS ══════ */}
      <EnvSetupModal open={isEnvSetupOpen} onOpenChange={setIsEnvSetupOpen} onSuccess={handleSessionRefresh} />
      <EditCredentialsModal 
        open={isEditCredsOpen} 
        onOpenChange={setIsEditCredsOpen} 
        currentUsername={activeEnv?.oracle_username || oracleStatus?.oracle_username || undefined} 
        currentEnvName={activeEnv?.env_name || undefined}
        currentUrl={activeEnv?.oracle_url || undefined}
        onSuccess={handleSessionRefresh} 
      />
      <AddAccountModal open={isAddAccountOpen} onOpenChange={setIsAddAccountOpen} onSuccess={handleSessionRefresh} />
      <DeleteAllUsersModal open={isDeleteAllOpen} onOpenChange={setIsDeleteAllOpen} onConfirm={handleDeleteAll} />
    </>
  );
}
