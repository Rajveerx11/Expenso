'use client';
import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { FormField, Input, Textarea } from '@/components/ui/FormField';
import { CategoryPicker } from '@/components/ui/CategoryPicker';
import { PrimaryButton } from '@/components/ui/Buttons';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import {
  api,
  createIdempotencyKey,
  fieldErrorFor,
  fieldErrorsFor,
  focusFirstInvalidField,
  messageForError,
  type ApiFieldErrors,
} from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { todayISO } from '@/lib/utils';
import { createSubmissionKeyManager } from '@/features/idempotency/submission-key';
import { buildPersonalExpenseInput } from '@/features/personal-expenses/domain';

function AddTransactionForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const initialType = (searchParams.get('type') as 'income' | 'expense') || 'expense';

  const [type, setType] = useState<'income' | 'expense'>(initialType);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Other');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const keyManager = useRef(createSubmissionKeyManager(() => createIdempotencyKey('personal')));
  const createTransaction = useMutation({
    mutationFn: (variables: { input: ReturnType<typeof buildPersonalExpenseInput>; idempotencyKey: string }) => (
      api.personal.create(variables.input, variables.idempotencyKey)
    ),
    retry: false,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    try {
      const input = buildPersonalExpenseInput({ type, amount, title, category, expenseDate: date, note });
      await createTransaction.mutateAsync({
        input,
        idempotencyKey: keyManager.current.forSubmission(input),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['personal-expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['personal-analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
      ]);
      setSuccess(true);
    } catch (requestError) {
      setError(messageForError(requestError));
      setFieldErrors(fieldErrorsFor(requestError));
      focusFirstInvalidField(formRef.current);
    }
  }

  function clearFieldError(...keys: string[]) {
    setFieldErrors((current) => {
      const next = { ...current };
      keys.forEach((key) => delete next[key]);
      return next;
    });
  }

  const typeError = fieldErrorFor(fieldErrors, 'type');
  const amountError = fieldErrorFor(fieldErrors, 'amount');
  const titleError = fieldErrorFor(fieldErrors, 'title');
  const categoryError = fieldErrorFor(fieldErrors, 'category');
  const dateError = fieldErrorFor(fieldErrors, 'expenseDate', 'date');
  const noteError = fieldErrorFor(fieldErrors, 'note');

  return (
    <>
      <AppHeader title={type === 'income' ? 'Add Income' : 'Add Expense'} showBack />
      <PageShell>
        <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '16px', paddingBottom: '32px' }}>
          {/* Type Toggle */}
          <FormField label="Transaction Type" error={typeError}>
          <div role="group" data-invalid={Boolean(typeError)}>
          <SegmentedControl
            aria-label="Transaction type"
            value={type}
            onChange={v => { setType(v as 'income' | 'expense'); setCategory('Other'); clearFieldError('type', 'category'); }}
            options={[
              { value: 'expense', label: '💸 Expense' },
              { value: 'income', label: '💰 Income' },
            ]}
          />
          </div>
          </FormField>

          {/* Amount */}
          <FormField label="Amount" htmlFor="personal-expense-amount" messageId="personal-expense-amount" error={amountError} required>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '20px', fontWeight: 700, color: type === 'income' ? 'var(--color-green)' : 'var(--color-red)' }}>₹</span>
              <input
                id="personal-expense-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={e => { setAmount(e.target.value); clearFieldError('amount'); }}
                className={`input ${amountError ? 'input-error' : ''}`}
                inputMode="decimal"
                aria-invalid={Boolean(amountError)}
                aria-describedby={amountError ? 'personal-expense-amount-error' : undefined}
                style={{ paddingLeft: '36px', fontSize: '24px', fontWeight: 700, color: type === 'income' ? 'var(--color-green)' : 'var(--color-red)' }}
                required
              />
            </div>
          </FormField>

          {/* Title */}
          <FormField label="Title" error={titleError} required>
            <Input
              type="text"
              placeholder={type === 'income' ? 'e.g. Monthly Salary' : 'e.g. Coffee, Rent...'}
              value={title}
              onChange={e => { setTitle(e.target.value); clearFieldError('title'); }}
              error={Boolean(titleError)}
              maxLength={120}
              required
            />
          </FormField>

          {/* Category */}
          <FormField label="Category" error={categoryError}>
            <div role="group" data-invalid={Boolean(categoryError)}>
              <CategoryPicker
                selected={category}
                onChange={(value) => { setCategory(value); clearFieldError('category'); }}
                expenseOnly={type === 'expense'}
              />
            </div>
          </FormField>

          {/* Date */}
          <FormField label="Date" error={dateError}>
            <Input
              type="date"
              value={date}
              onChange={e => { setDate(e.target.value); clearFieldError('expenseDate', 'date'); }}
              error={Boolean(dateError)}
              max={todayISO()}
            />
          </FormField>

          {/* Note */}
          <FormField label="Note" error={noteError}>
            <Textarea
              placeholder="Optional note..."
              value={note}
              onChange={e => { setNote(e.target.value); clearFieldError('note'); }}
              error={Boolean(noteError)}
              maxLength={500}
            />
          </FormField>

          {error && <p role="alert" style={{ color: 'var(--color-red)', fontSize: 13 }}>{error}</p>}

          <PrimaryButton type="submit" fullWidth size="lg" loading={createTransaction.isPending}>
            {type === 'income' ? 'Add Income' : 'Add Expense'}
          </PrimaryButton>
        </form>
      </PageShell>

      <SuccessOverlay show={success} message={type === 'income' ? 'Income added!' : 'Expense added!'} onComplete={() => router.back()} />
    </>
  );
}

export default function AddTransactionPage() {
  return <Suspense fallback={null}><AddTransactionForm /></Suspense>;
}
