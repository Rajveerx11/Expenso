'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { FormField, Input } from '@/components/ui/FormField';
import { Avatar } from '@/components/ui/Avatar';
import { PrimaryButton } from '@/components/ui/Buttons';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { BackgroundRefreshError, PageError, PageLoading, queryErrorPresentation } from '@/components/ui/AsyncState';
import {
  api,
  fieldErrorFor,
  fieldErrorsFor,
  focusFirstInvalidField,
  messageForError,
  type ApiFieldErrors,
} from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { refreshProfileDependentQueries } from '@/features/profile/cache';
import type { Profile } from '@/lib/types';

export default function EditProfilePage() {
  const profileQuery = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile.get });
  const errorPresentation = queryErrorPresentation(profileQuery.error, profileQuery.data !== undefined);

  if (profileQuery.isPending) return <><AppHeader title="Edit Profile" showBack /><PageLoading label="Loading profile" /></>;
  if (errorPresentation === 'blocking') return <><AppHeader title="Edit Profile" showBack /><PageError message={messageForError(profileQuery.error)} retry={() => profileQuery.refetch()} /></>;

  return (
    <EditProfileForm
      key={profileQuery.data!.id}
      initialProfile={profileQuery.data!}
      refreshWarning={errorPresentation === 'background'}
      retry={() => void profileQuery.refetch()}
      isRetrying={profileQuery.isFetching}
    />
  );
}

function EditProfileForm({
  initialProfile,
  refreshWarning,
  retry,
  isRetrying,
}: {
  initialProfile: Profile;
  refreshWarning: boolean;
  retry: () => void;
  isRetrying: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(initialProfile.fullName);
  const [upiId, setUpiId] = useState(initialProfile.upiId ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatarUrl);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const saveProfile = useMutation({ mutationFn: api.profile.update });
  const uploadAvatar = useMutation({ mutationFn: api.profile.uploadAvatar });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    try {
      const profile = await saveProfile.mutateAsync({ fullName, upiId: upiId.trim() || null });
      queryClient.setQueryData(queryKeys.profile, profile);
      await refreshProfileDependentQueries(queryClient);
      setSuccess(true);
    } catch (requestError) {
      setError(messageForError(requestError));
      setFieldErrors(fieldErrorsFor(requestError));
      focusFirstInvalidField(formRef.current);
    }
  }

  async function handleAvatar(file: File | undefined) {
    if (!file) return;
    setError('');
    setFieldErrors({});
    try {
      const profile = await uploadAvatar.mutateAsync(file);
      setAvatarUrl(profile.avatarUrl);
      queryClient.setQueryData(queryKeys.profile, profile);
      await refreshProfileDependentQueries(queryClient);
    } catch (requestError) {
      setError(messageForError(requestError));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function clearFieldError(key: string) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  const fullNameError = fieldErrorFor(fieldErrors, 'fullName');
  const upiIdError = fieldErrorFor(fieldErrors, 'upiId');

  return (
    <>
      <AppHeader title="Edit Profile" showBack />
      <PageShell>
        <form ref={formRef} onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingTop: '16px', paddingBottom: '32px' }}>
          {refreshWarning && <BackgroundRefreshError retry={retry} isRetrying={isRetrying} />}
          {/* Avatar */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Avatar name={fullName} imageUrl={avatarUrl} size="xl" />
              <button
                type="button"
                style={{ position: 'absolute', bottom: -5, right: -5, width: 44, height: 44, borderRadius: '50%', background: 'var(--color-primary-deep)', border: '3px solid var(--color-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                aria-label="Change avatar"
                onClick={() => fileInput.current?.click()}
                disabled={uploadAvatar.isPending}
              >
                <Camera size={15} color="white" />
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(event) => handleAvatar(event.target.files?.[0])}
              />
            </div>
          </div>

          <FormField label="Full Name" error={fullNameError} required>
            <Input
              type="text"
              value={fullName}
              onChange={e => { setFullName(e.target.value); clearFieldError('fullName'); }}
              error={Boolean(fullNameError)}
              maxLength={100}
              required
              autoComplete="name"
            />
          </FormField>

          <FormField label="Email" hint="Email cannot be changed">
            <Input
              type="email"
              value={initialProfile.email}
              readOnly
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            />
          </FormField>

          <FormField label="UPI ID" error={upiIdError} hint="e.g. name@bank — leave blank to clear">
            <Input
              type="text"
              value={upiId}
              onChange={e => { setUpiId(e.target.value); clearFieldError('upiId'); }}
              error={Boolean(upiIdError)}
              placeholder="name@bank"
              inputMode="email"
              autoComplete="off"
            />
          </FormField>

          {error && <p role="alert" style={{ color: 'var(--color-red)', fontSize: 13 }}>{error}</p>}
          <PrimaryButton type="submit" fullWidth size="lg" loading={saveProfile.isPending || uploadAvatar.isPending}>Save Changes</PrimaryButton>
        </form>
      </PageShell>
      <SuccessOverlay
        show={success}
        message="Profile updated!"
        onComplete={() => {
          router.replace('/profile');
          router.refresh();
        }}
      />
    </>
  );
}
