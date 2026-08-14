'use client';

import { AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';
import { PageSkeleton } from '@/components/ui/LoadingSkeleton';

export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return <div role="status" aria-live="polite" aria-label={label}><PageSkeleton /></div>;
}

export function PageError({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div role="alert" style={{ padding: '48px 24px', textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 14 }}>
      <div style={{ width: 48, height: 48, borderRadius: 16, background: 'var(--color-red-light)', color: 'var(--color-red)', display: 'grid', placeItems: 'center' }}>
        <AlertCircle size={24} aria-hidden="true" />
      </div>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-black)' }}>Couldn&apos;t load this page</h2>
        <p style={{ marginTop: 6, maxWidth: 360, color: 'var(--color-medium)', fontSize: 14 }}>{message}</p>
      </div>
      {retry && <PrimaryButton type="button" icon={<RefreshCw size={16} />} onClick={retry}>Try again</PrimaryButton>}
    </div>
  );
}

export function queryErrorPresentation(error: unknown, hasUsableData: boolean): 'none' | 'blocking' | 'background' {
  if (!error) return 'none';
  return hasUsableData ? 'background' : 'blocking';
}

export function BackgroundRefreshError({
  message = 'Couldn\'t refresh the latest data. Showing the last loaded version.',
  retry,
  isRetrying = false,
}: {
  message?: string;
  retry: () => void;
  isRetrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="card"
      style={{
        padding: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderColor: 'var(--color-amber)',
        background: 'var(--color-amber-soft)',
      }}
    >
      <AlertTriangle size={18} aria-hidden="true" style={{ color: 'var(--color-amber)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', color: 'var(--color-dark)', fontSize: 13 }}>Showing saved data</strong>
        <span style={{ display: 'block', marginTop: 2, color: 'var(--color-medium)', fontSize: 12, lineHeight: 1.4 }}>{message}</span>
      </div>
      <SecondaryButton type="button" size="sm" loading={isRetrying} onClick={retry}>Retry</SecondaryButton>
    </div>
  );
}
