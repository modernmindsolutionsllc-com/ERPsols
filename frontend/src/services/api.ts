import type {
  ApiResponse, Snapshot, SnapshotDiff, ETLJob, Report, PayrollException,
  AuditLogEntry, AdminUser, DashboardMetrics, User, ApiError, SignupPayload, ACPUser, AdminTool, ToolKey
} from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mockResponse<T>(data: T, total?: number, page?: number, pages?: number): ApiResponse<T> {
  return { data, total, page, pages };
}

function mockError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

/** FastAPI returns `detail` as a string, or a list of validation errors — normalize for UI messages. */
function formatFastApiDetail(body: unknown): string {
  if (!body || typeof body !== 'object') return 'Request failed.';
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item: unknown) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: string }).msg);
        }
        return JSON.stringify(item);
      })
      .join('; ');
  }
  if (detail !== undefined && detail !== null) return String(detail);
  return 'Request failed.';
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T | ApiError> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return mockError(`HTTP_${response.status}`, formatFastApiDetail(body));
    }

    return body as T;
  } catch {
    return mockError('NETWORK_ERROR', 'Could not reach the backend API.');
  }
}

/**
 * Authenticated request helper — reads JWT from sessionStorage
 * and attaches it as a Bearer token for all protected endpoints.
 */
async function authenticatedJson<T>(path: string, options: RequestInit = {}): Promise<T | ApiError> {
  let token: string | null = null;
  try {
    const saved = sessionStorage.getItem('migrateos_auth');
    if (saved) token = JSON.parse(saved).token;
  } catch { /* ignore parse errors */ }

  if (!token) {
    return mockError('AUTH_ERROR', 'No authentication token found. Please sign in.');
  }

  return requestJson<T>(path, {
    ...options,
    headers: {
      ...((options.headers as Record<string, string>) || {}),
      'Authorization': `Bearer ${token}`,
    },
  });
}

export function hasError<T>(res: ApiResponse<T> | ApiError): res is ApiError {
  return 'error' in res && res.error !== undefined;
}

// Mock data stores
let snapshots: Snapshot[] = [
  {
    id: 'SNAP-0041',
    endpoint: 'https://api.legacy-hr.com/v2/config',
    timestamp: '2026-05-03T14:22:00Z',
    status: 'Completed',
    delta: { added: 12, removed: 3, changed: 7 },
    diff: [
      { field: 'database.max_connections', oldValue: '100', newValue: '200', type: 'changed' },
      { field: 'api.rate_limit', oldValue: '1000', newValue: '5000', type: 'changed' },
      { field: 'features.new_payroll_module', oldValue: null, newValue: 'enabled', type: 'added' },
      { field: 'legacy.caching.enabled', oldValue: 'true', newValue: null, type: 'removed' }
    ]
  },
  {
    id: 'SNAP-0040',
    endpoint: 'https://api.legacy-hr.com/v2/config',
    timestamp: '2026-05-02T09:15:00Z',
    status: 'Completed',
    delta: { added: 0, removed: 0, changed: 2 },
    diff: [
      { field: 'database.host', oldValue: 'db-old.internal', newValue: 'db-new.internal', type: 'changed' }
    ]
  },
  {
    id: 'SNAP-0039',
    endpoint: 'https://api.payroll-legacy.com/v1/settings',
    timestamp: '2026-05-01T16:45:00Z',
    status: 'Failed',
    delta: { added: 0, removed: 0, changed: 0 }
  },
  {
    id: 'SNAP-0038',
    endpoint: 'https://api.legacy-hr.com/v2/config',
    timestamp: '2026-04-30T11:00:00Z',
    status: 'Completed',
    delta: { added: 5, removed: 1, changed: 0 },
    diff: [
      { field: 'features.advanced_reporting', oldValue: null, newValue: 'enabled', type: 'added' }
    ]
  }
];

