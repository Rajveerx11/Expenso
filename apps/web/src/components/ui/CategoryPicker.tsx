'use client';
import { CATEGORIES } from '@/lib/types';
import { cn } from '@/lib/utils';

interface CategoryPickerProps {
  selected: string;
  onChange: (category: string) => void;
  expenseOnly?: boolean;
}

export function CategoryPicker({ selected, onChange, expenseOnly = false }: CategoryPickerProps) {
  const categories = expenseOnly
    ? CATEGORIES.filter(c => !['Salary', 'Freelance'].includes(c.id))
    : CATEGORIES;

  return (
    <div className="category-grid">
      {categories.map(cat => {
        const isSelected = selected === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onChange(cat.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              padding: '10px 4px', borderRadius: '12px', border: 'none', cursor: 'pointer',
              background: isSelected ? 'var(--color-primary-lightest)' : 'var(--color-light)',
              transition: 'all 0.1s ease',
              outline: isSelected ? '2px solid var(--color-primary-medium)' : 'none',
              outlineOffset: '1px',
            }}
            aria-pressed={isSelected}
            aria-label={cat.label}
          >
            <span style={{ fontSize: '22px', lineHeight: 1 }}>{cat.emoji}</span>
            <span style={{
              fontSize: '10px', fontWeight: isSelected ? 600 : 400,
              color: isSelected ? 'var(--color-primary-deep)' : 'var(--color-dark)',
              lineHeight: 1.2, textAlign: 'center',
            }}>
              {cat.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
