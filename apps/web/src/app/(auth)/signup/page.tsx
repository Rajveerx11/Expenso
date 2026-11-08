'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Eye, EyeOff, Mail, Lock, User, Globe } from 'lucide-react';
import { PrimaryButton, OutlineButton } from '@/components/ui/Buttons';
import { FormField, Input } from '@/components/ui/FormField';
import { bestEffortDisableCurrentPush } from '@/features/push/cleanup';
import { api, fieldErrorFor, fieldErrorsFor, focusFirstInvalidField, messageForError, type ApiFieldErrors } from '@/lib/api/client';

export function EmailConfirmationScreen({ email }: { email: string }) {
  return (
    <div className="animate-slideUp" role="status" style={{ textAlign: 'center' }}>
      <div aria-hidden="true" style={{ width: 56, height: 56, margin: '0 auto 20px', borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--color-green)', background: 'var(--color-green-soft)' }}>
        <CheckCircle size={30} />
      </div>
      <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-black)', lineHeight: 1.2, marginBottom: '10px' }}>
        Check your inbox
      </h1>
      <p style={{ fontSize: '15px', color: 'var(--color-dark)', lineHeight: 1.6 }}>
        We sent a confirmation link to <strong style={{ wordBreak: 'break-word' }}>{email}</strong>.
      </p>
      <p style={{ fontSize: '14px', color: 'var(--color-medium)', lineHeight: 1.6, margin: '10px 0 24px' }}>
        Confirm your email, then return to sign in. You do not need to create the account again.
      </p>
      <Link href="/login" className="btn btn-primary btn-lg" style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}>
        Return to Sign In
      </Link>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setLoading(true);
    try {
      await bestEffortDisableCurrentPush();
      const result = await api.auth.signup({ fullName, email, password });
      queryClient.clear();
      if (result.emailConfirmationRequired) setConfirmationSent(true);
      else {
        router.replace('/onboarding');
        router.refresh();
      }
    } catch (requestError) {
      setError(messageForError(requestError));
      setFieldErrors(fieldErrorsFor(requestError));
      focusFirstInvalidField(formRef.current);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setFieldErrors({});
    setLoading(true);
    try {
      await bestEffortDisableCurrentPush();
      const { url } = await api.auth.google('/onboarding');
      queryClient.clear();
      window.location.assign(url);
    } catch (requestError) {
      setError(messageForError(requestError));
      setLoading(false);
    }
  }

  if (confirmationSent) return <EmailConfirmationScreen email={email} />;

  const fullNameError = fieldErrorFor(fieldErrors, 'fullName');
  const emailError = fieldErrorFor(fieldErrors, 'email');
  const passwordError = fieldErrorFor(fieldErrors, 'password');

  return (
    <div className="animate-slideUp">
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-black)', lineHeight: 1.2, marginBottom: '8px' }}>
          Create account
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--color-medium)' }}>Start tracking expenses beautifully</p>
      </div>

      {/* Form */}
      <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <FormField label="Full Name" error={fullNameError} required>
          <Input
            type="text"
            placeholder="Your full name"
            value={fullName}
            onChange={e => { setFullName(e.target.value); setFieldErrors((current) => ({ ...current, fullName: [] })); }}
            error={Boolean(fullNameError)}
            icon={<User size={16} />}
            autoComplete="name"
            required
          />
        </FormField>

        <FormField label="Email" error={emailError} required>
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setFieldErrors((current) => ({ ...current, email: [] })); }}
            error={Boolean(emailError)}
            icon={<Mail size={16} />}
            autoComplete="email"
            inputMode="email"
            required
          />
        </FormField>

        <FormField label="Password" error={passwordError} required hint="Minimum 8 characters">
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder="Create a strong password"
            value={password}
            onChange={e => { setPassword(e.target.value); setFieldErrors((current) => ({ ...current, password: [] })); }}
            error={Boolean(passwordError)}
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
            autoComplete="new-password"
            minLength={8}
            required
          />
        </FormField>

        {error && (
          <div role="alert" style={{ background: 'var(--color-red-soft)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', padding: '12px', fontSize: '14px', color: 'var(--color-red)' }}>
            {error}
          </div>
        )}

        <PrimaryButton type="submit" fullWidth size="lg" loading={loading} style={{ marginTop: '8px' }}>
          Create Account
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
        Already have an account?{' '}
        <Link href="/login" style={{ color: 'var(--color-primary-deep)', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
      </p>
    </div>
  );
}
