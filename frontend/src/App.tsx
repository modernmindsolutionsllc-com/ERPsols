import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AppShell } from '@/components/shared/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ConfigPage } from '@/pages/ConfigPage';
import { DataConversionPage } from '@/pages/DataConversionPage';
import { BIPReportingPage } from '@/pages/BIPReportingPage';
import { PayrollPage } from '@/pages/PayrollPage';
import { AdminPage } from '@/pages/AdminPage';
import type { ToolKey } from '@/types';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  if (isAuthenticated && (user?.role === 'admin' || user?.role === 'Admin')) {
    return <Navigate to="/admin" replace />;
  }
  return isAuthenticated ? <AppShell>{children}</AppShell> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin' && user?.role !== 'Admin') return <Navigate to="/dashboard" replace />;
  return <AppShell>{children}</AppShell>;
}

function AccessDeniedRedirect() {
  useEffect(() => {
    toast.error("You don't have permission to access this tool.");
  }, []);
  return <Navigate to="/dashboard" replace />;
}

function ToolRoute({ toolKey, children }: { toolKey: ToolKey; children: React.ReactNode }) {
  const { isAuthenticated, user, refreshUser } = useAuth();
  const [checking, setChecking] = useState(true);
  const [freshUser, setFreshUser] = useState(user);

  useEffect(() => {
    let active = true;
    async function checkAccess() {
      if (!isAuthenticated) {
        setChecking(false);
        return;
      }
      const latest = await refreshUser();
      if (!active) return;
      // If the API returns null (network error etc.), fall back to the
      // already-cached user so a transient failure doesn't block access.
      setFreshUser(prev => latest ?? prev);
      setChecking(false);
    }
    void checkAccess();
    return () => { active = false; };
  }, [isAuthenticated, refreshUser]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (checking) return <AppShell><div className="p-8 text-sm text-[#64748B]">Checking access...</div></AppShell>;
  if (freshUser?.role === 'admin' || freshUser?.role === 'Admin') return <AppShell>{children}</AppShell>;
  if (freshUser?.tool_access?.includes(toolKey)) {
    return <AppShell>{children}</AppShell>;
  }
  return <AccessDeniedRedirect />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/config" element={<ToolRoute toolKey="config_snapshot"><ConfigPage /></ToolRoute>} />
      <Route path="/data-conversion" element={<ToolRoute toolKey="data_conversion"><DataConversionPage /></ToolRoute>} />
      <Route path="/bip-reporting" element={<ToolRoute toolKey="bip_reporting"><BIPReportingPage /></ToolRoute>} />
      <Route path="/payroll" element={<ToolRoute toolKey="payroll"><PayrollPage /></ToolRoute>} />
      <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
