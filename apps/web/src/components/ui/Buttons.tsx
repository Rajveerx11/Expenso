'use client';
import { forwardRef, ReactNode, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PrimaryButton({ children, size = 'md', fullWidth = false, loading = false, icon, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={cn('btn btn-primary', size === 'sm' && 'btn-sm', size === 'lg' && 'btn-lg', fullWidth && 'w-full', className)}
      style={{ width: fullWidth ? '100%' : undefined }}
      {...props}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export const SecondaryButton = forwardRef<HTMLButtonElement, ButtonProps>(function SecondaryButton({ children, size = 'md', fullWidth = false, loading = false, icon, className = '', ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn('btn btn-secondary', size === 'sm' && 'btn-sm', size === 'lg' && 'btn-lg', fullWidth && 'w-full', className)}
      style={{ width: fullWidth ? '100%' : undefined }}
      {...props}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

export function DangerButton({ children, size = 'md', fullWidth = false, loading = false, icon, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={cn('btn btn-danger', size === 'sm' && 'btn-sm', size === 'lg' && 'btn-lg', fullWidth && 'w-full', className)}
      style={{ width: fullWidth ? '100%' : undefined }}
      {...props}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function OutlineButton({ children, size = 'md', fullWidth = false, loading = false, icon, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={cn('btn btn-outline', size === 'sm' && 'btn-sm', size === 'lg' && 'btn-lg', fullWidth && 'w-full', className)}
      style={{ width: fullWidth ? '100%' : undefined }}
      {...props}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ children, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={cn('btn btn-ghost btn-icon', className)}
      {...props}
    >
      {children}
    </button>
  );
}
