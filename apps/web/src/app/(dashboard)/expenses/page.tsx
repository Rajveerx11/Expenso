'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { MonthYearPicker } from '@/components/ui/MonthYearPicker';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ExpenseCard } from '@/components/ui/ExpenseCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SecondaryButton } from '@/components/ui/Buttons';
import { BackgroundRefreshError, PageError, PageLoading, queryErrorPresentation } from '@/components/ui/AsyncState';
import { api, messageForError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { currentMonth, formatMoney } from '@/lib/utils';

type TransactionFilter = 'all' | 'income' | 'expense';

export default function ExpensesPage() {
  const router = useRouter();
  const [month, setMonth] = useState(currentMonth());
  const [filter, setFilter] = useState<TransactionFilter>('all');
  const transactionsQuery = useInfiniteQuery({
    queryKey: queryKeys.personal(month, filter),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.personal.list(month, filter, pageParam, 30),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const analyticsQuery = useQuery({ queryKey: queryKeys.analytics(month), queryFn: () => api.personal.analytics(month) });
  const transactions = transactionsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const header = (
    <AppHeader
      title="Transactions"
      rightAction={
        <Link href="/expenses/new" className="btn btn-primary btn-sm" style={{ gap: '4px' }}>
          <Plus size={16} /> Add
        </Link>
      }
    />
  );
  if (transactionsQuery.isPending || analyticsQuery.isPending) return <>{header}<PageLoading label="Loading transactions" /></>;
  const requestError = transactionsQuery.error ?? analyticsQuery.error;
  const errorPresentation = queryErrorPresentation(
    requestError,
    transactionsQuery.data !== undefined && analyticsQuery.data !== undefined,
  );
  const refetchAll = () => { void Promise.all([transactionsQuery.refetch(), analyticsQuery.refetch()]); };
  if (errorPresentation === 'blocking') return <>{header}<PageError message={messageForError(requestError)} retry={refetchAll} /></>;

  const analytics = analyticsQuery.data!;
  return (
    <>
      {header}
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px', paddingBottom: 32 }}>
          {errorPresentation === 'background' && (
            <BackgroundRefreshError
              retry={refetchAll}
              isRetrying={transactionsQuery.isFetching || analyticsQuery.isFetching}
            />
          )}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <MonthYearPicker value={month} onChange={setMonth} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {[
              { label: 'Income', value: analytics.monthlyIncome, color: 'var(--color-green)' },
              { label: 'Spent', value: analytics.monthlyExpenses, color: 'var(--color-red)' },
              { label: 'Net', value: analytics.monthlyNet, color: Number(analytics.monthlyNet) < 0 ? 'var(--color-red)' : 'var(--color-primary-deep)' },
            ].map((item) => (
              <div key={item.label} className="card" style={{ padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-medium)', fontWeight: 500, marginBottom: '4px' }}>{item.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: item.color }}>
                  {Number(item.value) < 0 ? '-' : ''}{formatMoney(item.value, true)}
                </div>
              </div>
            ))}
          </div>

          <SegmentedControl
            aria-label="Transaction type"
            value={filter}
            onChange={(value) => setFilter(value as TransactionFilter)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'income', label: '💰 Income' },
              { value: 'expense', label: '💸 Expense' },
            ]}
          />

          <div className="card" style={{ padding: '16px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-dark)', marginBottom: '12px' }}>By Category</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {analytics.categoryBreakdown.length === 0 && <p style={{ color: 'var(--color-medium)', fontSize: 13 }}>No expense categories this month.</p>}
              {analytics.categoryBreakdown.map((category) => (
                <div key={category.category} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--color-dark)', minWidth: '80px' }}>{category.category}</span>
                  <div style={{ flex: 1, height: '6px', background: 'var(--color-light)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, category.percentage)}%`, background: 'linear-gradient(90deg, var(--color-primary-deep), var(--color-primary-soft))', borderRadius: '3px', transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-dark)', minWidth: '64px', textAlign: 'right' }}>{formatMoney(category.amount, true)}</span>
                </div>
              ))}
            </div>
          </div>

          <section aria-labelledby="transaction-list-title">
            <h2 id="transaction-list-title" style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: 'var(--color-black)' }}>Transactions</h2>
            {transactions.length === 0 ? (
              <EmptyState icon="🧾" title="No transactions" description="Add your first transaction to start tracking." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {transactions.map((transaction) => (
                  <ExpenseCard
                    key={transaction.id}
                    transaction={transaction}
                    onClick={() => router.push(`/expenses/${transaction.id}`)}
                  />
                ))}
                {transactionsQuery.hasNextPage && (
                  <SecondaryButton type="button" fullWidth loading={transactionsQuery.isFetchingNextPage} onClick={() => transactionsQuery.fetchNextPage()}>
                    Load more
                  </SecondaryButton>
                )}
              </div>
            )}
          </section>
        </div>
      </PageShell>
    </>
  );
}
