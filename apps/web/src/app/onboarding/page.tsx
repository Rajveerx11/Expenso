'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, CheckCircle } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';
import { FormField, Input } from '@/components/ui/FormField';

export default function OnboardingPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('Yuvraj Gandhmal');
  const [upiId, setUpiId] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    setLoading(true);
    // TODO: Save profile to Supabase
    await new Promise(r => setTimeout(r, 800));
    router.push('/dashboard');
    setLoading(false);
  }

  return (
    <div className="animate-slideUp">
      {/* Icon */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '24px',
          background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(79,70,229,0.35)',
        }}>
          <Wallet size={36} color="white" />
        </div>
      </div>

      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-black)', lineHeight: 1.2, marginBottom: '8px' }}>
          Make Expenso yours
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--color-medium)' }}>Let's set up your profile to get started</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
        <FormField label="Display Name" required hint="This is how your friends will see you">
          <Input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </FormField>

        <FormField label="UPI ID" hint="Optional — e.g. name@bank. Friends can pay you directly.">
          <Input
            type="text"
            value={upiId}
            onChange={e => setUpiId(e.target.value)}
            placeholder="name@bank"
            inputMode="email"
            autoComplete="off"
          />
        </FormField>

        {/* Benefits list */}
        <div style={{ background: 'var(--color-primary-lightest)', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {['Track personal income and expenses', 'Split costs with groups', 'Settle up with UPI payments'].map(text => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CheckCircle size={16} color="var(--color-primary-deep)" />
              <span style={{ fontSize: '14px', color: 'var(--color-dark)' }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      <PrimaryButton fullWidth size="lg" loading={loading} onClick={handleContinue}>
        Get Started
      </PrimaryButton>
      <SecondaryButton fullWidth style={{ marginTop: '12px' }} onClick={() => router.push('/dashboard')}>
        Skip for now
      </SecondaryButton>
    </div>
  );
}
