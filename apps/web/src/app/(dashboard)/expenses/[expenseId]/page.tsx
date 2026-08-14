'use client';

import { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';
import { CategoryPicker } from '@/components/ui/CategoryPicker';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField, Input, Textarea } from '@/components/ui/FormField';
import { BackgroundRefreshError, PageError, PageLoading, queryErrorPresentation } from '@/components/ui/AsyncState';
import { api, fieldErrorFor, fieldErrorsFor, focusFirstInvalidField, messageForError, type ApiFieldErrors, type PersonalTransactionInput } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import type { PersonalTransaction } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';

export default function PersonalExpenseDetailPage() {
  const params = useParams<{ expenseId: string }>();
  const expenseId = params.expenseId;
  const expenseQuery = useQuery({
    queryKey: queryKeys.personalDetail(expenseId),
    queryFn: () => api.personal.get(expenseId),
    enabled: Boolean(expenseId),
  });
  const errorPresentation = queryErrorPresentation(expenseQuery.error, expenseQuery.data !== undefined);

  if (expenseQuery.isPending) return <><AppHeader title="Transaction" showBack /><PageLoading label="Loading transaction" /></>;
  if (errorPresentation === 'blocking') return <><AppHeader title="Transaction" showBack /><PageError message={messageForError(expenseQuery.error)} retry={() => expenseQuery.refetch()} /></>;

  return (
    <TransactionDetail
      key={expenseQuery.data!.updatedAt}
      transaction={expenseQuery.data!}
      refreshWarning={errorPresentation === 'background'}
      retry={() => void expenseQuery.refetch()}
      isRetrying={expenseQuery.isFetching}
    />
  );
}

