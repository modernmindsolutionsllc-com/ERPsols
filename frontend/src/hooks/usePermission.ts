import { useMemo } from 'react';
import { ROLE_PERMISSIONS } from '@/utils/constants';
import { useAuth } from '@/context/AuthContext';
import type { ToolKey } from '@/types';

export function usePermission(action: string): boolean {
  const { user } = useAuth();
  return useMemo(() => {
    if (!user) return false;
    const perms = ROLE_PERMISSIONS[user.role] || [];
    return perms.includes(action);
  }, [user, action]);
}

export function useToolAccess(toolKey: ToolKey): boolean {
  const { user } = useAuth();
  return useMemo(() => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'Admin') return true;
    return Boolean(user.tool_access?.includes(toolKey));
  }, [user, toolKey]);
}
