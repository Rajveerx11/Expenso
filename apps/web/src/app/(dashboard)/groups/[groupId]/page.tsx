'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Clock, Plus, Settings, Users } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { BalanceChip } from '@/components/ui/BalanceChip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { MemberRow } from '@/components/ui/MemberRow';
import { BackgroundRefreshError, PageError, PageLoading, queryErrorPresentation } from '@/components/ui/AsyncState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { GroupMember, SettlementStatus } from '@/lib/types';
import { getCategoryInfo } from '@/lib/types';
import { api, fieldErrorFor, fieldErrorsFor, focusFirstInvalidField, messageForError, type ApiFieldErrors } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { formatDateShort, formatDateTime, formatMoney, getBalanceText } from '@/lib/utils';
import { flattenPagedItems, settlementsForUser } from '@/features/settlements/domain';
import { useGroupSettlementOverview } from '@/features/settlements/hooks';

type GroupTab = 'expenses' | 'members' | 'balances' | 'settlements';

const STATUS_LABEL: Record<SettlementStatus, { label: string; color: string; background: string }> = {
  pending_confirmation: { label: 'Pending', color: 'var(--color-amber)', background: 'var(--color-amber-soft)' },
  confirmed: { label: 'Confirmed', color: 'var(--color-green)', background: 'var(--color-green-soft)' },
  rejected: { label: 'Rejected', color: 'var(--color-red)', background: 'var(--color-red-soft)' },
};

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const [tab, setTab] = useState<GroupTab>('expenses');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberError, setMemberError] = useState('');
  const [memberFieldErrors, setMemberFieldErrors] = useState<ApiFieldErrors>({});
  const memberFormRef = useRef<HTMLFormElement>(null);
  const [memberToRemove, setMemberToRemove] = useState<GroupMember | null>(null);
  const queryClient = useQueryClient();
  const overview = useGroupSettlementOverview(groupId);
  const group = overview.group.data;
  const profile = overview.profile.data;
  const members = overview.members.data;
  const expensePages = overview.expenses.data;
  const balances = overview.balances.data;
  const settlementPages = overview.settlements.data;
  const hasUsableOverview = group !== undefined
    && profile !== undefined
    && members !== undefined
    && expensePages !== undefined
    && balances !== undefined
    && settlementPages !== undefined;
  const errorPresentation = queryErrorPresentation(overview.error, hasUsableOverview);

  const addMember = useMutation({
    mutationFn: (email: string) => api.groups.addMember(groupId, email),
    onSuccess: async () => {
      setMemberEmail('');
      setMemberError('');
      setMemberFieldErrors({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members(groupId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
        queryClient.invalidateQueries({ queryKey: queryKeys.balances(groupId) }),
      ]);
    },
    onError: (error) => {
      setMemberError(messageForError(error));
      setMemberFieldErrors(fieldErrorsFor(error));
      focusFirstInvalidField(memberFormRef.current);
    },
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => api.groups.removeMember(groupId, userId),
    onSuccess: async () => {
      setMemberToRemove(null);
      setMemberError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members(groupId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
        queryClient.invalidateQueries({ queryKey: queryKeys.balances(groupId) }),
      ]);
    },
    onError: (error) => {
      setMemberToRemove(null);
      setMemberError(messageForError(error));
    },
  });

  if (overview.isPending) {
    return <><AppHeader title="Group" showBack backHref="/groups" /><PageLoading label="Loading group" /></>;
  }
  if (errorPresentation === 'blocking') {
    return <><AppHeader title="Group" showBack backHref="/groups" /><PageError message={messageForError(overview.error)} retry={() => overview.refetch()} /></>;
  }
  if (!group || !profile || !members || !expensePages || !balances || !settlementPages) {
    return <><AppHeader title="Group" showBack backHref="/groups" /><PageError message="Group data is incomplete. Reload and try again." retry={() => overview.refetch()} /></>;
  }

  const isAdmin = group.currentUserRole === 'admin';
  const adminCount = members.filter((member) => member.role === 'admin').length;
  const expenses = flattenPagedItems(expensePages.pages);
  const yourSettlements = settlementsForUser(flattenPagedItems(settlementPages.pages), profile.id);
  const memberEmailError = fieldErrorFor(memberFieldErrors, 'email');

  function submitMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = memberEmail.trim().toLowerCase();
    if (!email) {
      setMemberError('Enter a registered member email.');
      setMemberFieldErrors({ email: ['Enter a registered member email.'] });
      focusFirstInvalidField(memberFormRef.current);
      return;
    }
    addMember.mutate(email);
  }

  return (
    <>
      <AppHeader
        title={group.name}
        showBack
        backHref="/groups"
        rightAction={isAdmin ? (
          <Link href={`/groups/${group.id}/settings`} className="btn btn-ghost btn-icon" aria-label="Group settings">
            <Settings size={20} aria-hidden="true" />
          </Link>
        ) : undefined}
      />
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16, paddingBottom: 32 }}>
          {errorPresentation === 'background' && (
            <BackgroundRefreshError
              retry={() => void overview.refetch()}
              isRetrying={overview.profile.isFetching
                || overview.group.isFetching
                || overview.members.isFetching
                || overview.expenses.isFetching
                || overview.balances.isFetching
                || overview.settlements.isFetching}
            />
          )}
          <section className="card" aria-labelledby="group-summary-title" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: 20, position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, var(--color-primary-lightest), var(--color-primary-container))', display: 'grid', placeItems: 'center', fontSize: 28, flexShrink: 0 }}>
                {group.imageUrl ? <Image src={group.imageUrl} alt="" fill sizes="64px" unoptimized style={{ objectFit: 'cover' }} /> : <span aria-hidden="true">👥</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 id="group-summary-title" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-black)', marginBottom: 4 }}>{group.name}</h2>
                {group.description && <p style={{ fontSize: 13, color: 'var(--color-medium)', lineHeight: 1.4 }}>{group.description}</p>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={14} color="var(--color-medium)" aria-hidden="true" />
                <span style={{ fontSize: 13, color: 'var(--color-medium)' }}>{group.memberCount} members</span>
              </div>
              <BalanceChip balance={group.currentUserBalance} />
            </div>
          </section>

          <SegmentedControl
            aria-label="Group sections"
            value={tab}
            onChange={(value) => setTab(value as GroupTab)}
            options={[
              { value: 'expenses', label: 'Expenses' },
              { value: 'members', label: 'Members' },
              { value: 'balances', label: 'Balances' },
              { value: 'settlements', label: 'Settlements' },
            ]}
          />

          {tab === 'expenses' && (
            <section aria-labelledby="group-expenses-title" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <h2 id="group-expenses-title" className="section-title">Group expenses</h2>
                <Link href={`/groups/${group.id}/expenses/new`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
                  <Plus size={15} aria-hidden="true" /> Add Expense
                </Link>
              </div>
              {expenses.length === 0 ? (
                <EmptyState icon="🧾" title="No expenses yet" description="Add the first expense for this group" />
              ) : expenses.map((expense) => {
                const category = getCategoryInfo(expense.category);
                return (
                  <Link key={expense.id} href={`/groups/${group.id}/expenses/${expense.id}`} className="card card-hover" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
                    <div aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 12, background: `${category.color}18`, display: 'grid', placeItems: 'center', fontSize: 20, flexShrink: 0 }}>{category.emoji}</div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{expense.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-medium)', marginTop: 2 }}>Paid by {expense.paidByName} · {formatDateShort(expense.expenseDate)}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-black)' }}>{formatMoney(expense.totalAmount)}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-medium)', textTransform: 'capitalize' }}>{expense.splitType}</div>
                    </div>
                  </Link>
                );
              })}
              {overview.expenses.hasNextPage && (
                <button type="button" className="btn btn-secondary" onClick={() => void overview.expenses.fetchNextPage()} disabled={overview.expenses.isFetchingNextPage}>
                  {overview.expenses.isFetchingNextPage ? 'Loading…' : 'Load more expenses'}
                </button>
              )}
            </section>
          )}

          {tab === 'members' && (
            <section aria-labelledby="group-members-title" className="card" style={{ padding: '0 16px' }}>
              <h2 id="group-members-title" className="sr-only">Group members</h2>
              {isAdmin && (
                <form ref={memberFormRef} onSubmit={submitMember} style={{ padding: '14px 0', borderBottom: '1px solid var(--color-light)', display: 'flex', gap: 8 }}>
                  <label htmlFor="new-member-email" className="sr-only">Registered member email</label>
                  <input
                    id="new-member-email"
                    type="email"
                    className={`input ${memberEmailError ? 'input-error' : ''}`}
                    placeholder="member@example.com"
                    value={memberEmail}
                    onChange={(event) => { setMemberEmail(event.target.value); setMemberFieldErrors((current) => ({ ...current, email: [] })); }}
                    aria-invalid={Boolean(memberEmailError)}
                    aria-describedby={memberEmailError ? 'new-member-email-error' : undefined}
                    autoComplete="email"
                    required
                  />
                  <button className="btn btn-secondary btn-sm" type="submit" disabled={addMember.isPending} style={{ flexShrink: 0 }}>
                    <Plus size={15} aria-hidden="true" /> {addMember.isPending ? 'Adding…' : 'Add'}
                  </button>
                </form>
              )}
              {memberError && <p id={memberEmailError ? 'new-member-email-error' : undefined} role="alert" style={{ color: 'var(--color-red)', fontSize: 13, paddingTop: 12 }}>{memberError}</p>}
              {members.map((member, index) => (
                <div key={member.membershipId} style={{ borderBottom: index < members.length - 1 ? '1px solid var(--color-light)' : 'none' }}>
                  <MemberRow
                    member={member}
                    isCurrentUser={member.userId === profile.id}
                    isAdminView={isAdmin}
                    isSoleAdmin={adminCount === 1}
                    onRemove={setMemberToRemove}
                  />
                </div>
              ))}
            </section>
          )}

          {tab === 'balances' && (
            <section aria-labelledby="group-balances-title" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 id="group-balances-title" className="sr-only">Your group balances</h2>
              {balances.length === 0 ? (
                <EmptyState icon="⚖️" title="All settled up" description="No outstanding balances in this group" />
              ) : balances.map((balance) => (
                <div key={balance.userId} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={balance.userName} imageUrl={balance.userAvatarUrl} size="sm" />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{balance.userName}</div>
                    <div style={{ fontSize: 12, color: balance.direction === 'owes_you' ? 'var(--color-green)' : balance.direction === 'you_owe' ? 'var(--color-red)' : 'var(--color-medium)', marginTop: 2, fontWeight: 500 }}>
                      {getBalanceText(balance.balance)}
                    </div>
                  </div>
                  {balance.direction === 'you_owe' && balance.userId !== profile.id && (
                    <Link href={`/groups/${group.id}/settle/${balance.userId}`} className="btn btn-danger btn-sm" style={{ textDecoration: 'none' }}>
                      <ArrowUpRight size={14} aria-hidden="true" /> Settle Up
                    </Link>
                  )}
                </div>
              ))}
            </section>
          )}

          {tab === 'settlements' && (
            <section aria-labelledby="settlement-history-title" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 id="settlement-history-title" className="section-title">Your settlement history</h2>
              {yourSettlements.length === 0 ? (
                <EmptyState icon="🤝" title="No settlements yet" description="Payment claims involving you will appear here" />
              ) : yourSettlements.map((settlement) => {
                const status = STATUS_LABEL[settlement.status];
                const sent = settlement.payerId === profile.id;
                return (
                  <Link key={settlement.id} href={`/groups/${group.id}/settlements/${settlement.id}`} className="card card-hover" style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: status.background, color: status.color, flexShrink: 0 }}>
                      <Clock size={18} aria-hidden="true" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sent ? `Paid ${settlement.receiverName}` : `Received from ${settlement.payerName}`}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--color-medium)', marginTop: 2 }}>{formatDateTime(settlement.createdAt)}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-black)' }}>{formatMoney(settlement.amount)}</p>
                      <span style={{ fontSize: 11, fontWeight: 600, color: status.color }}>{status.label}</span>
                    </div>
                  </Link>
                );
              })}
              {overview.settlements.hasNextPage && (
                <button type="button" className="btn btn-secondary" onClick={() => void overview.settlements.fetchNextPage()} disabled={overview.settlements.isFetchingNextPage}>
                  {overview.settlements.isFetchingNextPage ? 'Loading…' : 'Load more settlements'}
                </button>
              )}
            </section>
          )}
        </div>
      </PageShell>

      <ConfirmDialog
        isOpen={Boolean(memberToRemove)}
        title="Remove member?"
        message={memberToRemove ? `Remove ${memberToRemove.fullName} from this group? Outstanding balances or pending settlements will block removal.` : ''}
        confirmLabel="Remove Member"
        onCancel={() => setMemberToRemove(null)}
        onConfirm={() => memberToRemove && removeMember.mutate(memberToRemove.userId)}
        loading={removeMember.isPending}
      />
    </>
  );
}
