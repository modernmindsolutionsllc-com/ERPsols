import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Server,
  Lock,
  ShieldCheck,
  Loader2,
  Globe,
  Pencil,
  UserPlus,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════════════
//  SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

function getAuthToken(): string | null {
  try {
    const saved = sessionStorage.getItem('migrateos_auth');
    if (saved) return JSON.parse(saved).token;
  } catch { /* ignore */ }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ENV SETUP MODAL
// ═══════════════════════════════════════════════════════════════════════════════

interface EnvSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (newEnvName?: string) => void;
}

export function EnvSetupModal({ open, onOpenChange, onSuccess }: EnvSetupModalProps) {
  const [projectName, setProjectName] = useState('');
  const [oracleUrl, setOracleUrl] = useState('https://fa-etaj-saasfademo1.ds-fa.oraclepdemos.com');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !oracleUrl.trim() || !username.trim() || !password) {
      toast.error('All fields are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = getAuthToken();
      if (!token) throw new Error('Not authenticated.');

      const response = await fetch(`${API_BASE_URL}/api/v1/integrations/oracle/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          oracle_url: oracleUrl.trim(),
          env_name: projectName.trim(),
          oracle_username: username.trim(),
          oracle_password: password,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to set up environment.');

      toast.success(`Environment "${projectName}" configured successfully.`);
      const createdEnv = projectName.trim();
      setProjectName('');
      setOracleUrl('https://fa-etaj-saasfademo1.ds-fa.oraclepdemos.com');
      setUsername('');
      setPassword('');
      onOpenChange(false);
      onSuccess?.(createdEnv);
    } catch (error: any) {
      toast.error(error.message || 'A network error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-0 dark:border dark:border-white/10">
        {/* Header gradient */}
        <div
          className="px-6 pt-6 pb-4"
          style={{
            background: 'linear-gradient(145deg, #0D3B6E 0%, #185FA5 100%)',
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="size-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <Globe size={20} className="text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white p-0 shadow-none border-0">
                Environment Setup
              </DialogTitle>
              <DialogDescription className="text-white/60 text-xs mt-0">
                Configure Oracle Fusion connection
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-400/20 text-emerald-200 text-[11px] font-medium">
            <ShieldCheck size={13} />
            Credentials encrypted end-to-end via Fernet vault
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="env-project" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Project / Environment Name
            </Label>
            <Input
              id="env-project"
              placeholder="e.g., Production Oracle Fusion"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={isSubmitting}
              className="dark:bg-white/5 dark:border-white/10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="env-url" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Oracle BIP URL
            </Label>
            <div className="relative">
              <Input
                id="env-url"
                placeholder="https://your-instance.oraclecloud.com"
                value={oracleUrl}
                onChange={(e) => setOracleUrl(e.target.value)}
                disabled={isSubmitting}
                className="pr-9 dark:bg-white/5 dark:border-white/10"
              />
              <Server className="absolute right-3 top-2.5 text-muted-foreground" size={14} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="env-user" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Username
              </Label>
              <Input
                id="env-user"
                placeholder="admin.user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                className="dark:bg-white/5 dark:border-white/10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="env-pass" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="env-pass"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  className="pr-9 dark:bg-white/5 dark:border-white/10"
                />
                <Lock className="absolute right-3 top-2.5 text-muted-foreground" size={14} />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#185FA5] hover:bg-[#0D3B6E] text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Environment'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  EDIT CREDENTIALS MODAL
// ═══════════════════════════════════════════════════════════════════════════════

interface EditCredentialsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUsername?: string;
  currentEnvName?: string;
  currentUrl?: string;
  onSuccess?: () => void;
}

export function EditCredentialsModal({ open, onOpenChange, currentUsername, currentEnvName, currentUrl, onSuccess }: EditCredentialsModalProps) {
  const [projectName, setProjectName] = useState(currentEnvName || '');
  const [username, setUsername] = useState(currentUsername || '');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state when the modal opens with fresh props
  React.useEffect(() => {
    if (open) {
      if (currentUsername) setUsername(currentUsername);
      if (currentEnvName) setProjectName(currentEnvName);
    }
  }, [open, currentUsername, currentEnvName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error('Both username and password are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = getAuthToken();
      if (!token) throw new Error('Not authenticated.');

      const response = await fetch(`${API_BASE_URL}/api/v1/integrations/oracle/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          old_env_name: currentEnvName || 'Demo Oracle Fusion',
          env_name: projectName.trim() || 'Demo Oracle Fusion',
          oracle_url: currentUrl || 'https://fa-etaj-saasfademo1.ds-fa.oraclepdemos.com',
          oracle_username: username.trim(),
          oracle_password: password,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to update credentials.');

      toast.success('Oracle credentials updated and re-encrypted.');
      setPassword('');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || 'A network error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="mx-auto size-12 rounded-full bg-amber-500/10 dark:bg-amber-500/15 flex items-center justify-center mb-2">
            <Pencil className="text-amber-500" size={22} />
          </div>
          <DialogTitle className="text-center text-lg">Edit Oracle Credentials</DialogTitle>
          <DialogDescription className="text-center">
            Update the credentials for the active Oracle connection.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          <div className="space-y-1.5">
            <Label htmlFor="edit-env">Project Name</Label>
            <Input
              id="edit-env"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={isSubmitting}
              className="dark:bg-white/5 dark:border-white/10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-user">Oracle Username</Label>
            <Input
              id="edit-user"
              placeholder="e.g., admin.user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting}
              className="dark:bg-white/5 dark:border-white/10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-pass">New Password</Label>
            <div className="relative">
              <Input
                id="edit-pass"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="pr-9 dark:bg-white/5 dark:border-white/10"
              />
              <Lock className="absolute right-3 top-2.5 text-muted-foreground" size={14} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-amber-600 hover:bg-amber-700 text-white">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Update Credentials'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  ADD ACCOUNT MODAL
// ═══════════════════════════════════════════════════════════════════════════════

interface AddAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (newEnvName?: string) => void;
}

export function AddAccountModal({ open, onOpenChange, onSuccess }: AddAccountModalProps) {
  const [envName, setEnvName] = useState('');
  const [oracleUrl, setOracleUrl] = useState('https://fa-etaj-saasfademo1.ds-fa.oraclepdemos.com');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!envName.trim() || !username.trim() || !password) {
      toast.error('All fields are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = getAuthToken();
      if (!token) throw new Error('Not authenticated.');

      const response = await fetch(`${API_BASE_URL}/api/v1/integrations/oracle/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          oracle_url: oracleUrl.trim(),
          env_name: envName.trim(),
          oracle_username: username.trim(),
          oracle_password: password,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to add account.');

      toast.success(`Account "${username}" added to "${envName}".`);
      const createdEnv = envName.trim();
      setEnvName('');
      setOracleUrl('https://fa-etaj-saasfademo1.ds-fa.oraclepdemos.com');
      setUsername('');
      setPassword('');
      onOpenChange(false);
      onSuccess?.(createdEnv);
    } catch (error: any) {
      toast.error(error.message || 'A network error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <div className="mx-auto size-12 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center mb-2">
            <UserPlus className="text-emerald-500" size={22} />
          </div>
          <DialogTitle className="text-center text-lg">Add Oracle Account</DialogTitle>
          <DialogDescription className="text-center">
            Add secondary credentials for a different Oracle environment.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          <div className="space-y-1.5">
            <Label htmlFor="add-env">Environment Label</Label>
            <Input
              id="add-env"
              placeholder="e.g., Staging Oracle Cloud"
              value={envName}
              onChange={(e) => setEnvName(e.target.value)}
              disabled={isSubmitting}
              className="dark:bg-white/5 dark:border-white/10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-url">Oracle BIP URL</Label>
            <div className="relative">
              <Input
                id="add-url"
                placeholder="https://your-instance.oraclecloud.com"
                value={oracleUrl}
                onChange={(e) => setOracleUrl(e.target.value)}
                disabled={isSubmitting}
                className="pr-9 dark:bg-white/5 dark:border-white/10"
              />
              <Server className="absolute right-3 top-2.5 text-muted-foreground" size={14} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-user">Username</Label>
              <Input
                id="add-user"
                placeholder="admin.user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                className="dark:bg-white/5 dark:border-white/10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-pass">Password</Label>
              <div className="relative">
                <Input
                  id="add-pass"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  className="pr-9 dark:bg-white/5 dark:border-white/10"
                />
                <Lock className="absolute right-3 top-2.5 text-muted-foreground" size={14} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Account'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  DELETE ALL USERS CONFIRMATION MODAL
// ═══════════════════════════════════════════════════════════════════════════════

interface DeleteAllUsersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm?: () => void;
}

export function DeleteAllUsersModal({ open, onOpenChange, onConfirm }: DeleteAllUsersModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const isConfirmed = confirmText === 'DELETE ALL';

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setIsDeleting(true);

    try {
      // Delegate to parent's onConfirm which calls the real API
      await onConfirm?.();
      setConfirmText('');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete credentials.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { onOpenChange(val); if (!val) setConfirmText(''); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="mx-auto size-12 rounded-full bg-red-500/10 dark:bg-red-500/15 flex items-center justify-center mb-2">
            <AlertTriangle className="text-red-500" size={24} />
          </div>
          <DialogTitle className="text-center text-lg text-red-600 dark:text-red-400">
            Delete All Oracle Accounts
          </DialogTitle>
          <DialogDescription className="text-center">
            This will permanently remove <strong>all</strong> stored Oracle credentials from the encrypted vault.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            <div className="flex items-start gap-2">
              <Trash2 size={15} className="mt-0.5 shrink-0" />
              <span>
                All encrypted Oracle usernames, passwords, and environment configurations will be deleted.
                You will need to re-enter credentials to reconnect.
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-delete" className="text-xs text-muted-foreground">
              Type <span className="font-mono font-bold text-red-500">DELETE ALL</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
              placeholder="DELETE ALL"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isDeleting}
              className="font-mono dark:bg-white/5 dark:border-white/10"
            />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => { onOpenChange(false); setConfirmText(''); }}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!isConfirmed || isDeleting}
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete All Accounts
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
