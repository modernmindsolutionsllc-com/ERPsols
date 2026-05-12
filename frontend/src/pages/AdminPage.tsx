import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { formatActiveTime, formatLastActive } from '@/utils/formatters';
import { toast } from 'sonner';
import type { ACPUser, AdminTool, ApiError, ToolKey } from '@/types';
import {
  Search, Users, ShieldAlert, ShieldCheck, Clock, Filter, Loader2, RefreshCw,
  KeyRound, Trash2, ArrowRight,
} from 'lucide-react';
import { DASHBOARD_TOOLS } from '@/pages/DashboardPage';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch {
    return iso;
  }
}

function isApiError(res: unknown): res is ApiError {
  return typeof res === 'object' && res !== null && 'error' in res;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#6B3FA0',
  enterprise: '#185FA5',
  user: '#0F6E56',
};

export function AdminPage() {
  const [users, setUsers] = useState<ACPUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [toggling, setToggling] = useState<number | null>(null);
  const [tools, setTools] = useState<AdminTool[]>([]);
  const [savingAccess, setSavingAccess] = useState<number | null>(null);
  const [draftToolAccess, setDraftToolAccess] = useState<Record<number, ToolKey[]>>({});
  const [deleting, setDeleting] = useState<number | null>(null);
  const { user: currentUser } = useAuth();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await adminApi.getUsers(
      roleFilter || undefined,
      search || undefined,
    );
    if (isApiError(res)) {
      toast.error(res.error.message);
      setUsers([]);
    } else {
      setUsers(res);
      setDraftToolAccess(Object.fromEntries(res.map(u => [u.id, u.tool_access])));
    }
    setLoading(false);
  }, [roleFilter, search]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    async function loadTools() {
      const res = await adminApi.getTools();
      if (isApiError(res)) {
        toast.error(res.error.message);
      } else {
        setTools(res);
      }
    }
    void loadTools();
  }, []);

  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function handleToggleRestriction(userId: number, currentlyRestricted: boolean) {
    setToggling(userId);
    const res = await adminApi.restrictUser(userId, !currentlyRestricted);
    if (isApiError(res)) {
      toast.error(res.error.message);
    } else {
      toast.success(res.message);
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, is_restricted: !currentlyRestricted } : u
      ));
    }
    setToggling(null);
  }

  function getDraftAccess(targetUser: ACPUser): ToolKey[] {
    return draftToolAccess[targetUser.id] || targetUser.tool_access;
  }

  function handleToggleToolAccess(targetUser: ACPUser, toolKey: ToolKey) {
    setDraftToolAccess(prev => {
      const current = prev[targetUser.id] || targetUser.tool_access;
      const nextAccess = current.includes(toolKey)
        ? current.filter(key => key !== toolKey)
        : [...current, toolKey];

      return { ...prev, [targetUser.id]: nextAccess };
    });
  }

  function hasToolChanges(targetUser: ACPUser): boolean {
    const saved = [...targetUser.tool_access].sort().join('|');
    const draft = [...getDraftAccess(targetUser)].sort().join('|');
    return saved !== draft;
  }

  async function handleSaveToolAccess(targetUser: ACPUser) {
    const nextAccess = getDraftAccess(targetUser);

    setSavingAccess(targetUser.id);
    const res = await adminApi.updateUser(targetUser.id, { tool_access: nextAccess });
    if (isApiError(res)) {
      toast.error(res.error.message);
    } else {
      toast.success('Tool access updated');
      setUsers(prev => prev.map(u => u.id === targetUser.id ? res : u));
      setDraftToolAccess(prev => ({ ...prev, [targetUser.id]: res.tool_access }));
    }
    setSavingAccess(null);
  }

  async function handleDeleteUser(targetUser: ACPUser) {
    const confirmed = window.confirm(`Delete ${targetUser.email}? This cannot be undone.`);
    if (!confirmed) return;

    setDeleting(targetUser.id);
    const res = await adminApi.deleteUser(targetUser.id);
    if (isApiError(res)) {
      toast.error(res.error.message);
    } else {
      toast.success(res.message);
      setUsers(prev => prev.filter(u => u.id !== targetUser.id));
    }
    setDeleting(null);
  }

  const totalUsers = users.length;
  const activeUsers = users.filter(u => !u.is_restricted).length;
  const restrictedUsers = users.filter(u => u.is_restricted).length;

  const myTools = DASHBOARD_TOOLS.filter(t => currentUser?.tool_access?.includes(t.key));

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-250">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F172A] dark:text-slate-100 tracking-tight">Admin Control Panel</h1>
          <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">Manage users, monitor sessions, and enforce access control.</p>
        </div>
      </div>

      {myTools.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400 mb-3">
            My Workspace Tools
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {myTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.key}
                  to={tool.path}
                  className="group relative flex items-center gap-4 rounded-xl border border-[#CBD5E1] dark:border-white/10 bg-white dark:bg-slate-900/80 p-4 transition-all hover:shadow-md hover:border-[#185FA5]/50 dark:hover:border-[#185FA5]/50"
                >
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110"
                    style={{ backgroundColor: tool.tagBg, color: tool.tagColor }}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="truncate text-sm font-semibold text-[#0F172A] dark:text-slate-100">
                      {tool.title}
                    </h3>
                    <p className="truncate text-xs text-[#64748B] dark:text-slate-400">
                      {tool.subtitle}
                    </p>
                  </div>
                  <ArrowRight size={16} className="text-[#94A3B8] opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-[#185FA5]" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900/80 border border-[#E2E8F0] dark:border-white/10 rounded-lg p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#185FA51A] text-[#185FA5]">
            <Users size={20} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[#0F172A] dark:text-slate-100">{totalUsers}</p>
            <p className="text-xs text-[#64748B] dark:text-slate-400">Total Users</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900/80 border border-[#E2E8F0] dark:border-white/10 rounded-lg p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#0F6E561A] text-[#0F6E56]">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[#0F172A] dark:text-slate-100">{activeUsers}</p>
            <p className="text-xs text-[#64748B] dark:text-slate-400">Active</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900/80 border border-[#E2E8F0] dark:border-white/10 rounded-lg p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#993C1D1A] text-[#993C1D]">
            <ShieldAlert size={20} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[#0F172A] dark:text-slate-100">{restrictedUsers}</p>
            <p className="text-xs text-[#64748B] dark:text-slate-400">Restricted</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] dark:text-slate-500" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by email or username..."
            className="h-10 w-full rounded-md border border-[#CBD5E1] dark:border-white/10 bg-white dark:bg-slate-900 pl-10 pr-3 text-sm text-[#0F172A] dark:text-slate-100 transition-all placeholder:text-[#94A3B8] dark:placeholder:text-slate-500 focus:border-[#185FA5] focus:outline-none focus:ring-4 focus:ring-[#185FA5]/15"
          />
        </div>

        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] dark:text-slate-500 pointer-events-none" />
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="h-10 w-full sm:w-44 rounded-md border border-[#CBD5E1] dark:border-white/10 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm text-[#0F172A] dark:text-slate-100 transition-all focus:border-[#185FA5] focus:outline-none focus:ring-4 focus:ring-[#185FA5]/15 appearance-none cursor-pointer"
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="enterprise">Enterprise</option>
            <option value="user">User</option>
          </select>
        </div>

        <button
          onClick={loadUsers}
          className="h-10 px-4 rounded-md border border-[#CBD5E1] dark:border-white/10 bg-white dark:bg-slate-900 text-sm font-medium text-[#334155] dark:text-slate-200 hover:bg-[#F8FAFC] dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="bg-white dark:bg-slate-950/90 border border-[#E2E8F0] dark:border-white/10 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-[#185FA5]" />
            <span className="ml-3 text-sm text-[#64748B] dark:text-slate-400">Loading users...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#64748B] dark:text-slate-400">
            <Users size={48} strokeWidth={1} className="mb-3 opacity-40" />
            <p className="text-sm">No users found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F8FAFC] dark:bg-slate-900 border-b border-[#E2E8F0] dark:border-white/10">
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">ID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">Username</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">Tools</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">Joined</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">Last Active</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">
                    <span className="flex items-center gap-1"><Clock size={12} /> Active Time</span>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-white/10">
                {users.map(u => {
                  const isSelf = currentUser?.id === String(u.id);
                  const roleColor = ROLE_COLORS[u.role] || '#64748B';

                  return (
                    <tr key={u.id} className="hover:bg-[#F8FAFC] dark:hover:bg-slate-900/70 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono text-[#64748B] dark:text-slate-400">{u.id}</td>
                      <td className="px-4 py-3 text-sm text-[#0F172A] dark:text-slate-100 font-medium">{u.email}</td>
                      <td className="px-4 py-3 text-sm text-[#334155] dark:text-slate-300">{u.username}</td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{
                            color: roleColor,
                            backgroundColor: roleColor + '1A',
                          }}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 min-w-[280px]">
                        <div className="flex flex-wrap gap-1.5">
                          {tools.map(tool => {
                            const checked = getDraftAccess(u).includes(tool.key);
                            return (
                              <button
                                key={tool.key}
                                type="button"
                                disabled={savingAccess === u.id}
                                onClick={() => handleToggleToolAccess(u, tool.key)}
                                title={tool.description}
                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                                  checked
                                    ? 'border-[#185FA5]/30 bg-[#185FA51A] text-[#185FA5]'
                                    : 'border-[#CBD5E1] dark:border-white/10 bg-white dark:bg-slate-900 text-[#64748B] dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-slate-800'
                                }`}
                              >
                                {savingAccess === u.id ? <Loader2 size={11} className="animate-spin" /> : <KeyRound size={11} />}
                                {tool.label}
                              </button>
                            );
                          })}
                          {hasToolChanges(u) && (
                            <button
                              type="button"
                              disabled={savingAccess === u.id}
                              onClick={() => handleSaveToolAccess(u)}
                              className="inline-flex items-center gap-1 rounded-md bg-[#185FA5] px-2 py-1 text-xs font-semibold text-white hover:bg-[#124A82] disabled:opacity-60"
                            >
                              {savingAccess === u.id ? <Loader2 size={11} className="animate-spin" /> : null}
                              Save tools
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#64748B] dark:text-slate-400">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-sm text-[#334155] dark:text-slate-300 font-medium">{formatLastActive(u.last_active_at)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-[#334155] dark:text-slate-300">
                        {formatActiveTime(u.total_active_seconds)}
                      </td>
                      <td className="px-4 py-3">
                        {u.is_restricted ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#993C1D1A] text-[#993C1D]">
                            <ShieldAlert size={12} /> Restricted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0F6E561A] text-[#0F6E56]">
                            <ShieldCheck size={12} /> Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isSelf ? (
                          <span className="text-xs text-[#94A3B8] dark:text-slate-500 italic">You</span>
                        ) : (
                          <div className="flex justify-center gap-2">
                            {toggling === u.id ? (
                              <Loader2 size={16} className="animate-spin text-[#64748B] dark:text-slate-400 mt-1.5" />
                            ) : u.is_restricted ? (
                              <button
                                onClick={() => handleToggleRestriction(u.id, u.is_restricted)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#0F6E56] text-white hover:bg-[#0B5C47] transition-colors"
                              >
                                <ShieldCheck size={13} />
                                Unrestrict
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleRestriction(u.id, u.is_restricted)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
                              >
                                <ShieldAlert size={13} />
                                Restrict
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteUser(u)}
                              disabled={deleting === u.id || u.role === 'admin'}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[#DC2626]/30 text-[#DC2626] hover:bg-[#FEF2F2] dark:hover:bg-[#450A0A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              title={u.role === 'admin' ? 'Admin accounts cannot be deleted here' : 'Delete user'}
                            >
                              {deleting === u.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
