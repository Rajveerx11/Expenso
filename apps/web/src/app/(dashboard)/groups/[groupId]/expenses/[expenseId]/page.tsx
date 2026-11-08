'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { DangerButton } from '@/components/ui/Buttons';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { BackgroundRefreshError, PageError, PageLoading, queryErrorPresentation } from '@/components/ui/AsyncState';
import { api, messageForError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { formatDate, formatMoney } from '@/lib/utils';

export default function GroupExpenseDetailPage() {
  const { groupId, expenseId } = useParams<{ groupId: string; expenseId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const expenseQuery = useQuery({
    queryKey: queryKeys.groupExpense(groupId, expenseId),
    queryFn: () => api.groups.expense(groupId, expenseId),
    enabled: Boolean(groupId && expenseId),
  });
  const deleteExpense = useMutation({ mutationFn: () => api.groups.removeExpense(groupId, expenseId), retry: false });
  const header = <AppHeader title="Group Expense" showBack backHref={`/groups/${groupId}`} />;
  const errorPresentation = queryErrorPresentation(expenseQuery.error, expenseQuery.data !== undefined);

  async function handleDelete() {
    setError('');
    try {
      await deleteExpense.mutateAsync();
      queryClient.removeQueries({ queryKey: queryKeys.groupExpense(groupId, expenseId) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.groupExpenses(groupId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.balances(groupId) }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['personal-expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['personal-analytics'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
      ]);
      router.replace(`/groups/${groupId}`);
    } catch (requestError) {
      setConfirmDelete(false);
      setError(messageForError(requestError));
    }
  }

  if (expenseQuery.isPending) return <>{header}<PageLoading label="Loading group expense" /></>;
  if (errorPresentation === 'blocking') return <>{header}<PageError message={messageForError(expenseQuery.error)} retry={() => expenseQuery.refetch()} /></>;
  const { expense, splits } = expenseQuery.data!;

  return (
    <>
      {header}
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16, paddingBottom: 32 }}>
          {errorPresentation === 'background' && (
            <BackgroundRefreshError
              retry={() => void expenseQuery.refetch()}
              isRetrying={expenseQuery.isFetching}
            />
          )}
          <section className="card" style={{ padding: 20 }} aria-labelledby="group-expense-title">
            <span className="chip chip-primary" style={{ textTransform: 'capitalize' }}>{expense.category}</span>
            <h1 id="group-expense-title" style={{ fontSize: 22, margin: '14px 0 6px', color: 'var(--color-black)' }}>{expense.title}</h1>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-primary-deep)' }}>{formatMoney(expense.totalAmount)}</div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 18px', marginTop: 20, fontSize: 14 }}>
              <dt style={{ color: 'var(--color-medium)' }}>Paid by</dt><dd>{expense.paidByName}</dd>
              <dt style={{ color: 'var(--color-medium)' }}>Date</dt><dd>{formatDate(expense.expenseDate)}</dd>
              <dt style={{ color: 'var(--color-medium)' }}>Split</dt><dd style={{ textTransform: 'capitalize' }}>{expense.splitType}</dd>
              <dt style={{ color: 'var(--color-medium)' }}>Note</dt><dd>{expense.note || 'None'}</dd>
            </dl>
          </section>

          <section className="card" style={{ padding: 16 }} aria-labelledby="split-details-title">
            <h2 id="split-details-title" style={{ fontSize: 15, marginBottom: 10 }}>Split details</h2>
            <div style={{ display: 'grid', gap: 4 }}>
              {splits.map((split) => (
                <div key={split.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--color-light)' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: 14 }}>{split.userName}</strong>
                    <span style={{ color: 'var(--color-medium)', fontSize: 12 }}>{split.isSettled ? 'Settled' : `${formatMoney(split.settledAmount)} settled`}</span>
                  </div>
                  <span style={{ fontWeight: 700 }}>{formatMoney(split.owedAmount)}</span>
                </div>
              ))}
            </div>
          </section>
          {error && <p role="alert" style={{ color: 'var(--color-red)', fontSize: 13 }}>{error}</p>}
          {expense.canDelete && <DangerButton fullWidth onClick={() => setConfirmDelete(true)}>Delete Expense</DangerButton>}
          {!expense.canDelete && <p style={{ color: 'var(--color-medium)', fontSize: 13, textAlign: 'center' }}>Settled shares or a pending settlement protect this expense from deletion.</p>}
        </div>
      </PageShell>
      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete group expense?"
        message="This removes every split and its linked personal transaction."
        confirmLabel="Delete Expense"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={deleteExpense.isPending}
      />
    </>
  );
}
