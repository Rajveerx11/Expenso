'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, X, UserPlus } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { FormField, Input, Textarea } from '@/components/ui/FormField';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { api, fieldErrorFor, fieldErrorsFor, focusFirstInvalidField, messageForError, type ApiFieldErrors } from '@/lib/api/client';
import { isValidEmail } from '@/lib/utils';
import { createGroupSetupTasks, createOrRetryGroupSetup, PENDING_MEMBER_EMAIL_ERROR, resolveGroupSetupEmails, type GroupSetupTask } from '@/features/groups/setup';

export default function CreateGroupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  const [setupTasks, setSetupTasks] = useState<GroupSetupTask[]>([]);

  function addEmail() {
    const trimmed = emailInput.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      setError('Enter a valid member email.');
      setFieldErrors((current) => ({ ...current, email: ['Enter a valid member email.'] }));
      focusFirstInvalidField(formRef.current);
      return;
    }
    setError('');
    setFieldErrors((current) => ({ ...current, email: [] }));
    if (!emails.includes(trimmed)) {
      setEmails([...emails, trimmed]);
      setEmailInput('');
    }
  }

  async function runSetup(existingGroupId: string | null, tasks: GroupSetupTask[]) {
    setError('');
    setFieldErrors({});
    setLoading(true);
    try {
      const result = await createOrRetryGroupSetup({
        existingGroupId,
        groupInput: { name, description: description.trim() || null },
        tasks,
        createGroup: api.groups.create,
        addMember: api.groups.addMember,
        uploadImage: api.groups.uploadImage,
        errorMessage: messageForError,
        onGroupReady: setCreatedGroupId,
        onTasksChange: setSetupTasks,
      });
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
      if (result.tasks.every((task) => task.status === 'succeeded')) setSuccess(true);
    } catch (requestError) {
      setError(messageForError(requestError));
      setFieldErrors(fieldErrorsFor(requestError));
      focusFirstInvalidField(formRef.current);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const resolvedEmails = resolveGroupSetupEmails(emails, emailInput, isValidEmail);
    if (resolvedEmails.error) {
      setError('');
      setFieldErrors((current) => ({ ...current, email: [resolvedEmails.error!] }));
      focusFirstInvalidField(formRef.current);
      return;
    }
    setEmails(resolvedEmails.emails);
    setEmailInput('');
    setFieldErrors((current) => ({ ...current, email: [] }));
    const tasks = createGroupSetupTasks(resolvedEmails.emails, image);
    setSetupTasks(tasks);
    await runSetup(null, tasks);
  }

  async function retrySetup() {
    if (!createdGroupId) return;
    await runSetup(createdGroupId, setupTasks);
  }

  const hasFailedSetup = setupTasks.some((task) => task.status === 'failed');
  const nameError = fieldErrorFor(fieldErrors, 'name');
  const descriptionError = fieldErrorFor(fieldErrors, 'description');
  const emailError = fieldErrorFor(fieldErrors, 'email');

  return (
    <>
      <AppHeader title="Create Group" showBack />
      <PageShell>
        {createdGroupId ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 20 }}>
            <div className="card" aria-live="polite" style={{ padding: 18 }}>
              <h2 style={{ fontSize: 18, marginBottom: 8 }}>Group created</h2>
              <p style={{ color: 'var(--color-medium)', fontSize: 14, marginBottom: 14 }}>Member invitations and group photo are separate setup steps. The group remains safe to open at any time.</p>
              {setupTasks.length === 0 && <p role="status" style={{ color: 'var(--color-green)', fontSize: 13, fontWeight: 600 }}>No optional setup steps were requested.</p>}
              <ul aria-label="Group setup status" style={{ listStyle: 'none', display: 'grid', gap: 10 }}>
                {setupTasks.map((task) => {
                  const label = task.kind === 'member' ? `Add ${task.email}` : 'Upload group photo';
                  const color = task.status === 'succeeded' ? 'var(--color-green)' : task.status === 'failed' ? 'var(--color-red)' : 'var(--color-amber)';
                  return (
                    <li key={task.id} style={{ padding: 12, borderRadius: 12, border: '1px solid var(--color-light)', background: 'var(--color-white)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                        <span style={{ color: 'var(--color-dark)', fontSize: 13, fontWeight: 600 }}>{label}</span>
                        <span style={{ color, fontSize: 12, fontWeight: 700 }}>{task.status === 'succeeded' ? 'Done' : task.status === 'failed' ? 'Needs retry' : 'Working…'}</span>
                      </div>
                      {task.status === 'failed' && <p role="alert" style={{ marginTop: 5, color: 'var(--color-red)', fontSize: 12 }}>{task.error}</p>}
                    </li>
                  );
                })}
              </ul>
            </div>
            {error && <p role="alert" style={{ color: 'var(--color-red)', fontSize: 13 }}>{error}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: hasFailedSetup ? '1fr 1fr' : '1fr', gap: 12 }}>
              <SecondaryButton fullWidth onClick={() => router.replace(`/groups/${createdGroupId}`)}>Open Group</SecondaryButton>
              {hasFailedSetup && <PrimaryButton fullWidth loading={loading} onClick={() => void retrySetup()}>Retry setup</PrimaryButton>}
            </div>
          </div>
        ) : <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '16px', paddingBottom: '32px' }}>
          {/* Group Image Placeholder */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button type="button" onClick={() => fileInput.current?.click()} style={{ width: 90, height: 90, borderRadius: '24px', background: 'var(--color-primary-lightest)', border: '2px dashed var(--color-primary-soft)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer' }}>
              <Camera size={24} color="var(--color-primary-medium)" />
              <span style={{ fontSize: '11px', color: 'var(--color-primary-deep)', fontWeight: 500 }}>{image ? 'Photo ready' : 'Add Photo'}</span>
            </button>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
          </div>

          <FormField label="Group Name" error={nameError} required>
            <Input
              type="text"
              placeholder="e.g. Goa Trip, Flatmates..."
              value={name}
              onChange={e => { setName(e.target.value); setFieldErrors((current) => ({ ...current, name: [] })); }}
              error={Boolean(nameError)}
              maxLength={80}
              required
            />
          </FormField>

          <FormField label="Description" error={descriptionError}>
            <Textarea
              placeholder="What's this group about?"
              value={description}
              onChange={e => { setDescription(e.target.value); setFieldErrors((current) => ({ ...current, description: [] })); }}
              error={Boolean(descriptionError)}
              maxLength={300}
            />
          </FormField>

          {/* Add Members */}
          <FormField label="Add Members" htmlFor="group-member-email" messageId="group-member-email" error={emailError} hint="Enter email addresses of registered Expenso users">
            <div style={{ display: 'flex', gap: '8px' }}>
              <Input
                id="group-member-email"
                type="email"
                placeholder="member@example.com"
                value={emailInput}
                onChange={e => { setEmailInput(e.target.value); setFieldErrors((current) => ({ ...current, email: [] })); }}
                onInvalid={(event) => {
                  event.preventDefault();
                  setError('');
                  setFieldErrors((current) => ({ ...current, email: [PENDING_MEMBER_EMAIL_ERROR] }));
                }}
                error={Boolean(emailError)}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? 'group-member-email-error' : 'group-member-email-hint'}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                inputMode="email"
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0 16px', flexShrink: 0, minHeight: '48px' }}
                onClick={addEmail}
                aria-label="Add member"
              >
                <UserPlus size={18} />
              </button>
            </div>

            {/* Email Tags */}
            {emails.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                {emails.map(email => (
                  <div key={email} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary-lightest)', borderRadius: '20px', padding: '6px 12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--color-primary-deep)', fontWeight: 500 }}>{email}</span>
                    <button type="button" aria-label={`Remove ${email}`} onClick={() => setEmails(emails.filter(e => e !== email))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-deep)', display: 'grid', placeItems: 'center', width: 44, height: 44, padding: 0, margin: '-8px -10px -8px 0', borderRadius: '50%' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </FormField>

          {error && <p role="alert" style={{ color: 'var(--color-red)', fontSize: 13 }}>{error}</p>}

          <PrimaryButton type="submit" fullWidth size="lg" loading={loading}>
            Create Group
          </PrimaryButton>
        </form>}
      </PageShell>
      <SuccessOverlay show={success} message="Group created!" onComplete={() => router.replace(createdGroupId ? `/groups/${createdGroupId}` : '/groups')} />
    </>
  );
}
