'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Copy, ExternalLink, ShieldCheck } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';
import { FormField, Input } from '@/components/ui/FormField';
import { BackgroundRefreshError, PageError, PageLoading, queryErrorPresentation } from '@/components/ui/AsyncState';
import type { GroupBalance, GroupMember, GroupSummary } from '@/lib/types';
import { ApiClientError, api, createIdempotencyKey, fieldErrorFor, fieldErrorsFor, focusFirstInvalidField, messageForError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { buildUPIUri, formatMoney } from '@/lib/utils';
import {
  claimInput,
  conflictCopy,
  createSubmissionKeyManager,
  nextUpiHandoffState,
  outstandingAmount,
  payableBalanceFor,
  type UpiHandoffState,
  validateSettlementClaim,
} from '@/features/settlements/domain';
import { useSettleUpData } from '@/features/settlements/hooks';
import { UpiHandoffPrompt } from '@/features/settlements/UpiHandoffPrompt';
import { UpiQrCode } from '@/features/settlements/UpiQrCode';

type ClaimStep = 'input' | 'payment' | 'review';

function PaymentAcknowledgement(options: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14, border: `1px solid ${options.error ? 'var(--color-red)' : 'var(--color-light)'}`, background: 'var(--color-white)', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={options.checked}
          onChange={(event) => options.onChange(event.target.checked)}
          aria-invalid={Boolean(options.error)}
          aria-describedby={options.error ? 'payment-acknowledgement-error' : undefined}
          style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--color-primary-deep)', flexShrink: 0 }}
        />
        <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-dark)' }}>
          I have sent this payment. I understand this creates a claim that the receiver must confirm.
        </span>
      </label>
      {options.error && <span id="payment-acknowledgement-error" role="alert" style={{ fontSize: 12, color: 'var(--color-red)' }}>{options.error}</span>}
    </div>
  );
}

