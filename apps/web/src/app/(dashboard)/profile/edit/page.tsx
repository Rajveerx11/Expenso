'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { FormField, Input } from '@/components/ui/FormField';
import { Avatar } from '@/components/ui/Avatar';
import { PrimaryButton } from '@/components/ui/Buttons';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { MOCK_PROFILE } from '@/lib/mockData';

export default function EditProfilePage() {
  const router = useRouter();
  const profile = MOCK_PROFILE;
  const [fullName, setFullName] = useState(profile.fullName);
  const [upiId, setUpiId] = useState(profile.upiId ?? '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // TODO: PATCH /api/v1/me
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    setSuccess(true);
  }

  return (
    <>
      <AppHeader title="Edit Profile" showBack />
      <PageShell>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingTop: '16px', paddingBottom: '32px' }}>
          {/* Avatar */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Avatar name={fullName} imageUrl={profile.avatarUrl} size="xl" />
              <button
                type="button"
                style={{ position: 'absolute', bottom: 0, right: 0, width: 34, height: 34, borderRadius: '50%', background: 'var(--color-primary-deep)', border: '3px solid var(--color-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                aria-label="Change avatar"
              >
                <Camera size={15} color="white" />
              </button>
            </div>
          </div>

          <FormField label="Full Name" required>
            <Input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              maxLength={100}
              required
              autoComplete="name"
            />
          </FormField>

          <FormField label="Email" hint="Email cannot be changed">
            <Input
              type="email"
              value={profile.email}
              readOnly
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            />
          </FormField>

          <FormField label="UPI ID" hint="e.g. name@bank — leave blank to clear">
            <Input
              type="text"
              value={upiId}
              onChange={e => setUpiId(e.target.value)}
              placeholder="name@bank"
              inputMode="email"
              autoComplete="off"
            />
          </FormField>

          <PrimaryButton type="submit" fullWidth size="lg" loading={loading}>Save Changes</PrimaryButton>
        </form>
      </PageShell>
      <SuccessOverlay show={success} message="Profile updated!" onComplete={() => router.back()} />
    </>
  );
}
