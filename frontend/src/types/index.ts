// Types for MigrateOS

export type UserRole = 'user' | 'enterprise' | 'admin' | 'Viewer' | 'Analyst' | 'Engineer' | 'Admin';
export type ToolKey = 'config_snapshot' | 'data_conversion' | 'payroll' | 'bip_reporting';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tool_access?: ToolKey[];
}

export interface SignupPayload {
  username: string;
  email: string;
  password: string;
  role: 'user';
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface Snapshot {
  id: string;
  endpoint: string;
  timestamp: string;
  status: 'Captured' | 'Processing' | 'Completed' | 'Failed';
  delta: { added: number; removed: number; changed: number };
  diff?: SnapshotDiff[];
}

export interface SnapshotDiff {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  type: 'added' | 'removed' | 'changed';
}

export type ETLStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ETLJob {
  id: string;
  source: string;
  target: string;
  status: ETLStatus;
  progress: number;
  startedAt: string;
  completedAt?: string;
  recordsProcessed?: number;
  duration?: string;
}

export interface Report {
  id: string;
  type: 'ETL Performance' | 'Data Quality';
  dateRange: string;
  generatedAt: string;
  format: 'PDF' | 'CSV';
  size: string;
}

export interface PayrollException {
  id: string;
  employeeId: string;
  field: string;
  legacyValue: string;
  newValue: string;
  status: 'Open' | 'Resolved' | 'Under Review';
  isSensitive: boolean;
}

export interface AuditLogEntry {
  id: string;
  user: string;
  action: string;
  timestamp: string;
  details: string;
  color: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'Active' | 'Inactive';
}

export interface ACPUser {
  id: number;
  email: string;
  username: string;
  role: string;
  created_at: string;
  last_active_at: string | null;
  total_active_seconds: number;
  is_restricted: boolean;
  tool_access: ToolKey[];
}

export interface AdminTool {
  key: ToolKey;
  label: string;
  description: string;
}

export interface DashboardMetrics {
  recordsMigrated: { value: number; change: number };
  validationPassRate: { value: number; change: number };
  etlJobsRun: { value: number; change: number };
  payrollMatchRate: { value: number; change: number };
}

export interface ApiResponse<T> {
  data: T;
  total?: number;
  page?: number;
  pages?: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
