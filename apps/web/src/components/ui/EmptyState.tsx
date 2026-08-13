'use client';
import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: '56px', lineHeight: 1 }}>{icon}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-black)' }}>{title}</h3>
        {description && <p style={{ fontSize: '14px', color: 'var(--color-medium)', lineHeight: 1.5, maxWidth: '280px' }}>{description}</p>}
      </div>
      {action && action}
    </div>
  );
}
