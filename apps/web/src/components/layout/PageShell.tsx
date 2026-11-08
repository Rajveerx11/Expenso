'use client';
import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { shouldShowMobileBottomNav } from './mobile-navigation';

interface PageShellProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
  noBottomPad?: boolean;
}

export function PageShell({ children, className = '', noPadding = false, noBottomPad = false }: PageShellProps) {
  const pathname = usePathname();
  const reserveMobileNavSpace = !noBottomPad && shouldShowMobileBottomNav(pathname);
  return (
    <div
      className={`page-enter ${reserveMobileNavSpace ? 'pb-nav' : ''} ${className}`}
      style={{
        paddingTop: 0,
        paddingLeft: noPadding ? 0 : 16,
        paddingRight: noPadding ? 0 : 16,
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {children}
    </div>
  );
}
