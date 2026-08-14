'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DangerButton, PrimaryButton } from '@/components/ui/Buttons';
import { BackgroundRefreshError, PageError, PageLoading, queryErrorPresentation } from '@/components/ui/AsyncState';
import type { SettlementStatus } from '@/lib/types';
import { ApiClientError, api, messageForError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { conflictCopy } from '@/features/settlements/domain';
import { useSettlementDetailData } from '@/features/settlements/hooks';

const STATUS_CONFIG: Record<SettlementStatus, {
  icon: typeof Clock;
  color: string;
  background: string;
  label: string;
}> = {
  pending_confirmation: { icon: Clock, color: 'var(--color-amber)', background: 'var(--color-amber-soft)', label: 'Pending Confirmation' },
  confirmed: { icon: CheckCircle, color: 'var(--color-green)', background: 'var(--color-green-soft)', label: 'Confirmed' },
  rejected: { icon: XCircle, color: 'var(--color-red)', background: 'var(--color-red-soft)', label: 'Rejected' },
};

type SettlementAction = 'confirm' | 'reject';

export default function SettlementDetailPage() {
  const { groupId, settlementId } = useParams<{ groupId: string; settlementId: string }>();
  const data = useSettlementDetailData(groupId, settlementId);
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<SettlementAction | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const respond = useMutation({
    mutationFn: (action: SettlementAction) => api.groups.respondSettlement(groupId, settlementId, action),
  });

  if (data.isPending) return <><AppHeader title="Settlement" showBack /><PageLoading label="Loading settlement" /></>;
  const group = data.group.data;
  const profile = data.profile.data;
  const settlement = data.settlement.data;
  const hasUsableData = Boolean(group && profile && settlement && data.balances.data !== undefined);
  const errorPresentation = queryErrorPresentation(data.error, hasUsableData);
  if (errorPresentation === 'blocking') return <><AppHeader title="Settlement" showBack /><PageError message={messageForError(data.error)} retry={() => data.refetch()} /></>;
  if (!group || !profile || !settlement) {
    return <><AppHeader title="Settlement" showBack /><PageError message="Settlement data is incomplete. Reload and try again." retry={() => data.refetch()} /></>;
  }

  const isPayer = settlement.payerId === profile.id;
  const isReceiver = settlement.receiverId === profile.id;
  const status = STATUS_CONFIG[settlement.status];
  const StatusIcon = status.icon;

  async function performAction() {
    if (!pendingAction) return;
    const requestedAction = pendingAction;
    setActionError('');
    setActionMessage('');
    try {
      const latest = await respond.mutateAsync(requestedAction);
      queryClient.setQueryData(queryKeys.settlement(groupId, settlementId), latest);
      setPendingAction(null);
      if (requestedAction === 'confirm' && latest.status !== 'confirmed') {
        setActionMessage(`Claim was already ${latest.status}. Latest status is shown.`);
      } else if (requestedAction === 'reject' && latest.status !== 'rejected') {
        setActionMessage(`Claim was already ${latest.status}. Latest status is shown.`);
      } else {
        setActionMessage(latest.status === 'confirmed'
          ? 'Payment confirmed. Group balances now reflect this settlement.'
          : 'Payment claim rejected. No balances were changed.');
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settlements(groupId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.balances(groupId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
      ]);
    } catch (error) {
      setPendingAction(null);
      if (error instanceof ApiClientError && error.status === 409) {
        await data.refetch();
        setActionError(conflictCopy(error.code));
      } else {
        setActionError(messageForError(error));
      }
    }
  }

  return (
    <>
      <AppHeader title="Settlement" subtitle={group.name} showBack backHref={`/groups/${groupId}`} />
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16, paddingBottom: 32 }}>
          {errorPresentation === 'background' && <BackgroundRefreshError retry={() => void data.refetch()} isRetrying={data.isFetching} />}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, background: status.background, borderRadius: 'var(--radius-full)', padding: '8px 20px' }}>
              <StatusIcon size={18} color={status.color} aria-hidden="true" />
              <span style={{ fontSize: 14, fontWeight: 700, color: status.color }}>{status.label}</span>
            </div>
          </div>

          {actionMessage && <div role="status" aria-live="polite" style={{ borderRadius: 12, padding: 14, background: 'var(--color-green-soft)', color: 'var(--color-green)', fontSize: 13, lineHeight: 1.5 }}>{actionMessage}</div>}
          {actionError && <div role="alert" style={{ borderRadius: 12, padding: 14, background: 'var(--color-red-soft)', color: 'var(--color-red)', fontSize: 13, lineHeight: 1.5 }}>{actionError}</div>}

          <section aria-labelledby="settlement-amount-title" className="card" style={{ padding: 24, textAlign: 'center' }}>
            <p id="settlement-amount-title" style={{ fontSize: 13, color: 'var(--color-medium)', marginBottom: 8 }}>
              {isPayer ? 'You claimed to have paid' : `${settlement.payerName} claims to have paid`}
            </p>
            <p style={{ fontSize: 40, fontWeight: 800, color: 'var(--color-black)', lineHeight: 1 }}>{formatMoney(settlement.amount)}</p>
          </section>

          <section aria-label="Settlement parties" className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={settlement.payerName} size="sm" />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12, color: 'var(--color-medium)' }}>Payer</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-black)' }}>{settlement.payerName} {isPayer && '(You)'}</p>
              </div>
            </div>
            <div style={{ height: 1, background: 'var(--color-light)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={settlement.receiverName} size="sm" />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12, color: 'var(--color-medium)' }}>Receiver</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-black)' }}>{settlement.receiverName} {isReceiver && '(You)'}</p>
              </div>
            </div>
          </section>

          <section aria-label="Settlement details" className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontSize: 13, color: 'var(--color-medium)' }}>Submitted</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-dark)', textAlign: 'right' }}>{formatDateTime(settlement.createdAt)}</span>
            </div>
            {settlement.confirmedAt && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <span style={{ fontSize: 13, color: 'var(--color-medium)' }}>Confirmed</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-dark)', textAlign: 'right' }}>{formatDateTime(settlement.confirmedAt)}</span>
              </div>
            )}
            {settlement.transactionRef && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <span style={{ fontSize: 13, color: 'var(--color-medium)', flexShrink: 0 }}>Reference</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-dark)', textAlign: 'right', wordBreak: 'break-all' }}>{settlement.transactionRef}</span>
              </div>
            )}
          </section>

          {settlement.canRespond && settlement.status === 'pending_confirmation' && (
            <>
              <div style={{ background: 'var(--color-amber-soft)', borderRadius: 14, padding: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <AlertCircle size={18} color="var(--color-amber)" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                <p style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>Confirm only if the money arrived. Reject if it did not. Either choice is final.</p>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <DangerButton type="button" fullWidth disabled={respond.isPending} onClick={() => setPendingAction('reject')}>Reject</DangerButton>
                <PrimaryButton type="button" fullWidth disabled={respond.isPending} onClick={() => setPendingAction('confirm')}><CheckCircle size={16} aria-hidden="true" /> Confirm</PrimaryButton>
              </div>
            </>
          )}

          {!settlement.canRespond && settlement.status === 'pending_confirmation' && (
            <div style={{ background: 'var(--color-amber-soft)', borderRadius: 14, padding: 16, textAlign: 'center' }}>
              <Clock size={24} color="var(--color-amber)" style={{ margin: '0 auto 8px' }} aria-hidden="true" />
              <p style={{ fontSize: 14, fontWeight: 600, color: '#B45309' }}>{isPayer ? 'Waiting for confirmation' : 'Confirmation pending'}</p>
              <p style={{ fontSize: 13, color: '#92400E', marginTop: 4 }}>{settlement.receiverName} is the only person who can respond to this claim.</p>
            </div>
          )}

          <Link href={`/groups/${groupId}`} className="btn btn-secondary" style={{ textDecoration: 'none', justifyContent: 'center' }}>Back to Group</Link>
        </div>
      </PageShell>

      <ConfirmDialog
        isOpen={Boolean(pendingAction)}
        title={pendingAction === 'confirm' ? 'Confirm payment received?' : 'Reject payment claim?'}
        message={pendingAction === 'confirm'
          ? `Confirm that you received ${formatMoney(settlement.amount)} from ${settlement.payerName}. This updates group balances and cannot be undone.`
          : `Reject ${settlement.payerName}'s claim for ${formatMoney(settlement.amount)}. No balances will change.`}
        confirmLabel={pendingAction === 'confirm' ? 'Confirm Received' : 'Reject Claim'}
        danger={pendingAction === 'reject'}
        onConfirm={performAction}
        onCancel={() => setPendingAction(null)}
        loading={respond.isPending}
      />
    </>
  );
}
