'use client';
import { useParams, useRouter } from 'next/navigation';
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { PrimaryButton, DangerButton, SecondaryButton } from '@/components/ui/Buttons';
import { MOCK_SETTLEMENTS } from '@/lib/mockData';
import { formatMoney, formatDateTime } from '@/lib/utils';
import { useState } from 'react';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';

const STATUS_CONFIG = {
  pending_confirmation: { icon: Clock, color: 'var(--color-amber)', bg: 'var(--color-amber-soft)', label: 'Pending Confirmation' },
  confirmed: { icon: CheckCircle, color: 'var(--color-green)', bg: 'var(--color-green-soft)', label: 'Confirmed' },
  rejected: { icon: XCircle, color: 'var(--color-red)', bg: 'var(--color-red-soft)', label: 'Rejected' },
};

export default function SettlementDetailPage() {
  const { groupId, settlementId } = useParams<{ groupId: string; settlementId: string }>();
  const router = useRouter();
  const settlement = MOCK_SETTLEMENTS.find(s => s.id === settlementId) ?? MOCK_SETTLEMENTS[0];
  const currentUserId = 'usr-001-demo';
  const isReceiver = settlement.receiverId === currentUserId;
  const isPayer = settlement.payerId === currentUserId;

  const [loading, setLoading] = useState<'confirm' | 'reject' | null>(null);
  const [success, setSuccess] = useState(false);
  const [actionDone, setActionDone] = useState<'confirm' | 'reject' | null>(null);

  const status = STATUS_CONFIG[settlement.status];
  const StatusIcon = status.icon;

  async function handleConfirm() {
    setLoading('confirm');
    // TODO: POST /api/v1/groups/{groupId}/settlements/{settlementId}/confirm
    await new Promise(r => setTimeout(r, 900));
    setLoading(null);
    setActionDone('confirm');
    setSuccess(true);
  }

  async function handleReject() {
    setLoading('reject');
    // TODO: POST /api/v1/groups/{groupId}/settlements/{settlementId}/reject
    await new Promise(r => setTimeout(r, 900));
    setLoading(null);
    setActionDone('reject');
    setSuccess(true);
  }

  return (
    <>
      <AppHeader title="Settlement" showBack />
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px', paddingBottom: '32px' }}>

          {/* Status Badge */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: status.bg, borderRadius: 'var(--radius-full)', padding: '8px 20px' }}>
              <StatusIcon size={18} color={status.color} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: status.color }}>{status.label}</span>
            </div>
          </div>

          {/* Amount */}
          <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-medium)', marginBottom: '8px' }}>
              {isPayer ? 'You claimed to have paid' : `${settlement.payerName} claims to have paid`}
            </p>
            <p style={{ fontSize: '40px', fontWeight: 800, color: 'var(--color-black)', lineHeight: 1 }}>
              {formatMoney(settlement.amount)}
            </p>
          </div>

          {/* Parties */}
          <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Avatar name={settlement.payerName} size="sm" />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '12px', color: 'var(--color-medium)' }}>Payer</p>
                <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-black)' }}>
                  {settlement.payerName} {isPayer && '(You)'}
                </p>
              </div>
            </div>
            <div style={{ height: '1px', background: 'var(--color-light)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Avatar name={settlement.receiverName} size="sm" />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '12px', color: 'var(--color-medium)' }}>Receiver</p>
                <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-black)' }}>
                  {settlement.receiverName} {isReceiver && '(You)'}
                </p>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-medium)' }}>Submitted</span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-dark)' }}>{formatDateTime(settlement.createdAt)}</span>
            </div>
            {settlement.confirmedAt && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--color-medium)' }}>Confirmed</span>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-dark)' }}>{formatDateTime(settlement.confirmedAt)}</span>
              </div>
            )}
            {settlement.transactionRef && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                <span style={{ fontSize: '13px', color: 'var(--color-medium)', flexShrink: 0 }}>Reference</span>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-dark)', textAlign: 'right', wordBreak: 'break-all' }}>{settlement.transactionRef}</span>
              </div>
            )}
          </div>

          {/* Actions for receiver on pending */}
          {isReceiver && settlement.status === 'pending_confirmation' && (
            <>
              <div style={{ background: 'var(--color-amber-soft)', borderRadius: '14px', padding: '14px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <AlertCircle size={18} color="var(--color-amber)" style={{ flexShrink: 0, marginTop: '1px' }} />
                <p style={{ fontSize: '13px', color: '#92400E', lineHeight: 1.5 }}>
                  Please confirm only if you actually received this payment. This action cannot be undone.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <DangerButton fullWidth loading={loading === 'reject'} disabled={!!loading} onClick={handleReject}>
                  Reject
                </DangerButton>
                <PrimaryButton fullWidth loading={loading === 'confirm'} disabled={!!loading} onClick={handleConfirm}>
                  <CheckCircle size={16} /> Confirm
                </PrimaryButton>
              </div>
            </>
          )}

          {/* Payer waiting state */}
          {isPayer && settlement.status === 'pending_confirmation' && (
            <div style={{ background: 'var(--color-amber-soft)', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
              <Clock size={24} color="var(--color-amber)" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#B45309' }}>Waiting for confirmation</p>
              <p style={{ fontSize: '13px', color: '#92400E', marginTop: '4px' }}>{settlement.receiverName} needs to confirm this payment.</p>
            </div>
          )}
        </div>
      </PageShell>
      <SuccessOverlay
        show={success}
        message={actionDone === 'confirm' ? 'Payment confirmed!' : 'Payment rejected'}
        onComplete={() => router.push(`/groups/${groupId}`)}
      />
    </>
  );
}
