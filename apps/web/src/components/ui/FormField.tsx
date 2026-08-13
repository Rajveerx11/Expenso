'use client';
import { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function FormField({ label, error, hint, required, children }: FormFieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-dark)', lineHeight: 1 }}>
        {label}{required && <span style={{ color: 'var(--color-red)', marginLeft: '3px' }}>*</span>}
      </label>
      {children}
      {error && <span style={{ fontSize: '12px', color: 'var(--color-red)', fontWeight: 500 }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: '12px', color: 'var(--color-medium)' }}>{hint}</span>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  icon?: ReactNode;
  rightElement?: ReactNode;
}

export function Input({ error, icon, rightElement, className = '', ...props }: InputProps) {
  if (icon || rightElement) {
    return (
      <div style={{ position: 'relative' }}>
        {icon && (
          <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-medium)', pointerEvents: 'none', display: 'flex' }}>
            {icon}
          </div>
        )}
        <input
          className={cn('input', error && 'input-error', className)}
          style={{ paddingLeft: icon ? '44px' : undefined, paddingRight: rightElement ? '44px' : undefined }}
          {...props}
        />
        {rightElement && (
          <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
            {rightElement}
          </div>
        )}
      </div>
    );
  }
  return (
    <input
      className={cn('input', error && 'input-error', className)}
      {...props}
    />
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function Textarea({ error, className = '', ...props }: TextareaProps) {
  return (
    <textarea
      className={cn('input', error && 'input-error', className)}
      style={{ minHeight: '80px', resize: 'vertical', lineHeight: 1.5 }}
      {...props}
    />
  );
}
