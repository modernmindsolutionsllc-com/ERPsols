import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { SignupPayload } from '@/types';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';

type AuthMode = 'signin' | 'signup';
type SignInStep = 'email' | 'otp';

const emptySignup: SignupPayload = {
  username: '',
  email: '',
  password: '',
  role: 'user', // SECURITY: Public signup is always 'user' — admin/enterprise assigned internally
};

export function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [step, setStep] = useState<SignInStep>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [signupForm, setSignupForm] = useState<SignupPayload>(emptySignup);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { requestOtp, verifyOtp, signup } = useAuth();
  const navigate = useNavigate();

  const submitOtpRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setDevOtp('');
    setLoading(true);
    const result = await requestOtp(email.trim());

    if (result && !result.error) {
      if (result.bypassLogin && result.devOtp) {
        const verified = await verifyOtp(email.trim(), result.devOtp);
        setLoading(false);

        if (verified) {
          const destination = verified.user.role === 'admin' ? '/admin' : '/dashboard';
          navigate(destination);
          return;
        }

        setError('Temporary bypass was enabled, but automatic sign-in did not complete.');
        return;
      }

      setLoading(false);
      setStep('otp');
      setOtpCode('');
      setDevOtp(result.devOtp ?? '');
    } else {
      setLoading(false);
      setError(result?.error || 'Could not send the login code. Check the email and backend connection.');
    }
  };

  const submitOtpVerification = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    const result = await verifyOtp(email.trim(), otpCode.trim());
    setLoading(false);

    if (result) {
      // Role-based redirect: admin → /admin, everyone else → /dashboard
      const destination = result.user.role === 'admin' ? '/admin' : '/dashboard';
      navigate(destination);
    } else {
      setError('The code was not accepted. Request a new one if it has expired.');
    }
  };

  const submitSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    const success = await signup({
      ...signupForm,
      username: signupForm.username.trim(),
      email: signupForm.email.trim(),
    });
    setLoading(false);

    if (success) {
      setMode('signin');
      setStep('email');
      setEmail(signupForm.email.trim());
      setSignupForm(emptySignup);
    } else {
      setError('Account creation failed. Check the values or try another email.');
    }
  };

  return (
    <main className="min-h-screen bg-[#F3F4F6]">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 lg:grid-cols-[1fr_460px]">
        <section className="hidden flex-col justify-between px-10 py-10 lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#185FA5] text-white">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-base font-semibold text-[#0F172A]">MigrateOS</p>
              <p className="text-xs text-[#64748B]">Enterprise Data Migration Platform</p>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#CBD5E1] bg-white px-3 py-1 text-xs font-medium text-[#334155]">
              <CheckCircle2 size={14} className="text-[#0F6E56]" />
              OTP secured access
            </div>
            <h1 className="text-4xl font-semibold leading-tight text-[#0F172A]">
              Secure access for ERP migration operations.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-[#475569]">
              Sign in with the same OTP flow exposed by the FastAPI backend and continue into config snapshots,
              data conversion, BIP reporting, and payroll reconciliation.
            </p>
          </div>

          {/* UI badges completely removed for clean onboarding experience */}
        </section>

        <section className="flex items-center justify-center px-4 py-8 sm:px-6">
          <div className="w-full max-w-[460px] rounded-lg border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-[#185FA5] text-white lg:hidden">
                  <ShieldCheck size={21} />
                </div>
                <h2 className="text-xl font-semibold text-[#0F172A]">
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </h2>
                <p className="mt-1 text-sm text-[#64748B]">
                  {mode === 'signin' ? 'Use your registered work email.' : 'Provision a backend user.'}
                </p>
              </div>

              <div className="flex rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError('');
                  }}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'signin' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError('');
                  }}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'signup' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                >
                  Sign up
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-5 flex items-start gap-2 rounded-md border border-[#F1C7B7] bg-[#FFF7F3] p-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#993C1D]" />
                <span className="text-sm text-[#993C1D]">{error}</span>
              </div>
            )}

            {mode === 'signin' && step === 'email' && (
              <form onSubmit={submitOtpRequest} className="space-y-5">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[#0F172A]">Work email</span>
                  <span className="relative block">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      type="email"
                      value={email}
                      onChange={event => {
                        setEmail(event.target.value);
                        if (error) setError('');
                        if (devOtp) setDevOtp('');
                      }}
                      placeholder="you@company.com"
                      className="h-10 w-full rounded-md border border-[#CBD5E1] bg-white pl-10 pr-3 text-sm text-[#0F172A] transition-all placeholder:text-[#94A3B8] focus:border-[#185FA5] focus:outline-none focus:ring-4 focus:ring-[#185FA5]/15"
                      required
                    />
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#185FA5] text-sm font-medium text-white transition-colors hover:bg-[#124A82] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? <Loader2 size={17} className="animate-spin" /> : <KeyRound size={17} />}
                  Send login code
                </button>
              </form>
            )}

            {mode === 'signin' && step === 'otp' && (
              <form onSubmit={submitOtpVerification} className="space-y-5">
                <div className="rounded-md border border-[#D7E7F7] bg-[#F5FAFF] p-3 text-sm text-[#185FA5]">
                  Code sent for <span className="font-medium">{email}</span>
                </div>

                {devOtp && (
                  <div className="rounded-md border border-[#F6D98F] bg-[#FFF9E8] p-3 text-sm text-[#8A6116]">
                    Dev fallback code: <span className="font-mono font-semibold tracking-[0.2em]">{devOtp}</span>
                  </div>
                )}

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[#0F172A]">6-digit code</span>
                  <span className="relative block">
                    <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      inputMode="numeric"
                      maxLength={6}
                      value={otpCode}
                      onChange={event => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="h-11 w-full rounded-md border border-[#CBD5E1] bg-white pl-10 pr-3 text-center font-mono text-lg tracking-[0.35em] text-[#0F172A] transition-all placeholder:text-[#94A3B8] focus:border-[#185FA5] focus:outline-none focus:ring-4 focus:ring-[#185FA5]/15"
                      required
                    />
                  </span>
                </label>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('email')}
                    className="h-10 rounded-md border border-[#CBD5E1] px-4 text-sm font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || otpCode.length !== 6}
                    className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-[#185FA5] text-sm font-medium text-white transition-colors hover:bg-[#124A82] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
                    Verify and enter
                  </button>
                </div>
              </form>
            )}

            {mode === 'signup' && (
              <form onSubmit={submitSignup} className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[#0F172A]">Username</span>
                  <span className="relative block">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      value={signupForm.username}
                      onChange={event => setSignupForm(current => ({ ...current, username: event.target.value }))}
                      placeholder="risha"
                      className="h-10 w-full rounded-md border border-[#CBD5E1] bg-white pl-10 pr-3 text-sm text-[#0F172A] transition-all placeholder:text-[#94A3B8] focus:border-[#185FA5] focus:outline-none focus:ring-4 focus:ring-[#185FA5]/15"
                      required
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[#0F172A]">Work email</span>
                  <span className="relative block">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      type="email"
                      value={signupForm.email}
                      onChange={event => setSignupForm(current => ({ ...current, email: event.target.value }))}
                      placeholder="you@company.com"
                      className="h-10 w-full rounded-md border border-[#CBD5E1] bg-white pl-10 pr-3 text-sm text-[#0F172A] transition-all placeholder:text-[#94A3B8] focus:border-[#185FA5] focus:outline-none focus:ring-4 focus:ring-[#185FA5]/15"
                      required
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[#0F172A]">Password</span>
                  <span className="relative block">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      type="password"
                      minLength={8}
                      value={signupForm.password}
                      onChange={event => setSignupForm(current => ({ ...current, password: event.target.value }))}
                      placeholder="Minimum 8 characters"
                      className="h-10 w-full rounded-md border border-[#CBD5E1] bg-white pl-10 pr-3 text-sm text-[#0F172A] transition-all placeholder:text-[#94A3B8] focus:border-[#185FA5] focus:outline-none focus:ring-4 focus:ring-[#185FA5]/15"
                      required
                    />
                  </span>
                </label>

                {/* SECURITY: Role is hardcoded to 'user' — no public selector */}
                <p className="text-xs text-[#94A3B8] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2">
                  Account will be created with <span className="font-medium text-[#334155]">User</span> role. Contact an admin for elevated access.
                </p>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#185FA5] text-sm font-medium text-white transition-colors hover:bg-[#124A82] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? <Loader2 size={17} className="animate-spin" /> : <UserPlus size={17} />}
                  Create account
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
