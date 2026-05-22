import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { bipReportingApi, hasError } from '@/services/api';

interface CreateBipReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateBipReportModal({ open, onOpenChange, onSuccess }: CreateBipReportModalProps) {
  const [module, setModule] = useState('Core HR');
  const [reportName, setReportName] = useState('Sample_Test_Report');
  const [sqlQuery, setSqlQuery] = useState('select 1 from dual');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!module || !reportName.trim() || !sqlQuery.trim()) {
      toast.error('Please fill in all fields.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await bipReportingApi.createBipReport({
        module,
        report_name: reportName,
        sql_query: sqlQuery,
      });

      if (hasError(response)) {
        toast.error(response.error.message || 'Failed to save BIP report configuration.');
      } else {
        toast.success('BIP Report Configuration added successfully!');
        if (onSuccess) onSuccess();
        onOpenChange(false);
        // Reset form to defaults
        setModule('Core HR');
        setReportName('Sample_Test_Report');
        setSqlQuery('select 1 from dual');
      }
    } catch (error) {
      toast.error('An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <PlusCircle className="text-[#185FA5]" size={24} />
            Add BIP Report Configuration
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="module">Module</Label>
            <Select value={module} onValueChange={setModule} disabled={isSubmitting}>
              <SelectTrigger id="module">
                <SelectValue placeholder="Select Module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Core HR">Core HR</SelectItem>
                <SelectItem value="Payroll">Payroll</SelectItem>
                <SelectItem value="Benefits">Benefits</SelectItem>
                <SelectItem value="Talent">Talent</SelectItem>
                <SelectItem value="Absence">Absence</SelectItem>
                <SelectItem value="OTL">OTL</SelectItem>
                <SelectItem value="Setup">Setup</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="report-name">Report Name</Label>
            <Input
              id="report-name"
              placeholder="e.g., Employee_Extract"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sql-query">SQL Query</Label>
            <Textarea
              id="sql-query"
              placeholder="SELECT * FROM..."
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              disabled={isSubmitting}
              className="font-mono text-sm min-h-[200px]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-[#185FA5] hover:bg-[#0D3B6E] text-white min-w-[120px]"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
