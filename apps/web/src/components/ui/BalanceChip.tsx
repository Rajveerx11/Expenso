'use client';
import { formatMoney, moneySign } from '@/lib/utils';

interface BalanceChipProps {
  balance: string;
  size?: 'sm' | 'md';
}

export function BalanceChip({ balance, size = 'md' }: BalanceChipProps) {
  const sign = moneySign(balance);
  const amount = formatMoney(balance);

  const chipClass = sign === 'positive' ? 'chip chip-positive'
    : sign === 'negative' ? 'chip chip-negative'
    : 'chip chip-neutral';

  const label = sign === 'positive' ? `Owed ${amount}`
    : sign === 'negative' ? `Owes ${amount}`
    : 'Settled';

  const symbol = sign === 'positive' ? '+' : sign === 'negative' ? '-' : '';

  return (
    <span className={chipClass} style={{ fontSize: size === 'sm' ? '11px' : '12px' }}>
      {sign !== 'zero' && <span>{symbol}</span>}
      {sign !== 'zero' ? amount : 'Settled up'}
    </span>
  );
}
