'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Camera, AlertTriangle } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { FormField, Input, Textarea } from '@/components/ui/FormField';
import { PrimaryButton, DangerButton } from '@/components/ui/Buttons';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { MOCK_GROUPS } from '@/lib/mockData';

export default function GroupSettingsPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const router = useRouter();
  const group = MOCK_GROUPS.find(g => g.id === groupId) ?? MOCK_GROUPS[0];

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // TODO: PATCH /api/v1/groups/{groupId}
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    setSuccess(true);
  }

  async function handleDelete() {
    setDeleteLoading(true);
    // TODO: DELETE /api/v1/groups/{groupId}
    await new Promise(r => setTimeout(r, 800));
    setDeleteLoading(false);
    router.push('/groups');
  }

  return (
    <>
      <AppHeader title="Group Settings" showBack />
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingTop: '16px', paddingBottom: '32px' }}>

          {/* Group Image */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: 90, height: 90, borderRadius: '24px', background: 'linear-gradient(135deg, var(--color-primary-lightest), var(--color-primary-container))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>
                {group.imageUrl
                  ? <img src={group.imageUrl} alt={group.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '24px' }} />
                  : '👥'}
              </div>
              <button
                type="button"
                style={{ position: 'absolute', bottom: -4, right: -4, width: 32, height: 32, borderRadius: '50%', background: 'var(--color-primary-deep)', border: '3px solid var(--color-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                aria-label="Change group photo"
              >
                <Camera size={14} color="white" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <FormField label="Group Name" required>
              <Input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={80}
                required
              />
            </FormField>

            <FormField label="Description">
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={300}
              />
            </FormField>

            <PrimaryButton type="submit" fullWidth loading={loading}>
              Save Changes
            </PrimaryButton>
          </form>

          {/* Danger Zone */}
          <div style={{ border: '1px solid rgba(244,63,94,0.2)', borderRadius: '16px', padding: '16px', background: 'rgba(244,63,94,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <AlertTriangle size={16} color="var(--color-red)" />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-red)' }}>Danger Zone</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--color-medium)', marginBottom: '14px', lineHeight: 1.5 }}>
              Deleting a group is permanent. Groups with financial history cannot be deleted.
            </p>
            <DangerButton fullWidth size="sm" onClick={() => setShowDeleteDialog(true)}>
              Delete Group
            </DangerButton>
          </div>

        </div>
      </PageShell>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Group?"
        message={`Permanently delete "${group.name}"? This cannot be undone. Groups with financial history cannot be deleted.`}
        confirmLabel="Delete Group"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
        loading={deleteLoading}
      />
      <SuccessOverlay show={success} message="Saved!" onComplete={() => {}} />
    </>
  );
}
