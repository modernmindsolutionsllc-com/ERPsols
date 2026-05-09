import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import { useSessionHeartbeat } from '@/hooks/useSessionHeartbeat';
import { SubscribeModal } from '@/components/shared/SubscribeModal';
import {
  LayoutDashboard,
  Camera,
  ArrowRightLeft,
  BarChart3,
  Wallet,
  Shield,
  LogOut,
  Menu,
  X,
  Gem,
} from 'lucide-react';
import { ROLE_COLORS } from '@/utils/constants';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/config', label: 'Config Snapshot', icon: Camera },
  { path: '/data-conversion', label: 'Data Conversion', icon: ArrowRightLeft },
  { path: '/bip-reporting', label: 'BIP Reporting', icon: BarChart3 },
  { path: '/payroll', label: 'Payroll Reconciliation', icon: Wallet },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = usePermission('manage_users');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  const isBaseUser = user?.role === 'user';

  useSessionHeartbeat();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleColor = user ? ROLE_COLORS[user.role] : '#64748B';

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/45 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

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
            {navItems.map(item => {
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

      <div className="flex-1 flex flex-col min-w-0">
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 outline-none cursor-pointer hover:scale-105 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, rgba(109,40,217,0.30) 0%, rgba(168,85,247,0.24) 100%)',
                  border: '1px solid rgba(168,85,247,0.55)',
                  color: '#E9D5FF',
                  boxShadow: '0 0 12px rgba(168,85,247,0.35)',
                }}
                title="View subscription & available tools"
              >
                <Gem size={13} className="text-purple-300" />
                Subscription
              </button>
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

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Enterprise upsell modal — auto-shows once per login, also openable from navbar button */}
      <SubscribeModal
        externalOpen={subscribeOpen}
        onExternalOpenChange={setSubscribeOpen}
      />
    </div>
  );
}