let etlJobs: ETLJob[] = [
  {
    id: 'ETL-0342',
    source: 'Legacy HR',
    target: 'Modern HRIS',
    status: 'running',
    progress: 67,
    startedAt: '2026-05-03T15:10:00Z',
    recordsProcessed: 18420
  },
  {
    id: 'ETL-0341',
    source: 'Legacy Payroll',
    target: 'Modern Payroll',
    status: 'completed',
    progress: 100,
    startedAt: '2026-05-03T14:30:00Z',
    completedAt: '2026-05-03T14:52:00Z',
    recordsProcessed: 4218,
    duration: '22m 15s'
  },
  {
    id: 'ETL-0340',
    source: 'Legacy CRM',
    target: 'Data Lake',
    status: 'completed',
    progress: 100,
    startedAt: '2026-05-03T12:00:00Z',
    completedAt: '2026-05-03T12:18:00Z',
    recordsProcessed: 89200,
    duration: '18m 42s'
  },
  {
    id: 'ETL-0339',
    source: 'Legacy HR',
    target: 'Modern HRIS',
    status: 'failed',
    progress: 34,
    startedAt: '2026-05-03T10:20:00Z',
    completedAt: '2026-05-03T10:25:00Z',
    recordsProcessed: 5100,
    duration: '5m 12s'
  }
];

let reports: Report[] = [
  {
    id: 'RPT-8921',
    type: 'ETL Performance',
    dateRange: '2026-04-27 – 2026-05-03',
    generatedAt: '2026-05-03T08:00:00Z',
    format: 'PDF',
    size: '2.4 MB'
  },
  {
    id: 'RPT-8920',
    type: 'Data Quality',
    dateRange: '2026-04-27 – 2026-05-03',
    generatedAt: '2026-05-03T08:00:00Z',
    format: 'CSV',
    size: '156 KB'
  },
  {
    id: 'RPT-8919',
    type: 'ETL Performance',
    dateRange: '2026-04-20 – 2026-04-26',
    generatedAt: '2026-04-26T08:00:00Z',
    format: 'PDF',
    size: '2.1 MB'
  }
];

let payrollExceptions: PayrollException[] = [
  {
    id: 'EXC-0001',
    employeeId: 'EMP-00412',
    field: 'salary',
    legacyValue: '$72,000.00',
    newValue: '$74,500.00',
    status: 'Open',
    isSensitive: true
  },
  {
    id: 'EXC-0002',
    employeeId: 'EMP-00389',
    field: 'pan_number',
    legacyValue: 'ABCDE1234F',
    newValue: 'ABCDE1234G',
    status: 'Under Review',
    isSensitive: true
  },
  {
    id: 'EXC-0003',
    employeeId: 'EMP-00521',
    field: 'bank_code',
    legacyValue: 'ICIC0001',
    newValue: 'HDFC0012',
    status: 'Resolved',
    isSensitive: true
  },
  {
    id: 'EXC-0004',
    employeeId: 'EMP-00194',
    field: 'department',
    legacyValue: 'Engineering',
    newValue: 'Product',
    status: 'Open',
    isSensitive: false
  },
  {
    id: 'EXC-0005',
    employeeId: 'EMP-00678',
    field: 'salary',
    legacyValue: '$65,000.00',
    newValue: '$68,000.00',
    status: 'Under Review',
    isSensitive: true
  },
  {
    id: 'EXC-0006',
    employeeId: 'EMP-00245',
    field: 'join_date',
    legacyValue: '2019-03-15',
    newValue: '2019-03-16',
    status: 'Resolved',
    isSensitive: false
  }
];

