import { CheckCircle, ExternalLink } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';
import type { UpiHandoffState } from './domain';

export function UpiHandoffPrompt({
  state,
  onShowPrompt,
  onComplete,
  onCancel,
}: {
  state: UpiHandoffState;
  onShowPrompt: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  if (state === 'idle') {
    return (
      <SecondaryButton type="button" fullWidth onClick={onShowPrompt}>
        I paid using the QR
      </SecondaryButton>
    );
  }

  if (state === 'launching' || state === 'away') {
    return (
      <div role="status" className="card" style={{ padding: 14, display: 'grid', gap: 10, background: 'var(--color-primary-lightest)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <ExternalLink size={18} aria-hidden="true" style={{ color: 'var(--color-primary-deep)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong style={{ display: 'block', fontSize: 14, color: 'var(--color-dark)' }}>Complete payment in your UPI app</strong>
            <span style={{ display: 'block', marginTop: 3, fontSize: 12, lineHeight: 1.45, color: 'var(--color-medium)' }}>Return here afterward. If no app opened, you can continue safely without creating a claim.</span>
          </div>
        </div>
        <SecondaryButton type="button" size="sm" onClick={onShowPrompt}>I&apos;m back</SecondaryButton>
      </div>
    );
  }

  if (state === 'returned') {
    return (
      <section className="card" aria-labelledby="upi-return-question" style={{ padding: 16, display: 'grid', gap: 12, borderColor: 'var(--color-primary-medium)' }}>
        <div>
          <h3 id="upi-return-question" style={{ fontSize: 16, fontWeight: 750, color: 'var(--color-black)' }}>Did you complete this payment?</h3>
          <p style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5, color: 'var(--color-medium)' }}>Expenso cannot verify your UPI app result. Choose Yes only after the app shows success. If no app opened or you cancelled, choose Not yet.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <SecondaryButton type="button" onClick={onCancel}>Not yet</SecondaryButton>
          <PrimaryButton type="button" onClick={onComplete}>Yes, payment completed</PrimaryButton>
        </div>
      </section>
    );
  }

  return (
    <div role="status" className="card" style={{ padding: 14, display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--color-green-soft)', borderColor: 'var(--color-green)' }}>
      <CheckCircle size={19} aria-hidden="true" style={{ color: 'var(--color-green)', flexShrink: 0 }} />
      <div>
        <strong style={{ display: 'block', fontSize: 14, color: 'var(--color-dark)' }}>Payment marked as completed</strong>
        <span style={{ display: 'block', marginTop: 3, fontSize: 12, lineHeight: 1.45, color: 'var(--color-medium)' }}>Review the claim before submitting it to the receiver. Their confirmation is still required.</span>
      </div>
    </div>
  );
}
