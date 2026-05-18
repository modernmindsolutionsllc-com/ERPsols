import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Database,
  Download,
  FileSpreadsheet,
  Globe,
  Info,
  Key,
  Layers,
  Loader2,
  Pencil,
  PlayCircle,
  Server,
  TerminalSquare,
  Trash2,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import * as XLSX from 'xlsx';

import { useAuth } from '@/context/AuthContext';
import { usePermission, useToolAccess } from '@/hooks/usePermission';
import {
  bipReportingApi,
  type BipReportResponse,
  type OracleSessionResponse,
  type OracleStatus,
  type PresetBipQueryResponse,
} from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AddAccountModal,
  DeleteAllUsersModal,
  EditCredentialsModal,
  EnvSetupModal,
} from '@/components/shared/OracleSessionModals';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const DUMMY_MODULES = ['Financials', 'HCM', 'SCM', 'Procurement', 'CRM', 'Projects', 'Manufacturing', 'Analytics', 'Inventory'];
const DUMMY_REPORTS: BipReportResponse[] = Array.from({ length: 85 }).map((_, index) => {
  const module = DUMMY_MODULES[index % DUMMY_MODULES.length];
  return {
    id: -(index + 1),
    report_name: `${module} Process Extract ${index + 1}`,
    module,
    description: `Sample dummy report ${index + 1} intended for testing ${module} datasets.`,
    is_active: true,
    created_at: new Date().toISOString(),
  };
});

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