let auditLogs: AuditLogEntry[] = [
  { id: 'AUD-0001', user: 'Sarah Chen', action: 'Run ETL Job', timestamp: '2026-05-03T15:10:00Z', details: 'Started ETL-0342: Legacy HR → Modern HRIS', color: '#0F6E56' },
  { id: 'AUD-0002', user: 'Sarah Chen', action: 'Create Snapshot', timestamp: '2026-05-03T14:22:00Z', details: 'Created SNAP-0041 for api.legacy-hr.com', color: '#185FA5' },
  { id: 'AUD-0003', user: 'Mike Ross', action: 'Generate Report', timestamp: '2026-05-03T08:00:00Z', details: 'Generated RPT-8921 (ETL Performance, PDF)', color: '#BA7517' },
  { id: 'AUD-0004', user: 'Jessica Lee', action: 'Run Reconciliation', timestamp: '2026-05-03T07:30:00Z', details: 'Payroll reconciliation completed: 96.2% match', color: '#993C1D' },
  { id: 'AUD-0005', user: 'Admin User', action: 'Invite User', timestamp: '2026-05-02T16:00:00Z', details: 'Invited david@company.com as Analyst', color: '#6B3FA0' },
  { id: 'AUD-0006', user: 'Sarah Chen', action: 'Reveal Sensitive Data', timestamp: '2026-05-02T11:15:00Z', details: 'Revealed salary for EMP-00412', color: '#993C1D' },
  { id: 'AUD-0007', user: 'Mike Ross', action: 'Change Role', timestamp: '2026-05-01T14:00:00Z', details: 'Changed james@company.com from Viewer to Analyst', color: '#6B3FA0' },
  { id: 'AUD-0008', user: 'Jessica Lee', action: 'Run ETL Job', timestamp: '2026-05-01T09:30:00Z', details: 'Started ETL-0339: Legacy HR → Modern HRIS', color: '#0F6E56' }
];

let adminUsers: AdminUser[] = [
  { id: '1', name: 'Admin User', email: 'admin@company.com', role: 'Admin', status: 'Active' },
  { id: '2', name: 'Sarah Chen', email: 'sarah@company.com', role: 'Engineer', status: 'Active' },
  { id: '3', name: 'Mike Ross', email: 'mike@company.com', role: 'Analyst', status: 'Active' },
  { id: '4', name: 'Jessica Lee', email: 'jessica@company.com', role: 'Engineer', status: 'Active' },
  { id: '5', name: 'David Kim', email: 'david@company.com', role: 'Analyst', status: 'Inactive' },
  { id: '6', name: 'James Wilson', email: 'james@company.com', role: 'Viewer', status: 'Active' },
  { id: '7', name: 'Emily Zhang', email: 'emily@company.com', role: 'Viewer', status: 'Active' }
];

export const authApi = {
  async signup(payload: SignupPayload): Promise<{ message: string } | ApiError> {
    return requestJson('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async requestOtp(email: string): Promise<{ message: string; dev_otp?: string; bypass_login?: boolean } | ApiError> {
    return requestJson('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async verifyOtp(email: string, otpCode: string): Promise<{ token: string; user: User } | ApiError> {
    const result = await requestJson<{
      access_token: string;
      token_type: string;
      user: {
        id: number;
        username: string;
        email: string;
        role: User['role'];
        is_active: boolean;
        created_at: string;
        tool_access?: ToolKey[];
      };
    }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp_code: otpCode }),
    });

    if ('error' in result) return result;

    return {
      token: result.access_token,
      user: {
        id: String(result.user.id),
        name: result.user.username,
        email: result.user.email,
        role: result.user.role,
        tool_access: result.user.tool_access || [],
      },
    };
  },

  async getMe(): Promise<User | ApiError> {
    const result = await authenticatedJson<{
      id: number;
      username: string;
      email: string;
      role: User['role'];
      tool_access?: ToolKey[];
    }>('/me');

    if ('error' in result) return result;

    return {
      id: String(result.id),
      name: result.username,
      email: result.email,
      role: result.role,
      tool_access: result.tool_access || [],
    };
  },

  async addWorkspaceTool(toolKey: ToolKey): Promise<User | ApiError> {
    const result = await authenticatedJson<{
      id: number;
      username: string;
      email: string;
      role: User['role'];
      tool_access?: ToolKey[];
    }>('/auth/workspace/tools', {
      method: 'POST',
      body: JSON.stringify({ tool_key: toolKey }),
    });

    if ('error' in result) return result;

    return {
      id: String(result.id),
      name: result.username,
      email: result.email,
      role: result.role,
      tool_access: result.tool_access || [],
    };
  }
};

export const dashboardApi = {
  async getMetrics(): Promise<ApiResponse<DashboardMetrics>> {
    await delay(400);
    return mockResponse({
      recordsMigrated: { value: 2847291, change: 12.3 },
      validationPassRate: { value: 98.7, change: 0.4 },
      etlJobsRun: { value: 1432, change: 8 },
      payrollMatchRate: { value: 96.2, change: -1.2 }
    });
  }
};

