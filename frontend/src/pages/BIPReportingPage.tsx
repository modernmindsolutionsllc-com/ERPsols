import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  BarChart3,
  Clock,
  Database,
  KeyRound,
  Loader2,
  PlayCircle,
  PlusCircle,
  TerminalSquare,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { usePermission, useToolAccess } from '@/hooks/usePermission';
import { bipReportingApi, type BipReportResponse, type OracleStatus } from '@/services/api';
import { CreateBipReportModal } from '@/components/CreateBipReportModal';
import { ConnectOracleModal } from '@/components/shared/ConnectOracleModal';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function downloadWorkbook(blob: Blob, filePrefix: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
  a.download = `${filePrefix}_${timestamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function isApiError(value: unknown): value is { error: { message: string } } {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export function BIPReportingPage() {
  const { user } = useAuth();
  const canAccess = usePermission('run_bip_report') || useToolAccess('bip_reporting');

  const [reports, setReports] = useState<BipReportResponse[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [oracleStatus, setOracleStatus] = useState<OracleStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isRunningSql, setIsRunningSql] = useState(false);
  const [bipModalOpen, setBipModalOpen] = useState(false);
  const [oracleModalOpen, setOracleModalOpen] = useState(false);
  const [directModule, setDirectModule] = useState('Ad Hoc');
  const [directReportName, setDirectReportName] = useState('Direct_SQL_Report');
  const [directSql, setDirectSql] = useState('select 1 from dual');

  useEffect(() => {
    void fetchReports();
    void fetchOracleStatus();
  }, []);

  const fetchReports = async () => {
    setIsLoading(true);
    const res = await bipReportingApi.getBipReports();
    if (isApiError(res)) {
      toast.error(res.error.message || 'Failed to fetch reports.');
    } else {
      setReports(res);
    }
    setIsLoading(false);
  };

  const fetchOracleStatus = async () => {
    const res = await bipReportingApi.getOracleStatus();
    if (!isApiError(res)) setOracleStatus(res);
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(reports.map(r => r.id)) : new Set());
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  const handleExecuteSelected = async () => {
    if (selectedIds.size === 0) return;

    setIsExecuting(true);
    toast.info('Executing selected reports in Oracle...', { id: 'oracle-exec' });

    const response = await bipReportingApi.executeBipReports(Array.from(selectedIds));

    toast.dismiss('oracle-exec');
    if (isApiError(response)) {
      toast.error(response.error.message || 'Execution failed.');
    } else {
      toast.success('Report generated. Downloading workbook...');
      downloadWorkbook(response, 'Oracle_Config_Extract');
    }
    setIsExecuting(false);
  };

  const handleRunDirectSql = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!directModule.trim() || !directReportName.trim() || !directSql.trim()) {
      toast.error('Module, report name, and SQL query are required.');
      return;
    }

    setIsRunningSql(true);
    toast.info('Running SQL in Oracle BIP...', { id: 'direct-sql' });

    const response = await bipReportingApi.executeSql({
      module: directModule,
      report_name: directReportName,
      sql_query: directSql,
    });

    toast.dismiss('direct-sql');
    if (isApiError(response)) {
      toast.error(response.error.message || 'SQL execution failed.');
    } else {
      toast.success('SQL report generated. Downloading workbook...');
      downloadWorkbook(response, directReportName || 'BIP_SQL_Report');
    }
    setIsRunningSql(false);
  };

  if (!user) return <Navigate to="/login" />;
  if (!canAccess) return <Navigate to="/dashboard" />;

  const isAllSelected = reports.length > 0 && selectedIds.size === reports.length;
  const oracleConnected = oracleStatus?.connected === true;

  return (
    <>
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-250 p-6 lg:p-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100 tracking-tight flex items-center gap-3">
              <BarChart3 className="text-[#185FA5]" size={32} />
              BIP Reporting Tool
            </h1>
            <p className="text-gray-500 dark:text-slate-400 mt-2">
              Connect Oracle, run SQL through the BIP executor, and download the generated workbook from this page.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => setOracleModalOpen(true)}
              variant={oracleConnected ? 'outline' : 'default'}
              className={oracleConnected
                ? 'gap-2 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                : 'gap-2 bg-[#185FA5] text-white'}
              size="lg"
            >
              <KeyRound className="h-5 w-5" />
              {oracleConnected ? 'Oracle Connected' : 'Connect Oracle'}
            </Button>
            <Button
              onClick={() => setBipModalOpen(true)}
              variant="outline"
              className="gap-2 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-800 dark:hover:text-emerald-200"
              size="lg"
            >
              <PlusCircle className="h-5 w-5" />
              Save SQL Report
            </Button>
          </div>
        </div>

        <Card className="border dark:border-white/10 shadow-sm rounded-xl overflow-hidden bg-white dark:bg-slate-950">
          <div className="border-b dark:border-white/10 bg-gray-50 dark:bg-slate-900 px-5 py-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-[#185FA5] flex items-center gap-2">
              <TerminalSquare size={16} />
              Run SQL Query
            </div>
            <span className="text-xs text-gray-500 dark:text-slate-400">
              {oracleConnected ? `Connected as ${oracleStatus?.oracle_username}` : 'Oracle credentials required'}
            </span>
          </div>

          <form onSubmit={handleRunDirectSql} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="direct-module">Module</Label>
                <Input
                  id="direct-module"
                  value={directModule}
                  onChange={event => setDirectModule(event.target.value)}
                  disabled={isRunningSql}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="direct-report-name">Report Name</Label>
                <Input
                  id="direct-report-name"
                  value={directReportName}
                  onChange={event => setDirectReportName(event.target.value)}
                  disabled={isRunningSql}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="direct-sql">SQL Query</Label>
              <Textarea
                id="direct-sql"
                value={directSql}
                onChange={event => setDirectSql(event.target.value)}
                disabled={isRunningSql}
                className="min-h-[220px] font-mono text-sm"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!oracleConnected || isRunningSql}
                className="gap-2 bg-[#185FA5] hover:bg-[#0D3B6E] text-white"
                size="lg"
              >
                {isRunningSql ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
                {isRunningSql ? 'Running SQL...' : 'Run SQL & Download'}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="border dark:border-white/10 shadow-sm rounded-xl overflow-hidden bg-white dark:bg-slate-950">
          <div className="border-b dark:border-white/10 bg-gray-50 dark:bg-slate-900 px-5 py-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-[#185FA5] flex items-center gap-2">
              <Database size={16} />
              Saved Data Models
            </div>
            <Button
              onClick={handleExecuteSelected}
              disabled={selectedIds.size === 0 || isExecuting || !oracleConnected}
              className="bg-[#185FA5] hover:bg-[#0D3B6E] text-white shadow-md transition-all gap-2"
            >
              {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              {isExecuting ? 'Executing...' : `Run Selected (${selectedIds.size})`}
            </Button>
          </div>

          <div className="p-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin mb-4 text-[#185FA5]" />
                <p>Loading configurations...</p>
              </div>
            ) : reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-slate-500">
                <BarChart3 className="h-12 w-12 mb-4 opacity-20" />
                <p className="text-lg font-medium text-gray-600 dark:text-slate-300">No reports found.</p>
                <p className="text-sm mt-1">Use Save SQL Report on this page to add one.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-900">
                      <TableHead className="w-12 text-center">
                        <Checkbox
                          checked={isAllSelected}
                          onCheckedChange={handleSelectAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead className="font-semibold w-32">Module</TableHead>
                      <TableHead className="font-semibold">Report Name</TableHead>
                      <TableHead className="font-semibold text-right w-48">Created At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map(report => (
                      <TableRow
                        key={report.id}
                        className={`transition-colors ${selectedIds.has(report.id) ? 'bg-[#185FA5]/5' : ''}`}
                      >
                        <TableCell className="text-center">
                          <Checkbox
                            checked={selectedIds.has(report.id)}
                            onCheckedChange={checked => handleSelectOne(report.id, checked as boolean)}
                            aria-label={`Select ${report.report_name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-200">
                            {report.module}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-gray-900 dark:text-slate-100">
                          {report.report_name}
                        </TableCell>
                        <TableCell className="text-right text-gray-500 dark:text-slate-400 text-sm flex items-center justify-end gap-1.5">
                          <Clock size={14} className="opacity-70" />
                          {format(new Date(report.created_at), 'MMM d, yyyy HH:mm')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </Card>
      </div>

      <ConnectOracleModal
        open={oracleModalOpen}
        onOpenChange={open => {
          setOracleModalOpen(open);
          if (!open) void fetchOracleStatus();
        }}
      />

      <CreateBipReportModal
        open={bipModalOpen}
        onOpenChange={open => {
          setBipModalOpen(open);
          if (!open) void fetchReports();
        }}
      />
    </>
  );
}
