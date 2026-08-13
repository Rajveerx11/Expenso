'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Plus, X, UserPlus } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { FormField, Input, Textarea } from '@/components/ui/FormField';
import { PrimaryButton } from '@/components/ui/Buttons';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';

export default function CreateGroupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function addEmail() {
    const trimmed = emailInput.trim().toLowerCase();
    if (trimmed && !emails.includes(trimmed)) {
      setEmails([...emails, trimmed]);
      setEmailInput('');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // TODO: POST /api/v1/groups
    await new Promise(r => setTimeout(r, 900));
    setLoading(false);
    setSuccess(true);
  }

  return (
    <>
      <AppHeader title="Create Group" showBack />
      <PageShell>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '16px', paddingBottom: '32px' }}>
          {/* Group Image Placeholder */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button type="button" style={{ width: 90, height: 90, borderRadius: '24px', background: 'var(--color-primary-lightest)', border: '2px dashed var(--color-primary-soft)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer' }}>
              <Camera size={24} color="var(--color-primary-medium)" />
              <span style={{ fontSize: '11px', color: 'var(--color-primary-medium)', fontWeight: 500 }}>Add Photo</span>
            </button>
          </div>

          <FormField label="Group Name" required>
            <Input
              type="text"
              placeholder="e.g. Goa Trip, Flatmates..."
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={80}
              required
            />
          </FormField>

          <FormField label="Description">
            <Textarea
              placeholder="What's this group about?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={300}
            />
          </FormField>

          {/* Add Members */}
          <FormField label="Add Members" hint="Enter email addresses of registered Expenso users">
            <div style={{ display: 'flex', gap: '8px' }}>
              <Input
                type="email"
                placeholder="member@example.com"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                inputMode="email"
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0 16px', flexShrink: 0, minHeight: '48px' }}
                onClick={addEmail}
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
                    <button type="button" onClick={() => setEmails(emails.filter(e => e !== email))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-medium)', display: 'flex', padding: 0 }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </FormField>

          <PrimaryButton type="submit" fullWidth size="lg" loading={loading}>
            Create Group
          </PrimaryButton>
        </form>
      </PageShell>
      <SuccessOverlay show={success} message="Group created!" onComplete={() => router.push('/groups')} />
    </>
  );
}
