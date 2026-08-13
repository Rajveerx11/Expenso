'use client';
import { formatMoney, moneySign } from '@/lib/utils';

interface MoneyTextProps {
  amount: string | number;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showSign?: boolean;
  colored?: boolean;
  compact?: boolean;
  className?: string;
}

const fontSizes: Record<string, string> = {
  sm: '13px',
  md: '15px',
  lg: '18px',
  xl: '22px',
  '2xl': '28px',
};

export function MoneyText({ amount, size = 'md', showSign = false, colored = true, compact = false, className = '' }: MoneyTextProps) {
  const sign = moneySign(amount);
  const formatted = formatMoney(amount, compact);
  const prefix = showSign && sign === 'positive' ? '+' : '';

  const colorClass = colored
    ? sign === 'positive' ? 'money-positive'
    : sign === 'negative' ? 'money-negative'
    : 'money-neutral'
    : '';

  return (
    <span
      className={`${colorClass} ${className}`}
      style={{ fontSize: fontSizes[size], fontWeight: 600, fontFamily: 'var(--font-sans)', lineHeight: 1.2 }}
      aria-label={`${prefix}${formatted}`}
    >
      {prefix}{formatted}
    </span>
  );
}
