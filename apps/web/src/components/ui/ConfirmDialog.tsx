'use client';
import { useEffect, useRef } from 'react';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const loadingRef = useRef(loading);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    loadingRef.current = loading;
    onCancelRef.current = onCancel;
  }, [loading, onCancel]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loadingRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && loading) dialogRef.current?.focus();
  }, [isOpen, loading]);

  if (!isOpen) return null;

  return (
    <div className="overlay animate-fadeIn" onClick={() => { if (!loading) onCancel(); }}>
      <div ref={dialogRef} className="dialog animate-slideUp" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description" tabIndex={-1}>
        <h2 id="dialog-title" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-black)', marginBottom: '8px' }}>{title}</h2>
        <p id="dialog-description" style={{ fontSize: '14px', color: 'var(--color-medium)', lineHeight: 1.6, marginBottom: '24px' }}>{message}</p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <SecondaryButton ref={cancelRef} onClick={onCancel} fullWidth disabled={loading}>{cancelLabel}</SecondaryButton>
          {danger
            ? <DangerButton onClick={onConfirm} fullWidth loading={loading}>{confirmLabel}</DangerButton>
            : <button className="btn btn-primary" onClick={onConfirm} disabled={loading} style={{ flex: 1 }}>{confirmLabel}</button>
          }
        </div>
      </div>
    </div>
  );
}