function TransactionDetail({
  transaction,
  refreshWarning,
  retry,
  isRetrying,
}: {
  transaction: PersonalTransaction;
  refreshWarning: boolean;
  retry: () => void;
  isRetrying: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [type, setType] = useState(transaction.type);
  const [amount, setAmount] = useState(transaction.amount);
  const [title, setTitle] = useState(transaction.title);
  const [category, setCategory] = useState(transaction.category);
  const [expenseDate, setExpenseDate] = useState(transaction.expenseDate);
  const [note, setNote] = useState(transaction.note ?? '');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const updateTransaction = useMutation({
    mutationFn: (patch: Partial<PersonalTransactionInput>) => api.personal.update(transaction.id, patch),
    retry: false,
  });
  const deleteTransaction = useMutation({
    mutationFn: () => api.personal.remove(transaction.id),
    retry: false,
  });

  async function invalidateTransactionData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['personal-expenses'] }),
      queryClient.invalidateQueries({ queryKey: ['personal-analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
    ]);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    try {
      const updated = await updateTransaction.mutateAsync({
        type, amount, title, category, expenseDate, note: note.trim() || null,
      });
      queryClient.setQueryData(queryKeys.personalDetail(transaction.id), updated);
      await invalidateTransactionData();
      setEditing(false);
    } catch (requestError) {
      setError(messageForError(requestError));
      setFieldErrors(fieldErrorsFor(requestError));
      focusFirstInvalidField(formRef.current);
    }
  }

  async function handleDelete() {
    setError('');
    setFieldErrors({});
    try {
      await deleteTransaction.mutateAsync();
      queryClient.removeQueries({ queryKey: queryKeys.personalDetail(transaction.id) });
      await invalidateTransactionData();
      router.replace('/expenses');
    } catch (requestError) {
      setConfirmDelete(false);
      setError(messageForError(requestError));
    }
  }

  const typeError = fieldErrorFor(fieldErrors, 'type');
  const amountError = fieldErrorFor(fieldErrors, 'amount');
  const titleError = fieldErrorFor(fieldErrors, 'title');
  const categoryError = fieldErrorFor(fieldErrors, 'category');
  const dateError = fieldErrorFor(fieldErrors, 'expenseDate', 'date');
  const noteError = fieldErrorFor(fieldErrors, 'note');

  return (
    <>
      <AppHeader title="Transaction" showBack />
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 16, paddingBottom: 32 }}>
          {refreshWarning && <BackgroundRefreshError retry={retry} isRetrying={isRetrying} />}
          {!editing ? (
            <>
              <section className="card" style={{ padding: 20 }} aria-labelledby="transaction-title">
                <span className={transaction.type === 'income' ? 'chip chip-green' : 'chip chip-red'}>
                  {transaction.type === 'income' ? 'Income' : 'Expense'}
                </span>
                <h1 id="transaction-title" style={{ fontSize: 22, margin: '14px 0 6px', color: 'var(--color-black)' }}>{transaction.title}</h1>
                <div style={{ fontSize: 28, fontWeight: 800, color: transaction.type === 'income' ? 'var(--color-green)' : 'var(--color-red)' }}>
                  {transaction.type === 'income' ? '+' : '-'}{formatMoney(transaction.amount)}
                </div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 18px', marginTop: 20, fontSize: 14 }}>
                  <dt style={{ color: 'var(--color-medium)' }}>Category</dt><dd>{transaction.category}</dd>
                  <dt style={{ color: 'var(--color-medium)' }}>Date</dt><dd>{formatDate(transaction.expenseDate)}</dd>
                  <dt style={{ color: 'var(--color-medium)' }}>Note</dt><dd>{transaction.note || 'None'}</dd>
                </dl>
              </section>
              {transaction.sourceGroupExpenseId && (
                <p className="card" style={{ padding: 14, fontSize: 13, color: 'var(--color-medium)' }}>
                  Group-linked transaction. Manage it from its group expense.
                </p>
              )}
              {error && <p role="alert" style={{ color: 'var(--color-red)', fontSize: 13 }}>{error}</p>}
              {transaction.editable && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <SecondaryButton onClick={() => setEditing(true)}>Edit</SecondaryButton>
                  <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>
                </div>
              )}
            </>
          ) : (
            <form ref={formRef} onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <FormField label="Type" error={typeError} required>
                <div role="group" aria-invalid={Boolean(typeError)} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['expense', 'income'] as const).map((value) => (
                    <button key={value} type="button" className={type === value ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => { setType(value); setFieldErrors((current) => ({ ...current, type: [] })); }} aria-pressed={type === value}>
                      {value === 'income' ? 'Income' : 'Expense'}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="Amount" error={amountError} required><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setFieldErrors((current) => ({ ...current, amount: [] })); }} error={Boolean(amountError)} required /></FormField>
              <FormField label="Title" error={titleError} required><Input value={title} onChange={(event) => { setTitle(event.target.value); setFieldErrors((current) => ({ ...current, title: [] })); }} error={Boolean(titleError)} maxLength={120} required /></FormField>
              <FormField label="Category" error={categoryError}><div role="group" aria-invalid={Boolean(categoryError)}><CategoryPicker selected={category} onChange={(value) => { setCategory(value); setFieldErrors((current) => ({ ...current, category: [] })); }} expenseOnly={type === 'expense'} /></div></FormField>
              <FormField label="Date" error={dateError} required><Input type="date" value={expenseDate} onChange={(event) => { setExpenseDate(event.target.value); setFieldErrors((current) => ({ ...current, expenseDate: [], date: [] })); }} error={Boolean(dateError)} required /></FormField>
              <FormField label="Note" error={noteError}><Textarea value={note} onChange={(event) => { setNote(event.target.value); setFieldErrors((current) => ({ ...current, note: [] })); }} error={Boolean(noteError)} maxLength={500} /></FormField>
              {error && <p role="alert" style={{ color: 'var(--color-red)', fontSize: 13 }}>{error}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <SecondaryButton type="button" onClick={() => setEditing(false)} disabled={updateTransaction.isPending}>Cancel</SecondaryButton>
                <PrimaryButton type="submit" loading={updateTransaction.isPending}>Save</PrimaryButton>
              </div>
            </form>
          )}
        </div>
      </PageShell>
      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete transaction?"
        message="This permanently removes this transaction and updates your totals."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={deleteTransaction.isPending}
      />
    </>
  );
}