export const configApi = {
  async getSnapshots(): Promise<ApiResponse<Snapshot[]>> {
    await delay(500);
    return mockResponse(snapshots);
  },

  async createSnapshot(endpoint: string, _description?: string): Promise<ApiResponse<Snapshot>> {
    await delay(800);
    const newSnapshot: Snapshot = {
      id: `SNAP-${String(snapshots.length + 38).padStart(4, '0')}`,
      endpoint,
      timestamp: new Date().toISOString(),
      status: 'Processing',
      delta: { added: 0, removed: 0, changed: 0 }
    };
    snapshots = [newSnapshot, ...snapshots];
    return mockResponse(newSnapshot);
  },

  async getSnapshotDiff(id: string): Promise<ApiResponse<SnapshotDiff[]>> {
    await delay(300);
    const snap = snapshots.find(s => s.id === id);
    return mockResponse(snap?.diff || []);
  }
};

export const etlApi = {
  async getJobs(): Promise<ApiResponse<ETLJob[]>> {
    await delay(400);
    // Simulate progress on running jobs
    etlJobs = etlJobs.map(job => {
      if (job.status === 'running') {
        const newProgress = Math.min(100, job.progress + Math.floor(Math.random() * 8));
        if (newProgress >= 100) {
          return { ...job, progress: 100, status: 'completed' as const, completedAt: new Date().toISOString(), duration: '24m 18s' };
        }
        return { ...job, progress: newProgress };
      }
      return job;
    });
    return mockResponse(etlJobs);
  },

  async runJob(source: string, target: string, _name?: string): Promise<ApiResponse<ETLJob>> {
    await delay(600);
    const newJob: ETLJob = {
      id: `ETL-${String(etlJobs.length + 339).padStart(4, '0')}`,
      source,
      target,
      status: 'running',
      progress: 0,
      startedAt: new Date().toISOString(),
      recordsProcessed: 0
    };
    etlJobs = [newJob, ...etlJobs];
    return mockResponse(newJob);
  }
};

export const reportingApi = {
  async getReports(): Promise<ApiResponse<Report[]>> {
    await delay(400);
    return mockResponse(reports);
  },

  async generateReport(dateRange: string, _jobs: string[], format: 'PDF' | 'CSV'): Promise<ApiResponse<Report>> {
    await delay(1000);
    const newReport: Report = {
      id: `RPT-${String(reports.length + 8919).padStart(4, '0')}`,
      type: 'ETL Performance',
      dateRange,
      generatedAt: new Date().toISOString(),
      format,
      size: format === 'PDF' ? '2.3 MB' : '142 KB'
    };
    reports = [newReport, ...reports];
    return mockResponse(newReport);
  }
};

export const payrollApi = {
  async getExceptions(): Promise<ApiResponse<PayrollException[]>> {
    await delay(500);
    return mockResponse(payrollExceptions);
  },

  async runReconciliation(): Promise<ApiResponse<{ matchRate: number; exceptions: number }>> {
    await delay(1200);
    return mockResponse({ matchRate: 96.2, exceptions: 160 });
  },

  async resolveException(id: string): Promise<ApiResponse<PayrollException>> {
    await delay(300);
    payrollExceptions = payrollExceptions.map(exc =>
      exc.id === id ? { ...exc, status: 'Resolved' as const } : exc
    );
    const exc = payrollExceptions.find(e => e.id === id);
    return mockResponse(exc!);
  }
};

