'use client';
import { useEffect } from 'react';
import { DangerButton, SecondaryButton } from './Buttons';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  danger?: boolean;
}

export function ConfirmDialog({
  isOpen, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  onConfirm, onCancel, loading = false, danger = true
}: ConfirmDialogProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="overlay animate-fadeIn" onClick={onCancel}>
      <div className="dialog animate-slideUp" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-black)', marginBottom: '8px' }}>{title}</h2>
        <p style={{ fontSize: '14px', color: 'var(--color-medium)', lineHeight: 1.6, marginBottom: '24px' }}>{message}</p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <SecondaryButton onClick={onCancel} fullWidth disabled={loading}>{cancelLabel}</SecondaryButton>
          {danger
            ? <DangerButton onClick={onConfirm} fullWidth loading={loading}>{confirmLabel}</DangerButton>
            : <button className="btn btn-primary" onClick={onConfirm} disabled={loading} style={{ flex: 1 }}>{confirmLabel}</button>
          }
        </div>
      </div>
    </div>
  );
}
