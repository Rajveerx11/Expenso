'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, ArrowRight, Bell, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { ExpenseCard } from '@/components/ui/ExpenseCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { BackgroundRefreshError, PageError, PageLoading, queryErrorPresentation } from '@/components/ui/AsyncState';
import { api, messageForError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { currentMonth, formatMoney, formatMonthLabel, getFirstName } from '@/lib/utils';

export default function DashboardPage() {
  const router = useRouter();
  const month = currentMonth();
  const dashboardQuery = useQuery({ queryKey: queryKeys.dashboard(month), queryFn: () => api.dashboard(month) });
  const errorPresentation = queryErrorPresentation(dashboardQuery.error, dashboardQuery.data !== undefined);

  if (dashboardQuery.isPending) return <><AppHeader title="Dashboard" /><PageLoading label="Loading dashboard" /></>;
  if (errorPresentation === 'blocking') return <><AppHeader title="Dashboard" /><PageError message={messageForError(dashboardQuery.error)} retry={() => dashboardQuery.refetch()} /></>;
  const data = dashboardQuery.data!;
  const { profile, monthlyIncome, monthlyExpenses, monthlyNet, totalYouOwe, totalOwedToYou, recentTransactions, unreadNotificationCount } = data;

  return (
    <>
      <AppHeader
        title={`Hello, ${getFirstName(profile.fullName)} 👋`}
        rightAction={
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Refresh dashboard" aria-busy={dashboardQuery.isFetching} disabled={dashboardQuery.isFetching} onClick={() => void dashboardQuery.refetch()}>
              <RefreshCw size={19} aria-hidden="true" />
            </button>
            <Link href="/notifications" className="btn btn-ghost btn-icon" style={{ position: 'relative', display: 'flex' }} aria-label={`Notifications, ${unreadNotificationCount} unread`}>
              <Bell size={20} />
              {unreadNotificationCount > 0 && (
                <span style={{
                  position: 'absolute', top: '6px', right: '6px',
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: 'var(--color-red)', border: '2px solid var(--color-snow)',
                }} />
              )}
            </Link>
          </div>
        }
      />

      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '16px', paddingBottom: '24px' }}>

          {errorPresentation === 'background' && (
            <BackgroundRefreshError
              retry={() => void dashboardQuery.refetch()}
              isRetrying={dashboardQuery.isFetching}
            />
          )}

          {/* Hero Balance Card */}
          <div style={{
            background: 'linear-gradient(135deg, #3730A3 0%, #4338CA 60%, #4F46E5 100%)',
            borderRadius: '24px',
            padding: '24px',
            color: 'white',
            boxShadow: '0 8px 32px rgba(79,70,229,0.35)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Decorative circles */}
            <div style={{ position: 'absolute', top: -40, right: -20, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ position: 'absolute', bottom: -30, right: 40, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

            <p style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{formatMonthLabel(month)} Net Balance</p>
            <div style={{ fontSize: '36px', fontWeight: 800, letterSpacing: '-1px', marginBottom: '20px' }}>
              {Number(monthlyNet) < 0 ? '-' : ''}{formatMoney(monthlyNet)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: 'rgba(17,24,39,0.22)', borderRadius: '14px', padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <TrendingUp size={14} />
                  <span style={{ fontSize: '11px', fontWeight: 500 }}>Income</span>
                </div>
                <div style={{ fontSize: '17px', fontWeight: 700 }}>{formatMoney(monthlyIncome)}</div>
              </div>
              <div style={{ background: 'rgba(17,24,39,0.22)', borderRadius: '14px', padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <TrendingDown size={14} />
                  <span style={{ fontSize: '11px', fontWeight: 500 }}>Spent</span>
                </div>
                <div style={{ fontSize: '17px', fontWeight: 700 }}>{formatMoney(monthlyExpenses)}</div>
              </div>
            </div>
          </div>

          {/* Group Balance Summary */}
          {(parseFloat(totalYouOwe) > 0 || parseFloat(totalOwedToYou) > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px', color: 'var(--color-red)' }}>
                  <Minus size={14} />
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>You Owe</span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-red)' }}>{formatMoney(totalYouOwe)}</div>
              </div>
              <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px', color: 'var(--color-green)' }}>
                  <Plus size={14} />
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>Owed to You</span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-green)' }}>{formatMoney(totalOwedToYou)}</div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div>
            <div className="section-header">
              <h2 className="section-title">Quick Actions</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {[
                { href: '/expenses/new?type=expense', emoji: '💸', label: 'Add Expense', color: '#FFE4E6', textColor: '#BE123C' },
                { href: '/expenses/new?type=income', emoji: '💰', label: 'Add Income', color: '#D1FAE5', textColor: '#047857' },
                { href: '/groups/new', emoji: '👥', label: 'New Group', color: 'var(--color-primary-lightest)', textColor: 'var(--color-primary-deep)' },
              ].map(action => (
                <Link key={action.href} href={action.href} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{ padding: '14px 8px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.1s ease' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: '14px', background: action.color, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: '20px' }}>
                      {action.emoji}
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: action.textColor, lineHeight: 1.3 }}>{action.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <div className="section-header">
              <h2 className="section-title">Recent Activity</h2>
              <Link href="/expenses" style={{ fontSize: '13px', color: 'var(--color-primary-deep)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
                See all <ArrowRight size={14} />
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentTransactions.length === 0 && <EmptyState icon="🧾" title="No activity yet" description="Add income or an expense to begin your ledger." />}
              {recentTransactions.map((tx, i) => (
                <div key={tx.id} className={`animate-slideUp stagger-${Math.min(i + 1, 5)}`}>
                  <ExpenseCard transaction={tx} onClick={() => router.push(`/expenses/${tx.id}`)} />
                </div>
              ))}
            </div>
          </div>

        </div>
      </PageShell>
    </>
  );
}
