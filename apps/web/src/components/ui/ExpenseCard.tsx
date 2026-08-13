'use client';
import { getCategoryInfo } from '@/lib/types';
import { formatMoney, formatDateShort } from '@/lib/utils';
import type { PersonalTransaction } from '@/lib/types';

interface ExpenseCardProps {
  transaction: PersonalTransaction;
  onClick?: () => void;
}

export function ExpenseCard({ transaction, onClick }: ExpenseCardProps) {
  const cat = getCategoryInfo(transaction.category);
  const isIncome = transaction.type === 'income';
  const isLinked = !!transaction.sourceGroupExpenseId;

  return (
    <div
      className="card card-hover"
      style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: onClick ? 'pointer' : undefined }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Category icon */}
      <div style={{
        width: 44, height: 44, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${cat.color}18`, flexShrink: 0, fontSize: '20px',
      }}>
        {cat.emoji}
      </div>

      {/* Info */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {transaction.title}
          </span>
          {isLinked && (
            <span className="chip chip-primary" style={{ fontSize: '10px', padding: '2px 7px', flexShrink: 0 }}>Group</span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-medium)', marginTop: '2px' }}>
          {cat.label} • {formatDateShort(transaction.expenseDate)}
        </div>
      </div>

      {/* Amount */}
      <div style={{ fontSize: '15px', fontWeight: 700, color: isIncome ? 'var(--color-green)' : 'var(--color-red)', flexShrink: 0 }}>
        {isIncome ? '+' : '-'}{formatMoney(transaction.amount)}
      </div>
    </div>
  );
}
