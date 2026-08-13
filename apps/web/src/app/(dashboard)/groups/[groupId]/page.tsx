'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Settings, Plus, Users, Receipt, Scale, ArrowUpRight } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Avatar } from '@/components/ui/Avatar';
import { MoneyText } from '@/components/ui/MoneyText';
import { BalanceChip } from '@/components/ui/BalanceChip';
import { MemberRow } from '@/components/ui/MemberRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton, DangerButton, SecondaryButton } from '@/components/ui/Buttons';
import { getCategoryInfo } from '@/lib/types';
import { formatMoney, formatDateShort, getBalanceText } from '@/lib/utils';
import { MOCK_GROUPS, MOCK_MEMBERS, MOCK_GROUP_EXPENSES, MOCK_BALANCES } from '@/lib/mockData';

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const [tab, setTab] = useState('expenses');

  const group = MOCK_GROUPS.find(g => g.id === groupId) ?? MOCK_GROUPS[0];
  const members = MOCK_MEMBERS[groupId] ?? MOCK_MEMBERS['grp-001'];
  const expenses = MOCK_GROUP_EXPENSES[groupId] ?? MOCK_GROUP_EXPENSES['grp-001'];
  const balances = MOCK_BALANCES[groupId] ?? MOCK_BALANCES['grp-001'];
  const currentUserId = 'usr-001-yuvraj';
  const isAdmin = group.currentUserRole === 'admin';

  return (
    <>
      <AppHeader
        title={group.name}
        showBack
        backHref="/groups"
        rightAction={
          isAdmin
            ? <Link href={`/groups/${group.id}/settings`}><button className="btn btn-ghost btn-icon" aria-label="Group settings"><Settings size={20} /></button></Link>
            : undefined
        }
      />
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>

          {/* Group Summary Card */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <div style={{ width: 64, height: 64, borderRadius: '20px', background: 'linear-gradient(135deg, var(--color-primary-lightest), var(--color-primary-container))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', flexShrink: 0 }}>
                {group.imageUrl ? <img src={group.imageUrl} alt={group.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '20px' }} /> : '👥'}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-black)', marginBottom: '4px' }}>{group.name}</h2>
                {group.description && <p style={{ fontSize: '13px', color: 'var(--color-medium)', lineHeight: 1.4 }}>{group.description}</p>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={14} color="var(--color-medium)" />
                <span style={{ fontSize: '13px', color: 'var(--color-medium)' }}>{group.memberCount} members</span>
              </div>
              <BalanceChip balance={group.currentUserBalance} />
            </div>
          </div>

          {/* Tabs */}
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: 'expenses', label: 'Expenses' },
              { value: 'members', label: 'Members' },
              { value: 'balances', label: 'Balances' },
            ]}
          />

          {/* Expenses Tab */}
          {tab === 'expenses' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Link href={`/groups/${group.id}/expenses/new`}>
                  <button className="btn btn-primary btn-sm"><Plus size={15} /> Add Expense</button>
                </Link>
              </div>
              {expenses.length === 0
                ? <EmptyState icon="🧾" title="No expenses yet" description="Add the first expense for this group" />
                : expenses.map(expense => {
                    const cat = getCategoryInfo(expense.category);
                    return (
                      <div key={expense.id} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: 44, height: 44, borderRadius: '12px', background: `${cat.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>{cat.emoji}</div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{expense.title}</div>
                          <div style={{ fontSize: '12px', color: 'var(--color-medium)', marginTop: '2px' }}>Paid by {expense.paidByName} • {formatDateShort(expense.expenseDate)}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-black)' }}>{formatMoney(expense.totalAmount)}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-medium)', textTransform: 'capitalize' }}>{expense.splitType}</div>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          )}

          {/* Members Tab */}
          {tab === 'members' && (
            <div className="card" style={{ padding: '0 16px' }}>
              {isAdmin && (
                <div style={{ padding: '14px 0', borderBottom: '1px solid var(--color-light)' }}>
                  <button className="btn btn-secondary btn-sm" style={{ gap: '6px', width: '100%' }}>
                    <Plus size={15} /> Add Member
                  </button>
                </div>
              )}
              {members.map((member, i) => (
                <div key={member.membershipId} style={{ borderBottom: i < members.length - 1 ? '1px solid var(--color-light)' : 'none' }}>
                  <MemberRow
                    member={member}
                    isCurrentUser={member.userId === currentUserId}
                    isAdminView={isAdmin}
                    isSoleAdmin={members.filter(m => m.role === 'admin').length === 1}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Balances Tab */}
          {tab === 'balances' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {balances.length === 0
                ? <EmptyState icon="⚖️" title="All settled up" description="No outstanding balances in this group" />
                : balances.map(balance => (
                    <div key={balance.userId} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Avatar name={balance.userName} imageUrl={balance.userAvatarUrl} size="sm" />
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{balance.userName}</div>
                        <div style={{ fontSize: '12px', color: balance.direction === 'owes_you' ? 'var(--color-green)' : balance.direction === 'you_owe' ? 'var(--color-red)' : 'var(--color-medium)', marginTop: '2px', fontWeight: 500 }}>
                          {getBalanceText(balance.balance)}
                        </div>
                      </div>
                      {balance.direction === 'you_owe' && (
                        <Link href={`/groups/${group.id}/settle/${balance.userId}`}>
                          <button className="btn btn-danger btn-sm" style={{ gap: '4px' }}>
                            <ArrowUpRight size={14} /> Settle Up
                          </button>
                        </Link>
                      )}
                    </div>
                  ))
              }
            </div>
          )}

        </div>
      </PageShell>
    </>
  );
}
