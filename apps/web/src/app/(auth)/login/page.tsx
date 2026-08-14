'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Mail, Lock, Globe } from 'lucide-react';
import { PrimaryButton, OutlineButton } from '@/components/ui/Buttons';
import { FormField, Input } from '@/components/ui/FormField';
import { bestEffortDisableCurrentPush } from '@/features/push/cleanup';
import { api, messageForError, safeRelativePath } from '@/lib/api/client';

const OAUTH_FAILURE_MESSAGE = 'Sign-in confirmation did not finish. Try again, or sign in with your email and password.';

export function oauthCallbackError(code: string | null): string {
  return code === 'oauth_failed' ? OAUTH_FAILURE_MESSAGE : '';
}

export function oauthRetryPath(pathname: string, search: string, hash = ''): string {
  const params = new URLSearchParams(search);
  params.delete('error');
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}

export function OAuthFailureAlert() {
  return (
    <div role="alert" style={{ background: 'var(--color-red-soft)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', padding: '12px', fontSize: '14px', color: 'var(--color-red)', lineHeight: 1.5 }}>
      {OAUTH_FAILURE_MESSAGE}
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [oauthFailureDismissed, setOauthFailureDismissed] = useState(false);
  const oauthFailure = !oauthFailureDismissed && oauthCallbackError(searchParams.get('error'));

  function clearErrorsForRetry() {
    setError('');
    setOauthFailureDismissed(true);
    if (oauthFailure) {
      window.history.replaceState(
        window.history.state,
        '',
        oauthRetryPath(window.location.pathname, window.location.search, window.location.hash),
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearErrorsForRetry();
    setLoading(true);
    try {
      await bestEffortDisableCurrentPush();
      await api.auth.login({ email, password });
      queryClient.clear();
      const destination = safeRelativePath(new URLSearchParams(window.location.search).get('next'));
      router.replace(destination);
      router.refresh();
    } catch (requestError) {
      setError(messageForError(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    clearErrorsForRetry();
    setLoading(true);
    try {
      await bestEffortDisableCurrentPush();
      const next = safeRelativePath(new URLSearchParams(window.location.search).get('next'));
      const { url } = await api.auth.google(next);
      queryClient.clear();
      window.location.assign(url);
    } catch (requestError) {
      setError(messageForError(requestError));
      setLoading(false);
    }
  }

  return (
    <div className="animate-slideUp">
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-black)', lineHeight: 1.2, marginBottom: '8px' }}>
          Welcome back
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--color-medium)' }}>Sign in to your Expenso account</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <FormField label="Email" required>
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            icon={<Mail size={16} />}
            autoComplete="email"
            inputMode="email"
            required
          />
        </FormField>

        <FormField label="Password" required>
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder="Your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            icon={<Lock size={16} />}
            rightElement={
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: 0, width: 44, height: 44, minHeight: 44, color: 'var(--color-medium)' }}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            autoComplete="current-password"
            required
          />
        </FormField>

        {error && (
          <div role="alert" style={{ background: 'var(--color-red-soft)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', padding: '12px', fontSize: '14px', color: 'var(--color-red)' }}>
            {error}
          </div>
        )}
        {!error && oauthFailure && <OAuthFailureAlert />}

        <PrimaryButton type="submit" fullWidth size="lg" loading={loading} style={{ marginTop: '8px' }}>
          Sign In
        </PrimaryButton>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-light)' }} />
          <span style={{ fontSize: '12px', color: 'var(--color-medium)', fontWeight: 500 }}>OR</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-light)' }} />
        </div>

        <OutlineButton type="button" fullWidth loading={loading} icon={<Globe size={18} />} onClick={handleGoogle}>
          Continue with Google
        </OutlineButton>
      </form>

      {/* Footer */}
      <p style={{ textAlign: 'center', marginTop: '28px', fontSize: '14px', color: 'var(--color-medium)' }}>
        Don&apos;t have an account?{' '}
        <Link href="/signup" style={{ color: 'var(--color-primary-deep)', fontWeight: 600, textDecoration: 'none' }}>Sign up</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p role="status" style={{ color: 'var(--color-medium)', fontSize: 14 }}>Loading sign in…</p>}>
      <LoginForm />
    </Suspense>
  );
}
