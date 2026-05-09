import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Navigate } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermission';
import { bipReportingApi, type BipReportResponse } from '@/services/api';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2, PlayCircle, BarChart3, Clock, Database, PlusCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Card } from '@/components/ui/card';
import { CreateBipReportModal } from '@/components/CreateBipReportModal';

export function BIPReportingPage() {
  const { user } = useAuth();
  const canAccess = usePermission('run_bip_report');
  
  const [reports, setReports] = useState<BipReportResponse[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [bipModalOpen, setBipModalOpen] = useState(false);

  // Fetch reports on mount
  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setIsLoading(true);
    const res = await bipReportingApi.getBipReports();
    if ('error' in res && res.error) {
      toast.error((res as any).error.message || 'Failed to fetch reports.');
    } else {
      setReports(res as unknown as BipReportResponse[]); 
    }
    setIsLoading(false);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(reports.map(r => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) newSet.add(id);
    else newSet.delete(id);
    setSelectedIds(newSet);
  };

  const handleExecute = async () => {
    if (selectedIds.size === 0) return;
    
    setIsExecuting(true);
    const idsToRun = Array.from(selectedIds);
    
    toast.info('Executing in Oracle...', { id: 'oracle-exec' });
    
    const response = await bipReportingApi.executeBipReports(idsToRun);
    
    toast.dismiss('oracle-exec');

    if ('error' in response && response.error) {
      toast.error((response as any).error.message || 'Execution failed.');
    } else {
      toast.success('Reports generated successfully! Downloading...');
      
      // Blob download logic
      const blob = response as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
      a.download = `Oracle_Config_Extract_${timestamp}.xlsx`;
      
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url); // prevent memory leak
    }
    
    setIsExecuting(false);
  };

  // RBAC verification
  if (!user) return <Navigate to="/login" />;
  if (!canAccess) return <Navigate to="/dashboard" />;

  const isAllSelected = reports.length > 0 && selectedIds.size === reports.length;

  return (
    <>
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-250 p-6 lg:p-8">
      
      {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              <BarChart3 className="text-[#185FA5]" size={32} />
              BIP Reporting Tool
            </h1>
            <p className="text-gray-500 mt-2">
              Select available dynamic SQL configurations and execute them directly against your Oracle Fusion environment.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              onClick={() => setBipModalOpen(true)}
              variant="outline"
              className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              size="lg"
            >
              <PlusCircle className="h-5 w-5" />
              New BIP Report
            </Button>
            
            <Button 
              onClick={handleExecute}
              disabled={selectedIds.size === 0 || isExecuting}
              className="bg-[#185FA5] hover:bg-[#0D3B6E] text-white shadow-md transition-all gap-2"
              size="lg"
            >
              {isExecuting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <PlayCircle className="h-5 w-5" />
              )}
              {isExecuting ? 'Executing...' : `Run Selected Reports (${selectedIds.size})`}
            </Button>
          </div>
        </div>

        {/* Main Content Area */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden bg-white">
          <div className="p-1 border-b bg-gray-50 flex items-center gap-2">
             {/* Decorative tabs effect */}
             <div className="px-4 py-2 text-sm font-medium text-[#185FA5] border-b-2 border-[#185FA5] bg-white rounded-t-md flex items-center gap-2">
               <Database size={16} /> Data Models
             </div>
          </div>
          
          <div className="p-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin mb-4 text-[#185FA5]" />
                <p>Loading configurations...</p>
              </div>
            ) : reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <BarChart3 className="h-12 w-12 mb-4 opacity-20" />
                <p className="text-lg font-medium text-gray-600">No reports found.</p>
                <p className="text-sm mt-1">Use the "New BIP Report" button in the TopBar to add one.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 hover:bg-gray-50">
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
                    {reports.map((report) => (
                      <TableRow 
                        key={report.id} 
                        className={`transition-colors ${selectedIds.has(report.id) ? 'bg-[#185FA5]/5' : ''}`}
                      >
                        <TableCell className="text-center">
                          <Checkbox 
                            checked={selectedIds.has(report.id)}
                            onCheckedChange={(checked) => handleSelectOne(report.id, checked as boolean)}
                            aria-label={`Select ${report.report_name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {report.module}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">
                          {report.report_name}
                        </TableCell>
                        <TableCell className="text-right text-gray-500 text-sm flex items-center justify-end gap-1.5">
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

      {/* Create BIP Report Modal */}
      <CreateBipReportModal
        open={bipModalOpen}
        onOpenChange={(open) => {
          setBipModalOpen(open);
          if (!open) fetchReports(); // refresh table after closing
        }}
      />
    </>
  );
}