export const adminApi = {
  async getTools(): Promise<AdminTool[] | ApiError> {
    return authenticatedJson<AdminTool[]>('/api/v1/admin/tools');
  },

  /** Fetch all users from the real backend ACP endpoint */
  async getUsers(role?: string, search?: string): Promise<ACPUser[] | ApiError> {
    const params = new URLSearchParams();
    if (role) params.set('role', role);
    if (search) params.set('search', search);
    const qs = params.toString();
    return authenticatedJson<ACPUser[]>(`/api/v1/admin/users${qs ? '?' + qs : ''}`);
  },

  async updateUser(userId: number, payload: { role?: 'enterprise' | 'user'; tool_access?: ToolKey[]; is_restricted?: boolean }): Promise<ACPUser | ApiError> {
    return authenticatedJson<ACPUser>(`/api/v1/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteUser(userId: number): Promise<{ message: string } | ApiError> {
    return authenticatedJson<{ message: string }>(`/api/v1/admin/users/${userId}`, {
      method: 'DELETE',
    });
  },

  /** Admin kill-switch: toggle is_restricted on a user */
  async restrictUser(userId: number, isRestricted: boolean): Promise<{ message: string } | ApiError> {
    return authenticatedJson<{ message: string }>(`/api/v1/admin/users/${userId}/restrict`, {
      method: 'PUT',
      body: JSON.stringify({ is_restricted: isRestricted }),
    });
  },

  // Legacy mock methods kept for compatibility
  async getAuditLog(): Promise<ApiResponse<AuditLogEntry[]>> {
    await delay(400);
    return mockResponse(auditLogs);
  },

  async inviteUser(email: string, role: string): Promise<ApiResponse<AdminUser>> {
    await delay(600);
    const newUser: AdminUser = {
      id: String(adminUsers.length + 1),
      name: email.split('@')[0],
      email,
      role: role as any,
      status: 'Active'
    };
    adminUsers = [...adminUsers, newUser];
    return mockResponse(newUser);
  },

  async updateRole(userId: string, role: string): Promise<ApiResponse<AdminUser>> {
    await delay(300);
    adminUsers = adminUsers.map(u => u.id === userId ? { ...u, role: role as any } : u);
    const user = adminUsers.find(u => u.id === userId);
    return mockResponse(user!);
  },

  async deactivateUser(userId: string): Promise<ApiResponse<AdminUser>> {
    await delay(300);
    adminUsers = adminUsers.map(u => u.id === userId ? { ...u, status: 'Inactive' as const } : u);
    const user = adminUsers.find(u => u.id === userId);
    return mockResponse(user!);
  }
};

/** Session heartbeat — pinged by frontend to track active time */
export const trackingApi = {
  async heartbeat(activeSeconds: number): Promise<{ message: string } | ApiError> {
    return authenticatedJson<{ message: string }>('/api/v1/tracking/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ active_seconds: activeSeconds }),
    });
  },

  /**
   * Exit beacon — fires when the user closes/hides the tab.
   * Uses fetch with `keepalive: true` so the browser completes
   * the request even after the page unloads. This lets us send
   * proper Authorization headers (unlike navigator.sendBeacon).
   */
  disconnect(): void {
    let token: string | null = null;
    try {
      const saved = sessionStorage.getItem('migrateos_auth');
      if (saved) token = JSON.parse(saved).token;
    } catch { /* ignore */ }

    if (!token) return;

    try {
      fetch(`${API_BASE_URL}/api/v1/tracking/disconnect`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
    } catch {
      // Fire-and-forget — never crash the app on exit
    }
  }
};

export interface BipReportCreate {
  module: string;
  sub_module?: string;
  report_name: string;
  description?: string;
  sql_query: string;
}

export interface BipReportUpdate {
  module: string;
  sub_module?: string;
  report_name: string;
  description?: string;
}

export interface BipReportResponse {
  id: number;
  module: string;
  sub_module?: string | null;
  report_name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DirectBipSqlRequest {
  module: string;
  report_name: string;
  sql_query: string;
  env_name: string;
}

export interface OracleCatalogImportResponse {
  imported_count: number;
  updated_count: number;
  created_count: number;
  logs: string[];
  reports: BipReportResponse[];
}

export interface OracleStatus {
  connected: boolean;
  oracle_url?: string;
  env_name?: string;
  oracle_username?: string;
  connected_at?: string | null;
}

export interface OracleConnectRequest {
  oracle_url: string;
  env_name: string;
  oracle_username: string;
  oracle_password: string;
}

export interface OracleConnectResponse {
  message: string;
  oracle_url: string;
  env_name: string;
  oracle_username: string;
  connected_at: string;
}

/* ── Multi-Environment Oracle Session Types ─────────────────────────────────── */

export interface OracleSessionResponse {
  id: number;
  env_name: string;
  oracle_url: string;
  oracle_username: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OracleSessionCreate {
  env_name: string;
  oracle_url: string;
  oracle_username: string;
  oracle_password: string;
}

/* ── Blob Helper ────────────────────────────────────────────────────────────── */

async function authenticatedBlob(path: string, body: object): Promise<Blob | ApiError> {
  let token: string | null = null;
  try {
    const saved = sessionStorage.getItem('migrateos_auth');
    if (saved) token = JSON.parse(saved).token;
  } catch { /* ignore parse errors */ }

  if (!token) {
    return { error: { code: 'AUTH_ERROR', message: 'No authentication token found. Please sign in.' } };
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return {
        error: {
          code: `HTTP_${response.status}`,
          message: formatFastApiDetail(errBody),
        },
      };
    }

    return await response.blob();
  } catch {
    return { error: { code: 'NETWORK_ERROR', message: 'Could not reach the backend API.' } };
  }
}

async function authenticatedDelete(path: string): Promise<{ message: string } | ApiError> {
  return authenticatedJson<{ message: string }>(path, { method: 'DELETE' });
}

/* ── BIP Reporting API ─────────────────────────────────────────────────────── */

export const bipReportingApi = {
  createBipReport: (data: BipReportCreate) =>
    authenticatedJson<any>('/api/v1/bip-reports/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getBipReports: () => authenticatedJson<BipReportResponse[]>('/api/v1/bip-reports/'),
  updateBipReport: (reportId: number, data: BipReportUpdate) =>
    authenticatedJson<BipReportResponse>(`/api/v1/bip-reports/${reportId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteBipReport: (reportId: number) =>
    authenticatedDelete(`/api/v1/bip-reports/${reportId}`),

  importOracleCatalogQueries: (envName: string, sourceFolder?: string) =>
    authenticatedJson<OracleCatalogImportResponse>('/api/v1/bip-reports/import-oracle-catalog', {
      method: 'POST',
      body: JSON.stringify({
        env_name: envName,
        source_folder: sourceFolder,
      }),
    }),

  executeBipReports: (reportIds: number[], envName: string) =>
    authenticatedBlob('/api/v1/bip-reports/execute', {
      report_ids: reportIds,
      env_name: envName,
    }),

  executeSql: (data: DirectBipSqlRequest) =>
    authenticatedBlob('/api/v1/bip-reports/execute-sql', data),

  getOracleStatus: () => authenticatedJson<OracleStatus>('/api/v1/integrations/oracle/status'),

  connectOracle: (data: OracleConnectRequest) =>
    authenticatedJson<OracleConnectResponse>('/api/v1/integrations/oracle/connect', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /* ── Multi-Environment Session CRUD ──────────────────────────────────────── */

  getOracleSessions: () =>
    authenticatedJson<OracleSessionResponse[]>('/api/v1/integrations/oracle/sessions'),

  saveOracleSession: (data: OracleSessionCreate) =>
    authenticatedJson<OracleSessionResponse>('/api/v1/integrations/oracle/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteOracleSession: (envName: string) =>
    authenticatedDelete(`/api/v1/integrations/oracle/sessions/${encodeURIComponent(envName)}`),

  deleteAllOracleSessions: () =>
    authenticatedDelete('/api/v1/integrations/oracle/sessions'),

  validateCatalog: (envName: string) =>
    authenticatedJson<{ success: boolean; logs: string[] }>(
      `/api/v1/integrations/oracle/sessions/${encodeURIComponent(envName)}/validate-catalog`,
      { method: 'POST' },
    ),

  downloadDataTemplate: async (module: string, businessObject: string): Promise<Blob> => {
    let token: string | null = null;
    try {
      const saved = sessionStorage.getItem('migrateos_auth');
      if (saved) token = JSON.parse(saved).token;
    } catch { /* ignore */ }

    const response = await fetch(
      `${API_BASE_URL}/api/v1/templates/download?module=${encodeURIComponent(module)}&object=${encodeURIComponent(businessObject)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errDetail = await response.json().catch(() => ({}));
      throw new Error(errDetail?.detail || 'Failed to download template.');
    }

    return await response.blob();
  },
};

