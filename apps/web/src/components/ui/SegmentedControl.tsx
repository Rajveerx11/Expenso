'use client';

interface Option {
  value: string;
  label: string;
  icon?: string;
}

interface SegmentedControlProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  'aria-labelledby'?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  role?: string;
}

export function SegmentedControl({ options, value, onChange, ...groupProps }: SegmentedControlProps) {
  return (
    <div className="tab-bar" role="group" {...groupProps}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`tab-item ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
        >
          {opt.icon && <span style={{ marginRight: '4px' }}>{opt.icon}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
