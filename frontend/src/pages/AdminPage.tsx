import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { formatActiveTime, formatLastActive } from '@/utils/formatters';
import { toast } from 'sonner';
import type { ACPUser, ApiError } from '@/types';
import {
  Search, Users, ShieldAlert, ShieldCheck, Clock, Filter, Loader2, RefreshCw
} from 'lucide-react';

// ── Types for the real backend ACP response ───────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch { return iso; }
}

function isApiError(res: unknown): res is ApiError {
  return typeof res === 'object' && res !== null && 'error' in res;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#6B3FA0',
  enterprise: '#185FA5',
  user: '#0F6E56',
};

// ═══════════════════════════════════════════════════════════════════════════════

export function AdminPage() {
  const [users, setUsers] = useState<ACPUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [toggling, setToggling] = useState<number | null>(null);
  const { user: currentUser } = useAuth();

  // ── Fetch users from backend ──────────────────────────────────────────────

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
    }
    setLoading(false);
  }, [roleFilter, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // ── Debounced search ──────────────────────────────────────────────────────

  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Kill switch handler ───────────────────────────────────────────────────

  async function handleToggleRestriction(userId: number, currentlyRestricted: boolean) {
    setToggling(userId);
    const res = await adminApi.restrictUser(userId, !currentlyRestricted);
    if (isApiError(res)) {
      toast.error(res.error.message);
    } else {
      toast.success(res.message);
      // Optimistic update
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, is_restricted: !currentlyRestricted } : u
      ));
    }
    setToggling(null);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalUsers = users.length;
  const activeUsers = users.filter(u => !u.is_restricted).length;
  const restrictedUsers = users.filter(u => u.is_restricted).length;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-250">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0F172A] tracking-tight">Admin Control Panel</h1>
        <p className="text-sm text-[#64748B] mt-1">Manage users, monitor sessions, and enforce access control.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#185FA51A] text-[#185FA5]">
            <Users size={20} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[#0F172A]">{totalUsers}</p>
            <p className="text-xs text-[#64748B]">Total Users</p>
          </div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#0F6E561A] text-[#0F6E56]">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[#0F172A]">{activeUsers}</p>
            <p className="text-xs text-[#64748B]">Active</p>
          </div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#993C1D1A] text-[#993C1D]">
            <ShieldAlert size={20} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[#0F172A]">{restrictedUsers}</p>
            <p className="text-xs text-[#64748B]">Restricted</p>
          </div>
        </div>
      </div>

      {/* Toolbar: Search + Role Filter + Refresh */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by email or username…"
            className="h-10 w-full rounded-md border border-[#CBD5E1] bg-white pl-10 pr-3 text-sm text-[#0F172A] transition-all placeholder:text-[#94A3B8] focus:border-[#185FA5] focus:outline-none focus:ring-4 focus:ring-[#185FA5]/15"
          />
        </div>

        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="h-10 w-full sm:w-44 rounded-md border border-[#CBD5E1] bg-white pl-9 pr-3 text-sm text-[#0F172A] transition-all focus:border-[#185FA5] focus:outline-none focus:ring-4 focus:ring-[#185FA5]/15 appearance-none cursor-pointer"
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="enterprise">Enterprise</option>
            <option value="user">User</option>
          </select>
        </div>

        <button
          onClick={loadUsers}
          className="h-10 px-4 rounded-md border border-[#CBD5E1] bg-white text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] transition-colors flex items-center gap-2"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-[#185FA5]" />
            <span className="ml-3 text-sm text-[#64748B]">Loading users…</span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#64748B]">
            <Users size={48} strokeWidth={1} className="mb-3 opacity-40" />
            <p className="text-sm">No users found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">ID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Username</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Joined</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Last Active</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">
                    <span className="flex items-center gap-1"><Clock size={12} /> Active Time</span>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#64748B]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {users.map(u => {
                  const isSelf = currentUser?.id === String(u.id);
                  const roleColor = ROLE_COLORS[u.role] || '#64748B';

                  return (
                    <tr key={u.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-4 py-3 text-sm font-mono text-[#64748B]">{u.id}</td>
                      <td className="px-4 py-3 text-sm text-[#0F172A] font-medium">{u.email}</td>
                      <td className="px-4 py-3 text-sm text-[#334155]">{u.username}</td>
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
                      <td className="px-4 py-3 text-sm text-[#64748B]">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-sm text-[#334155] font-medium">{formatLastActive(u.last_active_at)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-[#334155]">
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
                          <span className="text-xs text-[#94A3B8] italic">You</span>
                        ) : toggling === u.id ? (
                          <Loader2 size={16} className="animate-spin text-[#64748B] mx-auto" />
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
