'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, CheckCircle } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';
import { FormField, Input } from '@/components/ui/FormField';
import { BackgroundRefreshError, PageError, PageLoading, queryErrorPresentation } from '@/components/ui/AsyncState';
import { api, fieldErrorFor, fieldErrorsFor, focusFirstInvalidField, messageForError, safeRelativePath, type ApiFieldErrors } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import type { Profile } from '@/lib/types';

export function onboardingDestination(search: string): string {
  return safeRelativePath(new URLSearchParams(search).get('next'));
}

export default function OnboardingPage() {
  const profileQuery = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile.get });
  const errorPresentation = queryErrorPresentation(profileQuery.error, profileQuery.data !== undefined);

  if (profileQuery.isPending) return <main><PageLoading label="Loading profile" /></main>;
  if (errorPresentation === 'blocking') return <main><PageError message={messageForError(profileQuery.error)} retry={() => profileQuery.refetch()} /></main>;

  return <main><OnboardingForm key={profileQuery.data!.updatedAt} initialProfile={profileQuery.data!} refreshWarning={errorPresentation === 'background'} retry={() => void profileQuery.refetch()} isRetrying={profileQuery.isFetching} /></main>;
}

function OnboardingForm({ initialProfile, refreshWarning, retry, isRetrying }: { initialProfile: Profile; refreshWarning: boolean; retry: () => void; isRetrying: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(initialProfile.fullName);
  const [upiId, setUpiId] = useState(initialProfile.upiId ?? '');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const updateProfile = useMutation({
    mutationFn: api.profile.update,
    onSuccess: (profile) => queryClient.setQueryData(queryKeys.profile, profile),
  });

  async function handleContinue(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    if (!displayName.trim()) { setError('Display name is required.'); return; }
    try {
      await updateProfile.mutateAsync({ fullName: displayName, upiId: upiId.trim() || null });
      router.replace(onboardingDestination(window.location.search));
      router.refresh();
    } catch (requestError) {
      setError(messageForError(requestError));
      setFieldErrors(fieldErrorsFor(requestError));
      focusFirstInvalidField(formRef.current);
    }
  }

  const displayNameError = fieldErrorFor(fieldErrors, 'fullName', 'displayName');
  const upiIdError = fieldErrorFor(fieldErrors, 'upiId');

  return (
    <form ref={formRef} className="animate-slideUp" onSubmit={handleContinue}>
      {refreshWarning && <BackgroundRefreshError retry={retry} isRetrying={isRetrying} />}
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
        <p style={{ fontSize: '15px', color: 'var(--color-medium)' }}>Let&apos;s set up your profile to get started</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
        <FormField label="Display Name" error={displayNameError} required hint="This is how your friends will see you">
          <Input
            type="text"
            value={displayName}
            onChange={e => { setDisplayName(e.target.value); setFieldErrors((current) => ({ ...current, fullName: [], displayName: [] })); }}
            error={Boolean(displayNameError)}
            placeholder="Your name"
            autoComplete="name"
          />
        </FormField>

        <FormField label="UPI ID" error={upiIdError} hint="Optional — e.g. name@bank. Friends can pay you directly.">
          <Input
            type="text"
            value={upiId}
            onChange={e => { setUpiId(e.target.value); setFieldErrors((current) => ({ ...current, upiId: [] })); }}
            error={Boolean(upiIdError)}
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
        {error && <div role="alert" style={{ color: 'var(--color-red)', fontSize: 13 }}>{error}</div>}
      </div>

      <PrimaryButton type="submit" fullWidth size="lg" loading={updateProfile.isPending}>
        Get Started
      </PrimaryButton>
      <SecondaryButton type="button" fullWidth style={{ marginTop: '12px' }} onClick={() => router.push(onboardingDestination(window.location.search))}>
        Skip for now
      </SecondaryButton>
    </form>
  );
}