async function parseWorkbookRows(blob: Blob): Promise<Record<string, unknown>[]> {
  const buffer = await blob.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const targetSheetName = workbook.SheetNames.length > 1 ? workbook.SheetNames[1] : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[targetSheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
}

export function BIPReportingPage() {
  const { user } = useAuth();
  const canAccess = usePermission('run_bip_report') || useToolAccess('bip_reporting');

  const [queries, setQueries] = useState<PresetBipQueryResponse[]>([]);
  const [selectedQuery, setSelectedQuery] = useState<PresetBipQueryResponse | null>(null);
  const [queriesLoading, setQueriesLoading] = useState(true);
  const [presetRunning, setPresetRunning] = useState(false);
  const [openPresetCombobox, setOpenPresetCombobox] = useState(false);

  const [reports, setReports] = useState<BipReportResponse[]>([]);
  const [selectedReport, setSelectedReport] = useState<BipReportResponse | null>(null);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportRunning, setReportRunning] = useState(false);
  const [openReportCombobox, setOpenReportCombobox] = useState(false);

  const [hasResults, setHasResults] = useState(false);
  const [tableData, setTableData] = useState<Record<string, unknown>[]>([]);
  const [lastWorkbook, setLastWorkbook] = useState<Blob | null>(null);
  const [lastWorkbookName, setLastWorkbookName] = useState('');

  const [oracleStatus, setOracleStatus] = useState<OracleStatus | null>(null);
  const [savedSessions, setSavedSessions] = useState<OracleSessionResponse[]>([]);
  const [activeEnv, setActiveEnv] = useState<OracleSessionResponse | null>(null);
  const [isEnvSetupOpen, setIsEnvSetupOpen] = useState(false);
  const [isEditCredsOpen, setIsEditCredsOpen] = useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);

  const resetResults = useCallback(() => {
    setHasResults(false);
    setTableData([]);
    setLastWorkbook(null);
    setLastWorkbookName('');
  }, []);

  const fetchQueries = useCallback(async () => {
    setQueriesLoading(true);
    const res = await bipReportingApi.getPresetQueries();
    if (isApiError(res)) {
      toast.error(res.error.message || 'Failed to load Oracle DUAL queries.');
      setQueries([]);
      setSelectedQuery(null);
    } else {
      setQueries(res);
      setSelectedQuery((current) => current && res.find((item) => item.id === current.id) ? current : res[0] ?? null);
    }
    setQueriesLoading(false);
  }, []);

  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    const res = await bipReportingApi.getBipReports();
    if (isApiError(res)) {
      toast.error(res.error.message || 'Failed to load reports.');
      setReports(DUMMY_REPORTS);
      setSelectedReport((current) => current && DUMMY_REPORTS.find((item) => item.id === current.id) ? current : DUMMY_REPORTS[0] ?? null);
    } else {
      const nextReports = [...res, ...DUMMY_REPORTS];
      setReports(nextReports);
      setSelectedReport((current) => current && nextReports.find((item) => item.id === current.id) ? current : nextReports[0] ?? null);
    }
    setReportsLoading(false);
  }, []);

  const fetchOracleStatus = useCallback(async () => {
    const res = await bipReportingApi.getOracleStatus();
    if (!isApiError(res)) setOracleStatus(res);
  }, []);

  const fetchSessions = useCallback(async () => {
    const res = await bipReportingApi.getOracleSessions();
    if (!isApiError(res)) {
      setSavedSessions(res);
      setActiveEnv((prev) => {
        if (!res.length) return null;
        if (!prev) return res[0];
        return res.find((session) => session.id === prev.id) || res[0];
      });
    }
  }, []);

  useEffect(() => {
    void fetchQueries();
    void fetchReports();
    void fetchOracleStatus();
    void fetchSessions();
  }, [fetchOracleStatus, fetchQueries, fetchReports, fetchSessions]);

  const handleSessionRefresh = useCallback(async (newActiveEnvName?: string) => {
    await fetchOracleStatus();
    const res = await bipReportingApi.getOracleSessions();
    if (!isApiError(res)) {
      setSavedSessions(res);
      if (res.length === 0) {
        setActiveEnv(null);
      } else if (newActiveEnvName) {
        const target = res.find((session) => session.env_name === newActiveEnvName);
        setActiveEnv(target || res[0]);
      } else {
        setActiveEnv((prev) => {
          if (!prev) return res[0];
          return res.find((session) => session.id === prev.id) || res[0];
        });
      }
    }
  }, [fetchOracleStatus]);

  const handleDeleteAll = useCallback(async () => {
    try {
      const res = await bipReportingApi.deleteAllOracleSessions();
      if (isApiError(res)) {
        toast.error(res.error.message);
        return;
      }
      setSavedSessions([]);
      setActiveEnv(null);
      setOracleStatus(null);
      toast.success('All Oracle credentials purged from the vault.');
      await fetchOracleStatus();
    } catch {
      toast.error('Failed to delete credentials.');
    }
  }, [fetchOracleStatus]);

  const handleSwitchEnv = (session: OracleSessionResponse) => {
    setActiveEnv(session);
    toast.success(`Switched to "${session.env_name}" (${session.oracle_username})`);
  };

  const handleSelectQuery = (query: PresetBipQueryResponse) => {
    setSelectedQuery(query);
    setOpenPresetCombobox(false);
    resetResults();
  };

  const handleSelectReport = (report: BipReportResponse) => {
    setSelectedReport(report);
    setOpenReportCombobox(false);
    resetResults();
  };

  const handleRunQuery = async () => {
    if (!selectedQuery) {
      toast.error('Please select a DUAL query from the dropdown.');
      return;
    }

    setPresetRunning(true);
    toast.info('Running Oracle DUAL query...', { id: 'run-preset-query' });

    try {
      const response = await bipReportingApi.executePresetQuery(selectedQuery.id);
      toast.dismiss('run-preset-query');

      if (isApiError(response)) {
        toast.error(response.error.message || 'Execution failed.');
        return;
      }

      const workbookName = `${selectedQuery.report_name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
      const rows = await parseWorkbookRows(response);

      setTableData(rows);
      setHasResults(true);
      setLastWorkbook(response);
      setLastWorkbookName(workbookName);
      toast.success('Oracle DUAL query executed successfully.');
      downloadWorkbook(response, workbookName);
    } catch {
      toast.dismiss('run-preset-query');
      toast.error('An unexpected error occurred while running the query.');
    } finally {
      setPresetRunning(false);
    }
  };

  const handleRunReport = async () => {
    if (!activeEnv) {
      toast.error('Please select an Oracle environment first.');
      return;
    }
    if (!selectedReport) {
      toast.error('Please select a report from the menu.');
      return;
    }

    setReportRunning(true);
    toast.info('Executing report in Oracle BIP...', { id: 'run-saved-report' });

    try {
      if (selectedReport.id < 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const mockRows: Record<string, unknown>[] = Array.from({ length: 15 }).map((_, rowIndex) => ({
          'ROW ID': 1000 + rowIndex,
          MODULE: selectedReport.module,
          STATUS: rowIndex % 3 === 0 ? 'PENDING' : 'COMPLETED',
          RECORD_TYPE: rowIndex % 2 === 0 ? 'INVOICE' : 'PAYMENT',
          DESCRIPTION: `Autogenerated mock data for ${selectedReport.report_name} - Record ${rowIndex + 1}`,
          AMOUNT: (Math.random() * 5000 + 100).toFixed(2),
          DATE_CREATED: format(new Date(), 'yyyy-MM-dd'),
        }));

        const worksheet = XLSX.utils.json_to_sheet(mockRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const workbookName = `${selectedReport.report_name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;

        setTableData(mockRows);
        setHasResults(true);
        setLastWorkbook(blob);
        setLastWorkbookName(workbookName);

        toast.dismiss('run-saved-report');
        toast.success('Mock report executed successfully.');
        downloadWorkbook(blob, workbookName);
        return;
      }

      const response = await bipReportingApi.executeBipReports([selectedReport.id], activeEnv.env_name);
      toast.dismiss('run-saved-report');

      if (isApiError(response)) {
        toast.error(response.error.message || 'Execution failed.');
        return;
      }

      const workbookName = `${selectedReport.report_name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
      const rows = await parseWorkbookRows(response);

      setTableData(rows);
      setHasResults(true);
      setLastWorkbook(response);
      setLastWorkbookName(workbookName);
      toast.success('Report executed successfully.');
      downloadWorkbook(response, workbookName);
    } catch {
      toast.dismiss('run-saved-report');
      toast.error('An unexpected error occurred while running the report.');
    } finally {
      setReportRunning(false);
    }
  };

  if (!user) return <Navigate to="/login" />;
  if (!canAccess) return <Navigate to="/dashboard" />;

  const oracleConnected = oracleStatus?.connected === true;
  const triggerLabel = oracleConnected ? activeEnv?.env_name || 'Credentials Saved' : 'Connect';

  return (
    <>
      <div className="max-w-[1400px] mx-auto space-y-6 animate-in fade-in duration-250 p-6 lg:p-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100 tracking-tight flex items-center gap-3">
              <BarChart3 className="text-[#185FA5]" size={32} /> BIP Reporting Cockpit
            </h1>
            <p className="text-gray-500 dark:text-slate-400 mt-2">
              Run fixed Oracle DUAL presets for quick checks or execute saved SQL reports against your connected environment.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => void fetchQueries()}
              disabled={queriesLoading}
              className="gap-2 border-[#185FA5]/20 text-[#185FA5] hover:bg-[#185FA5]/5"
            >
              {queriesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TerminalSquare className="h-4 w-4" />}
              Refresh Presets
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={oracleConnected ? 'outline' : 'default'}
                  className={oracleConnected
                    ? 'gap-2 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                    : 'gap-2 bg-[#185FA5] text-white'}
                  size="lg"
                >
                  <Server className="h-5 w-5" />
                  {triggerLabel}
                  <ChevronDown className="h-4 w-4 opacity-50 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[260px] dark:bg-[#0C1425] dark:border-white/10">
                <DropdownMenuLabel className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="size-8 rounded-lg flex items-center justify-center"
                      style={{ background: oracleConnected ? 'linear-gradient(135deg,#059669,#10B981)' : 'linear-gradient(135deg,#475569,#64748B)' }}
                    >
                      <Server size={15} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate dark:text-white">{oracleConnected ? 'Credentials Saved' : 'Not Connected'}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{activeEnv ? activeEnv.env_name : 'Set up an environment to connect'}</p>
                    </div>
                    {oracleConnected && <Zap size={13} className="text-emerald-400 shrink-0" />}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={() => (savedSessions.length > 0 ? setIsAddAccountOpen(true) : setIsEnvSetupOpen(true))}
                    className="gap-2.5 px-3 py-2 cursor-pointer"
                  >
                    {savedSessions.length > 0 ? <UserPlus size={14} className="text-emerald-400" /> : <Globe size={14} className="text-blue-400" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{savedSessions.length > 0 ? 'Add More Account' : 'Add Account'}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {savedSessions.length > 0 ? 'Add secondary credentials' : 'Connect to an Oracle environment'}
                      </p>
                    </div>
                  </DropdownMenuItem>
                  {savedSessions.length > 0 && (
                    <DropdownMenuItem onSelect={() => setIsEditCredsOpen(true)} className="gap-2.5 px-3 py-2 cursor-pointer">
                      <Pencil size={14} className="text-amber-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">Edit Credentials</p>
                        <p className="text-[10px] text-muted-foreground">Modify active connection</p>
                      </div>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                {savedSessions.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2.5 px-3 py-2 cursor-pointer">
                        <Users size={14} className="text-purple-400" />
                        <span className="text-sm font-medium">Switch Account</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="dark:bg-[#0C1425] dark:border-white/10">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-3">
                          Available Accounts
                        </DropdownMenuLabel>
                        {savedSessions.map((session) => (
                          <DropdownMenuItem
                            key={session.id}
                            className="gap-2.5 px-3 py-2 cursor-pointer"
                            onSelect={() => handleSwitchEnv(session)}
                          >
                            <Key size={13} className={activeEnv?.id === session.id ? 'text-emerald-400' : 'text-muted-foreground'} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium flex items-center gap-1.5">
                                {session.env_name}
                                {activeEnv?.id === session.id && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                    ACTIVE
                                  </span>
                                )}
                              </p>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setIsDeleteAllOpen(true)}
                      className="gap-2.5 px-3 py-2 cursor-pointer"
                    >
                      <Trash2 size={14} />
                      <span className="text-sm font-medium">Delete All Users</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="border dark:border-white/10 shadow-sm rounded-xl bg-white dark:bg-slate-950">
            <div
              className="px-6 py-5 flex flex-col xl:flex-row xl:items-center gap-6"
              style={{ background: 'linear-gradient(145deg, rgba(24,95,165,0.06) 0%, rgba(13,59,110,0.04) 100%)' }}
            >
              <div className="w-full xl:w-[460px]">
                <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                  Oracle DUAL Presets
                </label>
                <Popover open={openPresetCombobox} onOpenChange={setOpenPresetCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openPresetCombobox}
                      className="w-full justify-between bg-white dark:bg-[#0C1425] border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 h-12"
                    >
                      {selectedQuery ? (
                        <div className="flex items-center gap-2 truncate">
                          <TerminalSquare className="h-4 w-4 text-[#185FA5] shrink-0" />
                          <span className="truncate">{selectedQuery.report_name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          {queriesLoading ? 'Loading Oracle DUAL queries...' : 'Select a DUAL query...'}
                        </span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[460px] p-0 shadow-xl dark:bg-[#0C1425] dark:border-white/10" align="start">
                    <Command className="dark:bg-[#0C1425]">
                      <CommandInput placeholder="Search by module name or report name..." className="h-11" />
                      <CommandList className="max-h-[320px] overflow-y-auto">
                        <CommandEmpty>No DUAL queries found.</CommandEmpty>
                        <CommandGroup heading="Available DUAL Queries">
                          {queries.map((query) => (
                            <CommandItem
                              key={query.id}
                              value={`${query.module} ${query.report_name}`}
                              onSelect={() => handleSelectQuery(query)}
                              className="cursor-pointer py-2.5"
                            >
                              <div className="flex items-center w-full">
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4 text-[#185FA5]',
                                    selectedQuery?.id === query.id ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="text-sm font-medium truncate dark:text-slate-200">{query.report_name}</span>
                                  <span className="text-[10px] uppercase text-muted-foreground font-semibold">{query.module}</span>
                                </div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex-1 min-w-0 bg-white/50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 p-4">
                {selectedQuery ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-md bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                        <Layers size={14} className="text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Module</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{selectedQuery.module}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-md bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                        <Server size={14} className="text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Target</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{selectedQuery.target_label}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="size-8 rounded-md bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center shrink-0">
                        <Info size={14} className="text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Description</p>
                        <p className="text-xs text-gray-600 dark:text-slate-300 line-clamp-2 mt-0.5">
                          {selectedQuery.description || 'Runs a lightweight Oracle DUAL query using preset credentials.'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-2">
                    Select a preset query to view details.
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-2 xl:pl-6 xl:border-l xl:border-gray-200 dark:xl:border-white/10 w-full xl:w-auto">
                <Button
                  onClick={handleRunQuery}
                  disabled={queriesLoading || presetRunning || !selectedQuery}
                  className="w-full xl:w-auto gap-2.5 bg-[#185FA5] hover:bg-[#0D3B6E] text-white shadow-lg hover:shadow-xl transition-all px-8 h-12 text-sm font-semibold"
                  size="lg"
                >
                  {presetRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
                  {presetRunning ? 'Running Preset...' : 'Run DUAL Query'}
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  {selectedQuery ? `${selectedQuery.module} | ${selectedQuery.report_name}` : 'Pick a query first'}
                </p>
              </div>
            </div>
          </Card>

          <Card className="border dark:border-white/10 shadow-sm rounded-xl bg-white dark:bg-slate-950">
            <div
              className="px-6 py-5 flex flex-col xl:flex-row xl:items-center gap-6"
              style={{ background: 'linear-gradient(145deg, rgba(16,185,129,0.05) 0%, rgba(13,59,110,0.03) 100%)' }}
            >
              <div className="w-full xl:w-[460px]">
                <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                  Saved Oracle Reports
                </label>
                <Popover open={openReportCombobox} onOpenChange={setOpenReportCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openReportCombobox}
                      className="w-full justify-between bg-white dark:bg-[#0C1425] border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 h-12"
                    >
                      {selectedReport ? (
                        <div className="flex items-center gap-2 truncate">
                          <FileSpreadsheet className="h-4 w-4 text-[#185FA5] shrink-0" />
                          <span className="truncate">{selectedReport.report_name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          {reportsLoading ? 'Loading saved reports...' : 'Search by module or report name...'}
                        </span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="p-0 shadow-2xl border border-gray-200 dark:border-white/10 dark:bg-[#0C1425] z-50 overflow-hidden"
                    style={{ width: 'var(--radix-popover-trigger-width)' }}
                    align="start"
                    side="bottom"
                    sideOffset={8}
                  >
                    <Command className="dark:bg-[#0C1425]">
                      <CommandInput placeholder="Search reports (e.g. HCM, Invoice)..." className="h-11" />
                      <CommandList className="max-h-[300px] overflow-y-auto">
                        <CommandEmpty>No reports found.</CommandEmpty>
                        <CommandGroup heading="Available Reports">
                          {reports.map((report) => (
                            <CommandItem
                              key={report.id}
                              value={`${report.module} ${report.report_name}`}
                              onSelect={() => handleSelectReport(report)}
                              className="cursor-pointer py-2.5"
                            >
                              <div className="flex items-center w-full">
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4 text-[#185FA5]',
                                    selectedReport?.id === report.id ? 'opacity-100' : 'opacity-0',
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
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex-1 min-w-0 bg-white/50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 p-4">
                {selectedReport ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-md bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                        <Layers size={14} className="text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Module</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{selectedReport.module}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-md bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                        <Server size={14} className="text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Environment</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                          {activeEnv ? activeEnv.env_name : 'Connect Oracle to run'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="size-8 rounded-md bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center shrink-0">
                        <Info size={14} className="text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Description</p>
                        <p className="text-xs text-gray-600 dark:text-slate-300 line-clamp-2 mt-0.5">
                          {selectedReport.description || 'No description available'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-2">
                    Select a saved report to view details.
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-2 xl:pl-6 xl:border-l xl:border-gray-200 dark:xl:border-white/10 w-full xl:w-auto">
                <Button
                  onClick={handleRunReport}
                  disabled={reportsLoading || reportRunning || !selectedReport || !activeEnv}
                  className="w-full xl:w-auto gap-2.5 bg-[#185FA5] hover:bg-[#0D3B6E] text-white shadow-lg hover:shadow-xl transition-all px-8 h-12 text-sm font-semibold"
                  size="lg"
                >
                  {reportRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
                  {reportRunning ? 'Running Report...' : 'Run Saved Report'}
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  {activeEnv ? `Targeting ${activeEnv.env_name}` : 'Connect to Oracle first'}
                </p>
              </div>
            </div>
          </Card>

          <Card className="border dark:border-white/10 shadow-sm rounded-xl overflow-hidden bg-white dark:bg-slate-950">
            <div className="border-b dark:border-white/10 bg-gray-50 dark:bg-slate-900 px-6 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-[#185FA5]/10 dark:bg-[#185FA5]/20 flex items-center justify-center">
                  <Database size={16} className="text-[#185FA5]" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Oracle Execution Results</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {hasResults ? `${tableData.length} rows retrieved` : 'Run a preset query or saved report to view the dataset'}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                disabled={!lastWorkbook}
                onClick={() => {
                  if (!lastWorkbook || !lastWorkbookName) return;
                  downloadWorkbook(lastWorkbook, lastWorkbookName);
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
                  <p className="text-base font-medium text-gray-500 dark:text-slate-400">Waiting for Oracle execution...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-900 border-b-2 dark:border-white/10">
                        {Object.keys(tableData[0]).map((key) => (
                          <TableHead
                            key={key}
                            className="font-bold text-xs uppercase tracking-wider text-gray-700 dark:text-slate-300 py-4 h-auto whitespace-nowrap"
                          >
                            {key.replace(/_/g, ' ')}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.map((row, index) => (
                        <TableRow key={index} className="transition-colors hover:bg-[#185FA5]/5 border-b dark:border-white/5">
                          {Object.keys(tableData[0]).map((col) => {
                            const value = String(row[col] ?? '');
                            const normalizedCol = col.toLowerCase();

                            return (
                              <TableCell key={col} className="text-sm py-3 font-medium whitespace-nowrap">
                                {normalizedCol === 'module' ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-500/20">
                                    {value}
                                  </span>
                                ) : normalizedCol === 'status' ? (
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold border ${value === 'COMPLETED' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20'}`}>
                                    {value}
                                  </span>
                                ) : (
                                  <span className="text-gray-600 dark:text-slate-300">{value}</span>
                                )}
                              </TableCell>
                            );
                          })}
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
