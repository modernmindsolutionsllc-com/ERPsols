/**
 * UniversalETLScreen.tsx
 * ──────────────────────
 * A single, highly reusable component that adapts to ANY module + business object
 * combination. Implements the 4-step ETL stepper:
 *   Extract/Upload -> Validate -> Preview -> Load to Oracle
 *
 * DRY: This ONE component handles every business object.
 * No separate files per object — just pass different props.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload, CheckCircle2, FileSpreadsheet, Loader2,
  ArrowLeft, AlertCircle, Rocket, X, FileUp, Download,
} from 'lucide-react';
import type { ModuleConfig, BusinessObject } from '@/config/dataLoaderConfig';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface Entity {
  id: string;
  name: string;
  lifecycleState: 'pending' | 'prepared' | 'submitted';
}

interface UniversalETLScreenProps {
  module: ModuleConfig;
  object: BusinessObject;
  onBack: () => void;
}

type ETLStep = 'upload' | 'validate' | 'load';

const STEPS: { key: ETLStep; label: string; icon: typeof Upload }[] = [
  { key: 'upload', label: 'Extract / Upload', icon: Upload },
  { key: 'validate', label: 'Validate', icon: CheckCircle2 },
  { key: 'load', label: 'Load to Oracle', icon: Rocket },
];



export function UniversalETLScreen({ module, object, onBack }: UniversalETLScreenProps) {
  const [currentStep, setCurrentStep] = useState<ETLStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<'success' | 'error' | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [totalRecords] = useState(5);
  const [passedRecords] = useState(5);
  const [excelData, setExcelData] = useState<Record<string, any[]>>({});
  const [mappingConfigs, setMappingConfigs] = useState<Record<string, Array<{ ColumnOrder: string; HDL: string | null; InputColumnName: string | null }>>>({});
  const [dynamicEntities, setDynamicEntities] = useState<string[]>([]);
  const [entities, setEntities] = useState<Entity[]>([
    { id: 'location', name: 'Location', lifecycleState: 'pending' },
    { id: 'job', name: 'Job', lifecycleState: 'pending' },
    { id: 'department', name: 'Department', lifecycleState: 'pending' },
    { id: 'grade', name: 'Grade', lifecycleState: 'pending' },
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dynamicEntities.length > 0) {
      setEntities(
        dynamicEntities.map(name => ({
          id: name.toLowerCase().replace(/\s+/g, '_'),
          name: name,
          lifecycleState: 'pending',
        }))
      );
    }
  }, [dynamicEntities]);

  const stepIndex = STEPS.findIndex(s => s.key === currentStep);
  const successPercentage = Math.round((passedRecords / totalRecords) * 100);

  // ── Drag & Drop handlers ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.name.endsWith('.xlsx')) {
      setFile(dropped);
      setValidationResult(null);
      setValidationErrors([]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.name.endsWith('.xlsx')) {
      setFile(selected);
      setValidationResult(null);
      setValidationErrors([]);
    }
  }, []);

  // ── Mock Actions ──
  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    setCurrentStep('validate');
    setValidationResult(null);
    setValidationErrors([]);

    // Simulate network delay
    await new Promise(r => setTimeout(r, 2200));

    // Mock: 85% chance of success
    const success = Math.random() > 0.15;
    if (success) {
      setValidationResult('success');
      setValidationErrors([]);

      // Extract Excel sheet names and parse individual sheet data locally using xlsx
      if (file) {
        try {
          const reader = new FileReader();
          reader.onload = (e) => {
            const data = e.target?.result;
            if (data) {
              const workbook = XLSX.read(data, { type: 'array' });
              
              // 1. Extract Sheet Names as entities
              const sheetNames = workbook.SheetNames.filter(
                name => !name.toLowerCase().includes('sheet')
              );
              const finalSheets = sheetNames.length > 0 ? sheetNames : workbook.SheetNames;

              // 2. Parse and store data & HDL rules for each sheet
              const parsedExcelData: Record<string, any[]> = {};
              const parsedConfigs: Record<string, any[]> = {};

              finalSheets.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                if (worksheet) {
                  const sheetRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);
                  
                  // 1. Store the sheet rows directly as the configuration mapping rules!
                  parsedConfigs[sheetName] = sheetRows;

                  // 2. Generate a mock excelData row where the value for each InputColumnName is the InputColumnName itself
                  const mockRow: Record<string, any> = {};
                  sheetRows.forEach(row => {
                    const order = row.ColumnOrder || '';
                    if (order.startsWith('B')) {
                      const inputCol = row.InputColumnName;
                      if (inputCol && inputCol !== 'Null' && inputCol !== 'NULL') {
                        mockRow[inputCol] = inputCol;
                      }
                    }
                  });
                  parsedExcelData[sheetName] = [mockRow];
                }
              });

              setExcelData(parsedExcelData);
              setMappingConfigs(parsedConfigs);
              setDynamicEntities(finalSheets);
            }
          };
          reader.readAsArrayBuffer(file);
        } catch (err) {
          console.error("Error reading xlsx sheets:", err);
          setDynamicEntities(['Location', 'Job', 'Department', 'Grade']);
        }
      } else {
        setDynamicEntities(['Location', 'Job', 'Department', 'Grade']);
      }
    } else {
      setValidationResult('error');
      setValidationErrors([
        'Row 14: Missing required field "Person Number".',
        'Row 27: Invalid date format in "Effective Start Date".',
      ]);
    }
    setIsValidating(false);
  }, [file]);

  const handleDownloadReport = useCallback(() => {
    console.log('Downloading validation report...');
    alert('Download Validation Report: Report generated successfully.');
  }, []);

  const handleDeploy = useCallback(() => {
    setCurrentStep('load');
  }, []);

  const handlePrepare = useCallback(async (id: string, name: string) => {
    const sheetData = excelData[name] || [];
    const sheetConfig = mappingConfigs[name] || [];

    if (sheetConfig.length === 0) {
      toast.error(`No configuration rules available for sheet: ${name}`);
      return;
    }

    try {
      // 1. Build the 'A' Series Line (Headers):
      const aRules = sheetConfig
        .filter(rule => rule.ColumnOrder && rule.ColumnOrder.startsWith('A'))
        .sort((a, b) => {
          const numA = parseInt(a.ColumnOrder.slice(1), 10);
          const numB = parseInt(b.ColumnOrder.slice(1), 10);
          return numA - numB;
        });

      const aLine = aRules
        .map(rule => {
          const hdlVal = rule.HDL;
          const isNull = hdlVal === null || hdlVal === undefined || String(hdlVal).toUpperCase() === 'NULL' || String(hdlVal).trim() === '';
          if (!isNull) {
            return String(hdlVal);
          }
          return rule.InputColumnName ?? '';
        })
        .join('|');

      // 2. Build the 'B' Series Lines (Data Rows):
      const bRules = sheetConfig
        .filter(rule => rule.ColumnOrder && rule.ColumnOrder.startsWith('B'))
        .sort((a, b) => {
          const numA = parseInt(a.ColumnOrder.slice(1), 10);
          const numB = parseInt(b.ColumnOrder.slice(1), 10);
          return numA - numB;
        });

      const bLines = sheetData.map(row => {
        const rowValues = bRules.map(rule => {
          const hdlVal = rule.HDL;
          const isNull = hdlVal === null || hdlVal === undefined || String(hdlVal).toUpperCase() === 'NULL' || String(hdlVal).trim() === '';
          if (!isNull) {
            return String(hdlVal);
          }
          const key = rule.InputColumnName;
          if (key) {
            const val = row[key];
            return val !== undefined && val !== null ? String(val) : '';
          }
          return '';
        });
        return rowValues.join('|');
      });

      // Combine 'A' line and 'B' lines
      const combinedTextContent = [aLine, ...bLines].join('\n');

      // 3. The Zipper (JSZip Integration):
      const zip = new JSZip();
      zip.file(`${name}.dat`, combinedTextContent);

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${name}.zip`);

      // 4. UI Lifecycle Update
      setEntities(prev => prev.map(e => e.id === id ? { ...e, lifecycleState: 'prepared' } : e));
      toast.success(`${name}.zip prepared and downloaded successfully!`);
    } catch (err) {
      console.error("HDL generation or zipping failed:", err);
      toast.error(`Failed to prepare entity ${name}.`);
    }
  }, [excelData, mappingConfigs]);

  const handleSubmit = useCallback((id: string) => {
    setEntities(prev => prev.map(e => e.id === id ? { ...e, lifecycleState: 'submitted' } : e));
    toast.success(`Entity submitted to Oracle HCM Cloud successfully.`);
  }, []);

  const handleViewStatus = useCallback((id: string) => {
    toast.info(`Viewing status logs for entity: ${id}`);
  }, []);

  const handleReset = useCallback(() => {
    setFile(null);
    setCurrentStep('upload');
    setValidationResult(null);
    setValidationErrors([]);
    setExcelData({});
    setMappingConfigs({});
    setDynamicEntities([]);
    setEntities([
      { id: 'location', name: 'Location', lifecycleState: 'pending' },
      { id: 'job', name: 'Job', lifecycleState: 'pending' },
      { id: 'department', name: 'Department', lifecycleState: 'pending' },
      { id: 'grade', name: 'Grade', lifecycleState: 'pending' },
    ]);
  }, []);

  const ObjectIcon = object.icon;

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      {/* ── Back + Header ── */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors mb-5 group"
      >
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
        Back to {module.label}
      </button>

      <div
        className="relative overflow-hidden rounded-2xl mb-8"
        style={{ background: `linear-gradient(135deg, ${module.gradientFrom} 0%, ${module.gradientTo} 100%)` }}
      >
        <div
          className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full opacity-20"
          style={{ background: `radial-gradient(circle, ${module.tagColor} 0%, transparent 70%)` }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
        <div className="pointer-events-none absolute -bottom-4 -right-4 opacity-10">
          <ObjectIcon size={160} strokeWidth={0.8} className="text-white" />
        </div>
        <div className="relative z-10 px-7 py-7 lg:px-10 lg:py-8">
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <ObjectIcon size={22} className="text-white" strokeWidth={1.75} />
            </div>
            <div>
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold mb-1.5 tracking-wide"
                style={{ background: `${module.accentColor}30`, color: module.tagColor }}
              >
                {module.label}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                {object.label}
              </h1>
              <p className="mt-1 text-sm text-white/50">{object.description}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── ETL Stepper ── */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between max-w-[700px] mx-auto">
          {STEPS.map((step, i) => {
            const StepIcon = step.icon;
            const status = i < stepIndex ? 'completed' : i === stepIndex ? 'active' : 'pending';
            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                      status === 'completed'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                        : status === 'active'
                          ? 'bg-white dark:bg-slate-800 border-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-lg shadow-emerald-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {status === 'completed' ? <CheckCircle2 size={18} /> : <StepIcon size={16} />}
                  </div>
                  <span className={`text-[11px] mt-2 font-semibold tracking-wide ${
                    status === 'completed'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : status === 'active'
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-400 dark:text-slate-500'
                  }`}>
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-3 rounded-full transition-colors duration-300 ${
                    i < stepIndex ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-white/10'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Step Content ── */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">

        {/* STEP 1: Upload */}
        {currentStep === 'upload' && (
          <div className="p-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
              Upload .xlsx File
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Drag and drop your Excel file below, or click to browse. Only <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono">.xlsx</code> files are accepted.
            </p>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 scale-[1.01]'
                  : file
                    ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/10'
                    : 'border-slate-300 dark:border-white/15 hover:border-slate-400 dark:hover:border-white/25 hover:bg-slate-50 dark:hover:bg-white/[0.02]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleFileSelect}
                className="hidden"
              />

              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                    <FileSpreadsheet size={28} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{file.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium mt-1"
                  >
                    <X size={12} /> Remove file
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                    <FileUp size={28} className="text-slate-400 dark:text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Drop your <span style={{ color: module.accentColor }}>.xlsx</span> file here
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      or click to browse from your computer
                    </p>
                  </div>
                </div>
              )}
            </div>

            {file && (
              <div className="flex justify-end mt-6">
                <button
                  onClick={handleValidate}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 hover:shadow-lg"
                  style={{ background: module.accentColor }}
                >
                  <CheckCircle2 size={16} />
                  Run Validation
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Validate */}
        {currentStep === 'validate' && (
          <div className="p-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
              Data Validation
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Checking data integrity, required fields, and format compliance for <strong>{object.label}</strong>.
            </p>

            {isValidating && (
              <div className="flex flex-col items-center py-12 gap-4">
                <Loader2 size={40} className="animate-spin text-emerald-500" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Validating {file?.name}...</p>
                <div className="w-64 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full animate-pulse" style={{ width: '65%' }} />
                </div>
              </div>
            )}

            {validationResult === 'success' && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/20 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle2 size={22} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Validation Passed</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">{successPercentage}% of records passed schema checks. No errors found.</p>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleDownloadReport}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-all hover:shadow-md"
                  >
                    <Download size={16} />
                    Download Validation Report
                  </button>
                  <button
                    onClick={handleDeploy}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:shadow-lg"
                    style={{ background: module.accentColor }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {validationResult === 'error' && (
              <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                    <AlertCircle size={22} className="text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-800 dark:text-red-300">Validation Failed</p>
                    <p className="text-xs text-red-600 dark:text-red-400">{validationErrors.length} error(s) found. Fix and re-upload.</p>
                  </div>
                </div>
                <ul className="space-y-2 mb-6">
                  {validationErrors.map((err, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
                      <AlertCircle size={14} className="mt-0.5 shrink-0" />
                      {err}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                  <Upload size={14} />
                  Re-Upload File
                </button>
              </div>
            )}
          </div>
        )}



        {/* STEP 3: Load to Oracle (Entity Lifecycle Management) */}
        {currentStep === 'load' && (
          <div className="p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                  Deploy & Load to Oracle Cloud
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Perform granular lifecycle management for all target HCM entities.
                </p>
              </div>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all hover:shadow-sm"
              >
                <Upload size={14} />
                Upload Another File
              </button>
            </div>

            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl p-6 shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-100 dark:border-white/5 pb-4 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Workforce Structure
                  </h3>
                  <div className="mt-2 inline-flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 rounded-lg p-3 max-w-[650px] leading-relaxed">
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
                    <span>
                      Manage the HCM Data Loader lifecycle for each entity. Please load the objects in the displayed order to prevent data dependency errors.
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                {entities.map((entity, index) => {
                  const isPending = entity.lifecycleState === 'pending';
                  const isPrepared = entity.lifecycleState === 'prepared';
                  const isSubmitted = entity.lifecycleState === 'submitted';

                  return (
                    <div
                      key={entity.id}
                      className="flex justify-between items-center py-4 border-b border-slate-100 dark:border-white/5 last:border-0 hover:bg-slate-50 dark:hover:bg-white/[0.01] px-4 rounded-lg transition-colors animate-fade-in"
                    >
                      {/* Left Side: Index + Name */}
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono text-slate-400 dark:text-slate-500">
                          {(index + 1).toString().padStart(2, '0')}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {entity.name}
                        </span>
                      </div>

                      {/* Right Side: Button Group */}
                      <div className="flex items-center gap-3">
                        {/* Prepare Button */}
                        <button
                          onClick={() => handlePrepare(entity.id, entity.name)}
                          disabled={!isPending}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                            isPending
                              ? 'border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 shadow-sm'
                              : 'border-emerald-200/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 cursor-default'
                          }`}
                        >
                          {isPending ? (
                            'Prepare'
                          ) : (
                            <>
                              <CheckCircle2 size={12} />
                              Prepared
                            </>
                          )}
                        </button>

                        {/* Submit Button */}
                        <button
                          onClick={() => handleSubmit(entity.id)}
                          disabled={!isPrepared}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                            isPrepared
                              ? 'text-white shadow-md shadow-emerald-500/20 hover:brightness-110'
                              : isSubmitted
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-default'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                          }`}
                          style={{
                            background: isPrepared ? module.accentColor : undefined,
                          }}
                        >
                          {isSubmitted ? 'Submitted' : 'Submit'}
                        </button>

                        {/* Status Button/Badge */}
                        <button
                          onClick={() => handleViewStatus(entity.id)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 ${
                            isSubmitted
                              ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                              : isPrepared
                                ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50'
                          }`}
                        >
                          <span>Status Log</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