function SettleUpFlow(options: {
  group: GroupSummary;
  receiver: GroupMember;
  balance: GroupBalance;
  refetchLatest: () => Promise<unknown>;
}) {
  const { group, receiver, balance } = options;
  const queryClient = useQueryClient();
  const maximumAmount = outstandingAmount(balance);
  const receiverUpiId = balance.userUpiId;
  const [amount, setAmount] = useState(maximumAmount);
  const [reference, setReference] = useState('');
  const [step, setStep] = useState<ClaimStep>('input');
  const [acknowledged, setAcknowledged] = useState(false);
  const [correlationRef, setCorrelationRef] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof validateSettlementClaim>>({});
  const [requestError, setRequestError] = useState('');
  const [copied, setCopied] = useState('');
  const [upiHandoffState, setUpiHandoffState] = useState<UpiHandoffState>('idle');
  const [createdSettlementId, setCreatedSettlementId] = useState<string | null>(null);
  const keyManager = useRef(createSubmissionKeyManager(() => createIdempotencyKey('settlement')));
  const upiReturnTimer = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const createSettlement = useMutation({
    mutationFn: (variables: { input: ReturnType<typeof claimInput>; idempotencyKey: string }) => (
      api.groups.createSettlement(group.id, variables.input, variables.idempotencyKey)
    ),
  });

  const paymentUri = receiverUpiId && correlationRef ? buildUPIUri({
    receiverUpiId,
    receiverName: receiver.fullName,
    amount: amount.trim(),
    groupName: group.name,
    correlationRef,
  }) : '';

  useEffect(() => {
    if (step !== 'payment') return;
    const clearReturnTimer = () => {
      if (upiReturnTimer.current !== null) window.clearTimeout(upiReturnTimer.current);
      upiReturnTimer.current = null;
    };
    const markAway = () => setUpiHandoffState((current) => nextUpiHandoffState(current, 'leave'));
    const markReturned = () => {
      if (document.visibilityState !== 'visible') return;
      clearReturnTimer();
      setUpiHandoffState((current) => nextUpiHandoffState(current, 'return'));
    };
    const visibilityChanged = () => {
      if (document.visibilityState === 'hidden') markAway();
      else markReturned();
    };
    window.addEventListener('blur', markAway);
    window.addEventListener('focus', markReturned);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      clearReturnTimer();
      window.removeEventListener('blur', markAway);
      window.removeEventListener('focus', markReturned);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [step]);

  function validate(requireAcknowledgement = false) {
    const nextErrors = validateSettlementClaim({
      amount,
      maximumAmount,
      transactionRef: reference,
      acknowledged,
      requireAcknowledgement,
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function continueFromInput() {
    setRequestError('');
    if (!validate(false)) return;
    if (receiverUpiId) {
      setCorrelationRef(`EXPENSO-${crypto.randomUUID()}`);
      setUpiHandoffState('idle');
      setAcknowledged(false);
      setStep('payment');
    } else {
      setStep('review');
    }
  }

  function beginUpiHandoff() {
    setAcknowledged(false);
    setErrors((current) => ({ ...current, acknowledgement: undefined }));
    setUpiHandoffState((current) => nextUpiHandoffState(current, 'launch'));
    if (upiReturnTimer.current !== null) window.clearTimeout(upiReturnTimer.current);
    upiReturnTimer.current = window.setTimeout(() => {
      upiReturnTimer.current = null;
      setUpiHandoffState((current) => (
        current === 'launching' ? nextUpiHandoffState(current, 'return') : current
      ));
    }, 1_500);
  }

  function showUpiReturnPrompt() {
    if (upiReturnTimer.current !== null) window.clearTimeout(upiReturnTimer.current);
    upiReturnTimer.current = null;
    setUpiHandoffState((current) => nextUpiHandoffState(current, 'show-prompt'));
  }

  function confirmUpiCompletion() {
    setAcknowledged(true);
    setErrors((current) => ({ ...current, acknowledgement: undefined }));
    setUpiHandoffState((current) => nextUpiHandoffState(current, 'complete'));
  }

  function cancelUpiCompletion() {
    setAcknowledged(false);
    setUpiHandoffState((current) => nextUpiHandoffState(current, 'cancel'));
  }

  function backToInput() {
    if (upiReturnTimer.current !== null) window.clearTimeout(upiReturnTimer.current);
    upiReturnTimer.current = null;
    setUpiHandoffState('idle');
    setAcknowledged(false);
    setStep('input');
  }

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(`${label} copied.`);
    } catch {
      setCopied(`Could not copy ${label.toLowerCase()}. Select and copy it manually.`);
    }
  }

  async function submitClaim() {
    setRequestError('');
    if (!validate(true)) return;
    const input = claimInput({
      receiverId: receiver.userId,
      amount,
      transactionRef: reference,
      correlationRef,
    });
    try {
      const result = await createSettlement.mutateAsync({
        input,
        idempotencyKey: keyManager.current.forClaim(input),
      });
      setCreatedSettlementId(result.settlement.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settlements(group.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.balances(group.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.group(group.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
      ]);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        await options.refetchLatest();
        setStep('input');
        setUpiHandoffState('idle');
        setAcknowledged(false);
        setAmount('');
        setRequestError(conflictCopy(error.code));
      } else {
        setRequestError(messageForError(error));
        const serverErrors = fieldErrorsFor(error);
        const amountError = fieldErrorFor(serverErrors, 'amount');
        const transactionRefError = fieldErrorFor(serverErrors, 'transactionRef');
        if (amountError || transactionRefError) {
          setErrors((current) => ({
            ...current,
            amount: amountError,
            transactionRef: transactionRefError,
          }));
          setStep('input');
          setAcknowledged(false);
          focusFirstInvalidField(formRef.current);
        }
      }
    }
  }

  if (createdSettlementId) {
    return (
      <div style={{ display: 'grid', gap: 16, paddingTop: 24 }} aria-live="polite">
        <div className="card" style={{ padding: 24, textAlign: 'center', background: 'var(--color-green-soft)', borderColor: 'rgba(16,185,129,0.2)' }}>
          <CheckCircle size={40} color="var(--color-green)" style={{ margin: '0 auto 12px' }} aria-hidden="true" />
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-black)' }}>Payment claim submitted</h2>
          <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, color: 'var(--color-dark)' }}>{receiver.fullName} must confirm receipt before balances change.</p>
        </div>
        <Link href={`/groups/${group.id}/settlements/${createdSettlementId}`} className="btn btn-primary btn-lg" style={{ textDecoration: 'none', justifyContent: 'center' }}>View Claim</Link>
        <Link href={`/groups/${group.id}`} className="btn btn-secondary" style={{ textDecoration: 'none', justifyContent: 'center' }}>Back to Group</Link>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={(event) => event.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 16, paddingBottom: 32 }}>
      <div className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <Avatar name={receiver.fullName} imageUrl={receiver.avatarUrl} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, color: 'var(--color-medium)', marginBottom: 2 }}>Settling with</p>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-black)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{receiver.fullName}</h2>
          {receiverUpiId && <p style={{ fontSize: 13, color: 'var(--color-primary-deep)', marginTop: 2, wordBreak: 'break-all' }}>{receiverUpiId}</p>}
        </div>
      </div>

      {requestError && <div role="alert" style={{ padding: 14, borderRadius: 12, background: 'var(--color-red-soft)', color: 'var(--color-red)', fontSize: 13, lineHeight: 1.5 }}>{requestError}</div>}

      {step === 'input' && (
        <>
          <div className="card" style={{ padding: 16, background: 'var(--color-red-soft)', borderColor: 'rgba(244,63,94,0.15)' }}>
            <p style={{ fontSize: 13, color: 'var(--color-medium)', marginBottom: 4 }}>Outstanding balance</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-red)' }}>{formatMoney(maximumAmount)}</p>
          </div>
          <FormField label="Amount to Pay" htmlFor="settlement-amount" messageId="settlement-amount" required hint={`Maximum: ${formatMoney(maximumAmount)}`} error={errors.amount}>
            <div style={{ position: 'relative' }}>
              <span aria-hidden="true" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 20, fontWeight: 700, color: 'var(--color-primary-deep)' }}>₹</span>
              <input
                id="settlement-amount"
                type="text"
                inputMode="decimal"
                pattern="\d{1,10}(?:\.\d{1,2})?"
                value={amount}
                onChange={(event) => { setAmount(event.target.value); setErrors((current) => ({ ...current, amount: undefined })); }}
                className={`input ${errors.amount ? 'input-error' : ''}`}
                aria-label="Amount to pay"
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={errors.amount ? 'settlement-amount-error' : 'settlement-amount-hint'}
                style={{ paddingLeft: 36, fontSize: 22, fontWeight: 700 }}
                required
              />
            </div>
          </FormField>
          <FormField label="Transaction Reference" hint="Optional — UPI reference or note" error={errors.transactionRef}>
            <Input
              id="settlement-reference"
              type="text"
              placeholder="UPI ref / cheque number"
              value={reference}
              onChange={(event) => { setReference(event.target.value); setErrors((current) => ({ ...current, transactionRef: undefined })); }}
              maxLength={200}
              error={Boolean(errors.transactionRef)}
              aria-label="Transaction reference"
              aria-invalid={Boolean(errors.transactionRef)}
            />
          </FormField>
          <PrimaryButton type="button" fullWidth size="lg" onClick={continueFromInput}>
            {receiverUpiId ? <><ExternalLink size={18} aria-hidden="true" /> Payment Options</> : 'Review Payment Claim'}
          </PrimaryButton>
        </>
      )}

      {step === 'payment' && paymentUri && (
        <>
          <div className="card" style={{ padding: 20, textAlign: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-black)' }}>Pay {formatMoney(amount)}</h2>
            <p style={{ fontSize: 13, color: 'var(--color-medium)', margin: '6px 0 16px' }}>Scan with any UPI app or open the payment link on this device.</p>
            <div style={{ display: 'inline-grid', placeItems: 'center', background: 'white', border: '1px solid var(--color-light)', borderRadius: 16, padding: 12 }}>
              <UpiQrCode value={paymentUri} label={`UPI QR code to pay ${formatMoney(amount)} to ${receiver.fullName}`} />
            </div>
            <a href={paymentUri} onClick={beginUpiHandoff} className="btn btn-primary" style={{ display: 'flex', width: '100%', textDecoration: 'none', justifyContent: 'center', marginTop: 16 }}>
              <ExternalLink size={18} aria-hidden="true" /> Open UPI App
            </a>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => copyValue(receiverUpiId ?? '', 'UPI ID')}><Copy size={14} aria-hidden="true" /> Copy UPI ID</button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => copyValue(amount, 'Amount')}><Copy size={14} aria-hidden="true" /> Copy Amount</button>
            </div>
            {copied && <p role="status" aria-live="polite" style={{ fontSize: 12, color: 'var(--color-medium)', marginTop: 8 }}>{copied}</p>}
          </div>
          <UpiHandoffPrompt
            state={upiHandoffState}
            onShowPrompt={showUpiReturnPrompt}
            onComplete={confirmUpiCompletion}
            onCancel={cancelUpiCompletion}
          />
          <div style={{ display: 'flex', gap: 12 }}>
            <SecondaryButton type="button" fullWidth onClick={backToInput}>Back</SecondaryButton>
            {upiHandoffState === 'completed' && (
              <PrimaryButton type="button" fullWidth onClick={() => setStep('review')}>Review Claim</PrimaryButton>
            )}
          </div>
        </>
      )}

      {step === 'review' && (
        <>
          <div className="card" style={{ padding: 20, background: 'var(--color-green-soft)', borderColor: 'rgba(16,185,129,0.2)' }}>
            <ShieldCheck size={24} color="var(--color-green)" aria-hidden="true" />
            <p style={{ fontSize: 13, color: 'var(--color-medium)', marginTop: 10 }}>Claiming payment of</p>
            <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--color-green)', margin: '4px 0 8px' }}>{formatMoney(amount)}</p>
            <p style={{ fontSize: 14, color: 'var(--color-dark)', lineHeight: 1.5 }}>{receiver.fullName} will receive a request to confirm or reject this payment.</p>
            {(reference.trim() || correlationRef) && <p style={{ fontSize: 12, color: 'var(--color-medium)', marginTop: 12, wordBreak: 'break-all' }}>Reference: {reference.trim() || correlationRef}</p>}
          </div>
          {!receiverUpiId && <PaymentAcknowledgement checked={acknowledged} onChange={(checked) => { setAcknowledged(checked); setErrors((current) => ({ ...current, acknowledgement: undefined })); }} error={errors.acknowledgement} />}
          <div style={{ display: 'flex', gap: 12 }}>
            <SecondaryButton type="button" fullWidth onClick={() => setStep(receiverUpiId ? 'payment' : 'input')}>Back</SecondaryButton>
            <PrimaryButton type="button" fullWidth loading={createSettlement.isPending} disabled={!acknowledged} onClick={submitClaim}>Submit Claim</PrimaryButton>
          </div>
        </>
      )}
    </form>
  );
}

