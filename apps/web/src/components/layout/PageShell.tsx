'use client';
import { ReactNode } from 'react';

interface PageShellProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
  noBottomPad?: boolean;
}

export function PageShell({ children, className = '', noPadding = false, noBottomPad = false }: PageShellProps) {
  return (
    <main
      className={`page-enter ${!noBottomPad ? 'pb-nav' : ''} ${className}`}
      style={{
        padding: noPadding ? 0 : '0 16px',
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {children}
    </main>
  );
}
