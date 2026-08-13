'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { FormField, Input, Textarea } from '@/components/ui/FormField';
import { CategoryPicker } from '@/components/ui/CategoryPicker';
import { PrimaryButton } from '@/components/ui/Buttons';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { todayISO } from '@/lib/utils';

function AddTransactionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = (searchParams.get('type') as 'income' | 'expense') || 'expense';

  const [type, setType] = useState<'income' | 'expense'>(initialType);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Other');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // TODO: POST /api/v1/expenses
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    setSuccess(true);
  }

  return (
    <>
      <AppHeader title={type === 'income' ? 'Add Income' : 'Add Expense'} showBack />
      <PageShell>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '16px', paddingBottom: '32px' }}>
          {/* Type Toggle */}
          <SegmentedControl
            value={type}
            onChange={v => { setType(v as 'income' | 'expense'); setCategory('Other'); }}
            options={[
              { value: 'expense', label: '💸 Expense' },
              { value: 'income', label: '💰 Income' },
            ]}
          />

          {/* Amount */}
          <FormField label="Amount" required>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '20px', fontWeight: 700, color: type === 'income' ? 'var(--color-green)' : 'var(--color-red)' }}>₹</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="input"
                inputMode="decimal"
                style={{ paddingLeft: '36px', fontSize: '24px', fontWeight: 700, color: type === 'income' ? 'var(--color-green)' : 'var(--color-red)' }}
                required
              />
            </div>
          </FormField>

          {/* Title */}
          <FormField label="Title" required>
            <Input
              type="text"
              placeholder={type === 'income' ? 'e.g. Monthly Salary' : 'e.g. Coffee, Rent...'}
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={120}
              required
            />
          </FormField>

          {/* Category */}
          <FormField label="Category">
            <CategoryPicker
              selected={category}
              onChange={setCategory}
              expenseOnly={type === 'expense'}
            />
          </FormField>

          {/* Date */}
          <FormField label="Date">
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              max={todayISO()}
            />
          </FormField>

          {/* Note */}
          <FormField label="Note">
            <Textarea
              placeholder="Optional note..."
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={500}
            />
          </FormField>

          <PrimaryButton type="submit" fullWidth size="lg" loading={loading}>
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
