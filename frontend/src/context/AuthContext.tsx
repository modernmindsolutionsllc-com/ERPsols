import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { AuthState, SignupPayload, User } from '@/types';
import { authApi } from '@/services/api';
import { toast } from 'sonner';

interface AuthContextType extends AuthState {
  requestOtp: (email: string) => Promise<boolean>;
  verifyOtp: (email: string, otpCode: string) => Promise<{ token: string; user: User } | null>;
  refreshUser: () => Promise<User | null>;
  signup: (payload: SignupPayload) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    // Try to restore from sessionStorage (not localStorage per security requirements)
    const saved = sessionStorage.getItem('migrateos_auth');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { user: parsed.user, token: parsed.token, isAuthenticated: true };
      } catch {
        return { user: null, token: null, isAuthenticated: false };
      }
    }
    return { user: null, token: null, isAuthenticated: false };
  });

  // Persist to sessionStorage (not localStorage for security)
  useEffect(() => {
    if (state.isAuthenticated && state.token && state.user) {
      sessionStorage.setItem('migrateos_auth', JSON.stringify({ user: state.user, token: state.token }));
    } else {
      sessionStorage.removeItem('migrateos_auth');
    }
  }, [state]);

  // Idle timeout (15 minutes, warning at 13)
  useEffect(() => {
    if (!state.isAuthenticated) return;

    let warningTimer: ReturnType<typeof setTimeout>;
    let logoutTimer: ReturnType<typeof setTimeout>;
    let warned = false;

    const resetTimers = () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      warned = false;
      warningTimer = setTimeout(() => {
        warned = true;
        toast.warning('Session expires in 2 minutes. Click anywhere to stay signed in.', { duration: 120000 });
      }, 13 * 60 * 1000);
      logoutTimer = setTimeout(() => {
        toast.error('Session expired. Please sign in again.');
        logout();
      }, 15 * 60 * 1000);
    };

    resetTimers();
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const handler = () => {
      if (warned) {
        toast.dismiss();
        warned = false;
      }
      resetTimers();
    };

    events.forEach(e => window.addEventListener(e, handler));
    return () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      events.forEach(e => window.removeEventListener(e, handler));
    };
  }, [state.isAuthenticated]);

  const requestOtp = useCallback(async (email: string): Promise<boolean> => {
    const result = await authApi.requestOtp(email);
    if ('error' in result) {
      toast.error(result.error.message);
      return false;
    }
    toast.success(result.message);
    return true;
  }, []);

  const verifyOtp = useCallback(async (email: string, otpCode: string): Promise<{ token: string; user: User } | null> => {
    const result = await authApi.verifyOtp(email, otpCode);
    if ('error' in result) {
      toast.error(result.error.message);
      return null;
    }
    setState({ user: result.user, token: result.token, isAuthenticated: true });
    toast.success(`Welcome, ${result.user.name}`);
    return result;
  }, []);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    if (!state.isAuthenticated || !state.token) return null;

    const result = await authApi.getMe();
    if ('error' in result) {
      if (result.error.code === 'HTTP_401' || result.error.code === 'HTTP_403') {
        setState({ user: null, token: null, isAuthenticated: false });
        sessionStorage.removeItem('migrateos_auth');
      }
      return null;
    }

    setState(prev => ({ ...prev, user: result, isAuthenticated: true }));
    return result;
  }, [state.isAuthenticated, state.token]);

  useEffect(() => {
    if (!state.isAuthenticated) return;
    void refreshUser();
  }, [state.isAuthenticated, refreshUser]);

  const signup = useCallback(async (payload: SignupPayload): Promise<boolean> => {
    const result = await authApi.signup(payload);
    if ('error' in result) {
      toast.error(result.error.message);
      return false;
    }
    toast.success(result.message);
    return true;
  }, []);

  const logout = useCallback(() => {
    setState({ user: null, token: null, isAuthenticated: false });
    sessionStorage.removeItem('migrateos_auth');
    toast.info('Signed out successfully');
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, requestOtp, verifyOtp, refreshUser, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
