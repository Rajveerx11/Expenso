'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { MonthYearPicker } from '@/components/ui/MonthYearPicker';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ExpenseCard } from '@/components/ui/ExpenseCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { MOCK_TRANSACTIONS, MOCK_ANALYTICS } from '@/lib/mockData';
import { formatMoney, currentMonth } from '@/lib/utils';

export default function ExpensesPage() {
  const [month, setMonth] = useState(currentMonth());
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    return MOCK_TRANSACTIONS.filter(tx => {
      const matchesMonth = tx.expenseDate.startsWith(month);
      const matchesType = filter === 'all' || tx.type === filter;
      return matchesMonth && matchesType;
    });
  }, [month, filter]);

  const income = MOCK_ANALYTICS.monthlyIncome;
  const expenses = MOCK_ANALYTICS.monthlyExpenses;
  const net = MOCK_ANALYTICS.monthlyNet;

  return (
    <>
      <AppHeader
        title="Transactions"
        rightAction={
          <Link href="/expenses/new">
            <button className="btn btn-primary btn-sm" style={{ gap: '4px' }}>
              <Plus size={16} /> Add
            </button>
          </Link>
        }
      />
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>

          {/* Month Picker */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <MonthYearPicker value={month} onChange={setMonth} />
          </div>

          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {[
              { label: 'Income', value: income, color: 'var(--color-green)', bg: 'var(--color-green-soft)' },
              { label: 'Spent', value: expenses, color: 'var(--color-red)', bg: 'var(--color-red-soft)' },
              { label: 'Net', value: net, color: 'var(--color-primary-deep)', bg: 'var(--color-primary-lightest)' },
            ].map(item => (
              <div key={item.label} className="card" style={{ padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-medium)', fontWeight: 500, marginBottom: '4px' }}>{item.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: item.color }}>{formatMoney(item.value, true)}</div>
              </div>
            ))}
          </div>

          {/* Filter */}
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'income', label: '💰 Income' },
              { value: 'expense', label: '💸 Expense' },
            ]}
          />

          {/* Category Breakdown */}
          <div className="card" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-dark)', marginBottom: '12px' }}>By Category</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {MOCK_ANALYTICS.categoryBreakdown.map(cat => (
                <div key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--color-dark)', minWidth: '80px' }}>{cat.category}</span>
                  <div style={{ flex: 1, height: '6px', background: 'var(--color-light)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${cat.percentage}%`, background: 'linear-gradient(90deg, var(--color-primary-deep), var(--color-primary-soft))', borderRadius: '3px', transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-dark)', minWidth: '64px', textAlign: 'right' }}>{formatMoney(cat.amount, true)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Transaction List */}
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: 'var(--color-black)' }}>Transactions</h2>
            {filtered.length === 0
              ? <EmptyState icon="🧾" title="No transactions" description="Add your first transaction to start tracking" />
              : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filtered.map(tx => <ExpenseCard key={tx.id} transaction={tx} />)}
                </div>
            }
          </div>
        </div>
      </PageShell>
    </>
  );
}
