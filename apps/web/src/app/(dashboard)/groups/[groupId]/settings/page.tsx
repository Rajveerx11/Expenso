'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Camera } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { FormField, Input, Textarea } from '@/components/ui/FormField';
import { PrimaryButton, DangerButton } from '@/components/ui/Buttons';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { BackgroundRefreshError, PageError, PageLoading, queryErrorPresentation } from '@/components/ui/AsyncState';
import { api, fieldErrorFor, fieldErrorsFor, focusFirstInvalidField, messageForError, type ApiFieldErrors } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import type { GroupSummary } from '@/lib/types';

export default function GroupSettingsPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const groupQuery = useQuery({
    queryKey: queryKeys.group(groupId),
    queryFn: () => api.groups.get(groupId),
    enabled: Boolean(groupId),
  });
  const header = <AppHeader title="Group Settings" showBack backHref={`/groups/${groupId}`} />;
  const errorPresentation = queryErrorPresentation(groupQuery.error, groupQuery.data !== undefined);

  if (groupQuery.isPending) return <>{header}<PageLoading label="Loading group settings" /></>;
  if (errorPresentation === 'blocking') return <>{header}<PageError message={messageForError(groupQuery.error)} retry={() => groupQuery.refetch()} /></>;
  if (groupQuery.data!.currentUserRole !== 'admin') return <>{header}<PageError message="Only group admins can change group settings." /></>;

  return (
    <GroupSettingsForm
      group={groupQuery.data!}
      refreshWarning={errorPresentation === 'background'}
      retry={() => void groupQuery.refetch()}
      isRetrying={groupQuery.isFetching}
    />
  );
}

function GroupSettingsForm({
  group,
  refreshWarning,
  retry,
  isRetrying,
}: {
  group: GroupSummary;
  refreshWarning: boolean;
  retry: () => void;
  isRetrying: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [simplifiedDebts, setSimplifiedDebts] = useState(group.simplifiedDebts);
  const [imageUrl, setImageUrl] = useState(group.imageUrl);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const updateGroup = useMutation({
    mutationFn: () => api.groups.update(group.id, { name, description: description.trim() || null, simplifiedDebts }),
    retry: false,
  });
  const uploadImage = useMutation({ mutationFn: (file: File) => api.groups.uploadImage(group.id, file), retry: false });
  const deleteGroup = useMutation({ mutationFn: () => api.groups.remove(group.id), retry: false });

  async function refreshGroup(updated?: GroupSummary) {
    if (updated) queryClient.setQueryData(queryKeys.group(group.id), updated);
    await queryClient.invalidateQueries({ queryKey: ['groups'] });
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    try {
      const updated = await updateGroup.mutateAsync();
      await refreshGroup(updated);
      setSuccess(true);
    } catch (requestError) {
      setError(messageForError(requestError));
      setFieldErrors(fieldErrorsFor(requestError));
      focusFirstInvalidField(formRef.current);
    }
  }

  async function handleImage(file: File | undefined) {
    if (!file) return;
    setError('');
    setFieldErrors({});
    try {
      const updated = await uploadImage.mutateAsync(file);
      setImageUrl(updated.imageUrl);
      await refreshGroup(updated);
    } catch (requestError) {
      setError(messageForError(requestError));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function handleDelete() {
    setError('');
    setFieldErrors({});
    try {
      await deleteGroup.mutateAsync();
      queryClient.removeQueries({ queryKey: queryKeys.group(group.id) });
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
      router.replace('/groups');
    } catch (requestError) {
      setShowDeleteDialog(false);
      setError(messageForError(requestError));
    }
  }

  const nameError = fieldErrorFor(fieldErrors, 'name');
  const descriptionError = fieldErrorFor(fieldErrors, 'description');
  const simplifiedDebtsError = fieldErrorFor(fieldErrors, 'simplifiedDebts');

  return (
    <>
      <AppHeader title="Group Settings" showBack backHref={`/groups/${group.id}`} />
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 16, paddingBottom: 32 }}>
          {refreshWarning && <BackgroundRefreshError retry={retry} isRetrying={isRetrying} />}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: 90, height: 90, borderRadius: 24, background: 'linear-gradient(135deg, var(--color-primary-lightest), var(--color-primary-container))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, overflow: 'hidden' }}>
                {imageUrl ? <Image src={imageUrl} alt={name} width={90} height={90} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👥'}
              </div>
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploadImage.isPending} style={{ position: 'absolute', bottom: -6, right: -6, width: 44, height: 44, borderRadius: '50%', background: 'var(--color-primary-deep)', border: '3px solid var(--color-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} aria-label="Change group photo">
                <Camera size={14} color="white" />
              </button>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => handleImage(event.target.files?.[0])} />
            </div>
          </div>

          <form ref={formRef} onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FormField label="Group Name" error={nameError} required><Input value={name} onChange={(event) => { setName(event.target.value); setFieldErrors((current) => ({ ...current, name: [] })); }} error={Boolean(nameError)} maxLength={80} required /></FormField>
            <FormField label="Description" error={descriptionError}><Textarea value={description} onChange={(event) => { setDescription(event.target.value); setFieldErrors((current) => ({ ...current, description: [] })); }} error={Boolean(descriptionError)} maxLength={300} /></FormField>
            <FormField label="Debt calculation" error={simplifiedDebtsError}>
            <label className="card" aria-invalid={Boolean(simplifiedDebtsError)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={simplifiedDebts} onChange={(event) => { setSimplifiedDebts(event.target.checked); setFieldErrors((current) => ({ ...current, simplifiedDebts: [] })); }} />
              <span>
                <strong style={{ display: 'block', fontSize: 14 }}>Simplify group debts</strong>
                <span style={{ color: 'var(--color-medium)', fontSize: 12 }}>Reduce the number of repayments while keeping everyone’s net balance.</span>
              </span>
            </label>
            </FormField>
            {error && <p role="alert" style={{ color: 'var(--color-red)', fontSize: 13 }}>{error}</p>}
            <PrimaryButton type="submit" fullWidth loading={updateGroup.isPending || uploadImage.isPending}>Save Changes</PrimaryButton>
          </form>

          <div style={{ border: '1px solid rgba(244,63,94,0.2)', borderRadius: 16, padding: 16, background: 'rgba(244,63,94,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <AlertTriangle size={16} color="var(--color-red)" />
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-red)' }}>Danger Zone</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-medium)', marginBottom: 14, lineHeight: 1.5 }}>Deleting a group is permanent. Groups with financial history cannot be deleted.</p>
            <DangerButton fullWidth size="sm" onClick={() => setShowDeleteDialog(true)}>Delete Group</DangerButton>
          </div>
        </div>
      </PageShell>
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Group?"
        message={`Permanently delete "${group.name}"? This cannot be undone.`}
        confirmLabel="Delete Group"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
        loading={deleteGroup.isPending}
      />
      <SuccessOverlay show={success} message="Saved!" onComplete={() => setSuccess(false)} />
    </>
  );
}
