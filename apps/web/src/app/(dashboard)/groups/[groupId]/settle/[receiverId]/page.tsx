'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { QrCode, Copy, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { FormField, Input } from '@/components/ui/FormField';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { MOCK_BALANCES, MOCK_MEMBERS, MOCK_GROUPS } from '@/lib/mockData';
import { formatMoney, buildUPIUri } from '@/lib/utils';

export default function SettleUpPage() {
  const { groupId, receiverId } = useParams<{ groupId: string; receiverId: string }>();
  const router = useRouter();

  const group = MOCK_GROUPS.find(g => g.id === groupId) ?? MOCK_GROUPS[0];
  const allMembers = MOCK_MEMBERS[groupId] ?? MOCK_MEMBERS['grp-001'];
  const balances = MOCK_BALANCES[groupId] ?? [];
  const receiverBalance = balances.find(b => b.userId === receiverId);
  const receiverMember = allMembers.find(m => m.userId === receiverId);
  const receiverName = receiverBalance?.userName ?? receiverMember?.fullName ?? 'Member';
  const receiverUpiId = receiverBalance?.userUpiId ?? null;
  const maxAmount = receiverBalance ? Math.abs(parseFloat(receiverBalance.balance)).toFixed(2) : '0.00';

  const [amount, setAmount] = useState(maxAmount);
  const [reference, setReference] = useState('');
  const [step, setStep] = useState<'input' | 'upi' | 'confirm'>('input');
  const [didPay, setDidPay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isMobile] = useState(() => /Android|iPhone|iPad|iPod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : ''));

  const correlationRef = `EXPENSO-${Date.now()}`;
  const upiUri = receiverUpiId ? buildUPIUri({ receiverUpiId, receiverName, amount, groupName: group.name, correlationRef }) : '';

  // Detect when user returns from UPI app
  useEffect(() => {
    if (step !== 'upi') return;
    const handleVisibility = () => {
      if (!document.hidden) setDidPay(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [step]);

  async function handleCreateSettlement() {
    setLoading(true);
    // TODO: POST /api/v1/groups/{groupId}/settlements
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    setSuccess(true);
  }

  return (
    <>
      <AppHeader title="Settle Up" showBack />
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '16px', paddingBottom: '32px' }}>

          {/* Receiver Card */}
          <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Avatar name={receiverName} size="lg" />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '13px', color: 'var(--color-medium)', marginBottom: '2px' }}>Settling with</p>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-black)' }}>{receiverName}</h2>
              {receiverUpiId && <p style={{ fontSize: '13px', color: 'var(--color-primary-deep)', marginTop: '2px' }}>{receiverUpiId}</p>}
            </div>
          </div>

          {step === 'input' && (
            <>
              {/* Outstanding */}
              <div className="card" style={{ padding: '16px', background: 'var(--color-red-soft)', borderColor: 'rgba(244,63,94,0.15)' }}>
                <p style={{ fontSize: '13px', color: 'var(--color-medium)', marginBottom: '4px' }}>Outstanding balance</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-red)' }}>{formatMoney(maxAmount)}</p>
              </div>

              <FormField label="Amount to Pay" required hint={`Maximum: ${formatMoney(maxAmount)}`}>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '20px', fontWeight: 700, color: 'var(--color-primary-deep)' }}>₹</span>
                  <input
                    type="number" min="0.01" step="0.01" max={maxAmount}
                    value={amount} onChange={e => setAmount(e.target.value)}
                    className="input" inputMode="decimal"
                    style={{ paddingLeft: '36px', fontSize: '22px', fontWeight: 700 }}
                    required
                  />
                </div>
              </FormField>

              <FormField label="Transaction Reference" hint="Optional — UPI reference or note">
                <Input type="text" placeholder="UPI ref / Cheque no..." value={reference} onChange={e => setReference(e.target.value)} />
              </FormField>

              {receiverUpiId
                ? <PrimaryButton fullWidth size="lg" onClick={() => setStep('upi')}>
                    <ExternalLink size={18} /> Pay via UPI
                  </PrimaryButton>
                : <PrimaryButton fullWidth size="lg" onClick={() => setStep('confirm')}>
                    Record Payment
                  </PrimaryButton>
              }
            </>
          )}

          {step === 'upi' && (
            <>
              <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
                {isMobile ? (
                  <>
                    <p style={{ fontSize: '15px', color: 'var(--color-dark)', marginBottom: '16px', lineHeight: 1.5 }}>
                      Tap the button below to open your UPI app and pay <strong>{formatMoney(amount)}</strong> to {receiverName}.
                    </p>
                    <a href={upiUri} className="btn btn-primary btn-lg" style={{ display: 'inline-flex', width: '100%', textDecoration: 'none', justifyContent: 'center' }}>
                      <ExternalLink size={18} /> Open UPI App
                    </a>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: '14px', color: 'var(--color-medium)', marginBottom: '16px' }}>Scan QR code with any UPI app</p>
                    <div style={{ background: 'var(--color-light)', borderRadius: '16px', padding: '20px', display: 'inline-block', marginBottom: '16px' }}>
                      <QrCode size={120} color="var(--color-black)" />
                      <p style={{ fontSize: '11px', color: 'var(--color-medium)', marginTop: '8px' }}>QR for {formatMoney(amount)}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => navigator.clipboard.writeText(receiverUpiId ?? '')}>
                        <Copy size={14} /> Copy UPI ID
                      </button>
                      <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => navigator.clipboard.writeText(amount)}>
                        <Copy size={14} /> Copy Amount
                      </button>
                    </div>
                  </>
                )}
              </div>

              {didPay && (
                <div style={{ background: 'var(--color-amber-soft)', borderRadius: '14px', padding: '16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <AlertCircle size={18} color="var(--color-amber)" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#B45309', marginBottom: '4px' }}>Did you complete this payment?</p>
                    <p style={{ fontSize: '13px', color: '#92400E', lineHeight: 1.4 }}>Only confirm if the payment went through. The receiver will need to confirm it too.</p>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                <SecondaryButton fullWidth onClick={() => { setStep('input'); setDidPay(false); }}>Back</SecondaryButton>
                <PrimaryButton fullWidth onClick={() => setStep('confirm')} disabled={!didPay}>
                  <CheckCircle size={16} /> Yes, I Paid
                </PrimaryButton>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="card" style={{ padding: '20px', background: 'var(--color-green-soft)', borderColor: 'rgba(16,185,129,0.2)' }}>
                <p style={{ fontSize: '14px', color: 'var(--color-medium)', marginBottom: '4px' }}>Claiming payment of</p>
                <p style={{ fontSize: '32px', fontWeight: 800, color: 'var(--color-green)', marginBottom: '8px' }}>{formatMoney(amount)}</p>
                <p style={{ fontSize: '14px', color: 'var(--color-dark)', lineHeight: 1.5 }}>
                  {receiverName} will receive a notification to confirm or reject this payment.
                </p>
              </div>

              {reference && (
                <div className="card" style={{ padding: '14px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--color-medium)', marginBottom: '4px' }}>Reference</p>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-dark)' }}>{reference}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                <SecondaryButton fullWidth onClick={() => setStep(receiverUpiId ? 'upi' : 'input')}>Back</SecondaryButton>
                <PrimaryButton fullWidth loading={loading} onClick={handleCreateSettlement}>
                  Submit Claim
                </PrimaryButton>
              </div>
            </>
          )}
        </div>
      </PageShell>
      <SuccessOverlay show={success} message="Payment claimed!" onComplete={() => router.push(`/groups/${groupId}`)} />
    </>
  );
}
