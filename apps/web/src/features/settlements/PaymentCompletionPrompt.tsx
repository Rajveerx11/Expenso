import { ShieldCheck } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';

export function PaymentCompletionPrompt({
  onComplete,
  onCancel,
  submitting = false,
}: {
  onComplete: () => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  return (
    <section className="card" aria-labelledby="payment-result-question" style={{ padding: 16, display: 'grid', gap: 12, borderColor: 'var(--color-primary-medium)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <ShieldCheck size={19} aria-hidden="true" style={{ color: 'var(--color-primary-deep)', flexShrink: 0, marginTop: 1 }} />
        <div>
          <h3 id="payment-result-question" style={{ fontSize: 16, fontWeight: 750, color: 'var(--color-black)' }}>What happened in your UPI app?</h3>
          <p style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5, color: 'var(--color-medium)' }}>Confirm only after the UPI app shows success. Expenso will create a pending claim for the receiver to confirm.</p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SecondaryButton type="button" onClick={onCancel} disabled={submitting}>Failed or cancelled</SecondaryButton>
        <PrimaryButton type="button" onClick={onComplete} loading={submitting}>Yes, I paid</PrimaryButton>
      </div>
    </section>
  );
}
