// Role-based permission map
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  user: ['view_dashboard'],
  enterprise: [
    'view_dashboard', 'view_reports', 'view_snapshots', 'view_payroll', 'run_bip_report',
    'run_etl', 'run_reconciliation', 'create_snapshot'
  ],
  admin: [
    'view_dashboard', 'view_reports', 'view_snapshots', 'view_payroll', 'run_bip_report',
    'run_etl', 'run_reconciliation', 'create_snapshot', 'manage_users', 'view_audit_log', 'change_roles'
  ],
  Viewer: ['view_dashboard', 'view_reports', 'view_snapshots'],
  Analyst: ['view_dashboard', 'view_reports', 'view_snapshots', 'view_payroll', 'run_bip_report'],
  Engineer: [
    'view_dashboard', 'view_reports', 'view_snapshots', 'view_payroll', 'run_bip_report',
    'run_etl', 'run_reconciliation', 'create_snapshot'
  ],
  Admin: [
    'view_dashboard', 'view_reports', 'view_snapshots', 'view_payroll', 'run_bip_report',
    'run_etl', 'run_reconciliation', 'create_snapshot', 'manage_users', 'view_audit_log', 'change_roles'
  ]
};

export const ROLE_COLORS: Record<string, string> = {
  user: '#64748B',
  enterprise: '#0F6E56',
  admin: '#6B3FA0',
  Viewer: '#64748B',
  Analyst: '#185FA5',
  Engineer: '#0F6E56',
  Admin: '#6B3FA0'
};

export const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  success: { bg: 'rgba(15, 110, 86, 0.1)', text: '#0F6E56', border: 'rgba(15, 110, 86, 0.25)' },
  warning: { bg: 'rgba(186, 117, 23, 0.1)', text: '#BA7517', border: 'rgba(186, 117, 23, 0.25)' },
  error: { bg: 'rgba(153, 60, 29, 0.1)', text: '#993C1D', border: 'rgba(153, 60, 29, 0.25)' },
  info: { bg: 'rgba(24, 95, 165, 0.1)', text: '#185FA5', border: 'rgba(24, 95, 165, 0.25)' },
  neutral: { bg: 'rgba(100, 116, 139, 0.1)', text: '#64748B', border: 'rgba(100, 116, 139, 0.25)' }
};

export const TOOL_COLORS: Record<string, string> = {
  config: '#185FA5',
  etl: '#0F6E56',
  bip: '#BA7517',
  payroll: '#993C1D',
  admin: '#6B3FA0'
};