export default function SettleUpPage() {
  const { groupId, receiverId } = useParams<{ groupId: string; receiverId: string }>();
  const data = useSettleUpData(groupId, receiverId);

  if (data.isPending) return <><AppHeader title="Settle Up" showBack /><PageLoading label="Loading settlement details" /></>;
  const group = data.group.data;
  const profile = data.profile.data;
  const members = data.members.data;
  const balances = data.balances.data;
  const pending = data.pendingSettlement.data;
  const hasUsableData = Boolean(group && profile && members && balances && pending !== undefined);
  const errorPresentation = queryErrorPresentation(data.error, hasUsableData);
  if (errorPresentation === 'blocking') return <><AppHeader title="Settle Up" showBack /><PageError message={messageForError(data.error)} retry={() => data.refetch()} /></>;
  if (!group || !profile || !members || !balances || pending === undefined) {
    return <><AppHeader title="Settle Up" showBack /><PageError message="Settlement data is incomplete. Reload and try again." retry={() => data.refetch()} /></>;
  }
  const receiver = members.find((member) => member.userId === receiverId);
  const balance = payableBalanceFor(balances, receiverId);

  if (pending) {
    return (
      <>
        <AppHeader title="Settle Up" showBack />
        <PageShell>
          {errorPresentation === 'background' && <BackgroundRefreshError retry={() => void data.refetch()} isRetrying={data.isFetching} />}
          <div className="card" role="status" style={{ marginTop: 24, padding: 24, textAlign: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-black)' }}>Claim already pending</h2>
            <p style={{ margin: '8px 0 16px', color: 'var(--color-medium)', fontSize: 14, lineHeight: 1.5 }}>Wait for the receiver to confirm or reject your existing payment claim.</p>
            <Link href={`/groups/${groupId}/settlements/${pending.id}`} className="btn btn-primary" style={{ textDecoration: 'none', justifyContent: 'center' }}>View Pending Claim</Link>
          </div>
        </PageShell>
      </>
    );
  }
  if (!receiver || !balance || receiver.userId === profile.id) {
    return <><AppHeader title="Settle Up" showBack /><PageError message="No payable balance exists for this member. Return to group balances for the latest state." /></>;
  }

  return (
    <>
      <AppHeader title="Settle Up" showBack />
      <PageShell>
        {errorPresentation === 'background' && <BackgroundRefreshError retry={() => void data.refetch()} isRetrying={data.isFetching} />}
        <SettleUpFlow group={group} receiver={receiver} balance={balance} refetchLatest={data.refetchBalancesAndSettlements} />
      </PageShell>
    </>
  );
}
