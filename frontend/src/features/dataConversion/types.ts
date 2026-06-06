import type { LucideIcon } from 'lucide-react';

export type EntityLifecycleState = 'pending' | 'prepared' | 'submitted';

export interface Entity {
  id: string;
  name: string;
  lifecycleState: EntityLifecycleState;
}

export interface MappingRule {
  ColumnOrder?: string | null;
  HDL?: string | null;
  InputColumnName?: string | null;
  [key: string]: unknown;
}

export interface ExcelRow {
  [key: string]: unknown;
}

export interface ParsedWorkbookData {
  entityNames: string[];
  excelData: Record<string, ExcelRow[]>;
  mappingConfigs: Record<string, MappingRule[]>;
  entityDataSheetNames: Record<string, string>;
}

export interface BusinessObject {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
  loadTitle?: string;
  loadInstructions?: string;
  defaultEntities?: string[];
}

export interface ModuleConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
  accentColor: string;
  gradientFrom: string;
  gradientTo: string;
  tagColor: string;
  objects: BusinessObject[];
}
