import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import { useSessionHeartbeat } from '@/hooks/useSessionHeartbeat';
import { SubscribeModal } from '@/components/shared/SubscribeModal';
import { ConnectOracleModal } from '@/components/shared/ConnectOracleModal';
import { CreateBipReportModal } from '@/components/CreateBipReportModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  LayoutDashboard, Camera, ArrowRightLeft, BarChart3, Wallet, Shield, LogOut, Menu, X, ChevronDown, Copy, Key, PlusCircle, Gem
} from 'lucide-react';
import { ROLE_COLORS } from '@/utils/constants';
import { CheckCircle2 } from 'lucide-react';
import type { ToolKey } from '@/types';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/config', label: 'Config Snapshot', icon: Camera, toolKey: 'config_snapshot' as ToolKey },
  { path: '/data-conversion', label: 'Data Conversion', icon: ArrowRightLeft, toolKey: 'data_conversion' as ToolKey },
  { path: '/bip-reporting', label: 'BIP Reporting', icon: BarChart3, toolKey: 'bip_reporting' as ToolKey },
  { path: '/payroll', label: 'Payroll Reconciliation', icon: Wallet, toolKey: 'payroll' as ToolKey },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = usePermission('manage_users');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [oracleModalOpen, setOracleModalOpen] = useState(false);
  const [bipModalOpen, setBipModalOpen] = useState(false);
  const [oracleConnected, setOracleConnected] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  // Check Oracle connection status on mount
  useEffect(() => {
    async function checkOracleStatus() {
      try {
        let token: string | null = null;
        const saved = sessionStorage.getItem('migrateos_auth');
        if (saved) token = JSON.parse(saved).token;
        if (!token) return;

        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
        const res = await fetch(`${API_BASE_URL}/api/v1/integrations/oracle/status`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOracleConnected(data.connected === true);
        }
      } catch { /* silent */ }
    }
    checkOracleStatus();
  }, []);

  // Determine if the current user is a base tier "user"
  const isBaseUser = user?.role === 'user';

  // Global session heartbeat — pings backend every 60s while tab is visible
  useSessionHeartbeat();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const copyEnvUrl = () => {
    navigator.clipboard.writeText('https://fa-etaj-saasfademo1.ds-fa.oraclepdemos.com');
    toast.success('Oracle Environment URL copied to clipboard');
  };

  const roleColor = user ? ROLE_COLORS[user.role] : '#64748B';
  const isAdminRole = user?.role === 'admin' || user?.role === 'Admin';
  const canUseTool = (toolKey?: ToolKey) => {
    if (!toolKey) return true;
    if (isAdminRole) return false;
    return Boolean(user?.tool_access?.includes(toolKey));
  };
  const visibleNavItems = isAdminRole ? [] : navItems.filter(item => canUseTool(item.toolKey));

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/45 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar (Hidden for base users) */}
      {!isBaseUser && (
        <aside
          className={`fixed lg:static inset-y-0 left-0 z-50 w-[240px] bg-[#0F172A] flex flex-col transition-transform duration-250 ease-out
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
          style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
        >
        <div className="h-14 flex items-center px-6 border-b border-white/10 lg:hidden">
          <span className="text-white font-semibold">MigrateOS</span>
          <button
            className="ml-auto text-white/60 hover:text-white"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 pt-4 px-3 space-y-1">
          {visibleNavItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-all duration-150
                  ${isActive
                    ? 'bg-[#185FA5] text-white'
                    : 'text-[#94A3B8] hover:bg-white/5 hover:text-white'
                  }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className="my-2 border-t border-white/10" />
              <Link
                to="/admin"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-all duration-150
                  ${location.pathname === '/admin'
                    ? 'bg-[#185FA5] text-white'
                    : 'text-[#94A3B8] hover:bg-white/5 hover:text-white'
                  }`}
              >
                <Shield size={16} />
                <span>Admin</span>
              </Link>
            </>
          )}
        </nav>
      </aside>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TopBar */}
        <header className="h-14 bg-[#185FA5] flex items-center justify-between px-4 lg:px-6 shadow-sm z-30 sticky top-0">
          <div className="flex items-center gap-3">
            {!isBaseUser && (
              <button
                className="lg:hidden text-white/80 hover:text-white"
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={20} />
              </button>
            )}
            <div className="w-4 h-4 bg-white rounded-sm" />
            <span className="text-white font-semibold text-base">MigrateOS</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Subscription button — only for base 'user' role */}
            {isBaseUser && (
              <button
                onClick={() => setSubscribeOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 outline-none cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, rgba(109,40,217,0.28) 0%, rgba(168,85,247,0.22) 100%)',
                  border: '1px solid rgba(168,85,247,0.50)',
                  color: '#E9D5FF',
                  boxShadow: '0 0 10px rgba(168,85,247,0.30)',
                }}
                title="View subscription & available tools"
              >
                <Gem size={13} className="text-purple-300" />
                Subscription
              </button>
            )}

            {/* Oracle Env Selector */}
            {user && !isAdminRole && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors border border-white/10 outline-none">
                    Oracle Fusion Env
                    <ChevronDown size={14} className="text-white/70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 border-white/10 shadow-xl rounded-xl">
                  <div className="px-2 py-2 mb-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Active Environment</p>
                    <button 
                      onClick={copyEnvUrl}
                      className="w-full text-left group flex items-center justify-between gap-2 p-2 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-sm font-medium truncate text-gray-800">
                        fa-etaj-saasfademo1
                      </span>
                      <Copy size={14} className="text-gray-400 group-hover:text-[#185FA5] shrink-0" />
                    </button>
                  </div>
                  
                  <DropdownMenuSeparator className="bg-gray-100" />
                  
                  <DropdownMenuItem 
                    onSelect={() => setOracleModalOpen(true)}
                    className={`p-2 cursor-pointer font-medium rounded-md m-1 transition-colors flex items-center gap-2 ${
                      oracleConnected
                        ? 'text-emerald-600 focus:bg-emerald-50 focus:text-emerald-700'
                        : 'text-[#185FA5] focus:bg-[#185FA5]/10 focus:text-[#185FA5]'
                    }`}
                  >
                    {oracleConnected ? <CheckCircle2 size={14} /> : <Key size={14} />}
                    {oracleConnected ? 'Connected – Oracle Credentials' : 'Connect Oracle Credentials'}
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem 
                    onSelect={() => setBipModalOpen(true)}
                    className="p-2 cursor-pointer font-medium text-emerald-600 focus:bg-emerald-50 focus:text-emerald-700 rounded-md m-1 transition-colors flex items-center gap-2"
                  >
                    <PlusCircle size={14} />
                    New BIP Report
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {user && (
              <>
                <span
                  className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ml-2"
                  style={{ backgroundColor: roleColor + '33', border: `1px solid ${roleColor}66` }}
                >
                  {user.role}
                </span>
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#0F172A] text-sm font-semibold ml-1">
                  {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors ml-1"
                  title="Sign out"
                >
                  <LogOut size={18} />
                </button>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Enterprise upsell modal — self-gating, only visible to "user" role */}
      <SubscribeModal
        externalOpen={subscribeOpen}
        onExternalOpenChange={setSubscribeOpen}
      />

      {/* Secure Oracle Credential Modal */}
      <ConnectOracleModal 
        open={oracleModalOpen} 
        onOpenChange={setOracleModalOpen} 
      />

      {/* BIP Report Modal */}
      <CreateBipReportModal
        open={bipModalOpen}
        onOpenChange={setBipModalOpen}
      />
    </div>
  );
}
