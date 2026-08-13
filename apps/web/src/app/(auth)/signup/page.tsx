'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, User, Globe } from 'lucide-react';
import { PrimaryButton, OutlineButton } from '@/components/ui/Buttons';
import { FormField, Input } from '@/components/ui/FormField';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    // TODO: Connect to Supabase auth
    await new Promise(r => setTimeout(r, 1000));
    router.push('/onboarding');
    setLoading(false);
  }

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
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <FormField label="Full Name" required>
          <Input
            type="text"
            placeholder="Your full name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            icon={<User size={16} />}
            autoComplete="name"
            required
          />
        </FormField>

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

        <FormField label="Password" required hint="Minimum 6 characters">
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder="Create a strong password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            icon={<Lock size={16} />}
            rightElement={
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '4px', minHeight: 'auto', color: 'var(--color-medium)' }}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            autoComplete="new-password"
            minLength={6}
            required
          />
        </FormField>

        {error && (
          <div style={{ background: 'var(--color-red-soft)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', padding: '12px', fontSize: '14px', color: 'var(--color-red)' }}>
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

        <OutlineButton type="button" fullWidth icon={<Globe size={18} />} onClick={() => {/* TODO: Google OAuth */}}>
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
