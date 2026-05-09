import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Server, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ConnectOracleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectOracleModal({ open, onOpenChange }: ConnectOracleModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error('Please fill in both Oracle username and password.');
      return;
    }

    setIsSubmitting(true);

    try {
      let token: string | null = null;
      const saved = sessionStorage.getItem('migrateos_auth');
      if (saved) token = JSON.parse(saved).token;

      if (!token) {
        throw new Error('Not authenticated.');
      }

      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
      const response = await fetch(`${API_BASE_URL}/api/v1/integrations/oracle/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          oracle_username: username,
          oracle_password: password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to save credentials.');
      }

      toast.success(data.message || 'Credentials encrypted and saved securely.');
      setUsername('');
      setPassword('');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'A network error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-[#185FA5]/10 flex items-center justify-center mb-4">
            <Server className="text-[#185FA5]" size={24} />
          </div>
          <DialogTitle className="text-center text-xl">Link Oracle Fusion Account</DialogTitle>
          <DialogDescription className="text-center pt-2">
            <span className="flex items-center justify-center gap-1.5 text-emerald-600 bg-emerald-50 py-1.5 px-3 rounded-md border border-emerald-100 font-medium">
              <ShieldCheck size={16} />
              Your credentials are encrypted end-to-end and stored in our secure vault.
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="oracle-username">Oracle Username</Label>
            <Input
              id="oracle-username"
              placeholder="e.g., admin.user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="oracle-password">Oracle Password</Label>
            <div className="relative">
              <Input
                id="oracle-password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="pr-10"
              />
              <Lock className="absolute right-3 top-2.5 text-gray-400" size={16} />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full bg-[#185FA5] hover:bg-[#0D3B6E] text-white mt-2"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Encrypting & Saving...
              </>
            ) : (
              'Save Encrypted Credentials'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
