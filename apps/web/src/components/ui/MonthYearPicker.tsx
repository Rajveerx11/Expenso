'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMonthLabel, prevMonth, nextMonth, currentMonth } from '@/lib/utils';

interface MonthYearPickerProps {
  value: string;
  onChange: (month: string) => void;
}

export function MonthYearPicker({ value, onChange }: MonthYearPickerProps) {
  const isCurrentMonth = value === currentMonth();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-light)', borderRadius: 'var(--radius-full)', padding: '4px' }}>
      <button
        type="button"
        onClick={() => onChange(prevMonth(value))}
        className="btn btn-ghost"
        style={{ padding: 0, width: 44, height: 44, minHeight: 44, borderRadius: 'var(--radius-full)' }}
        aria-label="Previous month"
      >
        <ChevronLeft size={16} />
      </button>
      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-black)', minWidth: '130px', textAlign: 'center' }}>
        {formatMonthLabel(value)}
      </span>
      <button
        type="button"
        onClick={() => !isCurrentMonth && onChange(nextMonth(value))}
        className="btn btn-ghost"
        style={{ padding: 0, width: 44, height: 44, minHeight: 44, borderRadius: 'var(--radius-full)', opacity: isCurrentMonth ? 0.3 : 1 }}
        disabled={isCurrentMonth}
        aria-label="Next month"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
